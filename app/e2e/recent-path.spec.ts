/**
 * The recent projects path: create project A, then project B in a second launch, then a
 * third launch with the same `MSM_HOME` lists B then A in the empty state ("Recent
 * projects") and on the toolbar's Open split arrow, and opens A from the list.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import { type LaunchedApp, launchApp, outputDir } from './fixtures';

/** Folder names double as project names and namespaces. */
const PROJECT_A = 'recent_a';
const PROJECT_B = 'recent_b';

let base: string | undefined;
const launches: LaunchedApp[] = [];

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

/** Launches with `projectDir` as the folder every "pick directory" dialog returns. */
async function launchWith(
  projectDir: string,
  shared: { outDir: string; msmHome: string },
): Promise<LaunchedApp> {
  const launched = await launchApp({ reuse: { projectDir, ...shared } });
  launches.push(launched);
  await launched.window.waitForLoadState('domcontentloaded');
  return launched;
}

/** Closes the most recent launch. */
async function closeLast(): Promise<void> {
  const launched = launches.pop();
  if (launched !== undefined) await launched.close();
}

test('recent projects: create A and B, relaunch, list B then A, open A', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-recent-'));
  const dirA = join(base, PROJECT_A);
  const dirB = join(base, PROJECT_B);
  const shared = { outDir: join(base, 'out'), msmHome: join(base, 'msm-home') };
  mkdirSync(outputDir, { recursive: true });

  // First launch: nothing recent yet; create A. -------------------------------------------
  let { window } = await launchWith(dirA, shared);
  await expect(window.getByText('No project is open. Use New or Open.')).toBeVisible();
  await expect(window.getByTestId('recent-projects')).toHaveCount(0);
  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId(`element-row-${PROJECT_A}:pack`)).toBeVisible();
  await closeLast();

  // Second launch: A is listed; create B. ---------------------------------------------------
  ({ window } = await launchWith(dirB, shared));
  await expect(window.getByTestId('recent-row-0')).toContainText(PROJECT_A);
  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId(`element-row-${PROJECT_B}:pack`)).toBeVisible();
  await closeLast();

  const settings = JSON.parse(readFileSync(join(shared.msmHome, 'settings.json'), 'utf8')) as {
    recentProjects?: { root: string }[];
  };
  expect(settings.recentProjects?.map((entry) => entry.root)).toEqual([dirB, dirA]);

  // Third launch: B then A in the empty state and the Open split arrow; open A. -------------
  ({ window } = await launchWith(dirB, shared));
  const list = window.getByTestId('recent-projects');
  await expect(list).toBeVisible();
  await expect(window.getByTestId('recent-row-0')).toContainText(PROJECT_B);
  await expect(window.getByTestId('recent-row-0')).toContainText(dirB);
  await expect(window.getByTestId('recent-row-1')).toContainText(PROJECT_A);
  await expect(window.getByTestId('recent-row-1')).toContainText(dirA);
  await expect(window.getByTestId('recent-row-2')).toHaveCount(0);

  await window.getByTestId('toolbar-open-menu').click();
  await expect(window.getByTestId('recent-project-0')).toContainText(PROJECT_B);
  await expect(window.getByTestId('recent-project-1')).toContainText(PROJECT_A);
  await window.keyboard.press('Escape');
  await expect(window.getByTestId('recent-project-0')).toBeHidden();

  await window.screenshot({ path: join(outputDir, 'recent-path-empty-state.png') });
  await window.getByTestId('recent-open-1').click();
  await expect(window.getByTestId(`element-row-${PROJECT_A}:pack`)).toBeVisible();
  await expect(window.locator('footer').getByText(dirA)).toBeVisible();
  await expect(window.getByTestId('recent-projects')).toHaveCount(0);

  // Opening A moved it to the top of the list.
  await window.getByTestId('toolbar-open-menu').click();
  await expect(window.getByTestId('recent-project-0')).toContainText(PROJECT_A);
  await expect(window.getByTestId('recent-project-1')).toContainText(PROJECT_B);
});
