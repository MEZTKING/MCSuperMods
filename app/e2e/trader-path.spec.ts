/**
 * The trader path (ADR 0098 D1, ADR 0101 D2, D4, D5; brief B483), under SwiftShader WebGL. A
 * brand-new install (`MSM_E2E_NEW_INSTALL`) opens Home in Very easy; "Start a new mod" makes
 * the mod by name.
 *
 * 1. The Very easy tile "Make a trader" offers the Wandering merchant flow; with its defaults it
 *    makes the Travelling Merchant, My things lists it and Things to fix has nothing to fix.
 * 2. Try it (Advanced): the merchant hatches from its egg and using it opens the merchant
 *    mock-up with the flow's wares (6 Glow Berries for 1 Emerald, 1 Name Tag for 5 Emeralds) at
 *    Novice with an empty XP bar. A shift-click trades the berries until they run out: the offer
 *    is crossed out, the merchant reaches Apprentice and "What happened" says that the wandering
 *    trader's own trades of level 2 are only in Minecraft.
 * 3. The Mob Studio's Trader section: level 1 "Trades from" goes to "Its own trades" and a trade
 *    is added (2 Emeralds for 3 Apples, 4 uses, 3 XP); saved, the mob's level 1 names its own
 *    trade set and the trade is a `minecraft:villager_trade` element.
 * 4. Back in Try it, a new merchant offers the new trade.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp, outputDir } from './fixtures';

const MOD_NAME = 'Shop Mod';
const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] as const;

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

/** Things to fix shows nothing to fix and no tips. */
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

/** Presses keys on the test area's picture. */
async function press(canvas: Locator, ...codes: string[]): Promise<void> {
  for (const code of codes) await canvas.press(code);
}

/** Opens Try it (F6) unless it is open, and closes the first-run card when it shows. */
async function openTryIt(window: Page): Promise<{ canvas: Locator; state: Locator }> {
  if (!(await window.getByTestId('tryit-view').isVisible())) await window.keyboard.press('F6');
  await expect(window.getByTestId('tryit-view')).toBeVisible();
  const state = window.getByTestId('tryit-state');
  await expect(state).toHaveAttribute('data-blocks', /\d+/);
  const card = window.getByTestId('tryit-card');
  if (await card.isVisible()) await window.getByTestId('tryit-card-close').click();
  return { canvas: window.getByTestId('tryit-canvas'), state };
}

/** Holds a thing from the picker. */
async function hold(window: Page, id: string): Promise<void> {
  await window.getByTestId('tryit-picker-open').click();
  await window.getByTestId(`tryit-picker-item-${id}`).click();
  await expect(window.getByTestId('tryit-picker')).toBeHidden();
}

/** With the clock paused, hatches the merchant in front and opens its trading screen. */
async function openMerchant(window: Page, egg: string): Promise<Locator> {
  const { canvas, state } = await openTryIt(window);
  if ((await state.getAttribute('data-paused')) !== 'true') {
    await window.getByTestId('tryit-clock-pause').click();
  }
  await expect(state).toHaveAttribute('data-paused', 'true');
  await hold(window, egg);
  await canvas.focus();
  await press(canvas, 'ArrowDown', 'ArrowDown', 'ArrowDown');
  await expect(state).toHaveAttribute('data-pointed', 'the floor');
  await press(canvas, 'KeyC');
  await expect(state).toHaveAttribute('data-entities', '1');
  // The merchant stands beyond the point it hatched on; a little higher, the pointer is on it.
  await press(canvas, 'ArrowUp');
  await expect(state).toHaveAttribute('data-pointed', /^mob /);
  await press(canvas, 'KeyC');
  const merchant = window.getByTestId('tryit-merchant');
  await expect(merchant).toBeVisible();
  return merchant;
}

test('trader: the Make a trader tile, the merchant mock-up, a trade added in the Trader section', async () => {
  test.setTimeout(240_000);
  base = mkdtempSync(join(tmpdir(), 'msm-trader-'));
  const folders = {
    projectDir: join(base, 'picked'),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });
  savedEnv.MSM_E2E_NEW_INSTALL = process.env.MSM_E2E_NEW_INSTALL;
  process.env.MSM_E2E_NEW_INSTALL = '1';

  launched = await launchApp({ reuse: folders, args: WEBGL_ARGS });
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  const welcome = window.getByTestId('welcome-dialog');
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'Got it' }).click();
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

  // 1. "Make a trader": the Wandering merchant flow with its defaults. -----------------------
  const tile = home.getByTestId('home-tile-trader');
  await expect(tile).toContainText('Make a trader');
  await tile.click();
  const creator = window.getByTestId('creator-dialog');
  await expect(creator).toBeVisible();
  await creator.getByTestId('creator-flow-wandering-merchant').click();
  const create = creator.getByTestId('creator-create');
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  await expect(creator).toBeHidden({ timeout: 30_000 });
  await expectNothingToFix(window);
  await window.getByTestId('toolbar-home').click();
  await expect(home.getByTestId('my-things')).toContainText('Travelling Merchant');

  // 2. Try it: the merchant mock-up with the flow's wares. ------------------------------------
  await expect(window.getByTestId(`element-row-${id('travelling_merchant')}`)).toBeVisible();
  const egg = id('travelling_merchant_spawn_egg');
  let merchant = await openMerchant(window, egg);
  await expect(merchant.getByTestId('tryit-merchant-title')).toHaveText('Travelling Merchant');
  await expect(merchant.getByTestId('tryit-merchant-level')).toHaveText('Novice');
  await expect(merchant.getByTestId('tryit-merchant-xp')).toHaveAttribute('data-progress', '0.00');
  const berries = merchant.getByTestId('tryit-merchant-offer-1');
  await expect(berries).toContainText('1Emerald');
  await expect(berries).toContainText('6Glow Berries');
  await expect(berries).toHaveAttribute('data-max-uses', '8');
  await expect(merchant.getByTestId('tryit-merchant-offer-2')).toContainText('5Emerald');
  await expect(merchant.getByTestId('tryit-merchant-offer-2')).toContainText('1Name Tag');
  await berries.click({ modifiers: ['Shift'] });
  await expect(berries).toHaveAttribute('data-out-of-stock', 'true');
  await expect(berries.getByTestId('tryit-merchant-sold-out')).toBeVisible();
  await expect(merchant.getByTestId('tryit-merchant-level')).toHaveText('Apprentice');
  const log = window.getByTestId('tryit-log');
  await expect(log).toContainText('Travelling Merchant reached Apprentice (level 2)');
  await expect(log).toContainText('Wandering trader, common');
  await window.screenshot({ path: join(outputDir, 'trader-path-merchant.png') });
  await merchant.getByTestId('tryit-merchant-close').click();
  await expect(merchant).toBeHidden();

  // 3. The Trader section: level 1 gets its own trades and one is added. ----------------------
  await window.getByTestId(`element-row-${id('travelling_merchant')}`).click();
  await expect(window.getByTestId('tryit-view')).toBeHidden();
  const source = window.getByTestId('entity-trader-source');
  await expect(source).toBeVisible({ timeout: 30_000 });
  await expect(window.getByTestId('entity-trader-borrowed')).toBeVisible();
  await source.selectOption('');
  const form = window.getByTestId('entity-trader-trades-form');
  await expect(form).toBeVisible();
  const price = window.getByTestId('trade-price-item');
  await price.fill('minecraft:emerald');
  await price.press('Enter');
  await window.getByTestId('trade-price-count').fill('2');
  const product = window.getByTestId('trade-product-item');
  await product.fill('minecraft:apple');
  await product.press('Enter');
  await window.getByTestId('trade-product-count').fill('3');
  await window.getByTestId('trade-uses').fill('4');
  await window.getByTestId('trade-xp').fill('3');
  await window.getByTestId('trade-add').click();
  await expect(window.getByTestId('entity-trader-trades').locator('li')).toHaveCount(1);
  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
  const mob = savedData(projectDir, ns, 'entity', 'travelling_merchant') as {
    components: { 'msm:trader': { trade_sets: { trade_set: string }[] } };
  };
  expect(mob.components['msm:trader'].trade_sets[0]?.trade_set).toBe(
    id('travelling_merchant/level_1'),
  );
  expect(
    savedData(projectDir, ns, 'villager_trade', 'travelling_merchant/level_1/emerald_apple'),
  ).toMatchObject({
    wants: { id: 'minecraft:emerald', count: 2 },
    gives: { id: 'minecraft:apple', count: 3 },
    max_uses: 4,
    xp: 3,
  });

  // 4. Back in Try it, a new merchant offers the new trade. -----------------------------------
  await openTryIt(window);
  await window.getByTestId('tryit-clear').click();
  await expect(window.getByTestId('tryit-state')).toHaveAttribute('data-entities', '0');
  merchant = await openMerchant(window, egg);
  await expect(merchant.getByTestId('tryit-merchant-offers').locator('li')).toHaveCount(1);
  const apples = merchant.getByTestId('tryit-merchant-offer-1');
  await expect(apples).toContainText('2Emerald');
  await expect(apples).toContainText('3Apple');
  await apples.click();
  await expect(apples).toHaveAttribute('data-uses', '1');
  await expect(merchant.getByTestId('tryit-merchant-xp')).toHaveAttribute('data-progress', '0.30');
  await expect(log).toContainText('You traded 2 Emerald for 3 Apple with Travelling Merchant.');
});
