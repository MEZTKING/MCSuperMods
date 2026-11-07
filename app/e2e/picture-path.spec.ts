/**
 * Picture to texture (ADR 0048): `fixtures/sample-mod`, copied to a temporary folder, is
 * opened. A legacy 64 by 32 player skin chosen through the picture dialog (the picker returns
 * `MSM_E2E_PICK_FILES`) becomes a 64 by 64 mob skin with the left leg mirrored from the right;
 * then a pasted "screenshot" (a red square on white) becomes a 16 by 16 item texture with a
 * transparent background. Both are added as project assets in one undo step each.
 */

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import { appDir, type LaunchedApp, launchApp } from './fixtures';
import { readPng, rgbaPng } from './png';

const MOD_ID = 'msm_sample_mod';

let base: string | undefined;
const launches: LaunchedApp[] = [];

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

test('picture to texture: a legacy skin and a pasted screenshot', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-picture-'));
  const folders = {
    projectDir: join(base, MOD_ID),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  cpSync(join(appDir, '..', 'fixtures', 'sample-mod'), folders.projectDir, { recursive: true });
  // A legacy skin: grey everywhere, the right leg's front face (4..7, 20..31) red at x = 4.
  const skinPath = join(base, 'Old Skin.png');
  writeFileSync(
    skinPath,
    rgbaPng(64, 32, (x, y) => (x === 4 && y >= 20 ? [220, 30, 40, 255] : [120, 120, 120, 255])),
  );

  const launched = await launchApp({ reuse: folders, pickFiles: [skinPath] });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await window.getByTestId('toolbar-open-project').click();
  await expect(window.getByTestId(`element-row-${MOD_ID}:ruby_ore`)).toBeVisible();

  // The legacy skin. -------------------------------------------------------------------------
  await window.getByTestId(`assets-picture-${MOD_ID}`).click();
  const dialog = window.getByTestId('picture-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('picture-choose').click();
  await expect(dialog.getByTestId('picture-result')).toBeVisible();
  await expect(dialog.getByTestId('picture-kind')).toHaveValue('skin');
  await expect(dialog.getByTestId('picture-name')).toHaveValue('old_skin');
  await expect(dialog).toContainText('converted to the 64 by 64 layout');
  await dialog.getByTestId('picture-dialog-submit').click();
  await expect(dialog).toBeHidden();
  await expect(
    window.getByTestId(`asset-row-${MOD_ID}:textures/entity/old_skin.png`),
  ).toBeVisible();
  const skin = readPng(
    readFileSync(join(folders.projectDir, 'assets', MOD_ID, 'textures', 'entity', 'old_skin.png')),
  );
  expect([skin.width, skin.height]).toEqual([64, 64]);
  // The left leg's front face (20..23, 52..63), mirrored: x = 4 lands on x = 23.
  expect(skin.pixel(23, 52)).toEqual([220, 30, 40, 255]);
  expect(skin.pixel(4, 20)).toEqual([220, 30, 40, 255]);

  // A pasted screenshot. ---------------------------------------------------------------------
  await window.getByTestId(`assets-picture-${MOD_ID}`).click();
  await expect(dialog).toBeVisible();
  const screenshot = [
    ...rgbaPng(96, 64, (x, y) =>
      x >= 32 && x < 64 && y >= 16 && y < 48 ? [200, 20, 40, 255] : [255, 255, 255, 255],
    ),
  ];
  // Paste it as the clipboard would (the e2e TypeScript has no DOM types, so a script).
  await window.evaluate(`(() => {
    const transfer = new DataTransfer();
    const bytes = new Uint8Array(${JSON.stringify(screenshot)});
    transfer.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer }));
  })()`);
  await expect(dialog.getByTestId('picture-result')).toBeVisible();
  await expect(dialog.getByTestId('picture-name')).toHaveValue('screenshot');
  await dialog.getByTestId('picture-name').fill('pasted_gem');
  await dialog.getByTestId('picture-kind').selectOption('item');
  await dialog.getByTestId('picture-background').check();
  await dialog.getByTestId('picture-dialog-submit').click();
  await expect(dialog).toBeHidden();
  const itemPath = join(folders.projectDir, 'assets', MOD_ID, 'textures', 'item', 'pasted_gem.png');
  await expect.poll(() => existsSync(itemPath)).toBe(true);
  const item = readPng(readFileSync(itemPath));
  expect([item.width, item.height]).toEqual([16, 16]);
  expect(item.pixel(0, 0)[3]).toBe(0);
  expect(item.pixel(8, 8)).toEqual([200, 20, 40, 255]);

  // One Undo takes the pasted texture back out.
  await window.keyboard.press('ControlOrMeta+Z');
  await expect(window.getByTestId(`asset-row-${MOD_ID}:textures/item/pasted_gem.png`)).toHaveCount(
    0,
  );
});
