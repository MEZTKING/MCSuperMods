/**
 * Shared launcher for the Electron e2e tests. Every launch gets its own temporary `MSM_HOME`,
 * user-data folder, project folder and export folder, so tests never share state with each
 * other or with a running instance of the app.
 *
 * @packageDocumentation
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  _electron,
  type ElectronApplication,
  expect,
  type Locator,
  type Page,
} from 'playwright/test';

/** The `app/` folder. */
/**
 * The status toast's text. Use this, never a page-wide `getByText`: Radix Toast also renders a
 * hidden screen-reader announcer that copies the text for about a second (two matches).
 */
export function toast(window: Page): Locator {
  return window.getByTestId('status-toast-text');
}

export const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Where tests write screenshots (uploaded by CI on failure). */
export const outputDir = join(appDir, 'e2e', 'output');

/** A running app plus the temporary folders it uses. */
export interface LaunchedApp {
  app: ElectronApplication;
  window: Page;
  /** `MSM_E2E_PROJECT_DIR`: returned by every "pick directory" dialog. */
  projectDir: string;
  /** `MSM_E2E_OUT_DIR`: "save file" dialogs write here. */
  outDir: string;
  /** `MSM_HOME`: settings and the asset cache. */
  msmHome: string;
  /** `MSM_E2E_MODPACK_DIR`: returned by the modpack folder pickers (ADR 0046). */
  modpackDir: string;
  /** Closes the app (killing it if it does not exit) and removes the temporary folders. */
  close(): Promise<void>;
}

export interface LaunchOptions {
  /** Files returned by "pick files" dialogs (`MSM_E2E_PICK_FILES`). */
  pickFiles?: readonly string[];
  /** Reuse folders from an earlier launch (for reopen tests); they are then not removed. */
  reuse?: Pick<LaunchedApp, 'projectDir' | 'outDir' | 'msmHome'>;
  /** Extra Chromium or Electron switches, for example to enable software WebGL. */
  args?: readonly string[];
  /**
   * Absolute path of a scripted AI model script (`MSM_E2E_AI_SCRIPT`, ADR 0041 D9): one scripted
   * client serves every AI helper run of the launch, and the key reads as set ("e2e!").
   */
  aiScript?: string;
  /**
   * Whether every More options never opened starts open (ADR 0130): `'open'` by default, so the
   * specs written before one mode find each field; `'closed'` is what people see.
   */
  moreOptions?: 'open' | 'closed';
}

const CLOSE_TIMEOUT_MS = 10_000;

/** The sample external plugin's build output (`fixtures/sample-plugin/dist/`, ADR 0035). */
export const samplePluginDist = resolve(appDir, '..', 'fixtures', 'sample-plugin', 'dist');

/**
 * Makes sure `fixtures/sample-plugin/dist/` exists: `pnpm build` builds it through turbo; a
 * local run without it builds the plugin once with its own `build.ts`.
 */
export function ensureSamplePluginBuilt(): void {
  if (existsSync(join(samplePluginDist, 'msm-plugin.json'))) return;
  execFileSync(process.execPath, ['build.ts'], {
    cwd: dirname(samplePluginDist),
    stdio: 'inherit',
  });
}

/**
 * Installs a plugin the way a user does: copies `fromDir` (a plugin's `dist/` folder) into
 * `<msmHome>/plugins/<folder>/`, then writes `files` over it (to vary the manifest or the
 * bundle). Call it before {@link launchApp}: plugins load at start-up.
 *
 * @returns The plugin folder.
 */
export function installPlugin(
  msmHome: string,
  folder: string,
  fromDir: string | null,
  files: Readonly<Record<string, string>> = {},
): string {
  const dir = join(msmHome, 'plugins', folder);
  mkdirSync(dir, { recursive: true });
  if (fromDir !== null) cpSync(fromDir, dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

/** Launches the built app (`out/main/index.js`) in e2e mode. */
export async function launchApp(options: LaunchOptions = {}): Promise<LaunchedApp> {
  const temp = mkdtempSync(join(tmpdir(), 'msm-e2e-'));
  const projectDir = options.reuse?.projectDir ?? join(temp, 'project');
  const outDir = options.reuse?.outDir ?? join(temp, 'out');
  const msmHome = options.reuse?.msmHome ?? join(temp, 'msm-home');
  const userData = join(temp, 'user-data');
  for (const dir of [projectDir, outDir, msmHome, userData]) mkdirSync(dir, { recursive: true });

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'MSM_SMOKE' && key !== 'ELECTRON_RENDERER_URL') {
      env[key] = value;
    }
  }
  env.MSM_E2E_PROJECT_DIR = projectDir;
  env.MSM_E2E_OUT_DIR = outDir;
  env.MSM_HOME = msmHome;
  const modpackDir = join(temp, 'modpack');
  env.MSM_E2E_MODPACK_DIR = modpackDir;
  const delimiter = process.platform === 'win32' ? ';' : ':';
  if (options.pickFiles !== undefined) env.MSM_E2E_PICK_FILES = options.pickFiles.join(delimiter);
  if (options.aiScript !== undefined) env.MSM_E2E_AI_SCRIPT = options.aiScript;
  if ((options.moreOptions ?? 'open') === 'open') env.MSM_E2E_MORE_OPTIONS = 'open';

  const app = await _electron.launch({
    args: [appDir, '--no-sandbox', `--user-data-dir=${userData}`, ...(options.args ?? [])],
    cwd: appDir,
    env,
    timeout: 30_000,
  });
  const window = await app.firstWindow({ timeout: 30_000 });

  return {
    app,
    window,
    projectDir,
    outDir,
    msmHome,
    modpackDir,
    async close() {
      const child = app.process();
      let timer: NodeJS.Timeout | undefined;
      const timedOut = new Promise<'timeout'>((settle) => {
        timer = setTimeout(() => settle('timeout'), CLOSE_TIMEOUT_MS);
      });
      const result = await Promise.race([app.close().then(() => 'closed' as const), timedOut]);
      clearTimeout(timer);
      if (result === 'timeout' && child.exitCode === null) child.kill('SIGKILL');
      rmSync(temp, { recursive: true, force: true });
    },
  };
}

/**
 * Opens a dock tab (`dock-tab-<name>`). Moves the mouse away, takes focus off the toolbar and waits until no
 * tooltip is shown, so that a toolbar tooltip left open by an earlier click cannot sit over the
 * tab and swallow the click (the app keeps such tooltips shut; this guards the test as well).
 */
export async function openDockTab(window: Page, name: string): Promise<void> {
  await window.mouse.move(0, 0);
  // Take focus off any toolbar trigger (a menu hands focus back to it) without a key press,
  // then wait until no tooltip is shown.
  await window.evaluate(() => {
    const doc = (
      globalThis as unknown as { document: { activeElement: { blur?: () => void } | null } }
    ).document;
    doc.activeElement?.blur?.();
  });
  await window
    .getByRole('tooltip')
    .first()
    .waitFor({ state: 'detached', timeout: 5_000 })
    .catch(() => undefined);
  await window.getByTestId(`dock-tab-${name}`).click();
}

/**
 * Opens the toolbar's **More** menu (ADR 0131 D1), unless it is open already, then each submenu
 * in `submenus` (`toolbar-export-menu`, `toolbar-install-menu`, `toolbar-open-menu`, or the
 * Install submenu's `install-target-change`) by keyboard: a pointer moving from a submenu's
 * trigger into the submenu can cross other entries and close it again. Returns once the last
 * submenu is open.
 */
export async function openToolbarMenu(window: Page, ...submenus: string[]): Promise<void> {
  const more = window.getByTestId('toolbar-more');
  if ((await more.getAttribute('aria-expanded')) !== 'true') {
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
  }
  for (const id of submenus) {
    const trigger = window.getByTestId(id);
    await trigger.focus();
    await window.keyboard.press('ArrowRight');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  }
}

/**
 * Chooses an entry of the toolbar's More menu: `ids` are the submenus on the way and, last, the
 * entry, which is clicked (`toolbarMenu(window, 'toolbar-export-menu', 'export-data-zip')`).
 */
export async function toolbarMenu(window: Page, ...ids: [...string[], string]): Promise<void> {
  const entry = ids[ids.length - 1] as string;
  await openToolbarMenu(window, ...ids.slice(0, -1));
  await window.getByTestId(entry).click();
}

/**
 * The status bar agrees with the Problems panel (plan B703): it counts warnings and errors as
 * things to fix, so with no error it says how many warnings there are, or nothing. With the panel
 * shut it must say nothing.
 */
export async function expectStatusAgrees(window: Page): Promise<void> {
  const status = window.getByTestId('status-things-to-fix');
  const panel = window.getByTestId('problems-panel');
  if (!(await panel.isVisible())) {
    await expect(status).toHaveCount(0);
    return;
  }
  await expect(panel.locator('[data-testid="problem-row"][data-severity="error"]')).toHaveCount(0);
  const warnings = await panel
    .locator('[data-testid="problem-row"][data-severity="warning"]')
    .count();
  if (warnings === 0) await expect(status).toHaveCount(0);
  else
    await expect(status).toHaveText(
      warnings === 1 ? '1 thing to fix' : `${warnings} things to fix`,
    );
}

/** Saves the mod with the toolbar's Save and waits for the status bar's "Saved". */
export async function saveMod(window: Page): Promise<void> {
  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
}

/** Opens the Creator: More > Make something… (ADR 0131 D1). */
export async function openCreator(window: Page): Promise<void> {
  await toolbarMenu(window, 'toolbar-creator');
}

/** Opens the Add dialog: More > Add from the full list… (ADR 0131 D1). */
export async function openAddDialog(window: Page): Promise<void> {
  await toolbarMenu(window, 'toolbar-add-element');
}

/** Runs an entry of More > Export (`export-data-zip`, `export-fabric-jar`, ...). */
export async function openExport(window: Page, id: string): Promise<void> {
  await toolbarMenu(window, 'toolbar-export-menu', id);
}

/**
 * A blank project in the e2e project folder (named after it): More > **New mod…**, then the New
 * mod dialog's More options **Use a folder of my own…** (ADR 0130), which picks
 * `MSM_E2E_PROJECT_DIR` without a dialog.
 */
export async function newProjectInFolder(window: Page): Promise<void> {
  await toolbarMenu(window, 'toolbar-new-project');
  const dialog = window.getByTestId('new-mod-dialog');
  await dialog.waitFor({ state: 'visible' });
  const choose = dialog.getByTestId('new-mod-choose-folder');
  if (!(await choose.isVisible())) await dialog.getByTestId('more-options-new-mod').click();
  await choose.click();
}

/** Opens a More options by its key (a section's test id), unless it is open already. */
export async function openMoreOptions(window: Page | Locator, key: string): Promise<void> {
  const toggle = window.getByTestId(`more-options-${key}`).first();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}

/** Opens **Edit as raw text** under Where it goes (ADR 0130 D4; before it the Raw JSON tab). */
export async function openRawText(window: Page): Promise<void> {
  await openMoreOptions(window, 'where-it-goes');
  await openMoreOptions(window, 'where-raw-text');
}

/** Opens **Every setting** (ADR 0130 D3; before it a Studio's "Advanced (all fields)"). */
export async function openEverySetting(window: Page): Promise<void> {
  await openMoreOptions(window, 'every-setting');
}
