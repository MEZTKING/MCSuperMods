/**
 * The main window: sandboxed renderer, typed preload, unsaved-changes prompt on close (after
 * the renderer reports held-back edits, `close-guard.ts`). In
 * production the renderer is loaded from the privileged `msm-app://app/` scheme, not from
 * `file:` (ADR 0035 D1a); in development from electron-vite's dev server.
 *
 * @packageDocumentation
 */

import { fileURLToPath } from 'node:url';
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { EventChannels } from '../shared/ipc-channels';
import { APP_INDEX_URL, serveAppScheme } from './app-scheme';
import {
  CLOSE_REPORT_TIMEOUT_MS,
  CLOSE_SAVE_TIMEOUT_MS,
  type CloseRequests,
  createCloseGuard,
  createCloseRequests,
} from './close-guard';

/** The built renderer folder (`out/renderer/`, inside `app.asar` when packaged). */
export const RENDERER_DIR = fileURLToPath(new URL('../renderer/', import.meta.url));

let schemeServed = false;

/**
 * Serves the built renderer on `msm-app://app/` (ADR 0035 D1a). Call after `app.ready`;
 * {@link createMainWindow} calls it on first use. `registerAppSchemePrivileges` must have run
 * before `app.ready` (see `index.ts`).
 */
export function serveRenderer(): void {
  if (schemeServed) return;
  schemeServed = true;
  serveAppScheme(RENDERER_DIR);
}

const dirtyWindows = new Set<number>();

ipcMain.on(EventChannels.setDirty, (event, dirty: unknown) => {
  if (dirty === true) dirtyWindows.add(event.sender.id);
  else dirtyWindows.delete(event.sender.id);
});

/** Each window's close requests to its renderer, by `webContents` id. */
const closeRequests = new Map<number, CloseRequests>();

ipcMain.on(EventChannels.closeAnswer, (event, payload: unknown) => {
  closeRequests.get(event.sender.id)?.answer(payload);
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

  const requests = createCloseRequests((request) => {
    if (window.webContents.isDestroyed()) throw new Error('The renderer is gone.');
    window.webContents.send(EventChannels.closeRequest, request);
  });
  closeRequests.set(contentsId, requests);
  window.on(
    'close',
    createCloseGuard({
      isDirty: () => dirtyWindows.has(contentsId),
      flush: () => requests.ask('report', CLOSE_REPORT_TIMEOUT_MS),
      async confirm() {
        const { response } = await dialog.showMessageBox(window, {
          type: 'warning',
          buttons: ['Save', 'Discard changes', 'Cancel'],
          defaultId: 0,
          cancelId: 2,
          message: 'The project has unsaved changes.',
          detail: 'Save them before the window closes, or discard them?',
        });
        return response === 0 ? 'save' : response === 1 ? 'discard' : 'cancel';
      },
      save: async () => (await requests.ask('save', CLOSE_SAVE_TIMEOUT_MS)) === true,
      close: () => window.close(),
    }),
  );
  window.on('closed', () => {
    dirtyWindows.delete(contentsId);
    closeRequests.delete(contentsId);
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl !== undefined && devUrl !== '') {
    void window.loadURL(devUrl);
  } else {
    serveRenderer();
    void window.loadURL(APP_INDEX_URL);
  }
  return window;
}
