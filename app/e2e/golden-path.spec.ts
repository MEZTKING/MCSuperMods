/**
 * The Phase 1 golden path, driven only through the Form tab (the Raw JSON tab is never opened):
 * new project, Block model from the template picker, texture import, `textures.all` set in the
 * form, export to a zip, then a second launch that reopens the saved project.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { expect, test } from 'playwright/test';
import { type LaunchedApp, launchApp, outputDir } from './fixtures';
import { checkerPng } from './png';

/** The project folder name; a new project's namespace is derived from it. */
const NAMESPACE = 'msm_e2e';
const ELEMENT_ID = `${NAMESPACE}:block/test_block`;
const TEXTURE_NAME = 'e2e_texture';
const TEXTURE_REF = `${NAMESPACE}:block/${TEXTURE_NAME}`;

let base: string | undefined;
const launches: LaunchedApp[] = [];

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

test('new project, block model, texture, export zip, reopen', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-golden-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  const inputDir = join(base, 'input');
  mkdirSync(inputDir, { recursive: true });
  const texturePath = join(inputDir, `${TEXTURE_NAME}.png`);
  const png = checkerPng(16, [200, 30, 60, 255], [90, 10, 30, 255]);
  writeFileSync(texturePath, png);
  mkdirSync(outputDir, { recursive: true });

  // First launch: create, edit, export, save. ------------------------------------------------
  const first = await launchApp({ pickFiles: [texturePath], reuse: folders });
  launches.push(first);
  const { window } = first;
  await window.waitForLoadState('domcontentloaded');

  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId('element-row-msm_e2e:pack')).toBeVisible();

  // Block model from the template picker.
  await window.getByTestId('toolbar-add-element').click();
  const dialog = window.getByTestId('new-element-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('template-block_model').check();
  await expect(dialog.getByTestId('new-element-namespace')).toHaveValue(NAMESPACE);
  await dialog.getByTestId('new-element-name').fill('test_block');
  await dialog.getByTestId('new-element-dialog-submit').click();
  await expect(dialog).toBeHidden();
  await expect(window.getByTestId(`element-row-${ELEMENT_ID}`)).toBeVisible();

  // Import a texture into textures/block.
  await window.getByTestId('toolbar-import-assets').click();
  const importDialog = window.getByTestId('import-assets-dialog');
  await expect(importDialog).toBeVisible();
  await importDialog.getByTestId('import-assets-folder-block').check();
  await importDialog.getByTestId('import-assets-dialog-submit').click();
  await expect(importDialog).toBeHidden();
  await expect(
    window.getByTestId(`asset-row-${NAMESPACE}:textures/block/${TEXTURE_NAME}.png`),
  ).toBeVisible();

  // Point textures.all at the imported texture, through the form.
  await window.getByTestId(`element-row-${ELEMENT_ID}`).click();
  await window.getByTestId('editor-tab-form').click();
  const textureField = window
    .getByTestId('schema-form')
    .locator('[data-pointer="/textures/all"]')
    .locator('input[type="text"]:not([aria-label^="Key "])')
    .first();
  await expect(textureField).toBeVisible();
  await textureField.fill(TEXTURE_REF);
  await textureField.press('Tab');
  await expect(textureField).toHaveValue(TEXTURE_REF);

  // No error problems, so Export is enabled.
  await window.getByTestId('dock-tab-problems').click();
  const problems = window.getByTestId('problems-panel');
  await expect(problems).toBeVisible();
  await expect(problems.locator('[data-testid="problem-row"][data-severity="error"]')).toHaveCount(
    0,
  );
  await expect(window.locator('footer').getByText(/^0 error\(s\)/)).toBeVisible();
  const exportButton = window.getByTestId('toolbar-export-zip');
  await expect(exportButton).toBeEnabled();

  // Preview screenshot (WebGL may be unavailable under xvfb; the panel itself is captured).
  // The live preview is beside the form (ADR 0047 D4); the dock's tab points there.
  await window.getByTestId('dock-tab-preview').click();
  await expect(window.getByTestId('dock-preview-in-centre')).toBeVisible();
  const previewPanel = window.getByTestId('editor-preview');
  await expect(previewPanel).toBeVisible();
  await previewPanel.screenshot({ path: join(outputDir, 'golden-path-preview.png') });

  // Export the zip into MSM_E2E_OUT_DIR.
  await exportButton.click();
  await expect
    .poll(() => readdirSync(folders.outDir).filter((name) => name.endsWith('.zip')), {
      timeout: 20_000,
    })
    .toHaveLength(1);
  const zipName = readdirSync(folders.outDir).find((name) => name.endsWith('.zip')) ?? '';
  const files = unzipSync(new Uint8Array(readFileSync(join(folders.outDir, zipName))));
  const names = Object.keys(files);
  expect(names).toContain('pack.mcmeta');
  expect(names).toContain('msm.export.json');
  expect(names).toContain(`assets/${NAMESPACE}/models/block/test_block.json`);
  expect(names).toContain(`assets/${NAMESPACE}/textures/block/${TEXTURE_NAME}.png`);
  const model = JSON.parse(
    strFromU8(files[`assets/${NAMESPACE}/models/block/test_block.json`] ?? new Uint8Array()),
  ) as { parent?: string; textures?: Record<string, string> };
  expect(model.parent).toBe('minecraft:block/cube_all');
  expect(model.textures?.all).toBe(TEXTURE_REF);
  expect(
    Buffer.from(files[`assets/${NAMESPACE}/textures/block/${TEXTURE_NAME}.png`] ?? []).equals(png),
  ).toBe(true);

  await window.screenshot({ path: join(outputDir, 'golden-path.png') });

  // Save, so closing does not prompt to discard.
  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
  await first.close();
  launches.splice(0);

  // Second launch: reopen the project and find the element. ---------------------------------
  const second = await launchApp({ reuse: folders });
  launches.push(second);
  await second.window.waitForLoadState('domcontentloaded');
  await second.window.getByTestId('toolbar-open-project').click();
  const reopened = second.window.getByTestId(`element-row-${ELEMENT_ID}`);
  await expect(reopened).toBeVisible();
  await reopened.click();
  await second.window.getByTestId('editor-tab-form').click();
  await expect(
    second.window
      .getByTestId('schema-form')
      .locator('[data-pointer="/textures/all"]')
      .locator('input[type="text"]:not([aria-label^="Key "])')
      .first(),
  ).toHaveValue(TEXTURE_REF);
  await expect(
    second.window.getByTestId(`asset-row-${NAMESPACE}:textures/block/${TEXTURE_NAME}.png`),
  ).toBeVisible();
  await second.window.screenshot({ path: join(outputDir, 'golden-path-reopened.png') });
});
