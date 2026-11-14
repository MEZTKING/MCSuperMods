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
import { _electron, type ElectronApplication, type Locator, type Page } from 'playwright/test';

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
 * Opens a dock tab (`dock-tab-<name>`). Moves the mouse away and presses Escape first so that no
 * toolbar tooltip left open by an earlier click can sit over the tab and swallow the click.
 */
export async function openDockTab(window: Page, name: string): Promise<void> {
  await window.mouse.move(0, 0);
  await window.keyboard.press('Escape');
  await window.getByTestId(`dock-tab-${name}`).click();
}
