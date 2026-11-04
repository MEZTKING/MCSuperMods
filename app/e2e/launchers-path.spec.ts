/**
 * Launcher instances end to end (ADR 0019): a fake Prism Launcher data folder (one Fabric
 * instance with a world and the client jar in its library store, plus one instance on another
 * Minecraft version) and a fake CurseForge folder (one instance), with no official launcher
 * folder. Settings lists every location with its badges; the Prism instance becomes the
 * install target there; vanilla assets extract from the Prism jar store; a resource pack and a
 * data pack install into the Prism instance; the Toolbar's "Change target" submenu switches to
 * the CurseForge instance and then to the mismatched instance, which warns but still installs.
 *
 * Every launcher file is made up by `test/helpers/fake-launchers.ts` and the jar by
 * `test/helpers/synthetic-jar.ts`; the Minecraft version is read from the built-in target.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { builtInTargets } from '@msm/targets';
import { expect, type Page, test } from 'playwright/test';
import { makeCurseForgeRoot, makeMmcRoot } from '../test/helpers/fake-launchers';
import { buildSyntheticJar } from '../test/helpers/synthetic-jar';
import { type LaunchedApp, launchApp, outputDir } from './fixtures';

/** The project folder name; a new project's namespace is derived from it. */
const NAMESPACE = 'msm_launchers';
const FUNCTION_ID = `${NAMESPACE}:hello`;

const PRISM_FOLDER = 'msm_prism';
const PRISM_NAME = 'MSM Prism Test';
const OLD_FOLDER = 'msm_old';
const OLD_NAME = 'MSM Old Version';
const OLD_VERSION = 'msm-other-version';
const CF_FOLDER = 'MSM CF';
const WORLD = 'MSM World';
const FABRIC_VERSION = '0.1.0';

const PRISM_ID = `prism:${PRISM_FOLDER}`;
const OLD_ID = `prism:${OLD_FOLDER}`;
const CF_ID = 'curseforge:MSM_CF';

/** The built-in target's Minecraft version, read rather than written here. */
function mcVersion(): string {
  const bundle = builtInTargets[0];
  if (bundle === undefined) throw new Error('No built-in target.');
  return bundle.target.mcVersion;
}

let base: string | undefined;
let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

/** `.zip` names in `dir` (none when it does not exist yet), sorted. */
function zipsIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.zip'))
    .sort();
}

/**
 * Closes Settings through its Close button. With every Game locations section filled, the
 * dialog is taller than the e2e window and does not scroll, so the button is out of view and
 * a real click cannot reach it: the click event is dispatched instead.
 */
async function closeSettings(window: Page): Promise<void> {
  await window.getByTestId('settings-close').click();
  await expect(window.getByTestId('settings-dialog')).toBeHidden();
}

/** Opens the Install menu and waits for its target sentence. */
async function openInstallMenu(window: Page): Promise<void> {
  await window.getByTestId('toolbar-install-menu').click();
  await expect(window.getByTestId('install-target')).toBeVisible();
}

/** Opens the Install menu and chooses `id` in the "Change target" submenu. */
async function changeTarget(window: Page, id: string): Promise<void> {
  await openInstallMenu(window);
  // By keyboard: a pointer moving from the trigger into the submenu can cross other items
  // and close it again.
  await window.getByTestId('install-target-change').focus();
  await window.keyboard.press('ArrowRight');
  const item = window.getByTestId(`install-target-${id}`);
  await expect(item).toBeVisible();
  await item.focus();
  await window.keyboard.press('Enter');
  await expect(item).toBeHidden();
}

/** Installs the resource pack into the current target and waits for one zip in `dir`. */
async function installResourcePack(window: Page, dir: string): Promise<void> {
  await openInstallMenu(window);
  const item = window.getByTestId('install-resource');
  await expect(item).toBeVisible();
  await expect(window.getByTestId('install-resource-reason')).toHaveCount(0);
  await item.click();
  await expect.poll(() => zipsIn(dir), { timeout: 20_000 }).toHaveLength(1);
}

test('launchers: Prism and CurseForge instances, extract from Prism, install packs', async () => {
  const version = mcVersion();
  base = mkdtempSync(join(tmpdir(), 'msm-launchers-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };

  // Fake launchers: no official `.minecraft` folder anywhere in the settings. -----------------
  const prism = await makeMmcRoot(join(base, 'PrismLauncher'), {
    instances: [
      {
        folder: PRISM_FOLDER,
        name: PRISM_NAME,
        mcVersion: version,
        loader: { uid: 'net.fabricmc.fabric-loader', version: FABRIC_VERSION },
        worlds: [WORLD],
      },
      { folder: OLD_FOLDER, name: OLD_NAME, mcVersion: OLD_VERSION },
    ],
    jars: { [version]: buildSyntheticJar() },
  });
  const curseForge = await makeCurseForgeRoot(join(base, 'curseforge', 'minecraft'), {
    instances: [{ folder: CF_FOLDER, gameVersion: version }],
  });

  mkdirSync(folders.msmHome, { recursive: true });
  writeFileSync(
    join(folders.msmHome, 'settings.json'),
    `${JSON.stringify(
      {
        launchers: {
          curseForgeRoots: [curseForge.root],
          multimcRoots: [],
          prismDataDirs: [prism.root],
        },
      },
      null,
      2,
    )}\n`,
  );
  mkdirSync(outputDir, { recursive: true });

  launched = await launchApp({ reuse: folders });
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');

  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId(`element-row-${NAMESPACE}:pack`)).toBeVisible();

  // Settings: every location with launcher, version and loader badges. ---------------------
  await window.getByTestId('toolbar-settings').click();
  let settings = window.getByTestId('settings-dialog');
  await expect(settings).toBeVisible();
  await expect(settings.getByTestId('settings-locations')).toBeVisible();

  const prismRow = settings.getByTestId(`location-row-${PRISM_ID}`);
  await expect(prismRow).toContainText(PRISM_NAME);
  await expect(settings.getByTestId(`location-launcher-${PRISM_ID}`)).toHaveText('Prism Launcher');
  await expect(settings.getByTestId(`location-version-${PRISM_ID}`)).toHaveText(`MC ${version}`);
  await expect(settings.getByTestId(`location-loader-${PRISM_ID}`)).toHaveText(
    `Fabric ${FABRIC_VERSION}`,
  );
  await expect(prismRow).not.toContainText('This instance runs Minecraft');

  const cfRow = settings.getByTestId(`location-row-${CF_ID}`);
  await expect(cfRow).toContainText(CF_FOLDER);
  await expect(settings.getByTestId(`location-launcher-${CF_ID}`)).toHaveText('CurseForge');
  await expect(settings.getByTestId(`location-version-${CF_ID}`)).toHaveText(`MC ${version}`);
  await expect(settings.getByTestId(`location-loader-${CF_ID}`)).toHaveCount(0);

  // The other-version instance warns, but the warning never blocks.
  const oldRow = settings.getByTestId(`location-row-${OLD_ID}`);
  await expect(oldRow).toContainText(
    `This instance runs Minecraft ${OLD_VERSION}; the project targets ${version}.`,
  );

  // Choose the Prism instance, then extract from its jar store.
  // Controlled radio: it checks once main has saved the target, so click rather than check().
  await settings.getByTestId(`location-select-${PRISM_ID}`).click();
  await expect(settings.getByTestId(`location-select-${PRISM_ID}`)).toBeChecked();
  await expect(settings.getByTestId('settings-target-missing')).toHaveCount(0);
  const status = settings.getByTestId('settings-status');
  await expect(status).toContainText(`Client jar: Prism Launcher — ${version}`);
  const extract = settings.getByTestId('settings-extract');
  await expect(extract).toBeEnabled();
  await extract.click();
  await expect(status).toContainText(`Vanilla assets for Minecraft ${version} are extracted`, {
    timeout: 30_000,
  });
  await expect(status).toContainText(`Client jar: Prism Launcher — ${version}`);
  expect(existsSync(join(folders.msmHome, 'cache', 'assets', version, 'cache.json'))).toBe(true);
  await window.screenshot({ path: join(outputDir, 'launchers-path-settings.png') });
  await closeSettings(window);

  // A function, so the project has data pack content.
  await window.getByTestId('toolbar-add-element').click();
  const dialog = window.getByTestId('new-element-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('template-function').check();
  await expect(dialog.getByTestId('new-element-namespace')).toHaveValue(NAMESPACE);
  await dialog.getByTestId('new-element-name').fill('hello');
  await dialog.getByTestId('new-element-dialog-submit').click();
  await expect(dialog).toBeHidden();
  await expect(window.getByTestId(`element-row-${FUNCTION_ID}`)).toBeVisible();

  // Install into the Prism instance. -------------------------------------------------------
  await openInstallMenu(window);
  await expect(window.getByTestId('install-target')).toContainText(
    `Install to: Prism Launcher — ${PRISM_NAME} (MC ${version})`,
  );
  await window.keyboard.press('Escape');
  const prismGame = prism.gameDir(PRISM_FOLDER);
  await installResourcePack(window, join(prismGame, 'resourcepacks'));

  await openInstallMenu(window);
  const installData = window.getByTestId('install-data');
  await expect(installData).toBeVisible();
  await expect(window.getByTestId('install-data-reason')).toHaveCount(0);
  await installData.click();
  const picker = window.getByTestId('world-picker');
  await expect(picker).toBeVisible();
  await picker.getByTestId(`world-row-${WORLD}`).click();
  await picker.getByTestId('world-picker-submit').click();
  await expect(picker).toBeHidden();
  await expect
    .poll(() => zipsIn(join(prismGame, 'saves', WORLD, 'datapacks')), { timeout: 20_000 })
    .toHaveLength(1);

  // Switch to the CurseForge instance through the Toolbar. ---------------------------------
  await changeTarget(window, CF_ID);
  await openInstallMenu(window);
  await expect(window.getByTestId('install-target')).toContainText(
    `Install to: CurseForge — ${CF_FOLDER} (MC ${version})`,
  );
  await window.keyboard.press('Escape');
  await installResourcePack(window, join(curseForge.gameDir(CF_FOLDER), 'resourcepacks'));

  // The other-version instance: the Install menu repeats the warning, and install works.
  await changeTarget(window, OLD_ID);
  await openInstallMenu(window);
  const target = window.getByTestId('install-target');
  await expect(target).toContainText(`Install to: Prism Launcher — ${OLD_NAME}`);
  await expect(target).toContainText(`This instance runs Minecraft ${OLD_VERSION}`);
  await window.keyboard.press('Escape');
  await installResourcePack(window, join(prism.gameDir(OLD_FOLDER), 'resourcepacks'));

  // Settings now shows the old instance as the target, with both others still listed.
  await window.getByTestId('toolbar-settings').click();
  settings = window.getByTestId('settings-dialog');
  await expect(settings).toBeVisible();
  await expect(settings.getByTestId(`location-select-${OLD_ID}`)).toBeChecked();
  await expect(settings.getByTestId(`location-row-${PRISM_ID}`)).toBeVisible();
  await expect(settings.getByTestId(`location-row-${CF_ID}`)).toBeVisible();
  await closeSettings(window);

  await window.screenshot({ path: join(outputDir, 'launchers-path.png') });

  // Save, so closing does not prompt to discard.
  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
});
