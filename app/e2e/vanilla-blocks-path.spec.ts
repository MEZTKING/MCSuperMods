/**
 * The vanilla blocks path (ADR 0101 D4, D6; brief B465). A brand-new install (`MSM_E2E_NEW_INSTALL`)
 * opens Home in Very easy; "Start a new mod" makes the mod by name.
 *
 * 1. Very easy block picks: "Make a block" offers the picks in plain words ("Lights", "Ages like
 *    copper"); the Lights flow and the Copper set flow run with their defaults, My things lists
 *    both sets and Things to fix has nothing to fix and no tips.
 * 2. A sign in the Block Studio (Advanced): a simple block turned into a sign, which needs its
 *    wood type (oak, filled in by the type change); its wood type, board, writing screen and item
 *    pictures are typed in, the Type section names its wall companion, and choosing the writing
 *    screen picture copies it where the game's sign screen reads it. The words written on a sign
 *    are typed by players in the game's own sign screen; the format has no text field, so there
 *    is no sign text to type in the app.
 * 3. A copper stage's Weathering section, then back to Very easy: Things to fix has nothing to
 *    fix and no tips.
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

const MOD_NAME = 'Tin Mod';

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

test('vanilla blocks: Very easy picks, Lights and Copper set defaults, a sign in the Block Studio', async () => {
  test.setTimeout(240_000);
  base = mkdtempSync(join(tmpdir(), 'msm-vanilla-blocks-'));
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
  await expectNothingToFix(window);

  // The Very easy picks: Lights, then Copper set, with their defaults. -----------------------
  await makeBlockPick(window, 'lights', 'Lights');
  await expectNothingToFix(window);
  await makeBlockPick(window, 'copper-set', 'Ages like copper');
  await expectNothingToFix(window);
  await window.getByTestId('toolbar-home').click();
  const things = home.getByTestId('my-things');
  await expect(things.locator('li')).toHaveCount(2);
  await expect(things).toContainText('Lights');
  await expect(things).toContainText('Copper set');

  // Advanced: the sets' elements, then a sign made in the Block Studio. ----------------------
  await expect(window.getByRole('navigation', { name: 'Things in this mod' })).toBeVisible();
  for (const path of ['glow_torch', 'glow_lantern', 'glow_chain', 'glow_candle', 'tin_block']) {
    await expect(window.getByTestId(`element-row-${id(path)}`)).toBeVisible();
  }
  for (const path of ['exposed_tin', 'oxidized_tin_door', 'waxed_tin_block', 'tin_ingot']) {
    await expect(window.getByTestId(`element-row-${id(path)}`)).toHaveCount(1);
  }

  await openAddDialog(window);
  const add = window.getByTestId('new-element-dialog');
  await expect(add).toBeVisible();
  await add.getByTestId('new-element-filter').fill('simple block');
  await add.getByTestId('template-msm_block_simple').check();
  await expect(add.getByTestId('new-element-namespace')).toHaveValue(ns);
  await add.getByTestId('new-element-name').fill('notice_board');
  await add.getByTestId('new-element-dialog-submit').click();
  await expect(add).toBeHidden();
  const studio = window.getByTestId('block-studio');
  await expect(studio).toBeVisible();

  await studio.getByTestId('block-type-picker').selectOption('sign');
  const woodType = studio.getByTestId('block-sign-wood-type');
  await expect(woodType).toBeVisible();
  // A sign needs a wood type: the type change fills in the first one, oak.
  await expect(woodType).toHaveValue('oak');
  await woodType.selectOption('cherry');
  await expect(woodType).toHaveValue('cherry');
  await expect(studio.getByTestId('block-companion-ids')).toContainText(id('notice_board_wall'));
  await expect(studio.getByTestId('block-textures-sign-note')).toBeVisible();

  const typeTexture = async (slot: string, value: string) => {
    const field = studio.getByTestId(`block-texture-${slot}`);
    await field.fill(value);
    await field.press('Enter');
    await expect(field).toHaveValue(value);
  };
  await typeTexture('all', id('block/cut_tin'));
  await typeTexture('sign', id('block/tin_block'));
  await typeTexture('item', id('item/tin_ingot'));
  await expectStatusAgrees(window);

  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
  const sign = (
    JSON.parse(
      readFileSync(join(projectDir, 'content', ns, 'block', 'notice_board.json'), 'utf8'),
    ) as { data: { type: string; wood_type: string; textures: Record<string, string> } }
  ).data;
  expect(sign.type).toBe('sign');
  expect(sign.wood_type).toBe('cherry');
  expect(sign.textures).toMatchObject({
    all: id('block/cut_tin'),
    sign: id('block/tin_block'),
    item: id('item/tin_ingot'),
  });
  // The writing screen picture is a copy where the game's sign screen reads it.
  const textures = join(projectDir, 'assets', ns, 'textures');
  const screen = join(textures, 'gui', 'signs', 'notice_board.png');
  expect(existsSync(screen)).toBe(true);
  expect(readFileSync(screen).equals(readFileSync(join(textures, 'block', 'tin_block.png')))).toBe(
    true,
  );

  // A copper stage ages into the next one. -----------------------------------------------------
  await window.getByTestId(`element-row-${id('tin_block')}`).click();
  await expect(studio.getByTestId('block-weathering')).toBeVisible();
  await expect(studio.getByTestId('block-weathering-on')).toBeChecked();
  await expect(studio.getByTestId('block-weathering-next')).toHaveValue(id('exposed_tin'));
  await expect(studio.getByTestId('block-weathering-into')).toHaveValue(id('waxed_tin_block'));
  await window.screenshot({ path: join(outputDir, 'vanilla-blocks-path.png') });

  // Back to Very easy: nothing to fix. ---------------------------------------------------------
  await window.getByTestId('toolbar-home').click();
  await window.getByTestId('toolbar-home').click();
  await expect(home).toBeVisible();
  await expectNothingToFix(window);
});
