/**
 * The fluid path and the sky of a dimension type (ADR 0099, ADR 0100 D2, D4, ADR 0101 D2, D5;
 * brief B483), under SwiftShader WebGL.
 *
 * Fluid: a brand-new install (`MSM_E2E_NEW_INSTALL`) opens Home in Very easy; "Make a block"
 * offers the Fluid flow, which with its defaults (and "They move faster" for someone in it) makes
 * Mint Water; Things to fix has nothing to fix (My things does not list fluids yet: a follow-up). In Advanced the Fluid Studio shows its still and
 * flowing preview. In Try it the bucket is in the picker (not the liquid block); poured at the
 * player's feet it is one block, drawn (the picture has more than one colour), "What happened"
 * says that it does not flow (limit Q29), and standing in it fires its `on_entity_inside`.
 *
 * Sky: a new project gets the Dimension flow with "Give it its own sky and rules" and a dark blue
 * sky; Try it's "Sky" offers the dimension, and choosing it draws that colour behind the area.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from 'playwright/test';
import {
  type LaunchedApp,
  launchApp,
  newProjectInFolder,
  openCreator,
  outputDir,
} from './fixtures';

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

/** Presses keys on the test area's picture. */
async function press(canvas: Locator, ...codes: string[]): Promise<void> {
  for (const code of codes) await canvas.press(code);
}

/** Opens Try it (F6) and closes the first-run card when it shows. */
async function openTryIt(
  window: Page,
): Promise<{ view: Locator; canvas: Locator; state: Locator }> {
  await window.keyboard.press('F6');
  const view = window.getByTestId('tryit-view');
  await expect(view).toBeVisible();
  const state = window.getByTestId('tryit-state');
  await expect(state).toHaveAttribute('data-blocks', /\d+/);
  const card = window.getByTestId('tryit-card');
  if (await card.isVisible()) await window.getByTestId('tryit-card-close').click();
  return { view, canvas: window.getByTestId('tryit-canvas'), state };
}

/**
 * The colours of the test area's picture on a 16 by 16 grid, read with `readPixels` in an
 * animation frame after the view's own; the frame with the most colours of a few is returned.
 */
async function pictureColours(view: Locator): Promise<number[][]> {
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
  return view.locator('canvas').evaluate(async (element) => {
    const canvas = element as unknown as { getContext(type: 'webgl'): PixelReader | null };
    const page = globalThis as unknown as { requestAnimationFrame(done: () => void): void };
    const gl = canvas.getContext('webgl');
    if (gl === null) return [];
    let best: number[][] = [];
    for (let frame = 0; frame < 10; frame += 1) {
      await new Promise<void>((done) => page.requestAnimationFrame(() => done()));
      const colours: number[][] = [];
      const pixel = new Uint8Array(4);
      for (let i = 0; i < 16; i += 1) {
        for (let j = 0; j < 16; j += 1) {
          const x = Math.floor(((i + 0.5) * gl.drawingBufferWidth) / 16);
          const y = Math.floor(((j + 0.5) * gl.drawingBufferHeight) / 16);
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          colours.push([pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0]);
        }
      }
      const distinct = (list: number[][]) => new Set(list.map((c) => c.join(','))).size;
      if (distinct(colours) > distinct(best)) best = colours;
    }
    return best;
  });
}

const distinctColours = (colours: number[][]): number =>
  new Set(colours.map((colour) => colour.join(','))).size;

test('fluid: the Fluid flow from Make a block, the Fluid Studio, a bucket poured in Try it', async () => {
  test.setTimeout(240_000);
  base = mkdtempSync(join(tmpdir(), 'msm-fluid-'));
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
  await newMod.getByTestId('new-mod-name').fill('Liquid Mod');
  await newMod.getByTestId('new-mod-dialog-submit').click();
  await expect(newMod).toBeHidden();
  const projectDir = join(folders.msmHome, 'Documents', 'MCSuperMods', 'Liquid Mod');
  await expect.poll(() => existsSync(join(projectDir, 'msm.project.json'))).toBe(true);
  const ns =
    (
      JSON.parse(readFileSync(join(projectDir, 'msm.project.json'), 'utf8')) as {
        namespaces: string[];
      }
    ).namespaces[0] ?? '';
  expect(ns).not.toBe('');
  const id = (path: string) => `${ns}:${path}`;

  // The Fluid flow from "Make a block", with an effect for someone in it. --------------------
  await home.getByTestId('home-tile-block').click();
  const creator = window.getByTestId('creator-dialog');
  await expect(creator).toBeVisible();
  await creator.getByTestId('creator-flow-fluid').click();
  await creator.getByTestId('param-effect').selectOption('minecraft:speed');
  const create = creator.getByTestId('creator-create');
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  await expect(creator).toBeHidden({ timeout: 30_000 });
  const fix = window.getByTestId('things-to-fix');
  await expect(fix.getByTestId('things-to-fix-none')).toBeVisible({ timeout: 30_000 });
  await expect(fix.getByTestId('things-to-fix-tips')).toHaveCount(0);

  // The Fluid Studio's preview. -------------------------------------------------------------
  await window.getByTestId(`element-row-${id('mint_water')}`).click();
  const studio = window.getByTestId('fluid-studio');
  await expect(studio).toBeVisible({ timeout: 30_000 });
  await expect(studio.getByTestId('fluid-preview-words')).toBeVisible();

  // Try it: the bucket pours Mint Water at the player's feet. ---------------------------------
  const { view, canvas, state } = await openTryIt(window);
  await window.getByTestId('tryit-picker-open').click();
  await expect(window.getByTestId(`tryit-picker-item-${id('mint_water')}`)).toHaveCount(0);
  await window.getByTestId(`tryit-picker-item-${id('mint_water_bucket')}`).click();
  await expect(window.getByTestId('tryit-picker')).toBeHidden();
  await canvas.focus();
  await press(canvas, ...Array.from({ length: 6 }, () => 'ArrowDown'));
  await expect(state).toHaveAttribute('data-pointed', 'the floor');
  await press(canvas, 'KeyC');
  await expect(state).toHaveAttribute('data-blocks', '1');
  const log = window.getByTestId('tryit-log');
  await expect(log).toContainText('You poured Mint Water from Bucket of Mint Water');
  await expect(log).toContainText(
    'Only in Minecraft: Mint Water flows (spreading a block every 0.25 seconds',
  );
  await expect(log).toContainText('in the preview it stays where you pour it');
  // Standing in it fires its on_entity_inside (the clock runs).
  await expect(log).toContainText('You are in Mint Water', { timeout: 15_000 });
  await expect(log).toContainText('in the preview you walk through it as through air');
  // Looking a little up, the poured fluid is drawn beside the floor.
  await press(canvas, 'ArrowUp', 'ArrowUp');
  await expect
    .poll(async () => distinctColours(await pictureColours(view)), { timeout: 10_000 })
    .toBeGreaterThan(1);
  await window.screenshot({ path: join(outputDir, 'fluid-path-tryit.png') });
});

test('sky: the Dimension flow with its own sky, chosen in Try it', async () => {
  test.setTimeout(180_000);
  base = mkdtempSync(join(tmpdir(), 'msm-sky-'));
  const folders = {
    projectDir: join(base, 'msm_sky'),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  launched = await launchApp({ reuse: folders, args: WEBGL_ARGS });
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await newProjectInFolder(window);
  await expect.poll(() => existsSync(join(folders.projectDir, 'msm.project.json'))).toBe(true);
  const manifest = JSON.parse(
    readFileSync(join(folders.projectDir, 'msm.project.json'), 'utf8'),
  ) as { namespaces: string[] };
  const ns = manifest.namespaces[0] ?? '';
  await expect(window.getByTestId(`element-row-${ns}:pack`)).toBeVisible();

  // The Dimension flow, "Give it its own sky and rules" with a dark blue sky. ---------------
  await openCreator(window);
  const creator = window.getByTestId('creator-dialog');
  await expect(creator).toBeVisible();
  await creator.getByTestId('creator-flow-dimension').click();
  await creator.getByTestId('param-own_sky').check();
  await creator.getByTestId('param-sky_colour').fill('#203070');
  await creator.getByTestId('creator-create').click();
  await expect(creator).toBeHidden({ timeout: 30_000 });
  await expect(window.getByTestId(`element-row-${ns}:ruby_realm_type`)).toBeVisible();

  // Try it: "Sky" offers Ruby Realm's sky; chosen, it is drawn behind the area. --------------
  const { view, canvas } = await openTryIt(window);
  const sky = window.getByTestId('tryit-sky');
  await expect(sky).toBeVisible();
  await expect(sky).toHaveAttribute('data-sky', '');
  await sky.selectOption(`${ns}:ruby_realm`);
  await expect(sky).toHaveAttribute('data-sky', '#203070');
  await canvas.focus();
  await press(canvas, 'ArrowUp', 'ArrowUp', 'ArrowUp');
  const isSky = ([r, g, b]: number[]): boolean =>
    Math.abs((r ?? 0) - 0x20) <= 2 &&
    Math.abs((g ?? 0) - 0x30) <= 2 &&
    Math.abs((b ?? 0) - 0x70) <= 2;
  await expect
    .poll(async () => (await pictureColours(view)).filter(isSky).length, { timeout: 10_000 })
    .toBeGreaterThan(100);
  await window.screenshot({ path: join(outputDir, 'fluid-path-sky.png') });
});
