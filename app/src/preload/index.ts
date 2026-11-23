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
  isAiEventPayload,
  isMenuCommand,
  isMenuOpenRecent,
  isMenuPluginExport,
  isMinecraftProgress,
  isPlayStatusPayload,
  isUpdateStatus,
} from '../shared/ipc-channels';
import type { AiPlatform, MsmBridge, PlayPlatform, PlayStatus } from '../shared/platform';

type PlayInputOf = Parameters<PlayPlatform['play']>[0];
type PlayOutputOf = PlayInputOf['outputs'][number];

/** A lowered file as the contract takes it (only the known fields cross). */
function outputFile(file: PlayOutputOf): PlayOutputOf {
  return {
    path: file.path,
    contents: file.contents,
    ...(file.elementId === undefined ? {} : { elementId: file.elementId }),
  };
}

/** A Play or Restart request as the contract takes it (only the known fields cross). */
function playRequest(input: PlayInputOf): PlayInputOf {
  return {
    targetId: input.targetId,
    modId: input.modId,
    jar: input.jar,
    outputs: input.outputs.map(outputFile),
    namespaces: [...input.namespaces],
    items: input.items.map((item) => ({
      id: item.id,
      ...(item.count === undefined ? {} : { count: item.count }),
    })),
    ...(input.game === undefined
      ? {}
      : {
          game: {
            preset: input.game.preset,
            gameMode: input.game.gameMode,
            difficulty: input.game.difficulty,
          },
        }),
  };
}

const bridge: MsmBridge = {
  app: {
    info: () => ipcRenderer.invoke(InvokeChannels.appInfo),
    launchNotice: () => ipcRenderer.invoke(InvokeChannels.appLaunchNotice),
  },
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
        ...(settings.ai === undefined
          ? {}
          : {
              ai: {
                model: settings.ai.model,
                effort: { chat: settings.ai.effort.chat, build: settings.ai.effort.build },
                fallbacks: settings.ai.fallbacks,
                limits: {
                  chat: {
                    maxToolTurns: settings.ai.limits.chat.maxToolTurns,
                    maxOutputTokens: settings.ai.limits.chat.maxOutputTokens,
                    taskBudget: settings.ai.limits.chat.taskBudget,
                  },
                  build: {
                    maxToolTurns: settings.ai.limits.build.maxToolTurns,
                    maxOutputTokens: settings.ai.limits.build.maxOutputTokens,
                    taskBudget: settings.ai.limits.build.taskBudget,
                  },
                },
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
    readWorldgenFiles: (mcVersion) =>
      ipcRenderer.invoke(InvokeChannels.minecraftWorldgenFiles, { mcVersion }),
    readDataFiles: (mcVersion, folders) =>
      ipcRenderer.invoke(InvokeChannels.minecraftDataFiles, { mcVersion, folders: [...folders] }),
    readNames: (targetId) => ipcRenderer.invoke(InvokeChannels.minecraftNames, { targetId }),
    readAssetObject: (mcVersion, key) =>
      ipcRenderer.invoke(InvokeChannels.minecraftAssetObject, { mcVersion, key }),
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
    runtimeJar: (targetId) => ipcRenderer.invoke(InvokeChannels.exportsRuntimeJar, { targetId }),
    geckolibJar: (targetId) => ipcRenderer.invoke(InvokeChannels.exportsGeckolibJar, { targetId }),
    writeTree: (folder, files) =>
      ipcRenderer.invoke(InvokeChannels.exportsWriteTree, {
        folder,
        files: files.map((file) => ({ path: file.path, data: file.data })),
      }),
    gradleWrapper: () => ipcRenderer.invoke(InvokeChannels.exportsGradleWrapper),
  },
  scripting: {
    transpile: (source, name) =>
      ipcRenderer.invoke(InvokeChannels.scriptingTranspile, { source, name }),
    check: (source, name, typings) =>
      ipcRenderer.invoke(InvokeChannels.scriptingCheck, { source, name, typings }),
  },
  modpacks: {
    list: () => ipcRenderer.invoke(InvokeChannels.modpacksList),
    create: (name, targetId) =>
      ipcRenderer.invoke(InvokeChannels.modpacksCreate, { name, targetId }),
    addExisting: () => ipcRenderer.invoke(InvokeChannels.modpacksAddExisting),
    forget: (root) => ipcRenderer.invoke(InvokeChannels.modpacksForget, { root }),
    read: (root) => ipcRenderer.invoke(InvokeChannels.modpacksRead, { root }),
    write: (root, modpack) => ipcRenderer.invoke(InvokeChannels.modpacksWrite, { root, modpack }),
    addProject: (root, projectRoot) =>
      ipcRenderer.invoke(InvokeChannels.modpacksAddProject, { root, projectRoot }),
    readProject: (root, path) =>
      ipcRenderer.invoke(InvokeChannels.modpacksReadProject, { root, path }),
    lookupMod: (input, gameVersion) =>
      ipcRenderer.invoke(InvokeChannels.modpacksLookupMod, { input, gameVersion }),
  },
  testInMinecraft: {
    runModpack: (targetId, jars, mods) =>
      ipcRenderer.invoke(InvokeChannels.testInMinecraftRunModpack, { targetId, jars, mods }),
    status: (targetId) => ipcRenderer.invoke(InvokeChannels.testInMinecraftStatus, { targetId }),
    createInstance: (targetId) =>
      ipcRenderer.invoke(InvokeChannels.testInMinecraftCreateInstance, { targetId }),
    run: (targetId, modId, data) =>
      ipcRenderer.invoke(InvokeChannels.testInMinecraftRun, { targetId, modId, data }),
    pickLauncherProgram: (launcher) =>
      ipcRenderer.invoke(InvokeChannels.testInMinecraftPickLauncherProgram, { launcher }),
  },
  thumbnails: {
    get: (assetPath, size) => ipcRenderer.invoke(InvokeChannels.thumbnailsGet, { assetPath, size }),
  },
  play: {
    status: (targetId) => ipcRenderer.invoke(InvokeChannels.playStatus, { targetId }),
    play: (input) => ipcRenderer.invoke(InvokeChannels.playPlay, playRequest(input)),
    reload: (input) =>
      ipcRenderer.invoke(InvokeChannels.playReload, {
        targetId: input.targetId,
        modId: input.modId,
        outputs: input.outputs.map(outputFile),
        ...(input.jar === undefined ? {} : { jar: input.jar }),
        ...(input.names === undefined ? {} : { names: { ...input.names } }),
      }),
    restart: (input) => ipcRenderer.invoke(InvokeChannels.playRestart, playRequest(input)),
    newWorld: (targetId, namespace, kind) =>
      ipcRenderer.invoke(InvokeChannels.playNewWorld, {
        targetId,
        namespace,
        ...(kind === undefined ? {} : { kind }),
      }),
    onStatus(listener) {
      const handler = (_event: IpcRendererEvent, status: unknown): void => {
        if (isPlayStatusPayload(status)) listener(status as PlayStatus);
      };
      ipcRenderer.on(EventChannels.playStatusChanged, handler);
      return () => {
        ipcRenderer.removeListener(EventChannels.playStatusChanged, handler);
      };
    },
  },
  worldBackups: {
    list: () => ipcRenderer.invoke(InvokeChannels.worldBackupsList),
    restore: (request) =>
      ipcRenderer.invoke(InvokeChannels.worldBackupsRestore, {
        location: request.location,
        worldDir: request.worldDir,
        fileName: request.fileName,
      }),
    openFolder: () => ipcRenderer.invoke(InvokeChannels.worldBackupsOpenFolder),
  },
  maps: {
    listWorlds: (targetId) => ipcRenderer.invoke(InvokeChannels.mapsListWorlds, { targetId }),
    exportMap: (request) =>
      ipcRenderer.invoke(InvokeChannels.mapsExport, {
        targetId: request.targetId,
        sourceId: request.sourceId,
        worldDir: request.worldDir,
        keepPlayerData: request.keepPlayerData,
        mapName: request.mapName,
        ...(request.dataPack === undefined
          ? {}
          : { dataPack: { fileName: request.dataPack.fileName, data: request.dataPack.data } }),
        ...(request.resourcePack === undefined ? {} : { resourcePack: request.resourcePack }),
        ...(request.mrpack === undefined
          ? {}
          : {
              mrpack: {
                index: request.mrpack.index,
                jars: request.mrpack.jars.map((jar) => ({
                  fileName: jar.fileName,
                  data: jar.data,
                })),
              },
            }),
      }),
    listStructureSaves: (targetId) =>
      ipcRenderer.invoke(InvokeChannels.mapsListStructureSaves, { targetId }),
    readStructureSave: (targetId, world, id) =>
      ipcRenderer.invoke(InvokeChannels.mapsReadStructureSave, { targetId, world, id }),
  },
  guide: {
    index: () => ipcRenderer.invoke(InvokeChannels.guideIndex),
    page: (page) => ipcRenderer.invoke(InvokeChannels.guidePage, { page }),
  },
  tryItWorlds: {
    listWorlds: () => ipcRenderer.invoke(InvokeChannels.tryItListWorlds),
    readArea: (request) =>
      ipcRenderer.invoke(InvokeChannels.tryItReadArea, {
        worldId: request.worldId,
        centre: request.centre === 'spawn' ? 'spawn' : { x: request.centre.x, z: request.centre.z },
      }),
  },
  updates: {
    check: () => ipcRenderer.invoke(InvokeChannels.updatesCheck),
    install: () => ipcRenderer.invoke(InvokeChannels.updatesInstall),
    current: () => ipcRenderer.invoke(InvokeChannels.updatesCurrent),
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
    defaultParent: () => ipcRenderer.invoke(InvokeChannels.projectDefaultParent),
    recent: () => ipcRenderer.invoke(InvokeChannels.projectRecent),
    openRecent: (root) => ipcRenderer.invoke(InvokeChannels.projectOpenRecent, { root }),
    removeRecent: (root) => ipcRenderer.invoke(InvokeChannels.projectRemoveRecent, { root }),
    clearRecent: () => ipcRenderer.invoke(InvokeChannels.projectClearRecent),
  },
  plugins: {
    list: () => ipcRenderer.invoke(InvokeChannels.pluginsList),
    read: (id) => ipcRenderer.invoke(InvokeChannels.pluginsRead, { id }),
    openFolder: () => ipcRenderer.invoke(InvokeChannels.pluginsOpenFolder),
  },
  aiPictures: {
    status: () => ipcRenderer.invoke(InvokeChannels.aiPicturesStatus),
    setService: (service) => ipcRenderer.invoke(InvokeChannels.aiPicturesSetService, { service }),
    setKey: (service, key) => ipcRenderer.invoke(InvokeChannels.aiPicturesSetKey, { service, key }),
    clearKey: (service) => ipcRenderer.invoke(InvokeChannels.aiPicturesClearKey, { service }),
    testKey: (service) => ipcRenderer.invoke(InvokeChannels.aiPicturesTestKey, { service }),
    generate: (request) =>
      ipcRenderer.invoke(InvokeChannels.aiPicturesGenerate, {
        requestId: request.requestId,
        prompt: request.prompt,
        style: request.style,
        size: request.size,
        ...(request.width === undefined ? {} : { width: request.width }),
        ...(request.height === undefined ? {} : { height: request.height }),
        count: request.count,
        transparent: request.transparent,
        ...(request.reference === undefined ? {} : { reference: request.reference }),
        ...(request.strength === undefined ? {} : { strength: request.strength }),
        ...(request.palette === undefined ? {} : { palette: request.palette }),
        ...(request.seed === undefined ? {} : { seed: request.seed }),
      }),
    cost: (request) =>
      ipcRenderer.invoke(InvokeChannels.aiPicturesCost, {
        prompt: request.prompt,
        style: request.style,
        size: request.size,
        ...(request.width === undefined ? {} : { width: request.width }),
        ...(request.height === undefined ? {} : { height: request.height }),
        count: request.count,
        transparent: request.transparent,
        ...(request.reference === undefined ? {} : { reference: request.reference }),
        ...(request.strength === undefined ? {} : { strength: request.strength }),
        ...(request.palette === undefined ? {} : { palette: request.palette }),
        ...(request.seed === undefined ? {} : { seed: request.seed }),
      }),
    cancel: (requestId) => ipcRenderer.invoke(InvokeChannels.aiPicturesCancel, { requestId }),
  },
  ai: {
    keyStatus: () => ipcRenderer.invoke(InvokeChannels.aiKeyStatus),
    setKey: (key) => ipcRenderer.invoke(InvokeChannels.aiSetKey, { key }),
    clearKey: () => ipcRenderer.invoke(InvokeChannels.aiClearKey),
    testKey: () => ipcRenderer.invoke(InvokeChannels.aiTestKey),
    start: (request) =>
      ipcRenderer.invoke(InvokeChannels.aiStart, {
        runId: request.runId,
        conversationId: request.conversationId,
        mode: request.mode,
        text: request.text,
        contextBlocks: [...request.contextBlocks],
        ...(request.limits === undefined
          ? {}
          : {
              limits: {
                maxToolTurns: request.limits.maxToolTurns,
                maxOutputTokens: request.limits.maxOutputTokens,
                taskBudget: request.limits.taskBudget,
              },
            }),
      }),
    cancel: (runId) => ipcRenderer.invoke(InvokeChannels.aiCancel, { runId }),
    toolResult: (runId, result) =>
      ipcRenderer.invoke(InvokeChannels.aiToolResult, {
        runId,
        requestId: result.requestId,
        content: result.content,
        isError: result.isError,
      }),
    newConversation: (conversationId) =>
      ipcRenderer.invoke(InvokeChannels.aiNewConversation, { conversationId }),
    dropConversation: (conversationId) =>
      ipcRenderer.invoke(InvokeChannels.aiDropConversation, { conversationId }),
    onEvent(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown): void => {
        // Main builds the events; the check only guards the shape.
        if (isAiEventPayload(payload)) {
          listener(payload.runId, payload.event as Parameters<typeof listener>[1]);
        }
      };
      ipcRenderer.on(EventChannels.aiEvent, handler);
      return () => {
        ipcRenderer.removeListener(EventChannels.aiEvent, handler);
      };
    },
  } satisfies AiPlatform,
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
  onMenuPluginExport(listener) {
    const handler = (_event: IpcRendererEvent, payload: unknown): void => {
      if (isMenuPluginExport(payload)) listener(payload.id);
    };
    ipcRenderer.on(EventChannels.menuPluginExport, handler);
    return () => {
      ipcRenderer.removeListener(EventChannels.menuPluginExport, handler);
    };
  },
  setMenuPluginExports(entries) {
    ipcRenderer.send(EventChannels.setMenuPluginExports, entries);
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
  onCloseRequest(handlers) {
    const handler = (_event: IpcRendererEvent, payload: unknown): void => {
      if (typeof payload !== 'object' || payload === null) return;
      const { id, op } = payload as { id?: unknown; op?: unknown };
      if (typeof id !== 'number') return;
      const answer = (value: boolean): void => {
        ipcRenderer.send(EventChannels.closeAnswer, { id, value });
      };
      if (op === 'report') {
        // Unknown state (a throw or a rejection): let main's prompt ask rather than lose changes.
        let reported: boolean | Promise<boolean> = true;
        try {
          reported = handlers.report();
        } catch {
          reported = true;
        }
        Promise.resolve(reported).then(answer, () => answer(true));
      } else if (op === 'save') {
        handlers.save().then(answer, () => answer(false));
      }
    };
    ipcRenderer.on(EventChannels.closeRequest, handler);
    return () => {
      ipcRenderer.removeListener(EventChannels.closeRequest, handler);
    };
  },
  smokeReady() {
    ipcRenderer.send(EventChannels.smokeReady);
  },
  // The sandboxed preload sees the environment the main process was started with.
  isSmoke: process.env.MSM_SMOKE === '1',
};

contextBridge.exposeInMainWorld('msm', bridge);
