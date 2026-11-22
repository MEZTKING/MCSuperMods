/**
 * The live world generation path (ADR 0119; plan brief B589).
 *
 * The project is a copy of `fixtures/worldgen-parity/mc-26.3` (MSM's own land files, drawn without
 * the client jar), with a Marker Block (a project block for Try it's hotbar) and a Poppy patch
 * feature (for the Scatter) added. No Minecraft folder is set up in these runs.
 *
 * A new view rolls a random seed, so every map first gets the fixed seed {@link SEED}.
 *
 * 1. The map (no WebGL: the map is a 2D canvas). The multi-noise dimension's biomes draw in the
 *    preview panel (the readout `terrain-state`: `data-pass="fine"` and `data-drawing="no"`; the
 *    picture has more than one colour); on the dimension `plain` (one fixed biome) Compare with
 *    vanilla is off with its set-up banner, a typed seed makes a new world, Height draws; an edit
 *    of the noise settings' sea level in the form redraws the map, the first (coarse) picture
 *    within 250 ms after the debounce (`data-edit-ms`); Side cut draws with the new sea level; a
 *    density function's Value map and a feature's Scatter draw.
 * 2. Try it (SwiftShader WebGL). The Biome Studio's **See it on the map** shows the live map; its
 *    view moves to a place on land (read from the Height map's hover line) and **Walk in it** opens
 *    Try it there with the ground picker on **My world generation** (the first-run card waits under
 *    it); the land comes in stages (terrain, then surface, then features, each timed in
 *    `tryit-generated-state`) and is drawn; a Marker Block placed on it is kept when an edit of the
 *    sea level (made while Try it is closed) makes the land again (`data-reason="edit"`, the next
 *    `data-runs`).
 * 3. Very easy (SwiftShader WebGL, a brand-new install). The world card "A world of islands"
 *    mounts a canvas whose picture has more than one colour; Make a world > Islands opens the
 *    Creator on its Map tab, the map follows an answer, and Create makes the world type, which
 *    opens with its live map.
 */

import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { appDir, type LaunchedApp, launchApp } from './fixtures';

const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] as const;

const NAMESPACE = 'worldgen_parity';
const DIMENSION_ID = `${NAMESPACE}:plain`;
const MULTI_NOISE_ID = `${NAMESPACE}:source_multi_noise`;
const SETTINGS_ID = `${NAMESPACE}:settings/plain`;
const FUNCTION_ID = `${NAMESPACE}:terrain/base`;
const FEATURE_ID = `${NAMESPACE}:poppy_patch`;
const BIOME_ID = `${NAMESPACE}:meadow`;
const BLOCK_ID = `${NAMESPACE}:marker_block`;
/** The fixture's sea level in `settings/plain`, and the one the edits set (below the land). */
const SEA_LEVEL = '48';
const LOWER_SEA_LEVEL = '40';
/** ADR 0119 D14: the first picture after an edit, counted from the end of the debounce. */
const COARSE_BUDGET_MS = 250;
/** The seed the maps are drawn with (a new view rolls a random one). */
const SEED = 'live world e2e';

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

/** Writes a project element file. */
function writeElement(projectDir: string, folder: string, path: string, element: object): void {
  const file = join(projectDir, 'content', NAMESPACE, folder, `${path}.json`);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, `${JSON.stringify(element, null, 2)}\n`);
}

/**
 * The worldgen parity fixture (26.3) with a Marker Block and a Poppy patch feature; the block
 * needs the block and resource pack plugins.
 */
function makeProject(projectDir: string): void {
  const fixtures = join(appDir, '..', 'fixtures');
  const fixture = join(fixtures, 'worldgen-parity', 'mc-26.3');
  cpSync(join(fixture, 'content'), join(projectDir, 'content'), { recursive: true });
  writeFileSync(
    join(projectDir, 'msm.project.json'),
    `${JSON.stringify(
      {
        formatVersion: 1,
        name: 'Worldgen Live',
        namespaces: ['minecraft', NAMESPACE],
        plugins: ['msm.resourcepack', 'msm.datapack', 'msm.blocks-items', 'msm.worldgen'],
        settings: {},
        targets: ['mc-26.3'],
      },
      null,
      2,
    )}\n`,
  );
  const meta = { createdAt: '2026-11-22T00:00:00.000Z' };
  writeElement(projectDir, 'block', 'marker_block', {
    data: {
      display_name: 'Marker Block',
      format: 1,
      loot: 'self',
      model: `${NAMESPACE}:block/marker_block`,
      sound_type: 'stone',
    },
    formatVersion: 1,
    id: BLOCK_ID,
    kind: 'msm:block',
    meta,
  });
  writeElement(projectDir, 'model', 'block/marker_block', {
    data: {
      parent: 'minecraft:block/cube_all',
      textures: { all: `${NAMESPACE}:block/marker_block` },
    },
    formatVersion: 1,
    id: `${NAMESPACE}:block/marker_block`,
    kind: 'minecraft:model',
    meta,
  });
  const textures = join(projectDir, 'assets', NAMESPACE, 'textures', 'block');
  mkdirSync(textures, { recursive: true });
  cpSync(
    join(
      fixtures,
      'sample-mod',
      'assets',
      'msm_sample_mod',
      'textures',
      'block',
      'ruby_bricks.png',
    ),
    join(textures, 'marker_block.png'),
  );
  writeElement(projectDir, 'worldgen/feature', 'poppy_patch', {
    data: {
      to_place: { state: 'minecraft:poppy', type: 'minecraft:simple' },
      type: 'minecraft:simple_block',
    },
    formatVersion: 1,
    id: FEATURE_ID,
    kind: 'minecraft:worldgen/feature',
    meta,
  });
}

/** A launch over a fresh copy of the project. */
async function launchProject(args: readonly string[]): Promise<LaunchedApp> {
  base = mkdtempSync(join(tmpdir(), 'msm-worldgen-live-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  makeProject(folders.projectDir);
  const launched = await launchApp({ reuse: folders, args });
  launches.push(launched);
  await launched.window.waitForLoadState('domcontentloaded');
  await launched.window.getByTestId('toolbar-open-project').click();
  await expect(launched.window.getByTestId(`element-row-${DIMENSION_ID}`)).toBeVisible();
  return launched;
}

/**
 * How many different colours a 2D canvas has, read on a 32 by 32 grid of points (the map, the
 * side cut, the value map and the scatter paint with a 2D context).
 */
async function canvasColours(canvas: Locator): Promise<number> {
  // The e2e project has no DOM typings: the few canvas members used are typed here.
  interface Picture {
    readonly width: number;
    readonly height: number;
    getContext(type: '2d'): {
      getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
    } | null;
  }
  return canvas.evaluate((element) => {
    const picture = element as unknown as Picture;
    const context = picture.getContext('2d');
    if (context === null || picture.width === 0 || picture.height === 0) return 0;
    const { data } = context.getImageData(0, 0, picture.width, picture.height);
    const colours = new Set<number>();
    for (let i = 0; i < 32; i += 1) {
      for (let j = 0; j < 32; j += 1) {
        const x = Math.floor(((i + 0.5) * picture.width) / 32);
        const y = Math.floor(((j + 0.5) * picture.height) / 32);
        const at = (y * picture.width + x) * 4;
        colours.add(
          (data[at] ?? 0) * 0x1000000 +
            (data[at + 1] ?? 0) * 0x10000 +
            (data[at + 2] ?? 0) * 0x100 +
            (data[at + 3] ?? 0),
        );
      }
    }
    return colours.size;
  });
}

/**
 * How many different colours the WebGL canvas in `scope` has, read with `readPixels` on a 16 by
 * 16 grid of points in an animation frame after the view's own; the largest count of a few frames
 * (as `tryit-path` reads it).
 */
async function webglColours(scope: Locator): Promise<number> {
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

/** Waits until the map's readout in `scope` says the picture of `mode` is drawn in full. */
async function mapDrawn(scope: Locator, mode: string): Promise<Locator> {
  const state = scope.getByTestId('terrain-state');
  await expect(state).toHaveAttribute('data-mode', mode);
  await expect(state).toHaveAttribute('data-world', /.+/);
  await expect(state).toHaveAttribute('data-pass', 'fine', { timeout: 30_000 });
  await expect(state).toHaveAttribute('data-drawing', 'no', { timeout: 30_000 });
  await expect(state).toHaveAttribute('data-banner', 'no');
  return state;
}

/** Types `seed` into the map's Seed box and waits for the new world to be drawn in full. */
async function typeSeed(map: Locator, seed: string, mode: string): Promise<Locator> {
  const state = map.getByTestId('terrain-state');
  const before = await state.getAttribute('data-world');
  const box = map.getByTestId('terrain-seed');
  await box.fill(seed);
  await box.press('Enter');
  await expect(state).not.toHaveAttribute('data-world', before ?? '');
  return mapDrawn(map, mode);
}

/**
 * Hovers a Height map on an 8 by 8 grid until the hover line names land at least `above` high,
 * and moves the view there (the X and Z boxes): the place Walk in it opens Try it at.
 */
async function centreOnLand(window: Page, map: Locator, above: number): Promise<void> {
  const canvas = map.getByTestId('terrain-map');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('The map has no box.');
  const hover = map.getByTestId('terrain-hover');
  for (let j = 1; j < 8; j += 1) {
    for (let i = 1; i < 8; i += 1) {
      await canvas.hover({ position: { x: (box.width * i) / 8, y: (box.height * j) / 8 } });
      await expect(hover).toContainText('land at y');
      const found = /X (-?\d+), Z (-?\d+).*land at y (-?\d+)/.exec(
        (await hover.textContent()) ?? '',
      );
      if (found === null || Number(found[3]) < above) continue;
      await window.mouse.move(0, 0);
      for (const [axis, value] of [
        ['x', found[1]],
        ['z', found[2]],
      ] as const) {
        const field = map.getByTestId(`terrain-${axis}`);
        await field.fill(value ?? '');
        await field.press('Enter');
      }
      return;
    }
  }
  throw new Error(`No land at y ${above} or above in the view.`);
}

/** Sets the noise settings' sea level in the form (the element must be open). */
async function setSeaLevel(window: Page, from: string, to: string): Promise<void> {
  const field = window.getByLabel('sea_level', { exact: true });
  await expect(field).toHaveValue(from);
  await field.fill(to);
  await field.press('Tab');
  await expect(field).toHaveValue(to);
}

test('the map: an edit redraws within the budget, Height, Side cut, a Value map, a Scatter, Compare without the jar', async () => {
  test.setTimeout(150_000);
  const { window } = await launchProject([]);
  const preview = window.getByTestId('editor-preview');

  // A multi-noise dimension's map shows its biomes. --------------------------------------------
  await window.getByTestId(`element-row-${MULTI_NOISE_ID}`).click();
  const biomesMap = preview.getByTestId('world-map');
  await expect(biomesMap).toBeVisible({ timeout: 30_000 });
  await expect(biomesMap.getByTestId('terrain-preview-tag')).toBeVisible();
  await mapDrawn(biomesMap, 'biomes');
  // A fixed seed (a new view rolls one), so the picture is the same on every run.
  await typeSeed(biomesMap, SEED, 'biomes');
  await expect.poll(() => canvasColours(biomesMap.getByTestId('terrain-map'))).toBeGreaterThan(1);

  // The plain dimension's map (one fixed biome). ---------------------------------------------
  await window.getByTestId(`element-row-${DIMENSION_ID}`).click();
  const map = preview.getByTestId('world-map');
  await expect(map).toBeVisible({ timeout: 30_000 });
  let state = await mapDrawn(map, 'biomes');

  // Compare with vanilla needs the jar: off, with its banner. ---------------------------------
  await expect(map.getByTestId('terrain-compare')).toBeDisabled();
  await expect(map.getByTestId('terrain-compare-set-up')).toContainText(
    "Compare with vanilla needs Minecraft's own land files.",
  );
  await expect(map.getByTestId('terrain-compare-view')).toHaveCount(0);

  // A typed seed makes another world. --------------------------------------------------------
  await expect(map.getByTestId('terrain-seed')).toHaveValue(SEED);
  state = await typeSeed(map, 'another seed', 'biomes');

  // Height. ---------------------------------------------------------------------------------
  await map.getByTestId('terrain-mode-height').click();
  state = await mapDrawn(map, 'height');
  await expect.poll(() => canvasColours(map.getByTestId('terrain-map'))).toBeGreaterThan(1);

  // An edit of the noise settings redraws the map: coarse first, within the budget. ----------
  await window.getByTestId(`element-row-${SETTINGS_ID}`).click();
  const settingsMap = preview.getByTestId('world-map');
  await expect(settingsMap).toBeVisible({ timeout: 30_000 });
  state = await mapDrawn(settingsMap, 'height');
  const beforeEdit = await state.getAttribute('data-world');
  await setSeaLevel(window, SEA_LEVEL, LOWER_SEA_LEVEL);
  await expect(state).not.toHaveAttribute('data-world', beforeEdit ?? '');
  state = await mapDrawn(settingsMap, 'height');
  const editMs = Number(await state.getAttribute('data-edit-ms'));
  const debounceMs = Number(await state.getAttribute('data-debounce-ms'));
  expect(editMs).toBeGreaterThan(0);
  expect(editMs - debounceMs).toBeLessThanOrEqual(COARSE_BUDGET_MS);

  // Side cut. -------------------------------------------------------------------------------
  await settingsMap.getByTestId('terrain-mode-side_cut').click();
  const cut = settingsMap.getByTestId('terrain-side-cut');
  await expect(cut).toBeVisible({ timeout: 30_000 });
  await expect(cut.getByTestId('terrain-cut')).toBeVisible();
  await expect(cut.getByTestId('terrain-cut-drawing')).toHaveCount(0, { timeout: 30_000 });
  await expect(cut.getByTestId('terrain-cut-hover')).toContainText(
    `the sea is at y ${LOWER_SEA_LEVEL}`,
  );
  await expect.poll(() => canvasColours(cut.getByTestId('terrain-cut'))).toBeGreaterThan(1);

  // A density function's Value map. ----------------------------------------------------------
  await window.getByTestId(`element-row-${FUNCTION_ID}`).click();
  const valueMap = preview.getByTestId('value-map');
  await expect(valueMap).toBeVisible({ timeout: 30_000 });
  const valueState = valueMap.getByTestId('terrain-value-state');
  await expect(valueState).toHaveAttribute('data-world', /.+/);
  await expect(valueState).toHaveAttribute('data-pass', 'fine', { timeout: 30_000 });
  await expect(valueState).toHaveAttribute('data-drawing', 'no', { timeout: 30_000 });
  await expect(valueMap.getByTestId('terrain-value-range')).toBeVisible();
  await expect.poll(() => canvasColours(valueMap.getByTestId('terrain-value'))).toBeGreaterThan(1);

  // A feature's Scatter. ----------------------------------------------------------------------
  await window.getByTestId(`element-row-${FEATURE_ID}`).click();
  const scatter = preview.getByTestId('scatter');
  await expect(scatter).toBeVisible({ timeout: 30_000 });
  const scatterState = scatter.getByTestId('terrain-scatter-state');
  await expect(scatterState).toHaveAttribute('data-placing', 'no', { timeout: 30_000 });
  await expect(scatterState).toHaveAttribute('data-banner', 'no');
  await expect
    .poll(async () => Number(await scatterState.getAttribute('data-placed')), { timeout: 30_000 })
    .toBeGreaterThan(0);
  await expect(scatter.getByTestId('terrain-scatter-count')).toBeVisible();
  await expect.poll(() => canvasColours(scatter.getByTestId('terrain-scatter'))).toBeGreaterThan(1);
});

test('Try it: See it on the map and Walk in it from the Biome Studio, the ground in stages, an edit keeps a placed block', async () => {
  test.setTimeout(150_000);
  const { window } = await launchProject(WEBGL_ARGS);

  // The Biome Studio's map line. --------------------------------------------------------------
  await window.getByTestId(`element-row-${BIOME_ID}`).click();
  const studio = window.getByTestId('biome-studio');
  await expect(studio).toBeVisible();
  const line = studio.getByTestId('studio-map-line');
  await line.getByTestId('studio-see-map').click();
  await expect(line.getByTestId('studio-see-map')).toHaveText('Hide the map');
  const studioMap = line.getByTestId('studio-map');
  await expect(studioMap).toBeVisible({ timeout: 30_000 });
  await mapDrawn(studioMap, 'biomes');
  // A fixed seed (a new view rolls one), so the land is the same on every run.
  await typeSeed(studioMap, SEED, 'biomes');
  // The plain world has one biome: its heights show the land.
  await studioMap.getByTestId('terrain-mode-height').click();
  await mapDrawn(studioMap, 'height');
  await expect.poll(() => canvasColours(studioMap.getByTestId('terrain-map'))).toBeGreaterThan(1);
  // Walk in it opens Try it at the map's seed and place: a place on land, above the sea.
  await centreOnLand(window, studioMap, Number(SEA_LEVEL) + 6);
  await mapDrawn(studioMap, 'height');

  // Walk in it: Try it with the ground picker on My world generation. -------------------------
  await line.getByTestId('studio-walk-in-it').click();
  const view = window.getByTestId('tryit-view');
  await expect(view).toBeVisible();
  const grounds = window.getByTestId('tryit-grounds');
  await expect(grounds).toBeVisible({ timeout: 30_000 });
  await expect(grounds.getByTestId('tryit-ground-generated')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const source = grounds.getByTestId('tryit-generated-source').and(grounds.locator(':checked'));
  await expect(source).toHaveCount(1);
  await grounds.getByTestId('tryit-ground-apply').click();
  await expect(grounds).toBeHidden({ timeout: 30_000 });
  // The first-run card waits under the picker.
  const card = window.getByTestId('tryit-card');
  await expect(card).toBeVisible();
  await window.getByTestId('tryit-card-close').click();
  await expect(card).toBeHidden();

  // The land comes in stages: terrain, then surface, then features. --------------------------
  const state = window.getByTestId('tryit-state');
  await expect(state).toHaveAttribute('data-ground', 'generated');
  const ground = window.getByTestId('tryit-generated-state');
  await expect(ground).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await expect(ground).toHaveAttribute('data-stage', 'features');
  await expect(ground).toHaveAttribute('data-reason', 'new');
  const times = await Promise.all(
    ['terrain', 'surface', 'features'].map(async (stage) =>
      Number(await ground.getAttribute(`data-${stage}-ms`)),
    ),
  );
  expect(times[0]).toBeGreaterThan(0);
  expect(times[1]).toBeGreaterThanOrEqual(times[0] ?? 0);
  expect(times[2]).toBeGreaterThanOrEqual(times[1] ?? 0);
  const runs = Number(await ground.getAttribute('data-runs'));
  expect(runs).toBeGreaterThanOrEqual(1);
  await expect.poll(() => webglColours(view), { timeout: 15_000 }).toBeGreaterThan(1);

  // A Marker Block on the land. ---------------------------------------------------------------
  const canvas = window.getByTestId('tryit-canvas');
  await expect(window.getByTestId('tryit-slot-1')).toHaveAttribute('data-thing', BLOCK_ID);
  for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown']) await canvas.press(key);
  await expect(state).toHaveAttribute('data-pointed', /^minecraft:/);
  const blocks = Number(await state.getAttribute('data-blocks'));
  for (const key of ['Digit1', 'KeyC']) await canvas.press(key);
  await expect(state).toHaveAttribute('data-blocks', String(blocks + 1));
  await expect(state).toHaveAttribute('data-pointed', BLOCK_ID);

  // An edit while Try it is closed makes the land again; the block is kept. -------------------
  await window.getByTestId(`element-row-${SETTINGS_ID}`).click();
  await expect(view).toBeHidden();
  await setSeaLevel(window, SEA_LEVEL, LOWER_SEA_LEVEL);
  await window.keyboard.press('F6');
  await expect(view).toBeVisible();
  await expect(ground).toHaveAttribute('data-reason', 'edit', { timeout: 30_000 });
  await expect(ground).toHaveAttribute('data-runs', String(runs + 1), { timeout: 30_000 });
  await expect(ground).toHaveAttribute('data-status', 'ready');
  await expect(ground).toHaveAttribute('data-edit-ms', /^\d+$/);
  await expect(state).toHaveAttribute('data-ground', 'generated');
  for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown']) await canvas.press(key);
  await expect(state).toHaveAttribute('data-pointed', BLOCK_ID);
  await expect.poll(() => webglColours(view), { timeout: 15_000 }).toBeGreaterThan(1);
});

test('Very easy: a world card draws, Make a world > Islands shows the Map tab and makes a world type', async () => {
  test.setTimeout(150_000);
  setEnv('MSM_E2E_NEW_INSTALL', '1');
  base = mkdtempSync(join(tmpdir(), 'msm-worldgen-live-easy-'));
  const launched = await launchApp({
    reuse: {
      projectDir: join(base, 'picked'),
      outDir: join(base, 'out'),
      msmHome: join(base, 'msm-home'),
    },
    args: WEBGL_ARGS,
  });
  launches.push(launched);
  const { window, msmHome } = launched;
  await window.waitForLoadState('domcontentloaded');
  const welcome = window.getByTestId('welcome-dialog');
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'Got it' }).click();
  await expect(welcome).toBeHidden();
  const home = window.getByTestId('home');
  await expect(home).toBeVisible();

  // A world card mounts a canvas with a picture drawn. -----------------------------------------
  const showcase = home.getByTestId('home-showcase');
  const islandsCard = showcase.getByTestId('showcase-card-world-islands');
  await islandsCard.getByTestId('showcase-picture-world-islands').hover();
  await expect(islandsCard.locator('canvas')).toHaveCount(1);
  await expect(showcase.locator('canvas')).toHaveCount(1);
  await expect.poll(() => webglColours(islandsCard), { timeout: 30_000 }).toBeGreaterThan(1);
  await window.mouse.move(0, 0);

  // A new mod, then Make a world > Islands. ----------------------------------------------------
  await home.getByTestId('home-new').click();
  const newMod = window.getByTestId('new-mod-dialog');
  await expect(newMod).toBeVisible();
  await newMod.getByTestId('new-mod-name').fill('Island World');
  await newMod.getByTestId('new-mod-dialog-submit').click();
  await expect(newMod).toBeHidden();
  const projectDir = join(msmHome, 'Documents', 'MCSuperMods', 'Island World');
  await expect.poll(() => existsSync(join(projectDir, 'msm.project.json'))).toBe(true);

  await home.getByTestId('home-tile-world').click();
  const chooser = window.getByTestId('make-chooser');
  await expect(chooser).toBeVisible();
  await chooser.getByRole('button', { name: /^Islands / }).click();
  const creator = window.getByTestId('creator-dialog');
  await expect(creator).toBeVisible();
  await expect(creator.getByRole('heading', { name: 'Create: Islands' })).toBeVisible();
  const mapTab = creator.getByTestId('creator-tab-map');
  await expect(mapTab).toBeVisible({ timeout: 30_000 });
  await expect(mapTab).toHaveAttribute('aria-selected', 'true');
  const creatorMap = creator.getByTestId('creator-map');
  await expect(creatorMap).toBeVisible();
  const mapView = creatorMap.getByTestId('creator-map-view');
  await mapDrawn(mapView, 'biomes');
  let state = await typeSeed(mapView, SEED, 'biomes');
  await expect.poll(() => canvasColours(mapView.getByTestId('terrain-map'))).toBeGreaterThan(1);

  // The map follows an answer. ----------------------------------------------------------------
  const before = await state.getAttribute('data-world');
  await creator.getByLabel('How much sea?').selectOption({ label: 'Lots: islands far apart' });
  await expect(state).not.toHaveAttribute('data-world', before ?? '', { timeout: 30_000 });
  state = await mapDrawn(mapView, 'biomes');

  // Create makes the world type. ---------------------------------------------------------------
  const create = creator.getByTestId('creator-create');
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  await expect(creator).toBeHidden({ timeout: 60_000 });
  // The world type opens, with its live map in the preview.
  await expect(window.getByTestId('element-notes-text')).toContainText('The World Type ');
  const presetMap = window.getByTestId('editor-preview').getByTestId('world-map');
  await expect(presetMap).toBeVisible({ timeout: 30_000 });
  await mapDrawn(presetMap, 'biomes');
  await expect(presetMap.getByTestId('terrain-seed')).toHaveValue(SEED);
  await expect.poll(() => canvasColours(presetMap.getByTestId('terrain-map'))).toBeGreaterThan(1);
});
