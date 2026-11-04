/**
 * The preload bridge. Runs sandboxed (CommonJS, no Node modules beyond `electron`), so it
 * imports only the dependency-free channel names. It exposes `window.msm`: thin
 * `ipcRenderer.invoke` wrappers plus menu subscription. Validation happens in main.
 *
 * @packageDocumentation
 */

import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron';
import { EventChannels, InvokeChannels, isMenuCommand } from '../shared/ipc-channels';
import type { MsmBridge } from '../shared/platform';

const bridge: MsmBridge = {
  app: { info: () => ipcRenderer.invoke(InvokeChannels.appInfo) },
  dialogs: {
    pickDirectory: (opts) => ipcRenderer.invoke(InvokeChannels.projectPickDirectory, opts),
    confirmDiscard: (message) =>
      ipcRenderer.invoke(InvokeChannels.dialogConfirmDiscard, { message }),
  },
  project: {
    openRoot: (path) => ipcRenderer.invoke(InvokeChannels.projectOpenRoot, { path }),
    createRoot: (path) => ipcRenderer.invoke(InvokeChannels.projectCreateRoot, { path }),
    closeRoot: () => ipcRenderer.invoke(InvokeChannels.projectCloseRoot),
    currentRoot: () => ipcRenderer.invoke(InvokeChannels.projectCurrentRoot),
  },
  fs: {
    readFile: (path) => ipcRenderer.invoke(InvokeChannels.fsReadFile, { path }),
    writeFile: (path, data) => ipcRenderer.invoke(InvokeChannels.fsWriteFile, { path, data }),
    readDir: (path) => ipcRenderer.invoke(InvokeChannels.fsReadDir, { path }),
    exists: (path) => ipcRenderer.invoke(InvokeChannels.fsExists, { path }),
    mkdirp: (path) => ipcRenderer.invoke(InvokeChannels.fsMkdirp, { path }),
    remove: (path) => ipcRenderer.invoke(InvokeChannels.fsRemove, { path }),
  },
  onMenu(listener) {
    const handler = (_event: IpcRendererEvent, command: unknown): void => {
      if (isMenuCommand(command)) listener(command);
    };
    ipcRenderer.on(EventChannels.menu, handler);
    return () => {
      ipcRenderer.removeListener(EventChannels.menu, handler);
    };
  },
  setDirty(dirty) {
    ipcRenderer.send(EventChannels.setDirty, dirty);
  },
  smokeReady() {
    ipcRenderer.send(EventChannels.smokeReady);
  },
};

contextBridge.exposeInMainWorld('msm', bridge);
