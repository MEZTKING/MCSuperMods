/**
 * The typed, versioned IPC contract between the renderer and the main process (ADR 0007).
 * One zod schema per request and per response; {@link IpcApi} is derived from them. Binary
 * payloads travel as `Uint8Array` (structured clone).
 *
 * @packageDocumentation
 */

import {
  AI_IMAGES_MAX,
  aiImageSchema,
  aiModeSchema,
  aiRunLimitsSchema,
  aiSettingsSchema,
} from '@msm/ai';
import { isProjectRelativePath } from '@msm/plugin-api';
import { z } from 'zod';
import {
  AI_PICTURE_SERVICES,
  AI_PICTURE_STYLES,
  AI_PICTURES_IMAGE_MAX_BYTES,
  AI_PICTURES_KEY_MAX,
  AI_PICTURES_MAX_COUNT,
  AI_PICTURES_MAX_EDGE,
  AI_PICTURES_MIN_EDGE,
  AI_PICTURES_PROMPT_MAX,
  AI_PICTURES_REFERENCE_MAX_EDGE,
} from './ai-pictures';
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
import { RECOVERY_NOTICE_PLUGINS_MAX } from './recovery-notice';

export type {
  AiEventPayload,
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
  AI_EVENT_TYPES,
  EventChannels,
  InvokeChannels,
  IPC_VERSION,
  isAiEventPayload,
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
/** The most files the read-only Java project scan returns (B822, ADR 0136 D8). */
export const JAVA_SCAN_MAX_FILES = 8000;
/** The most characters of one file the Java project scan returns (one megabyte of bytes). */
export const JAVA_SCAN_MAX_FILE_CHARS = 1024 * 1024;
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
    jarPath: z.string().max(4096),
    dataFolders: z.array(z.string().max(256)).max(256),
    fileCount: z.number().int().nonnegative(),
    byteCount: z.number().int().nonnegative(),
    extractedAt: z.string(),
    schemaVersion: z.literal(8),
  })
  .strict();
/** The most worldgen files one answer may carry (both targets have about 1,300; ADR 0119 D4). */
export const WORLDGEN_FILES_MAX = 20_000;
/**
 * A cached vanilla worldgen answer (ADR 0119 D4): folder key to id to JSON. The JSON is not
 * walked here (about 2 MB); main builds it from the cache, and the engine checks every file.
 */
const worldgenFileMap = z
  .record(z.string().min(1).max(256), z.record(z.string().min(1).max(512), z.unknown()))
  .refine(
    (folders) =>
      Object.values(folders).reduce((sum, files) => sum + Object.keys(files).length, 0) <=
      WORLDGEN_FILES_MAX,
    { message: 'Too many worldgen files' },
  );
const vanillaWorldgenFiles = z
  .object({
    version: z.string().max(64),
    files: worldgenFileMap,
    fileCount: z.number().int().nonnegative().max(WORLDGEN_FILES_MAX),
    resolvedBiomeLists: z.record(z.string(), z.unknown()).nullable(),
  })
  .strict();
/**
 * The most vanilla data files one live views answer may carry (all the cache's folders together
 * are about 5,500 on each target; ADR 0120 D11).
 */
export const DATA_FILES_MAX = 20_000;
/** A `data/minecraft/` folder key such as `loot_table` or `tags/item` (`isDataFolder` in interop). */
const dataFolderKey = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9_]+(?:\/[a-z0-9_]+)*$/);
const vanillaDataFiles = z
  .object({
    version: z.string().max(64),
    folders: z
      .record(dataFolderKey, z.record(z.string().min(1).max(512), z.unknown()))
      .refine(
        (folders) =>
          Object.values(folders).reduce((sum, files) => sum + Object.keys(files).length, 0) <=
          DATA_FILES_MAX,
        { message: 'Too many data files' },
      ),
    fileCount: z.number().int().nonnegative().max(DATA_FILES_MAX),
  })
  .strict();
/** The most template ids one `minecraft:structureTemplates` call asks (interop's limit). */
export const STRUCTURE_TEMPLATE_IDS_MAX = 256;
/** The largest structure template file answered (2 MB as stored; vanilla's largest is about 80 KB). */
export const STRUCTURE_TEMPLATE_MAX_BYTES = 2 * 1024 * 1024;
/** The most bytes of templates one answer carries (32 MB; every vanilla template is about 4.2 MB). */
export const STRUCTURE_TEMPLATES_MAX_TOTAL_BYTES = 32 * 1024 * 1024;
/**
 * A vanilla structure template id, `minecraft:<path>` (`isStructureTemplateId` in interop): lower
 * case, digits, `_`, `-`, `.` in `/`-separated parts, no `.` or `..` part, at most 256 after the
 * namespace.
 */
const structureTemplateId = z
  .string()
  .min('minecraft:'.length + 1)
  .max('minecraft:'.length + 256)
  .regex(/^minecraft:[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*$/)
  .refine(
    (value) =>
      !value
        .slice('minecraft:'.length)
        .split('/')
        .some((part) => /^\.+$/.test(part)),
    {
      message: 'Not a template id',
    },
  );
const vanillaStructureTemplates = z
  .object({
    version: z.string().max(64),
    templates: z
      .record(
        structureTemplateId,
        z.custom<Uint8Array>(
          (value) =>
            value instanceof Uint8Array && value.byteLength <= STRUCTURE_TEMPLATE_MAX_BYTES,
          { message: 'Expected a Uint8Array of at most 2 MB' },
        ),
      )
      .refine(
        (templates) => {
          const values = Object.values(templates);
          return (
            values.length <= STRUCTURE_TEMPLATE_IDS_MAX &&
            values.reduce((sum, bytes) => sum + bytes.byteLength, 0) <=
              STRUCTURE_TEMPLATES_MAX_TOTAL_BYTES
          );
        },
        { message: 'Too many template bytes' },
      ),
    missing: z.array(structureTemplateId).max(STRUCTURE_TEMPLATE_IDS_MAX),
    refused: z.array(structureTemplateId).max(STRUCTURE_TEMPLATE_IDS_MAX),
  })
  .strict();
/** The largest object `minecraft:assetObject` answers (16 MB; B619 3S1). */
export const ASSET_OBJECT_MAX_BYTES = 16 * 1024 * 1024;
/** An asset store index key such as `minecraft/sounds/mob/wolf/bark1.ogg`; main checks it further. */
const assetKey = z
  .string()
  .min(1)
  .max(512)
  .regex(/^minecraft\/[a-z0-9_./-]+$/)
  .refine((value) => !value.split('/').some((part) => part === '' || /^\.+$/.test(part)), {
    message: 'Not an index key',
  });
const assetObjectAnswer = z.union([
  z
    .object({
      ok: z.literal(true),
      bytes: z.custom<Uint8Array>(
        (value) => value instanceof Uint8Array && value.byteLength <= ASSET_OBJECT_MAX_BYTES,
        { message: 'Expected a Uint8Array of at most 16 MB' },
      ),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      reason: z.enum([
        'not_set_up',
        'no_index',
        'not_listed',
        'not_allowed',
        'too_large',
        'missing',
      ]),
    })
    .strict(),
]);
/** A built-in target id (main looks it up; an unknown one is refused there). */
const knownTargetId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);
/** The longest vanilla name `minecraft:names` carries (B656). */
export const VANILLA_NAME_MAX = 200;
/** The most names of one sort `minecraft:names` carries (about 1,500 items today). */
export const VANILLA_NAMES_MAX = 10_000;
const vanillaNameMap = (key: RegExp) =>
  z
    .record(z.string().max(160).regex(key), z.string().min(1).max(VANILLA_NAME_MAX))
    .refine((names) => Object.keys(names).length <= VANILLA_NAMES_MAX, {
      message: 'Too many names',
    });
const vanillaIdNames = vanillaNameMap(/^minecraft:[a-z0-9_]+$/);
/** The English names of a target's vanilla things (ADR 0124 D3, B656). */
const vanillaNames = z
  .object({
    version: z.string().max(64),
    blocks: vanillaIdNames,
    items: vanillaIdNames,
    entityTypes: vanillaIdNames,
    biomes: vanillaIdNames,
    effects: vanillaIdNames,
    enchantments: vanillaIdNames,
    potions: vanillaIdNames,
    subtitles: vanillaNameMap(/^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/),
  })
  .strict();
/** A guide page name: a file of the guide folder without `.md` (ADR 0124 D14). */
const guidePageName = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
/** The largest guide page served (main refuses larger files). */
export const GUIDE_PAGE_MAX_CHARS = 1024 * 1024;
/** The most guide pages and sections an index carries. */
export const GUIDE_INDEX_PAGES_MAX = 200;
export const GUIDE_INDEX_SECTIONS_MAX = 5000;
const guideIndex = z
  .object({
    pages: z
      .array(z.object({ page: guidePageName, title: z.string().max(200) }).strict())
      .max(GUIDE_INDEX_PAGES_MAX),
    sections: z
      .array(
        z
          .object({
            page: guidePageName,
            level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
            heading: z.string().min(1).max(200),
            anchor: z.string().max(256),
            alias: z.string().min(1).max(256).optional(),
            sentence: z.string().max(300),
          })
          .strict(),
      )
      .max(GUIDE_INDEX_SECTIONS_MAX),
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
 * Whether `name` may be written into an export folder: a single pack zip name, or a relative
 * `/`-separated path (structure files, or whatever a plugin exporter writes) of at most
 * {@link EXPORT_TREE_MAX_DEPTH} segments, each matching {@link EXPORT_TREE_SEGMENT} and not
 * starting with `.` (so no `.`, `..` or hidden files). At most 255 characters. Main also
 * checks the real path stays inside the picked folder.
 */
export function isExportFileName(name: string): boolean {
  if (name.length > 255) return false;
  if (PACK_FILE_NAME.test(name)) return true;
  const segments = name.split('/');
  return (
    segments.length <= EXPORT_TREE_MAX_DEPTH &&
    segments.every((segment) => EXPORT_TREE_SEGMENT.test(segment) && !segment.startsWith('.'))
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

/** The most backups per world `backups.keep` may ask for (ADR 0102 D1). */
export const WORLD_BACKUPS_KEEP_MAX = 50;
/** The default of `backups.keep`. */
export const WORLD_BACKUPS_KEEP_DEFAULT = 5;

const worldBackupSettings = z
  .object({
    beforeInstall: z.boolean(),
    keep: z.number().int().min(1).max(WORLD_BACKUPS_KEEP_MAX),
  })
  .strict();

/** The offer card's settings (ADR 0133 D3). */
const instanceSettings = z
  .object({
    ask: z.enum(['first-time', 'always', 'never']),
    madeByItself: z.array(z.enum(['test', 'plain', 'pack', 'map', 'server'])).max(5),
  })
  .strict();

/** The local server's settings (ADR 0133 D7). */
const localServerSettings = z.object({ whiteList: z.boolean(), onlineMode: z.boolean() }).strict();

/** A backup folder name under `<msmHome>/backups/`: one safe segment. */
const backupSegment = worldDir;

const worldBackupRef = z
  .object({
    path: absolutePath,
    fileName: backupSegment,
    location: backupSegment,
    worldDir: backupSegment,
  })
  .strict();

const worldBackupList = z
  .object({
    folder: absolutePath,
    groups: z.array(
      z
        .object({
          location: backupSegment,
          locationName: z.string(),
          available: z.boolean(),
          worldDir: backupSegment,
          backups: z.array(
            z
              .object({
                fileName: backupSegment,
                path: absolutePath,
                size: z.number().int().nonnegative(),
                createdAt: z.string(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();

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

/** The most member jars or extra mods one modpack call carries (ADR 0046). */
const MODPACK_IPC_MAX = 512;
const modpackText = z.string().min(1).max(256);
const modpackMod = z
  .object({
    projectId: modpackText,
    versionId: modpackText,
    title: modpackText,
    fileName,
    url: z.string().max(2048),
    sha1: z.string().regex(/^[0-9a-f]{40}$/),
    sha512: z.string().regex(/^[0-9a-f]{128}$/),
    size: z.number().int().positive(),
  })
  .strict();
/** A modpack's shape; main validates it fully with `parseModpack` before writing. */
const modpackShape = z
  .object({
    formatVersion: z.literal(1),
    name: modpackText,
    version: modpackText,
    summary: modpackText.optional(),
    targetId,
    projects: z
      .array(z.object({ path: z.string().min(1).max(1024) }).strict())
      .max(MODPACK_IPC_MAX),
    mods: z.array(modpackMod).max(MODPACK_IPC_MAX),
  })
  .strict();
const modpackView = z
  .object({
    root: absolutePath,
    modpack: modpackShape,
    members: z
      .array(
        z
          .object({
            path: z.string().min(1).max(1024),
            root: absolutePath,
            found: z.boolean(),
            name: z.string().max(256).nullable(),
            targetId: z.string().max(128).nullable(),
          })
          .strict(),
      )
      .max(MODPACK_IPC_MAX),
  })
  .strict();
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

/** The longest user message of one AI helper run (characters). */
export const AI_TEXT_MAX = 64 * 1024;
/** The most context blocks of one AI helper run. */
export const AI_CONTEXT_BLOCKS_MAX = 8;
/** The longest context block (characters). */
export const AI_CONTEXT_BLOCK_MAX = 64 * 1024;
/** The longest API key `setKey` accepts (characters). */
export const AI_KEY_MAX = 512;
/** The longest tool result content (characters). */
export const AI_TOOL_RESULT_MAX = 2 * 1024 * 1024;
/** The longest run, request and conversation id. */
const AI_ID_MAX = 200;

const aiId = z.string().min(1).max(AI_ID_MAX);
/** `AiStartRequest` with the IPC size bounds (ADR 0041 D3). */
const aiStartRequest = z
  .object({
    runId: aiId,
    conversationId: aiId,
    mode: aiModeSchema,
    text: z.string().max(AI_TEXT_MAX),
    contextBlocks: z.array(z.string().max(AI_CONTEXT_BLOCK_MAX)).max(AI_CONTEXT_BLOCKS_MAX),
    // Screenshots and pictures (ADR 0048), base64 within the API's size limit.
    images: z.array(aiImageSchema.strict()).max(AI_IMAGES_MAX).optional(),
    limits: aiRunLimitsSchema.strict().optional(),
  })
  .strict();
/** `AppSettings.ai` as sent by the renderer. */
const aiSettings = aiSettingsSchema.strict();
const aiKeyTestResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), model: z.string().max(200) }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.string().max(2000),
      errorClass: z.string().max(200),
    })
    .strict(),
]);

// ---- AI pictures (ADR 0093). ----

const aiPictureService = z.enum(AI_PICTURE_SERVICES);
const aiPictureErrorClass = z.enum([
  'no_key',
  'bad_key',
  'quota',
  'rate_limit',
  'refused',
  'network',
  'timeout',
  'cancelled',
  'server',
  'bad_response',
]);
const aiPictureKeyState = z
  .object({ set: z.boolean(), tail: z.string().max(4).nullable() })
  .strict();
/** The status the renderer sees: whether keys are set and their tails, never a key. */
const aiPicturesStatus = z
  .object({
    service: aiPictureService,
    keys: z.object({ 'retro-diffusion': aiPictureKeyState, openai: aiPictureKeyState }).strict(),
    encryptionAvailable: z.boolean(),
  })
  .strict();
const aiPictureFailure = z
  .object({ ok: z.literal(false), error: z.string().max(2000), errorClass: aiPictureErrorClass })
  .strict();
const aiPictureKeyTest = z.union([z.object({ ok: z.literal(true) }).strict(), aiPictureFailure]);
/** RGB pixels of a reference or palette picture: exactly width × height × 3 bytes. */
const aiPictureRaster = z
  .object({
    width: z.number().int().min(1).max(AI_PICTURES_REFERENCE_MAX_EDGE),
    height: z.number().int().min(1).max(AI_PICTURES_REFERENCE_MAX_EDGE),
    rgb: bytes,
  })
  .strict()
  .refine((value) => value.rgb.length === value.width * value.height * 3, {
    message: 'The picture has the wrong number of bytes',
  });
const aiPictureRequest = z
  .object({
    requestId: aiId,
    prompt: z.string().trim().min(1).max(AI_PICTURES_PROMPT_MAX),
    style: z.enum(AI_PICTURE_STYLES),
    size: z.number().int().min(8).max(64),
    width: z.number().int().min(AI_PICTURES_MIN_EDGE).max(AI_PICTURES_MAX_EDGE).optional(),
    height: z.number().int().min(AI_PICTURES_MIN_EDGE).max(AI_PICTURES_MAX_EDGE).optional(),
    count: z.number().int().min(1).max(AI_PICTURES_MAX_COUNT),
    transparent: z.boolean(),
    reference: aiPictureRaster.optional(),
    strength: z.number().min(0).max(1).optional(),
    palette: aiPictureRaster.optional(),
    seed: z.number().int().min(0).max(2_147_483_647).optional(),
  })
  .strict();
/** A price asked before a request: the request without its id. */
const aiPictureCostRequest = aiPictureRequest.omit({ requestId: true });
const aiPictureCost = z.union([
  z
    .object({
      ok: z.literal(true),
      usd: z.number().min(0).max(1000).nullable(),
      balanceUsd: z.number().min(-1e9).max(1e9).nullable(),
    })
    .strict(),
  aiPictureFailure,
]);
const aiPictureResult = z.union([
  z
    .object({
      ok: z.literal(true),
      images: z
        .array(bytes.refine((value) => value.length <= AI_PICTURES_IMAGE_MAX_BYTES))
        .max(AI_PICTURES_MAX_COUNT),
    })
    .strict(),
  aiPictureFailure,
]);

// ---- One-click Play and Reload (ADR 0084). ----

/** The most lowered files one Play or Reload carries. */
export const PLAY_OUTPUTS_MAX = 50_000;
/** The most chest items one Play carries. */
export const PLAY_ITEMS_MAX = 4096;
/** A jar path of a lowered file: relative, `/`-separated, no empty, `.` or `..` segments. */
const playJarPath = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (path) =>
      !path.includes('\\') &&
      !path.startsWith('/') &&
      path.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
    { message: 'Not a jar path' },
  );
const playOutputFile = z
  .object({
    path: playJarPath,
    contents: z.union([bytes, z.json()]),
    elementId: z.string().min(1).max(512).optional(),
  })
  .strict();
const playNamespace = z.string().regex(/^[a-z0-9_.-]{1,64}$/);
/** Play my game's settings (ADR 0116 D1). */
const playGame = z
  .object({
    preset: z
      .string()
      .regex(/^[a-z0-9_.-]{1,64}:[a-z0-9_./-]{1,256}$/)
      .refine((id) => !id.includes('//') && !id.endsWith('/'), { message: 'Not a world type id' }),
    gameMode: z.enum(['survival', 'creative', 'adventure', 'spectator']),
    difficulty: z.enum(['peaceful', 'easy', 'normal', 'hard']),
  })
  .strict();
const playInput = z
  .object({
    targetId,
    modId: fabricModId,
    jar: bytes,
    outputs: z.array(playOutputFile).max(PLAY_OUTPUTS_MAX),
    namespaces: z.array(playNamespace).min(1).max(64),
    items: z
      .array(
        z
          .object({
            id: z.string().min(3).max(256),
            count: z.number().int().min(1).max(99).optional(),
          })
          .strict(),
      )
      .max(PLAY_ITEMS_MAX),
    game: playGame.optional(),
  })
  .strict();
const reloadInput = z
  .object({
    targetId,
    modId: fabricModId,
    outputs: z.array(playOutputFile).max(PLAY_OUTPUTS_MAX),
    jar: bytes.optional(),
    names: z.record(z.string().max(512), z.string().max(256)).optional(),
  })
  .strict();
const playFailure = z
  .object({
    ok: z.literal(false),
    code: z.enum([
      'no-prism',
      'instance-not-managed',
      'game-not-closing',
      'jar-locked',
      'not-played',
      'not-in-world',
      'game-running',
      'script-error',
      'busy',
      'bad-input',
      'failed',
    ]),
    message: z.string().max(4096),
  })
  .strict();
const playRestartReason = z
  .object({
    reason: z.string().max(64),
    path: z.string().max(1024),
    from: z.string().max(1024).optional(),
    kind: z.string().max(64).optional(),
    elementId: z.string().max(512).optional(),
    text: z.string().max(1024),
  })
  .strict();
const playResult = z.union([
  z
    .object({
      ok: z.literal(true),
      instanceName: z.string().min(1).max(255),
      instanceCreated: z.boolean(),
      gameDir: absolutePath,
      world: worldDir,
      restarted: z.boolean(),
      launched: z.boolean(),
      note: z.string().max(1024).nullable(),
      fabricApi: z.enum(['installed', 'present', 'user-copy']),
      itemsLeftOut: z.number().int().nonnegative(),
      seq: z.number().int().positive(),
    })
    .strict(),
  playFailure,
]);
const reloadResult = z.union([
  z
    .object({
      ok: z.literal(true),
      action: z.enum(['reload', 'reopen', 'none']),
      seq: z.number().int().positive().nullable(),
      changes: z.number().int().nonnegative(),
      assets: z.boolean(),
      counts: z
        .object({
          data: z.number().int().nonnegative(),
          scripts: z.number().int().nonnegative(),
          events: z.number().int().nonnegative(),
          assets: z.number().int().nonnegative(),
          worldData: z.number().int().nonnegative(),
          removed: z.number().int().nonnegative(),
        })
        .strict(),
      restart: z.array(playRestartReason),
      message: z.string().max(1024),
    })
    .strict(),
  playFailure,
]);
/** `PlayStatus` as a schema. */
export const playStatusSchema = z
  .object({
    targetId,
    mcVersion: shortVersion,
    instanceName: z.string().min(1).max(255),
    instance: z.enum(['ready', 'missing', 'no-prism']),
    gameDir: absolutePath.nullable(),
    state: z.enum([
      'no-prism',
      'not-running',
      'starting',
      'test-world',
      'game-world',
      'other-world',
    ]),
    testWorld: worldDir.nullable(),
    world: worldDir.nullable(),
    seed: z
      .string()
      .regex(/^-?\d{1,20}$/)
      .nullable(),
    handled: z
      .object({
        seq: z.number().int().positive(),
        ok: z.boolean(),
        message: z.string().optional(),
      })
      .strict()
      .nullable(),
    canReload: z.boolean(),
    restartNeeded: z.array(playRestartReason),
    label: z.string().max(128),
    busy: z.enum(['play', 'reload', 'restart']).nullable(),
    progress: z.string().max(256).nullable(),
  })
  .strict();

// ---- Export as a map and builds from the game (ADR 0116 D2, D3). ----

/** The most worlds one `maps:listWorlds` source carries (mirrors the service's cap). */
export const MAP_WORLDS_MAX = 500;
/** The most structure saves `maps:listStructureSaves` returns (500 per world, 64 worlds). */
export const MAP_STRUCTURE_SAVES_MAX = 32_000;
/** The most jars a map `.mrpack` carries. */
export const MAP_JARS_MAX = 16;
/** The largest `.mrpack` index text. */
export const MAP_INDEX_MAX = 1024 * 1024;

const mapSourceId = z.string().min(1).max(300);
/** A map's world folder name (as `isMapFolderName` in `@msm/interop`). */
const mapName = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9 ._()'!,&-]+$/)
  .refine((value) => !/^[ .]|[ .]$/.test(value), { message: 'Not a map name' });
/** A structure save id: `<ns>:<path>` (as `isStructureSaveId` in `@msm/interop`). */
const structureSaveId = z
  .string()
  .max(1200)
  .regex(/^[a-z0-9_.-]{1,64}:[a-z0-9_.-]{1,128}(?:\/[a-z0-9_.-]{1,128}){0,8}$/)
  .refine((value) => !value.split(/[:/]/).some((part) => /^\.+$/.test(part)), {
    message: 'Not a structure name',
  });
const mapJarName = z
  .string()
  .max(255)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._+-]*\.jar$/);
const mapWorldSource = z
  .object({
    id: mapSourceId,
    name: z.string().max(1024),
    managed: z.boolean(),
    worlds: z.array(worldInfo).max(MAP_WORLDS_MAX),
  })
  .strict();
const mapExportRequest = z
  .object({
    targetId,
    sourceId: mapSourceId,
    worldDir,
    keepPlayerData: z.boolean(),
    mapName,
    dataPack: z.object({ fileName: packFileName, data: bytes }).strict().optional(),
    resourcePack: bytes.optional(),
    mrpack: z
      .object({
        index: z.string().min(2).max(MAP_INDEX_MAX),
        jars: z
          .array(z.object({ fileName: mapJarName, data: bytes }).strict())
          .min(1)
          .max(MAP_JARS_MAX),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (value) => value.mrpack === undefined || (value.dataPack ?? value.resourcePack) === undefined,
    {
      message: 'A .mrpack map carries no separate packs',
    },
  );
const mapExportResult = z
  .object({
    path: absolutePath,
    kind: z.enum(['world-zip', 'mrpack']),
    entries: z.number().int().min(0),
    leftOut: z
      .array(
        z
          .object({
            path: z.string().min(1).max(4096),
            reason: z.enum(['lock', 'dev-pack', 'player-data', 'replaced']),
          })
          .strict(),
      )
      .max(10_000),
  })
  .strict();
const structureSaveInfo = z
  .object({
    world: worldDir,
    id: structureSaveId,
    size: z.number().int().min(0),
    lastModified: z.string().max(64),
  })
  .strict();

// ---- Instances for anything and the local server (ADR 0133). ----

/** The most content jars one instance or server call carries. */
export const INSTANCE_JARS_MAX = 64;
/** The most managed instances and servers `instances:list` returns. */
export const MANAGED_THINGS_MAX = 2000;
/** The most log lines `localServer:log` returns (the service keeps at most this many). */
export const LOCAL_SERVER_LOG_MAX = 2000;
/** The longest log line kept (longer lines are cut). */
export const LOCAL_SERVER_LINE_MAX = 2000;

const managedKind = z.enum(['test', 'plain', 'pack', 'map', 'server']);
const loaderKind = z.enum(['none', 'fabric', 'quilt', 'neoforge', 'forge']);
/** A modpack's or map's name as an instance owner (as `isSafeOwner` in `@msm/interop`). */
const ownerName = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.trim() !== '' && !value.includes('\0'), { message: 'Not a name' });
const serverAddress = z
  .object({
    host: z
      .string()
      .min(1)
      .max(253)
      .regex(/^[A-Za-z0-9.-]+$/),
    port: z.number().int().min(1).max(65535),
  })
  .strict();
const instanceAction = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('test'), join: serverAddress.optional() }).strict(),
  z.object({ kind: z.literal('game'), join: serverAddress.optional() }).strict(),
  z.object({ kind: z.literal('plain') }).strict(),
  z
    .object({
      kind: z.literal('modpack'),
      name: ownerName,
      modIds: z.array(fabricModId).min(1).max(MODPACK_IPC_MAX),
    })
    .strict(),
  z.object({ kind: z.literal('map'), name: ownerName }).strict(),
  z.object({ kind: z.literal('server') }).strict(),
]);
const instanceProject = z
  .object({
    namespace: playNamespace,
    modId: fabricModId.nullable(),
    playsWithoutMods: z.boolean(),
  })
  .strict();
const instanceJars = z
  .array(z.object({ modId: fabricModId, data: bytes }).strict())
  .max(INSTANCE_JARS_MAX);
const instancePlanRequest = z
  .object({ targetId, action: instanceAction, project: instanceProject })
  .strict();
const instanceEnsureRequest = z
  .object({
    targetId,
    action: instanceAction,
    project: instanceProject,
    jars: instanceJars,
    remember: z.boolean().optional(),
  })
  .strict();
const instanceFailure = z
  .object({
    ok: z.literal(false),
    code: z.enum([
      'not-yet',
      'no-launcher',
      'needs-mod',
      'no-fabric',
      'bad-input',
      'busy',
      'not-found',
      'not-managed',
      'no-free-name',
      'running',
      'not-running',
      'eula-needed',
      'no-java',
      'port-taken',
      'download-failed',
      'launcher-changed',
      'failed',
    ]),
    message: z.string().max(4096),
  })
  .strict();
const instanceRecipeView = z
  .object({
    purpose: z.enum(['test', 'game', 'plain', 'modpack', 'map', 'server']),
    owner: z.string().min(1).max(256),
    mcVersion: shortVersion,
    channel: z.enum(['release', 'snapshot']),
    java: z.number().int().positive(),
    loader: z.object({ kind: loaderKind, version: shortVersion.nullable() }).strict(),
    place: z
      .object({ kind: z.enum(['instance', 'server']), name: z.string().min(1).max(255) })
      .strict(),
    mods: z
      .array(
        z
          .object({
            role: z.enum(['content', 'fabric-api', 'extra']),
            fileName: z.string().min(1).max(255),
          })
          .strict(),
      )
      .max(MODPACK_IPC_MAX * 2),
    resourcePacks: z.array(z.string().min(1).max(255)).max(64),
    world: z.object({ folder: worldDir, copied: z.boolean() }).strict().nullable(),
    join: serverAddress.nullable(),
  })
  .strict();
/** An id of `instances:list`: `instance:` or `server:` and the folder. */
const managedId = z
  .string()
  .max(4200)
  .regex(/^(?:instance|server):.+$/s);
const instanceDone = z.union([z.object({ ok: z.literal(true) }).strict(), instanceFailure]);
const instanceLaunchResult = z.union([
  z
    .object({
      ok: z.literal(true),
      name: z.string().min(1).max(255),
      launched: z.boolean(),
      note: z.string().max(1024).nullable(),
    })
    .strict(),
  instanceFailure,
]);
const localServerState = z.enum([
  'stopped',
  'preparing',
  'starting',
  'downloading',
  'running',
  'stopping',
  'eula-needed',
  'port-taken',
  'crashed',
]);
/** `LocalServerStatus` as a schema. */
export const localServerStatusSchema = z
  .object({
    state: localServerState,
    label: z.string().max(128),
    server: z
      .object({
        folder: worldDir,
        name: z.string().min(1).max(255),
        targetId,
        mcVersion: shortVersion,
        owner: z.string().min(1).max(256),
        port: z.number().int().min(1).max(65535),
        eulaAccepted: z.boolean(),
        path: absolutePath,
      })
      .strict()
      .nullable(),
    java: z
      .union([
        z
          .object({ ok: z.literal(true), version: shortVersion.nullable(), path: absolutePath })
          .strict(),
        z.object({ ok: z.literal(false), message: z.string().max(4096) }).strict(),
      ])
      .nullable(),
    progress: z.string().max(256).nullable(),
    message: z.string().max(4096).nullable(),
    addresses: z.array(z.string().min(1).max(64)).max(32),
    logSeq: z.number().int().nonnegative(),
  })
  .strict();
const localServerResult = z.union([
  z.object({ ok: z.literal(true), status: localServerStatusSchema }).strict(),
  instanceFailure,
]);
const localServerRequest = z
  .object({ targetId, project: instanceProject, jars: instanceJars })
  .strict();

// ---- Try it's worlds (ADR 0087), read-only. ----

/** The most worlds `tryit:listWorlds` returns (mirrors the service's cap). */
export const TRYIT_WORLDS_MAX = 2000;
/** The largest world icon returned, in bytes (mirrors the service's cap). */
export const TRYIT_ICON_MAX_BYTES = 256 * 1024;
/** The Try it area's cell count: 48 x 32 x 48. */
export const TRYIT_AREA_CELLS = 48 * 32 * 48;
/** Block X and Z a typed centre may name (the world border's reach). */
export const TRYIT_COORDINATE_MAX = 30_000_000;

/** A Try it world id: `<game folder id>/<world folder>` (the service checks it again). */
const tryItWorldId = z
  .string()
  .min(3)
  .max(600)
  .regex(/^[A-Za-z0-9_.:-]+\/[^/\\\0:]+$/)
  .refine((value) => !value.endsWith('/.') && !value.endsWith('/..'), {
    message: 'Not a world id',
  });
const tryItCoordinate = z.number().int().min(-TRYIT_COORDINATE_MAX).max(TRYIT_COORDINATE_MAX);
const tryItWorldInfo = z
  .object({
    id: tryItWorldId,
    name: z.string().max(1024),
    folder: worldDir,
    gameFolder: z
      .object({ id: z.string().min(1).max(300), name: z.string().max(1024), selected: z.boolean() })
      .strict(),
    lastPlayed: z.string().max(64).nullable(),
    versionName: z.string().max(256).nullable(),
    dataVersion: z.number().int().nullable(),
    readable: z.boolean(),
    icon: bytes.refine((value) => value.length <= TRYIT_ICON_MAX_BYTES).nullable(),
    // A 64-bit seed in decimal (B574 WS17), or null.
    seed: z
      .string()
      .regex(/^-?[0-9]{1,19}$/)
      .nullable(),
  })
  .strict();
const tryItAreaRequest = z
  .object({
    worldId: tryItWorldId,
    centre: z.union([
      z.literal('spawn'),
      z.object({ x: tryItCoordinate, z: tryItCoordinate }).strict(),
    ]),
  })
  .strict();
const uint16Array = z.custom<Uint16Array>((value) => value instanceof Uint16Array, {
  message: 'Expected a Uint16Array',
});
const tryItWorldArea = z
  .object({
    format: z.literal(1),
    world: z.string().max(1024),
    dataVersion: z.number().int(),
    origin: z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int() }).strict(),
    size: z.object({ x: z.literal(48), y: z.literal(32), z: z.literal(48) }).strict(),
    palette: z.array(z.string().min(1).max(4096)).min(1).max(65_536),
    blocks: uint16Array.refine((value) => value.length === TRYIT_AREA_CELLS, {
      message: 'Wrong cell count',
    }),
    skipped: z
      .object({
        blockEntities: z.number().int().min(0),
        entities: z.number().int().min(0),
        missingChunks: z.number().int().min(0),
      })
      .strict(),
    warnings: z.array(z.string().max(4096)).max(1000),
  })
  .strict()
  .refine((area) => area.palette[0] === 'minecraft:air', { message: 'palette[0] must be air' });

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
  [InvokeChannels.projectDefaultParent]: { request: noRequest, response: z.string().max(4096) },
  [InvokeChannels.projectRecent]: {
    request: noRequest,
    response: z.array(recentProjectView).max(RECENT_PROJECTS_MAX),
  },
  [InvokeChannels.projectOpenRecent]: { request: recentRootRequest, response: rootResult },
  [InvokeChannels.projectRemoveRecent]: { request: recentRootRequest, response: voidResponse },
  [InvokeChannels.projectRecentSummary]: {
    request: recentRootRequest,
    response: z
      .object({
        things: z.number().int().min(0),
        picture: bytes.nullable(),
        pictureFrom: z.enum(['pack', 'texture']).nullable(),
      })
      .strict(),
  },
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
        ai: aiSettings.optional(),
        backups: worldBackupSettings.optional(),
        instances: instanceSettings.optional(),
        localServers: localServerSettings.optional(),
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
        ai: aiSettings.optional(),
        backups: worldBackupSettings.optional(),
        instances: instanceSettings.optional(),
        localServers: localServerSettings.optional(),
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
        cacheOutdated: z.boolean().optional(),
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
  [InvokeChannels.minecraftWorldgenFiles]: {
    request: z.object({ mcVersion }).strict(),
    response: vanillaWorldgenFiles.nullable(),
  },
  [InvokeChannels.minecraftDataFiles]: {
    request: z.object({ mcVersion, folders: z.array(dataFolderKey).min(1).max(64) }).strict(),
    response: vanillaDataFiles.nullable(),
  },
  [InvokeChannels.minecraftNames]: {
    request: z.object({ targetId: knownTargetId }).strict(),
    response: vanillaNames.nullable(),
  },
  [InvokeChannels.minecraftAssetObject]: {
    request: z.object({ mcVersion, key: assetKey }).strict(),
    response: assetObjectAnswer,
  },
  [InvokeChannels.minecraftStructureTemplates]: {
    request: z
      .object({
        mcVersion,
        ids: z.array(structureTemplateId).min(1).max(STRUCTURE_TEMPLATE_IDS_MAX),
      })
      .strict(),
    response: vanillaStructureTemplates.nullable(),
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
    response: z
      .object({ path: absolutePath, backup: worldBackupRef.nullable().optional() })
      .strict(),
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
  [InvokeChannels.exportsScanJavaProject]: {
    request: z.object({ title: z.string().max(256) }).strict(),
    response: z
      .object({
        folder: absolutePath,
        files: z
          .array(
            z
              .object({
                path: z.string().min(1).max(4096),
                text: z.string().max(JAVA_SCAN_MAX_FILE_CHARS),
              })
              .strict(),
          )
          .max(JAVA_SCAN_MAX_FILES),
        javaFiles: z.number().int().nonnegative(),
        truncated: z.boolean().optional(),
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
        removed: z.array(fileName).max(256),
        fabricApi: z.enum(['installed', 'present', 'user-copy']),
        fabricApiFile: fileName,
        launched: z.boolean(),
        note: z.string().max(1024).nullable(),
      })
      .strict(),
  },
  [InvokeChannels.testInMinecraftRunModpack]: {
    request: z
      .object({
        targetId,
        jars: z.array(z.object({ modId: fabricModId, data: bytes }).strict()).max(MODPACK_IPC_MAX),
        mods: z.array(modpackMod).max(MODPACK_IPC_MAX),
      })
      .strict(),
    response: z
      .object({
        modsDir: absolutePath,
        installed: z.array(fileName).max(MODPACK_IPC_MAX * 2),
        removed: z.array(fileName).max(4096),
        fabricApi: z.enum(['installed', 'present', 'user-copy']),
        fabricApiFile: fileName,
        launched: z.boolean(),
        note: z.string().max(1024).nullable(),
      })
      .strict(),
  },
  [InvokeChannels.modpacksList]: {
    request: noRequest,
    response: z
      .array(
        z.object({ root: absolutePath, name: modpackText.nullable(), found: z.boolean() }).strict(),
      )
      .max(256),
  },
  [InvokeChannels.modpacksCreate]: {
    request: z.object({ name: z.string().max(256), targetId }).strict(),
    response: modpackView.nullable(),
  },
  [InvokeChannels.modpacksAddExisting]: { request: noRequest, response: modpackView.nullable() },
  [InvokeChannels.modpacksForget]: {
    request: z.object({ root: absolutePath }).strict(),
    response: z.undefined(),
  },
  [InvokeChannels.modpacksRead]: {
    request: z.object({ root: absolutePath }).strict(),
    response: modpackView,
  },
  [InvokeChannels.modpacksWrite]: {
    request: z.object({ root: absolutePath, modpack: modpackShape }).strict(),
    response: modpackView,
  },
  [InvokeChannels.modpacksAddProject]: {
    request: z.object({ root: absolutePath, projectRoot: absolutePath.nullable() }).strict(),
    response: modpackView.nullable(),
  },
  [InvokeChannels.modpacksReadProject]: {
    request: z.object({ root: absolutePath, path: z.string().min(1).max(1024) }).strict(),
    response: z
      .array(z.object({ path: z.string().min(1).max(1024), data: bytes }).strict())
      .max(20_000),
  },
  [InvokeChannels.modpacksLookupMod]: {
    request: z
      .object({ input: z.string().min(1).max(512), gameVersion: z.string().min(1).max(64) })
      .strict(),
    response: z
      .object({
        file: modpackMod,
        versionNumber: z.string().max(256),
        requiredProjects: z.array(z.string().max(64)).max(256),
      })
      .strict(),
  },
  [InvokeChannels.modpacksCheckMods]: {
    request: z
      .object({
        sha1s: z.array(z.string().regex(/^[0-9a-f]{40}$/)).max(MODPACK_IPC_MAX),
        gameVersion: z.string().min(1).max(64),
      })
      .strict(),
    response: z
      .array(
        z
          .object({
            from: z.string().regex(/^[0-9a-f]{40}$/),
            file: modpackMod.omit({ title: true }),
            versionNumber: z.string().max(256),
          })
          .strict(),
      )
      .max(MODPACK_IPC_MAX),
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
  [InvokeChannels.appLaunchNotice]: {
    request: noRequest,
    response: z.enum(['welcome', 'whats-new']).nullable(),
  },
  [InvokeChannels.appRecoveryNotice]: {
    request: noRequest,
    response: z
      .object({
        plugins: z.array(z.string().max(80)).max(RECOVERY_NOTICE_PLUGINS_MAX),
        pluginsOff: z.boolean(),
      })
      .strict()
      .nullable(),
  },
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
  [InvokeChannels.aiKeyStatus]: {
    request: noRequest,
    response: z
      .object({
        set: z.boolean(),
        tail: z.string().max(4).nullable(),
        encryptionAvailable: z.boolean(),
      })
      .strict(),
  },
  [InvokeChannels.aiSetKey]: {
    request: z.object({ key: z.string().trim().min(1).max(AI_KEY_MAX) }).strict(),
    response: voidResponse,
  },
  [InvokeChannels.aiClearKey]: { request: noRequest, response: voidResponse },
  [InvokeChannels.aiTestKey]: { request: noRequest, response: aiKeyTestResult },
  [InvokeChannels.aiStart]: { request: aiStartRequest, response: voidResponse },
  [InvokeChannels.aiCancel]: {
    request: z.object({ runId: aiId }).strict(),
    response: voidResponse,
  },
  [InvokeChannels.aiToolResult]: {
    request: z
      .object({
        runId: aiId,
        requestId: aiId,
        content: z.string().max(AI_TOOL_RESULT_MAX),
        isError: z.boolean(),
      })
      .strict(),
    response: voidResponse,
  },
  [InvokeChannels.aiNewConversation]: {
    request: z.object({ conversationId: aiId }).strict(),
    response: voidResponse,
  },
  [InvokeChannels.aiDropConversation]: {
    request: z.object({ conversationId: aiId }).strict(),
    response: voidResponse,
  },
  [InvokeChannels.aiPicturesStatus]: { request: noRequest, response: aiPicturesStatus },
  [InvokeChannels.aiPicturesSetService]: {
    request: z.object({ service: aiPictureService }).strict(),
    response: voidResponse,
  },
  [InvokeChannels.aiPicturesSetKey]: {
    request: z
      .object({
        service: aiPictureService,
        key: z.string().trim().min(1).max(AI_PICTURES_KEY_MAX),
      })
      .strict(),
    response: voidResponse,
  },
  [InvokeChannels.aiPicturesClearKey]: {
    request: z.object({ service: aiPictureService }).strict(),
    response: voidResponse,
  },
  [InvokeChannels.aiPicturesTestKey]: {
    request: z.object({ service: aiPictureService }).strict(),
    response: aiPictureKeyTest,
  },
  [InvokeChannels.aiPicturesGenerate]: {
    request: aiPictureRequest,
    response: aiPictureResult,
  },
  [InvokeChannels.aiPicturesCancel]: {
    request: z.object({ requestId: aiId }).strict(),
    response: voidResponse,
  },
  [InvokeChannels.aiPicturesCost]: {
    request: aiPictureCostRequest,
    response: aiPictureCost,
  },
  [InvokeChannels.playStatus]: {
    request: z.object({ targetId }).strict(),
    response: playStatusSchema,
  },
  [InvokeChannels.playPlay]: { request: playInput, response: playResult },
  [InvokeChannels.playReload]: { request: reloadInput, response: reloadResult },
  [InvokeChannels.playRestart]: { request: playInput, response: playResult },
  [InvokeChannels.playNewWorld]: {
    request: z
      .object({ targetId, namespace: playNamespace, kind: z.enum(['test', 'game']).optional() })
      .strict(),
    response: z.union([
      z.object({ ok: z.literal(true), renamedTo: worldDir.nullable() }).strict(),
      playFailure,
    ]),
  },
  [InvokeChannels.tryItListWorlds]: {
    request: noRequest,
    response: z.array(tryItWorldInfo).max(TRYIT_WORLDS_MAX),
  },
  [InvokeChannels.tryItReadArea]: { request: tryItAreaRequest, response: tryItWorldArea },
  [InvokeChannels.worldBackupsList]: { request: noRequest, response: worldBackupList },
  [InvokeChannels.worldBackupsRestore]: {
    request: z
      .object({ location: backupSegment, worldDir: backupSegment, fileName: backupSegment })
      .strict(),
    response: z.object({ dir: backupSegment, path: absolutePath }).strict(),
  },
  [InvokeChannels.worldBackupsOpenFolder]: { request: noRequest, response: voidResponse },
  [InvokeChannels.mapsListWorlds]: {
    request: z.object({ targetId }).strict(),
    response: z.array(mapWorldSource).max(64),
  },
  [InvokeChannels.mapsExport]: {
    request: mapExportRequest,
    response: mapExportResult.nullable(),
  },
  [InvokeChannels.mapsListStructureSaves]: {
    request: z.object({ targetId }).strict(),
    response: z.array(structureSaveInfo).max(MAP_STRUCTURE_SAVES_MAX),
  },
  [InvokeChannels.mapsReadStructureSave]: {
    request: z.object({ targetId, world: worldDir, id: structureSaveId }).strict(),
    response: bytes,
  },
  [InvokeChannels.guideIndex]: { request: noRequest, response: guideIndex },
  [InvokeChannels.guidePage]: {
    request: z.object({ page: guidePageName }).strict(),
    response: z
      .object({ page: guidePageName, markdown: z.string().max(GUIDE_PAGE_MAX_CHARS) })
      .strict(),
  },
  [InvokeChannels.instancesPlan]: {
    request: instancePlanRequest,
    response: z.union([
      z
        .object({
          ok: z.literal(true),
          recipe: instanceRecipeView,
          kind: managedKind,
          title: z.string().min(1).max(256),
          sentences: z.array(z.string().max(1024)).max(16),
          launcher: z.literal('prism').nullable(),
          existing: z
            .object({ id: managedId, name: z.string().min(1).max(255) })
            .strict()
            .nullable(),
          ask: z.boolean(),
        })
        .strict(),
      instanceFailure,
    ]),
  },
  [InvokeChannels.instancesEnsure]: {
    request: instanceEnsureRequest,
    response: z.union([
      z
        .object({
          ok: z.literal(true),
          id: managedId,
          name: z.string().min(1).max(255),
          created: z.boolean(),
          updated: z.boolean(),
          gameDir: absolutePath,
          mods: z.array(z.string().min(1).max(255)).max(MODPACK_IPC_MAX * 2),
        })
        .strict(),
      instanceFailure,
    ]),
  },
  [InvokeChannels.instancesList]: {
    request: noRequest,
    response: z
      .array(
        z
          .object({
            id: managedId,
            kind: managedKind,
            name: z.string().min(1).max(255),
            owner: z.string().min(1).max(256).nullable(),
            mcVersion: shortVersion,
            loader: z.object({ kind: loaderKind, version: shortVersion.nullable() }).strict(),
            launcher: z.enum(['prism', 'multimc', 'polymc']).nullable(),
            path: absolutePath,
            eulaAccepted: z.boolean().nullable(),
            running: z.boolean(),
          })
          .strict(),
      )
      .max(MANAGED_THINGS_MAX),
  },
  [InvokeChannels.instancesRemove]: {
    request: z.object({ id: managedId }).strict(),
    response: instanceDone,
  },
  [InvokeChannels.instancesShowInFolder]: {
    request: z.object({ id: managedId }).strict(),
    response: instanceDone,
  },
  [InvokeChannels.instancesLaunch]: {
    request: instancePlanRequest,
    response: instanceLaunchResult,
  },
  [InvokeChannels.instancesPlayPlain]: {
    request: z
      .object({
        targetId,
        project: instanceProject,
        world: worldDir.optional(),
        dataPack: z.object({ fileName: packFileName, data: bytes }).strict().optional(),
        resourcePack: bytes.optional(),
      })
      .strict(),
    response: instanceLaunchResult,
  },
  [InvokeChannels.instancesOpenMap]: {
    request: z
      .object({
        targetId,
        project: instanceProject,
        mapName: ownerName,
        sourceId: mapSourceId,
        worldDir,
        jars: instanceJars,
        keepPlayerData: z.boolean().optional(),
        dataPack: z.object({ fileName: packFileName, data: bytes }).strict().optional(),
        resourcePack: bytes.optional(),
      })
      .strict(),
    response: instanceLaunchResult,
  },
  [InvokeChannels.instancesCurseForgeProfile]: {
    request: z.object({ targetId, project: instanceProject, jars: instanceJars }).strict(),
    response: z.union([
      z.object({ ok: z.literal(true), path: absolutePath.nullable() }).strict(),
      instanceFailure,
    ]),
  },
  [InvokeChannels.localServerStatus]: { request: noRequest, response: localServerStatusSchema },
  [InvokeChannels.localServerPrepare]: { request: localServerRequest, response: localServerResult },
  [InvokeChannels.localServerAcceptEula]: {
    request: z
      .object({
        folder: worldDir,
        acceptance: z
          .object({
            accepted: z.literal(true),
            at: z.iso.datetime({ offset: true }),
          })
          .strict(),
      })
      .strict(),
    response: localServerResult,
  },
  [InvokeChannels.localServerStart]: { request: localServerRequest, response: localServerResult },
  [InvokeChannels.localServerStop]: { request: noRequest, response: localServerResult },
  [InvokeChannels.localServerRestart]: { request: localServerRequest, response: localServerResult },
  [InvokeChannels.localServerLog]: {
    request: z.object({ since: z.number().int().nonnegative() }).strict(),
    response: z
      .object({
        from: z.number().int().nonnegative(),
        next: z.number().int().nonnegative(),
        lines: z.array(z.string().max(LOCAL_SERVER_LINE_MAX)).max(LOCAL_SERVER_LOG_MAX),
      })
      .strict(),
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
