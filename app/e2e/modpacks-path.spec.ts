/**
 * Modpacks (ADR 0046) through the real app: File > Modpacks… from the palette, a new modpack
 * in its own folder, the open project added as a member (written relatively to
 * `msm.modpack.json`), and a build that reads the member's snapshot over IPC into a scratch
 * session and runs the content-jar pipeline. CI's `ci` job has no runtime jar to nest, so the
 * build may stop with the member's problem; either way the dialog must report a result.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import { type LaunchedApp, launchApp } from './fixtures';

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

test('modpacks: create one, add the open project and build it', async () => {
  launched = await launchApp();
  const { window, modpackDir } = launched;
  await window.waitForLoadState('domcontentloaded');

  await window.getByTestId('toolbar-new-project').click();
  await expect(window.locator('footer').getByText(/^0 error\(s\)/)).toBeVisible();

  await window.keyboard.press('ControlOrMeta+Shift+P');
  const palette = window.getByTestId('command-palette');
  await palette.getByTestId('command-palette-input').fill('modpacks');
  await palette.getByTestId('command-modpacks').click();

  const dialog = window.getByTestId('modpacks-dialog');
  await expect(dialog.getByText('No modpacks yet.')).toBeVisible();
  await dialog.getByTestId('modpack-new').click();
  await expect(dialog.getByTestId('modpack-name')).toHaveValue('My modpack');
  await expect(dialog.getByTestId('modpack-entry')).toHaveText(['My modpack']);

  await dialog.getByTestId('modpack-add-open-project').click();
  await expect(dialog.getByTestId('modpack-member')).toHaveCount(1);
  const file = JSON.parse(readFileSync(join(modpackDir, 'msm.modpack.json'), 'utf8')) as {
    projects: { path: string }[];
  };
  expect(file.projects).toEqual([{ path: '../project' }]);

  // Rename: saved when the field loses focus.
  await dialog.getByTestId('modpack-name').fill('Ruby pack');
  await dialog.getByTestId('modpack-name').press('Tab');
  await expect(dialog.getByTestId('modpack-entry')).toHaveText(['Ruby pack']);

  // A build reaches the member's content-jar pipeline and reports either the exported file
  // or the member's problem (no runtime jar in CI).
  await dialog.getByTestId('modpack-export').click();
  const message = dialog.getByTestId('modpack-message');
  await expect(message).toBeVisible({ timeout: 30_000 });
  const problems = dialog.getByTestId('modpack-problems');
  if ((await problems.count()) > 0) {
    await expect(message).toHaveText('Nothing was exported: fix the problems below first.');
    await expect(problems).toContainText(/runtime/i);
  } else {
    await expect(message).toContainText('Exported 1 mod(s)');
  }
});
