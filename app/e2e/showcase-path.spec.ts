/**
 * The showcase path (ADR 0118; brief B570): the cards **See what you can make** on Very easy's
 * Home and in the New project dialog.
 *
 * 1. Under SwiftShader WebGL, a brand-new install (`MSM_E2E_NEW_INSTALL`): Very easy's Home with
 *    no mod shows the ten cards. Hovering a card mounts exactly one canvas, in that card, and
 *    its picture has more than one colour (WebGL `readPixels`, as `tryit-path` reads it);
 *    hovering another card still leaves one canvas, now in that card. With reduced motion
 *    (`page.emulateMedia`) no canvas is mounted and every card shows its still until a card's
 *    play button is pressed. With the setting **Play showcase clips** off no canvas is mounted,
 *    hovered or not. **Make this** on "A set of wood" asks for the mod's name ("Elm Mod"),
 *    makes the mod and opens the Creator on the Wood set flow.
 * 2. Under SwiftShader WebGL, Advanced (a fresh profile without the launch notice): the New
 *    project dialog's strip shows the cards, and **Make this** on "Plants that grow" goes on to
 *    the Crop wizard's second step.
 * 3. Without the WebGL switches: Home's cards show their drawn stills, their sentences and the
 *    line "This computer cannot show moving pictures here.", no canvas and no **Pause clips**;
 *    **Make this** on "A set of wood" still makes the mod and opens the Wood set flow.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp } from './fixtures';

const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] as const;

/** The ten cards, in the plan's order (ADR 0118 "The first showcases"). */
const CARD_IDS = [
  'wood-set',
  'pet',
  'crop',
  'machine',
  'vehicle',
  'portal',
  'sparkles',
  'trader',
  'fluid',
  'rules',
] as const;

const NO_MOVING_PICTURES = 'This computer cannot show moving pictures here.';

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

/** Sets an environment variable for the next launch (put back after the test). */
function setEnv(key: string, value: string): void {
  if (!(key in savedEnv)) savedEnv[key] = process.env[key];
  process.env[key] = value;
}

/** A launch with its own folders under a fresh temporary base. */
async function launch(name: string, args: readonly string[]): Promise<LaunchedApp> {
  base = mkdtempSync(join(tmpdir(), `msm-showcase-${name}-`));
  const launched = await launchApp({
    reuse: {
      projectDir: join(base, 'picked'),
      outDir: join(base, 'out'),
      msmHome: join(base, 'msm-home'),
    },
    args,
  });
  launches.push(launched);
  await launched.window.waitForLoadState('domcontentloaded');
  return launched;
}

/** Closes the Welcome of a new install (Very easy) and returns Home. */
async function veryEasyHome(window: Page): Promise<Locator> {
  const welcome = window.getByTestId('welcome-dialog');
  await expect(welcome).toBeVisible();
  await expect(welcome.getByTestId('welcome-mode-very-easy')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await welcome.getByRole('button', { name: 'Got it' }).click();
  await expect(welcome).toBeHidden();
  const home = window.getByTestId('home');
  await expect(home).toBeVisible();
  return home;
}

/** The showcase's cards in `scope`. */
function cardsIn(scope: Locator): Locator {
  return scope.locator('[data-testid^="showcase-card-"]');
}

/**
 * How many different colours the canvas in `scope` has, read with `readPixels` on a 16 by 16
 * grid of points, in an animation frame after the clip's own (the drawing buffer is not kept);
 * the largest count of a few frames, so a frame the view skipped reads as nothing (as
 * `tryit-path` reads it).
 */
async function pictureColours(scope: Locator): Promise<number> {
  // The e2e project has no DOM typings: the few WebGL members used are typed here.
  interface PixelReader {
    readonly drawingBufferWidth: number;
    readonly drawingBufferHeight: number;
    readonly RGBA: number;
    readonly UNSIGNED_BYTE: number;
    readPixels(
      x: number,
      y: number,
      w: number,
      h: number,
      f: number,
      t: number,
      out: Uint8Array,
    ): void;
  }
  return scope.locator('canvas').evaluate(async (element) => {
    const canvas = element as unknown as { getContext(type: 'webgl'): PixelReader | null };
    const page = globalThis as unknown as { requestAnimationFrame(done: () => void): void };
    const gl = canvas.getContext('webgl');
    if (gl === null) return 0;
    let most = 0;
    for (let frame = 0; frame < 10; frame += 1) {
      await new Promise<void>((done) => page.requestAnimationFrame(() => done()));
      const colours = new Set<number>();
      const pixel = new Uint8Array(4);
      for (let i = 0; i < 16; i += 1) {
        for (let j = 0; j < 16; j += 1) {
          const x = Math.floor(((i + 0.5) * gl.drawingBufferWidth) / 16);
          const y = Math.floor(((j + 0.5) * gl.drawingBufferHeight) / 16);
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          colours.add(
            (pixel[0] ?? 0) * 0x1000000 +
              (pixel[1] ?? 0) * 0x10000 +
              (pixel[2] ?? 0) * 0x100 +
              (pixel[3] ?? 0),
          );
        }
      }
      most = Math.max(most, colours.size);
    }
    return most;
  });
}

/**
 * **Make this** on "A set of wood" with no mod open: the name-only New prefilled "Elm Mod", the
 * mod made under `<MSM_HOME>/Documents/MCSuperMods/`, then the Creator on the Wood set flow.
 */
async function makeWoodSet(window: Page, showcase: Locator, msmHome: string): Promise<void> {
  await showcase.getByTestId('showcase-make-wood-set').click();
  const newMod = window.getByTestId('new-mod-dialog');
  await expect(newMod).toBeVisible();
  await expect(newMod.getByTestId('new-mod-name')).toHaveValue('Elm Mod');
  await newMod.getByTestId('new-mod-dialog-submit').click();
  await expect(newMod).toBeHidden();
  const projectDir = join(msmHome, 'Documents', 'MCSuperMods', 'Elm Mod');
  await expect.poll(() => existsSync(join(projectDir, 'msm.project.json'))).toBe(true);
  const creator = window.getByTestId('creator-dialog');
  await expect(creator).toBeVisible();
  await expect(creator.getByRole('heading', { name: 'Create: Wood set' })).toBeVisible();
  await expect(creator.getByTestId('creator-back')).toBeVisible();
}

test('showcase: ten cards on Home, one clip at a time, reduced motion, the setting and Make this', async () => {
  test.setTimeout(150_000);
  setEnv('MSM_E2E_NEW_INSTALL', '1');
  const launched = await launch('home', WEBGL_ARGS);
  const { window } = launched;
  const home = await veryEasyHome(window);

  // Ten cards under the buttons. ---------------------------------------------------------------
  const showcase = home.getByTestId('home-showcase');
  await expect(showcase).toBeVisible();
  await expect(showcase.getByRole('heading', { name: 'See what you can make' })).toBeVisible();
  const cards = cardsIn(showcase);
  await expect(cards).toHaveCount(CARD_IDS.length);
  for (const [index, id] of CARD_IDS.entries()) {
    await expect(cards.nth(index)).toHaveAttribute('data-testid', `showcase-card-${id}`);
  }
  await expect(showcase.getByTestId('showcase-pause')).toBeVisible();

  // Hovering a card mounts exactly one canvas, in that card, with a picture drawn. ------------
  const pet = showcase.getByTestId('showcase-card-pet');
  await pet.getByTestId('showcase-picture-pet').hover();
  await expect(pet.locator('canvas')).toHaveCount(1);
  await expect(showcase.locator('canvas')).toHaveCount(1);
  await expect.poll(() => pictureColours(pet), { timeout: 20_000 }).toBeGreaterThan(1);

  // Hovering another card moves the one clip there. -------------------------------------------
  const machine = showcase.getByTestId('showcase-card-machine');
  await machine.getByTestId('showcase-picture-machine').hover();
  await expect(machine.locator('canvas')).toHaveCount(1);
  await expect(pet.locator('canvas')).toHaveCount(0);
  await expect(showcase.locator('canvas')).toHaveCount(1);
  await expect.poll(() => pictureColours(machine), { timeout: 20_000 }).toBeGreaterThan(1);

  // Reduced motion: stills and no canvas, hovered or not, until a play button is pressed. ------
  await window.emulateMedia({ reducedMotion: 'reduce' });
  await expect(showcase.locator('canvas')).toHaveCount(0);
  for (const id of CARD_IDS) {
    await expect(showcase.getByTestId(`showcase-still-${id}`)).toBeVisible();
  }
  await showcase.getByTestId('showcase-picture-portal').hover();
  await expect(showcase.locator('canvas')).toHaveCount(0);
  const portal = showcase.getByTestId('showcase-card-portal');
  await portal.getByTestId('showcase-picture-portal').click();
  await expect(portal.getByTestId('showcase-picture-portal')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(portal.locator('canvas')).toHaveCount(1);
  await expect(showcase.locator('canvas')).toHaveCount(1);
  // Pressed again, it stops.
  await portal.getByTestId('showcase-picture-portal').click();
  await expect(showcase.locator('canvas')).toHaveCount(0);
  await window.emulateMedia({ reducedMotion: 'no-preference' });

  // Back to normal motion, the hovered card plays again. --------------------------------------
  await pet.getByTestId('showcase-picture-pet').hover();
  await expect(pet.locator('canvas')).toHaveCount(1);

  // The setting off: no canvas, hovered or not. -----------------------------------------------
  await window.getByTestId('toolbar-help').click();
  await window.getByTestId('toolbar-help-settings').click();
  const settings = window.getByTestId('settings-dialog');
  await expect(settings).toBeVisible();
  const setting = settings.getByTestId('settings-showcase-clips');
  await expect(setting).toBeChecked();
  await setting.uncheck();
  await expect(setting).not.toBeChecked();
  await settings.getByTestId('settings-close').click();
  await expect(settings).toBeHidden();
  await expect(home).toBeVisible();
  await pet.getByTestId('showcase-picture-pet').hover();
  await machine.getByTestId('showcase-picture-machine').hover();
  await expect(showcase.locator('canvas')).toHaveCount(0);
  for (const id of CARD_IDS) {
    await expect(showcase.getByTestId(`showcase-still-${id}`)).toBeVisible();
  }

  // Make this on "A set of wood": a name, the mod, then the Creator's Wood set flow. ----------
  await makeWoodSet(window, showcase, launched.msmHome);
});

test('showcase: the New project strip, Make this on "Plants that grow" opens the Crop wizard', async () => {
  const launched = await launch('advanced', WEBGL_ARGS);
  const { window } = launched;
  await expect(window.getByTestId('welcome-dialog')).toHaveCount(0);
  await window.getByTestId('toolbar-new-menu').click();
  await window.getByTestId('toolbar-new-from-starter').click();
  const dialog = window.getByTestId('new-project-dialog');
  await expect(dialog).toBeVisible();
  const strip = dialog.getByTestId('new-project-showcase');
  await expect(strip).toBeVisible();
  await expect(strip.getByRole('heading', { name: 'See what you can make' })).toBeVisible();
  await expect(cardsIn(strip)).toHaveCount(CARD_IDS.length);
  // At most one clip plays in the strip.
  const crop = strip.getByTestId('showcase-card-crop');
  await crop.getByTestId('showcase-picture-crop').hover();
  await expect(crop.locator('canvas')).toHaveCount(1);
  await expect(strip.locator('canvas')).toHaveCount(1);

  await crop.getByTestId('showcase-make-crop').click();
  const step = dialog.getByTestId('wizard-step-2');
  await expect(step).toBeVisible();
  await expect(dialog.getByRole('heading', { name: /^Crop: / })).toBeVisible();
  await expect(step.getByTestId('param-crop_name')).toBeVisible();
  await expect(dialog.getByTestId('new-project-showcase')).toHaveCount(0);
});

test('showcase without WebGL: drawn stills, sentences, the line, and Make this still works', async () => {
  test.setTimeout(120_000);
  setEnv('MSM_E2E_NEW_INSTALL', '1');
  const launched = await launch('no-webgl', []);
  const { window } = launched;
  const home = await veryEasyHome(window);

  const showcase = home.getByTestId('home-showcase');
  await expect(showcase).toBeVisible();
  const cards = cardsIn(showcase);
  await expect(cards).toHaveCount(CARD_IDS.length);
  for (const id of CARD_IDS) {
    const card = showcase.getByTestId(`showcase-card-${id}`);
    await expect(card.getByTestId(`showcase-still-${id}`)).toBeVisible();
    await expect(card.getByTestId(`showcase-no-webgl-${id}`)).toHaveText(NO_MOVING_PICTURES);
  }
  const wood = showcase.getByTestId('showcase-card-wood-set');
  await expect(wood).toContainText('A set of wood');
  await expect(wood).toContainText('Logs, planks, stairs, a door and a tree of your own.');
  await expect(showcase.getByTestId('showcase-pause')).toHaveCount(0);
  // The picture is a plain picture, not a play button.
  await expect(wood.getByRole('button', { name: 'Clip: A set of wood' })).toHaveCount(0);
  await expect(wood.getByRole('img', { name: 'Clip: A set of wood' })).toBeVisible();
  await wood.getByTestId('showcase-picture-wood-set').hover();
  await expect(showcase.locator('canvas')).toHaveCount(0);

  await makeWoodSet(window, showcase, launched.msmHome);
});
