/**
 * The Creator path (ADR 0043, ADR 0044; briefs B185 and B191), in a blank project:
 *
 * 1. Gear set: toolbar "Create…", the flow "Gear set", `material_name` "Sapphire"; the Items tab
 *    lists the item previews and the Armour tab renders (SwiftShader WebGL, as `entities-path`);
 *    untick the hoe; "Create" adds the pieces in one undo step ("Create Gear set") with no
 *    errors. The sword's Raw JSON sets `attack_damage` to 9; "Edit in Creator" on the helmet
 *    changes the colour, the Elements tab lists the sword under "Kept your edits", and "Create"
 *    ("Update Gear set") keeps the sword's 9 while the helmet's texture bytes change (read from
 *    the project folder). The Fabric mod jar holds `msm/sapphire/item/sapphire_helmet.json` and
 *    `assets/sapphire/equipment/sapphire_armor.json`. Undo restores the blank project: the first
 *    Undo ("Update Gear set") puts back the old texture bytes (ADR 0045), the second the sword's
 *    hand edit, the third ("Create Gear set") removes the set and its textures.
 * 2. Painting and Weapon: the Painting flow opens on the Card tab, "Choose picture…" takes a PNG
 *    through `MSM_E2E_PICK_FILES`, "Create" writes it unchanged into the project; the Weapon flow
 *    as a bow shows its Stats; both export in the Fabric mod jar and packs with no errors.
 * 3. Status effect and Throwable (ADRs 0055, 0056): the Status effect flow, listed under
 *    "Magic", opens on the Card tab with the icon, the name and the level table, and makes a
 *    drink; the Throwable flow's Card tab shows the item picture and the throw sketch. "Edit in
 *    Creator" on the effect changes one answer (good to bad), and the Fabric mod jar holds the
 *    effect definition, its icon and the throwable item definition.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp, outputDir } from './fixtures';
import { oggVorbis } from './ogg';
import { gradientPng } from './png';

/** The project folder name; a blank project's namespace is derived from it. */
const NAMESPACE = 'sapphire';
const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] as const;
const PIECES = [
  'sword',
  'pickaxe',
  'axe',
  'shovel',
  'hoe',
  'helmet',
  'chestplate',
  'leggings',
  'boots',
];
const id = (path: string) => `${NAMESPACE}:${path}`;

let base: string | undefined;
const launches: LaunchedApp[] = [];

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

function readZip(path: string): Record<string, Uint8Array> {
  return unzipSync(new Uint8Array(readFileSync(path)));
}

function isCompleteZip(path: string): boolean {
  try {
    readZip(path);
    return true;
  } catch {
    return false;
  }
}

/** Waits for one new complete file with `extension` in `dir` beyond `known`, and reads it. */
async function newZip(
  dir: string,
  extension: string,
  known: readonly string[] = [],
): Promise<{ name: string; files: Record<string, Uint8Array> }> {
  let name = '';
  await expect
    .poll(
      () => {
        name =
          readdirSync(dir)
            .filter((entry) => entry.endsWith(extension))
            .find((entry) => !known.includes(entry)) ?? '';
        return name !== '' && isCompleteZip(join(dir, name));
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return { name, files: readZip(join(dir, name)) };
}

async function openPalette(window: Page, query: string): Promise<Locator> {
  await window.keyboard.press('ControlOrMeta+Shift+P');
  const palette = window.getByTestId('command-palette');
  await expect(palette).toBeVisible();
  await palette.getByTestId('command-palette-input').fill(query);
  return palette;
}

async function expectNoErrors(window: Page): Promise<void> {
  await window.getByTestId('dock-tab-problems').click();
  const problems = window.getByTestId('problems-panel');
  await expect(problems).toBeVisible();
  await expect(problems.locator('[data-testid="problem-row"][data-severity="error"]')).toHaveCount(
    0,
  );
  await expect(window.locator('footer').getByText(/^0 error\(s\)/)).toBeVisible();
}

/**
 * Exports the Fabric mod jar through the palette and reads it. The runtime and GeckoLib stay
 * separate: CI's `ci` job builds no runtime jar to nest.
 */
async function exportJar(window: Page, outDir: string, known: readonly string[] = []) {
  const palette = await openPalette(window, 'fabric mod jar');
  await palette.getByTestId('command-exportFabricJar').click();
  await expect(palette).toBeHidden();
  const dialog = window.getByTestId('fabric-jar-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('exporter-option-separateRuntime').check();
  await dialog.getByTestId('fabric-jar-dialog-submit').click();
  await expect(dialog).toBeHidden();
  return newZip(outDir, '.jar', known);
}

/** Opens the Creator from the toolbar and picks `flowId`. */
async function openFlow(window: Page, flowId: string): Promise<Locator> {
  await window.getByTestId('toolbar-creator').click();
  const dialog = window.getByTestId('creator-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId(`creator-flow-${flowId}`).click();
  return dialog;
}

/** Picks `flowId` from the Creator group `groupTestId` of an open Creator dialog. */
async function openFlowFrom(dialog: Locator, groupTestId: string, flowId: string) {
  await dialog.getByTestId(groupTestId).getByTestId(`creator-flow-${flowId}`).click();
  return dialog;
}

async function save(window: Page): Promise<void> {
  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
}

/** The `data` of a saved element file in the project folder. */
function savedData(projectDir: string, folder: string, path: string): Record<string, unknown> {
  const file = join(projectDir, 'content', NAMESPACE, folder, `${path}.json`);
  return (JSON.parse(readFileSync(file, 'utf8')) as { data: Record<string, unknown> }).data;
}

/**
 * Replaces the Raw JSON editor's text with `data` and applies it. The text is inserted in one
 * input event on a single line, so Monaco's auto-closing and auto-indent do not touch it.
 */
async function applyRawJson(window: Page, data: unknown): Promise<void> {
  await window.getByTestId('editor-tab-json').click();
  const panel = window.getByRole('region', { name: 'Raw JSON' });
  const view = panel.locator('.monaco-editor .view-lines');
  await expect(view).toBeVisible();
  await view.click();
  await window.keyboard.press('ControlOrMeta+A');
  await window.keyboard.press('Delete');
  await window.keyboard.insertText(JSON.stringify(data));
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(panel.getByRole('button', { name: 'Apply' })).toBeDisabled();
}

/** Clicks the toolbar's Undo once. */
async function undo(window: Page): Promise<void> {
  await window.getByTestId('toolbar-undo').click();
}

test('Creator: Gear set create, kept edits on Edit in Creator, jar export, undo', async () => {
  const started = Date.now();
  base = mkdtempSync(join(tmpdir(), 'msm-creator-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });
  const launched = await launchApp({ reuse: folders, args: WEBGL_ARGS });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId(`element-row-${id('pack')}`)).toBeVisible();
  await save(window);
  const blank = readdirSync(join(folders.projectDir, 'content', NAMESPACE), { recursive: true })
    .map(String)
    .sort();

  // The Gear set flow, named Sapphire.
  const dialog = await openFlow(window, 'gear-set');
  await expect(dialog.getByRole('heading', { name: 'Create: Gear set' })).toBeVisible();
  await dialog.getByTestId('param-material_name').fill('Sapphire');
  const items = dialog.getByRole('list', { name: 'Items' });
  for (const piece of PIECES) {
    await expect(dialog.getByTestId(`creator-item-${id(`sapphire_${piece}`)}`)).toBeVisible();
  }
  // The nine pieces and the material item.
  await expect(items.locator('li')).toHaveCount(PIECES.length + 1);
  await expect(dialog.getByTestId('creator-item-canvas').locator('canvas')).toBeVisible({
    timeout: 15_000,
  });
  await dialog.getByTestId('creator-tab-armour').click();
  await expect(dialog.getByTestId('creator-armour-canvas').locator('canvas')).toBeVisible({
    timeout: 15_000,
  });
  await expect(dialog.getByTestId('creator-armour-layer-1')).toBeVisible();

  // No hoe.
  await dialog.getByTestId('param-pieces-hoe').uncheck();
  await dialog.getByTestId('creator-tab-elements').click();
  await expect(dialog.getByTestId(`creator-element-${id('sapphire_helmet')}`)).toBeVisible();
  await expect(dialog.getByTestId(`creator-element-${id('sapphire_hoe')}`)).toHaveCount(0);
  await dialog.getByTestId('creator-create').click();
  await expect(dialog).toBeHidden();
  await expect(
    window.getByText(/^Create Gear set: \d+ element\(s\) and file\(s\) changed/),
  ).toBeVisible();

  for (const piece of PIECES.filter((entry) => entry !== 'hoe')) {
    await expect(window.getByTestId(`element-row-${id(`sapphire_${piece}`)}`)).toBeVisible();
  }
  await expect(window.getByTestId(`element-row-${id('sapphire_hoe')}`)).toHaveCount(0);
  await expect(window.getByTestId(`element-row-${id('sapphire_armor')}`)).toBeVisible();
  await expectNoErrors(window);
  await save(window);

  // Edit the sword by hand: attack damage 9.
  const sword = savedData(folders.projectDir, 'item', 'sapphire_sword') as {
    components: Record<string, Record<string, unknown>>;
  };
  const tool = sword.components['msm:tool'];
  if (tool === undefined) throw new Error('The sword has no msm:tool component.');
  tool.attack_damage = 9;
  await window.getByTestId(`element-row-${id('sapphire_sword')}`).click();
  await applyRawJson(window, sword);
  await save(window);
  expect(
    (savedData(folders.projectDir, 'item', 'sapphire_sword') as typeof sword).components['msm:tool']
      ?.attack_damage,
  ).toBe(9);

  // Edit in Creator on the helmet: another colour; the sword is kept.
  const helmetTexture = join(
    folders.projectDir,
    'assets',
    NAMESPACE,
    'textures',
    'item',
    'sapphire_helmet.png',
  );
  const helmetBefore = readFileSync(helmetTexture);
  await window.getByTestId(`element-row-${id('sapphire_helmet')}`).click();
  await window.getByTestId('editor-edit-in-creator').click();
  const edit = window.getByTestId('creator-dialog');
  await expect(edit).toBeVisible();
  await expect(edit.getByRole('heading', { name: 'Edit: Gear set' })).toBeVisible();
  await edit.getByTestId('param-colour').fill('#2050e0');
  const kept = edit.getByRole('region', { name: 'Kept your edits' });
  await expect(kept).toBeVisible();
  await expect(kept.getByTestId(`creator-kept-${id('sapphire_sword')}`)).toBeVisible();
  await expect(edit.getByTestId(`creator-overwrite-${id('sapphire_sword')}`)).not.toBeChecked();
  await expect(
    edit
      .getByRole('region', { name: 'Will be replaced' })
      .getByTestId(`creator-element-${id('textures/item/sapphire_helmet.png')}`),
  ).toBeVisible();
  await edit.getByTestId('creator-create').click();
  await expect(edit).toBeHidden();
  await expect(
    window.getByText(/^Update Gear set: \d+ element\(s\) and file\(s\) changed/),
  ).toBeVisible();
  await save(window);
  expect(
    (savedData(folders.projectDir, 'item', 'sapphire_sword') as typeof sword).components['msm:tool']
      ?.attack_damage,
  ).toBe(9);
  const helmetAfter = readFileSync(helmetTexture);
  expect(helmetAfter.equals(helmetBefore)).toBe(false);
  await expectNoErrors(window);

  // The Fabric mod jar holds the helmet and the equipment asset.
  const jar = await exportJar(window, folders.outDir);
  expect(jar.name).toBe(`${NAMESPACE}.jar`);
  expect(Object.keys(jar.files)).toEqual(
    expect.arrayContaining([
      'fabric.mod.json',
      `msm/${NAMESPACE}/item/sapphire_helmet.json`,
      `assets/${NAMESPACE}/equipment/sapphire_armor.json`,
    ]),
  );
  const jarSword = JSON.parse(
    strFromU8(jar.files[`msm/${NAMESPACE}/item/sapphire_sword.json`] ?? new Uint8Array()),
  ) as typeof sword;
  expect(jarSword.components['msm:tool']?.attack_damage).toBe(9);
  await window.screenshot({ path: join(outputDir, 'creator-path.png') });

  // Undo the Update: the old texture bytes come back; Undo the Create: the blank project.
  // (The hand edit of the sword sits between them.)
  await undo(window);
  await expect.poll(() => readFileSync(helmetTexture).equals(helmetBefore)).toBe(true);
  await undo(window);
  await undo(window);
  await expect(window.getByTestId(`element-row-${id('sapphire_helmet')}`)).toHaveCount(0);
  await expect(window.getByTestId(`element-row-${id('sapphire_sword')}`)).toHaveCount(0);
  await expect(window.getByTestId(`element-row-${id('pack')}`)).toBeVisible();
  await save(window);
  await expect
    .poll(() =>
      readdirSync(join(folders.projectDir, 'content', NAMESPACE), { recursive: true })
        .map(String)
        .sort(),
    )
    .toEqual(blank);
  const itemTextures = join(folders.projectDir, 'assets', NAMESPACE, 'textures', 'item');
  await expect.poll(() => (existsSync(itemTextures) ? readdirSync(itemTextures) : [])).toEqual([]);
  console.log(`creator-path gear set: ${((Date.now() - started) / 1000).toFixed(1)} s`);
});

test('Creator: Painting with a picked PNG and a bow from the Weapon flow', async () => {
  const started = Date.now();
  base = mkdtempSync(join(tmpdir(), 'msm-creator-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  const picture = gradientPng(32, 16, [250, 170, 40, 255], [120, 40, 160, 255]);
  const picturePath = join(base, 'sunset.png');
  writeFileSync(picturePath, picture);
  const launched = await launchApp({ reuse: folders, pickFiles: [picturePath] });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId(`element-row-${id('pack')}`)).toBeVisible();

  // Painting: opens on the Card tab; the picked picture replaces the placeholder.
  const painting = await openFlow(window, 'painting');
  await expect(painting.getByTestId('creator-tab-card')).toHaveAttribute('aria-selected', 'true');
  await expect(painting.getByTestId(`creator-painting-${id('ruby_sunset')}`)).toBeVisible();
  await expect(painting.getByTestId('param-image-empty')).toHaveText('No image');
  await painting.getByTestId('param-image').click();
  await expect(painting.getByTestId('param-image-thumbnail')).toBeVisible();
  await expect(painting.getByTestId('param-image-summary')).toHaveText(
    'PNG image, 32 by 16 pixels',
  );
  await expect(painting.getByTestId('creator-painting-fit')).toBeVisible();
  await painting.getByTestId('creator-create').click();
  await expect(painting).toBeHidden();
  await expect(
    window.getByText(/^Create Painting: \d+ element\(s\) and file\(s\) changed/),
  ).toBeVisible();
  await expect(window.getByTestId(`element-row-${id('ruby_sunset')}`)).toBeVisible();
  const paintingTexture = join(
    folders.projectDir,
    'assets',
    NAMESPACE,
    'textures',
    'painting',
    'ruby_sunset.png',
  );
  expect(readFileSync(paintingTexture).equals(picture)).toBe(true);

  // Weapon: a bow, with its stats.
  const weapon = await openFlow(window, 'weapon');
  await weapon.getByTestId('param-weapon_name').fill('Sapphire Bow');
  await weapon.getByTestId('param-weapon_type').selectOption('bow');
  await expect(weapon.getByTestId(`creator-item-${id('sapphire_bow')}`)).toBeVisible();
  await weapon.getByTestId('creator-tab-stats').click();
  await expect(weapon.getByTestId(`creator-stats-${id('sapphire_bow')}`)).toBeVisible();
  await weapon.getByTestId('creator-create').click();
  await expect(weapon).toBeHidden();
  await expect(
    window.getByText(/^Create Weapon: \d+ element\(s\) and file\(s\) changed/),
  ).toBeVisible();
  await expect(window.getByTestId(`element-row-${id('sapphire_bow')}`)).toBeVisible();
  await expectNoErrors(window);

  // Exports: the resource pack holds the picture as picked, the data pack the variant and
  // the placeable tag, the jar the bow.
  await window.getByTestId('toolbar-export-zip').click();
  const resource = await newZip(folders.outDir, '.zip');
  expect(resource.files[`assets/${NAMESPACE}/textures/painting/ruby_sunset.png`]).toEqual(
    new Uint8Array(picture),
  );
  await window.getByTestId('toolbar-export-menu').click();
  await window.getByTestId('export-data-zip').click();
  const data = await newZip(folders.outDir, '.zip', [resource.name]);
  expect(Object.keys(data.files)).toEqual(
    expect.arrayContaining([
      `data/${NAMESPACE}/painting_variant/ruby_sunset.json`,
      'data/minecraft/tags/painting_variant/placeable.json',
    ]),
  );
  const jar = await exportJar(window, folders.outDir);
  expect(Object.keys(jar.files)).toContain(`msm/${NAMESPACE}/item/sapphire_bow.json`);

  await save(window);
  console.log(`creator-path painting and weapon: ${((Date.now() - started) / 1000).toFixed(1)} s`);
});

test('Creator: Music disc with a picked song file (ADR 0049)', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-creator-song-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  const song = oggVorbis(95, 1);
  const songPath = join(base, 'night_walk.ogg');
  writeFileSync(songPath, song);
  const launched = await launchApp({ reuse: folders, pickFiles: [songPath] });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId(`element-row-${id('pack')}`)).toBeVisible();

  const disc = await openFlow(window, 'music-disc-item');
  await expect(disc.getByTestId('param-song_file-summary')).toHaveText('None');
  await disc.getByTestId('param-song_file').click();
  await expect(disc.getByTestId('param-song_file-summary')).toHaveText('Ogg Vorbis, 1:35, mono');
  await disc.getByTestId('creator-create').click();
  await expect(disc).toBeHidden();
  await expect(window.getByTestId(`element-row-${id('ruby_waltz')}`)).toBeVisible();
  const stored = join(folders.projectDir, 'assets', NAMESPACE, 'sounds', 'ruby_waltz.ogg');
  await expect.poll(() => existsSync(stored)).toBe(true);
  expect(readFileSync(stored).equals(song)).toBe(true);
  await save(window);
  const content = join(folders.projectDir, 'content', NAMESPACE);
  const songFile = (readdirSync(content, { recursive: true }) as string[]).find(
    (entry) => entry.endsWith('ruby_waltz.json') && !entry.includes('item'),
  );
  if (songFile === undefined) throw new Error('The jukebox song was not saved.');
  const jukebox = JSON.parse(readFileSync(join(content, songFile), 'utf8')) as {
    data: { length_in_seconds: number };
  };
  expect(jukebox.data.length_in_seconds).toBe(95);
});

test('Creator: Dimension with a key (ADR 0051)', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-creator-dimension-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  const launched = await launchApp({ reuse: folders });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId(`element-row-${id('pack')}`)).toBeVisible();

  const dimension = await openFlow(window, 'dimension');
  await dimension.getByTestId('creator-create').click();
  await expect(dimension).toBeHidden();
  for (const element of ['ruby_realm', 'ruby_realm/travel', 'ruby_realm_key']) {
    await expect(window.getByTestId(`element-row-${id(element)}`)).toBeVisible();
  }
  // The travel function names the project's own dimension without a problem.
  await window.getByTestId('dock-tab-problems').click();
  await expect(
    window.getByTestId('problems-panel').locator('[data-testid="problem-row"]'),
  ).toHaveCount(0);
});

test('Creator: Status effect with a drink and a Throwable (ADRs 0055, 0056)', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-creator-magic-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  const launched = await launchApp({ reuse: folders });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId(`element-row-${id('pack')}`)).toBeVisible();

  // Status effect, from the Magic group: opens on its card.
  await window.getByTestId('toolbar-creator').click();
  const picker = window.getByTestId('creator-dialog');
  await expect(picker.getByTestId('creator-group-magic')).toContainText('Magic');
  const effect = await openFlowFrom(picker, 'creator-group-magic', 'status-effect');
  await expect(effect.getByTestId('creator-tab-card')).toHaveAttribute('aria-selected', 'true');
  const card = effect.getByTestId(`creator-effect-${id('ruby_rush')}`);
  await expect(card).toBeVisible();
  await expect(card.getByTestId('creator-effect-icon')).toHaveAttribute('src', /^data:image\/png/);
  await expect(card.getByTestId('creator-effect-name')).toHaveText('Ruby Rush');
  await expect(card.getByTestId('creator-effect-levels')).toBeVisible();
  await expect(effect.getByTestId('param-source')).toHaveValue('drink');
  await effect.getByTestId('creator-create').click();
  await expect(effect).toBeHidden();
  await expect(
    window.getByText(/^Create Status effect: \d+ element\(s\) and file\(s\) changed/),
  ).toBeVisible();
  await expect(window.getByTestId(`element-row-${id('ruby_rush')}`)).toBeVisible();
  await expect(window.getByTestId(`element-row-${id('ruby_rush_tonic')}`)).toBeVisible();

  // Throwable: a knife, with its card.
  const throwable = await openFlow(window, 'throwable');
  await expect(throwable.getByTestId(`creator-item-${id('ruby_knife')}`)).toBeVisible();
  await throwable.getByTestId('creator-tab-card').click();
  const knife = throwable.getByTestId(`creator-throwable-${id('ruby_knife')}`);
  await expect(knife).toBeVisible();
  await expect(knife.getByTestId('creator-throwable-sprite')).toBeVisible();
  await expect(knife.getByTestId('creator-throwable-arc')).toBeVisible();
  await expect(knife).toContainText('picked up again');
  await throwable.getByTestId('creator-create').click();
  await expect(throwable).toBeHidden();
  await expect(window.getByTestId(`element-row-${id('ruby_knife')}`)).toBeVisible();
  await expectNoErrors(window);

  // Edit one answer: the effect becomes a bad one.
  await window.getByTestId(`element-row-${id('ruby_rush')}`).click();
  await window.getByTestId('editor-edit-in-creator').click();
  const edit = window.getByTestId('creator-dialog');
  await expect(edit.getByRole('heading', { name: 'Edit: Status effect' })).toBeVisible();
  await edit.getByTestId('param-category').selectOption('harmful');
  await edit.getByTestId('creator-tab-card').click();
  await expect(edit.getByTestId('creator-effect-name')).toHaveCSS('color', 'rgb(255, 85, 85)');
  await edit.getByTestId('creator-create').click();
  await expect(edit).toBeHidden();
  await expect(
    window.getByText(/^Update Status effect: \d+ element\(s\) and file\(s\) changed/),
  ).toBeVisible();
  await save(window);
  expect(savedData(folders.projectDir, 'effect', 'ruby_rush').category).toBe('harmful');
  await expectNoErrors(window);

  // The jar: the effect, its icon and the throwable item.
  const jar = await exportJar(window, folders.outDir);
  expect(Object.keys(jar.files)).toEqual(
    expect.arrayContaining([
      `msm/${NAMESPACE}/effect/ruby_rush.json`,
      `assets/${NAMESPACE}/textures/mob_effect/ruby_rush.png`,
      `msm/${NAMESPACE}/item/ruby_rush_tonic.json`,
      `msm/${NAMESPACE}/item/ruby_knife.json`,
    ]),
  );
  const definition = JSON.parse(
    strFromU8(jar.files[`msm/${NAMESPACE}/effect/ruby_rush.json`] ?? new Uint8Array()),
  ) as { category?: string };
  expect(definition.category).toBe('harmful');
  const knifeDefinition = JSON.parse(
    strFromU8(jar.files[`msm/${NAMESPACE}/item/ruby_knife.json`] ?? new Uint8Array()),
  ) as { components: Record<string, Record<string, unknown>> };
  expect(knifeDefinition.components['msm:throwable']).toMatchObject({ after_throw: 'drop' });
  await window.screenshot({ path: join(outputDir, 'creator-path-magic.png') });
});
