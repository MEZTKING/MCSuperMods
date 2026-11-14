/**
 * The three modes (ADR 0047 D1, ADR 0083 D1): `fixtures/sample-mod`, copied to a temporary
 * folder, opens in Advanced mode (a fresh profile). The toolbar's mode button switches to Easy:
 * the technical `msm:mod` element moves under the folded "More" group and the editor hides Raw
 * JSON. Switching back shows both again. The mode row's "Very easy" gives Very easy's own
 * toolbar and Home, with no sidebar, no Problems panel and no target in the status bar; the
 * row's "Easy" and "Advanced" bring the full window back.
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

test('modes: Easy folds technical elements and hides Raw JSON, Advanced shows them, Very easy has Home', async () => {
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

  // Very easy from the mode row: its own toolbar and Home; no sidebar, Problems or target.
  await window.getByTestId('toolbar-mode-very-easy').click();
  await expect(window.getByTestId('toolbar-very-easy')).toBeVisible();
  await expect(window.getByTestId('toolbar-mode-very-easy')).toHaveAttribute('data-state', 'on');
  // The open element stays open; Home is one click away.
  await expect(window.getByTestId('home')).toHaveCount(0);
  await window.getByTestId('toolbar-home').click();
  await expect(window.getByTestId('home')).toBeVisible();
  await expect(window.getByTestId('things-to-fix')).toBeVisible();
  await expect(window.getByRole('navigation', { name: 'Elements' })).toHaveCount(0);
  await expect(window.getByTestId('dock-tab-problems')).toHaveCount(0);
  await expect(window.getByTestId('project-target')).toHaveCount(0);
  await expect(window.getByTestId('play-controls')).toBeVisible();
  // My things lists the sample mod's blocks and items by their shown names.
  await expect(window.getByTestId('my-things')).toContainText('Ruby Bricks');

  // Easy from the row: the sidebar is back with the mod element folded under "More".
  await window.getByTestId('toolbar-mode-easy').click();
  await expect(window.getByTestId('toolbar-very-easy')).toHaveCount(0);
  await expect(more).toBeVisible();
  await expect(oreRow).toBeVisible();

  // Advanced from the row.
  await window.getByTestId('toolbar-mode-advanced').click();
  await expect(more).toHaveCount(0);
  await expect(modRow).toBeVisible();
  await expect(window.getByTestId('dock-tab-problems')).toBeVisible();
});
