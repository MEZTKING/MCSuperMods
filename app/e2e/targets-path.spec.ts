/**
 * Targets (ADR 0037): a new project through the Custom ore wizard keeps the default target
 * (the newest release target); the status bar shows it; "Upgrade project target…" (File >
 * Upgrade Project Target… in the menu bar, here through the command palette) offers the
 * snapshot target with its badge and previews the migration report; Upgrade moves the
 * project, the status bar follows, the resource pack zip is named for the new target and its
 * `pack.mcmeta` carries that target's formats; Undo moves the project back.
 *
 * Target ids and pack formats come from `@msm/targets`, never from literals here.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TargetFacts } from '@msm/plugin-api';
import { builtInTargets, defaultTargetId, targetById } from '@msm/targets';
import { strFromU8, unzipSync } from 'fflate';
import { expect, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp, outputDir } from './fixtures';

/** The project folder name; a new project's namespace is derived from it. */
const NAMESPACE = 'amber_e2e';

let base: string | undefined;
const launches: LaunchedApp[] = [];

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

/** The first snapshot target among the built-in targets. */
function snapshotTarget(): TargetFacts {
  const bundle = builtInTargets.find((entry) => entry.target.channel === 'snapshot');
  if (bundle === undefined) throw new Error('No built-in snapshot target.');
  return bundle.target;
}

/** `.zip` names in `dir`, sorted. */
function zipsIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.zip'))
    .sort();
}

/** Exports the resource pack zip into `outDir` (emptied first); returns its name and files. */
async function exportResourcePack(
  window: Page,
  outDir: string,
): Promise<{ name: string; files: Record<string, Uint8Array> }> {
  for (const name of zipsIn(outDir)) rmSync(join(outDir, name));
  await window.getByTestId('toolbar-export-menu').click();
  const item = window.getByTestId('export-resource-zip');
  await expect(item).toBeVisible();
  await expect(item).not.toHaveAttribute('data-disabled', /.*/);
  await item.click();
  await expect.poll(() => zipsIn(outDir), { timeout: 20_000 }).toHaveLength(1);
  const [name] = zipsIn(outDir);
  if (name === undefined) throw new Error('No resource pack zip.');
  return { name, files: unzipSync(new Uint8Array(readFileSync(join(outDir, name)))) };
}

/** The `pack` object of a zip's `pack.mcmeta`. */
function packOf(files: Record<string, Uint8Array>): Record<string, unknown> {
  const bytes = files['pack.mcmeta'];
  if (bytes === undefined) throw new Error('pack.mcmeta is missing from the zip.');
  return (JSON.parse(strFromU8(bytes)) as { pack: Record<string, unknown> }).pack;
}

test('targets: Custom ore wizard on the default target, upgrade to the snapshot, export, undo', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-targets-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });
  const release = targetById(defaultTargetId)?.target;
  if (release === undefined) throw new Error('No default target.');
  const snapshot = snapshotTarget();
  expect(snapshot.id).not.toBe(release.id);

  const launched = await launchApp({ reuse: folders });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');

  // The Custom ore wizard: a new gem name, then Next through the steps. --------------------
  await window.getByTestId('toolbar-new-menu').click();
  await window.getByTestId('toolbar-new-from-starter').click();
  const dialog = window.getByTestId('new-project-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('starter-custom_ore-wizard')).toHaveText('Wizard');
  await dialog.getByTestId('starter-picker').getByTestId('starter-custom_ore').check();
  await expect(dialog.getByTestId('wizard-progress')).toHaveText('Step 1 of 4');
  await dialog.getByTestId('wizard-next').click();
  await expect(dialog.getByTestId('wizard-progress')).toHaveText('Step 2 of 4');
  const oreName = dialog.getByTestId('param-ore_name');
  await expect(oreName).toHaveValue('Ruby');
  await oreName.fill('Amber');
  for (let step = 2; step < 4; step += 1) await dialog.getByTestId('wizard-next').click();
  await expect(dialog.getByTestId('wizard-progress')).toHaveText('Step 4 of 4');
  // The last step's Minecraft version select keeps the default (newest release) target.
  const select = dialog.getByTestId('new-project-target');
  await expect(select).toHaveValue(release.id);
  await expect(select.locator(`option[value="${snapshot.id}"]`)).toHaveCount(1);
  await dialog.getByTestId('new-project-dialog-submit').click();
  await expect(dialog).toBeHidden();
  await expect(window.getByTestId(`element-row-${NAMESPACE}:amber_ore`)).toBeVisible();
  await expect(window.getByTestId(`element-row-${NAMESPACE}:amber`)).toBeVisible();

  // The status bar shows the release target without a snapshot badge. ---------------------
  const status = window.getByTestId('project-target');
  await expect(status).toHaveText(release.id);
  await expect(window.getByTestId('project-target-snapshot')).toHaveCount(0);

  const before = await exportResourcePack(window, folders.outDir);
  expect(before.name.endsWith(`-${release.id}.zip`)).toBe(true);
  expect(packOf(before.files).pack_format).toBe(release.packFormats.resource.major);

  // Upgrade project target through the palette. -------------------------------------------
  await window.keyboard.press('ControlOrMeta+Shift+P');
  const palette = window.getByTestId('command-palette');
  await expect(palette).toBeVisible();
  await palette.getByTestId('command-palette-input').fill('upgrade project target');
  await palette.getByTestId('command-upgradeTarget').click();
  await expect(palette).toBeHidden();
  const upgrade = window.getByTestId('upgrade-target-dialog');
  await expect(upgrade).toBeVisible();
  await expect(upgrade.getByTestId('upgrade-target-current')).toContainText(release.mcVersion);
  await expect(upgrade.getByTestId(`upgrade-target-${release.id}`)).toHaveCount(0);
  const option = upgrade.getByTestId(`upgrade-target-${snapshot.id}`);
  await expect(option).toBeVisible();
  await expect(upgrade.getByTestId(`upgrade-target-${snapshot.id}-snapshot`)).toHaveText(
    'snapshot',
  );
  await option.click();
  await expect(option).toHaveAttribute('aria-pressed', 'true');
  // The Custom ore project uses no id the snapshot removed: nothing to change.
  await expect(upgrade.getByTestId('upgrade-target-summary')).toHaveText('0 changes, 0 problems.');
  await expect(upgrade.getByTestId('upgrade-target-changes')).toHaveCount(0);
  await upgrade.getByTestId('upgrade-target-dialog-submit').click();
  await expect(upgrade).toBeHidden();
  await expect(window.getByTestId('status-toast-text')).toContainText(
    `Project target changed to ${snapshot.id}.`,
  );

  // The status bar follows, with the snapshot badge. --------------------------------------
  await expect(status).toContainText(snapshot.id);
  await expect(window.getByTestId('project-target-snapshot')).toHaveText('snapshot');

  // The resource pack is named and formatted for the snapshot target. ---------------------
  const after = await exportResourcePack(window, folders.outDir);
  expect(after.name.endsWith(`-${snapshot.id}.zip`)).toBe(true);
  const pack = packOf(after.files);
  const { major, minor } = snapshot.packFormats.resource;
  expect(pack.pack_format).toBe(major);
  expect(pack.min_format).toEqual([major, minor]);
  expect(pack.max_format).toEqual([major, minor]);
  expect(Object.keys(after.files)).toContain(`assets/${NAMESPACE}/textures/block/amber_ore.png`);

  await window.screenshot({ path: join(outputDir, 'targets-path.png') });

  // Undo moves the project back to the release target. ------------------------------------
  await window.getByTestId('toolbar-undo').click();
  await expect(status).toHaveText(release.id);
  await expect(window.getByTestId('project-target-snapshot')).toHaveCount(0);
  const undone = await exportResourcePack(window, folders.outDir);
  expect(undone.name.endsWith(`-${release.id}.zip`)).toBe(true);
  expect(packOf(undone.files).pack_format).toBe(release.packFormats.resource.major);

  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
});
