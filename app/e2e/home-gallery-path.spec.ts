/**
 * Home's gallery of everything that can be made (ADR 0129 D1, D5; the user's layout A, "Store
 * rows"). A brand-new install (`MSM_E2E_NEW_INSTALL`), Very easy's Home with no mod:
 *
 * 1. The hero with the product name and the start actions, then the chips and the rows,
 *    Featured first.
 * 2. Every chip jumps to its group, whose row comes into view and draws its first card's picture
 *    (lazy: a far row's pictures are not drawn before it is near).
 * 3. A group's **Show all N** opens all its cards as a grid; **Back** returns to the rows.
 * 4. A card with a clip plays it on hover (one canvas on Home); a card whose example has no
 *    pictures shows its drawn picture.
 * 5. **More ideas** is the last row (one place only), with Shuffle; **Show all** opens the grid,
 *    **Back** returns.
 * 6. **Make this** on the last card of the Games row asks for the mod's name, makes the mod and
 *    opens that flow in the Creator.
 *
 * Every card in a row has the same height; at 900, 1280 and 1920 pixels wide the page does not
 * scroll sideways. With `GALLERY_SHOTS=<folder>` the window is drawn at device scale 2 and
 * screenshots of Home's top, a middle row, the More ideas row and a Show all are saved there at
 * widths 1280 and 1920.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp } from './fixtures';

const SHOTS = process.env.GALLERY_SHOTS;
/** WebGL under xvfb (the cards' clips), as the Showcase's e2e. */
const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const ARGS = SHOTS === undefined ? WEBGL_ARGS : [...WEBGL_ARGS, '--force-device-scale-factor=2'];

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

/** Every row's cards share one height; the page never scrolls sideways. */
async function checkLayout(launched: LaunchedApp, home: Locator, width: number): Promise<void> {
  await sizeWindow(launched, width);
  const heights = await home
    .locator('[data-testid^="gallery-row-"]')
    .evaluateAll((rows) =>
      rows
        .filter((row) => row.tagName === 'UL')
        .map((row) => [
          ...new Set(
            [...row.children].map((card) => Math.round(card.getBoundingClientRect().height)),
          ),
        ]),
    );
  for (const one of heights) expect(one.length).toBe(1);
  const sideways = await home.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
}

/** Saves Home's top, a middle row, the More ideas row and a Show all at `width`. */
async function shots(launched: LaunchedApp, home: Locator, width: number): Promise<void> {
  if (SHOTS === undefined) return;
  const window: Page = launched.window;
  await sizeWindow(launched, width);
  await home.evaluate((element) => {
    element.scrollTop = 0;
  });
  await window.mouse.move(2, 2);
  await window.waitForTimeout(2500);
  await window.screenshot({ path: join(SHOTS, `home-top-${width}.png`) });
  await home.getByTestId('gallery-chip-mobs').click();
  await window.waitForTimeout(3000);
  await window.screenshot({ path: join(SHOTS, `home-middle-${width}.png`) });
  await home.getByTestId('gallery-chip-ideas').click();
  await expect(home.getByTestId('idea-still-0')).toBeVisible({ timeout: 30_000 });
  await window.waitForTimeout(3000);
  await window.mouse.move(2, 2);
  await window.screenshot({ path: join(SHOTS, `home-more-ideas-${width}.png`), timeout: 90_000 });
  await home.getByTestId('gallery-show-all-blocks').click();
  await window.mouse.move(2, 2);
  await window.waitForTimeout(4000);
  await window.screenshot({ path: join(SHOTS, `home-show-all-${width}.png`), timeout: 90_000 });
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
  expect(ids.at(-1)).toBe('ideas');
  expect(ids.length).toBeGreaterThan(6);
  for (const id of ['blocks', 'mobs', 'worlds', 'games']) expect(ids).toContain(id);
  // More ideas only as the gallery's last row.
  await expect(home.getByTestId('more-ideas')).toHaveCount(1);
  await expect(gallery.getByTestId('gallery-group-ideas').getByTestId('more-ideas')).toHaveCount(1);

  // A far row draws no picture before it is near. --------------------------------------------
  const last = ids.at(-2) ?? '';
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
    if (id === 'ideas') {
      await expect(group.getByTestId('idea-card-0')).toBeVisible({ timeout: 30_000 });
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

  // A card with a clip plays it on hover; a card without pictures shows its drawn one. ----------
  await home.getByTestId('gallery-chip-vehicles').click();
  const vehicle = gallery
    .getByTestId('gallery-row-vehicles')
    .locator('[data-testid^="gallery-card-"]')
    .first();
  await expect(vehicle.locator('[data-testid^="gallery-example-"]')).toBeVisible();
  const vehiclePicture = vehicle.locator('[data-testid^="gallery-picture-"]');
  await expect(vehiclePicture).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 });
  await vehiclePicture.hover();
  await expect(vehiclePicture).toHaveAttribute('data-playing', 'true', { timeout: 10_000 });
  await expect(home.locator('canvas')).toHaveCount(1, { timeout: 30_000 });
  await window.mouse.move(2, 2);
  await expect(vehiclePicture).toHaveAttribute('data-playing', 'false', { timeout: 10_000 });
  await home.getByTestId('gallery-chip-scripts').click();
  const rule = gallery.getByTestId('gallery-picture-flow-game-rule');
  // Off the row's end: scrolled to, it comes near and is drawn.
  await rule.scrollIntoViewIfNeeded();
  await expect(rule).toHaveAttribute('data-picture', 'look', { timeout: 30_000 });
  const ruleStill = await gallery.getByTestId('gallery-still-flow-game-rule').evaluate((image) => {
    const page = globalThis as unknown as {
      devicePixelRatio: number;
      getComputedStyle(element: unknown): { imageRendering: string };
    };
    const one = image as unknown as {
      naturalWidth: number;
      getBoundingClientRect(): { width: number };
    };
    return {
      rendering: page.getComputedStyle(one).imageRendering,
      natural: one.naturalWidth,
      shown: Math.round(one.getBoundingClientRect().width * Math.min(2, page.devicePixelRatio)),
    };
  });
  expect(ruleStill.rendering).toBe('pixelated');
  expect(Math.abs(ruleStill.natural - ruleStill.shown)).toBeLessThanOrEqual(1);

  // More ideas: the last row, Shuffle, Show all and Back. -------------------------------------
  await home.getByTestId('gallery-chip-ideas').click();
  const ideasRow = gallery.getByTestId('gallery-group-ideas');
  await expect(ideasRow.getByRole('heading', { name: 'More ideas' })).toBeVisible();
  await expect(ideasRow.getByTestId('idea-name-0')).not.toBeEmpty({ timeout: 30_000 });
  const before = await ideasRow.getByTestId('idea-name-0').textContent();
  await ideasRow.getByTestId('more-ideas-shuffle').click();
  await expect(ideasRow.getByTestId('idea-name-0')).not.toHaveText(before ?? '', {
    timeout: 30_000,
  });
  await gallery.getByTestId('gallery-show-all-ideas').click();
  const ideasAll = gallery.getByTestId('gallery-all');
  await expect(ideasAll.getByTestId('ideas-list')).toBeVisible();
  await expect(ideasAll.getByTestId('idea-card-0')).toBeVisible({ timeout: 30_000 });
  await gallery.getByTestId('gallery-back').click();
  await expect(ideasAll).toBeHidden();
  await expect(ideasRow).toBeVisible();

  for (const width of [900, 1280, 1920]) await checkLayout(launched, home, width);
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
