/**
 * Settings opens over the open dialog (ADR 0131 D5, B702) in the built app. The "Minecraft" is a
 * made-up `.minecraft` folder whose client jar holds MSM's own stand-in PNGs at Minecraft's
 * texture paths (`test/helpers/synthetic-jar.ts`'s `makePng`), as `minecraft-textures-path`
 * uses: no Mojang file is read or written.
 *
 * New texture opens the painter; three pixels are painted. **Start from a Minecraft texture**
 * says the Minecraft folder is not set up, and its **Set up Minecraft folder** opens Settings
 * over the painter. Settings extracts the textures and closes: the painter is still open with its
 * three pixels (three undo steps take them back, three redo steps put them back), and its
 * **Start from a Minecraft texture** now lists the textures. Escape closes only the top dialog.
 * Save writes the painted picture with the three pixels.
 *
 * `SETTINGS_SHOTS=<folder>` saves Settings over the painter at 1280 and 1920 wide, device scale 2.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultTargetId, targetById } from '@msm/targets';
import { strToU8, zipSync } from 'fflate';
import { expect, test } from 'playwright/test';
import { makeOfficialDir } from '../test/helpers/fake-launchers';
import { KEPT_ENTRIES, makePng } from '../test/helpers/synthetic-jar';
import { type LaunchedApp, launchApp, newProjectInFolder } from './fixtures';
import { readPng } from './png';

/** The project folder name; a new project's namespace is derived from it. */
const NAMESPACE = 'msm_settings_over';

const SHOTS = process.env.SETTINGS_SHOTS;

/** The built-in target's Minecraft version (new projects use the default target). */
function mcVersion(): string {
  const bundle = targetById(defaultTargetId);
  if (bundle === undefined) throw new Error('No default target.');
  return bundle.target.mcVersion;
}

/** A client jar of MSM-made stand-in pictures at Minecraft's texture paths. */
function standInJar(): Uint8Array {
  const textures = 'assets/minecraft/textures';
  return zipSync(
    {
      'META-INF/MANIFEST.MF': strToU8('Manifest-Version: 1.0\r\n'),
      ...KEPT_ENTRIES,
      [`${textures}/block/stone.png`]: makePng(16, 16),
      [`${textures}/block/dirt.png`]: makePng(16, 16),
    },
    { level: 6, mtime: new Date(2000, 0, 1) },
  );
}

let base: string | undefined;
let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

test('settings over the painter: set up Minecraft while painting keeps the painting', async () => {
  test.setTimeout(180_000);
  const version = mcVersion();
  base = mkdtempSync(join(tmpdir(), 'msm-settings-over-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  const minecraftDir = await makeOfficialDir(join(base, 'minecraft'), {
    jars: { [version]: standInJar() },
  });
  mkdirSync(folders.msmHome, { recursive: true });
  writeFileSync(
    join(folders.msmHome, 'settings.json'),
    `${JSON.stringify({ minecraftDir }, null, 2)}\n`,
  );

  launched = await launchApp({
    reuse: folders,
    ...(SHOTS === undefined ? {} : { args: ['--force-device-scale-factor=2'] }),
  });
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await newProjectInFolder(window);
  await expect(window.getByTestId(`element-row-${NAMESPACE}:pack`)).toBeVisible();

  // New texture, then the painter: three pixels along the top row.
  await window.getByTestId(`assets-new-texture-${NAMESPACE}`).click();
  const newTexture = window.getByTestId('new-texture-dialog');
  await expect(newTexture).toBeVisible();
  await newTexture.getByTestId('new-texture-name').fill('ruby');
  await newTexture.getByTestId('new-texture-kind').selectOption('block');
  await newTexture.getByTestId('new-texture-dialog-submit').click();
  const painter = window.getByTestId('texture-editor');
  await expect(painter).toBeVisible();
  const canvas = painter.getByTestId('texture-canvas');
  await expect(canvas).toHaveAttribute('aria-label', /16 by 16 pixels/);
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('The canvas has no box.');
  const cell = box.width / 16;
  for (const x of [0, 2, 4]) {
    await canvas.click({ position: { x: x * cell + cell / 2, y: cell / 2 } });
  }
  const undo = painter.getByRole('button', { name: 'Undo' });
  const redo = painter.getByRole('button', { name: 'Redo' });
  await expect(undo).toBeEnabled();

  // Start from a Minecraft texture: not set up; its Set up opens Settings over the painter.
  await painter.getByTestId('texture-start-minecraft').click();
  const picker = window.getByTestId('mc-texture-picker');
  await expect(picker.getByTestId('mc-texture-not-set-up')).toBeVisible();
  await picker.getByTestId('mc-texture-set-up').click();
  const settings = window.getByTestId('settings-dialog');
  await expect(settings).toBeVisible();
  await expect(painter).toBeVisible();
  if (SHOTS !== undefined) {
    mkdirSync(SHOTS, { recursive: true });
    for (const width of [1280, 1920]) {
      await launched.app.evaluate(({ BrowserWindow }, w) => {
        BrowserWindow.getAllWindows()[0]?.setSize(w, 900);
      }, width);
      await window.waitForTimeout(600);
      await window.mouse.move(2, 2);
      await window.screenshot({ path: join(SHOTS, `settings-over-painter-${width}.png`) });
    }
  }
  await settings.getByTestId('settings-extract').click();
  await expect(settings.getByTestId('settings-status')).toContainText(
    `Vanilla assets for Minecraft ${version} are extracted`,
    { timeout: 30_000 },
  );
  // Escape closes Settings only; the painter stays with its three steps.
  await window.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(painter).toBeVisible();
  for (let step = 0; step < 3; step += 1) await undo.click();
  await expect(undo).toBeDisabled();
  for (let step = 0; step < 3; step += 1) await redo.click();
  await expect(redo).toBeDisabled();

  // The painter's picker follows the set-up by itself.
  await painter.getByTestId('texture-start-minecraft').click();
  await expect(picker.getByTestId('mc-texture-block-stone')).toBeVisible();
  await window.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  await expect(painter).toBeVisible();

  // Save writes the three pixels, and nothing else.
  await painter.getByTestId('texture-save').click();
  await expect(painter).toBeHidden();
  const ruby = join(folders.projectDir, 'assets', NAMESPACE, 'textures', 'block', 'ruby.png');
  await expect.poll(() => existsSync(ruby)).toBe(true);
  const saved = readPng(readFileSync(ruby));
  expect([saved.width, saved.height]).toEqual([16, 16]);
  const painted: string[] = [];
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      if ((saved.pixel(x, y)[3] ?? 0) > 0) painted.push(`${x},${y}`);
    }
  }
  expect(painted).toEqual(['0,0', '2,0', '4,0']);
});
