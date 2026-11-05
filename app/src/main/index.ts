/**
 * Main-process entry point. Wires the Node platform, IPC, the menu and the window.
 *
 * Smoke mode (`MSM_SMOKE=1`): the window is created hidden; the app exits 0 once the page has
 * loaded and the renderer reports `msm:v1:app:smokeReady`, or 1 after 30 seconds.
 *
 * @packageDocumentation
 */

import { join } from 'node:path';
import { nodeEnv } from '@msm/interop/node';
import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron';
import { EventChannels } from '../shared/ipc-channels';
import { applyE2eHooks, readE2eHooks } from './e2e-hooks';
import { registerIpc } from './ipc';
import { installMenu } from './menu';
import { createNodePlatform, type NativeDialogs } from './platform/node-platform';
import { resolveMsmHome } from './platform/settings';
import { createUpdateLog } from './update-log';
import { type AutoUpdaterLike, createUpdater } from './updater';
import { createMainWindow } from './window';

const smoke = process.env.MSM_SMOKE === '1';

function focusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow();
}

const electronDialogs: NativeDialogs = {
  async pickDirectory({ title, mustBeEmpty }) {
    const parent = focusedWindow();
    const properties: Electron.OpenDialogOptions['properties'] = mustBeEmpty
      ? ['openDirectory', 'createDirectory', 'promptToCreate']
      : ['openDirectory'];
    const options: Electron.OpenDialogOptions = { title, properties };
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
  resizePng,
  msmHome: resolveMsmHome(process.env, app.getPath('home')),
  installEnv: nodeEnv(),
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
  // ADR 0026 D4: packaged, `resources/runtime/msm_runtime.jar`; from source, the Gradle
  // output of `engine-mod/` next to `app/` (the app path is `app/` under electron-vite).
  runtimeJar: {
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    devLibsDir: join(app.getAppPath(), '..', 'engine-mod', 'build', 'libs'),
  },
  // ADR 0026 D5: Fabric API downloads are cached in the app's user-data folder; so is the
  // GeckoLib jar (ADR 0029 D4), under `downloads/geckolib/`.
  testInMinecraft: {
    cacheDir: join(app.getPath('userData'), 'downloads'),
    env: { localAppData: process.env.LOCALAPPDATA, programFiles: process.env.ProgramFiles },
  },
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
  registerIpc(platform, updater);
  installMenu();
  platform.settings.recentProjects().then(
    (recent) => installMenu(recent),
    () => {
      // Unreadable settings: the menu keeps "No recent projects".
    },
  );
  const window = createMainWindow({ show: !smoke });
  if (smoke) runSmoke(window);
  window.webContents.once('did-finish-load', () => updater.scheduleStartupCheck());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  // After "Restart to update" every window has closed: run the installer, which quits.
  if (updater.finishInstall()) return;
  if (process.platform !== 'darwin') app.quit();
});
