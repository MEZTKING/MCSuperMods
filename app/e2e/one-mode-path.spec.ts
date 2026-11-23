/**
 * One mode with More options (ADR 0130; it replaces `modes-path` and `very-easy-path`), with
 * every More options closed as people first see them (`moreOptions: 'closed'`).
 *
 * 1. A brand-new install (`MSM_E2E_NEW_INSTALL`: the launch notice is not suppressed, and the
 *    `MSM_HOME` has no settings yet) opens the Welcome, with no question about a mode, then Home
 *    with the element list beside it and no mode switch anywhere (toolbar, palette). "Start a new
 *    mod" asks only for a name and makes the mod under `<MSM_HOME>/Documents/MCSuperMods/` (test
 *    runs). The "Make food" tile runs the Creator's Food flow, and My things shows the set; the
 *    food opens in its Studio in plain words (New here?, Name, a section's why, no id shown), a
 *    section's More options shows the id field and is remembered, Where it goes' More options
 *    holds Edit as raw text. "Make things happen" opens a new rule book; a step without its item
 *    is a thing to fix in plain words; "Show me" goes to the chip, and picking an item clears it.
 *    "Share my mod" saves the Fabric mod jar with the export's defaults (a stand-in runtime from
 *    `MSM_E2E_RUNTIME_DIR` is nested) and says where it is.
 * 2. `fixtures/sample-mod`: the list shows names and groups, never ids, and folds the technical
 *    `msm:mod` element under "More"; Every setting shows the whole form under its More options.
 */

import {
  cpSync,
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
import { defaultTargetId, targetById } from '@msm/targets';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { appDir, type LaunchedApp, launchApp, outputDir } from './fixtures';

const MOD_NAME = 'Garden Mod';

/** A stand-in runtime jar for the default target, named as Gradle names it. */
function makeRuntimeDir(base: string): string {
  const dir = join(base, 'runtime');
  mkdirSync(dir, { recursive: true });
  const mcVersion = targetById(defaultTargetId)?.target.mcVersion ?? '';
  const version = `0.0.0-e2e+mc${mcVersion.split('-')[0]}`;
  const jar = zipSync({
    'fabric.mod.json': strToU8(JSON.stringify({ id: 'msm_runtime', schemaVersion: 1, version })),
  });
  writeFileSync(join(dir, `msm_runtime-${version}.jar`), jar);
  return dir;
}

/**
 * Opens a menu button's popover and chooses the entry named `name` (through its DOM event: the
 * popover can reach past the bottom of the window).
 */
async function pickFromMenu(window: Page, opener: Locator, name: string): Promise<void> {
  await opener.click();
  const choice = window.getByRole('button', { name, exact: true });
  await expect(choice).toBeAttached();
  await choice.dispatchEvent('click');
}

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

test('one mode: Welcome, Home, a new mod, a tile, plain Studios with More options, Things to fix, Share my mod', async () => {
  test.setTimeout(150_000);
  base = mkdtempSync(join(tmpdir(), 'msm-one-mode-'));
  const folders = {
    projectDir: join(base, 'picked'),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });
  const env = { MSM_E2E_NEW_INSTALL: '1', MSM_E2E_RUNTIME_DIR: makeRuntimeDir(base) };
  for (const [key, value] of Object.entries(env)) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }

  launched = await launchApp({ reuse: folders, moreOptions: 'closed' });
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');

  // A brand-new install: the Welcome with no mode question, then Home. -------------------------
  const welcome = window.getByTestId('welcome-dialog');
  await expect(welcome).toBeVisible();
  await expect(welcome.getByTestId('welcome-modes')).toHaveCount(0);
  await expect(welcome.getByTestId('welcome-more-options')).toContainText('More options');
  await welcome.getByRole('button', { name: 'Got it' }).click();
  await expect(welcome).toBeHidden();
  const home = window.getByTestId('home');
  await expect(home).toBeVisible();
  // One toolbar, with no mode switch.
  await expect(window.getByTestId('toolbar-home')).toBeVisible();
  await expect(window.getByTestId('toolbar-save')).toBeVisible();
  await expect(window.getByTestId('toolbar-mode-row')).toHaveCount(0);
  await expect(window.getByTestId('toolbar-mode')).toHaveCount(0);
  // Nor in the palette.
  await window.keyboard.press('ControlOrMeta+Shift+P');
  const palette = window.getByTestId('command-palette');
  await expect(palette).toBeVisible();
  await expect(palette.getByTestId('command-veryEasyMode')).toHaveCount(0);
  await expect(palette.getByTestId('command-toggleMode')).toHaveCount(0);
  await window.keyboard.press('Escape');
  await expect(palette).toBeHidden();

  // A new mod by name only. -------------------------------------------------------------------
  await home.getByTestId('home-new').click();
  const newMod = window.getByTestId('new-mod-dialog');
  await expect(newMod).toBeVisible();
  const parent = join(folders.msmHome, 'Documents', 'MCSuperMods');
  await expect(newMod.getByTestId('new-mod-folder')).toContainText(parent);
  await newMod.getByTestId('new-mod-name').fill(MOD_NAME);
  await newMod.getByTestId('new-mod-dialog-submit').click();
  await expect(newMod).toBeHidden();
  const projectDir = join(parent, MOD_NAME);
  await expect.poll(() => existsSync(join(projectDir, 'msm.project.json'))).toBe(true);
  await expect(home.getByTestId('my-things-empty')).toBeVisible();
  const fix = window.getByTestId('things-to-fix');
  await expect(fix.getByTestId('things-to-fix-none')).toBeVisible();

  // A tile runs a Creator flow; My things shows the set. --------------------------------------
  await home.getByTestId('home-tile-food').click();
  const creator = window.getByTestId('creator-dialog');
  await expect(creator).toBeVisible();
  await creator.getByTestId('creator-flow-food').click();
  const create = creator.getByTestId('creator-create');
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  await expect(creator).toBeHidden({ timeout: 30_000 });
  await window.getByTestId('toolbar-home').click();
  const things = home.getByTestId('my-things');
  await expect(things).toBeVisible();
  await expect(things.locator('li')).toHaveCount(1);
  await expect(things).toContainText('Food');

  // The food in its Studio: plain words, its ids under More options. --------------------------
  await things.locator('[data-testid^="my-thing-open-"]').first().click();
  const studioOf = window.getByTestId('item-studio');
  await expect(studioOf).toBeVisible();
  await expect(window.getByTestId('new-here')).toBeVisible();
  await window.getByTestId('new-here-dismiss').click();
  await expect(window.getByTestId('new-here')).toHaveCount(0);
  await expect(window.getByTestId('thing-name')).toBeVisible();
  await expect(window.getByTestId('item-general-why')).toBeVisible();
  const editor = window.getByTestId('editor-form');
  await expect(editor).not.toContainText(/[a-z0-9_]+:[a-z0-9_/]+/);
  await expect(window.getByTestId('item-tab')).toHaveCount(0);
  await expect(window.getByTestId('item-tab-plain')).toBeVisible();
  const generalMore = window.getByTestId('more-options-item-general');
  await expect(generalMore).toHaveAttribute('aria-expanded', 'false');
  await generalMore.click();
  await expect(generalMore).toHaveAttribute('aria-expanded', 'true');
  await expect(window.getByTestId('item-tab')).toBeVisible();
  // The id and Change id are in the Name section's More options.
  await expect(window.getByTestId('element-id')).toHaveCount(0);
  await window.getByTestId('more-options-thing-name').click();
  await expect(window.getByTestId('element-id')).toContainText(':');
  await expect(window.getByTestId('thing-change-id')).toBeVisible();
  // Edit as raw text under Where it goes.
  await window.getByTestId('more-options-where-it-goes').click();
  await window.getByTestId('more-options-where-raw-text').click();
  await expect(window.getByTestId('where-raw-text')).toBeVisible();
  // More options is remembered: back on Home and in again, the section's is still open.
  await window.getByTestId('toolbar-home').click();
  await things.locator('[data-testid^="my-thing-open-"]').first().click();
  await expect(window.getByTestId('more-options-item-general')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await window.screenshot({ path: join(outputDir, 'one-mode-path-studio.png') });
  await window.getByTestId('toolbar-home').click();

  // "Make things happen": a rule book, and a step without its item is a thing to fix. ---------
  await home.getByTestId('home-tile-rules').click();
  const studio = window.getByTestId('rule-book-studio');
  await expect(studio).toBeVisible();
  await studio.getByTestId('rule-add').click();
  const card = studio.getByTestId('rule-card');
  await expect(card).toHaveCount(1);
  // No keys in the plain view.
  await expect(card.getByTestId('rule-key')).toHaveCount(0);
  await pickFromMenu(window, card.getByTestId('rules-add-step-do'), 'Give an item');
  await expect(card.getByTestId('rules-chip-item')).toHaveAttribute('aria-invalid', 'true');
  await expect(fix).toContainText('Things to fix (1)');
  const row = fix.getByTestId('things-to-fix-0');
  await expect(row.getByTestId('things-to-fix-0-text')).toHaveText(
    'Rules is missing something it needs. Fill it in.',
  );
  // Plain words: no ids.
  await expect(row).not.toContainText('garden_mod:');

  // Share is blocked while something needs fixing.
  await expect(window.getByTestId('toolbar-share')).toBeDisabled();

  // "Show me" goes back to the chip; picking an item clears the problem.
  await window.getByTestId('toolbar-home').click();
  await expect(studio).toBeHidden();
  await row.getByTestId('things-to-fix-0-show').click();
  await expect(studio).toBeVisible();
  const chip = studio.getByTestId('rules-chip-item');
  await expect(chip).toBeFocused();
  await chip.click();
  const picker = window.getByTestId('thing-picker');
  await picker.getByTestId('thing-search').fill('apple');
  await picker.getByTestId('thing-minecraft:apple').click();
  await expect(picker).toBeHidden();
  await expect(chip).toHaveAccessibleName('Item: Apple');
  await expect(fix.getByTestId('things-to-fix-none')).toBeVisible();

  // My things now lists the rule book too.
  await window.getByTestId('toolbar-home').click();
  await expect(things.locator('li')).toHaveCount(2);

  // Share my mod: the jar with the export's defaults, and where it is. -------------------------
  await window.getByTestId('toolbar-share').click();
  await expect(window.getByTestId('share-done')).toBeVisible({ timeout: 30_000 });
  await expect(window.getByTestId('share-where')).toBeVisible();
  const jars = readdirSync(folders.outDir).filter((name) => name.endsWith('.jar'));
  expect(jars).toHaveLength(1);
  const jar = unzipSync(readFileSync(join(folders.outDir, jars[0] as string)));
  const names = Object.keys(jar);
  expect(names.some((name) => /^META-INF\/jars\/msm_runtime-.*\.jar$/.test(name))).toBe(true);
  expect(names.some((name) => /^msm\/[a-z0-9_]+\/item\/.+\.json$/.test(name))).toBe(true);
  expect(names.some((name) => /^msm\/[a-z0-9_]+\/script\/rules\/rules\.js$/.test(name))).toBe(true);
  await window.screenshot({ path: join(outputDir, 'one-mode-path.png') });
});

test('one mode: the list shows names and groups, More folds the files, Every setting', async () => {
  const MOD_ID = 'msm_sample_mod';
  base = mkdtempSync(join(tmpdir(), 'msm-one-mode-list-'));
  const folders = {
    projectDir: join(base, MOD_ID),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  cpSync(join(appDir, '..', 'fixtures', 'sample-mod'), folders.projectDir, { recursive: true });
  launched = await launchApp({ reuse: folders, moreOptions: 'closed' });
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await window.getByTestId('toolbar-open-project').click();

  const oreRow = window.getByTestId(`element-row-${MOD_ID}:ruby_ore`);
  const modRow = window.getByTestId(`element-row-${MOD_ID}:mod`);
  const more = window.getByTestId(`group-toggle-${MOD_ID}-more`);
  await expect(oreRow).toBeVisible();
  // Names, not ids.
  await expect(oreRow).not.toContainText(':');
  await expect(oreRow).toHaveAccessibleName(/Ruby/);
  // The mod's settings wait under "More".
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(modRow).toHaveCount(0);
  await more.click();
  await expect(modRow).toBeVisible();

  // Every setting: the whole form, under its More options.
  await oreRow.click();
  await expect(window.getByTestId('block-studio')).toBeVisible();
  await expect(window.getByTestId('schema-form')).toHaveCount(0);
  await window.getByTestId('more-options-every-setting').click();
  await expect(window.getByTestId('schema-form')).toBeVisible();
  await expect(window.getByTestId('play-controls')).toBeVisible();
  await expect(window.getByTestId('dock-tab-problems')).toBeVisible();
});
