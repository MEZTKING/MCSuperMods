/**
 * Home's endless ideas and Your mods (ADR 0128 D1, D2, D4, D5; the user's look at 1.5.6's Home).
 *
 * 1. A brand-new install (`MSM_E2E_NEW_INSTALL`), Very easy's Home with no mod: under the
 *    Showcase, **More ideas** loads its cards as it comes into view; scrolling far down keeps
 *    bringing new cards (card numbers past 300) while the cards behind are unmounted, so the
 *    page's element count stays bounded. **Make this** on the 30th card asks for the mod's name
 *    (the card's), makes the mod and fills it with the idea's things (My things).
 * 2. The same folders launched again (Advanced, then Very easy): **Your mods** shows the mod as
 *    a card with its own picture and its things above the Showcase; **Open** opens it.
 *
 * With `HOME_SHOTS=<folder>` the window is drawn at device scale 2 and screenshots of Home with
 * a mod and of More ideas far down are saved there.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp } from './fixtures';

const SHOTS = process.env.HOME_SHOTS;
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

function setEnv(key: string, value: string | undefined): void {
  if (!(key in savedEnv)) savedEnv[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

/** The highest card number mounted on the page, or -1. */
async function lastCard(window: Page): Promise<number> {
  const ids = await window
    .locator('[data-testid^="idea-card-"]')
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-testid') ?? ''),
    );
  let most = -1;
  for (const id of ids) {
    const n = Number(id.slice('idea-card-'.length));
    if (Number.isInteger(n) && n > most) most = n;
  }
  return most;
}

const cardCount = (window: Page): Promise<number> =>
  window.locator('[data-testid^="idea-card-"]').count();
const elementCount = (window: Page): Promise<number> => window.locator('*').count();

/** For the screenshots: a large window (drawn at device scale 2) and no notice over Home. */
async function forShots(launched: LaunchedApp): Promise<void> {
  await launched.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1500, 1000);
  });
  await launched.window.waitForTimeout(300);
}

/**
 * For the screenshot of Home with mods: two more copies of the mod under other names and a
 * folder that is gone, in the recent list beside it.
 */
function moreMods(msmHome: string, projectDir: string): void {
  const parent = join(msmHome, 'Documents', 'MCSuperMods');
  const settingsFile = join(msmHome, 'settings.json');
  const settings = JSON.parse(readFileSync(settingsFile, 'utf8')) as {
    recentProjects?: { root: string; name: string; openedAt: string }[];
  };
  const extra = [
    ['Castle Blocks', '2026-11-23T08:00:00.000Z'],
    ['Pet Foxes', '2026-11-20T10:00:00.000Z'],
  ].map(([name, openedAt]) => {
    const root = join(parent, name as string);
    cpSync(projectDir, root, { recursive: true });
    const file = join(root, 'msm.project.json');
    const project = JSON.parse(readFileSync(file, 'utf8')) as { name: string };
    project.name = name as string;
    writeFileSync(file, JSON.stringify(project, null, 2));
    return { root, name: name as string, openedAt: openedAt as string };
  });
  const gone = {
    root: join(parent, 'Old Test'),
    name: 'Old Test',
    openedAt: '2026-10-01T10:00:00.000Z',
  };
  settings.recentProjects = [...(settings.recentProjects ?? []), ...extra, gone];
  writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
}

/** Scrolls Home by `by` pixels and lets the list catch up. */
async function scrollHome(home: Locator, by: number): Promise<void> {
  await home.evaluate((element, step) => {
    element.scrollTop += step;
  }, by);
  await home.page().waitForTimeout(120);
}

test('home ideas: endless idea cards, Make this on the 30th, Your mods opens the mod', async () => {
  test.setTimeout(240_000);
  base = mkdtempSync(join(tmpdir(), 'msm-home-ideas-'));
  const folders = {
    projectDir: join(base, 'picked'),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  if (SHOTS !== undefined) mkdirSync(SHOTS, { recursive: true });
  setEnv('MSM_E2E_NEW_INSTALL', '1');
  const first = await launchApp({ reuse: folders, args: ARGS });
  launches.push(first);
  const { window } = first;
  await window.waitForLoadState('domcontentloaded');
  if (SHOTS !== undefined) await forShots(first);
  const welcome = window.getByTestId('welcome-dialog');
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'Got it' }).click();
  await expect(welcome).toBeHidden();
  const home = window.getByTestId('home');
  await expect(home).toBeVisible();

  // More ideas under the Showcase, made as it comes near the view. ---------------------------
  const ideas = home.getByTestId('more-ideas');
  await expect(ideas).toHaveCount(1);
  await expect(ideas.getByRole('heading', { name: 'More ideas' })).toBeVisible();
  const showcase = home.getByTestId('home-showcase');
  const order = await home.evaluate((element) => {
    const at = (id: string) =>
      [...element.querySelectorAll('[data-testid]')].findIndex(
        (one) => one.getAttribute('data-testid') === id,
      );
    return [at('home-showcase'), at('more-ideas')];
  });
  expect(order[0]).toBeGreaterThanOrEqual(0);
  expect(order[0]).toBeLessThan(order[1] ?? -1);
  await expect(showcase).toBeVisible();
  await ideas.scrollIntoViewIfNeeded();
  await expect(home.getByTestId('idea-card-0')).toBeVisible({ timeout: 30_000 });
  await expect(home.getByTestId('idea-name-0')).toHaveText(/ Mod$/, { timeout: 30_000 });
  await expect(home.getByTestId('idea-still-0')).toBeVisible({ timeout: 30_000 });

  // The 30th card: scroll until it is mounted, then Make this. -------------------------------
  const thirtieth = home.getByTestId('idea-card-29');
  for (let step = 0; step < 80 && (await thirtieth.count()) === 0; step += 1) {
    await scrollHome(home, 300);
  }
  await thirtieth.scrollIntoViewIfNeeded();
  const make = home.getByTestId('idea-make-29');
  await expect(make).toHaveAttribute('aria-disabled', 'false', { timeout: 60_000 });
  const name = (await home.getByTestId('idea-name-29').textContent()) ?? '';
  expect(name).toMatch(/ Mod$/);
  const nearCards = await cardCount(window);
  const nearElements = await elementCount(window);

  // Far down: new cards keep coming, the ones behind are gone, the page stays the same size.
  let seen = await lastCard(window);
  for (let step = 0; step < 150 && seen <= 300; step += 1) {
    // To the end each time, as a user dragging the bar down would.
    await scrollHome(home, 1_000_000);
    await expect.poll(() => lastCard(window)).toBeGreaterThan(seen);
    seen = await lastCard(window);
    expect(await cardCount(window)).toBeLessThanOrEqual(Math.max(40, nearCards + 8));
  }
  expect(seen).toBeGreaterThan(300);
  await expect(home.getByTestId('idea-card-0')).toHaveCount(0);
  await expect(home.getByTestId('idea-card-29')).toHaveCount(0);
  const farCards = await window.locator('[data-testid^="idea-card-"]').all();
  await expect(farCards[farCards.length - 1] as Locator).toBeAttached();
  const farElements = await elementCount(window);
  expect(farElements).toBeLessThanOrEqual(nearElements * 1.3 + 200);
  await expect(home.getByTestId('ideas-status')).toContainText('more ideas below');
  const farName = home.locator('[data-testid^="idea-name-"]').first();
  await expect(farName).toHaveText(/ Mod$/, { timeout: 30_000 });
  if (SHOTS !== undefined) {
    await scrollHome(home, -150);
    await window.waitForTimeout(1500);
    await window.screenshot({ path: join(SHOTS, 'home-more-ideas-far-down.png') });
  }

  // Back to the 30th card and make it. ---------------------------------------------------------
  await home.evaluate((element) => {
    element.scrollTop = 0;
  });
  for (let step = 0; step < 80 && (await thirtieth.count()) === 0; step += 1) {
    await scrollHome(home, 300);
  }
  await thirtieth.scrollIntoViewIfNeeded();
  await expect(home.getByTestId('idea-name-29')).toHaveText(name, { timeout: 30_000 });
  await make.click();
  const newMod = window.getByTestId('new-mod-dialog');
  await expect(newMod).toBeVisible();
  await expect(newMod.getByTestId('new-mod-name')).toHaveValue(name);
  await newMod.getByTestId('new-mod-dialog-submit').click();
  await expect(newMod).toBeHidden();
  const projectDir = join(folders.msmHome, 'Documents', 'MCSuperMods', name);
  await expect.poll(() => existsSync(join(projectDir, 'msm.project.json'))).toBe(true);
  const things = home.getByTestId('my-things');
  await expect(things).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => things.locator('li').count(), { timeout: 30_000 }).toBeGreaterThan(1);
  const madeThings = await things.locator('li').count();
  // Saved, so the next launch reads the mod's things and pictures from its folder.
  await window.keyboard.press('Control+S');
  await expect.poll(() => existsSync(join(projectDir, 'content'))).toBe(true);
  await expect.poll(() => existsSync(join(projectDir, 'assets'))).toBe(true);
  await first.close();
  launches.splice(0);
  if (SHOTS !== undefined) moreMods(folders.msmHome, projectDir);

  // Again: Your mods shows the mod as a card above the Showcase; Open opens it. -------------
  setEnv('MSM_E2E_NEW_INSTALL', undefined);
  const second = await launchApp({ reuse: folders, args: ARGS });
  launches.push(second);
  const again = second.window;
  await again.waitForLoadState('domcontentloaded');
  if (SHOTS !== undefined) await forShots(second);
  await again.getByTestId('toolbar-mode-very-easy').click();
  const home2 = again.getByTestId('home');
  await expect(home2).toBeVisible();
  const yours = home2.getByTestId('home-your-mods');
  await expect(yours.getByRole('heading', { name: 'Your mods' })).toBeVisible();
  const card = yours.getByTestId('home-recent-card-0');
  await expect(card).toContainText(name);
  await expect(card).toContainText('Opened just now');
  await expect(card.getByTestId('home-recent-things-0')).toHaveText(/\d+ things?/, {
    timeout: 30_000,
  });
  await expect(card.getByTestId('home-recent-picture-0')).toHaveAttribute('data-picture', 'own');
  await expect(card).not.toContainText(projectDir);
  const above = await home2.evaluate((element) => {
    const all = [...element.querySelectorAll('[data-testid]')].map((one) =>
      one.getAttribute('data-testid'),
    );
    return all.indexOf('home-your-mods') < all.indexOf('home-showcase');
  });
  expect(above).toBe(true);
  if (SHOTS !== undefined) {
    await again.getByRole('button', { name: 'Dismiss' }).click();
    await home2.evaluate((element) => {
      element.scrollTop = 140;
    });
    await again.waitForTimeout(1500);
    await again.screenshot({ path: join(SHOTS, 'home-with-mods.png') });
  }
  await card.getByTestId('home-recent-0').click();
  const things2 = home2.getByTestId('my-things');
  await expect(things2).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => things2.locator('li').count()).toBe(madeThings);
});
