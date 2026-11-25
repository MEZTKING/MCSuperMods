/**
 * Moving to a newer Minecraft (ADR 0136; B825), a real move in the app: `fixtures/sample-worldgen`
 * on the release target with three things the next target's change set touches (noise settings
 * holding `default_block`, a large dripstone feature, a function that pours flowing lava). The
 * next built-in target is a test version, so **Tell me about test versions of Minecraft** is
 * turned on first. Then: the notice in Things to fix and the status bar's mark; the report's
 * parts; Show me on the feature; the noise settings' before and after pair; **Move my mod**;
 * Undo; the move again; the After moving group, which shrinks when the feature is removed; **What
 * changed when I moved** with the fixed items done; and moving back, with **Check on other
 * versions** in its report.
 *
 * Target ids and versions come from `@msm/targets`, never from literals here.
 */

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { builtInTargets, defaultTargetId } from '@msm/targets';
import { expect, type Page, test } from 'playwright/test';
import { appDir, type LaunchedApp, launchApp, outputDir, toolbarMenu } from './fixtures';

const NS = 'msm_sample_worldgen';
const HILLS = `${NS}:hills`;
const SPIKES = `${NS}:spikes`;
const POUR = `${NS}:pour`;

const release = builtInTargets.find((entry) => entry.target.id === defaultTargetId)?.target;
const next = builtInTargets.find((entry) => entry.target.previous === defaultTargetId)?.target;

/** Noise settings as a new one is made on the release target (it holds `default_block`). */
const NOISE_SETTINGS = {
  sea_level: 63,
  disable_mob_generation: false,
  legacy_random_source: false,
  default_block: 'minecraft:stone',
  default_fluid: 'minecraft:water',
  noise: { min_y: -64, height: 384 },
  noise_router: {
    temperature: 0,
    vegetation: 0,
    continents: 0,
    erosion: 0,
    depth: 0,
    ridges: 0,
    chunk_surface_level: 0,
    final_density: {
      type: 'minecraft:gradient',
      axis: 'y',
      from_coordinate: -64,
      to_coordinate: 320,
      from_value: 1,
      to_value: -1,
    },
  },
  spawn_target: [],
  material_rule: { type: 'minecraft:block', result_state: 'minecraft:stone' },
};

/** A large dripstone feature: the next target renames its type (a thing the user must change). */
const LARGE_DRIPSTONE = {
  type: 'minecraft:large_dripstone',
  floor_to_ceiling_search_range: 30,
  column_radius: { type: 'minecraft:uniform', min_inclusive: 3, max_inclusive: 19 },
  height_scale: { type: 'minecraft:uniform', min_inclusive: 0.4, max_inclusive: 2 },
  max_column_radius_to_cave_height_ratio: 0.33,
  stalactite_bluntness: { type: 'minecraft:uniform', min_inclusive: 0.3, max_inclusive: 0.9 },
  stalagmite_bluntness: { type: 'minecraft:uniform', min_inclusive: 0.4, max_inclusive: 1 },
  wind_speed: { type: 'minecraft:uniform', min_inclusive: 0, max_inclusive: 0.3 },
  min_radius_for_wind: 4,
  min_bluntness_for_wind: 0.6,
};

let base: string | undefined;
const launches: LaunchedApp[] = [];

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

/** Writes one element file the way the project keeps it. */
function writeElement(projectDir: string, folder: string, id: string, kind: string, data: unknown) {
  const [namespace, path] = id.split(':') as [string, string];
  const dir = join(projectDir, 'content', namespace, folder);
  mkdirSync(dir, { recursive: true });
  const file = {
    data,
    formatVersion: 1,
    id,
    kind,
    meta: { createdAt: '2026-11-25T00:00:00.000Z' },
  };
  writeFileSync(join(dir, `${path}.json`), `${JSON.stringify(file, null, 2)}\n`);
}

/** A regular expression matching `text` exactly. */
const exactly = (text: string): RegExp =>
  new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

/** The status bar's version line: the version, its test badge and the newer version's mark. */
const forMinecraft = (version: string, newer: string): RegExp => {
  const quote = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^For Minecraft ${quote(version)}(?:snapshot)?(?:${quote(newer)} is ready)?$`);
};

/** Waits for the open dialog's report of the chosen version. */
async function reportOf(window: Page) {
  const dialog = window.getByTestId('upgrade-target-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('upgrade-report')).toBeVisible({ timeout: 60_000 });
  await expect(dialog.getByTestId('upgrade-target-dialog-submit')).toBeEnabled({
    timeout: 60_000,
  });
  return dialog;
}

/** Opens the move dialog through the command palette with the words people use. */
async function openMoveDialog(window: Page) {
  await window.keyboard.press('ControlOrMeta+Shift+P');
  const palette = window.getByTestId('command-palette');
  await expect(palette).toBeVisible();
  await palette.getByTestId('command-palette-input').fill('new minecraft version');
  await palette.getByTestId('command-upgradeTarget').click();
  await expect(palette).toBeHidden();
}

test('upgrade: notice, report, Show me, before and after, move, undo, After moving, moving back', async () => {
  test.setTimeout(300_000);
  if (release === undefined || next === undefined) {
    throw new Error('A release target and the target after it are needed.');
  }
  base = mkdtempSync(join(tmpdir(), 'msm-upgrade-'));
  const folders = {
    projectDir: join(base, NS),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  cpSync(join(appDir, '..', 'fixtures', 'sample-worldgen'), folders.projectDir, {
    recursive: true,
  });
  writeElement(
    folders.projectDir,
    'worldgen/noise_settings',
    HILLS,
    'minecraft:worldgen/noise_settings',
    NOISE_SETTINGS,
  );
  writeElement(
    folders.projectDir,
    'worldgen/feature',
    SPIKES,
    'minecraft:worldgen/feature',
    LARGE_DRIPSTONE,
  );
  writeElement(folders.projectDir, 'function', POUR, 'minecraft:function', {
    lines: ['setblock ~ ~ ~ minecraft:flowing_lava'],
  });
  mkdirSync(outputDir, { recursive: true });

  const launched = await launchApp({ reuse: folders });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');

  // The next version is a test version: turn on its notices first. -------------------------
  expect(next.channel).not.toBe('release');
  await toolbarMenu(window, 'toolbar-settings');
  const settings = window.getByTestId('settings-dialog');
  await expect(settings).toBeVisible();
  const testVersions = settings.getByTestId('settings-test-versions');
  await expect(testVersions).not.toBeChecked();
  await testVersions.check();
  await settings.getByTestId('settings-close').click();
  await expect(settings).toBeHidden();

  await toolbarMenu(window, 'toolbar-open-project');
  await expect(window.getByTestId(`element-row-${SPIKES}`)).toBeVisible();
  const status = window.getByTestId('project-target');
  await expect(status).toHaveText(forMinecraft(release.mcVersion, next.mcVersion));

  // The notice: Things to fix and the status bar's mark. -----------------------------------
  const fix = window.getByTestId('things-to-fix');
  const notice = fix.getByTestId('upgrade-notice');
  await expect(notice).toBeVisible({ timeout: 60_000 });
  await expect(notice.getByTestId('upgrade-notice-text')).toHaveText(
    new RegExp(
      `^Minecraft ${next.mcVersion.replaceAll('.', '\\.')} is ready for this mod: 1 thing changes by itself, \\d+ need you\\.$`,
    ),
  );
  await expect(window.getByTestId('project-target-newer')).toHaveText(`${next.mcVersion} is ready`);

  // See what changes: the report's parts. ---------------------------------------------------
  await notice.getByTestId('upgrade-notice-see').click();
  let dialog = await reportOf(window);
  await expect(dialog.getByTestId('upgrade-target-current')).toContainText(release.mcVersion);
  await expect(dialog.getByTestId('upgrade-report-summary')).toHaveText(
    /^1 thing changes by itself, \d+ need you\.$/,
  );
  for (const name of [
    'What changed in Minecraft for this mod',
    'What MCSuperMods changes for you',
    'What you need to change',
    'What your players need',
    'What to check in the game',
  ]) {
    await expect(dialog.getByRole('region', { name })).toBeVisible();
  }
  const done = dialog.getByRole('region', { name: 'What MCSuperMods changes for you' });
  await expect(done.getByTestId('upgrade-done-0-thing')).toHaveText('Hills');
  const todo = dialog.getByRole('region', { name: 'What you need to change' });
  await expect(
    todo.getByText(`Spikes uses something Minecraft ${next.mcVersion} no longer has.`),
  ).toBeVisible();
  await expect(
    todo.getByText(
      `Pour names something in its text that Minecraft ${next.mcVersion} no longer has.`,
    ),
  ).toBeVisible();
  await expect(dialog.getByTestId('upgrade-ingame-limit')).toBeVisible();
  await expect(dialog.getByTestId('upgrade-target-dialog-submit')).toHaveText(
    `Move my mod to Minecraft ${next.mcVersion}`,
  );

  // A before and after pair: the noise settings on both versions. Minecraft is not set up in
  // the test, so each side says it uses stand-ins; the text difference shows the dropped field.
  await done.getByRole('button', { name: 'See Hills before and after' }).click();
  const pair = done.getByTestId('upgrade-before-after-pair');
  await expect(pair).toBeVisible({ timeout: 60_000 });
  await expect(pair).toHaveAttribute('data-view', 'worldgen');
  await expect(pair).toHaveAttribute('data-same', 'no');
  await expect(pair.getByTestId('upgrade-before-after-stand-ins-before')).toBeVisible();
  await expect(pair.getByTestId('upgrade-before-after-diff')).toContainText('default_block');
  await window.screenshot({ path: join(outputDir, 'upgrade-path-report.png') });

  // Show me on the feature closes the report and opens the feature. -------------------------
  await todo.getByRole('button', { name: 'Show me Spikes' }).first().click();
  await expect(dialog).toBeHidden();
  await expect(window.getByTestId(`element-row-${SPIKES}`)).toHaveAttribute('aria-current', 'true');

  // Move my mod, from the status bar's mark. -------------------------------------------------
  await window.getByTestId('project-target-newer').click();
  dialog = await reportOf(window);
  await dialog.getByTestId('upgrade-target-dialog-submit').click();
  await expect(dialog).toBeHidden();
  await expect(window.getByTestId('status-toast-text')).toContainText(
    `Your mod now uses Minecraft ${next.mcVersion}.`,
  );
  await expect(status).toHaveText(forMinecraft(next.mcVersion, next.mcVersion));
  await expect(window.getByTestId('project-target-newer')).toHaveCount(0);

  // Undo moves it back as one step; then move again through the palette. -------------------
  await window.getByTestId('toolbar-undo').click();
  await expect(status).toHaveText(forMinecraft(release.mcVersion, next.mcVersion));
  await openMoveDialog(window);
  dialog = window.getByTestId('upgrade-target-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId(`upgrade-target-${next.id}`).click();
  dialog = await reportOf(window);
  await dialog.getByTestId('upgrade-target-dialog-submit').click();
  await expect(dialog).toBeHidden();
  await expect(status).toHaveText(forMinecraft(next.mcVersion, next.mcVersion));

  // After moving: the items left, which shrink when the feature goes. ---------------------
  const after = fix.getByTestId('things-to-fix-after-moving');
  await expect(after).toBeVisible({ timeout: 30_000 });
  const title = after.getByTestId('things-to-fix-after-moving-title');
  await expect(title).toHaveText(
    new RegExp(`^After moving to Minecraft ${next.mcVersion.replaceAll('.', '\\.')} \\(\\d+\\)$`),
  );
  const rows = after.getByTestId(/^things-to-fix-after-moving-\d+$/);
  const before = await rows.count();
  expect(before).toBeGreaterThan(1);
  await expect(after.getByText(/^Spikes uses something/)).toBeVisible();
  await window.getByRole('button', { name: 'Remove Spikes' }).click();
  await expect(window.getByTestId(`element-row-${SPIKES}`)).toHaveCount(0);
  await expect.poll(() => rows.count(), { timeout: 30_000 }).toBeLessThan(before);
  await expect(after.getByText(/^Spikes uses something/)).toHaveCount(0);
  await expect(after.getByText(/^Pour names something/)).toBeVisible();

  // What changed when I moved: the saved report, the feature's items done. ------------------
  await after.getByTestId('things-to-fix-after-moving-report').click();
  dialog = window.getByTestId('upgrade-target-dialog');
  await expect(dialog).toBeVisible();
  const saved = dialog.getByTestId('upgrade-saved-report');
  await expect(saved).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByTestId('upgrade-report-summary')).toHaveText(
    exactly(
      `Moved from Minecraft ${release.mcVersion} to ${next.mcVersion} on ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}.`,
    ),
  );
  const savedRows = saved.getByTestId(/^upgrade-todo-\d+$/);
  await expect(savedRows.first()).toBeVisible();
  await expect(saved.locator('[data-testid^="upgrade-todo-"][data-done="true"]')).not.toHaveCount(
    0,
  );
  await window.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Moving back, with Check on other versions in its report. --------------------------------
  await openMoveDialog(window);
  dialog = window.getByTestId('upgrade-target-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId(`upgrade-target-${release.id}`).click();
  dialog = await reportOf(window);
  await expect(dialog.getByTestId('upgrade-target-dialog-submit')).toHaveText(
    `Move my mod to Minecraft ${release.mcVersion}`,
  );
  // What the move up took away is put back, said first; the summary says "put back".
  await expect(dialog.getByTestId('upgrade-move-back')).toBeVisible();
  await expect(dialog.getByTestId('upgrade-move-back-restored')).toHaveText(
    /is put back \(\d+ values?\)\.$/,
  );
  await expect(dialog.getByTestId('upgrade-report-summary')).toHaveText(
    /^1 thing is put back by itself, \d+ needs? you\.$/,
  );
  const others = dialog.getByTestId('upgrade-part-other-versions');
  await expect(others).toBeVisible({ timeout: 60_000 });
  await expect(others.getByTestId(`upgrade-other-${next.id}`)).toBeVisible();
  await expect(others.getByTestId(`upgrade-other-${release.id}-status`)).toHaveText(
    /^(Works as it is\.|Works after a move: \d+ changes?\.|\d+ things? would break\.)$/,
    { timeout: 60_000 },
  );
  await window.screenshot({ path: join(outputDir, 'upgrade-path-back.png') });
  await dialog.getByTestId('upgrade-target-dialog-submit').click();
  await expect(dialog).toBeHidden();
  await expect(status).toHaveText(forMinecraft(release.mcVersion, next.mcVersion));
  await expect(window.getByTestId('status-toast-text')).toContainText(
    `Your mod now uses Minecraft ${release.mcVersion}.`,
  );
  // The noise settings got their default block back: no After moving group is left, and the
  // newer version is offered again.
  await expect(fix.getByTestId('things-to-fix-after-moving')).toHaveCount(0);
  await expect(window.getByTestId('project-target-newer')).toBeVisible({ timeout: 60_000 });

  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
});
