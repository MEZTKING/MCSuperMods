/**
 * The main window: sandboxed renderer, typed preload, unsaved-changes prompt on close.
 *
 * @packageDocumentation
 */

import { fileURLToPath } from 'node:url';
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { EventChannels } from '../shared/ipc-channels';

const dirtyWindows = new Set<number>();

ipcMain.on(EventChannels.setDirty, (event, dirty: unknown) => {
  if (dirty === true) dirtyWindows.add(event.sender.id);
  else dirtyWindows.delete(event.sender.id);
});

/** Creates the main window and loads the renderer. */
export function createMainWindow(options: { show?: boolean } = {}): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    title: 'MSM',
    webPreferences: {
      preload: fileURLToPath(new URL('../preload/index.js', import.meta.url)),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const contentsId = window.webContents.id;

  if (options.show !== false) window.once('ready-to-show', () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event) => event.preventDefault());

  let closeConfirmed = false;
  window.on('close', (event) => {
    if (closeConfirmed || !dirtyWindows.has(contentsId)) return;
    event.preventDefault();
    void dialog
      .showMessageBox(window, {
        type: 'warning',
        buttons: ['Discard changes', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        message: 'The project has unsaved changes.',
        detail: 'Close the window and discard them?',
      })
      .then(({ response }) => {
        if (response === 0) {
          closeConfirmed = true;
          window.close();
        }
      });
  });
  window.on('closed', () => dirtyWindows.delete(contentsId));

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl !== undefined && devUrl !== '') {
    void window.loadURL(devUrl);
  } else {
    void window.loadFile(fileURLToPath(new URL('../renderer/index.html', import.meta.url)));
  }
  return window;
}
