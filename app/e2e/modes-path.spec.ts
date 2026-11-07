/**
 * Easy and Advanced mode (ADR 0047 D1): `fixtures/sample-mod`, copied to a temporary folder,
 * opens in Advanced mode (a fresh profile). The toolbar's mode button switches to Easy: the
 * technical `msm:mod` element moves under the folded "More" group and the editor hides Raw
 * JSON. Switching back shows both again.
 */

import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import { appDir, type LaunchedApp, launchApp } from './fixtures';

const MOD_ID = 'msm_sample_mod';

let base: string | undefined;
const launches: LaunchedApp[] = [];

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

test('modes: Easy folds technical elements and hides Raw JSON, Advanced shows them', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-modes-'));
  const folders = {
    projectDir: join(base, MOD_ID),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  cpSync(join(appDir, '..', 'fixtures', 'sample-mod'), folders.projectDir, { recursive: true });

  const launched = await launchApp({ reuse: folders });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await window.getByTestId('toolbar-open-project').click();

  const modRow = window.getByTestId(`element-row-${MOD_ID}:mod`);
  const oreRow = window.getByTestId(`element-row-${MOD_ID}:ruby_ore`);
  const more = window.getByTestId(`group-toggle-${MOD_ID}-more`);

  // Advanced (a fresh profile): every element and the Raw JSON tab.
  await expect(modRow).toBeVisible();
  await expect(more).toHaveCount(0);
  await oreRow.click();
  await expect(window.getByTestId('editor-tab-json')).toBeVisible();

  // Easy: the mod element waits under "More", and Raw JSON is gone.
  await window.getByTestId('toolbar-mode').click();
  await expect(more).toBeVisible();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(modRow).toHaveCount(0);
  await expect(oreRow).toBeVisible();
  await expect(window.getByTestId('editor-tab-form')).toBeVisible();
  await expect(window.getByTestId('editor-tab-json')).toHaveCount(0);
  await more.click();
  await expect(modRow).toBeVisible();

  // Back to Advanced.
  await window.getByTestId('toolbar-mode').click();
  await expect(more).toHaveCount(0);
  await expect(modRow).toBeVisible();
  await expect(window.getByTestId('editor-tab-json')).toBeVisible();
});
