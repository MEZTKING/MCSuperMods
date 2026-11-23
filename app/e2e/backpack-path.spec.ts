/**
 * The backpack path (ADR 0095, ADR 0101 D4, D6; brief B465). A brand-new install
 * (`MSM_E2E_NEW_INSTALL`) opens Home in Very easy; "Start a new mod" makes the mod by name.
 *
 * 1. The Very easy item pick: "Make an item" shows the Backpack flow as "A bag that holds
 *    things"; the flow with its defaults makes a backpack (a chest-like bag of 3 rows, opened by
 *    right-click, stack 1), My things lists it and Things to fix has nothing to fix and no tips.
 * 2. The Item Studio's Inventory section (Advanced) shows the bag; four rows instead of three and
 *    "Sneak and right-click" are saved. A bundle from the "Quiver-like bundle" template shows as
 *    "Works like a bundle" with its three pictures.
 * 3. Back in Very easy, Things to fix still has nothing to fix and no tips.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Page, test } from 'playwright/test';
import {
  expectStatusAgrees,
  type LaunchedApp,
  launchApp,
  openAddDialog,
  outputDir,
} from './fixtures';

const MOD_NAME = 'Pack Mod';

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

/** The `data` of a saved element file. */
function savedData(projectDir: string, ns: string, folder: string, path: string) {
  const file = join(projectDir, 'content', ns, folder, `${path}.json`);
  return (JSON.parse(readFileSync(file, 'utf8')) as { data: Record<string, unknown> }).data;
}

test('backpack: the Very easy pick, the Backpack flow defaults, the Item Studio inventory', async () => {
  test.setTimeout(180_000);
  base = mkdtempSync(join(tmpdir(), 'msm-backpack-'));
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

  // A new mod by name. ------------------------------------------------------------------------
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

  // "Make an item": the bag pick runs the Backpack flow with its defaults. --------------------
  await home.getByTestId('home-tile-item').click();
  const creator = window.getByTestId('creator-dialog');
  await expect(creator).toBeVisible();
  const card = creator.getByTestId('creator-flow-backpack');
  await expect(card).toContainText('A bag that holds things');
  await card.click();
  const create = creator.getByTestId('creator-create');
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  await expect(creator).toBeHidden({ timeout: 30_000 });
  await expectNothingToFix(window);
  await window.getByTestId('toolbar-home').click();
  const things = home.getByTestId('my-things');
  await expect(things.locator('li')).toHaveCount(1);
  await expect(things).toContainText('Backpack');

  // Advanced: the Item Studio's Inventory section. --------------------------------------------
  await window.getByTestId(`element-row-${id('backpack')}`).click();
  const inventory = window.getByTestId('item-inventory');
  await expect(inventory).toBeVisible();
  await expect(inventory.getByTestId('item-inventory-holds')).toHaveValue('bag');
  await expect(inventory.getByTestId('item-bag-layout')).toHaveValue('chest');
  const rows = inventory.getByTestId('item-bag-rows');
  await expect(rows).toHaveValue('3');
  await expect(inventory.getByTestId('item-bag-open')).toHaveValue('use');
  await rows.fill('4');
  await rows.press('Enter');
  await inventory.getByTestId('item-bag-open').selectOption('sneak_use');
  await expect(inventory.getByTestId('item-inventory-conflict')).toHaveCount(0);

  // A bundle from its template.
  await openAddDialog(window);
  const add = window.getByTestId('new-element-dialog');
  await expect(add).toBeVisible();
  await add.getByTestId('new-element-filter').fill('bundle');
  await add.getByTestId('template-msm_item_quiver_bundle').check();
  await expect(add.getByTestId('new-element-namespace')).toHaveValue(ns);
  await add.getByTestId('new-element-name').fill('quiver');
  await add.getByTestId('new-element-dialog-submit').click();
  await expect(add).toBeHidden();
  await expect(inventory.getByTestId('item-inventory-holds')).toHaveValue('bundle');
  await expect(inventory.getByTestId('item-bundle-closed')).toHaveValue('minecraft:item/bundle');
  await expect(inventory.getByTestId('item-bundle-open-back')).toHaveValue(
    'minecraft:item/bundle_open_back',
  );
  await expect(inventory.getByTestId('item-bundle-open-front')).toHaveValue(
    'minecraft:item/bundle_open_front',
  );
  await expectStatusAgrees(window);

  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
  const backpack = savedData(projectDir, ns, 'item', 'backpack') as {
    max_stack_size: number;
    components: Record<string, Record<string, unknown>>;
  };
  expect(backpack.max_stack_size).toBe(1);
  expect(backpack.components['msm:item_inventory']).toMatchObject({
    layout: 'chest',
    rows: 4,
    open: 'sneak_use',
  });
  const quiver = savedData(projectDir, ns, 'item', 'quiver') as {
    components: Record<string, unknown>;
  };
  expect(quiver.components['msm:bundle']).toEqual({});
  await window.screenshot({ path: join(outputDir, 'backpack-path.png') });

  // Back to Very easy: nothing to fix. ---------------------------------------------------------
  await window.getByTestId('toolbar-home').click();
  await window.getByTestId('toolbar-home').click();
  await expect(home).toBeVisible();
  await expectNothingToFix(window);
});
