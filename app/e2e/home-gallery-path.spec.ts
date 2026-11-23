/**
 * Home's gallery of everything that can be made (ADR 0129 D1, D5; the user's layout A, "Store
 * rows"). A brand-new install (`MSM_E2E_NEW_INSTALL`), Very easy's Home with no mod:
 *
 * 1. The hero with the product name and the start actions, then the chips and the rows,
 *    Featured first.
 * 2. Every chip jumps to its group, whose row comes into view and draws its first card's picture
 *    (lazy: a far row's pictures are not drawn before it is near).
 * 3. A group's **Show all N** opens all its cards as a grid; **Back** returns to the rows.
 * 4. **Make this** on the last card of the Games row asks for the mod's name, makes the mod and
 *    opens that flow in the Creator.
 *
 * With `GALLERY_SHOTS=<folder>` the window is drawn at device scale 2 and screenshots of Home's
 * top, a middle group and a Show all are saved there at widths 1280 and 1920.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp } from './fixtures';

const SHOTS = process.env.GALLERY_SHOTS;
const ARGS = SHOTS === undefined ? [] : ['--force-device-scale-factor=2'];

let base: string | undefined;
const launches: LaunchedApp[] = [];
const savedEnv: Record<string, string | undefined> = {};

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    delete savedEnv[key];
  }
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

function setEnv(key: string, value: string): void {
  if (!(key in savedEnv)) savedEnv[key] = process.env[key];
  process.env[key] = value;
}

/** The window at `width` CSS pixels wide (900 high). */
async function sizeWindow(launched: LaunchedApp, width: number): Promise<void> {
  await launched.app.evaluate(({ BrowserWindow }, w) => {
    BrowserWindow.getAllWindows()[0]?.setSize(w, 900);
  }, width);
  await launched.window.waitForTimeout(400);
}

/** The group ids in the chips' order. */
async function groupIds(home: Locator): Promise<string[]> {
  return home
    .getByTestId('gallery-chips')
    .locator('button')
    .evaluateAll((buttons) =>
      buttons.map((button) =>
        (button.getAttribute('data-testid') ?? '').replace('gallery-chip-', ''),
      ),
    );
}

/** Saves Home's top, a middle group and a Show all at `width`. */
async function shots(launched: LaunchedApp, home: Locator, width: number): Promise<void> {
  if (SHOTS === undefined) return;
  const window: Page = launched.window;
  await sizeWindow(launched, width);
  await home.evaluate((element) => {
    element.scrollTop = 0;
  });
  await window.waitForTimeout(1500);
  await window.screenshot({ path: join(SHOTS, `home-top-${width}.png`) });
  await home.getByTestId('gallery-chip-mobs').click();
  await window.waitForTimeout(2500);
  await window.screenshot({ path: join(SHOTS, `home-middle-${width}.png`) });
  await home.getByTestId('gallery-show-all-blocks').click();
  await window.waitForTimeout(2500);
  await window.screenshot({ path: join(SHOTS, `home-show-all-${width}.png`) });
  await home.getByTestId('gallery-back').click();
}

test('home gallery: every group, Show all, and Make this from a deep card', async () => {
  test.setTimeout(240_000);
  base = mkdtempSync(join(tmpdir(), 'msm-home-gallery-'));
  const msmHome = join(base, 'msm-home');
  if (SHOTS !== undefined) mkdirSync(SHOTS, { recursive: true });
  setEnv('MSM_E2E_NEW_INSTALL', '1');
  const launched = await launchApp({
    reuse: { projectDir: join(base, 'picked'), outDir: join(base, 'out'), msmHome },
    args: ARGS,
  });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  const welcome = window.getByTestId('welcome-dialog');
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'Got it' }).click();
  await expect(welcome).toBeHidden();
  const home = window.getByTestId('home');
  await expect(home).toBeVisible();

  // The hero and the rows, Featured first. ------------------------------------------------------
  const hero = home.getByTestId('home-hero');
  await expect(hero).toContainText('MCSuperMods');
  for (const id of ['home-new', 'home-open', 'home-surprise']) {
    await expect(hero.getByTestId(id)).toBeVisible();
  }
  const gallery = home.getByTestId('home-gallery');
  await expect(gallery).toBeVisible();
  const ids = await groupIds(home);
  expect(ids[0]).toBe('featured');
  expect(ids.length).toBeGreaterThan(6);
  for (const id of ['blocks', 'mobs', 'worlds', 'games']) expect(ids).toContain(id);

  // A far row draws no picture before it is near. --------------------------------------------
  const last = ids.at(-1) ?? '';
  const farFirst = gallery
    .getByTestId(`gallery-row-${last}`)
    .locator('[data-testid^="gallery-picture-"]')
    .first();
  await expect(farFirst).toHaveAttribute('data-loaded', 'false');

  // Every chip jumps to its group; its row's first picture is drawn. -------------------------
  for (const id of ids) {
    await home.getByTestId(`gallery-chip-${id}`).click();
    const group = gallery.getByTestId(`gallery-group-${id}`);
    await expect(group).toBeInViewport({ timeout: 10_000 });
    if (id === 'featured') {
      await expect(group.locator('[data-testid^="showcase-card-"]').first()).toBeVisible();
      continue;
    }
    const picture = group.locator('[data-testid^="gallery-picture-"]').first();
    await expect(picture).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 });
  }

  // The rows scroll sideways with their buttons. -----------------------------------------------
  const blocksRow = gallery.getByTestId('gallery-row-blocks');
  await home.getByTestId('gallery-chip-blocks').click();
  await blocksRow.hover();
  const right = gallery.getByTestId('gallery-row-blocks-right');
  await expect(right).toBeVisible();
  await right.click();
  await expect
    .poll(() => blocksRow.evaluate((element) => element.scrollLeft), { timeout: 5_000 })
    .toBeGreaterThan(0);

  // Show all and Back. -----------------------------------------------------------------------
  const count = await blocksRow.locator('li').count();
  await gallery.getByTestId('gallery-show-all-blocks').click();
  const all = gallery.getByTestId('gallery-all');
  await expect(all).toBeVisible();
  await expect(all.getByRole('heading', { name: 'Blocks' })).toBeVisible();
  await expect(gallery.getByTestId('gallery-all-grid').locator('li')).toHaveCount(count);
  await expect(gallery.getByTestId('gallery-back')).toBeFocused();
  await gallery.getByTestId('gallery-back').click();
  await expect(all).toBeHidden();
  await expect(blocksRow).toBeVisible();

  await shots(launched, home, 1280);
  await shots(launched, home, 1920);

  // Make this on the last card of the Games row. ---------------------------------------------
  await home.getByTestId('gallery-chip-games').click();
  const make = gallery
    .getByTestId('gallery-row-games')
    .locator('[data-testid^="gallery-make-"]')
    .last();
  const label = (await make.getAttribute('aria-label')) ?? '';
  const title = label.replace('Make this: ', '');
  expect(title).not.toBe('');
  await make.scrollIntoViewIfNeeded();
  await make.click();
  const newMod = window.getByTestId('new-mod-dialog');
  await expect(newMod).toBeVisible();
  const name = await newMod.getByTestId('new-mod-name').inputValue();
  expect(name).toMatch(/ Mod$/);
  await newMod.getByTestId('new-mod-dialog-submit').click();
  await expect(newMod).toBeHidden();
  await expect
    .poll(() => existsSync(join(msmHome, 'Documents', 'MCSuperMods', name, 'msm.project.json')))
    .toBe(true);
  const creator = window.getByTestId('creator-dialog');
  await expect(creator).toBeVisible({ timeout: 30_000 });
  await expect(creator.getByRole('heading', { name: `Create: ${title}` })).toBeVisible();
});
