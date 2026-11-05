/**
 * The typed, versioned IPC contract between the renderer and the main process (ADR 0007).
 * One zod schema per request and per response; {@link IpcApi} is derived from them. Binary
 * payloads travel as `Uint8Array` (structured clone).
 *
 * @packageDocumentation
 */

import { isProjectRelativePath } from '@msm/plugin-api';
import { z } from 'zod';
import {
  type InvokeChannel,
  InvokeChannels,
  PLUGIN_CAPABILITIES,
  PLUGIN_MAIN_MAX_BYTES,
  PLUGIN_SCHEMA_MAX_BYTES,
  PLUGIN_SCHEMAS_MAX,
  PLUGINS_MAX,
  UPDATE_DISABLED_REASONS,
  UPDATE_NOTES_MAX,
  UPDATE_STATUS_MESSAGE_MAX,
  VENDORED_KEYS,
} from './ipc-channels';

export type {
  InvokeChannel,
  MenuCommand,
  MenuOpenRecent,
  MinecraftProgress,
  PluginCapability,
  PluginProblemCode,
  UpdateDisabledReason,
  UpdateStatus,
  VendoredKeyName,
} from './ipc-channels';
export {
  EventChannels,
  InvokeChannels,
  IPC_VERSION,
  isMenuCommand,
  isMenuOpenRecent,
  isMinecraftProgress,
  isUpdateStatus,
  MENU_COMMANDS,
  MINECRAFT_PROGRESS_PHASES,
  PLUGIN_CAPABILITIES,
  PLUGIN_MAIN_MAX_BYTES,
  PLUGIN_SCHEMA_MAX_BYTES,
  PLUGIN_SCHEMAS_MAX,
  PLUGINS_MAX,
  PluginProblemCodes,
  UNSUPPORTED_PLUGIN_CAPABILITIES,
  UPDATE_DISABLED_REASONS,
  UPDATE_NOTES_MAX,
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
/**
 * The most files one export folder write may hold: two pack zips for a combined export, or
 * every structure file of a plugin exporter (`structure-nbt`, `sponge-schematic`).
 */
export const EXPORT_MAX_FILES = 4096;

/**
 * A structure file a plugin exporter writes into an export folder: `<namespace>/<path>.nbt`
 * or `.schem`, lower-case resource location characters, `/`-separated.
 */
export const STRUCTURE_EXPORT_FILE = /^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)+\.(?:nbt|schem)$/;

/**
 * Whether `name` may be written into an export folder: a single pack zip name, or a
 * {@link STRUCTURE_EXPORT_FILE} path without `.` or `..` segments. At most 255 characters.
 */
export function isExportFileName(name: string): boolean {
  if (name.length > 255) return false;
  if (PACK_FILE_NAME.test(name)) return true;
  return (
    STRUCTURE_EXPORT_FILE.test(name) &&
    name.split('/').every((segment) => segment !== '.' && segment !== '..')
  );
}

/** The deepest path an export tree may hold, in segments (ADR 0033 D4). */
export const EXPORT_TREE_MAX_DEPTH = 16;
/** The most files one export tree may hold (ADR 0033 D4). */
export const EXPORT_TREE_MAX_FILES = 4096;
/** One segment of an export tree path. */
export const EXPORT_TREE_SEGMENT = /^[A-Za-z0-9_.-]+$/;

/**
 * Whether `path` may be written by `exports.writeTree`: `/`-separated segments of
 * {@link EXPORT_TREE_SEGMENT}, none `.` or `..`, at least two (root folder and file) and at
 * most {@link EXPORT_TREE_MAX_DEPTH}, at most 1024 characters.
 */
export function isExportTreePath(path: string): boolean {
  if (path.length === 0 || path.length > 1024) return false;
  const segments = path.split('/');
  return (
    segments.length >= 2 &&
    segments.length <= EXPORT_TREE_MAX_DEPTH &&
    segments.every(
      (segment) => EXPORT_TREE_SEGMENT.test(segment) && segment !== '.' && segment !== '..',
    )
  );
}

const exportTreePath = z.string().max(1024).refine(isExportTreePath, {
  message: 'Not an export tree path',
});

/** The largest script source accepted over IPC (as mcfunction's). */
export const SCRIPT_MAX_SOURCE_LENGTH = MCFUNCTION_MAX_SOURCE_LENGTH;
/** The largest typings text accepted over IPC. */
export const SCRIPT_MAX_TYPINGS_LENGTH = 1024 * 1024;
/** A script's name: its output path (`msm/<ns>/script/<path>.ts`). */
export const SCRIPT_NAME = /^[A-Za-z0-9_./-]+$/;
const scriptColumn = z.number().int().nonnegative();
const scriptName = z.string().min(1).max(512).regex(SCRIPT_NAME);
const scriptDiagnostic = z
  .object({
    severity: z.enum(['error', 'warning']),
    code: z.enum(['typescript.syntax', 'typescript.semantic']),
    tsCode: z.number().int().nonnegative(),
    message: z.string().max(8192),
    line: scriptColumn,
    start: scriptColumn,
    end: scriptColumn,
    offset: z.object({ start: scriptColumn, end: scriptColumn }).strict(),
  })
  .strict();

const exportFileName = z.string().max(255).refine(isExportFileName, {
  message: 'Not an export file name',
});

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
/** A Fabric mod id (`fabric.mod.json` `id`): a lower-case letter, then 1 to 63 of `a-z0-9_-`. */
export const FABRIC_MOD_ID = /^[a-z][a-z0-9_-]{1,63}$/;
const fabricModId = z.string().regex(FABRIC_MOD_ID);
const shortVersion = z.string().min(1).max(128);
/** {@link TestInMinecraftStatus} as a schema. */
const testInMinecraftStatus = z
  .object({
    mcVersion: shortVersion,
    loader: shortVersion,
    api: shortVersion,
    location: gameLocationView.nullable(),
    mode: z.enum(['launch', 'install-only', 'blocked']),
    reason: z.string().max(1024).nullable(),
    launcherProgram: absolutePath.nullable(),
    managedInstanceName: z.string().min(1).max(255),
    managedInstanceSelected: z.boolean(),
    canCreateInstance: z.boolean(),
  })
  .strict();
/** {@link UpdateStatus} as a schema. */
export const updateStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('idle') }).strict(),
  z.object({ state: z.literal('checking') }).strict(),
  z
    .object({
      state: z.literal('available'),
      version: z.string().max(256),
      notes: z.string().max(UPDATE_NOTES_MAX).optional(),
    })
    .strict(),
  z
    .object({
      state: z.literal('not-available'),
      reason: z.literal('no-published-release').optional(),
    })
    .strict(),
  z
    .object({
      state: z.literal('downloading'),
      percent: z.number().min(0).max(100),
      version: z.string().max(256).optional(),
    })
    .strict(),
  z
    .object({
      state: z.literal('downloaded'),
      version: z.string().max(256),
      notes: z.string().max(UPDATE_NOTES_MAX).optional(),
    })
    .strict(),
  z
    .object({ state: z.literal('error'), message: z.string().max(UPDATE_STATUS_MESSAGE_MAX) })
    .strict(),
  z.object({ state: z.literal('disabled'), reason: z.enum(UPDATE_DISABLED_REASONS) }).strict(),
]);

/** The most recent projects kept in settings and sent over IPC. */
export const RECENT_PROJECTS_MAX = 10;
/** A recent project root named by the renderer; main checks it against the stored list. */
const recentRootRequest = z.object({ root: absoluteHostPath }).strict();
const recentProjectView = z
  .object({
    root: absolutePath,
    name: z.string().max(1024),
    openedAt: z.string().max(64),
    exists: z.boolean(),
  })
  .strict();

const rootResult = z.union([
  z.object({ ok: z.literal(true) }).strict(),
  z.object({ ok: z.literal(false), reason: z.string() }).strict(),
]);

/** The request and response schema of every invoke channel. */
/** A plugin id (ADR 0035 D2): lower case, digits, `.` and `-`, starting with a letter. */
export const PLUGIN_ID = /^[a-z][a-z0-9.-]*$/;
/** Namespaces no external plugin may use (ADR 0035 D2). */
export const RESERVED_PLUGIN_NAMESPACES: readonly string[] = Object.freeze(['minecraft', 'msm']);
/** A plugin's own version: semver `x.y.z` with optional pre-release and build parts. */
export const PLUGIN_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
/** The characters of a semver range; the renderer checks the range itself. */
export const PLUGIN_API_RANGE = /^[0-9A-Za-z.^~<>=|*+ -]+$/;

/** The namespace of a plugin id: its first `.`-separated segment. */
export function pluginNamespace(id: string): string {
  return id.split('.')[0] ?? id;
}

export const pluginIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(PLUGIN_ID, { message: 'The id must match /^[a-z][a-z0-9.-]*$/.' })
  .refine((id) => !RESERVED_PLUGIN_NAMESPACES.includes(pluginNamespace(id)), {
    message: 'The id must not start with "msm." or "minecraft." (reserved namespaces).',
  });

const pluginRelativePath = z.string().min(1).max(512).refine(isProjectRelativePath, {
  message: 'The path must be relative, use "/" and stay inside the plugin folder.',
});

/** The manifest `msm-plugin.json` (ADR 0035 D2). Unknown fields are refused. */
export const pluginManifestSchema = z
  .object({
    manifestVersion: z.literal(1),
    id: pluginIdSchema,
    name: z.string().trim().min(1).max(80),
    version: z.string().max(64).regex(PLUGIN_VERSION, { message: 'The version must be semver.' }),
    apiVersion: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(PLUGIN_API_RANGE, { message: 'The apiVersion must be a semver range.' }),
    main: pluginRelativePath,
    schemas: z.array(pluginRelativePath).max(PLUGIN_SCHEMAS_MAX).default([]),
    capabilities: z.array(z.enum(PLUGIN_CAPABILITIES)).max(PLUGIN_CAPABILITIES.length),
    description: z.string().max(1000).optional(),
    author: z.string().max(200).optional(),
    licence: z.string().max(100).optional(),
    homepage: z
      .string()
      .max(512)
      .regex(/^https:\/\/\S+$/, { message: 'The homepage must be an https: URL.' })
      .optional(),
  })
  .strict();

const ipcProblem = z
  .object({
    severity: z.enum(['error', 'warning', 'info']),
    code: z.string().min(1).max(128),
    message: z.string().max(4096),
    path: z.string().max(1024).optional(),
    file: z.string().max(1024).optional(),
  })
  .strict();

const externalPluginEntry = z
  .object({
    id: z.string().min(1).max(255),
    folder: z.string().min(1).max(255),
    manifest: pluginManifestSchema.nullable(),
    problems: z.array(ipcProblem).max(64),
  })
  .strict();

export const ipcContract = {
  [InvokeChannels.projectPickDirectory]: {
    request: z
      .object({
        title: z.string(),
        mustBeEmpty: z.boolean().optional(),
        purpose: z.literal('project').optional(),
      })
      .strict(),
    response: z.string().nullable(),
  },
  [InvokeChannels.projectOpenRoot]: { request: pathRequest, response: rootResult },
  [InvokeChannels.projectCreateRoot]: { request: pathRequest, response: rootResult },
  [InvokeChannels.projectCloseRoot]: { request: noRequest, response: voidResponse },
  [InvokeChannels.projectCurrentRoot]: { request: noRequest, response: z.string().nullable() },
  [InvokeChannels.projectRecent]: {
    request: noRequest,
    response: z.array(recentProjectView).max(RECENT_PROJECTS_MAX),
  },
  [InvokeChannels.projectOpenRecent]: { request: recentRootRequest, response: rootResult },
  [InvokeChannels.projectRemoveRecent]: { request: recentRootRequest, response: voidResponse },
  [InvokeChannels.projectClearRecent]: { request: noRequest, response: voidResponse },
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
          .array(z.object({ name: exportFileName, data: bytes }).strict())
          .min(1)
          .max(EXPORT_MAX_FILES),
      })
      .strict(),
    response: z.object({ paths: z.array(absolutePath) }).strict(),
  },
  [InvokeChannels.exportsRuntimeJar]: {
    request: z.object({ targetId }).strict(),
    response: bytes.nullable(),
  },
  [InvokeChannels.exportsGeckolibJar]: {
    request: z.object({ targetId }).strict(),
    response: bytes.nullable(),
  },
  [InvokeChannels.exportsWriteTree]: {
    request: z
      .object({
        folder: absolutePath,
        files: z
          .array(z.object({ path: exportTreePath, data: bytes }).strict())
          .min(1)
          .max(EXPORT_TREE_MAX_FILES),
      })
      .strict(),
    response: z.discriminatedUnion('ok', [
      z
        .object({ ok: z.literal(true), root: absolutePath, count: z.number().int().nonnegative() })
        .strict(),
      z
        .object({ ok: z.literal(false), reason: z.literal('folder-not-empty'), root: absolutePath })
        .strict(),
    ]),
  },
  [InvokeChannels.exportsGradleWrapper]: {
    request: noRequest,
    response: z
      .object({
        jar: bytes,
        gradlew: z.string().max(1024 * 1024),
        gradlewBat: z.string().max(1024 * 1024),
      })
      .strict()
      .nullable(),
  },
  [InvokeChannels.scriptingTranspile]: {
    request: z
      .object({ source: z.string().max(SCRIPT_MAX_SOURCE_LENGTH), name: scriptName })
      .strict(),
    response: z.union([
      z.object({ js: z.string() }).strict(),
      z.object({ problems: z.array(scriptDiagnostic) }).strict(),
    ]),
  },
  [InvokeChannels.scriptingCheck]: {
    request: z
      .object({
        source: z.string().max(SCRIPT_MAX_SOURCE_LENGTH),
        name: scriptName,
        typings: z.string().max(SCRIPT_MAX_TYPINGS_LENGTH),
      })
      .strict(),
    response: z.array(scriptDiagnostic),
  },
  [InvokeChannels.testInMinecraftStatus]: {
    request: z.object({ targetId }).strict(),
    response: testInMinecraftStatus,
  },
  [InvokeChannels.testInMinecraftCreateInstance]: {
    request: z.object({ targetId }).strict(),
    response: testInMinecraftStatus,
  },
  [InvokeChannels.testInMinecraftRun]: {
    request: z.object({ targetId, modId: fabricModId, data: bytes }).strict(),
    response: z
      .object({
        jarPath: absolutePath,
        replaced: z.boolean(),
        fabricApi: z.enum(['installed', 'present', 'user-copy']),
        fabricApiFile: fileName,
        launched: z.boolean(),
        note: z.string().max(1024).nullable(),
      })
      .strict(),
  },
  [InvokeChannels.testInMinecraftPickLauncherProgram]: {
    request: z.object({ launcher: z.enum(['prism', 'multimc']) }).strict(),
    response: absolutePath.nullable(),
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
  [InvokeChannels.updatesCurrent]: { request: noRequest, response: updateStatusSchema },
  [InvokeChannels.appWhatsNewOnLaunch]: { request: noRequest, response: z.boolean() },
  [InvokeChannels.pluginsList]: {
    request: noRequest,
    response: z.array(externalPluginEntry).max(PLUGINS_MAX),
  },
  [InvokeChannels.pluginsRead]: {
    request: z.object({ id: pluginIdSchema }).strict(),
    response: z
      .object({
        manifest: pluginManifestSchema,
        main: z.string().max(PLUGIN_MAIN_MAX_BYTES),
        schemas: z.array(z.string().max(PLUGIN_SCHEMA_MAX_BYTES)).max(PLUGIN_SCHEMAS_MAX),
      })
      .strict(),
  },
  [InvokeChannels.pluginsOpenFolder]: { request: noRequest, response: voidResponse },
} as const satisfies Record<InvokeChannel, { request: z.ZodType; response: z.ZodType }>;

/** The contract as a whole. */
export type IpcContract = typeof ipcContract;

/** The request type of a channel. */
export type IpcRequest<C extends InvokeChannel> = z.input<IpcContract[C]['request']>;

/** The response type of a channel. */
export type IpcResponse<C extends InvokeChannel> = z.output<IpcContract[C]['response']>;

/** One async function per invoke channel. */
export type IpcApi = { [C in InvokeChannel]: (request: IpcRequest<C>) => Promise<IpcResponse<C>> };
