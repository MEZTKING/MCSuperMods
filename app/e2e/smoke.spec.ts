import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import { type LaunchedApp, launchApp, outputDir } from './fixtures';

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

test('launches, shows the window title and renders the toolbar', async () => {
  launched = await launchApp();
  const { window } = launched;

  await window.waitForLoadState('domcontentloaded');
  await expect(window).toHaveTitle(/^MSM/);

  const toolbar = window.getByRole('toolbar', { name: 'Project' });
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'New' })).toBeVisible();

  // Smoke mode is off in e2e runs, so the renderer keeps Monaco.
  const isSmoke = await window.evaluate(
    () => (globalThis as { msm?: { isSmoke?: boolean } }).msm?.isSmoke,
  );
  expect(isSmoke).toBe(false);

  mkdirSync(outputDir, { recursive: true });
  await window.screenshot({ path: join(outputDir, 'smoke.png') });
});
