/**
 * The typed, versioned IPC contract between the renderer and the main process (ADR 0007).
 * One zod schema per request and per response; {@link IpcApi} is derived from them. Binary
 * payloads travel as `Uint8Array` (structured clone).
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import { type InvokeChannel, InvokeChannels, VENDORED_KEYS } from './ipc-channels';

export type {
  InvokeChannel,
  MenuCommand,
  MinecraftProgress,
  VendoredKeyName,
} from './ipc-channels';
export {
  EventChannels,
  InvokeChannels,
  IPC_VERSION,
  isMenuCommand,
  isMinecraftProgress,
  MENU_COMMANDS,
  MINECRAFT_PROGRESS_PHASES,
  VENDORED_KEYS,
} from './ipc-channels';

/** The smallest thumbnail edge length, in pixels. */
export const THUMBNAIL_MIN_SIZE = 8;
/** The largest thumbnail edge length, in pixels. */
export const THUMBNAIL_MAX_SIZE = 512;

const noRequest = z.undefined();
const voidResponse = z.void();
const pathRequest = z.object({ path: z.string().min(1) }).strict();
const bytes = z.custom<Uint8Array>((value) => value instanceof Uint8Array, {
  message: 'Expected a Uint8Array',
});
/** A Minecraft version id used as one cache folder name: no separators, not `.` or `..`. */
const mcVersion = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._+-]+$/)
  .refine((value) => value !== '.' && value !== '..', { message: 'Not a version id' });
/** An absolute path chosen by the user or returned by main; main checks it further. */
const absolutePath = z.string().min(1).max(4096);
const fileFilters = z
  .array(z.object({ name: z.string(), extensions: z.array(z.string().min(1)) }).strict())
  .max(16);
/** A plain file name: no directory separators, not `.` or `..`. */
const fileName = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^/\\\0]+$/)
  .refine((value) => value !== '.' && value !== '..', { message: 'Not a file name' });
const assetCacheInfo = z
  .object({
    version: z.string(),
    jarSha1: z.string(),
    fileCount: z.number().int().nonnegative(),
    extractedAt: z.string(),
    schemaVersion: z.literal(1),
  })
  .strict();
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
  [InvokeChannels.dialogPickFiles]: {
    request: z.object({ title: z.string(), filters: fileFilters.optional() }).strict(),
    response: z.array(
      z.object({ path: absolutePath, name: z.string().min(1), data: bytes }).strict(),
    ),
  },
  [InvokeChannels.dialogSaveFile]: {
    request: z
      .object({
        title: z.string(),
        defaultName: fileName,
        filters: fileFilters.optional(),
        data: bytes,
      })
      .strict(),
    response: absolutePath.nullable(),
  },
  [InvokeChannels.shellShowItemInFolder]: {
    request: z.object({ path: absolutePath }).strict(),
    response: voidResponse,
  },
  [InvokeChannels.targetsReadVendored]: {
    request: z.object({ targetId: z.string().min(1), key: z.enum(VENDORED_KEYS) }).strict(),
    response: bytes,
  },
  [InvokeChannels.settingsGet]: {
    request: noRequest,
    response: z
      .object({
        minecraftDir: absolutePath.nullable(),
        detectedMinecraftDir: absolutePath.nullable(),
      })
      .strict(),
  },
  [InvokeChannels.settingsSet]: {
    request: z.object({ minecraftDir: absolutePath.nullable() }).strict(),
    response: voidResponse,
  },
  [InvokeChannels.minecraftStatus]: {
    request: z.object({ mcVersion }).strict(),
    response: z
      .object({
        minecraftDir: absolutePath.nullable(),
        installed: z.array(z.object({ id: z.string() }).strict()),
        chosen: z.object({ id: z.string() }).strict().nullable(),
        cache: assetCacheInfo.nullable(),
      })
      .strict(),
  },
  [InvokeChannels.minecraftExtract]: {
    request: z.object({ mcVersion }).strict(),
    response: assetCacheInfo,
  },
  [InvokeChannels.minecraftReadAsset]: {
    request: z.object({ mcVersion, path: z.string().min(1).max(1024) }).strict(),
    response: bytes.nullable(),
  },
  [InvokeChannels.minecraftListAssets]: {
    request: z.object({ mcVersion, prefix: z.string().max(1024) }).strict(),
    response: z.array(z.string()),
  },
  [InvokeChannels.minecraftInstallResourcePack]: {
    request: z
      .object({
        fileName: z
          .string()
          .regex(/^[A-Za-z0-9._ -]+\.zip$/)
          .max(255),
        data: bytes,
      })
      .strict(),
    response: z.object({ path: absolutePath }).strict(),
  },
  [InvokeChannels.thumbnailsGet]: {
    request: z
      .object({
        assetPath: z.string().min(1).max(1024),
        size: z.number().int().min(THUMBNAIL_MIN_SIZE).max(THUMBNAIL_MAX_SIZE),
      })
      .strict(),
    response: bytes,
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
