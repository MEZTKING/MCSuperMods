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
  isMenuOpenRecent,
  isMinecraftProgress,
  isUpdateStatus,
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
      ipcRenderer.invoke(InvokeChannels.settingsSet, {
        ...(settings.minecraftDir === undefined ? {} : { minecraftDir: settings.minecraftDir }),
        ...(settings.updates === undefined
          ? {}
          : { updates: { autoCheck: settings.updates.autoCheck } }),
        ...(settings.launchers === undefined
          ? {}
          : {
              launchers: {
                prismDataDirs: [...settings.launchers.prismDataDirs],
                multimcRoots: [...settings.launchers.multimcRoots],
                curseForgeRoots: [...settings.launchers.curseForgeRoots],
              },
            }),
        ...(settings.installTarget === undefined
          ? {}
          : {
              installTarget:
                settings.installTarget === null
                  ? null
                  : {
                      launcher: settings.installTarget.launcher,
                      root: settings.installTarget.root,
                      ...(settings.installTarget.instance === undefined
                        ? {}
                        : { instance: settings.installTarget.instance }),
                    },
            }),
      }),
  },
  minecraft: {
    status: (mcVersion) => ipcRenderer.invoke(InvokeChannels.minecraftStatus, { mcVersion }),
    listLocations: (mcVersion) =>
      ipcRenderer.invoke(InvokeChannels.minecraftListLocations, { mcVersion }),
    extract: (mcVersion) => ipcRenderer.invoke(InvokeChannels.minecraftExtract, { mcVersion }),
    readAsset: (mcVersion, path) =>
      ipcRenderer.invoke(InvokeChannels.minecraftReadAsset, { mcVersion, path }),
    listAssets: (mcVersion, prefix) =>
      ipcRenderer.invoke(InvokeChannels.minecraftListAssets, { mcVersion, prefix }),
    installResourcePack: (fileName, data) =>
      ipcRenderer.invoke(InvokeChannels.minecraftInstallResourcePack, { fileName, data }),
    listWorlds: () => ipcRenderer.invoke(InvokeChannels.minecraftListWorlds),
    installDataPack: (worldDir, fileName, data) =>
      ipcRenderer.invoke(InvokeChannels.minecraftInstallDataPack, { worldDir, fileName, data }),
  },
  mcfunction: {
    check: (targetId, source, options) =>
      ipcRenderer.invoke(InvokeChannels.mcfunctionCheck, {
        targetId,
        source,
        options: { uri: options.uri, projectIds: options.projectIds },
      }),
    complete: (targetId, source, offset, options) =>
      ipcRenderer.invoke(InvokeChannels.mcfunctionComplete, {
        targetId,
        source,
        offset,
        options:
          options.limit === undefined
            ? { uri: options.uri, projectIds: options.projectIds }
            : { uri: options.uri, projectIds: options.projectIds, limit: options.limit },
      }),
  },
  exports: {
    pickFolder: (title) => ipcRenderer.invoke(InvokeChannels.exportsPickFolder, { title }),
    writeFiles: (folder, files) =>
      ipcRenderer.invoke(InvokeChannels.exportsWriteFiles, {
        folder,
        files: files.map((file) => ({ name: file.name, data: file.data })),
      }),
    runtimeJar: () => ipcRenderer.invoke(InvokeChannels.exportsRuntimeJar),
  },
  thumbnails: {
    get: (assetPath, size) => ipcRenderer.invoke(InvokeChannels.thumbnailsGet, { assetPath, size }),
  },
  updates: {
    check: () => ipcRenderer.invoke(InvokeChannels.updatesCheck),
    install: () => ipcRenderer.invoke(InvokeChannels.updatesInstall),
    onStatus(listener) {
      const handler = (_event: IpcRendererEvent, status: unknown): void => {
        if (isUpdateStatus(status)) listener(status);
      };
      ipcRenderer.on(EventChannels.updatesStatus, handler);
      return () => {
        ipcRenderer.removeListener(EventChannels.updatesStatus, handler);
      };
    },
  },
  project: {
    openRoot: (path) => ipcRenderer.invoke(InvokeChannels.projectOpenRoot, { path }),
    createRoot: (path) => ipcRenderer.invoke(InvokeChannels.projectCreateRoot, { path }),
    closeRoot: () => ipcRenderer.invoke(InvokeChannels.projectCloseRoot),
    currentRoot: () => ipcRenderer.invoke(InvokeChannels.projectCurrentRoot),
    recent: () => ipcRenderer.invoke(InvokeChannels.projectRecent),
    openRecent: (root) => ipcRenderer.invoke(InvokeChannels.projectOpenRecent, { root }),
    removeRecent: (root) => ipcRenderer.invoke(InvokeChannels.projectRemoveRecent, { root }),
    clearRecent: () => ipcRenderer.invoke(InvokeChannels.projectClearRecent),
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
  onMenuOpenRecent(listener) {
    const handler = (_event: IpcRendererEvent, payload: unknown): void => {
      if (isMenuOpenRecent(payload)) listener(payload.root);
    };
    ipcRenderer.on(EventChannels.menuOpenRecent, handler);
    return () => {
      ipcRenderer.removeListener(EventChannels.menuOpenRecent, handler);
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
