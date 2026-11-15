/**
 * The Try it path (ADR 0085; brief B390, extended by B392): the test area in the app, under
 * SwiftShader WebGL.
 *
 * A copy of `fixtures/sample-mob` (one mob with a spawn egg) gains a Ruby Block with ambient
 * dust particles, a Ruby Door and a Ruby Slab. Then:
 *
 * 1. F6 opens Try it; the first-run card closes with "Got it".
 * 2. The strip "Preview, not the real game." is there with its Play button, and cannot be closed.
 * 3. Looking down by key and pressing C places the Ruby Block: the readout counts 1, the canvas
 *    is mounted, something was drawn (WebGL `readPixels`: not all one colour) and the block's
 *    ambient particles appear.
 * 4. X breaks it: the count is 0.
 * 5. The slab is placed as a bottom slab and broken; the door is placed (two blocks), C opens it
 *    (the pointed state shows `open=true`) and X breaks both halves.
 * 6. With the clock paused, C with the spawn egg hatches the mob: the readout shows 1 mob.
 * 7. X hits it: the mob is gone and the log says so.
 * 8. The slab and the block are placed again; the slab's texture is changed in the Block Studio
 *    and the block's name too; back in Try it (F6) the hotbar shows the new name and both blocks
 *    are still there.
 * 9. With a mob hatched again, "Clear the area" leaves no blocks and no mobs.
 * 10. Ground (B405): "Change ground…" to the Flat world: the readout says `ground=flat`, the
 *     player stands on the grass, and placing still works on it.
 * 11. Ground to a Quick world, the Island preset with a typed seed: the picker asks first (a
 *     block was placed), then the island is in, something is drawn, and "Clear the area" brings
 *     the island back.
 *
 * A third test (B428) drives a go-kart: a copy of `fixtures/sample-mob` gains the Go-kart
 * template's vehicle with its starter geometry and a texture; its item places it, C gets in, W
 * drives (the clock running) and D steers, Shift gets out, X hits it and Shift with X picks it
 * up, and "What happened" says what only the game does. With `MSM_TRYIT_VEHICLE_SHOT=<file.png>`
 * it saves a picture of the drive (launch at device scale 2 by the same switch).
 *
 * A fourth test (B429) presses a project key: the block project gains the Controls plugin, a
 * mana bar (a `set` value out of 100) and a hidden "Mana charged" text, and a key bind on K that
 * sets the bar to 60 and shows the text. Before the press the HUD layer draws nothing; after it,
 * the bar sits above the hotbar, centred and filled 49 of 81 pixels, the text at the top left,
 * and "What happened" says the key ran its event. With `MSM_TRYIT_HUD_SHOT=<file.png>` it saves a
 * picture of it (launch at device scale 2 by the same switch).
 *
 * A second test (B399) adds a project rule to a copy of `fixtures/sample-rules`: "when the Chime
 * Block is used, play a sound, give a Ruby and run a function". Using the block in Try it shows
 * the rule's sentence and its actions in "What happened", the Ruby in "Your items", the sound's
 * caption, and the `run_function` action as an "Only in Minecraft" line.
 *
 * With `MSM_TRYIT_SHOT=<file.png>` the run also saves a picture of the area with a few blocks, a
 * mob and particles (launch with `--force-device-scale-factor=2` for a sharp one). With
 * `MSM_TRYIT_GROUND_SHOTS=<folder>` it saves the grounds picker, the island with a block and a
 * mob, and the flat world (`40-tryit-grounds.png`, `41-tryit-quick-island.png`,
 * `42-tryit-flat.png`), also at device scale 2.
 */

import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vehicleGeometry } from '@msm/plugin-entities';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { appDir, type LaunchedApp, launchApp } from './fixtures';
import { gradientPng } from './png';

const NAMESPACE = 'msm_sample_mob';
const BLOCK_ID = `${NAMESPACE}:ruby_block`;
const DOOR_ID = `${NAMESPACE}:ruby_door`;
const SLAB_ID = `${NAMESPACE}:ruby_slab`;
const EGG_ID = `${NAMESPACE}:glow_golem_spawn_egg`;
const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] as const;
const SHOT = process.env.MSM_TRYIT_SHOT;
const GROUND_SHOTS = process.env.MSM_TRYIT_GROUND_SHOTS;
const VEHICLE_SHOT = process.env.MSM_TRYIT_VEHICLE_SHOT;
const HUD_SHOT = process.env.MSM_TRYIT_HUD_SHOT;
const SHARP = SHOT !== undefined || GROUND_SHOTS !== undefined || VEHICLE_SHOT !== undefined;

let base: string | undefined;
const launches: LaunchedApp[] = [];

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

/** Writes a project element file. */
function writeElement(projectDir: string, folder: string, path: string, element: object): void {
  const file = join(projectDir, 'content', NAMESPACE, folder, `${path}.json`);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, `${JSON.stringify(element, null, 2)}\n`);
}

/** The sample mob project with a Ruby Block that gives off dust, a Ruby Door and a Ruby Slab. */
function makeProject(projectDir: string): void {
  const fixtures = join(appDir, '..', 'fixtures');
  cpSync(join(fixtures, 'sample-mob'), projectDir, { recursive: true });
  const meta = { createdAt: '2026-11-14T00:00:00.000Z' };
  writeElement(projectDir, 'block', 'ruby_block', {
    data: {
      components: {
        'msm:ambient_particles': {
          chance: 0.5,
          count: 1,
          offset: [0.5, 1.05, 0.5],
          particle: { color: [1, 0.2, 0.3], scale: 0.6, type: 'minecraft:dust' },
          spread: [0.3, 0, 0.3],
          velocity: [0, 0.05, 0],
        },
      },
      display_name: 'Ruby Block',
      format: 1,
      loot: 'self',
      model: `${NAMESPACE}:block/ruby_block`,
      sound_type: 'stone',
    },
    formatVersion: 1,
    id: BLOCK_ID,
    kind: 'msm:block',
    meta,
  });
  writeElement(projectDir, 'model', 'block/ruby_block', {
    data: {
      parent: 'minecraft:block/cube_all',
      textures: { all: `${NAMESPACE}:block/ruby_block` },
    },
    formatVersion: 1,
    id: `${NAMESPACE}:block/ruby_block`,
    kind: 'minecraft:model',
    meta,
  });
  writeElement(projectDir, 'block', 'ruby_door', {
    data: {
      display_name: 'Ruby Door',
      format: 1,
      loot: 'self',
      set_type: 'wood',
      sound_type: 'wood',
      textures: {
        bottom: `${NAMESPACE}:block/ruby_door_bottom`,
        top: `${NAMESPACE}:block/ruby_door_top`,
      },
      type: 'door',
    },
    formatVersion: 1,
    id: DOOR_ID,
    kind: 'msm:block',
    meta,
  });
  writeElement(projectDir, 'block', 'ruby_slab', {
    data: {
      display_name: 'Ruby Slab',
      format: 1,
      loot: 'self',
      sound_type: 'stone',
      textures: { all: `${NAMESPACE}:block/ruby_block` },
      type: 'slab',
    },
    formatVersion: 1,
    id: SLAB_ID,
    kind: 'msm:block',
    meta,
  });
  const textures = join(projectDir, 'assets', NAMESPACE, 'textures', 'block');
  mkdirSync(textures, { recursive: true });
  const sampleTextures = join(
    fixtures,
    'sample-mod',
    'assets',
    'msm_sample_mod',
    'textures',
    'block',
  );
  copyFileSync(join(sampleTextures, 'ruby_bricks.png'), join(textures, 'ruby_block.png'));
  for (const half of ['bottom', 'top']) {
    copyFileSync(
      join(sampleTextures, `maple_door_${half}.png`),
      join(textures, `ruby_door_${half}.png`),
    );
  }
}

/** Presses a key on the test area's picture (it holds the keys). */
async function press(canvas: Locator, ...codes: string[]): Promise<void> {
  for (const code of codes) await canvas.press(code);
}

/**
 * How many different colours the test area's WebGL picture has, read with `readPixels` on a
 * 16 by 16 grid of points. The picture is read in an animation frame after the view's own (the
 * drawing buffer is not kept after it is shown); the largest count of a few frames is returned,
 * so a frame the view skipped (it draws at most 60 a second) reads as nothing rather than failing.
 */
async function pictureColours(view: Locator): Promise<number> {
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
  return view.locator('canvas').evaluate(async (element) => {
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

async function openTryIt(
  window: Page,
): Promise<{ view: Locator; canvas: Locator; state: Locator }> {
  await window.keyboard.press('F6');
  const view = window.getByTestId('tryit-view');
  await expect(view).toBeVisible();
  const state = window.getByTestId('tryit-state');
  await expect(state).toHaveAttribute('data-blocks', /\d+/);
  return { view, canvas: window.getByTestId('tryit-canvas'), state };
}

test('Try it: place, break, open a door, spawn, hit, keep the area through edits and clear it', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-tryit-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  makeProject(folders.projectDir);
  const launched = await launchApp({
    reuse: folders,
    args: SHARP ? [...WEBGL_ARGS, '--force-device-scale-factor=2'] : WEBGL_ARGS,
  });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  if (SHARP) {
    await launched.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
    );
  }
  await window.getByTestId('toolbar-open-project').click();
  await expect(window.getByTestId(`element-row-${BLOCK_ID}`)).toBeVisible();

  // 1. F6 opens Try it; the first-run card closes. -------------------------------------------
  const { view, canvas, state } = await openTryIt(window);
  await expect(window.getByTestId('toolbar-try-it')).toHaveAttribute('aria-pressed', 'true');
  await expect(window.getByTestId('tryit-card')).toBeVisible();
  await window.getByTestId('tryit-card-close').click();
  await expect(window.getByTestId('tryit-card')).toBeHidden();

  // 2. The strip, with Play, and nothing to close it with. -----------------------------------
  const strip = window.getByTestId('tryit-strip');
  await expect(strip).toContainText('Preview, not the real game.');
  await expect(strip.getByTestId('tryit-play')).toBeVisible();
  await expect(strip.getByRole('button')).toHaveCount(1);

  // 3. Place the project block. ---------------------------------------------------------------
  await expect(view.locator('canvas')).toHaveCount(1);
  await expect(window.getByTestId('tryit-slot-1')).toHaveAttribute('data-thing', BLOCK_ID);
  await expect(window.getByTestId('tryit-slot-2')).toHaveAttribute('data-thing', DOOR_ID);
  await expect(window.getByTestId('tryit-slot-3')).toHaveAttribute('data-thing', SLAB_ID);
  await expect(window.getByTestId('tryit-slot-4')).toHaveAttribute('data-thing', EGG_ID);
  await press(canvas, 'ArrowDown', 'ArrowDown', 'ArrowDown');
  await expect(state).toHaveAttribute('data-pointed', 'the floor');
  await press(canvas, 'Digit1', 'KeyC');
  await expect(state).toHaveAttribute('data-blocks', '1');
  await expect(state).toHaveAttribute('data-pointed', BLOCK_ID);
  // Something was drawn: the picture is not all one colour (limit L17: no picture goldens).
  await expect.poll(() => pictureColours(view), { timeout: 10_000 }).toBeGreaterThan(1);
  // The clock runs with the picture: the block's dust appears.
  await expect
    .poll(async () => Number(await state.getAttribute('data-particles')), { timeout: 15_000 })
    .toBeGreaterThan(0);

  // 4. Break it. --------------------------------------------------------------------------------
  await press(canvas, 'KeyX');
  await expect(state).toHaveAttribute('data-blocks', '0');

  // 5. A slab and a door. ------------------------------------------------------------------------
  await press(canvas, 'Digit3', 'KeyC');
  await expect(state).toHaveAttribute('data-blocks', '1');
  await expect(state).toHaveAttribute('data-pointed', new RegExp(`^${SLAB_ID}\\[.*type=bottom`));
  await press(canvas, 'KeyX');
  await expect(state).toHaveAttribute('data-blocks', '0');
  await press(canvas, 'Digit2', 'KeyC');
  await expect(state).toHaveAttribute('data-blocks', '2');
  await expect(state).toHaveAttribute('data-pointed', new RegExp(`^${DOOR_ID}\\[.*open=false`));
  // C on a door opens it, though a block is held.
  await press(canvas, 'KeyC');
  // The open door stands along its hinge side, so the pointer straight ahead passes it; a small
  // turn to the left points at it again.
  await press(canvas, 'ArrowLeft');
  await expect(state).toHaveAttribute('data-pointed', new RegExp(`^${DOOR_ID}\\[.*open=true`));
  await expect(state).toHaveAttribute('data-blocks', '2');
  await press(canvas, 'KeyX', 'ArrowRight');
  await expect(state).toHaveAttribute('data-blocks', '0');

  // 6. Spawn the mob with the clock paused, so it stays where it hatched. --------------------
  await window.getByTestId('tryit-clock-pause').click();
  await expect(state).toHaveAttribute('data-paused', 'true');
  await press(canvas, 'Digit4', 'KeyC');
  await expect(state).toHaveAttribute('data-entities', '1');
  await expect(state).toHaveAttribute('data-pointed', /^mob /);

  // 7. Hit it. ----------------------------------------------------------------------------------
  await press(canvas, 'KeyX');
  await expect(state).toHaveAttribute('data-entities', '0');
  await expect(window.getByTestId('tryit-log')).toContainText('You hit Glow Golem');
  await expect(window.getByTestId('tryit-log-only').first()).toContainText('Only in Minecraft:');

  if (SHOT !== undefined) {
    // A picture for the report: a row of blocks with their dust and a mob in front, the clock
    // running for the dust, then paused so the mob stays in the picture.
    await press(canvas, 'KeyZ', 'ArrowUp', 'Digit1');
    await press(canvas, 'ArrowLeft', 'KeyC', 'ArrowRight', 'KeyC', 'ArrowRight', 'KeyC');
    await press(canvas, 'ArrowLeft');
    await canvas.focus();
    await window.keyboard.down('KeyS');
    await window.waitForTimeout(1600);
    await window.keyboard.up('KeyS');
    await window.waitForTimeout(1500);
    await press(canvas, 'ArrowLeft', 'ArrowLeft', 'Digit4', 'KeyC', 'KeyZ');
    await press(canvas, 'ArrowRight', 'ArrowUp', 'ArrowUp');
    await expect(state).toHaveAttribute('data-entities', '1');
    await window.waitForTimeout(1000);
    await view.screenshot({ path: SHOT });
    await window.getByTestId('tryit-clear').click();
    await expect(state).toHaveAttribute('data-blocks', '0');
    await press(canvas, 'ArrowDown', 'ArrowDown', 'ArrowDown');
    await expect(state).toHaveAttribute('data-pointed', 'the floor');
  }

  // 8. Edits to the slab's texture and the block's name keep the area. -------------------------
  // The slab to the left (a quarter turn), the block straight ahead.
  await press(canvas, 'Digit3', ...Array<string>(6).fill('ArrowLeft'), 'KeyC');
  await expect(state).toHaveAttribute('data-blocks', '1');
  await expect(state).toHaveAttribute('data-pointed', new RegExp(`^${SLAB_ID}\\[`));
  await press(canvas, ...Array<string>(6).fill('ArrowRight'), 'Digit1', 'KeyC');
  await expect(state).toHaveAttribute('data-blocks', '2');
  await expect(state).toHaveAttribute('data-pointed', BLOCK_ID);

  await window.getByTestId(`element-row-${SLAB_ID}`).click();
  await expect(view).toBeHidden();
  const studio = window.getByTestId('block-studio');
  const texture = studio.getByTestId('block-texture-all');
  await expect(texture).toHaveValue(`${NAMESPACE}:block/ruby_block`);
  await texture.fill(`${NAMESPACE}:block/ruby_door_top`);
  await texture.press('Enter');
  await expect(studio.getByTestId('block-texture-all-thumbnail')).toBeVisible();
  await openTryIt(window);
  await expect(window.getByTestId('tryit-state')).toHaveAttribute('data-blocks', '2');

  await window.getByTestId(`element-row-${BLOCK_ID}`).click();
  await expect(view).toBeHidden();
  const name = window.getByTestId('block-display-name');
  await name.fill('Glow Ruby');
  await name.press('Tab');
  await openTryIt(window);
  await expect(window.getByTestId('tryit-slot-1')).toHaveAttribute(
    'aria-label',
    'Slot 1: Glow Ruby',
  );
  await expect(window.getByTestId('tryit-state')).toHaveAttribute('data-blocks', '2');
  await expect(window.getByTestId('tryit-card')).toBeHidden();

  // 9. "Clear the area" leaves nothing. -----------------------------------------------------------
  // Back in Try it the look starts level again; look down at the block.
  await press(canvas, 'ArrowDown', 'ArrowDown', 'ArrowDown');
  await expect(state).toHaveAttribute('data-pointed', BLOCK_ID);
  await press(canvas, 'Digit4', 'KeyC');
  await expect(state).toHaveAttribute('data-entities', '1');
  await window.getByTestId('tryit-clear').click();
  await expect(state).toHaveAttribute('data-blocks', '0');
  await expect(state).toHaveAttribute('data-entities', '0');
  await expect(state).toHaveAttribute('data-last-log', 'You cleared the area.');
  await expect(state).toHaveAttribute('data-pointed', 'the floor');
  await expect(state).toHaveAttribute('data-ground', 'grid');

  // 10. The Flat world. ---------------------------------------------------------------------------
  const flatBlocks = 4 * 48 * 48;
  await window.getByTestId('tryit-ground-change').click();
  const grounds = window.getByTestId('tryit-grounds');
  await expect(grounds).toBeVisible();
  await grounds.getByTestId('tryit-ground-flat').click();
  await grounds.getByTestId('tryit-ground-apply').click();
  await expect(grounds).toBeHidden();
  await expect(state).toHaveAttribute('data-ground', 'flat');
  await expect(state).toHaveAttribute('data-blocks', String(flatBlocks));
  await expect(state).toHaveAttribute('data-position', '24.50 4.00 24.50');
  await expect(window.getByTestId('tryit-ground-current')).toHaveText('Flat world');
  await press(canvas, 'ArrowDown', 'ArrowDown', 'ArrowDown');
  await expect(state).toHaveAttribute('data-pointed', /^minecraft:grass_block/);
  await press(canvas, 'Digit1', 'KeyC');
  await expect(state).toHaveAttribute('data-blocks', String(flatBlocks + 1));
  await expect(state).toHaveAttribute('data-pointed', BLOCK_ID);
  await expect.poll(() => pictureColours(view), { timeout: 10_000 }).toBeGreaterThan(1);
  if (GROUND_SHOTS !== undefined) {
    // Step back from the block with the clock running, then look at it across the grass.
    if ((await state.getAttribute('data-paused')) === 'true') {
      await window.getByTestId('tryit-clock-pause').click();
    }
    await canvas.focus();
    await window.keyboard.down('KeyS');
    await window.waitForTimeout(900);
    await window.keyboard.up('KeyS');
    await press(canvas, 'ArrowUp', 'ArrowUp');
    await window.waitForTimeout(1500);
    await view.screenshot({ path: join(GROUND_SHOTS, '42-tryit-flat.png') });
    await window.keyboard.down('KeyW');
    await window.waitForTimeout(900);
    await window.keyboard.up('KeyW');
    await press(canvas, 'ArrowDown', 'ArrowDown');
    await expect(state).toHaveAttribute('data-pointed', BLOCK_ID);
  }

  // 11. A Quick world: the Island with a typed seed; the picker asks first. ----------------------
  await window.getByTestId('tryit-ground-change').click();
  await grounds.getByTestId('tryit-ground-quick').click();
  await grounds.getByTestId('tryit-quick-preset-island').click();
  await expect(grounds.getByTestId('tryit-quick-shape')).toHaveValue('island');
  await grounds.getByTestId('tryit-quick-seed').fill('1234');
  if (GROUND_SHOTS !== undefined) {
    await view.screenshot({ path: join(GROUND_SHOTS, '40-tryit-grounds.png') });
  }
  await grounds.getByTestId('tryit-ground-apply').click();
  await expect(grounds.getByTestId('tryit-ground-confirm')).toBeVisible();
  await grounds.getByTestId('tryit-ground-confirm-yes').click();
  await expect(grounds).toBeHidden();
  await expect(state).toHaveAttribute('data-ground', 'quick');
  await expect(window.getByTestId('tryit-ground-current')).toHaveText(
    'Quick world: Island in water, seed 1234',
  );
  const islandBlocks = Number(await state.getAttribute('data-blocks'));
  expect(islandBlocks).toBeGreaterThan(20_000);
  // The player stands on the island, above the water (level 8).
  expect(Number((await state.getAttribute('data-position'))?.split(' ')[1])).toBeGreaterThan(8);
  await expect.poll(() => pictureColours(view), { timeout: 10_000 }).toBeGreaterThan(1);
  await press(canvas, 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Digit1', 'KeyC');
  await expect(state).toHaveAttribute('data-blocks', String(islandBlocks + 1));
  if (GROUND_SHOTS !== undefined) {
    // A mob beside the block, then up into the air (fly) and back, looking over the island;
    // the clock is paused for the picture so the mob stays.
    if ((await state.getAttribute('data-paused')) === 'true') {
      await window.getByTestId('tryit-clock-pause').click();
    }
    await press(canvas, 'ArrowLeft', 'ArrowLeft', 'Digit4', 'KeyC');
    await expect(state).toHaveAttribute('data-entities', '1');
    await press(canvas, 'ArrowRight', 'ArrowRight', 'ArrowUp');
    await canvas.focus();
    await window.keyboard.press('Space');
    await window.keyboard.press('Space');
    await expect(state).toHaveAttribute('data-flying', 'true');
    await window.keyboard.down('Space');
    await window.waitForTimeout(700);
    await window.keyboard.up('Space');
    await window.keyboard.down('KeyS');
    await window.waitForTimeout(1300);
    await window.keyboard.up('KeyS');
    await window.waitForTimeout(800);
    await window.getByTestId('tryit-clock-pause').click();
    await window.waitForTimeout(1000);
    await view.screenshot({ path: join(GROUND_SHOTS, '41-tryit-quick-island.png') });
    await window.getByTestId('tryit-clock-pause').click();
  }
  // "Clear the area" brings the island back as it was.
  await window.getByTestId('tryit-clear').click();
  await expect(state).toHaveAttribute('data-blocks', String(islandBlocks));
  await expect(state).toHaveAttribute('data-entities', '0');
  await expect(state).toHaveAttribute(
    'data-last-log',
    'You cleared the area; the ground is back as it was.',
  );
});

const RULES_NAMESPACE = 'msm_sample_rules';
const CHIME_ID = `${RULES_NAMESPACE}:chime_block`;

/**
 * The sample rules project with its rule books taken out and one rule added: when the Chime Block
 * is used, play the chime, give a Ruby and run the function `noted` (which does nothing).
 */
function makeRulesProject(projectDir: string): void {
  cpSync(join(appDir, '..', 'fixtures', 'sample-rules'), projectDir, { recursive: true });
  const content = join(projectDir, 'content', RULES_NAMESPACE);
  rmSync(join(content, 'rules'), { recursive: true, force: true });
  const meta = { createdAt: '2026-11-14T00:00:00.000Z' };
  const write = (folder: string, path: string, element: object): void => {
    const file = join(content, folder, `${path}.json`);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, `${JSON.stringify(element, null, 2)}\n`);
  };
  write('function', 'noted', {
    data: { lines: ['# Run by the chime rule; it changes nothing.'] },
    formatVersion: 1,
    id: `${RULES_NAMESPACE}:noted`,
    kind: 'minecraft:function',
    meta,
  });
  write('rules', 'chime_block_rules', {
    data: {
      counters: [],
      format: 1,
      rules: [
        {
          do: [
            { sound: 'minecraft:block.note_block.chime', step: 'play_sound', where: 'here' },
            { count: 1, item: `${RULES_NAMESPACE}:ruby`, step: 'give_item' },
            { function: `${RULES_NAMESPACE}:noted`, step: 'run_function' },
          ],
          key: 'ring_and_note',
          name: 'Ring and note',
          when: { subject: CHIME_ID, trigger: 'block_used' },
        },
      ],
    },
    formatVersion: 1,
    id: `${RULES_NAMESPACE}:chime_block_rules`,
    kind: 'msm:rules',
    meta,
  });
}

test('Try it: a rule gives an item and plays a sound, and run_function is only in Minecraft', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-tryit-rules-'));
  const folders = {
    projectDir: join(base, RULES_NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  makeRulesProject(folders.projectDir);
  const launched = await launchApp({ reuse: folders, args: WEBGL_ARGS });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await window.getByTestId('toolbar-open-project').click();
  await expect(window.getByTestId(`element-row-${CHIME_ID}`)).toBeVisible();

  const { canvas, state } = await openTryIt(window);
  await window.getByTestId('tryit-card-close').click();
  await expect(window.getByTestId('tryit-inventory-empty')).toBeVisible();

  // Place the Chime Block, then use it: the block takes the click and the rule runs.
  await expect(window.getByTestId('tryit-slot-1')).toHaveAttribute('data-thing', CHIME_ID);
  await press(canvas, 'ArrowDown', 'ArrowDown', 'ArrowDown');
  await expect(state).toHaveAttribute('data-pointed', 'the floor');
  await press(canvas, 'Digit1', 'KeyC');
  await expect(state).toHaveAttribute('data-blocks', '1');
  await expect(state).toHaveAttribute('data-pointed', CHIME_ID);
  // A paused clock keeps the sound's caption on screen.
  await window.getByTestId('tryit-clock-pause').click();
  await expect(state).toHaveAttribute('data-paused', 'true');
  await press(canvas, 'KeyC');
  await expect(state).toHaveAttribute('data-blocks', '1');

  const log = window.getByTestId('tryit-log');
  const lines = log.getByTestId('tryit-log-line');
  const ran = lines.filter({ hasText: 'You used Chime Block, so rule "Ring and note" ran.' });
  await expect(ran).toHaveCount(1);
  await expect(ran.getByTestId('tryit-log-link')).toHaveAttribute(
    'data-element',
    `${RULES_NAMESPACE}:chime_block_rules`,
  );
  await expect(lines.filter({ hasText: 'Played sound' })).toHaveCount(1);
  await expect(lines.filter({ hasText: 'Gave you 1 Ruby.' })).toHaveCount(1);
  const only = log
    .getByTestId('tryit-log-only')
    .filter({ hasText: `run function ${RULES_NAMESPACE}:noted` });
  await expect(only).toHaveCount(1);
  await expect(only).toHaveAttribute('data-kind', 'onlyInMinecraft');
  await expect(only).toContainText('Only in Minecraft:');
  await expect(only).toBeVisible();

  // The Ruby is in "Your items"; the chime shows as a caption (a Minecraft sound).
  const ruby = window.getByTestId('tryit-inventory-slot');
  await expect(ruby).toHaveCount(1);
  await expect(ruby).toHaveAttribute('data-item', `${RULES_NAMESPACE}:ruby`);
  await expect(ruby).toHaveAttribute('data-count', '1');
  await expect(window.getByTestId('tryit-caption').first()).toBeVisible();
});

const KART_ID = `${NAMESPACE}:go_kart`;

/** The sample mob project with the Go-kart template's vehicle, its starter geometry and texture. */
function makeKartProject(projectDir: string): void {
  cpSync(join(appDir, '..', 'fixtures', 'sample-mob'), projectDir, { recursive: true });
  const meta = { createdAt: '2026-11-15T00:00:00.000Z' };
  const geometry = vehicleGeometry('go_kart', 'go_kart');
  writeElement(projectDir, 'geo_model', 'entity/go_kart', {
    data: geometry,
    formatVersion: 1,
    id: `${NAMESPACE}:entity/go_kart`,
    kind: 'msm:geo_model',
    meta,
  });
  const wheels = ['wheel_front_left', 'wheel_front_right', 'wheel_back_left', 'wheel_back_right'];
  writeElement(projectDir, 'vehicle', 'go_kart', {
    data: {
      camera: { distance: 4 },
      display_name: 'Go-kart',
      engine: {
        horn: 'minecraft:item.goat_horn.sound.0',
        sound: 'minecraft:entity.minecart.riding',
      },
      format: 1,
      health: { max: 20 },
      model: { geometry: `${NAMESPACE}:entity/go_kart`, texture: `${NAMESPACE}:entity/go_kart` },
      movement: {
        acceleration: 0.03,
        grip: 0.9,
        max_speed: 0.5,
        mode: 'ground',
        step_height: 0.5,
        turn_rate: 6,
      },
      parts: { steering: wheels.slice(0, 2), wheel_radius: 0.19, wheels },
      seats: [{ offset: [0, 0.2, -0.1] }],
      size: [1.2, 0.6],
    },
    formatVersion: 1,
    id: KART_ID,
    kind: 'msm:vehicle',
    meta,
  });
  const description = (
    geometry['minecraft:geometry'] as { description: { texture_width: number } }[]
  )[0]?.description;
  const textures = join(projectDir, 'assets', NAMESPACE, 'textures', 'entity');
  mkdirSync(textures, { recursive: true });
  writeFileSync(
    join(textures, 'go_kart.png'),
    gradientPng(
      description?.texture_width ?? 64,
      description?.texture_width ?? 64,
      [236, 72, 52, 255],
      [52, 40, 64, 255],
    ),
  );
}

test('Try it: place the go-kart, get in, drive and steer, get out, hit it and pick it up', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-tryit-vehicle-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  makeKartProject(folders.projectDir);
  const launched = await launchApp({
    reuse: folders,
    args:
      VEHICLE_SHOT === undefined ? WEBGL_ARGS : [...WEBGL_ARGS, '--force-device-scale-factor=2'],
  });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  if (VEHICLE_SHOT !== undefined) {
    await launched.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
    );
  }
  await window.getByTestId('toolbar-open-project').click();
  await expect(window.getByTestId(`element-row-${KART_ID}`)).toBeVisible();
  const { view, canvas, state } = await openTryIt(window);
  await window.getByTestId('tryit-card-close').click();
  const vehicle = window.getByTestId('tryit-vehicle-state');

  // The kart's item is in the hotbar after the egg; it places the kart where the pointer is.
  const slot = window.locator(`[data-testid^="tryit-slot-"][data-thing="${KART_ID}"]`);
  await expect(slot).toHaveCount(1);
  const digit = (await slot.getAttribute('data-testid'))?.replace('tryit-slot-', '') ?? '1';
  await press(canvas, 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', `Digit${digit}`);
  await expect(state).toHaveAttribute('data-pointed', 'the floor');
  await press(canvas, 'KeyC');
  await expect(vehicle).toHaveAttribute('data-vehicles', '1');
  await expect(vehicle).toHaveAttribute('data-pointed', KART_ID);
  await expect(window.getByTestId('tryit-vehicle')).toBeVisible();

  // C gets in. With the clock paused, each N is one tick: W drives forwards, D steers right,
  // S brakes to a stop, so the drive is the same on every machine.
  await press(canvas, 'KeyC');
  await expect(vehicle).toHaveAttribute('data-riding', KART_ID);
  await expect(window.getByTestId('tryit-vehicle-get-out')).toBeVisible();
  await press(canvas, 'KeyZ');
  await expect(state).toHaveAttribute('data-paused', 'true');
  const steps = async (count: number): Promise<void> => {
    for (let i = 0; i < count; i += 1) await press(canvas, 'KeyN');
  };
  const number = async (name: string): Promise<number> => Number(await vehicle.getAttribute(name));
  await canvas.focus();
  await window.keyboard.down('KeyW');
  await steps(20);
  expect(await number('data-speed')).toBeGreaterThan(0.4);
  await window.keyboard.down('KeyD');
  await steps(5);
  await window.keyboard.up('KeyD');
  expect(await number('data-yaw')).toBeGreaterThan(20);
  const position = await vehicle.getAttribute('data-position');
  expect(Number(position?.split(' ')[2])).toBeGreaterThan(28);
  await expect.poll(() => pictureColours(view), { timeout: 10_000 }).toBeGreaterThan(1);
  if (VEHICLE_SHOT !== undefined) {
    // Look up along the road, drive a few ticks with the clock running, then the picture.
    await press(canvas, 'ArrowUp', 'ArrowUp', 'ArrowUp', 'KeyZ');
    await window.waitForTimeout(250);
    await press(canvas, 'KeyZ');
    await window.waitForTimeout(500);
    await view.screenshot({ path: VEHICLE_SHOT });
    await press(canvas, 'ArrowDown', 'ArrowDown', 'ArrowDown');
  }
  await window.keyboard.up('KeyW');
  await window.keyboard.down('KeyS');
  for (let i = 0; i < 30 && (await number('data-speed')) > 0; i += 1) await steps(1);
  await window.keyboard.up('KeyS');
  expect(await number('data-speed')).toBeLessThanOrEqual(0);
  await steps(1);

  // Shift gets out beside the kart.
  await window.keyboard.down('ShiftLeft');
  await steps(1);
  await window.keyboard.up('ShiftLeft');
  await steps(1);
  await expect(vehicle).toHaveAttribute('data-riding', '');
  const log = window.getByTestId('tryit-log');
  await expect(log).toContainText('You got into Go-kart');
  await expect(log).toContainText('You got out of Go-kart.');
  await expect(
    log
      .getByTestId('tryit-log-only')
      .filter({ hasText: "Go-kart's engine sound plays only in the game" }),
  ).toHaveCount(1);

  // The kart is on the left: a quarter turn points at it. X hits it, Shift with X picks it up.
  await press(canvas, ...Array<string>(6).fill('ArrowLeft'));
  await expect(vehicle).toHaveAttribute('data-pointed', KART_ID);
  await press(canvas, 'KeyX');
  await expect(window.getByTestId('tryit-vehicle-health')).toHaveText('19 of 20');
  await window.keyboard.down('ShiftLeft');
  await steps(1);
  await press(canvas, 'KeyX');
  await window.keyboard.up('ShiftLeft');
  await expect(vehicle).toHaveAttribute('data-vehicles', '0');
  await expect(log).toContainText('You picked up Go-kart.');
});

/** The block project with the Controls plugin, a mana bar, a hidden text and a key on K. */
function makeHudProject(projectDir: string): void {
  makeProject(projectDir);
  const manifestPath = join(projectDir, 'msm.project.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { plugins: string[] };
  manifest.plugins = [...manifest.plugins, 'msm.controls'].sort();
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const meta = { createdAt: '2026-11-15T00:00:00.000Z' };
  writeElement(projectDir, 'hud', 'mana', {
    data: {
      anchor: 'above_hotbar',
      back_color: '#14183c',
      fill_color: '#3c6cf0',
      format: 1,
      max: 100,
      size: [81, 5],
      type: 'bar',
      value: { source: 'set' },
    },
    formatVersion: 1,
    id: `${NAMESPACE}:mana`,
    kind: 'msm:hud',
    meta,
  });
  writeElement(projectDir, 'hud', 'charged', {
    data: {
      anchor: 'top_left',
      color: '#a0c0ff',
      format: 1,
      show: 'always',
      starts_hidden: true,
      text: 'Mana charged',
      type: 'text',
      value: { source: 'set' },
    },
    formatVersion: 1,
    id: `${NAMESPACE}:charged`,
    kind: 'msm:hud',
    meta,
  });
  const press = `${NAMESPACE}:charge_press`;
  writeElement(projectDir, 'key_bind', 'charge', {
    data: {
      default_key: 'key.keyboard.k',
      display_name: 'Charge',
      events: {
        [press]: {
          actions: [
            { hud: `${NAMESPACE}:mana`, type: 'set_hud', value: 60 },
            { hud: `${NAMESPACE}:charged`, type: 'show_hud' },
          ],
        },
      },
      format: 1,
      'msm:on_press': press,
    },
    formatVersion: 1,
    id: `${NAMESPACE}:charge`,
    kind: 'msm:key_bind',
    meta,
  });
}

test('Try it: a project key fills the mana bar and shows a hidden text on the HUD', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-tryit-hud-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  makeHudProject(folders.projectDir);
  const launched = await launchApp({
    reuse: folders,
    args: HUD_SHOT === undefined ? WEBGL_ARGS : [...WEBGL_ARGS, '--force-device-scale-factor=2'],
  });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  if (HUD_SHOT !== undefined) {
    await launched.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
    );
  }
  await window.getByTestId('toolbar-open-project').click();
  await expect(window.getByTestId(`element-row-${NAMESPACE}:charge`)).toBeVisible();
  const { view, canvas, state } = await openTryIt(window);
  await window.getByTestId('tryit-card-close').click();
  await expect(window.getByTestId('tryit-keys')).toContainText('Charge (your key)');
  const items = window.getByTestId('tryit-hud-item');
  await expect(items).toHaveCount(0);

  // A block in front, for the picture.
  await press(canvas, 'ArrowDown', 'ArrowDown', 'ArrowDown');
  await expect(state).toHaveAttribute('data-pointed', 'the floor');
  await press(canvas, 'Digit1', 'KeyC');
  await expect(state).toHaveAttribute('data-blocks', '1');
  await press(canvas, 'ArrowUp', 'ArrowUp');

  // K runs the key's event: the bar fills to 60 of 100 and the hidden text shows.
  await press(canvas, 'KeyK');
  await expect(items).toHaveCount(2);
  const mana = window.locator(`[data-testid="tryit-hud-item"][data-id="${NAMESPACE}:mana"]`);
  await expect(mana).toHaveAttribute('data-value', '60');
  await expect(mana).toHaveAttribute('data-filled', '49');
  const gui = (await window.getByTestId('tryit-hud').getAttribute('data-gui')) ?? '0 0';
  const [width, height] = gui.split(' ').map(Number) as [number, number];
  await expect(mana).toHaveAttribute('data-x', String(Math.floor((width - 81) / 2)));
  await expect(mana).toHaveAttribute('data-y', String(height - 52 - 5));
  const charged = window.locator(`[data-testid="tryit-hud-item"][data-id="${NAMESPACE}:charged"]`);
  await expect(charged).toHaveAttribute('data-text', 'Mana charged');
  await expect(charged).toHaveAttribute('data-x', '2');
  await expect(charged).toHaveAttribute('data-y', '2');
  await expect(window.getByTestId('tryit-log')).toContainText(
    `You pressed Charge (K), so its event "${NAMESPACE}:charge_press" ran.`,
  );
  await expect(window.getByTestId('tryit-log')).toContainText('Set Mana to 60 on screen.');
  await expect.poll(() => pictureColours(view), { timeout: 10_000 }).toBeGreaterThan(1);
  if (HUD_SHOT !== undefined) {
    await window.waitForTimeout(500);
    await view.screenshot({ path: HUD_SHOT });
  }
});
