/**
 * Registers an `ipcMain.handle` handler for every invoke channel. Requests are validated with
 * the contract's zod schemas before they reach the platform; only frames of windows this app
 * created may call in.
 *
 * @packageDocumentation
 */

import { BrowserWindow, type IpcMainInvokeEvent, ipcMain } from 'electron';
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
import type { AiSender, AiService } from './ai/ai-service';
import type { MainPlatform } from './platform/node-platform';
import type { PluginsService } from './platform/plugins';
import type { Updater } from './updater';

/** The updater operations the IPC layer serves. */
export type IpcUpdates = Pick<Updater, 'check' | 'install' | 'status'>;

/** The third-party plugin operations the IPC layer serves (ADR 0035). */
export type IpcPlugins = Pick<PluginsService, 'list' | 'read' | 'openFolder'>;

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
    [InvokeChannels.projectRecent]: () => platform.project.recent(),
    [InvokeChannels.projectOpenRecent]: (req) => platform.project.openRecent(req.root),
    [InvokeChannels.projectRemoveRecent]: (req) => platform.project.removeRecent(req.root),
    [InvokeChannels.projectClearRecent]: () => platform.project.clearRecent(),
    [InvokeChannels.fsReadFile]: (req) => platform.fs.readFile(req.path),
    [InvokeChannels.fsWriteFile]: (req) => platform.fs.writeFile(req.path, req.data),
    [InvokeChannels.fsReadDir]: (req) => platform.fs.readDir(req.path),
    [InvokeChannels.fsExists]: (req) => platform.fs.exists(req.path),
    [InvokeChannels.fsMkdirp]: (req) => platform.fs.mkdirp(req.path),
    [InvokeChannels.fsRemove]: (req) => platform.fs.remove(req.path),
    [InvokeChannels.appInfo]: () => platform.app.info(),
    [InvokeChannels.appWhatsNewOnLaunch]: () => platform.app.whatsNewOnLaunch(),
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
    [InvokeChannels.scriptingTranspile]: (req) =>
      platform.scripting.transpile(req.source, req.name),
    [InvokeChannels.scriptingCheck]: (req) =>
      platform.scripting.check(req.source, req.name, req.typings),
    [InvokeChannels.testInMinecraftStatus]: (req) => platform.testInMinecraft.status(req.targetId),
    [InvokeChannels.testInMinecraftCreateInstance]: (req) =>
      platform.testInMinecraft.createInstance(req.targetId),
    [InvokeChannels.testInMinecraftRun]: (req) =>
      platform.testInMinecraft.run(req.targetId, req.modId, req.data),
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
  };
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
): void {
  const handlers = createIpcHandlers(platform, updates, plugins, ai);
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
