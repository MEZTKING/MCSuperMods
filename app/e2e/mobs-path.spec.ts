/**
 * The mobs path (ADRs 0070 to 0073; brief B303):
 *
 * 1. Flows and Studio sections, in a blank project: every mob flow of the Creator group "Mobs"
 *    (Pet, Farm animal, Mount, Flying mob, Water mob, Boss and the Custom mob) with its
 *    untouched defaults creates its mob with no problem at all (the lesson of ADR 0069). The
 *    Entity Studio's "Kind of mob" picker on the farm animal changes base and category
 *    together, and one Undo puts both back. Then one edit in each mob section: Kind of mob (the
 *    water mob becomes a water creature), Movement (the flying mob's flying speed), Ranged
 *    attack (the boss shoots, with the ranged goal added from the section), Taming (the pet's
 *    chance), Breeding (the farm animal's baby size), Riding (the mount's jump), Variants (the
 *    pet gets variants; a second one is added and its texture picked, and the preview's variant
 *    switcher lists both) and Boss bar (the boss's colour). "Edit in Creator" on each edited mob
 *    lists it under "Kept your edits", and the Update with another colour keeps every edit in
 *    the saved project.
 * 2. Exports of a Mount project: the vanilla data pack holds the optional saddle tag entry
 *    (`required: false`, ADR 0066). The Fabric mod jar on the default target (26.3, GeckoLib)
 *    nests the runtime and GeckoLib: both come from stubs that replace the main process's
 *    `exports:runtimeJar` and `exports:geckolibJar` handlers (CI builds no runtime jar and the
 *    test never downloads GeckoLib), and the jar holds the stub bytes under `META-INF/jars/`.
 *    After "Upgrade project target" to the snapshot (26.4, no GeckoLib) the dialog shows the
 *    built-in renderer note, GeckoLib is neither asked for nor nested nor depended on, and
 *    "Last export" lists `export.entity-vanilla-renderer`.
 *
 * Target ids and GeckoLib facts come from `@msm/targets`, never from literals here.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { builtInTargets, defaultTargetId, targetById } from '@msm/targets';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp, openDockTab, outputDir, toast } from './fixtures';

/** The project folder name; a blank project's namespace is derived from it. */
const NAMESPACE = 'critters';
const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] as const;
const id = (path: string) => `${NAMESPACE}:${path}`;

/** The mob flows with their Creator titles and the id their default name gives. */
const FLOWS = [
  { flow: 'pet', title: 'Pet', mob: 'ember_fox' },
  { flow: 'farm-animal', title: 'Farm animal', mob: 'moss_boar' },
  { flow: 'mount', title: 'Mount', mob: 'dune_runner' },
  { flow: 'flying-mob', title: 'Flying mob', mob: 'glow_moth' },
  { flow: 'water-mob', title: 'Water mob', mob: 'reef_darter' },
  { flow: 'boss', title: 'Boss', mob: 'iron_tyrant' },
  { flow: 'custom_mob', title: 'Custom mob', mob: 'ruby_golem' },
] as const;

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

/** Opens the Creator from the toolbar and picks `flowId` from the group "Mobs". */
async function openFlow(window: Page, flowId: string): Promise<Locator> {
  await window.getByTestId('toolbar-creator').click();
  const dialog = window.getByTestId('creator-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('creator-group-mobs').getByTestId(`creator-flow-${flowId}`).click();
  return dialog;
}

async function save(window: Page): Promise<void> {
  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
}

type Data = Record<string, unknown> & { components: Record<string, Record<string, unknown>> };

/** The `data` of a saved entity file in the project folder. */
function savedEntity(projectDir: string, path: string): Data {
  const file = join(projectDir, 'content', NAMESPACE, 'entity', `${path}.json`);
  return (JSON.parse(readFileSync(file, 'utf8')) as { data: Data }).data;
}

/** Opens a new blank project in a fresh launch, with the project folder named `NAMESPACE`. */
async function blankProject(prefix: string, args?: readonly string[]) {
  base = mkdtempSync(join(tmpdir(), prefix));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });
  const launched = await launchApp({ reuse: folders, ...(args === undefined ? {} : { args }) });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId(`element-row-${id('pack')}`)).toBeVisible();
  return { launched, window, folders };
}

/** Creates `flow` with its untouched defaults and checks the mob is there with no problem. */
async function createWithDefaults(window: Page, entry: (typeof FLOWS)[number]): Promise<void> {
  const dialog = await openFlow(window, entry.flow);
  await dialog.getByTestId('creator-tab-elements').click();
  await expect(dialog.getByTestId(`creator-element-${id(entry.mob)}`)).toBeVisible();
  await dialog.getByTestId('creator-create').click();
  await expect(dialog).toBeHidden();
  await expect(
    toast(window).filter({
      hasText: new RegExp(`^Create ${entry.title}: \\d+ element\\(s\\) and file\\(s\\) changed`),
    }),
  ).toBeVisible();
  await expect(window.getByTestId(`element-row-${id(entry.mob)}`)).toBeVisible();
  await expectNoProblems(window);
}

/** Opens the Entity Studio of `mob`. */
async function openEntity(window: Page, mob: string): Promise<Locator> {
  await window.getByTestId(`element-row-${id(mob)}`).click();
  const studio = window.getByTestId('entity-studio');
  await expect(studio).toBeVisible();
  await expect(studio.getByTestId('entity-display-name')).not.toHaveValue('');
  return studio;
}

/**
 * "Edit in Creator" on `mob`: it is listed under "Kept your edits" and not ticked to be
 * overwritten; another colour enables the Update, which is applied.
 */
async function reopenKeepsEdits(window: Page, entry: (typeof FLOWS)[number], colour: string) {
  await openEntity(window, entry.mob);
  await window.getByTestId('editor-edit-in-creator').click();
  const edit = window.getByTestId('creator-dialog');
  await expect(edit).toBeVisible();
  await edit.getByTestId('param-colour').fill(colour);
  await edit.getByTestId('creator-tab-elements').click();
  const kept = edit.getByRole('region', { name: 'Kept your edits' });
  await expect(kept).toBeVisible();
  await expect(kept.getByTestId(`creator-kept-${id(entry.mob)}`)).toBeVisible();
  await expect(edit.getByTestId(`creator-overwrite-${id(entry.mob)}`)).not.toBeChecked();
  await edit.getByTestId('creator-create').click();
  await expect(edit).toBeHidden();
  await expect(
    toast(window).filter({
      hasText: new RegExp(`^Update ${entry.title}: \\d+ element\\(s\\) and file\\(s\\) changed`),
    }),
  ).toBeVisible();
}

const flowOf = (flow: (typeof FLOWS)[number]['flow']) => {
  const entry = FLOWS.find((candidate) => candidate.flow === flow);
  if (entry === undefined) throw new Error(`No flow ${flow}.`);
  return entry;
};

test('mobs: every flow creates with its defaults; one edit per Studio section is kept in the Creator', async () => {
  test.setTimeout(300_000);
  const started = Date.now();
  const { window, folders } = await blankProject('msm-mobs-', WEBGL_ARGS);

  // Every mob flow, untouched, creates its mob with no problem at all.
  for (const entry of FLOWS) await createWithDefaults(window, entry);
  await save(window);
  console.log(`mobs-path flows: ${((Date.now() - started) / 1000).toFixed(1)} s`);

  // Kind of mob on the farm animal: base and category change together; one Undo restores both.
  const farm = flowOf('farm-animal');
  let studio = await openEntity(window, farm.mob);
  await expect(studio.getByTestId('entity-base')).toHaveValue('animal');
  await expect(studio.getByTestId('entity-category')).toHaveValue('creature');
  await expect(studio.getByTestId('entity-kind')).toHaveValue('farm_animal');
  await studio.getByTestId('entity-kind').selectOption('monster');
  await expect(studio.getByTestId('entity-base')).toHaveValue('monster');
  await expect(studio.getByTestId('entity-category')).toHaveValue('monster');
  await window.getByTestId('toolbar-undo').click();
  await expect(studio.getByTestId('entity-base')).toHaveValue('animal');
  await expect(studio.getByTestId('entity-category')).toHaveValue('creature');
  await expect(studio.getByTestId('entity-kind')).toHaveValue('farm_animal');

  // Breeding: the farm animal's baby size.
  await studio.getByTestId('entity-baby-scale').fill('0.6');
  await expect(studio.getByTestId('entity-baby-scale')).toHaveValue('0.6');

  // Kind of mob: the water mob becomes a water creature.
  const water = flowOf('water-mob');
  studio = await openEntity(window, water.mob);
  await expect(studio.getByTestId('entity-kind')).toHaveValue('fish');
  await studio.getByTestId('entity-kind').selectOption('water_creature');
  await expect(studio.getByTestId('entity-category')).toHaveValue('water_creature');

  // Movement: the flying mob's flying speed.
  const flyer = flowOf('flying-mob');
  studio = await openEntity(window, flyer.mob);
  await expect(studio.getByTestId('entity-movement-mode')).toHaveValue('fly');
  await studio.getByTestId('entity-flying-speed').fill('0.85');
  await expect(studio.getByTestId('entity-flying-speed')).toHaveValue('0.85');

  // Ranged attack and Boss bar on the boss: it shoots (with the goal added from the section)
  // and its bar turns red.
  const boss = flowOf('boss');
  studio = await openEntity(window, boss.mob);
  const ranged = studio.getByTestId('entity-ranged');
  await expect(ranged.getByTestId('entity-ranged-enabled')).not.toBeChecked();
  await ranged.getByTestId('entity-ranged-enabled').check();
  await expect(ranged.getByTestId('entity-ranged-projectile')).toHaveValue('minecraft:arrow');
  await ranged.getByTestId('entity-ranged-add-goal').click();
  await expect(ranged.getByTestId('entity-ranged-no-goal')).toHaveCount(0);
  await ranged.getByTestId('entity-ranged-range').fill('20');
  await expect(ranged.getByTestId('entity-ranged-range')).toHaveValue('20');
  await expect(studio.getByTestId('entity-boss-bar-enabled')).toBeChecked();
  await studio.getByTestId('entity-boss-bar-colour').selectOption('red');
  await expect(studio.getByTestId('entity-boss-bar-colour')).toHaveValue('red');

  // Riding: the mount's jump strength.
  const mount = flowOf('mount');
  studio = await openEntity(window, mount.mob);
  await expect(studio.getByTestId('entity-rideable')).toBeChecked();
  await studio.getByTestId('entity-riding-jump').fill('1.2');
  await expect(studio.getByTestId('entity-riding-jump')).toHaveValue('1.2');

  // Taming and Variants on the pet: a higher chance; variants on, a second one added with the
  // mount's skin picked as its texture.
  const pet = flowOf('pet');
  studio = await openEntity(window, pet.mob);
  await expect(studio.getByTestId('entity-tameable')).toBeChecked();
  await studio.getByTestId('entity-taming-chance').fill('0.5');
  await expect(studio.getByTestId('entity-taming-chance')).toHaveValue('0.5');
  const variants = studio.getByTestId('entity-variants');
  await expect(variants.getByTestId('entity-variants-enabled')).not.toBeChecked();
  await variants.getByTestId('entity-variants-enabled').check();
  await expect(variants.getByTestId('entity-variant-0-id')).toHaveValue('variant_1');
  await expect(variants.getByTestId('entity-variant-0-texture')).toHaveValue(
    id(`entity/${pet.mob}`),
  );
  await variants.getByTestId('entity-add-variant').click();
  await expect(variants.getByTestId('entity-variant-1-id')).toHaveValue('variant_2');
  await variants.getByTestId('entity-variant-1-texture').selectOption(id(`entity/${mount.mob}`));
  await expect(variants.getByTestId('entity-variant-1-texture')).toHaveValue(
    id(`entity/${mount.mob}`),
  );
  // The preview's variant switcher lists both.
  const preview = window.getByTestId('editor-preview');
  const switcher = preview.getByTestId('preview-entity-variant');
  await expect(switcher).toBeVisible({ timeout: 15_000 });
  await expect(switcher.locator('option')).toHaveText(['(base texture)', 'variant_1', 'variant_2']);
  await switcher.selectOption('variant_2');
  await expect(switcher).toHaveValue('variant_2');
  await expect(preview.getByTestId('preview-entity-baby')).toBeVisible();

  await expectNoErrors(window);
  await save(window);

  // Each edited mob is kept when its set is reopened in the Creator and updated.
  const reopened = [pet, farm, mount, flyer, water, boss];
  for (const [index, entry] of reopened.entries()) {
    await reopenKeepsEdits(window, entry, `#${(0x204060 + index * 0x101010).toString(16)}`);
  }
  await expectNoErrors(window);
  await save(window);

  const petData = savedEntity(folders.projectDir, pet.mob);
  expect(petData.components['msm:tameable']?.chance).toBe(0.5);
  expect(petData.components['msm:variants']?.variants).toEqual([
    { id: 'variant_1', texture: id(`entity/${pet.mob}`) },
    { id: 'variant_2', texture: id(`entity/${mount.mob}`) },
  ]);
  const farmData = savedEntity(folders.projectDir, farm.mob);
  expect(farmData.base).toBe('animal');
  expect(farmData.category).toBe('creature');
  expect(farmData.components['msm:breedable']?.baby_scale).toBe(0.6);
  const waterData = savedEntity(folders.projectDir, water.mob);
  expect(waterData.category).toBe('water_creature');
  expect(waterData.components['msm:movement']?.mode).toBe('swim');
  expect(savedEntity(folders.projectDir, flyer.mob).components['msm:movement']?.flying_speed).toBe(
    0.85,
  );
  const bossData = savedEntity(folders.projectDir, boss.mob);
  expect(bossData.components['msm:ranged_attack']).toMatchObject({
    projectile: 'minecraft:arrow',
    range: 20,
  });
  const bossGoals = bossData.components['msm:ai_goals']?.goals as { type: string }[];
  expect(bossGoals.map((goal) => goal.type)).toContain('ranged_attack');
  expect(bossData.components['msm:boss_bar']?.colour).toBe('red');
  expect(savedEntity(folders.projectDir, mount.mob).components['msm:rideable']?.jump).toBe(1.2);

  await window.screenshot({ path: join(outputDir, 'mobs-path.png') });
  console.log(`mobs-path flows and sections: ${((Date.now() - started) / 1000).toFixed(1)} s`);
});

test('mobs: Mount exports: optional saddle entry, jar with nested GeckoLib on 26.3, none on 26.4', async () => {
  test.setTimeout(150_000);
  const release = targetById(defaultTargetId)?.target;
  if (release === undefined) throw new Error('No default target.');
  const geckolib = release.geckolib;
  if (geckolib === undefined) throw new Error(`${release.id} has no GeckoLib facts.`);
  const snapshot = builtInTargets.find((entry) => entry.target.channel === 'snapshot')?.target;
  if (snapshot === undefined) throw new Error('No built-in snapshot target.');
  expect(snapshot.geckolib).toBeUndefined();

  const { launched, window, folders } = await blankProject('msm-mobs-export-');
  const mount = flowOf('mount');

  // Stub jars in place of the main process's runtime and GeckoLib services.
  const runtimeStub = zipSync({ 'fabric.mod.json': strToU8('{"id":"msm_runtime"}') });
  const geckolibStub = zipSync({ 'fabric.mod.json': strToU8('{"id":"geckolib"}') });
  await launched.app.evaluate(
    ({ ipcMain }, stubs) => {
      const asked: { runtime: string[]; geckolib: string[] } = { runtime: [], geckolib: [] };
      (globalThis as { msmE2eJarStubs?: typeof asked }).msmE2eJarStubs = asked;
      const serve = (channel: string, key: 'runtime' | 'geckolib', base64: string) => {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, request: { targetId: string }) => {
          asked[key].push(request.targetId);
          return new Uint8Array(Buffer.from(base64, 'base64'));
        });
      };
      serve('msm:v1:exports:runtimeJar', 'runtime', stubs.runtime);
      serve('msm:v1:exports:geckolibJar', 'geckolib', stubs.geckolib);
    },
    {
      runtime: Buffer.from(runtimeStub).toString('base64'),
      geckolib: Buffer.from(geckolibStub).toString('base64'),
    },
  );
  const asked = () =>
    launched.app.evaluate(
      () =>
        (globalThis as { msmE2eJarStubs?: { runtime: string[]; geckolib: string[] } })
          .msmE2eJarStubs ?? { runtime: [], geckolib: [] },
    );

  await createWithDefaults(window, mount);
  await save(window);

  // The vanilla data pack: the saddle tag lists the mount as optional (ADR 0066).
  await window.getByTestId('toolbar-export-menu').click();
  await window.getByTestId('export-data-zip').click();
  const data = await newZip(folders.outDir, '.zip');
  const saddle = zipJson<{ values: unknown[] }>(
    data.files,
    'data/minecraft/tags/entity_type/can_equip_saddle.json',
  );
  expect(saddle.values).toEqual([{ id: id(mount.mob), required: false }]);
  expect(Object.keys(data.files).some((name) => name.startsWith('msm/'))).toBe(false);

  // The Fabric mod jar on the default target nests the runtime and GeckoLib.
  let palette = await openPalette(window, 'fabric mod jar');
  await palette.getByTestId('command-exportFabricJar').click();
  await expect(palette).toBeHidden();
  let dialog = window.getByTestId('fabric-jar-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('fabric-jar-geckolib-note')).toBeVisible();
  await expect(dialog.getByTestId('fabric-jar-vanilla-renderer-note')).toHaveCount(0);
  await expect(dialog.getByTestId('exporter-option-separateRuntime')).not.toBeChecked();
  await dialog.getByTestId('fabric-jar-dialog-submit').click();
  await expect(dialog).toBeHidden();
  const jar = await newZip(folders.outDir, '.jar');
  await expect(toast(window)).toContainText('Exported the Fabric mod jar to');
  const nestedGeckolib = `META-INF/jars/${geckolib.fileName}`;
  expect(jar.files[nestedGeckolib]).toEqual(geckolibStub);
  const nestedRuntime = Object.keys(jar.files).filter(
    (name) => name.startsWith('META-INF/jars/msm_runtime-') && name.endsWith('.jar'),
  );
  expect(nestedRuntime).toHaveLength(1);
  expect(jar.files[nestedRuntime[0] as string]).toEqual(runtimeStub);
  const modJson = zipJson<{ depends?: Record<string, string>; jars?: { file: string }[] }>(
    jar.files,
    'fabric.mod.json',
  );
  expect(Object.keys(modJson.depends ?? {})).toContain(geckolib.modId);
  expect((modJson.jars ?? []).map((entry) => entry.file).sort()).toEqual(
    [nestedGeckolib, nestedRuntime[0]].sort(),
  );
  expect(jar.files[`msm/${NAMESPACE}/entity/${mount.mob}.json`]).toBeDefined();
  expect(jar.files['data/minecraft/tags/entity_type/can_equip_saddle.json']).toBeDefined();
  expect(await asked()).toEqual({ runtime: [release.id], geckolib: [release.id] });

  // Upgrade to the snapshot target, which has no GeckoLib.
  palette = await openPalette(window, 'upgrade project target');
  await palette.getByTestId('command-upgradeTarget').click();
  await expect(palette).toBeHidden();
  const upgrade = window.getByTestId('upgrade-target-dialog');
  await expect(upgrade).toBeVisible();
  await upgrade.getByTestId(`upgrade-target-${snapshot.id}`).click();
  await upgrade.getByTestId('upgrade-target-dialog-submit').click();
  await expect(upgrade).toBeHidden();
  await expect(toast(window)).toContainText(`Project target changed to ${snapshot.id}.`);
  await expect(window.getByTestId('project-target')).toContainText(snapshot.id);
  await expectNoErrors(window);

  // The Entity Studio says the built-in renderer draws the mob there.
  const studio = await openEntity(window, mount.mob);
  await expect(studio.getByTestId('entity-renderer')).toHaveValue('auto');
  await expect(studio.getByTestId('entity-renderer-note')).toContainText(
    `${snapshot.mcVersion} has no GeckoLib`,
  );

  // The Fabric mod jar on the snapshot: the renderer note, no GeckoLib, the info under
  // "Last export".
  palette = await openPalette(window, 'fabric mod jar');
  await palette.getByTestId('command-exportFabricJar').click();
  await expect(palette).toBeHidden();
  dialog = window.getByTestId('fabric-jar-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('fabric-jar-vanilla-renderer-note')).toBeVisible();
  await expect(dialog.getByTestId('fabric-jar-geckolib-note')).toHaveCount(0);
  // The jar keeps its name on every target: move the first one out of the way.
  rmSync(join(folders.outDir, jar.name));
  await dialog.getByTestId('fabric-jar-dialog-submit').click();
  await expect(dialog).toBeHidden();
  const snapshotJar = await newZip(folders.outDir, '.jar');
  expect(snapshotJar.name).toBe(jar.name);
  const snapshotNames = Object.keys(snapshotJar.files);
  expect(snapshotNames.filter((name) => name.startsWith('META-INF/jars/'))).toHaveLength(1);
  // Only the runtime is nested (the model files keep GeckoLib's resource folders).
  expect(snapshotNames.filter((name) => name.startsWith('META-INF/jars/'))).toEqual(nestedRuntime);
  expect(snapshotNames).toContain(
    `assets/${NAMESPACE}/geckolib/models/entity/${mount.mob}.geo.json`,
  );
  const snapshotModJson = zipJson<{ depends?: Record<string, string> }>(
    snapshotJar.files,
    'fabric.mod.json',
  );
  expect(Object.keys(snapshotModJson.depends ?? {})).not.toContain(geckolib.modId);
  expect(snapshotJar.files[`msm/${NAMESPACE}/entity/${mount.mob}.json`]).toBeDefined();
  expect(await asked()).toEqual({
    runtime: [release.id, snapshot.id],
    geckolib: [release.id],
  });
  await openDockTab(window, 'problems');
  const info = window
    .getByTestId('export-problems')
    .locator('[data-testid="problem-row"][data-code="export.entity-vanilla-renderer"]');
  await expect(info).toHaveCount(1);
  await expect(info).toContainText(id(mount.mob));
  await window.screenshot({ path: join(outputDir, 'mobs-path-exports.png') });
  await save(window);
});
