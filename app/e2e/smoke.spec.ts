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

  // What's new (B145): never by itself in test runs; from the palette it shows the bundled
  // CHANGELOG.md section for the running version.
  await expect(window.getByTestId('whats-new-dialog')).toHaveCount(0);
  await window.keyboard.press('ControlOrMeta+Shift+P');
  const palette = window.getByTestId('command-palette');
  await expect(palette).toBeVisible();
  await palette.getByTestId('command-palette-input').fill('new');
  await palette.getByTestId('command-whatsNew').click();
  const dialog = window.getByTestId('whats-new-dialog');
  const { version } = await launched.app.evaluate(({ app }) => ({ version: app.getVersion() }));
  await expect(dialog.getByText(`What's new in MCSuperMods ${version}`)).toBeVisible();
  await expect(dialog.getByTestId('markdown')).toBeVisible();
  await expect(dialog.getByTestId('whats-new-missing')).toHaveCount(0);
  await dialog.getByTestId('whats-new-close').click();
  await expect(dialog).toHaveCount(0);
});
