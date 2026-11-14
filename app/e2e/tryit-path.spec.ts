/**
 * The Try it path (ADR 0085; brief B390, extended by B392): the test area in the app, under
 * SwiftShader WebGL.
 *
 * A copy of `fixtures/sample-mob` (one mob with a spawn egg) gains a Ruby Block with ambient
 * dust particles. Then:
 *
 * 1. F6 opens Try it; the first-run card closes with "Got it".
 * 2. The strip "Preview, not the real game." is there with its Play button, and cannot be closed.
 * 3. Looking down by key and pressing C places the Ruby Block: the readout counts 1, the canvas
 *    is mounted and the block's ambient particles appear.
 * 4. X breaks it: the count is 0.
 * 5. With the clock paused, C with the spawn egg hatches the mob: the readout shows 1 mob.
 * 6. X hits it: the mob is gone and the log says so.
 * 7. A block is placed again; the block's name is changed in the Block Studio; back in Try it
 *    (F6) the hotbar shows the new name and the block is still there.
 *
 * With `MSM_TRYIT_SHOT=<file.png>` the run also saves a picture of the area with a few blocks, a
 * mob and particles (launch with `--force-device-scale-factor=2` for a sharp one).
 */

import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { appDir, type LaunchedApp, launchApp } from './fixtures';

const NAMESPACE = 'msm_sample_mob';
const BLOCK_ID = `${NAMESPACE}:ruby_block`;
const EGG_ID = `${NAMESPACE}:glow_golem_spawn_egg`;
const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] as const;
const SHOT = process.env.MSM_TRYIT_SHOT;

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

/** The sample mob project with a Ruby Block that gives off dust. */
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
  const textures = join(projectDir, 'assets', NAMESPACE, 'textures', 'block');
  mkdirSync(textures, { recursive: true });
  copyFileSync(
    join(
      fixtures,
      'sample-mod',
      'assets',
      'msm_sample_mod',
      'textures',
      'block',
      'ruby_bricks.png',
    ),
    join(textures, 'ruby_block.png'),
  );
}

/** Presses a key on the test area's picture (it holds the keys). */
async function press(canvas: Locator, ...codes: string[]): Promise<void> {
  for (const code of codes) await canvas.press(code);
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

test('Try it: place, break, spawn, hit and keep the area through an edit', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-tryit-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  makeProject(folders.projectDir);
  const launched = await launchApp({
    reuse: folders,
    args: SHOT === undefined ? WEBGL_ARGS : [...WEBGL_ARGS, '--force-device-scale-factor=2'],
  });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  if (SHOT !== undefined) {
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
  await expect(window.getByTestId('tryit-slot-2')).toHaveAttribute('data-thing', EGG_ID);
  await press(canvas, 'ArrowDown', 'ArrowDown', 'ArrowDown');
  await expect(state).toHaveAttribute('data-pointed', 'the floor');
  await press(canvas, 'Digit1', 'KeyC');
  await expect(state).toHaveAttribute('data-blocks', '1');
  await expect(state).toHaveAttribute('data-pointed', BLOCK_ID);
  // The clock runs with the picture: the block's dust appears.
  await expect
    .poll(async () => Number(await state.getAttribute('data-particles')), { timeout: 15_000 })
    .toBeGreaterThan(0);

  // 4. Break it. --------------------------------------------------------------------------------
  await press(canvas, 'KeyX');
  await expect(state).toHaveAttribute('data-blocks', '0');

  // 5. Spawn the mob with the clock paused, so it stays where it hatched. --------------------
  await window.getByTestId('tryit-clock-pause').click();
  await expect(state).toHaveAttribute('data-paused', 'true');
  await press(canvas, 'Digit2', 'KeyC');
  await expect(state).toHaveAttribute('data-entities', '1');
  await expect(state).toHaveAttribute('data-pointed', /^mob /);

  // 6. Hit it. ----------------------------------------------------------------------------------
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
    await press(canvas, 'ArrowLeft', 'ArrowLeft', 'Digit2', 'KeyC', 'KeyZ');
    await press(canvas, 'ArrowRight', 'ArrowUp', 'ArrowUp');
    await expect(state).toHaveAttribute('data-entities', '1');
    await window.waitForTimeout(1000);
    await view.screenshot({ path: SHOT });
    await window.getByTestId('tryit-clear').click();
    await expect(state).toHaveAttribute('data-blocks', '0');
    await press(canvas, 'ArrowDown', 'ArrowDown', 'ArrowDown');
    await expect(state).toHaveAttribute('data-pointed', 'the floor');
  }

  // 7. An edit to the block keeps the area. ----------------------------------------------------
  await press(canvas, 'Digit1', 'KeyC');
  await expect(state).toHaveAttribute('data-blocks', '1');
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
  await expect(window.getByTestId('tryit-state')).toHaveAttribute('data-blocks', '1');
  await expect(window.getByTestId('tryit-card')).toBeHidden();
});
