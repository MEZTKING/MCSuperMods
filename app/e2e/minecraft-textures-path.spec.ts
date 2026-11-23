/**
 * Drawing on Minecraft's own textures end to end (ADR 0129 D4). The "Minecraft" is a made-up
 * `.minecraft` folder whose client jar holds MSM's own stand-in PNGs at Minecraft's texture paths
 * (`test/helpers/synthetic-jar.ts`'s `makePng`): no Mojang file is read or written.
 *
 * 1. Very easy: Home's **Change a Minecraft texture** first says the Minecraft folder is not set
 *    up and offers the set-up; Settings extracts the textures from the jar. The picker then lists
 *    them by name (no ids), the search finds Stone, the painter opens on it, a pixel is painted
 *    and Save writes `assets/minecraft/textures/block/stone.png` in the project in one undo step
 *    (Undo removes it, Redo puts it back), and the resource pack export carries it at that path.
 * 2. Advanced: **New texture…** with **Start from: A Minecraft texture** opens the picker on the
 *    Blocks folder, with ids; the animated Water still opens in the painter at its own size (a
 *    16 by 64 strip) and Save adds the picture with MSM's own `.png.mcmeta`.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultTargetId, targetById } from '@msm/targets';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { expect, test } from 'playwright/test';
import { makeOfficialDir } from '../test/helpers/fake-launchers';
import { KEPT_ENTRIES, makePng } from '../test/helpers/synthetic-jar';
import {
  type LaunchedApp,
  launchApp,
  newProjectInFolder,
  openToolbarMenu,
  outputDir,
} from './fixtures';
import { readPng } from './png';

/** The project folder name; a new project's namespace is derived from it. */
const NAMESPACE = 'msm_retexture';

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
      [`${textures}/block/stone_bricks.png`]: makePng(16, 16),
      [`${textures}/block/dirt.png`]: makePng(16, 16),
      [`${textures}/block/water_still.png`]: makePng(16, 64),
      [`${textures}/block/water_still.png.mcmeta`]: strToU8(
        JSON.stringify({ animation: { frametime: 2 } }),
      ),
      [`${textures}/item/stick.png`]: makePng(16, 16),
      [`${textures}/entity/cow/cow.png`]: makePng(64, 64),
      [`${textures}/gui/sprites/hud/heart/full.png`]: makePng(9, 9),
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

test('minecraft textures: set up, change Stone, start a texture from Water still', async () => {
  test.setTimeout(180_000);
  const version = mcVersion();
  base = mkdtempSync(join(tmpdir(), 'msm-mc-textures-'));
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
  mkdirSync(outputDir, { recursive: true });

  launched = await launchApp({ reuse: folders });
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await newProjectInFolder(window);
  await expect(window.getByTestId(`element-row-${NAMESPACE}:pack`)).toBeVisible();

  // 1. Very easy: Home's tile, not set up yet. -----------------------------------------------
  await window.getByTestId('toolbar-home').click();
  const home = window.getByTestId('home');
  await expect(home).toBeVisible();
  await home.getByTestId('home-tile-minecraft-texture').click();
  let picker = window.getByTestId('mc-texture-picker');
  await expect(picker).toBeVisible();
  await expect(picker.getByTestId('mc-texture-not-set-up')).toContainText(
    'set up the Minecraft folder first',
  );
  await picker.getByTestId('mc-texture-set-up').click();
  const settings = window.getByTestId('settings-dialog');
  await expect(settings).toBeVisible();
  await settings.getByTestId('settings-extract').click();
  await expect(settings.getByTestId('settings-status')).toContainText(
    `Vanilla assets for Minecraft ${version} are extracted`,
    { timeout: 30_000 },
  );
  await window.getByTestId('settings-close').click();
  await expect(settings).toBeHidden();

  // The picker by name, no ids in Very easy; search finds Stone.
  await home.getByTestId('home-tile-minecraft-texture').click();
  picker = window.getByTestId('mc-texture-picker');
  await expect(picker.getByTestId('mc-texture-block-stone')).toBeVisible();
  await expect(picker.getByTestId('mc-texture-entity-cow-cow')).toContainText('Cow');
  await expect(picker).not.toContainText('minecraft:block/stone');
  await picker.getByTestId('mc-texture-search').fill('stone');
  await expect(picker.getByTestId('mc-texture-count')).toHaveText('2 pictures');
  await picker.screenshot({ path: join(outputDir, 'minecraft-textures-picker.png') });
  await picker.getByTestId('mc-texture-block-stone').click();
  await expect(picker).toBeHidden();

  // The painter on Stone: paint the top-left pixel and save the override.
  const painter = window.getByTestId('texture-editor');
  await expect(painter).toBeVisible();
  await expect(painter).toContainText('Change how Stone looks in Minecraft');
  const canvas = painter.getByTestId('texture-canvas');
  await expect(canvas).toHaveAttribute('aria-label', /16 by 16 pixels/);
  await canvas.click({ position: { x: 4, y: 4 } });
  await painter.getByTestId('texture-save').click();
  await expect(painter).toBeHidden();
  const stone = join(folders.projectDir, 'assets', 'minecraft', 'textures', 'block', 'stone.png');
  await expect.poll(() => existsSync(stone)).toBe(true);
  const saved = readPng(readFileSync(stone));
  expect([saved.width, saved.height]).toEqual([16, 16]);
  expect([...saved.pixel(0, 0)]).not.toEqual([
    ...readPng(Buffer.from(makePng(16, 16))).pixel(0, 0),
  ]);

  // One undo step: Undo removes the override, Redo puts it back.
  await window.getByTestId('toolbar-undo').click();
  await expect.poll(() => existsSync(stone)).toBe(false);
  await window.getByTestId('toolbar-redo').click();
  await expect.poll(() => existsSync(stone)).toBe(true);

  // The resource pack export carries it at the same path.
  await openToolbarMenu(window, 'toolbar-export-menu');
  const exportEntry = window.getByTestId('export-resource-zip');
  await expect(exportEntry).not.toHaveAttribute('data-disabled', /.*/);
  await exportEntry.click();
  await expect
    .poll(() => readdirSync(folders.outDir).filter((name) => name.endsWith('.zip')), {
      timeout: 20_000,
    })
    .toHaveLength(1);
  const zip = readdirSync(folders.outDir).find((name) => name.endsWith('.zip')) as string;
  const entries = unzipSync(new Uint8Array(readFileSync(join(folders.outDir, zip))));
  expect(entries['assets/minecraft/textures/block/stone.png']).toEqual(
    new Uint8Array(readFileSync(stone)),
  );

  // 2. Advanced: New texture from a Minecraft texture. -----------------------------------------
  await window.getByTestId(`assets-new-texture-${NAMESPACE}`).click();
  const dialog = window.getByTestId('new-texture-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('new-texture-name').fill('my_water');
  await dialog.getByTestId('new-texture-kind').selectOption('block');
  await dialog.getByTestId('new-texture-start-minecraft').check();
  await dialog.getByTestId('new-texture-dialog-submit').click();
  picker = window.getByTestId('mc-texture-picker');
  await expect(picker.getByTestId('mc-texture-folder-block')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const water = picker.getByTestId('mc-texture-block-water-still');
  await expect(water).toContainText('Water still');
  await expect(water).toContainText('Moving');
  await water.click();
  await expect(painter).toBeVisible();
  await expect(painter.getByTestId('texture-canvas')).toHaveAttribute(
    'aria-label',
    /16 by 64 pixels/,
  );
  await painter.getByTestId('texture-save').click();
  await expect(painter).toBeHidden();
  const mine = join(folders.projectDir, 'assets', NAMESPACE, 'textures', 'block', 'my_water.png');
  await expect.poll(() => existsSync(mine)).toBe(true);
  expect(readPng(readFileSync(mine)).height).toBe(64);
  expect(JSON.parse(readFileSync(`${mine}.mcmeta`, 'utf8'))).toEqual({
    animation: { frametime: 2 },
  });
  await window.screenshot({ path: join(outputDir, 'minecraft-textures-path.png') });
});
