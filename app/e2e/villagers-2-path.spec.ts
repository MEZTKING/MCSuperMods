/**
 * The villager looks and reputation path (ADR 0107 D1–D3, D5, ADR 0112 D1, D2; brief B542),
 * under SwiftShader WebGL. A brand-new install (`MSM_E2E_NEW_INSTALL`) opens Home in Very easy;
 * "Start a new mod" makes the mod by name.
 *
 * 1. Very easy: "Make a trader" offers the Villager look flow, which makes the Meadow Folk look
 *    for meadows, and the Wandering merchant flow, which with "Remembers how you treat it",
 *    "A gift it likes" and "Twice a day, at a block near it" makes the Travelling Merchant;
 *    Things to fix has nothing to fix.
 * 2. Advanced, the Villager look Studio: the meadow biome, Minecraft's own looks named, both
 *    pictures where the game reads them (nothing left to copy), and a hat picked.
 * 3. The Mob Studio's Trader section: "Remembers how you treat it" with the flow's gift item,
 *    "Prices rise with demand" and "Restocks at" a barrel; "Hurt costs" and "Price step" typed;
 *    turning the memory off hides its numbers and Undo brings them back.
 * 4. Try it: a gift of sweet berries raises the player's standing to 25 (What happened says so),
 *    and the merchant mock-up then shows the name tag's 5 emeralds crossed out for 3 (a price
 *    step of 10) with the standing line.
 * 5. Saved, then the Fabric mod jar on the default target: the trader's `reputation`, `demand`
 *    and `work_site`, the look's definition with its biome, both pictures and their hat
 *    metadata.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp, openDockTab, outputDir } from './fixtures';

const MOD_NAME = 'Market Mod';
const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] as const;
const LOOK = 'meadow_folk';
const MERCHANT = 'travelling_merchant';

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

/** No problem of any severity in the Problems panel (opened), and the status bar agrees. */
async function expectNoProblems(window: Page): Promise<void> {
  await openDockTab(window, 'problems');
  const problems = window.getByTestId('problems-panel');
  await expect(problems).toBeVisible();
  await expect(problems.locator('[data-testid="problem-row"]')).toHaveCount(0);
  await expect(window.locator('footer').getByText(/^0 error\(s\)/)).toBeVisible();
}

/** Runs `flowId` from Home's "Make a trader" tile with the answers `answer` gives. */
async function makeTrader(
  window: Page,
  flowId: string,
  answer: (dialog: Locator) => Promise<void>,
): Promise<void> {
  await window.getByTestId('toolbar-home').click();
  const tile = window.getByTestId('home').getByTestId('home-tile-trader');
  await expect(tile).toContainText('Make a trader');
  await tile.click();
  const creator = window.getByTestId('creator-dialog');
  await expect(creator).toBeVisible();
  await creator.getByTestId(`creator-flow-${flowId}`).click();
  await answer(creator);
  const create = creator.getByTestId('creator-create');
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  await expect(creator).toBeHidden({ timeout: 60_000 });
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

test('villagers 2: a villager look and a merchant that remembers, the Studios, Try it prices, the jar', async () => {
  test.setTimeout(300_000);
  base = mkdtempSync(join(tmpdir(), 'msm-villagers-2-'));
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

  // 1. Very easy: the two flows from "Make a trader". -----------------------------------------
  await makeTrader(window, 'villager-look', async (dialog) => {
    await dialog.getByTestId('param-look_name').fill('Meadow Folk');
    await dialog.getByTestId('param-place').selectOption('meadow');
  });
  await makeTrader(window, 'wandering-merchant', async (dialog) => {
    await dialog.getByTestId('param-remembers').check();
    await expect(dialog.getByTestId('param-gift')).toHaveValue('minecraft:sweet_berries');
    await dialog.getByTestId('param-restock').selectOption('work_site');
    await expect(dialog.getByTestId('param-work_site')).toHaveValue('minecraft:barrel');
  });
  await expectNothingToFix(window);
  await window.getByTestId('toolbar-home').click();
  await expect(home.getByTestId('my-things')).toContainText('Travelling Merchant');

  // 2. Advanced: the Villager look Studio. ------------------------------------------------------
  await window.getByTestId(`element-row-${id(LOOK)}`).click();
  const look = window.getByTestId('villager-type-studio');
  await expect(look).toBeVisible({ timeout: 30_000 });
  await expect(look.getByLabel('Biome 1', { exact: true })).toHaveValue('minecraft:meadow');
  await expect(look.getByTestId('villager-type-vanilla')).toContainText("Minecraft's own looks");
  await expect(look.getByTestId('villager-type-picture-villager')).toHaveValue(
    id(`entity/villager/type/${LOOK}`),
  );
  await expect(look.getByTestId('villager-type-picture-zombie_villager')).toHaveValue(
    id(`entity/zombie_villager/type/${LOOK}`),
  );
  await expect(look.getByTestId('villager-type-pictures-missing')).toHaveCount(0);
  const hat = look.getByTestId('villager-type-hat');
  await expect(hat).toHaveValue('none');
  await hat.selectOption('partial');
  await expect(hat).toHaveValue('partial');
  await expectNoProblems(window);

  // 3. The Mob Studio's Trader section. ---------------------------------------------------------
  await window.getByTestId(`element-row-${id(MERCHANT)}`).click();
  const remembers = window.getByTestId('entity-trader-reputation-on');
  await expect(remembers).toBeVisible({ timeout: 30_000 });
  await expect(remembers).toBeChecked();
  await expect(window.getByTestId('entity-trader-reputation-gift-item')).toHaveValue(
    'minecraft:sweet_berries',
  );
  await expect(window.getByTestId('entity-trader-demand')).toBeChecked();
  await expect(window.getByTestId('entity-trader-work-site')).toHaveValue('minecraft:barrel');
  await window.getByTestId('entity-trader-reputation-hurt').fill('30');
  const step = window.getByTestId('entity-trader-reputation-price-step');
  await step.fill('10');
  await expect(step).toHaveValue('10');
  // Forgetting turns the numbers off; Undo brings them back as typed.
  await remembers.uncheck();
  await expect(step).toHaveCount(0);
  await window.getByTestId('toolbar-undo').click();
  await expect(remembers).toBeChecked();
  await expect(step).toHaveValue('10');
  await expect(window.getByTestId('entity-trader-reputation-hurt')).toHaveValue('30');
  await expectNoProblems(window);

  // 4. Try it: a gift, then the prices it brings. -----------------------------------------------
  const { canvas, state } = await openTryIt(window);
  if ((await state.getAttribute('data-paused')) !== 'true') {
    await window.getByTestId('tryit-clock-pause').click();
  }
  await expect(state).toHaveAttribute('data-paused', 'true');
  await hold(window, id(`${MERCHANT}_spawn_egg`));
  await canvas.focus();
  await press(canvas, 'ArrowDown', 'ArrowDown', 'ArrowDown');
  await expect(state).toHaveAttribute('data-pointed', 'the floor');
  await press(canvas, 'KeyC');
  await expect(state).toHaveAttribute('data-entities', '1');
  // The merchant stands beyond the point it hatched on; a little higher, the pointer is on it.
  await press(canvas, 'ArrowUp');
  await expect(state).toHaveAttribute('data-pointed', /^mob /);
  await hold(window, 'minecraft:sweet_berries');
  await canvas.focus();
  await press(canvas, 'KeyC');
  const log = window.getByTestId('tryit-log');
  await expect(log).toContainText(
    'You gave Travelling Merchant a gift: your standing with it is now 25, so its prices fall.',
  );
  const merchant = window.getByTestId('tryit-merchant');
  await expect(merchant).toBeHidden();
  // At the gift cap, a use with the gift item opens the trading screen.
  await press(canvas, 'KeyC');
  await expect(merchant).toBeVisible();
  await expect(merchant.getByTestId('tryit-merchant-standing')).toContainText(
    'Your standing with Travelling Merchant: 25.',
  );
  const nameTag = merchant.getByTestId('tryit-merchant-offer-2');
  await expect(nameTag).toContainText('Name Tag');
  await expect(nameTag.getByTestId('tryit-merchant-base')).toHaveText('5');
  await expect(nameTag.getByTestId('tryit-merchant-price').first()).toHaveText('3');
  // The berries cost 1 emerald already, the lowest a price can be.
  await expect(
    merchant.getByTestId('tryit-merchant-offer-1').getByTestId('tryit-merchant-base'),
  ).toHaveCount(0);
  await window.screenshot({ path: join(outputDir, 'villagers-2-path-merchant.png') });
  await merchant.getByTestId('tryit-merchant-close').click();
  await expect(merchant).toBeHidden();
  await window.keyboard.press('F6');
  await expect(window.getByTestId('tryit-view')).toBeHidden();

  // 5. Saved, then the jar. ---------------------------------------------------------------------
  const footer = window.locator('footer');
  await expect(footer.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await window.getByTestId('toolbar-save').click();
  await expect(footer.getByText('Saved', { exact: true })).toBeVisible();
  type Mob = { components: Record<string, Record<string, unknown>> };
  const trader = savedData<Mob>(projectDir, ns, 'entity', MERCHANT).components['msm:trader'];
  expect(trader?.reputation).toEqual({
    gift_item: 'minecraft:sweet_berries',
    hurt: 30,
    price_step: 10,
  });
  expect(trader?.work_site).toBe('minecraft:barrel');
  expect(trader).not.toHaveProperty('demand');
  const lookData = savedData<{ biomes: string[]; textures: Record<string, string> }>(
    projectDir,
    ns,
    'villager_type',
    LOOK,
  );
  expect(lookData.biomes).toEqual(['minecraft:meadow']);
  expect(lookData.textures).toEqual({
    hat: 'partial',
    villager: id(`entity/villager/type/${LOOK}`),
    zombie_villager: id(`entity/zombie_villager/type/${LOOK}`),
  });

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
  let jarName = '';
  await expect
    .poll(
      () => {
        jarName = readdirSync(folders.outDir).find((entry) => entry.endsWith('.jar')) ?? '';
        return jarName !== '' && isCompleteZip(join(folders.outDir, jarName));
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  const files = readZip(join(folders.outDir, jarName));
  const mob = zipJson<Mob>(files, `msm/${ns}/entity/${MERCHANT}.json`);
  expect(mob.components['msm:trader']).toMatchObject({
    reputation: trader?.reputation,
    work_site: 'minecraft:barrel',
  });
  expect(zipJson(files, `msm/${ns}/villager_type/${LOOK}.json`)).toMatchObject({
    biomes: ['minecraft:meadow'],
  });
  for (const entity of ['villager', 'zombie_villager']) {
    const picture = `assets/${ns}/textures/entity/${entity}/type/${LOOK}.png`;
    expect(files[picture]?.byteLength ?? 0).toBeGreaterThan(0);
    expect(zipJson(files, `${picture}.mcmeta`)).toEqual({ villager: { hat: 'partial' } });
  }
});
