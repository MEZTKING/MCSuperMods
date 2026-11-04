/**
 * The preload bridge. Runs sandboxed (CommonJS, no Node modules beyond `electron`), so it
 * imports only the dependency-free channel names. It exposes `window.msm`: thin
 * `ipcRenderer.invoke` wrappers plus menu subscription. Validation happens in main.
 *
 * @packageDocumentation
 */

import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron';
import {
  EventChannels,
  InvokeChannels,
  isMenuCommand,
  isMinecraftProgress,
} from '../shared/ipc-channels';
import type { MsmBridge } from '../shared/platform';

const bridge: MsmBridge = {
  app: { info: () => ipcRenderer.invoke(InvokeChannels.appInfo) },
  dialogs: {
    pickDirectory: (opts) => ipcRenderer.invoke(InvokeChannels.projectPickDirectory, opts),
    confirmDiscard: (message) =>
      ipcRenderer.invoke(InvokeChannels.dialogConfirmDiscard, { message }),
    pickFiles: (opts) => ipcRenderer.invoke(InvokeChannels.dialogPickFiles, opts),
    saveFile: (opts) => ipcRenderer.invoke(InvokeChannels.dialogSaveFile, opts),
  },
  shell: {
    showItemInFolder: (path) => ipcRenderer.invoke(InvokeChannels.shellShowItemInFolder, { path }),
  },
  targets: {
    readVendored: (targetId, key) =>
      ipcRenderer.invoke(InvokeChannels.targetsReadVendored, { targetId, key }),
  },
  settings: {
    get: () => ipcRenderer.invoke(InvokeChannels.settingsGet),
    set: (settings) =>
      ipcRenderer.invoke(InvokeChannels.settingsSet, { minecraftDir: settings.minecraftDir }),
  },
  minecraft: {
    status: (mcVersion) => ipcRenderer.invoke(InvokeChannels.minecraftStatus, { mcVersion }),
    extract: (mcVersion) => ipcRenderer.invoke(InvokeChannels.minecraftExtract, { mcVersion }),
    readAsset: (mcVersion, path) =>
      ipcRenderer.invoke(InvokeChannels.minecraftReadAsset, { mcVersion, path }),
    listAssets: (mcVersion, prefix) =>
      ipcRenderer.invoke(InvokeChannels.minecraftListAssets, { mcVersion, prefix }),
    installResourcePack: (fileName, data) =>
      ipcRenderer.invoke(InvokeChannels.minecraftInstallResourcePack, { fileName, data }),
  },
  thumbnails: {
    get: (assetPath, size) => ipcRenderer.invoke(InvokeChannels.thumbnailsGet, { assetPath, size }),
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
  onMinecraftProgress(listener) {
    const handler = (_event: IpcRendererEvent, progress: unknown): void => {
      if (isMinecraftProgress(progress)) listener(progress);
    };
    ipcRenderer.on(EventChannels.minecraftProgress, handler);
    return () => {
      ipcRenderer.removeListener(EventChannels.minecraftProgress, handler);
    };
  },
  setDirty(dirty) {
    ipcRenderer.send(EventChannels.setDirty, dirty);
  },
  smokeReady() {
    ipcRenderer.send(EventChannels.smokeReady);
  },
  // The sandboxed preload sees the environment the main process was started with.
  isSmoke: process.env.MSM_SMOKE === '1',
};

contextBridge.exposeInMainWorld('msm', bridge);
