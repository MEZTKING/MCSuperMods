/**
 * Main-process entry point. Wires the Node platform, IPC, the menu and the window.
 *
 * Smoke mode (`MSM_SMOKE=1`): the window is created hidden; the app exits 0 once the page has
 * loaded and the renderer reports `msm:v1:app:smokeReady`, or 1 after 30 seconds.
 *
 * @packageDocumentation
 */

import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { EventChannels } from '../shared/ipc-channels';
import { registerIpc } from './ipc';
import { installMenu } from './menu';
import { createNodePlatform } from './platform/node-platform';
import { createMainWindow } from './window';

const smoke = process.env.MSM_SMOKE === '1';

const platform = createNodePlatform({
  async info() {
    return {
      version: app.getVersion(),
      electron: process.versions.electron ?? 'unknown',
      platform: process.platform,
    };
  },
  dialogs: {
    async pickDirectory({ title, mustBeEmpty }) {
      const parent = BrowserWindow.getFocusedWindow();
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
    async confirmDiscard(message) {
      const parent = BrowserWindow.getFocusedWindow();
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
  registerIpc(platform);
  installMenu();
  const window = createMainWindow({ show: !smoke });
  if (smoke) runSmoke(window);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
