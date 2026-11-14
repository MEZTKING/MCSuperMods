/**
 * Very easy mode end to end (ADR 0083). A brand-new install (`MSM_E2E_NEW_INSTALL`: the launch
 * notice is not suppressed, and the `MSM_HOME` has no settings yet) opens the Welcome in Very
 * easy and then Home, with no sidebar and no Problems panel. "Start a new mod" asks only for a
 * name and makes the mod under `<MSM_HOME>/Documents/MCSuperMods/` (test runs). The "Make food"
 * tile runs the Creator's Food flow, and My things shows the set. "Make things happen" opens a
 * new rule book; a step without its item is a thing to fix in plain words; "Show me" goes to
 * the chip, and picking an item clears it. "Share my mod" saves the Fabric mod jar with the
 * export's defaults (a stand-in runtime from `MSM_E2E_RUNTIME_DIR` is nested) and says where it
 * is.
 */

import {
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
import { type LaunchedApp, launchApp, outputDir } from './fixtures';

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

test('very easy: Welcome, Home, a new mod, a tile, My things, Things to fix, Share my mod', async () => {
  test.setTimeout(150_000);
  base = mkdtempSync(join(tmpdir(), 'msm-very-easy-'));
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

  launched = await launchApp({ reuse: folders });
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');

  // A brand-new install: the Welcome in Very easy, then Home. ---------------------------------
  const welcome = window.getByTestId('welcome-dialog');
  await expect(welcome).toBeVisible();
  await expect(welcome.getByTestId('welcome-mode-very-easy')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await welcome.getByRole('button', { name: 'Got it' }).click();
  await expect(welcome).toBeHidden();
  await expect(window.getByTestId('toolbar-very-easy')).toBeVisible();
  const home = window.getByTestId('home');
  await expect(home).toBeVisible();
  await expect(window.getByRole('navigation', { name: 'Elements' })).toHaveCount(0);
  await expect(window.getByTestId('dock-tab-problems')).toHaveCount(0);

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

  // "Make things happen": a rule book, and a step without its item is a thing to fix. ---------
  await home.getByTestId('home-tile-rules').click();
  const studio = window.getByTestId('rule-book-studio');
  await expect(studio).toBeVisible();
  await studio.getByTestId('rule-add').click();
  const card = studio.getByTestId('rule-card');
  await expect(card).toHaveCount(1);
  // Very easy shows no keys.
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
  await window.screenshot({ path: join(outputDir, 'very-easy-path.png') });
});
