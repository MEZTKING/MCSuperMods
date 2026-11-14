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
 * 4. Custom ore with generation (ADR 0060 D6): the Custom ore flow's "World" questions are on
 *    by default; a smaller vein size gives an ore feature, a placed feature and a world addition
 *    (sidebar "World additions") next to the ore, with no problems at all; the Fabric mod jar
 *    holds the world addition under `msm/` and the two worldgen files as data.
 * 5. Potion (ADR 0063): the Potion flow under "Magic" with its defaults makes a potion of a new
 *    effect with longer, stronger, splash and lingering versions; the Potion Studio shows the
 *    three ids, the names and fifteen brewing steps; zero problems; the Fabric mod jar holds the
 *    three potion definitions, fifteen brewing recipes and the name keys; the vanilla data pack
 *    leaves the brewing out and lists `blocks-items.potion-needs-jar` under "Last export".
 * 6. Mob skin and Goat horn (ADR 0064): a wolf skin (sidebar "Wolf skins") and a goat horn call
 *    (sidebar "Horn sounds") with zero problems; the vanilla resource pack holds the six wolf
 *    textures and the call's name, the data pack the variant, the instrument, its recipe and the
 *    `minecraft:regular_goat_horns` tag, and no `msm/` files.
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
import { type LaunchedApp, launchApp, openDockTab, outputDir, toast } from './fixtures';
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
  await openDockTab(window, 'problems');
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
    toast(window).filter({ hasText: /^Create Gear set: \d+ element\(s\) and file\(s\) changed/ }),
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
    toast(window).filter({ hasText: /^Update Gear set: \d+ element\(s\) and file\(s\) changed/ }),
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
    toast(window).filter({ hasText: /^Create Painting: \d+ element\(s\) and file\(s\) changed/ }),
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
    toast(window).filter({ hasText: /^Create Weapon: \d+ element\(s\) and file\(s\) changed/ }),
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
  await openDockTab(window, 'problems');
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
    toast(window).filter({
      hasText: /^Create Status effect: \d+ element\(s\) and file\(s\) changed/,
    }),
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
    toast(window).filter({
      hasText: /^Update Status effect: \d+ element\(s\) and file\(s\) changed/,
    }),
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

test('Creator: Custom ore that generates in the world (ADR 0060 D6)', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-creator-ore-'));
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

  // The Custom ore flow: "Generate in the world" is on by default; a smaller vein.
  const ore = await openFlow(window, 'custom_ore');
  await expect(ore.getByRole('heading', { name: 'Create: Custom ore' })).toBeVisible();
  await expect(ore.getByTestId('param-generate')).toBeChecked();
  await ore.getByTestId('param-vein_size').fill('5');
  await ore.getByTestId('creator-tab-elements').click();
  for (const element of ['ore_ruby', 'ore_ruby_placed', 'ruby_ore_generation']) {
    await expect(ore.getByTestId(`creator-element-${id(element)}`)).toBeVisible();
  }
  await ore.getByTestId('creator-create').click();
  await expect(ore).toBeHidden();
  await expect(
    toast(window).filter({ hasText: /^Create Custom ore: \d+ element\(s\) and file\(s\) changed/ }),
  ).toBeVisible();
  for (const element of [
    'ruby_ore',
    'ruby',
    'ore_ruby',
    'ore_ruby_placed',
    'ruby_ore_generation',
  ]) {
    await expect(window.getByTestId(`element-row-${id(element)}`)).toBeVisible();
  }
  // The sidebar heading reads "World additions" with the kind id beside it.
  await expect(window.getByRole('heading', { name: /^World additions\b/ })).toBeVisible();

  // The world addition opens in its Studio, with the overworld tag and the placed feature.
  await window.getByTestId(`element-row-${id('ruby_ore_generation')}`).click();
  const studio = window.getByTestId('world-addition-studio');
  await expect(studio).toBeVisible();
  await expect(studio.getByTestId('world-addition-feature-0-id')).toHaveValue(
    id('ore_ruby_placed'),
  );
  await expect(studio.getByTestId('world-addition-feature-0-step')).toHaveValue('underground_ores');

  // Zero problems, not only zero errors.
  await openDockTab(window, 'problems');
  await expect(
    window.getByTestId('problems-panel').locator('[data-testid="problem-row"]'),
  ).toHaveCount(0);
  await expect(window.locator('footer').getByText(/^0 error\(s\)/)).toBeVisible();
  await save(window);

  // The jar: the world addition in the msm layer, the two worldgen files as data.
  const jar = await exportJar(window, folders.outDir);
  const names = Object.keys(jar.files);
  expect(names).toEqual(
    expect.arrayContaining([
      `msm/${NAMESPACE}/block/ruby_ore.json`,
      `msm/${NAMESPACE}/biome_addition/ruby_ore_generation.json`,
    ]),
  );
  const addition = JSON.parse(
    strFromU8(
      jar.files[`msm/${NAMESPACE}/biome_addition/ruby_ore_generation.json`] ?? new Uint8Array(),
    ),
  ) as unknown;
  expect(addition).toEqual({
    format: 1,
    biomes: ['#minecraft:is_overworld'],
    features: [{ feature: id('ore_ruby_placed'), step: 'underground_ores' }],
  });
  const featureFile = names.find((name) =>
    new RegExp(`^data/${NAMESPACE}/worldgen/[a-z_]*feature/ore_ruby\\.json$`).test(name),
  );
  const placedFile = names.find(
    (name) => name === `data/${NAMESPACE}/worldgen/placed_feature/ore_ruby_placed.json`,
  );
  expect(featureFile).toBeDefined();
  expect(placedFile).toBeDefined();
  const feature = JSON.parse(strFromU8(jar.files[featureFile ?? ''] ?? new Uint8Array())) as {
    type?: string;
    size?: number;
    config?: { size?: number };
  };
  expect(feature.type).toBe('minecraft:ore');
  expect(feature.config?.size ?? feature.size).toBe(5);
});

test('Creator: Potion with its own effect, brewing chain and jar export (ADR 0063)', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-creator-potion-'));
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

  // The Potion flow, from the Magic group, with its defaults: Moon Leap, an effect of its own,
  // longer, stronger, splash and lingering versions.
  await window.getByTestId('toolbar-creator').click();
  const picker = window.getByTestId('creator-dialog');
  const potion = await openFlowFrom(picker, 'creator-group-magic', 'potion');
  await expect(potion.getByRole('heading', { name: 'Create: Potion' })).toBeVisible();
  await expect(potion.getByTestId('param-potion_name')).toHaveValue('Moon Leap');
  await potion.getByTestId('creator-tab-elements').click();
  for (const element of ['moon_leap', 'moon_leap_effect']) {
    await expect(potion.getByTestId(`creator-element-${id(element)}`)).toBeVisible();
  }
  await potion.getByTestId('creator-create').click();
  await expect(potion).toBeHidden();
  await expect(
    toast(window).filter({ hasText: /^Create Potion: \d+ element\(s\) and file\(s\) changed/ }),
  ).toBeVisible();
  await expect(window.getByRole('heading', { name: /^Potions\b/ })).toBeVisible();

  // The Potion Studio: the three registry ids, the four names and the fifteen brewing steps.
  await window.getByTestId(`element-row-${id('moon_leap')}`).click();
  const studio = window.getByTestId('potion-studio');
  await expect(studio).toBeVisible();
  await expect(studio.getByTestId('potion-display-name')).toHaveValue('Moon Leap');
  await expect(studio.getByTestId('potion-preview-ids')).toHaveText(
    `Potion ids: ${id('moon_leap')}, ${id('long_moon_leap')}, ${id('strong_moon_leap')}`,
  );
  await expect(studio.getByTestId('potion-preview-names')).toContainText('Potion of Moon Leap');
  await expect(studio.getByTestId('potion-preview-names')).toContainText('Arrow of Moon Leap');
  await expect(studio.getByTestId('potion-chain-steps').locator('li')).toHaveCount(15);

  // Zero problems, not only zero errors.
  await openDockTab(window, 'problems');
  await expect(
    window.getByTestId('problems-panel').locator('[data-testid="problem-row"]'),
  ).toHaveCount(0);
  await expect(window.locator('footer').getByText(/^0 error\(s\)/)).toBeVisible();
  await save(window);

  // The jar: three potion definitions, the effect, fifteen brewing recipes and the names.
  const jar = await exportJar(window, folders.outDir);
  const names = Object.keys(jar.files);
  expect(names).toEqual(
    expect.arrayContaining([
      `msm/${NAMESPACE}/effect/moon_leap_effect.json`,
      `msm/${NAMESPACE}/potion/moon_leap.json`,
      `msm/${NAMESPACE}/potion/long_moon_leap.json`,
      `msm/${NAMESPACE}/potion/strong_moon_leap.json`,
    ]),
  );
  const brewing = names.filter((name) => name.startsWith(`data/${NAMESPACE}/recipe/brewing/`));
  expect(brewing).toHaveLength(15);
  const definition = JSON.parse(
    strFromU8(jar.files[`msm/${NAMESPACE}/potion/moon_leap.json`] ?? new Uint8Array()),
  ) as { effects: { id: string }[] };
  expect(definition.effects.map((effect) => effect.id)).toEqual([id('moon_leap_effect')]);
  const recipe = JSON.parse(
    strFromU8(
      jar.files[`data/${NAMESPACE}/recipe/brewing/potion_moon_leap.json`] ?? new Uint8Array(),
    ),
  ) as { type: string; reagent: { item: string } };
  expect(recipe).toMatchObject({
    type: 'minecraft:brewing',
    reagent: { item: 'minecraft:amethyst_shard' },
  });
  const lang = JSON.parse(
    strFromU8(jar.files[`assets/${NAMESPACE}/lang/en_us.json`] ?? new Uint8Array()),
  ) as Record<string, string>;
  expect(lang[`item.minecraft.potion.effect.${NAMESPACE}.moon_leap`]).toBe('Potion of Moon Leap');

  // The vanilla data pack leaves the potion and its brewing out, with one warning.
  await window.getByTestId('toolbar-export-menu').click();
  await window.getByTestId('export-data-zip').click();
  const data = await newZip(folders.outDir, '.zip');
  expect(Object.keys(data.files).filter((name) => name.includes('/recipe/brewing/'))).toEqual([]);
  await openDockTab(window, 'problems');
  await expect(
    window
      .getByTestId('export-problems')
      .locator('[data-testid="problem-row"][data-code="blocks-items.potion-needs-jar"]'),
  ).toHaveCount(1);
  await window.screenshot({ path: join(outputDir, 'creator-path-potion.png') });
});

test('Creator: Mob skin and Goat horn in vanilla packs (ADR 0064)', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-creator-data-kinds-'));
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

  // Mob skin, from the Mobs group: a wolf skin in forests (the defaults).
  await window.getByTestId('toolbar-creator').click();
  const picker = window.getByTestId('creator-dialog');
  const skin = await openFlowFrom(picker, 'creator-group-mobs', 'mob-skin');
  await expect(skin.getByRole('heading', { name: 'Create: Mob skin' })).toBeVisible();
  await expect(skin.getByTestId('param-animal')).toHaveValue('wolf');
  await skin.getByTestId('creator-create').click();
  await expect(skin).toBeHidden();
  await expect(
    toast(window).filter({ hasText: /^Create Mob skin: \d+ element\(s\) and file\(s\) changed/ }),
  ).toBeVisible();
  await expect(window.getByTestId(`element-row-${id('ember_coat')}`)).toBeVisible();
  await expect(window.getByRole('heading', { name: /^Wolf skins\b/ })).toBeVisible();

  // Goat horn, from the Gear group: a vanilla call, a recipe and the goats' tag.
  await window.getByTestId('toolbar-creator').click();
  const horn = await openFlowFrom(
    window.getByTestId('creator-dialog'),
    'creator-group-gear',
    'goat-horn',
  );
  await expect(horn.getByRole('heading', { name: 'Create: Goat horn' })).toBeVisible();
  await expect(horn.getByTestId('param-goats_drop')).toBeChecked();
  await horn.getByTestId('creator-create').click();
  await expect(horn).toBeHidden();
  await expect(
    toast(window).filter({ hasText: /^Create Goat horn: \d+ element\(s\) and file\(s\) changed/ }),
  ).toBeVisible();
  for (const element of ['storm_call', 'storm_call_goat_horn']) {
    await expect(window.getByTestId(`element-row-${id(element)}`)).toBeVisible();
  }
  await expect(window.getByRole('heading', { name: /^Horn sounds\b/ })).toBeVisible();

  await openDockTab(window, 'problems');
  await expect(
    window.getByTestId('problems-panel').locator('[data-testid="problem-row"]'),
  ).toHaveCount(0);
  await save(window);

  // Vanilla packs: the textures and the call's name in the resource pack, the variant, the
  // instrument, its recipe and the merged goat horn tag in the data pack.
  await window.getByTestId('toolbar-export-zip').click();
  const resource = await newZip(folders.outDir, '.zip');
  const resourceNames = Object.keys(resource.files);
  for (const suffix of ['', '_tame', '_angry', '_baby', '_tame_baby', '_angry_baby']) {
    expect(resourceNames).toContain(
      `assets/${NAMESPACE}/textures/entity/wolf/ember_coat${suffix}.png`,
    );
  }
  const lang = JSON.parse(
    strFromU8(resource.files[`assets/${NAMESPACE}/lang/en_us.json`] ?? new Uint8Array()),
  ) as Record<string, string>;
  expect(lang[`instrument.${NAMESPACE}.storm_call`]).toBe('Storm Call');
  await window.getByTestId('toolbar-export-menu').click();
  await window.getByTestId('export-data-zip').click();
  const data = await newZip(folders.outDir, '.zip', [resource.name]);
  expect(Object.keys(data.files)).toEqual(
    expect.arrayContaining([
      `data/${NAMESPACE}/wolf_variant/ember_coat.json`,
      `data/${NAMESPACE}/instrument/storm_call.json`,
      `data/${NAMESPACE}/recipe/storm_call_goat_horn.json`,
      'data/minecraft/tags/instrument/regular_goat_horns.json',
    ]),
  );
  const variant = JSON.parse(
    strFromU8(data.files[`data/${NAMESPACE}/wolf_variant/ember_coat.json`] ?? new Uint8Array()),
  ) as { assets: { wild: string } };
  expect(variant.assets.wild).toBe(id('entity/wolf/ember_coat'));
  const tag = JSON.parse(
    strFromU8(
      data.files['data/minecraft/tags/instrument/regular_goat_horns.json'] ?? new Uint8Array(),
    ),
  ) as { values: string[] };
  expect(tag.values).toContain(id('storm_call'));
  expect(Object.keys(data.files).some((name) => name.startsWith('msm/'))).toBe(false);
});
