/**
 * The containers and machines path (ADRs 0074 to 0076; brief B324), in blank projects:
 *
 * 1. Storage: the Creator flow "Storage crate" with its untouched defaults creates the crate
 *    (`msm:container`, a chest of three rows) with no problem at all. Then one edit per storage
 *    field of the Block Studio's Inventory section: on the default crate the layout (no
 *    screen), the slots, hoppers, comparators, both sounds and both events (an event added in
 *    the Events editor); on a second, small crate (one row) the rows (three) and "Keep contents
 *    when broken". "Edit in Creator" on each crate lists it under "Kept your edits", and the
 *    Update with another colour keeps the element's data exactly as edited.
 * 2. Machines and exports: the flow "Machine" with its untouched defaults creates the grinder
 *    (`msm:machine`, three recipes of its own) with no problem at all. "Holds items" switched to
 *    Storage drops the machine, its recipes and its working front, and one Undo puts them all
 *    back. Then one edit per machine field (recipe types, power, speed, default time, screen,
 *    comparator, light while working, hoppers, both events) and the Recipes table: a row added
 *    and every field of it filled (seconds shown, ticks saved), then the first row removed.
 *    "Edit in Creator" keeps the grinder as edited. The Fabric mod jar on the default target
 *    (26.3) and, after "Upgrade project target", on the snapshot (26.4) holds the machine's
 *    definition and its recipe files; the vanilla data pack leaves the machine recipes, the
 *    crafting recipe and the block's loot table out with `export.mod-only-reference` under
 *    "Last export" (grouped per element).
 *
 * The Creator's display names are asserted only in the toasts (the flow titles); otherwise ids
 * and test ids. Target ids come from `@msm/targets`.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { builtInTargets, defaultTargetId, targetById } from '@msm/targets';
import { strFromU8, unzipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp, openDockTab, outputDir, toast } from './fixtures';

/** The project folder name; a blank project's namespace is derived from it. */
const NAMESPACE = 'works';
const id = (path: string) => `${NAMESPACE}:${path}`;

/** The flows of the Creator group "Blocks" this path uses, with their titles. */
const CRATE = { flow: 'storage-crate', title: 'Storage crate' } as const;
const MACHINE = { flow: 'machine', title: 'Machine' } as const;

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

/** The Problems panel's rows (opens the panel); `severity` narrows them. */
async function problemRows(window: Page, severity?: 'error'): Promise<Locator> {
  await openDockTab(window, 'problems');
  const problems = window.getByTestId('problems-panel');
  await expect(problems).toBeVisible();
  return problems.locator(
    severity === undefined
      ? '[data-testid="problem-row"]'
      : `[data-testid="problem-row"][data-severity="${severity}"]`,
  );
}

/** No problem of any severity, and the status bar agrees. */
async function expectNoProblems(window: Page): Promise<void> {
  await expect(await problemRows(window)).toHaveCount(0);
  await expect(window.locator('footer').getByText(/^0 error\(s\)/)).toBeVisible();
}

async function expectNoErrors(window: Page): Promise<void> {
  await expect(await problemRows(window, 'error')).toHaveCount(0);
  await expect(window.locator('footer').getByText(/^0 error\(s\)/)).toBeVisible();
}

/** Opens the Creator from the toolbar and picks `flowId` from the group "Blocks". */
async function openFlow(window: Page, flowId: string): Promise<Locator> {
  await window.getByTestId('toolbar-creator').click();
  const dialog = window.getByTestId('creator-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('creator-group-blocks').getByTestId(`creator-flow-${flowId}`).click();
  return dialog;
}

/** Applies the open Creator dialog and waits for its toast. */
async function applyCreator(
  window: Page,
  dialog: Locator,
  verb: 'Create' | 'Update',
  title: string,
): Promise<void> {
  await dialog.getByTestId('creator-create').click();
  await expect(dialog).toBeHidden();
  await expect(
    toast(window).filter({
      hasText: new RegExp(`^${verb} ${title}: \\d+ element\\(s\\) and file\\(s\\) changed`),
    }),
  ).toBeVisible();
}

async function save(window: Page): Promise<void> {
  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
}

type Data = Record<string, unknown> & {
  components: Record<string, Record<string, unknown>>;
  textures?: Record<string, string>;
  recipes?: Record<string, unknown>[];
};

/** The `data` of a saved block file in the project folder. */
function savedBlock(projectDir: string, path: string): Data {
  const file = join(projectDir, 'content', NAMESPACE, 'block', `${path}.json`);
  return (JSON.parse(readFileSync(file, 'utf8')) as { data: Data }).data;
}

/** Types `value` into an id field and commits it with Enter. */
async function commitId(field: Locator, value: string): Promise<void> {
  await field.fill(value);
  await field.press('Enter');
  await expect(field).toHaveValue(value);
}

/** Opens a new blank project in a fresh launch, with the project folder named `NAMESPACE`. */
async function blankProject(prefix: string) {
  base = mkdtempSync(join(tmpdir(), prefix));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });
  const launched = await launchApp({ reuse: folders });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId(`element-row-${id('pack')}`)).toBeVisible();
  return { window, folders };
}

/** Opens the Block Studio of `block` and waits for its (lazy) Inventory section. */
async function openInventory(window: Page, block: string): Promise<Locator> {
  await window.getByTestId(`element-row-${id(block)}`).click();
  const studio = window.getByTestId('block-studio');
  await expect(studio).toBeVisible();
  const inventory = studio.getByTestId('block-inventory');
  await expect(inventory).toBeVisible();
  return studio;
}

/** Adds event `name` with a play_sound action in the Block Studio's Events editor. */
async function addSoundEvent(studio: Locator, name: string, sound: string): Promise<void> {
  const events = studio.getByTestId('msm-events');
  await events.getByLabel('New event id').fill(name);
  await events.getByRole('button', { name: 'Add event' }).click();
  const event = events.getByTestId(`msm-event-${name}`);
  await expect(event).toBeVisible();
  await expect(event.getByLabel(`New action type for ${name}`)).toHaveValue('play_sound');
  await event.getByRole('button', { name: `Add action to ${name}` }).click();
  const action = event.getByTestId('msm-action-0');
  await expect(action).toBeVisible();
  const field = action.getByLabel(`${name} action 1 sound`, { exact: true });
  await commitId(field, sound);
}

/**
 * "Edit in Creator" on `block`: another colour enables the Update; the block is listed under
 * "Kept your edits" and not ticked to be overwritten, and the Update leaves its data as it was.
 */
async function reopenKeepsEdits(
  window: Page,
  projectDir: string,
  block: string,
  title: string,
  colour: string,
): Promise<void> {
  await save(window);
  const before = savedBlock(projectDir, block);
  await window.getByTestId(`element-row-${id(block)}`).click();
  await window.getByTestId('editor-edit-in-creator').click();
  const edit = window.getByTestId('creator-dialog');
  await expect(edit).toBeVisible();
  await edit.getByTestId('param-colour').fill(colour);
  await edit.getByTestId('creator-tab-elements').click();
  const kept = edit.getByRole('region', { name: 'Kept your edits' });
  await expect(kept).toBeVisible();
  await expect(kept.getByTestId(`creator-kept-${id(block)}`)).toBeVisible();
  await expect(edit.getByTestId(`creator-overwrite-${id(block)}`)).not.toBeChecked();
  await applyCreator(window, edit, 'Update', title);
  await save(window);
  expect(savedBlock(projectDir, block)).toEqual(before);
}

test('machines: Storage crate defaults; one edit per storage field kept on Creator reopen', async () => {
  const started = Date.now();
  const { window, folders } = await blankProject('msm-machines-storage-');

  // The flow with its untouched defaults: a chest of three rows, no problem at all.
  let dialog = await openFlow(window, CRATE.flow);
  await expect(dialog.getByTestId('param-crate_name')).toHaveValue('Supply Crate');
  await expect(dialog.getByTestId('param-size')).toHaveValue('medium');
  await dialog.getByTestId('creator-tab-elements').click();
  await expect(dialog.getByTestId(`creator-element-${id('supply_crate')}`)).toBeVisible();
  await applyCreator(window, dialog, 'Create', CRATE.title);
  await expect(window.getByTestId(`element-row-${id('supply_crate')}`)).toBeVisible();
  await expect(window.getByTestId(`element-row-${id('supply_crate_from_chest')}`)).toBeVisible();
  await expectNoProblems(window);
  await save(window);
  expect(savedBlock(folders.projectDir, 'supply_crate').components['msm:container']).toEqual({
    layout: 'chest',
    rows: 3,
  });

  // A second crate, small (one row), for the rows and "Keep contents when broken".
  dialog = await openFlow(window, CRATE.flow);
  await dialog.getByTestId('param-crate_name').fill('Seed Bin');
  await dialog.getByTestId('param-size').selectOption('small');
  await applyCreator(window, dialog, 'Create', CRATE.title);
  await expect(window.getByTestId(`element-row-${id('seed_bin')}`)).toBeVisible();
  await expectNoProblems(window);

  // The default crate's Inventory section: one edit per field.
  let studio = await openInventory(window, 'supply_crate');
  await expect(studio.getByTestId('block-inventory-holds')).toHaveValue('storage');
  await addSoundEvent(studio, 'crate_opened', 'minecraft:block.barrel.open');
  await addSoundEvent(studio, 'crate_closed', 'minecraft:block.barrel.close');
  const layout = studio.getByTestId('block-container-layout');
  await expect(layout).toHaveValue('chest');
  await expect(studio.getByTestId('block-container-rows')).toHaveValue('3');
  await expect(studio.getByTestId('block-container-size')).toHaveCount(0);
  await layout.selectOption('none');
  await expect(studio.getByTestId('block-container-rows')).toHaveCount(0);
  await expect(studio.getByTestId('block-container-keep-contents')).toHaveCount(0);
  const size = studio.getByTestId('block-container-size');
  await expect(size).toHaveValue('1');
  await size.fill('4');
  await expect(size).toHaveValue('4');
  await studio.getByTestId('block-container-hoppers').uncheck();
  await studio.getByTestId('block-container-comparator').uncheck();
  await commitId(studio.getByTestId('block-container-open-sound'), 'minecraft:block.chest.open');
  await commitId(studio.getByTestId('block-container-close-sound'), 'minecraft:block.chest.close');
  await studio.getByTestId('block-container-on-open').selectOption('crate_opened');
  await studio.getByTestId('block-container-on-close').selectOption('crate_closed');
  await expectNoErrors(window);
  await save(window);
  expect(savedBlock(folders.projectDir, 'supply_crate').components['msm:container']).toEqual({
    layout: 'none',
    size: 4,
    hoppers: false,
    comparator: false,
    open_sound: 'minecraft:block.chest.open',
    close_sound: 'minecraft:block.chest.close',
    on_open: 'crate_opened',
    on_close: 'crate_closed',
  });

  // The small crate: three rows, then "Keep contents when broken" (offered for three only).
  studio = await openInventory(window, 'seed_bin');
  const rows = studio.getByTestId('block-container-rows');
  await expect(rows).toHaveValue('1');
  await expect(studio.getByTestId('block-container-keep-contents')).toHaveCount(0);
  await rows.fill('3');
  await expect(rows).toHaveValue('3');
  const keep = studio.getByTestId('block-container-keep-contents');
  await expect(keep).not.toBeChecked();
  await keep.check();
  await expect(keep).toBeChecked();
  await expectNoErrors(window);
  await save(window);
  expect(savedBlock(folders.projectDir, 'seed_bin').components['msm:container']).toEqual({
    layout: 'chest',
    rows: 3,
    keep_contents: true,
  });

  // "Edit in Creator" keeps both crates as edited.
  await reopenKeepsEdits(window, folders.projectDir, 'supply_crate', CRATE.title, '#6a4a2a');
  await reopenKeepsEdits(window, folders.projectDir, 'seed_bin', CRATE.title, '#4a6a2a');
  await expectNoErrors(window);
  await window.screenshot({ path: join(outputDir, 'machines-path-storage.png') });
  console.log(`machines-path storage: ${((Date.now() - started) / 1000).toFixed(1)} s`);
});

test('machines: Machine defaults, Holds items undo, machine fields and recipes, exports on both targets', async () => {
  test.setTimeout(120_000);
  const started = Date.now();
  const release = targetById(defaultTargetId)?.target;
  if (release === undefined) throw new Error('No default target.');
  const snapshot = builtInTargets.find((entry) => entry.target.channel === 'snapshot')?.target;
  if (snapshot === undefined) throw new Error('No built-in snapshot target.');
  const { window, folders } = await blankProject('msm-machines-machine-');

  // The flow with its untouched defaults: the grinder with three recipes, no problem at all.
  const dialog = await openFlow(window, MACHINE.flow);
  await expect(dialog.getByTestId('param-machine_name')).toHaveValue('Grinder');
  await dialog.getByTestId('creator-tab-elements').click();
  await expect(dialog.getByTestId(`creator-element-${id('grinder')}`)).toBeVisible();
  await applyCreator(window, dialog, 'Create', MACHINE.title);
  await expect(window.getByTestId(`element-row-${id('grinder')}`)).toBeVisible();
  await expect(window.getByTestId(`element-row-${id('grinder_from_furnace')}`)).toBeVisible();
  await expectNoProblems(window);
  await save(window);
  const created = savedBlock(folders.projectDir, 'grinder');
  expect(created.components['msm:machine']).toEqual({});
  expect(created.recipes).toHaveLength(3);
  expect(created.textures?.front_lit).toBe(id('block/grinder_front_lit'));

  // "Holds items": Storage drops the machine, its recipes and its working front; one Undo.
  const studio = await openInventory(window, 'grinder');
  const holds = studio.getByTestId('block-inventory-holds');
  await expect(holds).toHaveValue('machine');
  await expect(studio.getByTestId('block-machine-recipe-2')).toBeVisible();
  await holds.selectOption('storage');
  await expect(holds).toHaveValue('storage');
  await expect(studio.getByTestId('block-container-layout')).toBeVisible();
  await expect(studio.getByTestId('block-machine-recipes')).toHaveCount(0);
  await save(window);
  const switched = savedBlock(folders.projectDir, 'grinder');
  expect(switched.components['msm:container']).toEqual({});
  expect(switched.components['msm:machine']).toBeUndefined();
  expect(switched.recipes).toBeUndefined();
  expect(switched.textures?.front_lit).toBeUndefined();
  await window.getByTestId('toolbar-undo').click();
  await expect(holds).toHaveValue('machine');
  await expect(studio.getByTestId('block-machine-recipe-2')).toBeVisible();
  await save(window);
  expect(savedBlock(folders.projectDir, 'grinder')).toEqual(created);

  // One edit per machine field.
  await addSoundEvent(studio, 'grinder_started', 'minecraft:block.grindstone.use');
  await addSoundEvent(studio, 'grinder_finished', 'minecraft:entity.item.pickup');
  const own = studio.getByTestId('block-machine-type-own');
  await expect(own).toBeChecked();
  const smelting = studio.getByTestId('block-machine-type-smelting');
  await expect(smelting).not.toBeChecked();
  await smelting.check();
  await expect(smelting).toBeChecked();
  await studio.getByTestId('block-machine-power').selectOption('redstone');
  const speed = studio.getByTestId('block-machine-speed');
  await expect(speed).toHaveValue('1');
  await speed.fill('2');
  // Seconds shown, ticks saved: 10 seconds is 200 ticks.
  const defaultTime = studio.getByTestId('block-machine-default-time');
  await expect(defaultTime).toHaveValue('10');
  await defaultTime.fill('5');
  await studio.getByTestId('block-machine-menu').selectOption('blast_furnace');
  await studio.getByTestId('block-machine-comparator').selectOption('progress');
  const light = studio.getByTestId('block-machine-lit-light');
  await expect(light).toHaveValue('13');
  await light.fill('7');
  await studio.getByTestId('block-machine-hoppers').uncheck();
  await studio.getByTestId('block-machine-on-start').selectOption('grinder_started');
  await studio.getByTestId('block-machine-on-finish').selectOption('grinder_finished');

  // The Recipes table: a row added and filled, then the first row removed.
  await studio.getByTestId('block-machine-recipe-add').click();
  const row = 'block-machine-recipe-3';
  await expect(studio.getByTestId(row)).toBeVisible();
  await commitId(studio.getByTestId(`${row}-ingredient`), 'minecraft:raw_iron');
  await studio.getByTestId(`${row}-count`).fill('2');
  await commitId(studio.getByTestId(`${row}-result`), 'minecraft:iron_nugget');
  await studio.getByTestId(`${row}-result-count`).fill('3');
  await studio.getByTestId(`${row}-time`).fill('4');
  await studio.getByTestId(`${row}-experience`).fill('0.5');
  await expectNoErrors(window);
  await save(window);
  const filled = savedBlock(folders.projectDir, 'grinder').recipes;
  expect(filled).toHaveLength(4);
  const added = {
    ingredient: 'minecraft:raw_iron',
    count: 2,
    result: { id: 'minecraft:iron_nugget', count: 3 },
    time: 80,
    experience: 0.5,
  };
  expect(filled?.[3]).toEqual(added);
  await expect(studio.getByTestId('block-machine-recipe-0-ingredient')).toHaveValue(
    'minecraft:cobblestone',
  );
  await studio.getByTestId('block-machine-recipe-0-remove').click();
  await expect(studio.getByTestId(row)).toHaveCount(0);
  await expect(studio.getByTestId('block-machine-recipe-0-ingredient')).toHaveValue(
    'minecraft:gravel',
  );
  await expect(studio.getByTestId('block-machine-recipe-2-ingredient')).toHaveValue(
    'minecraft:raw_iron',
  );
  await expect(studio.getByTestId('block-machine-recipe-2-time')).toHaveValue('4');
  await expectNoErrors(window);
  await save(window);
  const edited = savedBlock(folders.projectDir, 'grinder');
  expect(edited.components['msm:machine']).toEqual({
    recipe_types: [id('grinder'), 'minecraft:smelting'],
    power: 'redstone',
    speed: 2,
    default_time: 100,
    menu: 'blast_furnace',
    comparator: 'progress',
    lit_light: 7,
    hoppers: false,
    on_start: 'grinder_started',
    on_finish: 'grinder_finished',
  });
  expect(edited.recipes).toEqual([created.recipes?.[1], created.recipes?.[2], added]);

  // "Edit in Creator" keeps the grinder as edited.
  await reopenKeepsEdits(window, folders.projectDir, 'grinder', MACHINE.title, '#5a5a7a');
  await expectNoErrors(window);
  console.log(`machines-path edits: ${((Date.now() - started) / 1000).toFixed(1)} s`);

  // The vanilla data pack: written, without the machine recipes or the crafting recipe.
  await window.getByTestId('toolbar-export-menu').click();
  await window.getByTestId('export-data-zip').click();
  const data = await newZip(folders.outDir, '.zip');
  const dataNames = Object.keys(data.files);
  expect(dataNames).toContain('pack.mcmeta');
  expect(dataNames.filter((name) => name.startsWith(`data/${NAMESPACE}/recipe/`))).toEqual([]);
  expect(dataNames.some((name) => name.startsWith('msm/'))).toBe(false);
  await openDockTab(window, 'problems');
  const modOnly = window
    .getByTestId('export-problems')
    .locator('[data-testid="problem-row"][data-code="export.mod-only-reference"]');
  // Warnings are grouped per element: the grinder's names its loot table and three more files
  // (its three recipes); the crafting recipe has its own.
  await expect(modOnly).toHaveCount(2);
  await expect(modOnly.filter({ hasText: id('grinder_from_furnace') })).toContainText(
    `data/${NAMESPACE}/recipe/grinder_from_furnace.json`,
  );
  await expect(modOnly.filter({ hasNotText: 'grinder_from_furnace' })).toContainText(
    `data/${NAMESPACE}/loot_table/blocks/grinder.json (and 3 other files)`,
  );
  expect(dataNames).not.toContain(`data/${NAMESPACE}/loot_table/blocks/grinder.json`);

  // The Fabric mod jar on each target: the machine and its recipe files.
  let known: string[] = [];
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
    // The jar keeps its name on every target: move the earlier one out of the way.
    for (const name of known) rmSync(join(folders.outDir, name));
    const palette = await openPalette(window, 'fabric mod jar');
    await palette.getByTestId('command-exportFabricJar').click();
    await expect(palette).toBeHidden();
    const jarDialog = window.getByTestId('fabric-jar-dialog');
    await expect(jarDialog).toBeVisible();
    // CI's `ci` job builds no runtime jar to nest.
    await jarDialog.getByTestId('exporter-option-separateRuntime').check();
    await jarDialog.getByTestId('fabric-jar-dialog-submit').click();
    await expect(jarDialog).toBeHidden();
    const jar = await newZip(folders.outDir, '.jar');
    known = [jar.name];
    expect(jar.name).toBe(`${NAMESPACE}.jar`);
    const names = Object.keys(jar.files);
    const definition = zipJson<{ type: string; components: Record<string, unknown> }>(
      jar.files,
      `msm/${NAMESPACE}/block/grinder.json`,
    );
    expect(definition.type).toBe('horizontal');
    expect(definition.components['msm:machine']).toEqual(edited.components['msm:machine']);
    expect(definition).not.toHaveProperty('recipes');
    expect(names).toEqual(
      expect.arrayContaining([
        `assets/${NAMESPACE}/blockstates/grinder.json`,
        `assets/${NAMESPACE}/models/block/grinder_lit.json`,
        `data/${NAMESPACE}/recipe/grinder_from_furnace.json`,
      ]),
    );
    const recipeFiles = names
      .filter((name) => name.startsWith(`data/${NAMESPACE}/recipe/grinder/`))
      .sort();
    expect(recipeFiles).toEqual(
      ['bone_meal', 'flint', 'iron_nugget'].map(
        (name) => `data/${NAMESPACE}/recipe/grinder/${name}.json`,
      ),
    );
    expect(
      zipJson<Record<string, unknown>>(
        jar.files,
        `data/${NAMESPACE}/recipe/grinder/iron_nugget.json`,
      ),
    ).toEqual({ type: id('grinder'), ...added });
    console.log(
      `machines-path jar on ${target.id}: ${((Date.now() - started) / 1000).toFixed(1)} s`,
    );
  }
  await window.screenshot({ path: join(outputDir, 'machines-path-machine.png') });
  await save(window);
});
