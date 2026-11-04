/**
 * The extracted-asset cache under `<msmHome>/cache/assets/<version>/` (ADR 0011). Files keep
 * their jar paths below the version folder; `cache.json` is written last and marks the
 * cache valid.
 */

import { isProjectRelativePath } from '@msm/plugin-api';
import type { ExtractedFile } from './extract';
import { type InstallFileSystem, joinInstallPath } from './fs';

/** The name of the info file that marks a complete cache. */
export const ASSET_CACHE_INFO_FILE = 'cache.json';

/** Contents of `cache.json`. */
export interface AssetCacheInfo {
  /** The installed version id the jar came from. */
  version: string;
  /** Lower-case hex SHA-1 of the jar, so a replaced jar invalidates the cache. */
  jarSha1: string;
  fileCount: number;
  /** ISO 8601 timestamp supplied by the caller. */
  extractedAt: string;
  /**
   * Cache layout version. 2 added `.png.mcmeta` sidecars (B43); a cache with any other value
   * is invalid, so it is extracted again.
   */
  schemaVersion: typeof ASSET_CACHE_SCHEMA_VERSION;
}

/** The current {@link AssetCacheInfo.schemaVersion}. */
export const ASSET_CACHE_SCHEMA_VERSION = 2;

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
 * Writes the extracted files below `dir`, then `cache.json` last. Any existing `cache.json`
 * is removed first, so an interrupted write leaves the cache invalid rather than partial.
 *
 * @throws Error When a file path is not a safe relative path; nothing is written then.
 */
export async function writeAssetCache(
  fs: InstallFileSystem,
  dir: string,
  files: readonly ExtractedFile[],
  info: Omit<AssetCacheInfo, 'fileCount' | 'schemaVersion'>,
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
    extractedAt: info.extractedAt,
    fileCount: files.length,
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
    typeof record.extractedAt === 'string' &&
    typeof record.fileCount === 'number' &&
    Number.isInteger(record.fileCount) &&
    record.fileCount >= 0 &&
    record.schemaVersion === ASSET_CACHE_SCHEMA_VERSION
  );
}
