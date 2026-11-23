/**
 * The extracted-asset cache under `<msmHome>/cache/assets/<version>/` (ADR 0011). Files keep
 * their jar paths below the version folder; `cache.json` is written last and marks the
 * cache valid.
 */

import { isProjectRelativePath } from '@msm/plugin-api';
import { type ExtractedFile, isDataFolder, VANILLA_DATA_PREFIX } from './extract';
import { type InstallFileSystem, joinInstallPath } from './fs';

/** The name of the info file that marks a complete cache. */
export const ASSET_CACHE_INFO_FILE = 'cache.json';

/** Contents of `cache.json`. */
export interface AssetCacheInfo {
  /** The installed version id the jar came from. */
  version: string;
  /** Lower-case hex SHA-1 of the jar, so a replaced jar invalidates the cache. */
  jarSha1: string;
  /**
   * The absolute path of the jar the files came from (schema 4). When a cache of an older
   * schema or folder list is found and this jar is still there, the host extracts again by
   * itself (ADR 0119 D4).
   */
  jarPath: string;
  /**
   * The `data/minecraft/` folders kept beside the preview assets (schema 4): every folder the
   * host asked for at extraction time, sorted (the target's `worldgen.terrainPreview.dataFolders`
   * and, from schema 5, the live views' folders). A host whose list differs needs the cache
   * extracted again.
   */
  dataFolders: string[];
  fileCount: number;
  /**
   * The total size of the cached files in bytes, `cache.json` left out (schema 6): the cache
   * size the host reports.
   */
  byteCount: number;
  /** ISO 8601 timestamp supplied by the caller. */
  extractedAt: string;
  /**
   * Cache layout version. 2 added `.png.mcmeta` sidecars (B43), 3 the placed features, 4 the
   * worldgen data folders with `jarPath` and `dataFolders` (B577), 5 the live views' data
   * folders: loot tables, advancements, predicates, enchantments, dialogs and the other tags
   * (B603, ADR 0120 D11), 6 the looks and sounds views' textures, asset JSON, shaders and data
   * folders with `byteCount` (B621, ADR 0121 D3); a cache with any other value is invalid, so it
   * is extracted again.
   */
  schemaVersion: typeof ASSET_CACHE_SCHEMA_VERSION;
}

/** The current {@link AssetCacheInfo.schemaVersion}. */
export const ASSET_CACHE_SCHEMA_VERSION = 6;

/**
 * What an older or otherwise outdated `cache.json` still tells: the version and jar it came
 * from (`jarPath` only from schema 4 on). Read by {@link readOutdatedAssetCacheInfo}.
 */
export interface OutdatedAssetCacheInfo {
  version: string;
  jarSha1: string;
  /** `null` before schema 4, which did not record it. */
  jarPath: string | null;
  schemaVersion: number;
}

/** `<msmHome>/cache/assets/<version>`. */
export function assetCacheDir(msmHome: string, version: string): string {
  if (!isProjectRelativePath(version) || version.includes('/')) {
    throw new Error(`Version id ${JSON.stringify(version)} is not a single path segment.`);
  }
  return joinInstallPath(msmHome, 'cache', 'assets', version);
}

/**
 * Reads `cache.json` from a cache directory. Returns `null` when it is missing, is not
 * valid JSON or does not have the expected shape; the caller then re-extracts.
 */
export async function readAssetCacheInfo(
  fs: InstallFileSystem,
  dir: string,
): Promise<AssetCacheInfo | null> {
  const infoPath = joinInstallPath(dir, ASSET_CACHE_INFO_FILE);
  if (!(await fs.exists(infoPath))) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(await fs.readFile(infoPath)));
  } catch {
    return null;
  }
  return isAssetCacheInfo(parsed) ? parsed : null;
}

/**
 * Reads a `cache.json` that {@link readAssetCacheInfo} refuses because its schema is older
 * than {@link ASSET_CACHE_SCHEMA_VERSION}, so the host can tell a user who extracted before
 * (and may be extracted again silently) from one who never did. Returns `null` when the file
 * is missing, unreadable, current or from a newer schema.
 */
export async function readOutdatedAssetCacheInfo(
  fs: InstallFileSystem,
  dir: string,
): Promise<OutdatedAssetCacheInfo | null> {
  const infoPath = joinInstallPath(dir, ASSET_CACHE_INFO_FILE);
  if (!(await fs.exists(infoPath))) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(await fs.readFile(infoPath)));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const schema = record.schemaVersion;
  if (
    typeof record.version !== 'string' ||
    typeof record.jarSha1 !== 'string' ||
    typeof schema !== 'number' ||
    !Number.isInteger(schema) ||
    schema < 1 ||
    schema >= ASSET_CACHE_SCHEMA_VERSION
  ) {
    return null;
  }
  return {
    version: record.version,
    jarSha1: record.jarSha1,
    jarPath: typeof record.jarPath === 'string' ? record.jarPath : null,
    schemaVersion: schema,
  };
}

/** Whether two folder lists name the same folders (order and duplicates ignored). */
export function sameDataFolders(a: readonly string[], b: readonly string[]): boolean {
  const left = [...new Set(a)].sort();
  const right = [...new Set(b)].sort();
  return left.length === right.length && left.every((folder, index) => folder === right[index]);
}

/** A data folder's files: id (`minecraft:<path below the folder>`) to parsed JSON. */
export type CachedDataFolder = Record<string, unknown>;

/** What {@link readCachedDataFiles} found. */
export interface CachedDataFiles {
  /** Folder key (as given) to id to JSON; a folder without files is an empty object. */
  folders: Record<string, CachedDataFolder>;
  fileCount: number;
  /** Jar paths that were not valid JSON, skipped. */
  unreadable: string[];
}

/**
 * Reads every cached `.json` file below `data/minecraft/<folder>/` for each folder, in
 * subfolders too, as folder key to id to JSON (the shape of `@msm/terrain`'s `WorldgenFileMap`):
 * the bulk read by folder of the world generation preview and the live views. A file below a
 * folder that is itself in the list (a longer folder key) belongs to that folder only. Ids are
 * `minecraft:` plus the path below the folder without `.json`. The files of one folder are read
 * side by side and keyed in path order, so the answer does not depend on read timing.
 * `options.owners` names further folders of the cache (its whole recorded list, say) whose files
 * belong to them alone, so a read of some folders keeps the same ids as a read of all.
 *
 * @throws Error When a folder is not a plain relative folder name.
 */
export async function readCachedDataFiles(
  fs: InstallFileSystem,
  dir: string,
  dataFolders: readonly string[],
  options: { owners?: readonly string[] } = {},
): Promise<CachedDataFiles> {
  for (const folder of [...dataFolders, ...(options.owners ?? [])]) {
    if (!isDataFolder(folder)) {
      throw new Error(`${JSON.stringify(folder)} is not a data folder name.`);
    }
  }
  const owned = new Set([...dataFolders, ...(options.owners ?? [])]);
  const folders: Record<string, CachedDataFolder> = {};
  const unreadable: string[] = [];
  let fileCount = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const sorted = [...new Set(dataFolders)].sort();
  for (const folder of sorted) {
    const files: CachedDataFolder = {};
    folders[folder] = files;
    const root = joinInstallPath(dir, ...`${VANILLA_DATA_PREFIX}${folder}`.split('/'));
    if (!(await fs.exists(root))) continue;
    const walk = async (absDir: string, relative: string): Promise<void> => {
      const entries = [...(await fs.readDir(absDir))].sort((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
      );
      // Every JSON file of this folder at once (the cache holds a few thousand small files).
      const reads = entries.map(async (entry) => {
        if (entry.kind !== 'file' || !entry.name.endsWith('.json')) return null;
        try {
          return {
            ok: true as const,
            data: await fs.readFile(joinInstallPath(absDir, entry.name)),
          };
        } catch {
          return { ok: false as const };
        }
      });
      const read = await Promise.all(reads);
      for (const [index, entry] of entries.entries()) {
        const path = relative === '' ? entry.name : `${relative}/${entry.name}`;
        if (entry.kind === 'directory') {
          if (owned.has(`${folder}/${path}`)) continue;
          await walk(joinInstallPath(absDir, entry.name), path);
          continue;
        }
        const bytes = read[index];
        if (bytes === null || bytes === undefined) continue;
        const jarPath = `${VANILLA_DATA_PREFIX}${folder}/${path}`;
        try {
          if (!bytes.ok) throw new Error('unreadable');
          files[`minecraft:${path.slice(0, -'.json'.length)}`] = JSON.parse(
            decoder.decode(bytes.data),
          ) as unknown;
          fileCount += 1;
        } catch {
          unreadable.push(jarPath);
        }
      }
    };
    await walk(root, '');
  }
  return { folders, fileCount, unreadable };
}

/**
 * Writes the extracted files below `dir`, then `cache.json` last. Any existing `cache.json`
 * is removed first, so an interrupted write leaves the cache invalid rather than partial.
 *
 * @throws Error When a file path is not a safe relative path; nothing is written then.
 */
export async function writeAssetCache(
  fs: InstallFileSystem,
  dir: string,
  files: readonly ExtractedFile[],
  info: Omit<AssetCacheInfo, 'byteCount' | 'fileCount' | 'schemaVersion'>,
): Promise<AssetCacheInfo> {
  for (const file of files) {
    if (!isProjectRelativePath(file.path) || file.path === ASSET_CACHE_INFO_FILE) {
      throw new Error(`Cannot cache ${JSON.stringify(file.path)}: not a safe relative path.`);
    }
  }
  await fs.mkdirp(dir);
  await fs.remove(joinInstallPath(dir, ASSET_CACHE_INFO_FILE));
  const created = new Set<string>();
  for (const file of files) {
    const slash = file.path.lastIndexOf('/');
    const parent = slash === -1 ? '' : file.path.slice(0, slash);
    if (parent !== '' && !created.has(parent)) {
      await fs.mkdirp(joinInstallPath(dir, ...parent.split('/')));
      created.add(parent);
    }
    await fs.writeFile(joinInstallPath(dir, ...file.path.split('/')), file.data);
  }
  const complete: AssetCacheInfo = {
    byteCount: files.reduce((sum, file) => sum + file.data.byteLength, 0),
    dataFolders: [...new Set(info.dataFolders)].sort(),
    extractedAt: info.extractedAt,
    fileCount: files.length,
    jarPath: info.jarPath,
    jarSha1: info.jarSha1,
    schemaVersion: ASSET_CACHE_SCHEMA_VERSION,
    version: info.version,
  };
  await fs.writeFile(
    joinInstallPath(dir, ASSET_CACHE_INFO_FILE),
    new TextEncoder().encode(`${JSON.stringify(complete, null, 2)}\n`),
  );
  return complete;
}

function isAssetCacheInfo(value: unknown): value is AssetCacheInfo {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.version === 'string' &&
    typeof record.jarSha1 === 'string' &&
    typeof record.jarPath === 'string' &&
    Array.isArray(record.dataFolders) &&
    record.dataFolders.every((folder) => typeof folder === 'string') &&
    typeof record.extractedAt === 'string' &&
    typeof record.fileCount === 'number' &&
    Number.isInteger(record.fileCount) &&
    record.fileCount >= 0 &&
    typeof record.byteCount === 'number' &&
    Number.isInteger(record.byteCount) &&
    record.byteCount >= 0 &&
    record.schemaVersion === ASSET_CACHE_SCHEMA_VERSION
  );
}
