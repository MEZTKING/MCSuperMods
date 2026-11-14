/**
 * "Surprise me" end to end (ADR 0086). A brand-new install opens Home in Very easy with no mod;
 * "Surprise me" rolls a mod, "Roll again" gives another seed, a typed seed and "Change theme"
 * pick the mod, and "Make it" starts a new mod named after the theme under
 * `<MSM_HOME>/Documents/MCSuperMods/` with the things in My things and nothing to fix. Undo
 * takes the whole surprise back in one step. With the mod open, the Surprise me tile adds a
 * second surprise to it.
 *
 * With `MSM_SURPRISE_SHOTS=<folder>` the run launches at device scale 2 in a 1440 by 900 window
 * and saves `30-home-tiles.png` (Home's grid) and `31-surprise-me.png` (the dialog).
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import { type LaunchedApp, launchApp } from './fixtures';

const SHOTS = process.env.MSM_SURPRISE_SHOTS;

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

test('surprise me: roll, change theme, make a new mod, undo, and add to an open mod', async () => {
  test.setTimeout(150_000);
  base = mkdtempSync(join(tmpdir(), 'msm-surprise-'));
  const folders = {
    projectDir: join(base, 'picked'),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  savedEnv.MSM_E2E_NEW_INSTALL = process.env.MSM_E2E_NEW_INSTALL;
  process.env.MSM_E2E_NEW_INSTALL = '1';

  launched = await launchApp({
    reuse: folders,
    ...(SHOTS === undefined ? {} : { args: ['--force-device-scale-factor=2'] }),
  });
  const { window, app } = launched;
  await window.waitForLoadState('domcontentloaded');
  if (SHOTS !== undefined) {
    mkdirSync(SHOTS, { recursive: true });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900));
  }

  const welcome = window.getByTestId('welcome-dialog');
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'Got it' }).click();
  await expect(welcome).toBeHidden();
  const home = window.getByTestId('home');
  await expect(home).toBeVisible();

  // Without a mod: Surprise me rolls one. ------------------------------------------------------
  await home.getByTestId('home-surprise').click();
  const dialog = window.getByTestId('surprise-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('surprise-mod-name')).toHaveText(/ Mod$/);
  await expect(dialog).toContainText('a new mod');
  const seed = dialog.getByTestId('surprise-seed');
  const first = await seed.inputValue();
  await dialog.getByTestId('surprise-roll').click();
  await expect(seed).not.toHaveValue(first);

  // A typed seed and a chosen theme pick the mod.
  await seed.fill('2026');
  await dialog.getByTestId('surprise-change-theme').click();
  await dialog.getByTestId('surprise-theme-ruby').click();
  await expect(dialog.getByTestId('surprise-mod-name')).toHaveText('Ruby Mod');
  await expect(dialog.getByTestId('surprise-thing-2')).toBeVisible();
  const count = await dialog.getByTestId(/^surprise-thing-\d+$/).count();
  expect(count).toBeGreaterThanOrEqual(3);
  await expect(dialog.getByTestId('surprise-make')).toBeEnabled();
  if (SHOTS !== undefined) await window.screenshot({ path: join(SHOTS, '31-surprise-me.png') });

  // Make it: a new mod named after the theme, with the things in My things. ------------------
  await dialog.getByTestId('surprise-make').click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  const projectDir = join(folders.msmHome, 'Documents', 'MCSuperMods', 'Ruby Mod');
  await expect.poll(() => existsSync(join(projectDir, 'msm.project.json'))).toBe(true);
  const things = home.getByTestId('my-things');
  await expect(things).toBeVisible();
  await expect.poll(() => things.locator('li').count()).toBeGreaterThanOrEqual(3);
  const fix = window.getByTestId('things-to-fix');
  await expect(fix.getByTestId('things-to-fix-none')).toBeVisible({ timeout: 30_000 });
  await expect(home.getByTestId('home-tile-surprise')).toBeVisible();
  if (SHOTS !== undefined) await window.screenshot({ path: join(SHOTS, '30-home-tiles.png') });

  // One undo step takes the surprise back.
  await window.getByTestId('toolbar-undo').click();
  await expect(home.getByTestId('my-things-empty')).toBeVisible();
  await window.getByTestId('toolbar-redo').click();
  await expect.poll(() => things.locator('li').count()).toBeGreaterThanOrEqual(3);
  const before = await things.locator('li').count();

  // With the mod open, the tile adds another surprise to it. ---------------------------------
  await home.getByTestId('home-tile-surprise').click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('added to your mod');
  await seed.fill('2026');
  await dialog.getByTestId('surprise-change-theme').click();
  await dialog.getByTestId('surprise-theme-ruby').click();
  await expect(dialog.getByTestId('surprise-mod-name')).toHaveText('Ruby Mod');
  await dialog.getByTestId('surprise-make').click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect.poll(() => things.locator('li').count()).toBeGreaterThan(before);
  await expect(fix.getByTestId('things-to-fix-none')).toBeVisible({ timeout: 30_000 });
});
