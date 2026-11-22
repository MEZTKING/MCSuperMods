/**
 * The growing plants, pots and sounds path (ADRs 0103 and 0105, ADR 0112 D1, D2; brief B521). A
 * brand-new install (`MSM_E2E_NEW_INSTALL`) opens Home in Very easy; "Start a new mod" makes the
 * mod by name.
 *
 * 1. Very easy: "Make a block" offers the picks "Grows in long strands" (the Cave plants flow)
 *    and "A flower pot" (the Flower pot flow). With their defaults they make the Ember Vine (a
 *    `growing_plant` with glowing berries) and the Clay Planter (a project `flower_pot` taking
 *    five vanilla plants); My things lists both and Things to fix has nothing to fix.
 * 2. Advanced, the Block Studio: the vine's "Grows in long strands" section reads the flow's
 *    answers; the pot's "A flower pot" section counts its potted blocks, and a vanilla plant
 *    (allium) is added from the ThingPicker's "Plants Minecraft pots". "How it sounds" on the pot
 *    writes its own break and place sounds and a pitch.
 * 3. The "Vanilla block rules" Studio: the template's rules, a strip rule added for an oak log
 *    (the Studio says which vanilla pair it replaces) and an ageing rule; saved as typed.
 * 4. Exports: the Fabric mod jar on the default target (26.3) holds the vine and its strand, the
 *    pot with a potted block (models naming the pot's pictures and the plant's) for every plant
 *    it takes, the pot's own sounds in its definition and the rules; after "Upgrade project
 *    target" the snapshot's (26.4) jar also holds the pot's `block_sound_set` entry, filled in
 *    from its stone sounds.
 *
 * Target ids come from `@msm/targets`.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { builtInTargets, defaultTargetId, targetById } from '@msm/targets';
import { strFromU8, unzipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp, openDockTab, outputDir, toast } from './fixtures';

const MOD_NAME = 'Garden Mod';

/** The vanilla plants the Flower pot flow puts in its pot by default. */
const POT_PLANTS = ['dandelion', 'poppy', 'cornflower', 'oak_sapling', 'fern'] as const;

let base: string | undefined;
let launched: LaunchedApp | undefined;
const savedEnv: Record<string, string | undefined> = {};

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

/** Things to fix shows nothing to fix and no tips (warnings and info included). */
async function expectNothingToFix(window: Page): Promise<void> {
  const fix = window.getByTestId('things-to-fix');
  await expect(fix.getByTestId('things-to-fix-none')).toBeVisible({ timeout: 30_000 });
  await expect(fix.getByTestId('things-to-fix-tips')).toHaveCount(0);
}

/** Runs the Creator flow `flowId` from Home's "Make a block" tile with its defaults. */
async function makeBlockPick(window: Page, flowId: string, label: string): Promise<void> {
  await window.getByTestId('toolbar-home').click();
  await window.getByTestId('home').getByTestId('home-tile-block').click();
  const creator = window.getByTestId('creator-dialog');
  await expect(creator).toBeVisible();
  const card = creator.getByTestId(`creator-flow-${flowId}`);
  await expect(card).toContainText(label);
  await card.click();
  const create = creator.getByTestId('creator-create');
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  await expect(creator).toBeHidden({ timeout: 60_000 });
}

/** No error in the Problems panel, and the status bar agrees. */
async function expectNoErrors(window: Page): Promise<void> {
  await openDockTab(window, 'problems');
  const problems = window.getByTestId('problems-panel');
  await expect(problems).toBeVisible();
  await expect(problems.locator('[data-testid="problem-row"][data-severity="error"]')).toHaveCount(
    0,
  );
  await expect(window.locator('footer').getByText(/^0 error\(s\)/)).toBeVisible();
}

/** Types `value` into an id field and commits it with Enter. */
async function commitId(field: Locator, value: string): Promise<void> {
  await field.fill(value);
  await field.press('Enter');
  await expect(field).toHaveValue(value);
}

/** Saves the project, which must have unsaved changes (otherwise "Saved" shows at once). */
async function save(window: Page): Promise<void> {
  const footer = window.locator('footer');
  await expect(footer.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await window.getByTestId('toolbar-save').click();
  await expect(footer.getByText('Saved', { exact: true })).toBeVisible();
}

/** The `data` of a saved element file. */
function savedData<T = Record<string, unknown>>(
  projectDir: string,
  ns: string,
  folder: string,
  path: string,
): T {
  const file = join(projectDir, 'content', ns, folder, `${path}.json`);
  return (JSON.parse(readFileSync(file, 'utf8')) as { data: T }).data;
}

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

/** Waits for the one complete `.jar` in `dir`, and reads it. */
async function exportedJar(
  dir: string,
): Promise<{ name: string; files: Record<string, Uint8Array> }> {
  let name = '';
  await expect
    .poll(
      () => {
        name = readdirSync(dir).find((entry) => entry.endsWith('.jar')) ?? '';
        return name !== '' && isCompleteZip(join(dir, name));
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  return { name, files: readZip(join(dir, name)) };
}

/** A JSON file of an exported zip. */
function zipJson<T>(files: Record<string, Uint8Array>, path: string): T {
  const bytes = files[path];
  if (bytes === undefined) throw new Error(`${path} is missing from the export.`);
  return JSON.parse(strFromU8(bytes)) as T;
}

async function openPalette(window: Page, query: string): Promise<Locator> {
  await window.keyboard.press('ControlOrMeta+Shift+P');
  const palette = window.getByTestId('command-palette');
  await expect(palette).toBeVisible();
  await palette.getByTestId('command-palette-input').fill(query);
  return palette;
}

/** Exports the Fabric mod jar (runtime kept apart: CI's `ci` job builds no runtime jar). */
async function exportJar(window: Page, outDir: string) {
  for (const entry of readdirSync(outDir)) rmSync(join(outDir, entry), { force: true });
  const palette = await openPalette(window, 'fabric mod jar');
  await palette.getByTestId('command-exportFabricJar').click();
  await expect(palette).toBeHidden();
  const dialog = window.getByTestId('fabric-jar-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('exporter-option-separateRuntime').check();
  await dialog.getByTestId('fabric-jar-dialog-submit').click();
  await expect(dialog).toBeHidden();
  return exportedJar(outDir);
}

type BlockModel = { parent?: string; textures?: Record<string, string> };

test('plants: Cave plants and Flower pot from Very easy, the pot and its sounds, vanilla block rules, jars on both targets', async () => {
  test.setTimeout(300_000);
  base = mkdtempSync(join(tmpdir(), 'msm-plants-'));
  const folders = {
    projectDir: join(base, 'picked'),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });
  savedEnv.MSM_E2E_NEW_INSTALL = process.env.MSM_E2E_NEW_INSTALL;
  process.env.MSM_E2E_NEW_INSTALL = '1';

  launched = await launchApp({ reuse: folders });
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  const welcome = window.getByTestId('welcome-dialog');
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'Got it' }).click();
  await expect(welcome).toBeHidden();
  const home = window.getByTestId('home');
  await expect(home).toBeVisible();

  await home.getByTestId('home-new').click();
  const newMod = window.getByTestId('new-mod-dialog');
  await newMod.getByTestId('new-mod-name').fill(MOD_NAME);
  await newMod.getByTestId('new-mod-dialog-submit').click();
  await expect(newMod).toBeHidden();
  const projectDir = join(folders.msmHome, 'Documents', 'MCSuperMods', MOD_NAME);
  await expect.poll(() => existsSync(join(projectDir, 'msm.project.json'))).toBe(true);
  const manifest = JSON.parse(readFileSync(join(projectDir, 'msm.project.json'), 'utf8')) as {
    namespaces: string[];
  };
  const ns = manifest.namespaces[0] ?? '';
  expect(ns).not.toBe('');
  const id = (path: string) => `${ns}:${path}`;

  // 1. The Very easy picks with their defaults. -----------------------------------------------
  await makeBlockPick(window, 'cave-plants', 'Grows in long strands');
  await expectNothingToFix(window);
  await makeBlockPick(window, 'flower-pot', 'A flower pot');
  await expectNothingToFix(window);
  await window.getByTestId('toolbar-home').click();
  const things = home.getByTestId('my-things');
  await expect(things.locator('li')).toHaveCount(2);
  await expect(things).toContainText('Ember Vine');
  await expect(things).toContainText('Clay Planter');

  // 2. Advanced: the vine, then the pot, a vanilla plant added and its own sounds. ------------
  await window.getByTestId('toolbar-mode-advanced').click();
  await expect(window.getByRole('navigation', { name: 'Elements' })).toBeVisible();
  await window.getByTestId(`element-row-${id('ember_vine')}`).click();
  const studio = window.getByTestId('block-studio');
  await expect(studio).toBeVisible();
  await expect(studio.getByTestId('block-growing-plant')).toBeVisible();
  await expect(studio.getByTestId('growing-plant-direction')).toHaveValue('down');
  await expect(studio.getByTestId('growing-plant-berries')).toBeChecked();
  await expect(studio.getByTestId('block-companion')).toContainText(id('ember_vine_plant'));

  await window.getByTestId(`element-row-${id('clay_planter')}`).click();
  const pot = studio.getByTestId('block-flower-pot');
  await expect(pot).toBeVisible();
  await expect(pot.getByTestId('flower-pot-plants').locator('li')).toHaveCount(POT_PLANTS.length);
  await expect(pot.getByTestId('flower-pot-count')).toContainText(
    `It makes ${POT_PLANTS.length} potted plant blocks`,
  );
  await pot.getByTestId('flower-pot-add').click();
  const picker = window.getByTestId('thing-picker');
  await expect(picker).toBeVisible();
  await expect(picker.getByText('Plants Minecraft pots')).toBeVisible();
  await picker.getByTestId('thing-minecraft:allium').click();
  await expect(picker).toBeHidden();
  await expect(pot.getByTestId(`flower-pot-plant-${POT_PLANTS.length}`)).toContainText(
    'minecraft:allium',
  );
  await expect(pot.getByTestId('flower-pot-count')).toContainText(
    `It makes ${POT_PLANTS.length + 1} potted plant blocks`,
  );

  const sounds = studio.getByTestId('block-sounds');
  await expect(sounds).toBeVisible({ timeout: 30_000 });
  await commitId(sounds.getByTestId('block-sound-break'), 'minecraft:block.glass.break');
  await commitId(sounds.getByTestId('block-sound-place'), 'minecraft:block.decorated_pot.place');
  const pitch = sounds.getByTestId('block-sound-pitch');
  await pitch.fill('1.5');
  await pitch.press('Enter');
  await expect(pitch).toHaveValue('1.5');
  await expectNoErrors(window);
  await save(window);
  const potData = savedData<{ type: string; plants: string[]; block_sounds: unknown }>(
    projectDir,
    ns,
    'block',
    'clay_planter',
  );
  expect(potData.type).toBe('flower_pot');
  expect(potData.plants).toEqual([...POT_PLANTS.map((p) => `minecraft:${p}`), 'minecraft:allium']);
  expect(potData.block_sounds).toEqual({
    break: 'minecraft:block.glass.break',
    place: 'minecraft:block.decorated_pot.place',
    pitch: 1.5,
  });

  // 3. The Vanilla block rules Studio. ----------------------------------------------------------
  await window.getByTestId('toolbar-add-element').click();
  const add = window.getByTestId('new-element-dialog');
  await expect(add).toBeVisible();
  await add.getByTestId('new-element-filter').fill('vanilla blocks');
  await add.getByTestId('template-msm_vanilla_block_rules').check();
  await expect(add.getByTestId('new-element-namespace')).toHaveValue(ns);
  await add.getByTestId('new-element-name').fill('garden_rules');
  await add.getByTestId('new-element-dialog-submit').click();
  await expect(add).toBeHidden();
  const rules = window.getByTestId('vanilla-block-rules-studio');
  await expect(rules).toBeVisible({ timeout: 30_000 });
  const strip = rules.getByTestId('vanilla-rules-strip');
  await expect(strip.locator('li')).toHaveCount(2);
  await strip.getByTestId('vanilla-rules-strip-add').click();
  await expect(strip.locator('li')).toHaveCount(3);
  await commitId(strip.getByTestId('vanilla-rules-strip-2-block'), 'minecraft:oak_log');
  await expect(strip.getByTestId('vanilla-rules-strip-2-replaces')).toContainText(
    'Stripped oak log',
  );
  await commitId(strip.getByTestId('vanilla-rules-strip-2-into'), 'minecraft:stripped_birch_log');
  const age = rules.getByTestId('vanilla-rules-age');
  await age.getByTestId('vanilla-rules-age-add').click();
  await commitId(age.getByTestId('vanilla-rules-age-0-block'), 'minecraft:cobblestone');
  await commitId(age.getByTestId('vanilla-rules-age-0-next'), 'minecraft:mossy_cobblestone');
  await expectNoErrors(window);
  await save(window);
  const ruleData = savedData<{ strip: unknown[]; age: unknown[]; burn: unknown[] }>(
    projectDir,
    ns,
    'vanilla_block_rules',
    'garden_rules',
  );
  expect(ruleData.strip[2]).toEqual({
    block: 'minecraft:oak_log',
    into: 'minecraft:stripped_birch_log',
  });
  expect(ruleData.age).toEqual([
    { block: 'minecraft:cobblestone', next: 'minecraft:mossy_cobblestone' },
  ]);
  expect(ruleData.burn).toHaveLength(2);
  await window.screenshot({ path: join(outputDir, 'plants-path-rules.png') });

  // 4. The Fabric mod jar on each target. -------------------------------------------------------
  const release = targetById(defaultTargetId)?.target;
  const snapshot = builtInTargets.find((entry) => entry.target.channel === 'snapshot')?.target;
  if (release === undefined || snapshot === undefined) throw new Error('Two targets expected.');
  // 26.3's runtime builds the sounds from the definition; 26.4 reads block_sound_set entries.
  expect(release.blocks?.soundModel ?? 'sound_type').toBe('sound_type');
  expect(snapshot.blocks?.soundModel).toBe('block_sound_set');
  for (const target of [release, snapshot]) {
    if (target.id !== release.id) {
      const palette = await openPalette(window, 'upgrade project target');
      await palette.getByTestId('command-upgradeTarget').click();
      await expect(palette).toBeHidden();
      const upgrade = window.getByTestId('upgrade-target-dialog');
      await expect(upgrade).toBeVisible();
      await upgrade.getByTestId(`upgrade-target-${target.id}`).click();
      await upgrade.getByTestId('upgrade-target-dialog-submit').click();
      await expect(upgrade).toBeHidden();
      await expect(toast(window)).toContainText(`Project target changed to ${target.id}.`);
      await expectNoErrors(window);
    }
    await expect(window.getByTestId('project-target')).toContainText(target.id);
    const jar = await exportJar(window, folders.outDir);
    const names = Object.keys(jar.files);

    // The vine, its strand and its berries.
    const vine = zipJson<{ type: string; berries: { item: string } }>(
      jar.files,
      `msm/${ns}/block/ember_vine.json`,
    );
    expect(vine.type).toBe('growing_plant');
    expect(vine.berries.item).toBe(id('ember_vine_berries'));
    expect(names).toEqual(
      expect.arrayContaining([
        `assets/${ns}/blockstates/ember_vine.json`,
        `assets/${ns}/blockstates/ember_vine_plant.json`,
        `assets/${ns}/textures/block/ember_vine_plant_berries.png`,
        `assets/${ns}/textures/item/ember_vine_berries.png`,
      ]),
    );

    // The pot, a potted block for each plant, and its own sounds.
    const definition = zipJson<{ type: string; plants: string[]; block_sounds: unknown }>(
      jar.files,
      `msm/${ns}/block/clay_planter.json`,
    );
    expect(definition.type).toBe('flower_pot');
    expect(definition.plants).toEqual(potData.plants);
    expect(definition.block_sounds).toEqual(potData.block_sounds);
    for (const plant of [...POT_PLANTS, 'allium']) {
      expect(names).toContain(`assets/${ns}/blockstates/clay_planter_${plant}.json`);
    }
    const potted = zipJson<BlockModel>(
      jar.files,
      `assets/${ns}/models/block/clay_planter_allium.json`,
    );
    expect(Object.values(potted.textures ?? {})).toEqual(
      expect.arrayContaining([id('block/clay_planter'), 'minecraft:block/allium']),
    );
    expect(names).toContain(`assets/${ns}/textures/block/clay_planter.png`);

    // The rules for vanilla blocks.
    expect(
      zipJson<{ strip: unknown[] }>(jar.files, `msm/${ns}/vanilla_block_rules/garden_rules.json`)
        .strip,
    ).toEqual(ruleData.strip);

    const soundSet = `data/${ns}/block_sound_set/clay_planter.json`;
    if (target.blocks?.soundModel === 'block_sound_set') {
      const entry = zipJson<Record<string, unknown>>(jar.files, soundSet);
      expect(entry).toMatchObject({
        break_sound: { sound_id: 'minecraft:block.glass.break' },
        place_sound: { sound_id: 'minecraft:block.decorated_pot.place' },
        // Filled in from the pot's sound type, stone.
        step_sound: { sound_id: 'minecraft:block.stone.step' },
        pitch: 1.5,
      });
    } else {
      expect(names).not.toContain(soundSet);
    }
  }
  await window.screenshot({ path: join(outputDir, 'plants-path-pot.png') });
});
