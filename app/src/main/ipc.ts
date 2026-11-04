/**
 * Registers an `ipcMain.handle` handler for every invoke channel. Requests are validated with
 * the contract's zod schemas before they reach the platform; only frames of windows this app
 * created may call in.
 *
 * @packageDocumentation
 */

import { BrowserWindow, type IpcMainInvokeEvent, ipcMain } from 'electron';
import {
  type InvokeChannel,
  InvokeChannels,
  type IpcApi,
  type IpcRequest,
  ipcContract,
} from '../shared/ipc-contract';
import type { PlatformAdapter } from '../shared/platform';

/** Maps every channel to the platform method that serves it. */
export function createIpcApi(platform: PlatformAdapter): IpcApi {
  return {
    [InvokeChannels.projectPickDirectory]: (req) =>
      platform.dialogs.pickDirectory(stripUndefined(req)),
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
  };
}

function stripUndefined(req: IpcRequest<typeof InvokeChannels.projectPickDirectory>): {
  title: string;
  mustBeEmpty?: boolean;
} {
  return req.mustBeEmpty === undefined
    ? { title: req.title }
    : { title: req.title, mustBeEmpty: req.mustBeEmpty };
}

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window !== null && event.senderFrame === event.sender.mainFrame;
}

/** Registers every handler. Call once, after `app.whenReady()`. */
export function registerIpc(platform: PlatformAdapter): void {
  const api = createIpcApi(platform);
  for (const channel of Object.values(InvokeChannels) as InvokeChannel[]) {
    const { request } = ipcContract[channel];
    const handler = api[channel] as (req: unknown) => Promise<unknown>;
    ipcMain.handle(channel, async (event, raw: unknown) => {
      if (!isTrustedSender(event)) throw new Error(`Untrusted sender for ${channel}.`);
      return handler(request.parse(raw));
    });
  }
}
