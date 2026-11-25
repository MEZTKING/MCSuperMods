/**
 * Registers an `ipcMain.handle` handler for every invoke channel. Requests are validated with
 * the contract's zod schemas before they reach the platform; only frames of windows this app
 * created may call in.
 *
 * @packageDocumentation
 */

import { join } from 'node:path';
import { app, BrowserWindow, type IpcMainInvokeEvent, ipcMain } from 'electron';
import type { z } from 'zod';
import {
  EventChannels,
  type InvokeChannel,
  InvokeChannels,
  type IpcContract,
  type IpcResponse,
  ipcContract,
  type MinecraftProgress,
} from '../shared/ipc-contract';
import type {
  InstancePlanRequest,
  LocalServerRequest,
  PlayInput,
  PlayOutputFile,
} from '../shared/platform';
import type { RecoveryNotice } from '../shared/recovery-notice';
import type { AiSender, AiService } from './ai/ai-service';
import type { AiPicturesService } from './ai-pictures/ai-pictures-service';
import { createGuideService, type GuideService, guideDirFor } from './guide';
import type { MainPlatform } from './platform/node-platform';
import type { PluginsService } from './platform/plugins';
import { readTargetNames } from './platform/vanilla-names';
import type { Updater } from './updater';

/** The updater operations the IPC layer serves. */
export type IpcUpdates = Pick<Updater, 'check' | 'install' | 'status'>;

/** The third-party plugin operations the IPC layer serves (ADR 0035). */
export type IpcPlugins = Pick<PluginsService, 'list' | 'read' | 'openFolder'> & {
  /** B870: the crash recovery's notice for the reloaded page, once (`crash-recovery.ts`). */
  recoveryNotice?(): RecoveryNotice | null;
};

/** The AI helper operations the IPC layer serves (ADR 0041 D3). */
export type IpcAi = Pick<
  AiService,
  | 'keyStatus'
  | 'setKey'
  | 'clearKey'
  | 'testKey'
  | 'start'
  | 'cancel'
  | 'toolResult'
  | 'newConversation'
  | 'dropConversation'
>;

/** The AI pictures operations the IPC layer serves (ADR 0093). */
export type IpcAiPictures = Omit<AiPicturesService, 'active'>;

/** Without AI pictures (older tests): every call fails plainly. */
const NO_AI_PICTURES: IpcAiPictures = {
  status: () => Promise.reject(new Error('AI pictures are not available.')),
  setService: () => Promise.reject(new Error('AI pictures are not available.')),
  setKey: () => Promise.reject(new Error('AI pictures are not available.')),
  clearKey: () => Promise.reject(new Error('AI pictures are not available.')),
  testKey: () => Promise.reject(new Error('AI pictures are not available.')),
  generate: () => Promise.reject(new Error('AI pictures are not available.')),
  cost: () => Promise.reject(new Error('AI pictures are not available.')),
  cancel: async () => {},
};

/** Without a guide (older tests): every call fails plainly. */
const NO_GUIDE: GuideService = {
  index: () => Promise.reject(new Error('The guide is not available.')),
  page: () => Promise.reject(new Error('The guide is not available.')),
};

/** Per-call services a handler may use. */
export interface HandlerContext {
  /** Sends extraction progress to the calling renderer. */
  sendProgress(progress: MinecraftProgress): void;
  /** The calling renderer, for AI helper run events. */
  sender: AiSender;
}

/** One handler per channel, taking the validated request. */
export type MainHandlers = {
  [C in InvokeChannel]: (
    request: z.output<IpcContract[C]['request']>,
    context: HandlerContext,
  ) => Promise<IpcResponse<C>>;
};

/** Maps every channel to the platform method that serves it. */
export function createIpcHandlers(
  platform: MainPlatform,
  updates: IpcUpdates,
  plugins: IpcPlugins,
  ai: IpcAi,
  aiPictures: IpcAiPictures = NO_AI_PICTURES,
  guide: GuideService = NO_GUIDE,
): MainHandlers {
  return {
    [InvokeChannels.projectPickDirectory]: (req) =>
      platform.dialogs.pickDirectory({
        title: req.title,
        ...(req.mustBeEmpty === undefined ? {} : { mustBeEmpty: req.mustBeEmpty }),
        ...(req.purpose === undefined ? {} : { purpose: req.purpose }),
      }),
    [InvokeChannels.projectOpenRoot]: (req) => platform.project.openRoot(req.path),
    [InvokeChannels.projectCreateRoot]: (req) => platform.project.createRoot(req.path),
    [InvokeChannels.projectCloseRoot]: () => platform.project.closeRoot(),
    [InvokeChannels.projectCurrentRoot]: () => platform.project.currentRoot(),
    [InvokeChannels.projectDefaultParent]: () =>
      platform.project.defaultParent?.() ?? Promise.resolve(''),
    [InvokeChannels.projectRecent]: () => platform.project.recent(),
    [InvokeChannels.projectOpenRecent]: (req) => platform.project.openRecent(req.root),
    [InvokeChannels.projectRemoveRecent]: (req) => platform.project.removeRecent(req.root),
    [InvokeChannels.projectRecentSummary]: (req) => platform.project.recentSummary(req.root),
    [InvokeChannels.projectClearRecent]: () => platform.project.clearRecent(),
    [InvokeChannels.fsReadFile]: (req) => platform.fs.readFile(req.path),
    [InvokeChannels.fsWriteFile]: (req) => platform.fs.writeFile(req.path, req.data),
    [InvokeChannels.fsReadDir]: (req) => platform.fs.readDir(req.path),
    [InvokeChannels.fsExists]: (req) => platform.fs.exists(req.path),
    [InvokeChannels.fsMkdirp]: (req) => platform.fs.mkdirp(req.path),
    [InvokeChannels.fsRemove]: (req) => platform.fs.remove(req.path),
    [InvokeChannels.appInfo]: () => platform.app.info(),
    [InvokeChannels.appLaunchNotice]: () => platform.app.launchNotice(),
    // B870: what to tell the user after main started the window's page again (once).
    [InvokeChannels.appRecoveryNotice]: async () => plugins.recoveryNotice?.() ?? null,
    [InvokeChannels.dialogConfirmDiscard]: (req) => platform.dialogs.confirmDiscard(req.message),
    [InvokeChannels.dialogPickFiles]: (req) => platform.dialogs.pickFiles(req),
    [InvokeChannels.dialogSaveFile]: (req) => platform.dialogs.saveFile(req),
    [InvokeChannels.shellShowItemInFolder]: (req) => platform.shell.showItemInFolder(req.path),
    [InvokeChannels.targetsReadVendored]: (req) =>
      platform.targets.readVendored(req.targetId, req.key),
    [InvokeChannels.settingsGet]: () => platform.settings.get(),
    [InvokeChannels.settingsSet]: (req) => platform.settings.set(req),
    [InvokeChannels.minecraftStatus]: (req) => platform.minecraft.status(req.mcVersion),
    [InvokeChannels.minecraftListLocations]: (req) =>
      platform.minecraft.listLocations(req.mcVersion),
    [InvokeChannels.minecraftExtract]: (req, context) =>
      platform.minecraft.extract(req.mcVersion, context.sendProgress),
    [InvokeChannels.minecraftReadAsset]: (req) =>
      platform.minecraft.readAsset(req.mcVersion, req.path),
    [InvokeChannels.minecraftListAssets]: (req) =>
      platform.minecraft.listAssets(req.mcVersion, req.prefix),
    [InvokeChannels.minecraftWorldgenFiles]: (req) =>
      platform.minecraft.readWorldgenFiles(req.mcVersion),
    [InvokeChannels.minecraftDataFiles]: (req) =>
      platform.minecraft.readDataFiles(req.mcVersion, req.folders),
    [InvokeChannels.minecraftNames]: (req) =>
      readTargetNames((mcVersion) => platform.minecraft.readLangNames(mcVersion), req.targetId),
    [InvokeChannels.minecraftAssetObject]: (req) =>
      platform.minecraft.readAssetObject(req.mcVersion, req.key),
    [InvokeChannels.minecraftStructureTemplates]: (req) =>
      platform.minecraft.readStructureTemplates(req.mcVersion, req.ids),
    [InvokeChannels.minecraftInstallResourcePack]: (req) =>
      platform.minecraft.installResourcePack(req.fileName, req.data),
    [InvokeChannels.minecraftListWorlds]: () => platform.minecraft.listWorlds(),
    [InvokeChannels.minecraftInstallDataPack]: (req) =>
      platform.minecraft.installDataPack(req.worldDir, req.fileName, req.data),
    [InvokeChannels.mcfunctionCheck]: (req) =>
      platform.mcfunction.check(req.targetId, req.source, req.options),
    [InvokeChannels.mcfunctionComplete]: (req) =>
      platform.mcfunction.complete(
        req.targetId,
        req.source,
        req.offset,
        req.options.limit === undefined
          ? { uri: req.options.uri, projectIds: req.options.projectIds }
          : { uri: req.options.uri, projectIds: req.options.projectIds, limit: req.options.limit },
      ),
    [InvokeChannels.exportsPickFolder]: (req) => platform.exports.pickFolder(req.title),
    [InvokeChannels.exportsWriteFiles]: (req) => platform.exports.writeFiles(req.folder, req.files),
    [InvokeChannels.exportsRuntimeJar]: (req) => platform.exports.runtimeJar(req.targetId),
    [InvokeChannels.exportsGeckolibJar]: (req) => platform.exports.geckolibJar(req.targetId),
    [InvokeChannels.exportsWriteTree]: (req) => platform.exports.writeTree(req.folder, req.files),
    [InvokeChannels.exportsGradleWrapper]: () => platform.exports.gradleWrapper(),
    [InvokeChannels.exportsScanJavaProject]: (req) =>
      platform.exports.scanJavaProject === undefined
        ? Promise.resolve(null)
        : platform.exports.scanJavaProject(req.title),
    [InvokeChannels.scriptingTranspile]: (req) =>
      platform.scripting.transpile(req.source, req.name),
    [InvokeChannels.scriptingCheck]: (req) =>
      platform.scripting.check(req.source, req.name, req.typings),
    [InvokeChannels.testInMinecraftStatus]: (req) => platform.testInMinecraft.status(req.targetId),
    [InvokeChannels.testInMinecraftCreateInstance]: (req) =>
      platform.testInMinecraft.createInstance(req.targetId),
    [InvokeChannels.testInMinecraftRun]: (req) =>
      platform.testInMinecraft.run(req.targetId, req.modId, req.data),
    [InvokeChannels.testInMinecraftRunModpack]: (req) =>
      platform.testInMinecraft.runModpack(req.targetId, req.jars, req.mods),
    [InvokeChannels.modpacksList]: () => platform.modpacks.list(),
    [InvokeChannels.modpacksCreate]: (req) => platform.modpacks.create(req.name, req.targetId),
    [InvokeChannels.modpacksAddExisting]: () => platform.modpacks.addExisting(),
    [InvokeChannels.modpacksForget]: async (req) => {
      await platform.modpacks.forget(req.root);
      return undefined;
    },
    [InvokeChannels.modpacksRead]: (req) => platform.modpacks.read(req.root),
    [InvokeChannels.modpacksWrite]: (req) => {
      const { summary, ...modpack } = req.modpack;
      return platform.modpacks.write(
        req.root,
        summary === undefined ? modpack : { ...modpack, summary },
      );
    },
    [InvokeChannels.modpacksAddProject]: (req) =>
      platform.modpacks.addProject(req.root, req.projectRoot),
    [InvokeChannels.modpacksReadProject]: (req) =>
      platform.modpacks.readProject(req.root, req.path),
    [InvokeChannels.modpacksLookupMod]: (req) =>
      platform.modpacks.lookupMod(req.input, req.gameVersion),
    [InvokeChannels.modpacksCheckMods]: (req) =>
      platform.modpacks.checkMods(req.sha1s, req.gameVersion),
    [InvokeChannels.testInMinecraftPickLauncherProgram]: (req) =>
      platform.testInMinecraft.pickLauncherProgram(req.launcher),
    [InvokeChannels.thumbnailsGet]: (req) => platform.thumbnails.get(req.assetPath, req.size),
    [InvokeChannels.updatesCheck]: () => updates.check(),
    [InvokeChannels.updatesInstall]: () => updates.install(),
    [InvokeChannels.updatesCurrent]: async () => updates.status,
    [InvokeChannels.pluginsList]: () => plugins.list(),
    [InvokeChannels.pluginsRead]: (req) => plugins.read(req.id),
    [InvokeChannels.pluginsOpenFolder]: () => plugins.openFolder(),
    [InvokeChannels.aiKeyStatus]: () => ai.keyStatus(),
    [InvokeChannels.aiSetKey]: (req) => ai.setKey(req.key),
    [InvokeChannels.aiClearKey]: () => ai.clearKey(),
    [InvokeChannels.aiTestKey]: () => ai.testKey(),
    [InvokeChannels.aiStart]: (req, context) =>
      ai.start(
        {
          runId: req.runId,
          conversationId: req.conversationId,
          mode: req.mode,
          text: req.text,
          contextBlocks: req.contextBlocks,
          ...(req.limits === undefined ? {} : { limits: req.limits }),
        },
        context.sender,
      ),
    [InvokeChannels.aiCancel]: (req) => ai.cancel(req.runId),
    [InvokeChannels.aiToolResult]: (req) =>
      ai.toolResult(req.runId, {
        requestId: req.requestId,
        content: req.content,
        isError: req.isError,
      }),
    [InvokeChannels.aiNewConversation]: (req) => ai.newConversation(req.conversationId),
    [InvokeChannels.aiDropConversation]: (req) => ai.dropConversation(req.conversationId),
    [InvokeChannels.aiPicturesStatus]: () => aiPictures.status(),
    [InvokeChannels.aiPicturesSetService]: (req) => aiPictures.setService(req.service),
    [InvokeChannels.aiPicturesSetKey]: (req) => aiPictures.setKey(req.service, req.key),
    [InvokeChannels.aiPicturesClearKey]: (req) => aiPictures.clearKey(req.service),
    [InvokeChannels.aiPicturesTestKey]: (req) => aiPictures.testKey(req.service),
    [InvokeChannels.aiPicturesGenerate]: (req) => aiPictures.generate(req),
    [InvokeChannels.aiPicturesCancel]: (req) => aiPictures.cancel(req.requestId),
    [InvokeChannels.aiPicturesCost]: (req) => aiPictures.cost(req),
    [InvokeChannels.tryItListWorlds]: () => platform.tryItWorlds.listWorlds(),
    [InvokeChannels.tryItReadArea]: (req) => platform.tryItWorlds.readArea(req),
    [InvokeChannels.worldBackupsList]: () => platform.worldBackups.list(),
    [InvokeChannels.worldBackupsRestore]: (req) => platform.worldBackups.restore(req),
    [InvokeChannels.worldBackupsOpenFolder]: () => platform.worldBackups.openFolder(),
    [InvokeChannels.mapsListWorlds]: (req) => platform.maps.listWorlds(req.targetId),
    [InvokeChannels.mapsExport]: (req) =>
      platform.maps.exportMap({
        targetId: req.targetId,
        sourceId: req.sourceId,
        worldDir: req.worldDir,
        keepPlayerData: req.keepPlayerData,
        mapName: req.mapName,
        dataPack: req.dataPack,
        resourcePack: req.resourcePack,
        mrpack: req.mrpack,
      }),
    [InvokeChannels.mapsListStructureSaves]: (req) =>
      platform.maps.listStructureSaves(req.targetId),
    [InvokeChannels.mapsReadStructureSave]: (req) =>
      platform.maps.readStructureSave(req.targetId, req.world, req.id),
    [InvokeChannels.guideIndex]: () => guide.index(),
    [InvokeChannels.guidePage]: (req) => guide.page(req.page),
    [InvokeChannels.playStatus]: (req) => platform.play.status(req.targetId),
    [InvokeChannels.playPlay]: (req) => platform.play.play(playInput(req)),
    [InvokeChannels.playReload]: (req) =>
      platform.play.reload({
        targetId: req.targetId,
        modId: req.modId,
        outputs: req.outputs.map(playOutput),
        ...(req.jar === undefined ? {} : { jar: req.jar }),
        ...(req.names === undefined ? {} : { names: req.names }),
      }),
    [InvokeChannels.playRestart]: (req) => platform.play.restart(playInput(req)),
    [InvokeChannels.playNewWorld]: (req) =>
      platform.play.newTestWorld(req.targetId, req.namespace, req.kind ?? 'test'),
    [InvokeChannels.instancesPlan]: (req) => platform.instances.plan(planRequest(req)),
    [InvokeChannels.instancesEnsure]: (req) =>
      platform.instances.ensure({
        ...planRequest(req),
        jars: req.jars.map((jar) => ({ modId: jar.modId, data: jar.data })),
        ...(req.remember === undefined ? {} : { remember: req.remember }),
      }),
    [InvokeChannels.instancesList]: () => platform.instances.list(),
    [InvokeChannels.instancesRemove]: (req) => platform.instances.remove(req.id),
    [InvokeChannels.instancesShowInFolder]: (req) => platform.instances.showInFolder(req.id),
    [InvokeChannels.instancesLaunch]: (req) => platform.instances.launch(planRequest(req)),
    [InvokeChannels.instancesPlayPlain]: (req) =>
      platform.instances.playPlain({
        targetId: req.targetId,
        project: { ...req.project },
        ...(req.world === undefined ? {} : { world: req.world }),
        ...packsOf(req),
      }),
    [InvokeChannels.instancesOpenMap]: (req) =>
      platform.instances.openMap({
        targetId: req.targetId,
        project: { ...req.project },
        mapName: req.mapName,
        sourceId: req.sourceId,
        worldDir: req.worldDir,
        jars: req.jars.map((jar) => ({ modId: jar.modId, data: jar.data })),
        ...(req.keepPlayerData === undefined ? {} : { keepPlayerData: req.keepPlayerData }),
        ...packsOf(req),
      }),
    [InvokeChannels.instancesCurseForgeProfile]: (req) =>
      platform.instances.curseForgeProfile({
        targetId: req.targetId,
        project: { ...req.project },
        jars: req.jars.map((jar) => ({ modId: jar.modId, data: jar.data })),
      }),
    [InvokeChannels.localServerStatus]: () => platform.localServer.status(),
    [InvokeChannels.localServerPrepare]: (req) => platform.localServer.prepare(serverRequest(req)),
    [InvokeChannels.localServerAcceptEula]: (req) =>
      platform.localServer.acceptEula(req.folder, {
        accepted: req.acceptance.accepted,
        at: req.acceptance.at,
      }),
    [InvokeChannels.localServerStart]: (req) => platform.localServer.start(serverRequest(req)),
    [InvokeChannels.localServerStop]: () => platform.localServer.stop(),
    [InvokeChannels.localServerRestart]: (req) => platform.localServer.restart(serverRequest(req)),
    [InvokeChannels.localServerLog]: (req) => platform.localServer.log(req.since),
  };
}

type InstancePlanIpc = z.output<IpcContract[typeof InvokeChannels.instancesPlan]['request']>;
type LocalServerIpc = z.output<IpcContract[typeof InvokeChannels.localServerStart]['request']>;

/** A validated instance request as the instances service takes it. */
function planRequest(req: InstancePlanIpc): InstancePlanRequest {
  const action = req.action;
  return {
    targetId: req.targetId,
    action:
      (action.kind === 'test' || action.kind === 'game') && action.join !== undefined
        ? { kind: action.kind, join: { host: action.join.host, port: action.join.port } }
        : action.kind === 'modpack'
          ? { kind: 'modpack', name: action.name, modIds: [...action.modIds] }
          : action.kind === 'map'
            ? { kind: 'map', name: action.name }
            : { kind: action.kind },
    project: { ...req.project },
  };
}

/** The project's packs a Play without mods or an Open this map carries (B766). */
function packsOf(request: {
  dataPack?: { fileName: string; data: Uint8Array } | undefined;
  resourcePack?: Uint8Array | undefined;
}): {
  dataPack?: { fileName: string; data: Uint8Array };
  resourcePack?: Uint8Array;
} {
  return {
    ...(request.dataPack === undefined
      ? {}
      : { dataPack: { fileName: request.dataPack.fileName, data: request.dataPack.data } }),
    ...(request.resourcePack === undefined ? {} : { resourcePack: request.resourcePack }),
  };
}

/** A validated local server request as the service takes it. */
function serverRequest(req: LocalServerIpc): LocalServerRequest {
  return {
    targetId: req.targetId,
    project: { ...req.project },
    jars: req.jars.map((jar) => ({ modId: jar.modId, data: jar.data })),
  };
}

type PlayRequest = z.output<IpcContract[typeof InvokeChannels.playPlay]['request']>;

/** A validated lowered file as the Play service takes it. */
function playOutput(file: PlayRequest['outputs'][number]): PlayOutputFile {
  return {
    path: file.path,
    contents: file.contents as PlayOutputFile['contents'],
    ...(file.elementId === undefined ? {} : { elementId: file.elementId }),
  };
}

/** A validated Play or Restart request as the Play service takes it. */
function playInput(req: PlayRequest): PlayInput {
  return {
    targetId: req.targetId,
    modId: req.modId,
    jar: req.jar,
    outputs: req.outputs.map(playOutput),
    namespaces: req.namespaces,
    items: req.items.map((item) => ({
      id: item.id,
      ...(item.count === undefined ? {} : { count: item.count }),
    })),
    ...(req.game === undefined ? {} : { game: { ...req.game } }),
  };
}

/**
 * Pushes Play status changes to every window and polls `status.json` every second while one
 * of the app's windows is focused (ADR 0084 D7). Call once, after `app.whenReady()`.
 */
export function registerPlayEvents(
  play: Pick<MainPlatform['play'], 'onStatus' | 'setPolling'>,
  electronApp: Pick<Electron.App, 'on'>,
): void {
  play.onStatus((status) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) {
        window.webContents.send(EventChannels.playStatusChanged, status);
      }
    }
  });
  electronApp.on('browser-window-focus', () => play.setPolling(true));
  electronApp.on('browser-window-blur', () => {
    // Blur fires before the next window's focus; poll only while none is focused.
    setTimeout(() => {
      if (BrowserWindow.getFocusedWindow() === null) play.setPolling(false);
    }, 0);
  });
}

/**
 * Pushes local server status changes to every window, and stops the server when the app quits
 * (ADR 0133 D7): the quit waits while the server saves and ends (killed after a time-out), and
 * a process that exits anyway takes the server with it. Call once, after `app.whenReady()`.
 */
export function registerLocalServerEvents(
  localServer: Pick<MainPlatform['localServer'], 'onStatus' | 'isRunning' | 'shutdown' | 'killNow'>,
  electronApp: Pick<Electron.App, 'on' | 'quit'>,
  processLike: Pick<NodeJS.Process, 'on'> = process,
): void {
  localServer.onStatus((status) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) {
        window.webContents.send(EventChannels.localServerStatusChanged, status);
      }
    }
  });
  let stopping = false;
  electronApp.on('before-quit', (event) => {
    if (!localServer.isRunning()) return;
    event.preventDefault();
    if (stopping) return;
    stopping = true;
    void localServer.shutdown().finally(() => {
      stopping = false;
      electronApp.quit();
    });
  });
  processLike.on('exit', () => localServer.killNow());
}

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window !== null && event.senderFrame === event.sender.mainFrame;
}

/** Registers every handler. Call once, after `app.whenReady()`. */
export function registerIpc(
  platform: MainPlatform,
  updates: IpcUpdates,
  plugins: IpcPlugins,
  ai: IpcAi,
  aiPictures?: IpcAiPictures,
): void {
  // ADR 0124 D14: packaged, `resources/guide/`; from source, the repository's `docs/guide/`
  // next to `app/` (the app path is `app/` under electron-vite).
  const guide = createGuideService({
    dir: guideDirFor({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      devGuideDir: join(app.getAppPath(), '..', 'docs', 'guide'),
    }),
  });
  const handlers = createIpcHandlers(platform, updates, plugins, ai, aiPictures, guide);
  for (const channel of Object.values(InvokeChannels) as InvokeChannel[]) {
    const { request } = ipcContract[channel];
    const handler = handlers[channel] as (
      req: unknown,
      context: HandlerContext,
    ) => Promise<unknown>;
    ipcMain.handle(channel, async (event, raw: unknown) => {
      if (!isTrustedSender(event)) throw new Error(`Untrusted sender for ${channel}.`);
      const context: HandlerContext = {
        sendProgress(progress) {
          if (!event.sender.isDestroyed())
            event.sender.send(EventChannels.minecraftProgress, progress);
        },
        sender: event.sender,
      };
      return handler(request.parse(raw), context);
    });
  }
}
