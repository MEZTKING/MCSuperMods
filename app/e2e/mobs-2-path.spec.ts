/**
 * The fish bucket, hovering mob and boats path (ADRs 0109 and 0110, ADR 0112 D1, D2; brief
 * B542), in a blank project under SwiftShader WebGL:
 *
 * 1. The Creator: the Water mob flow with "Can be caught in a bucket" and "Plays dead when badly
 *    hurt" makes the Reef Darter, the Flying mob flow with "Hovers" the Mist Wisp, and the Wood
 *    set flow with "Has boats" the Willow set with its boat and chest boat; no problem at all.
 * 2. The Mob Studio: the darter's Bucket section (a water bucket takes it; the bucket named) and
 *    its "Plays dead" habit; moving it to walking says a bucket needs a swimmer, and Undo takes
 *    that back. The wisp moves by hovering, at a hover height typed in.
 * 3. The Item Studio's Boat section on the willow boat: a boat with a chest boat, its pictures
 *    already where the game reads them; the chest boat named; "Has a chest boat" off hides the
 *    chest boat's pictures and Undo brings them back.
 * 4. Try it: the darter's bucket lets a darter out with its water, and a water bucket catches it
 *    again (What happened says both).
 * 5. Saved, then the Fabric mod jar on the default target: the darter's `msm:bucketable` and its
 *    bucket item with the name, the wisp's hover movement, and the boat's definition, recipes,
 *    tags, chest boat item and the two pictures the game draws the boats with.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp, openDockTab, outputDir, toast } from './fixtures';

/** The project folder name; a blank project's namespace is derived from it. */
const NAMESPACE = 'harbour';
const id = (path: string) => `${NAMESPACE}:${path}`;
const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] as const;
const DARTER = 'reef_darter';
const WISP = 'mist_wisp';
const BOAT = 'willow_boat';
const CHEST_BOAT = 'willow_chest_boat';

let base: string | undefined;
let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

/** No problem of any severity in the Problems panel (opened), and the status bar agrees. */
async function expectNoProblems(window: Page): Promise<void> {
  await openDockTab(window, 'problems');
  const problems = window.getByTestId('problems-panel');
  await expect(problems).toBeVisible();
  await expect(problems.locator('[data-testid="problem-row"]')).toHaveCount(0);
  await expect(window.locator('footer').getByText(/^0 error\(s\)/)).toBeVisible();
}

/** Opens the Creator from the toolbar on `flowId`, sets its answers and applies it. */
async function runFlow(
  window: Page,
  flowId: string,
  title: string,
  answer: (dialog: Locator) => Promise<void>,
): Promise<void> {
  await window.getByTestId('toolbar-creator').click();
  const dialog = window.getByTestId('creator-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId(`creator-flow-${flowId}`).click();
  await answer(dialog);
  const create = dialog.getByTestId('creator-create');
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  await expect(
    toast(window).filter({
      hasText: new RegExp(`^Create ${title}: \\d+ element\\(s\\) and file\\(s\\) changed`),
    }),
  ).toBeVisible();
}

type Data = { components: Record<string, Record<string, unknown>> } & Record<string, unknown>;

/** The `data` of a saved element file in the project folder. */
function savedData(projectDir: string, folder: string, path: string): Data {
  const file = join(projectDir, 'content', NAMESPACE, folder, `${path}.json`);
  return (JSON.parse(readFileSync(file, 'utf8')) as { data: Data }).data;
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

/** A JSON file of an exported zip. */
function zipJson<T>(files: Record<string, Uint8Array>, path: string): T {
  const bytes = files[path];
  if (bytes === undefined) throw new Error(`${path} is missing from the export.`);
  return JSON.parse(strFromU8(bytes)) as T;
}

/** Presses keys on the test area's picture. */
async function press(canvas: Locator, ...codes: string[]): Promise<void> {
  for (const code of codes) await canvas.press(code);
}

/** Holds a thing from the picker. */
async function hold(window: Page, thing: string): Promise<void> {
  await window.getByTestId('tryit-picker-open').click();
  await window.getByTestId(`tryit-picker-item-${thing}`).click();
  await expect(window.getByTestId('tryit-picker')).toBeHidden();
}

test('mobs 2: a fish bucket, a hovering mob and boats from the Creator, the Studios, Try it, the jar', async () => {
  test.setTimeout(300_000);
  base = mkdtempSync(join(tmpdir(), 'msm-mobs-2-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });
  launched = await launchApp({ reuse: folders, args: WEBGL_ARGS });
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId(`element-row-${id('pack')}`)).toBeVisible();

  // 1. The three flows. --------------------------------------------------------------------------
  await runFlow(window, 'water-mob', 'Water mob', async (dialog) => {
    await expect(dialog.getByTestId('param-mob_name')).toHaveValue('Reef Darter');
    await dialog.getByTestId('param-bucket').check();
    await dialog.getByTestId('param-plays_dead').check();
  });
  await runFlow(window, 'flying-mob', 'Flying mob', async (dialog) => {
    await dialog.getByTestId('param-mob_name').fill('Mist Wisp');
    await dialog.getByTestId('param-flight').selectOption('hover');
  });
  await runFlow(window, 'wood-set', 'Wood set', async (dialog) => {
    await dialog.getByTestId('param-wood_name').fill('Willow');
    await dialog.getByTestId('param-boats').check();
  });
  for (const path of [DARTER, WISP, BOAT, 'willow_planks']) {
    await expect(window.getByTestId(`element-row-${id(path)}`)).toHaveCount(1);
  }
  await expectNoProblems(window);

  // 2. The Mob Studio. ---------------------------------------------------------------------------
  await window.getByTestId(`element-row-${id(DARTER)}`).click();
  const bucketOn = window.getByTestId('entity-bucket-on');
  await expect(bucketOn).toBeVisible({ timeout: 30_000 });
  await expect(bucketOn).toBeChecked();
  await expect(window.getByTestId('entity-bucket-water')).toBeChecked();
  await expect(window.getByTestId('entity-bucket-how')).toContainText(
    'A water bucket takes the mob',
  );
  const bucketName = window.getByTestId('entity-bucket-name');
  await expect(bucketName).toHaveAttribute('placeholder', 'Bucket of Reef Darter');
  await bucketName.fill('Darter in a Bucket');
  await expect(window.getByTestId('entity-habit-play_dead-on')).toBeChecked();
  const mode = window.getByTestId('entity-movement-mode');
  await expect(mode).toHaveValue('swim');
  await expect(window.getByTestId('entity-bucket-needs-swim')).toHaveCount(0);
  await mode.selectOption('walk');
  await expect(window.getByTestId('entity-bucket-needs-swim')).toBeVisible();
  await window.getByTestId('toolbar-undo').click();
  await expect(mode).toHaveValue('swim');
  await expect(window.getByTestId('entity-bucket-needs-swim')).toHaveCount(0);
  await expect(bucketName).toHaveValue('Darter in a Bucket');

  await window.getByTestId(`element-row-${id(WISP)}`).click();
  await expect(mode).toHaveValue('hover', { timeout: 30_000 });
  await expect(window.getByTestId('entity-movement-note')).toContainText(
    'Hovering mobs float above the ground below them',
  );
  const height = window.getByTestId('entity-hover-height');
  await height.fill('6');
  await expect(height).toHaveValue('6');

  // 3. The Item Studio's Boat section. -----------------------------------------------------------
  await window.getByTestId(`element-row-${id(BOAT)}`).click();
  const studio = window.getByTestId('item-studio');
  await expect(studio).toBeVisible();
  const boatOn = studio.getByTestId('item-boat-on');
  await expect(boatOn).toBeChecked({ timeout: 30_000 });
  const chest = studio.getByTestId('item-boat-chest');
  await expect(chest).toBeChecked();
  await expect(studio.getByTestId('item-boat-picture-boat')).toHaveValue(id('entity/boat/willow'));
  await expect(studio.getByTestId('item-boat-picture-chest_boat')).toHaveValue(
    id('entity/chest_boat/willow'),
  );
  await expect(studio.getByTestId('item-boat-pictures-missing')).toHaveCount(0);
  const chestName = studio.getByTestId('item-boat-chest-name');
  await chestName.fill('Willow Boat and Chest');
  await chest.uncheck();
  await expect(studio.getByTestId('item-boat-picture-chest_boat')).toHaveCount(0);
  await expect(chestName).toHaveCount(0);
  await window.getByTestId('toolbar-undo').click();
  await expect(chest).toBeChecked();
  await expect(chestName).toHaveValue('Willow Boat and Chest');
  await expectNoProblems(window);

  // 4. Try it: out of the bucket, and caught again. ----------------------------------------------
  await window.keyboard.press('F6');
  await expect(window.getByTestId('tryit-view')).toBeVisible();
  const state = window.getByTestId('tryit-state');
  await expect(state).toHaveAttribute('data-blocks', /\d+/);
  const card = window.getByTestId('tryit-card');
  if (await card.isVisible()) await window.getByTestId('tryit-card-close').click();
  if ((await state.getAttribute('data-paused')) !== 'true') {
    await window.getByTestId('tryit-clock-pause').click();
  }
  await expect(state).toHaveAttribute('data-paused', 'true');
  const canvas = window.getByTestId('tryit-canvas');
  await hold(window, id(`${DARTER}_bucket`));
  await canvas.focus();
  await press(canvas, 'ArrowDown', 'ArrowDown', 'ArrowDown');
  await expect(state).toHaveAttribute('data-pointed', 'the floor');
  await press(canvas, 'KeyC');
  await expect(state).toHaveAttribute('data-entities', '1');
  const log = window.getByTestId('tryit-log');
  await expect(log).toContainText('You let Reef Darter out of Darter in a Bucket with its water.');
  // The darter stands on the floor where it came out; a little higher, the pointer is on it.
  await press(canvas, 'ArrowUp');
  await expect(state).toHaveAttribute('data-pointed', `mob ${id(DARTER)}`);
  await hold(window, 'minecraft:water_bucket');
  await canvas.focus();
  await press(canvas, 'KeyC');
  await expect(log).toContainText('You caught Reef Darter in Darter in a Bucket.');
  await expect(state).toHaveAttribute('data-entities', '0');
  await window.screenshot({ path: join(outputDir, 'mobs-2-path-tryit.png') });
  await window.keyboard.press('F6');
  await expect(window.getByTestId('tryit-view')).toBeHidden();

  // 5. Saved, then the jar. ----------------------------------------------------------------------
  const footer = window.locator('footer');
  await expect(footer.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await window.getByTestId('toolbar-save').click();
  await expect(footer.getByText('Saved', { exact: true })).toBeVisible();
  const darter = savedData(folders.projectDir, 'entity', DARTER);
  expect(darter.components['msm:bucketable']).toEqual({});
  expect(darter.bucket_display_name).toBe('Darter in a Bucket');
  expect(darter.components['msm:movement']).toMatchObject({ mode: 'swim' });
  const wisp = savedData(folders.projectDir, 'entity', WISP);
  expect(wisp.components['msm:movement']).toMatchObject({ mode: 'hover', hover_height: 6 });
  const boat = savedData(folders.projectDir, 'item', BOAT);
  expect(boat.components['msm:boat']).toEqual({ chest: true });
  expect(boat.chest_boat_display_name).toBe('Willow Boat and Chest');

  await window.keyboard.press('ControlOrMeta+Shift+P');
  const palette = window.getByTestId('command-palette');
  await expect(palette).toBeVisible();
  await palette.getByTestId('command-palette-input').fill('fabric mod jar');
  await palette.getByTestId('command-exportFabricJar').click();
  await expect(palette).toBeHidden();
  const jarDialog = window.getByTestId('fabric-jar-dialog');
  await expect(jarDialog).toBeVisible();
  // CI's `ci` job builds no runtime jar to nest.
  await jarDialog.getByTestId('exporter-option-separateRuntime').check();
  await jarDialog.getByTestId('fabric-jar-dialog-submit').click();
  await expect(jarDialog).toBeHidden();
  const jarPath = join(folders.outDir, `${NAMESPACE}.jar`);
  await expect
    .poll(
      () => readdirSync(folders.outDir).includes(`${NAMESPACE}.jar`) && isCompleteZip(jarPath),
      { timeout: 30_000 },
    )
    .toBe(true);
  const files = readZip(jarPath);
  const entity = (path: string) => zipJson<Data>(files, `msm/${NAMESPACE}/entity/${path}.json`);
  expect(entity(DARTER).components['msm:bucketable']).toEqual(darter.components['msm:bucketable']);
  expect(entity(WISP).components['msm:movement']).toMatchObject({ mode: 'hover', hover_height: 6 });
  expect(zipJson<Data>(files, `msm/${NAMESPACE}/item/${BOAT}.json`).components).toMatchObject({
    'msm:boat': { chest: true },
  });
  // The bucket item, and the names in the language file.
  expect(Object.keys(files)).toContain(`assets/${NAMESPACE}/items/${DARTER}_bucket.json`);
  expect(Object.keys(files)).toContain(`assets/${NAMESPACE}/models/item/${DARTER}_bucket.json`);
  const names = Object.values(
    zipJson<Record<string, string>>(files, `assets/${NAMESPACE}/lang/en_us.json`),
  );
  expect(names).toContain('Darter in a Bucket');
  expect(names).toContain('Willow Boat and Chest');
  // The boat's recipes from the planks, vanilla's boat tags and the chest boat item.
  const recipe = zipJson<{ key: Record<string, string>; result: { id: string } }>(
    files,
    `data/${NAMESPACE}/recipe/${BOAT}.json`,
  );
  expect(recipe.key['#']).toBe(id('willow_planks'));
  expect(recipe.result.id).toBe(id(BOAT));
  expect(
    zipJson<{ ingredients: string[] }>(files, `data/${NAMESPACE}/recipe/${CHEST_BOAT}.json`)
      .ingredients,
  ).toEqual(['minecraft:chest', id(BOAT)]);
  const tag = (name: string) =>
    zipJson<{ values: unknown[] }>(files, `data/minecraft/tags/item/${name}.json`).values;
  expect(tag('boats')).toContain(id(BOAT));
  expect(tag('chest_boats')).toContain(id(CHEST_BOAT));
  expect(Object.keys(files)).toContain(`assets/${NAMESPACE}/items/${CHEST_BOAT}.json`);
  for (const picture of ['entity/boat/willow', 'entity/chest_boat/willow']) {
    const bytes = files[`assets/${NAMESPACE}/textures/${picture}.png`];
    expect(bytes?.byteLength ?? 0).toBeGreaterThan(0);
  }
});
