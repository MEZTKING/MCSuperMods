/**
 * Main-process entry point. Wires the Node platform, IPC, the menu and the window.
 *
 * Smoke mode (`MSM_SMOKE=1`): the window is created hidden; the app exits 0 once the page has
 * loaded and the renderer reports `msm:v1:app:smokeReady`, or 1 after 30 seconds.
 *
 * @packageDocumentation
 */

import { join } from 'node:path';
import { type ModelClient, ScriptedModelClient } from '@msm/ai';
import { nodeEnv } from '@msm/interop/node';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  nativeImage,
  safeStorage,
  session,
  shell,
} from 'electron';
import { EventChannels } from '../shared/ipc-channels';
import { createAiKeyStore } from './ai/ai-key-store';
import { createAiService } from './ai/ai-service';
import { aiPicturesKeyFile, createAiPicturesService } from './ai-pictures/ai-pictures-service';
import { fakeProvider } from './ai-pictures/fake';
import { registerAppSchemePrivileges } from './app-scheme';
import { createCrashRecovery, withCrashRecovery } from './crash-recovery';
import {
  applyE2eHooks,
  readE2eAiScript,
  readE2eHooks,
  readE2eNewInstall,
  readE2eRuntimeDir,
} from './e2e-hooks';
import { registerIpc, registerLocalServerEvents, registerPlayEvents } from './ipc';
import { installMenu, registerMenuIpc } from './menu';
import { appOrigins, installPermissionHandlers } from './permissions';
import { processJavaEnv } from './platform/local-server';
import { createNodePlatform, type NativeDialogs } from './platform/node-platform';
import { createPluginsService } from './platform/plugins';
import { resolveMsmHome } from './platform/settings';
import { createUpdateLog } from './update-log';
import { type AutoUpdaterLike, createUpdater, updateDisabledReason } from './updater';
import { createMainWindow } from './window';

const smoke = process.env.MSM_SMOKE === '1';

// ADR 0035 D1a: the renderer is served from `msm-app://app/`; the scheme's privileges must be
// registered before `app.ready`.
registerAppSchemePrivileges();

/** Whether this is a smoke or end-to-end run (the updater's `test-run` rule). */
function isTestRun(env: NodeJS.ProcessEnv): boolean {
  return updateDisabledReason({ isPackaged: true, platform: 'win32', env }) === 'test-run';
}

function focusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow();
}

const electronDialogs: NativeDialogs = {
  async pickDirectory({ title, mustBeEmpty, defaultPath }) {
    const parent = focusedWindow();
    const properties: Electron.OpenDialogOptions['properties'] = mustBeEmpty
      ? ['openDirectory', 'createDirectory', 'promptToCreate']
      : ['openDirectory'];
    const options: Electron.OpenDialogOptions = {
      title,
      properties,
      ...(defaultPath === undefined ? {} : { defaultPath }),
    };
    const result =
      parent === null
        ? await dialog.showOpenDialog(options)
        : await dialog.showOpenDialog(parent, options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  },
  async pickExportFolder({ title }) {
    const parent = focusedWindow();
    const options: Electron.OpenDialogOptions = {
      title,
      properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
    };
    const result =
      parent === null
        ? await dialog.showOpenDialog(options)
        : await dialog.showOpenDialog(parent, options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  },
  async confirmDiscard(message) {
    const parent = focusedWindow();
    const options: Electron.MessageBoxOptions = {
      type: 'warning',
      buttons: ['Discard changes', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message,
    };
    const { response } =
      parent === null
        ? await dialog.showMessageBox(options)
        : await dialog.showMessageBox(parent, options);
    return response === 0;
  },
  async openFiles({ title, filters }) {
    const parent = focusedWindow();
    const options: Electron.OpenDialogOptions = {
      title,
      properties: ['openFile', 'multiSelections'],
      ...(filters === undefined ? {} : { filters }),
    };
    const result =
      parent === null
        ? await dialog.showOpenDialog(options)
        : await dialog.showOpenDialog(parent, options);
    return result.canceled ? [] : result.filePaths;
  },
  async saveFilePath({ title, defaultName, filters }) {
    const parent = focusedWindow();
    const options: Electron.SaveDialogOptions = {
      title,
      defaultPath: defaultName,
      ...(filters === undefined ? {} : { filters }),
    };
    const result =
      parent === null
        ? await dialog.showSaveDialog(options)
        : await dialog.showSaveDialog(parent, options);
    return result.canceled || result.filePath === undefined || result.filePath === ''
      ? null
      : result.filePath;
  },
};

/** Scales a PNG so its longer edge is `size` pixels, keeping the aspect ratio. */
function resizePng(png: Uint8Array, size: number): Uint8Array {
  const image = nativeImage.createFromBuffer(
    Buffer.from(png.buffer, png.byteOffset, png.byteLength),
  );
  if (image.isEmpty()) throw new Error('The texture is not a readable PNG.');
  const { width, height } = image.getSize();
  const resized = image.resize(width >= height ? { width: size } : { height: size });
  return new Uint8Array(resized.toPNG());
}

const msmHome = resolveMsmHome(process.env, app.getPath('home'));

// ADR 0035: third-party plugin folders under `<msmHome>/plugins/`; main reads, never runs them.
// B870: when the window's page stops, main starts it again and names the plugins that were
// running; a second stop soon after turns third-party plugins off for the rest of this run.
// Smoke runs end on a stop instead (`runSmoke`).
const recovery = smoke ? undefined : createCrashRecovery();
const pluginFolders = createPluginsService({ msmHome, openPath: (path) => shell.openPath(path) });
const plugins = recovery === undefined ? pluginFolders : withCrashRecovery(pluginFolders, recovery);

const platform = createNodePlatform({
  async info() {
    return {
      version: app.getVersion(),
      electron: process.versions.electron ?? 'unknown',
      platform: process.platform,
    };
  },
  dialogs: applyE2eHooks(electronDialogs, readE2eHooks(process.env)),
  showItemInFolder: (path) => shell.showItemInFolder(path),
  // ADR 0133 D5: instances and servers MSM made are removed into the recycle bin.
  trashItem: (path) => shell.trashItem(path),
  openPath: (path) => shell.openPath(path),
  resizePng,
  msmHome,
  installEnv: nodeEnv(),
  // ADR 0083 D6: Very easy's new projects; test runs keep them under the MSM home.
  documentsDir: isTestRun(process.env) ? join(msmHome, 'Documents') : app.getPath('documents'),
  // "What's new" never opens by itself in smoke and end-to-end runs (unless an e2e run asks
  // for a brand-new install's Welcome, `MSM_E2E_NEW_INSTALL`).
  suppressWhatsNew: isTestRun(process.env) && !readE2eNewInstall(process.env),
  // The menu exists only once the app is ready; before that the start-up read installs it.
  onRecentChanged: (recent) => {
    if (app.isReady()) installMenu(recent);
  },
  // The Windows taskbar jump list; elsewhere a no-op.
  addRecentDocument: (root) => {
    if (process.platform === 'win32') app.addRecentDocument(root);
  },
  clearRecentDocuments: () => {
    if (process.platform === 'win32') app.clearRecentDocuments();
  },
  // ADR 0038 D4: packaged, `resources/runtime/msm_runtime-mc-<mc>.jar`; from source, the
  // Gradle output of `engine-mod/` next to `app/` (the app path is `app/` under electron-vite).
  runtimeJar: {
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    devLibsDir:
      readE2eRuntimeDir(process.env) ?? join(app.getAppPath(), '..', 'engine-mod', 'build', 'libs'),
  },
  // ADR 0033 D2: packaged, `resources/runtime/gradle-wrapper/`; from source, `engine-mod/`'s
  // own wrapper.
  gradleWrapper: {
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    devEngineModDir: join(app.getAppPath(), '..', 'engine-mod'),
  },
  // ADR 0026 D5: Fabric API downloads are cached in the app's user-data folder; so is the
  // GeckoLib jar (ADR 0029 D4), under `downloads/geckolib/`.
  testInMinecraft: {
    cacheDir: join(app.getPath('userData'), 'downloads'),
    env: { localAppData: process.env.LOCALAPPDATA, programFiles: process.env.ProgramFiles },
  },
  // ADR 0133 D9: the local server's Java search reads JAVA_HOME, PATH and LOCALAPPDATA.
  localServer: { javaEnv: processJavaEnv(process.env) },
});

// ADR 0041: the AI helper. The key is encrypted with `safeStorage` in `<msmHome>/ai-key.bin`;
// the Claude SDK is a lazy chunk (`ai-client-*.js`) loaded on the first run or key test.
const e2eAiScript = readE2eAiScript(process.env);
const aiService = createAiService({
  keyStore: createAiKeyStore({ msmHome, safeStorage }),
  settings: () => platform.settings.aiSettings(),
  async loadClient(apiKey): Promise<ModelClient> {
    const { createAnthropicModelClient } = await import('@msm/ai/sdk');
    return createAnthropicModelClient({ apiKey });
  },
  ...(e2eAiScript === null ? {} : { scriptedClient: new ScriptedModelClient(e2eAiScript) }),
});

// ADR 0093: AI pictures. One encrypted key per image service in
// `<msmHome>/ai-pictures-<service>-key.bin`; requests go out from main only.
const aiPictures = createAiPicturesService({
  msmHome,
  keyStore: (service) =>
    createAiKeyStore({
      msmHome,
      safeStorage,
      fileName: aiPicturesKeyFile(service),
      logLabel: 'MSM AI pictures',
    }),
  ...(process.env.MSM_E2E_AI_PICTURES_FAKE === '1' ? { fake: fakeProvider } : {}),
});

// `<userData>/logs/updater.log`, created on the first logged error.
let updateLog: { path: string; write: ReturnType<typeof createUpdateLog> } | null = null;
const updateLogFile = () => {
  if (updateLog === null) {
    const path = join(app.getPath('userData'), 'logs', 'updater.log');
    updateLog = { path, write: createUpdateLog(path) };
  }
  return updateLog;
};

// Shown notifications stay referenced until closed, so their click handler survives
// garbage collection.
const updateNotifications = new Set<Notification>();

const updater = createUpdater({
  gate: { isPackaged: app.isPackaged, platform: process.platform, env: process.env },
  // Loaded on the first check only, so runs where the updater is inactive never load it.
  async load() {
    const { autoUpdater } = await import('electron-updater');
    return autoUpdater as unknown as AutoUpdaterLike;
  },
  autoCheckEnabled: () => platform.settings.autoCheckUpdates(),
  broadcast(status) {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) {
        window.webContents.send(EventChannels.updatesStatus, status);
      }
    }
  },
  // A native notification once the update has downloaded, where the OS supports them;
  // clicking it brings the window (and its "Restart to update" banner) forward.
  notify(version) {
    if (!Notification.isSupported()) return;
    const notification = new Notification({
      title: 'MCSuperMods update ready',
      body: `Version ${version} has downloaded. It installs when you close MCSuperMods, or choose Restart to update.`,
    });
    notification.on('click', () => {
      const [window] = BrowserWindow.getAllWindows();
      if (window === undefined) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    });
    updateNotifications.add(notification);
    notification.on('close', () => updateNotifications.delete(notification));
    notification.show();
  },
  // Each window's close handler shows the unsaved-changes prompt when needed (window.ts).
  closeWindows() {
    for (const window of BrowserWindow.getAllWindows()) window.close();
  },
  // The full error (headers, cookies, feed XML, stack) goes to the log file only; the
  // console gets the one-line message.
  log(message, error) {
    if (error === undefined) console.log(message);
    else {
      const log = updateLogFile();
      console.error(`${message} Details: ${log.path}`);
      void log.write(message, error);
    }
  },
});

function runSmoke(window: BrowserWindow): void {
  let loaded = false;
  let ready = false;
  const timer = setTimeout(() => {
    console.error('MSM smoke: timed out after 30 s.');
    app.exit(1);
  }, 30_000);
  const check = (): void => {
    if (loaded && ready) {
      clearTimeout(timer);
      console.log('MSM smoke: renderer ready.');
      app.exit(0);
    }
  };
  window.webContents.once('did-finish-load', () => {
    loaded = true;
    check();
  });
  window.webContents.once('did-fail-load', (_event, code, description) => {
    console.error(`MSM smoke: load failed (${code}) ${description}`);
    app.exit(1);
  });
  window.webContents.once('render-process-gone', (_event, details) => {
    console.error(`MSM smoke: renderer gone (${details.reason}).`);
    app.exit(1);
  });
  ipcMain.once(EventChannels.smokeReady, () => {
    ready = true;
    check();
  });
}

void app.whenReady().then(() => {
  // B870: the page and its workers get only the permissions the app uses (no notifications,
  // no devices); before this Electron granted every request.
  installPermissionHandlers(session.defaultSession, appOrigins(process.env.ELECTRON_RENDERER_URL));
  registerIpc(platform, updater, plugins, aiService, aiPictures);
  registerPlayEvents(platform.play, app);
  registerLocalServerEvents(platform.localServer, app);
  registerMenuIpc();
  installMenu();
  platform.settings.recentProjects().then(
    (recent) => installMenu(recent),
    () => {
      // Unreadable settings: the menu keeps "No recent projects".
    },
  );
  const window = createMainWindow({
    show: !smoke,
    ...(recovery === undefined ? {} : { recovery }),
  });
  if (smoke) runSmoke(window);
  window.webContents.once('did-finish-load', () => updater.scheduleStartupCheck());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0)
      createMainWindow(recovery === undefined ? {} : { recovery });
  });
});

app.on('window-all-closed', () => {
  // After "Restart to update" every window has closed: start the silent installer, which
  // quits this app and starts the new version (ADR 0018). Otherwise the app quits, and a
  // downloaded update installs on that quit (electron-updater's `autoInstallOnAppQuit`, ADR
  // 0018 amendment of 2026-11-21); a close the unsaved-changes prompt cancelled never gets here.
  const install = updater.finishInstall();
  if (install === 'installing') return;
  if (install === 'failed') {
    // Never leave a running app with no window: open it again and say why.
    reopenAfterFailedInstall();
    return;
  }
  if (process.platform !== 'darwin') app.quit();
});

/** Opens the main window again after the update installer could not start. */
function reopenAfterFailedInstall(): void {
  const window = createMainWindow(recovery === undefined ? {} : { recovery });
  const status = updater.status;
  const detail =
    status.state === 'error' ? status.message : 'The update installer could not start.';
  window.webContents.once('did-finish-load', () => {
    void dialog.showMessageBox(window, {
      type: 'error',
      message: 'MCSuperMods could not install the update.',
      detail: `${detail} The version you have keeps working. Details are in ${updateLogFile().path}.`,
    });
  });
}
