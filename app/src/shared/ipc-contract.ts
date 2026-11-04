/**
 * The typed, versioned IPC contract between the renderer and the main process (ADR 0007).
 * One zod schema per request and per response; {@link IpcApi} is derived from them. Binary
 * payloads travel as `Uint8Array` (structured clone).
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import {
  type InvokeChannel,
  InvokeChannels,
  UPDATE_DISABLED_REASONS,
  UPDATE_STATUS_MESSAGE_MAX,
  VENDORED_KEYS,
} from './ipc-channels';

export type {
  InvokeChannel,
  MenuCommand,
  MinecraftProgress,
  UpdateDisabledReason,
  UpdateStatus,
  VendoredKeyName,
} from './ipc-channels';
export {
  EventChannels,
  InvokeChannels,
  IPC_VERSION,
  isMenuCommand,
  isMinecraftProgress,
  isUpdateStatus,
  MENU_COMMANDS,
  MINECRAFT_PROGRESS_PHASES,
  UPDATE_DISABLED_REASONS,
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
    schemaVersion: z.literal(2),
  })
  .strict();
/** A pack zip file name, as written by installs and combined exports. */
export const PACK_FILE_NAME = /^[A-Za-z0-9._ -]+\.zip$/;
const packFileName = z.string().max(255).regex(PACK_FILE_NAME);
/** A world folder name under `saves/`: one path segment, not `.` or `..`. */
const worldDir = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^/\\\0:]+$/)
  .refine((value) => value !== '.' && value !== '..', { message: 'Not a folder name' });

/** The largest mcfunction source accepted over IPC (mirrors the service's 2 MB guard). */
export const MCFUNCTION_MAX_SOURCE_LENGTH = 2 * 1024 * 1024;
/** The most project ids, over all categories, one mcfunction request may declare. */
export const MCFUNCTION_MAX_PROJECT_IDS = 50_000;
/** The largest completion limit a request may ask for. */
export const MCFUNCTION_MAX_COMPLETION_LIMIT = 10_000;
/** The most files one combined export may write. */
export const EXPORT_MAX_FILES = 16;

const targetId = z.string().min(1).max(128);
const mcfunctionSource = z.string().max(MCFUNCTION_MAX_SOURCE_LENGTH);
const mcfunctionUri = z.string().min(1).max(4096);
const projectIds = z
  .record(
    z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-z0-9_./-]+$/),
    z.array(z.string().min(1).max(512)),
  )
  .refine(
    (record) =>
      Object.values(record).reduce((total, ids) => total + ids.length, 0) <=
      MCFUNCTION_MAX_PROJECT_IDS,
    { message: `At most ${MCFUNCTION_MAX_PROJECT_IDS} project ids` },
  );
const lineRange = z.number().int().nonnegative();
const mcfunctionProblem = z
  .object({
    severity: z.enum(['error', 'warning', 'info']),
    code: z.string().regex(/^mcfunction\.(parse|check|lint\..+)$/),
    message: z.string(),
    line: lineRange,
    start: lineRange,
    end: lineRange,
    offset: z.object({ start: lineRange, end: lineRange }).strict(),
  })
  .strict();
const mcfunctionCompletion = z
  .object({
    label: z.string(),
    insertText: z.string(),
    kind: z.string(),
    detail: z.string().optional(),
  })
  .strict();
const worldInfo = z
  .object({ dir: z.string().min(1), name: z.string(), lastModified: z.string() })
  .strict();

const updateSettings = z.object({ autoCheck: z.boolean() }).strict();

/** The most manually added folders per launcher list in settings. */
export const LAUNCHER_ROOTS_MAX = 16;
/** The launchers MSM reads (ADR 0019); mirrors `LauncherKind`. */
export const LAUNCHER_KINDS = ['official', 'prism', 'multimc', 'curseforge'] as const;
/** Mod loaders recognised in instances; mirrors `LoaderKind`. */
export const LOADER_KINDS = [
  'fabric',
  'quilt',
  'forge',
  'neoforge',
  'liteloader',
  'unknown',
] as const;
/** Problem codes a game location may carry; mirrors `GameLocationProblemView['code']`. */
export const GAME_LOCATION_PROBLEM_CODES = [
  'location.no-minecraft-component',
  'location.unreadable-metadata',
  'location.game-dir-missing',
  'location.unsupported-instance-type',
] as const;
/** An absolute path on any host: POSIX `/...`, Windows `C:\...` or `C:/...`, or UNC `\\server\...`. */
const ABSOLUTE_PATH = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/;
/** An absolute path that main will store (settings); main also checks it with `node:path`. */
const absoluteHostPath = absolutePath
  .regex(ABSOLUTE_PATH, { message: 'Expected an absolute path' })
  .refine((value) => !value.includes('\0'), { message: 'Not a path' });
/** An instance folder name: one path segment, not `.` or `..`. */
const instanceFolder = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^/\\\0:]+$/)
  .refine((value) => value !== '.' && value !== '..', { message: 'Not a folder name' });
/**
 * {@link GameLocationRef} as a schema: `instance` is required for launcher instances and
 * absent for the official launcher.
 */
export const gameLocationRefSchema = z
  .object({
    launcher: z.enum(LAUNCHER_KINDS),
    root: absoluteHostPath,
    instance: instanceFolder.optional(),
  })
  .strict()
  .refine((ref) => (ref.launcher === 'official') === (ref.instance === undefined), {
    message: 'Only launcher instances name an instance folder',
  });
const launcherRoots = z.array(absoluteHostPath).max(LAUNCHER_ROOTS_MAX);
/** {@link LauncherSettings} as a schema. */
export const launcherSettingsSchema = z
  .object({
    prismDataDirs: launcherRoots,
    multimcRoots: launcherRoots,
    curseForgeRoots: launcherRoots,
  })
  .strict();
const locationWarning = z
  .object({ code: z.string().min(1).max(128), message: z.string() })
  .strict();
/** {@link GameLocationView} as a schema. */
const gameLocationView = z
  .object({
    ref: gameLocationRefSchema,
    id: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[A-Za-z0-9_.:-]+$/),
    displayName: z.string(),
    mcVersion: z.string().nullable(),
    loader: z
      .object({ kind: z.enum(LOADER_KINDS), version: z.string().nullable() })
      .strict()
      .nullable(),
    gameDir: absolutePath,
    modsDir: absolutePath.nullable(),
    problems: z.array(
      z.object({ code: z.enum(GAME_LOCATION_PROBLEM_CODES), message: z.string() }).strict(),
    ),
    warnings: z.array(locationWarning),
  })
  .strict();
/** {@link UpdateStatus} as a schema. */
export const updateStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('idle') }).strict(),
  z.object({ state: z.literal('checking') }).strict(),
  z.object({ state: z.literal('available'), version: z.string().max(256) }).strict(),
  z
    .object({
      state: z.literal('not-available'),
      reason: z.literal('no-published-release').optional(),
    })
    .strict(),
  z.object({ state: z.literal('downloading'), percent: z.number().min(0).max(100) }).strict(),
  z.object({ state: z.literal('downloaded'), version: z.string().max(256) }).strict(),
  z
    .object({ state: z.literal('error'), message: z.string().max(UPDATE_STATUS_MESSAGE_MAX) })
    .strict(),
  z.object({ state: z.literal('disabled'), reason: z.enum(UPDATE_DISABLED_REASONS) }).strict(),
]);

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
        updates: updateSettings,
        launchers: launcherSettingsSchema.optional(),
        installTarget: gameLocationRefSchema.nullable().optional(),
        detectedMinecraftDir: absolutePath.nullable(),
      })
      .strict(),
  },
  [InvokeChannels.settingsSet]: {
    // A partial update: fields left out keep their stored value.
    request: z
      .object({
        minecraftDir: absolutePath.nullable().optional(),
        updates: updateSettings.optional(),
        launchers: launcherSettingsSchema.optional(),
        installTarget: gameLocationRefSchema.nullable().optional(),
      })
      .strict(),
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
        // Launcher fields (ADR 0019): main always sends them; optional like `MinecraftStatus`.
        target: gameLocationView.nullable().optional(),
        targetMissing: z.boolean().optional(),
        jar: z
          .object({ versionId: z.string(), launcher: z.enum(LAUNCHER_KINDS) })
          .strict()
          .nullable()
          .optional(),
        warnings: z.array(locationWarning).optional(),
      })
      .strict(),
  },
  [InvokeChannels.minecraftListLocations]: {
    request: z.object({ mcVersion }).strict(),
    response: z
      .object({
        locations: z.array(gameLocationView),
        selected: z.string().nullable(),
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
        fileName: packFileName,
        data: bytes,
      })
      .strict(),
    response: z.object({ path: absolutePath }).strict(),
  },
  [InvokeChannels.minecraftListWorlds]: {
    request: noRequest,
    response: z.array(worldInfo),
  },
  [InvokeChannels.minecraftInstallDataPack]: {
    request: z.object({ worldDir, fileName: packFileName, data: bytes }).strict(),
    response: z.object({ path: absolutePath }).strict(),
  },
  [InvokeChannels.mcfunctionCheck]: {
    request: z
      .object({
        targetId,
        source: mcfunctionSource,
        options: z.object({ uri: mcfunctionUri, projectIds }).strict(),
      })
      .strict(),
    response: z.array(mcfunctionProblem),
  },
  [InvokeChannels.mcfunctionComplete]: {
    request: z
      .object({
        targetId,
        source: mcfunctionSource,
        offset: z.number().int().nonnegative().max(MCFUNCTION_MAX_SOURCE_LENGTH),
        options: z
          .object({
            uri: mcfunctionUri,
            projectIds,
            limit: z.number().int().min(1).max(MCFUNCTION_MAX_COMPLETION_LIMIT).optional(),
          })
          .strict(),
      })
      .strict(),
    response: z.array(mcfunctionCompletion),
  },
  [InvokeChannels.exportsPickFolder]: {
    request: z.object({ title: z.string().max(256) }).strict(),
    response: absolutePath.nullable(),
  },
  [InvokeChannels.exportsWriteFiles]: {
    request: z
      .object({
        folder: absolutePath,
        files: z
          .array(z.object({ name: packFileName, data: bytes }).strict())
          .min(1)
          .max(EXPORT_MAX_FILES),
      })
      .strict(),
    response: z.object({ paths: z.array(absolutePath) }).strict(),
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
  [InvokeChannels.updatesCheck]: { request: noRequest, response: updateStatusSchema },
  [InvokeChannels.updatesInstall]: { request: noRequest, response: voidResponse },
} as const satisfies Record<InvokeChannel, { request: z.ZodType; response: z.ZodType }>;

/** The contract as a whole. */
export type IpcContract = typeof ipcContract;

/** The request type of a channel. */
export type IpcRequest<C extends InvokeChannel> = z.input<IpcContract[C]['request']>;

/** The response type of a channel. */
export type IpcResponse<C extends InvokeChannel> = z.output<IpcContract[C]['response']>;

/** One async function per invoke channel. */
export type IpcApi = { [C in InvokeChannel]: (request: IpcRequest<C>) => Promise<IpcResponse<C>> };
