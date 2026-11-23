/**
 * The waterlogged, double and per-player storage path (ADR 0104 D3 to D5, ADR 0112 D1, D2; brief
 * B521), in a blank project:
 *
 * 1. The Creator: the Storage crate flow with "Double chest" makes the Twin Crate (a four-way
 *    chest of three rows that joins its neighbour), again with "Different for every player" the
 *    Private Crate, and the Copper set with "Chest that joins into a double chest" the Bronze
 *    Chest in its four stages with waxed copies; no problem at all.
 * 2. The Block Studio's Inventory section: the twin crate is a double chest, and turning on
 *    "Different for every player" turns "Double chest" off in one step that Undo takes back. A
 *    double chest holds water by itself, so its Type section says so and offers no switch. The
 *    bronze chest is a double chest that ages into the exposed one. The private crate is
 *    different for every player, and "Holds water" makes it a waterlogged per-player chest.
 * 3. Saved, then the Fabric mod jar on the default target: the definitions carry `double`,
 *    `per_player`, the weathering and `msm:waterloggable` as saved; the double chests' block
 *    states are written for `type=single|left|right` without `open`, and the private crate's keeps
 *    its open front.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import {
  expectStatusAgrees,
  type LaunchedApp,
  launchApp,
  newProjectInFolder,
  openCreator,
  openDockTab,
  outputDir,
  toast,
} from './fixtures';

/** The project folder name; a blank project's namespace is derived from it. */
const NAMESPACE = 'vault';
const id = (path: string) => `${NAMESPACE}:${path}`;

/** The copper chest's ageing stages and waxed copies. */
const CHEST_STAGES = [
  'bronze_chest',
  'exposed_bronze_chest',
  'weathered_bronze_chest',
  'oxidized_bronze_chest',
];
const WAXED_CHESTS = CHEST_STAGES.map((path) => `waxed_${path}`);

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
  await expectStatusAgrees(window);
}

/** Opens the Creator from the toolbar on `flowId`, sets its answers and applies it. */
async function runFlow(
  window: Page,
  flowId: string,
  title: string,
  answer: (dialog: Locator) => Promise<void>,
): Promise<void> {
  await openCreator(window);
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

/** Saves the project, which must have unsaved changes (otherwise "Saved" shows at once). */
async function save(window: Page): Promise<void> {
  const footer = window.locator('footer');
  await expect(footer.getByText('Not saved yet', { exact: true })).toBeVisible();
  await window.getByTestId('toolbar-save').click();
  await expect(footer.getByText('Saved', { exact: true })).toBeVisible();
}

type Data = { type?: string; components: Record<string, Record<string, unknown>> };

/** The `data` of a saved block file in the project folder. */
function savedBlock(projectDir: string, path: string): Data {
  const file = join(projectDir, 'content', NAMESPACE, 'block', `${path}.json`);
  return (JSON.parse(readFileSync(file, 'utf8')) as { data: Data }).data;
}

/** Opens the Block Studio of `block` and waits for its (lazy) Inventory section. */
async function openInventory(window: Page, block: string): Promise<Locator> {
  await window.getByTestId(`element-row-${id(block)}`).click();
  const studio = window.getByTestId('block-studio');
  await expect(studio).toBeVisible();
  await expect(studio.getByTestId('block-container-hoppers')).toBeVisible({ timeout: 30_000 });
  return studio;
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

/** The variant keys of a block state file in the jar. */
function variantKeys(files: Record<string, Uint8Array>, block: string): string[] {
  const state = zipJson<{ variants?: Record<string, unknown> }>(
    files,
    `assets/${NAMESPACE}/blockstates/${block}.json`,
  );
  return Object.keys(state.variants ?? {}).sort();
}

test('storage 2: double, per-player and copper chests from the Creator, the Inventory section, Holds water, the jar', async () => {
  test.setTimeout(240_000);
  base = mkdtempSync(join(tmpdir(), 'msm-storage-2-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });
  launched = await launchApp({ reuse: folders });
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await newProjectInFolder(window);
  await expect(window.getByTestId(`element-row-${id('pack')}`)).toBeVisible();

  // 1. The three flows. --------------------------------------------------------------------------
  await runFlow(window, 'storage-crate', 'Storage crate', async (dialog) => {
    await dialog.getByTestId('param-crate_name').fill('Twin Crate');
    await dialog.getByTestId('param-double').check();
  });
  await runFlow(window, 'storage-crate', 'Storage crate', async (dialog) => {
    await dialog.getByTestId('param-crate_name').fill('Private Crate');
    await dialog.getByTestId('param-per_player').check();
  });
  await runFlow(window, 'copper-set', 'Copper set', async (dialog) => {
    await dialog.getByTestId('param-metal_name').fill('Bronze');
    await dialog.getByTestId('param-members-chest').check();
  });
  for (const path of ['twin_crate', 'private_crate', ...CHEST_STAGES, ...WAXED_CHESTS]) {
    await expect(window.getByTestId(`element-row-${id(path)}`)).toHaveCount(1);
  }
  await expectNoProblems(window);

  // 2. The Inventory section. --------------------------------------------------------------------
  let studio = await openInventory(window, 'twin_crate');
  const double = studio.getByTestId('block-container-double');
  const perPlayer = studio.getByTestId('block-container-per-player');
  await expect(studio.getByTestId('block-type-picker')).toHaveValue('horizontal');
  await expect(double).toBeChecked();
  await expect(studio.getByTestId('block-container-double-note')).toBeVisible();
  await expect(perPlayer).not.toBeChecked();
  await expect(studio.getByTestId('block-waterlogged-double-chest')).toBeVisible();
  await expect(studio.getByTestId('block-waterlogged')).toHaveCount(0);
  // Each player's own store does not go with a double chest: one turns the other off.
  await perPlayer.check();
  await expect(perPlayer).toBeChecked();
  await expect(double).not.toBeChecked();
  await expect(studio.getByTestId('block-container-per-player-note')).toBeVisible();
  await expect(studio.getByTestId('block-waterlogged')).not.toBeChecked();
  await window.getByTestId('toolbar-undo').click();
  await expect(double).toBeChecked();
  await expect(perPlayer).not.toBeChecked();
  await expect(studio.getByTestId('block-waterlogged-double-chest')).toBeVisible();

  studio = await openInventory(window, 'bronze_chest');
  await expect(studio.getByTestId('block-container-double')).toBeChecked();
  await expect(studio.getByTestId('block-waterlogged-double-chest')).toBeVisible();
  await expect(studio.getByTestId('block-weathering-on')).toBeChecked();
  await expect(studio.getByTestId('block-weathering-next')).toHaveValue(id('exposed_bronze_chest'));
  await expect(studio.getByTestId('block-weathering-into')).toHaveValue(id('waxed_bronze_chest'));

  studio = await openInventory(window, 'private_crate');
  await expect(studio.getByTestId('block-container-per-player')).toBeChecked();
  await expect(studio.getByTestId('block-container-per-player-note')).toBeVisible();
  await expect(studio.getByTestId('block-container-double')).not.toBeChecked();
  const water = studio.getByTestId('block-waterlogged');
  await expect(water).not.toBeChecked();
  await expect(studio.getByTestId('block-waterlogged-storage')).toBeVisible();
  await water.check();
  await expect(water).toBeChecked();
  await expectNoProblems(window);
  await window.screenshot({ path: join(outputDir, 'storage-2-path.png') });

  // 3. Saved, then the jar. ----------------------------------------------------------------------
  await save(window);
  const twin = savedBlock(folders.projectDir, 'twin_crate');
  expect(twin.type).toBe('horizontal');
  expect(twin.components['msm:container']).toEqual({ layout: 'chest', rows: 3, double: true });
  const bronze = savedBlock(folders.projectDir, 'bronze_chest');
  expect(bronze.components['msm:container']).toEqual({ layout: 'chest', rows: 3, double: true });
  expect(bronze.components['msm:weathering']).toMatchObject({ next: id('exposed_bronze_chest') });
  const exposed = savedBlock(folders.projectDir, 'exposed_bronze_chest');
  expect(exposed.components['msm:container']).toEqual(bronze.components['msm:container']);
  const mine = savedBlock(folders.projectDir, 'private_crate');
  expect(mine.components['msm:container']).toMatchObject({ layout: 'chest', per_player: true });
  expect(mine.components['msm:container']).not.toHaveProperty('double');
  expect(mine.components['msm:waterloggable']).toEqual({});

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
      {
        timeout: 30_000,
      },
    )
    .toBe(true);
  const files = readZip(jarPath);
  const definition = (path: string) => zipJson<Data>(files, `msm/${NAMESPACE}/block/${path}.json`);
  expect(definition('twin_crate').components['msm:container']).toEqual(
    twin.components['msm:container'],
  );
  expect(definition('bronze_chest').components).toMatchObject({
    'msm:container': bronze.components['msm:container'],
    'msm:weathering': bronze.components['msm:weathering'],
  });
  expect(definition('private_crate').components).toMatchObject({
    'msm:container': mine.components['msm:container'],
    'msm:waterloggable': {},
  });

  // The double chests' block states: closed, for each half; the private crate opens.
  for (const block of ['twin_crate', 'bronze_chest', 'waxed_oxidized_bronze_chest']) {
    const keys = variantKeys(files, block);
    expect(keys.length).toBeGreaterThan(0);
    for (const half of ['single', 'left', 'right']) {
      expect(keys.some((key) => key.split(',').includes(`type=${half}`))).toBe(true);
    }
    expect(keys.filter((key) => key.includes('open='))).toEqual([]);
  }
  expect(variantKeys(files, 'private_crate').some((key) => key.includes('open=true'))).toBe(true);
});
