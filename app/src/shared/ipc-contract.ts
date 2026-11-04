/**
 * The typed, versioned IPC contract between the renderer and the main process (ADR 0007).
 * One zod schema per request and per response; {@link IpcApi} is derived from them. Binary
 * payloads travel as `Uint8Array` (structured clone).
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import { type InvokeChannel, InvokeChannels } from './ipc-channels';

export type { InvokeChannel, MenuCommand } from './ipc-channels';
export {
  EventChannels,
  InvokeChannels,
  IPC_VERSION,
  isMenuCommand,
  MENU_COMMANDS,
} from './ipc-channels';

const noRequest = z.undefined();
const voidResponse = z.void();
const pathRequest = z.object({ path: z.string().min(1) }).strict();
const bytes = z.custom<Uint8Array>((value) => value instanceof Uint8Array, {
  message: 'Expected a Uint8Array',
});
const rootResult = z.union([
  z.object({ ok: z.literal(true) }).strict(),
  z.object({ ok: z.literal(false), reason: z.string() }).strict(),
]);

/** The request and response schema of every invoke channel. */
export const ipcContract = {
  [InvokeChannels.projectPickDirectory]: {
    request: z.object({ title: z.string(), mustBeEmpty: z.boolean().optional() }).strict(),
    response: z.string().nullable(),
  },
  [InvokeChannels.projectOpenRoot]: { request: pathRequest, response: rootResult },
  [InvokeChannels.projectCreateRoot]: { request: pathRequest, response: rootResult },
  [InvokeChannels.projectCloseRoot]: { request: noRequest, response: voidResponse },
  [InvokeChannels.projectCurrentRoot]: { request: noRequest, response: z.string().nullable() },
  [InvokeChannels.fsReadFile]: { request: pathRequest, response: bytes },
  [InvokeChannels.fsWriteFile]: {
    request: z.object({ path: z.string().min(1), data: bytes }).strict(),
    response: voidResponse,
  },
  [InvokeChannels.fsReadDir]: {
    request: pathRequest,
    response: z.array(z.object({ name: z.string(), kind: z.enum(['file', 'directory']) }).strict()),
  },
  [InvokeChannels.fsExists]: { request: pathRequest, response: z.boolean() },
  [InvokeChannels.fsMkdirp]: { request: pathRequest, response: voidResponse },
  [InvokeChannels.fsRemove]: { request: pathRequest, response: voidResponse },
  [InvokeChannels.appInfo]: {
    request: noRequest,
    response: z
      .object({ version: z.string(), electron: z.string(), platform: z.string() })
      .strict(),
  },
  [InvokeChannels.dialogConfirmDiscard]: {
    request: z.object({ message: z.string() }).strict(),
    response: z.boolean(),
  },
} as const satisfies Record<InvokeChannel, { request: z.ZodType; response: z.ZodType }>;

/** The contract as a whole. */
export type IpcContract = typeof ipcContract;

/** The request type of a channel. */
export type IpcRequest<C extends InvokeChannel> = z.input<IpcContract[C]['request']>;

/** The response type of a channel. */
export type IpcResponse<C extends InvokeChannel> = z.output<IpcContract[C]['response']>;

/** One async function per invoke channel. */
export type IpcApi = { [C in InvokeChannel]: (request: IpcRequest<C>) => Promise<IpcResponse<C>> };
