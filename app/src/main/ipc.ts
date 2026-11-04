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
import type { MainPlatform } from './platform/node-platform';

/** Per-call services a handler may use. */
export interface HandlerContext {
  /** Sends extraction progress to the calling renderer. */
  sendProgress(progress: MinecraftProgress): void;
}

/** One handler per channel, taking the validated request. */
export type MainHandlers = {
  [C in InvokeChannel]: (
    request: z.output<IpcContract[C]['request']>,
    context: HandlerContext,
  ) => Promise<IpcResponse<C>>;
};

/** Maps every channel to the platform method that serves it. */
export function createIpcHandlers(platform: MainPlatform): MainHandlers {
  return {
    [InvokeChannels.projectPickDirectory]: (req) =>
      platform.dialogs.pickDirectory(
        req.mustBeEmpty === undefined
          ? { title: req.title }
          : { title: req.title, mustBeEmpty: req.mustBeEmpty },
      ),
    [InvokeChannels.projectOpenRoot]: (req) => platform.project.openRoot(req.path),
    [InvokeChannels.projectCreateRoot]: (req) => platform.project.createRoot(req.path),
    [InvokeChannels.projectCloseRoot]: () => platform.project.closeRoot(),
    [InvokeChannels.projectCurrentRoot]: () => platform.project.currentRoot(),
    [InvokeChannels.fsReadFile]: (req) => platform.fs.readFile(req.path),
    [InvokeChannels.fsWriteFile]: (req) => platform.fs.writeFile(req.path, req.data),
    [InvokeChannels.fsReadDir]: (req) => platform.fs.readDir(req.path),
    [InvokeChannels.fsExists]: (req) => platform.fs.exists(req.path),
    [InvokeChannels.fsMkdirp]: (req) => platform.fs.mkdirp(req.path),
    [InvokeChannels.fsRemove]: (req) => platform.fs.remove(req.path),
    [InvokeChannels.appInfo]: () => platform.app.info(),
    [InvokeChannels.dialogConfirmDiscard]: (req) => platform.dialogs.confirmDiscard(req.message),
    [InvokeChannels.dialogPickFiles]: (req) => platform.dialogs.pickFiles(req),
    [InvokeChannels.dialogSaveFile]: (req) => platform.dialogs.saveFile(req),
    [InvokeChannels.shellShowItemInFolder]: (req) => platform.shell.showItemInFolder(req.path),
    [InvokeChannels.targetsReadVendored]: (req) =>
      platform.targets.readVendored(req.targetId, req.key),
    [InvokeChannels.settingsGet]: () => platform.settings.get(),
    [InvokeChannels.settingsSet]: (req) => platform.settings.set(req),
    [InvokeChannels.minecraftStatus]: (req) => platform.minecraft.status(req.mcVersion),
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
    [InvokeChannels.thumbnailsGet]: (req) => platform.thumbnails.get(req.assetPath, req.size),
  };
}

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window !== null && event.senderFrame === event.sender.mainFrame;
}

/** Registers every handler. Call once, after `app.whenReady()`. */
export function registerIpc(platform: MainPlatform): void {
  const handlers = createIpcHandlers(platform);
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
      };
      return handler(request.parse(raw), context);
    });
  }
}
