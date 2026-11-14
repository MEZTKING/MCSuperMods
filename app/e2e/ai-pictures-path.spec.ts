/**
 * AI pictures (ADR 0093) with the fake image service (`MSM_E2E_AI_PICTURES_FAKE=1`: no key, no
 * network; main draws four 64 by 64 pictures). `fixtures/sample-mod` is opened, a block is made
 * with the Creator's Simple block flow, and its picture is made with "Make with AI": four
 * pictures, before and after the clean-up, one picked. The block's texture changes on disk to
 * a 16 by 16 picture, and one Undo puts the old one back.
 */

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import { appDir, type LaunchedApp, launchApp } from './fixtures';
import { readPng } from './png';

const MOD_ID = 'msm_sample_mod';

let base: string | undefined;
const launches: LaunchedApp[] = [];

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
  delete process.env.MSM_E2E_AI_PICTURES_FAKE;
});

test('make a block picture with AI, then undo it', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-ai-pictures-'));
  const folders = {
    projectDir: join(base, MOD_ID),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  cpSync(join(appDir, '..', 'fixtures', 'sample-mod'), folders.projectDir, { recursive: true });
  process.env.MSM_E2E_AI_PICTURES_FAKE = '1';
  const launched = await launchApp({ reuse: folders });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await window.getByTestId('toolbar-open-project').click();
  await expect(window.getByTestId(`element-row-${MOD_ID}:ruby_ore`)).toBeVisible();

  // Make a block with the Creator.
  await window.getByTestId('toolbar-creator').click();
  const creator = window.getByTestId('creator-dialog');
  await expect(creator).toBeVisible();
  await creator
    .getByTestId('creator-group-blocks')
    .getByTestId('creator-flow-simple-block')
    .click();
  await creator.getByTestId('param-block_name').fill('Amber Tile');
  // "Use AI pictures" is offered (a key reads as set) and off by default.
  await expect(creator.getByTestId('creator-ai-pictures')).not.toBeChecked();
  await expect(creator.getByTestId('creator-create')).toBeEnabled();
  await creator.getByTestId('creator-create').click();
  await expect(creator).toBeHidden();

  const texture = join(folders.projectDir, 'assets', MOD_ID, 'textures', 'block', 'amber_tile.png');
  await expect.poll(() => existsSync(texture)).toBe(true);
  const before = readFileSync(texture);

  await window.getByTestId(`element-row-${MOD_ID}:amber_tile`).click();
  const button = window.getByTestId('block-model-ai-msm-sample-mod-block-amber-tile');
  await expect(button).toBeVisible();
  await expect(button).toHaveText('Make with AI');
  await button.click();

  const dialog = window.getByTestId('ai-pictures-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('ai-pictures-prompt')).toHaveValue('an amber tile');
  await expect(dialog.getByTestId('ai-pictures-style-block')).toBeChecked();
  await dialog.getByTestId('ai-pictures-generate').click();
  await expect(dialog.getByTestId('ai-pictures-result-3')).toBeVisible();
  await expect(dialog.getByTestId('ai-pictures-before-0')).toHaveAttribute(
    'src',
    /^data:image\/png/,
  );
  await expect(dialog.getByTestId('ai-pictures-after-0')).toHaveAttribute(
    'src',
    /^data:image\/png/,
  );
  await dialog.getByTestId('ai-pictures-result-1').click();
  await dialog.getByTestId('ai-pictures-use').click();
  await expect(dialog).toBeHidden();

  // The texture on disk is now the cleaned-up AI picture: 16 by 16 and opaque.
  await expect.poll(() => readFileSync(texture).equals(before)).toBe(false);
  const made = readPng(readFileSync(texture));
  expect([made.width, made.height]).toEqual([16, 16]);
  expect(made.pixel(0, 0)[3]).toBe(255);

  // One Undo puts the old picture back.
  await window.getByTestId(`element-row-${MOD_ID}:amber_tile`).click();
  await window.keyboard.press('ControlOrMeta+Z');
  await expect.poll(() => readFileSync(texture).equals(before)).toBe(true);
});
