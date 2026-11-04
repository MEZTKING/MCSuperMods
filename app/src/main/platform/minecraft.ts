/**
 * Minecraft installation access for the main process (ADR 0011): status, client-jar asset
 * extraction into `<msmHome>/cache/assets/<version>/`, cached asset reads for the renderer,
 * installing resource packs into the game directory, listing worlds and installing data
 * packs into a world's `datapacks/` folder.
 *
 * @packageDocumentation
 */

import { realpath, stat } from 'node:fs/promises';
import { normalize, isAbsolute as pathIsAbsolute, relative } from 'node:path';
import {
  type AssetCacheInfo,
  assetCacheDir,
  extractPreviewAssets,
  type InstallFileSystem,
  joinInstallPath,
  listInstalledVersions,
  PREVIEW_ASSET_PATTERNS,
  pickVersionJar,
  readAssetCacheInfo,
  writeAssetCache,
} from '@msm/interop';
import { sha1Hex } from '@msm/interop/node';
import { assertProjectRelativePath, isProjectRelativePath } from '@msm/plugin-api';
import type { MinecraftProgress } from '../../shared/ipc-channels';
import type { GameLocationList, MinecraftStatus, WorldInfo } from '../../shared/platform';

/** Resource pack file names accepted by {@link MinecraftService.installResourcePack}. */
export const RESOURCE_PACK_FILE_NAME = /^[A-Za-z0-9._ -]+\.zip$/;

/** Pack zip names accepted by installs and combined exports (same rule as resource packs). */
export const PACK_FILE_NAME = RESOURCE_PACK_FILE_NAME;

/** Throws unless `fileName` is a valid pack zip name of at most 255 characters. */
export function assertPackFileName(fileName: string, what = 'pack'): void {
  if (!PACK_FILE_NAME.test(fileName) || fileName.length > 255) {
    throw new Error(`${JSON.stringify(fileName)} is not a valid ${what} file name.`);
  }
}

/** Whether `name` is one safe path segment: no separators, NUL or `:`, not `.` or `..`. */
export function isSafeSegment(name: string): boolean {
  return (
    name.length > 0 && name.length <= 255 && !/[/\\\0:]/.test(name) && name !== '.' && name !== '..'
  );
}

/** Whether `child` is `parent` or lies inside it (both absolute, already resolved). */
function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !pathIsAbsolute(rel);
}

/** The main-process Minecraft service. */
export interface MinecraftService {
  status(mcVersion: string): Promise<MinecraftStatus>;
  /** Discovered game locations and the selected one (ADR 0019). */
  listLocations(mcVersion: string): Promise<GameLocationList>;
  /**
   * Extracts preview assets for `mcVersion` unless the cache already holds this jar's
   * assets (same installed version and SHA-1). Concurrent calls for one version share work.
   */
  extract(
    mcVersion: string,
    onProgress?: (progress: MinecraftProgress) => void,
  ): Promise<AssetCacheInfo>;
  readAsset(mcVersion: string, path: string): Promise<Uint8Array | null>;
  listAssets(mcVersion: string, prefix: string): Promise<string[]>;
  installResourcePack(fileName: string, data: Uint8Array): Promise<{ path: string }>;
  /** Worlds in `<minecraftDir>/saves/` that contain `level.dat`, most recent first. */
  listWorlds(): Promise<WorldInfo[]>;
  /** Writes a data pack zip into `<minecraftDir>/saves/<worldDir>/datapacks/`. */
  installDataPack(worldDir: string, fileName: string, data: Uint8Array): Promise<{ path: string }>;
}

/** What the service needs from its host. */
export interface MinecraftServiceDeps {
  msmHome: string;
  fs: InstallFileSystem;
  /** The game directory in use, or `null` when none is set or detected. */
  minecraftDir(): Promise<string | null>;
  /** ISO 8601 timestamp for `extractedAt`. Defaults to the current time. */
  now?(): string;
  /**
   * The modification time of a file as ISO 8601, or `null` when it is not a file. Defaults to
   * `fs.stat` (the install file system has no stat).
   */
  modifiedAt?(absPath: string): Promise<string | null>;
  /** Resolves symlinks in an existing absolute path. Defaults to `fs.realpath`. */
  realpath?(absPath: string): Promise<string>;
}

async function defaultModifiedAt(absPath: string): Promise<string | null> {
  try {
    const info = await stat(absPath);
    return info.isFile() ? info.mtime.toISOString() : null;
  } catch {
    return null;
  }
}

/** Throws unless `path` is a jar path that previews may read. */
export function assertPreviewAssetPath(path: string): void {
  assertProjectRelativePath(path);
  if (!PREVIEW_ASSET_PATTERNS.some((pattern) => pattern.test(path))) {
    throw new Error(`${JSON.stringify(path)} is not a preview asset path.`);
  }
}

/** Throws unless `prefix` is empty or a project-relative path, optionally ending in `/`. */
function assertListPrefix(prefix: string): void {
  if (prefix === '') return;
  const trimmed = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  if (!isProjectRelativePath(trimmed)) {
    throw new Error(`${JSON.stringify(prefix)} is not a valid asset prefix.`);
  }
}

/** Creates the Minecraft service. */
export function createMinecraftService(deps: MinecraftServiceDeps): MinecraftService {
  const { fs, msmHome } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const modifiedAt = deps.modifiedAt ?? defaultModifiedAt;
  const resolveReal = deps.realpath ?? ((path: string) => realpath(path));
  const running = new Map<string, Promise<AssetCacheInfo>>();

  const requireDir = async (): Promise<string> => {
    const dir = await deps.minecraftDir();
    if (dir === null) {
      throw new Error('No Minecraft folder was found. Choose it in Settings.');
    }
    return dir;
  };

  const validCache = async (
    mcVersion: string,
  ): Promise<{ dir: string; info: AssetCacheInfo } | null> => {
    const dir = assetCacheDir(msmHome, mcVersion);
    const info = await readAssetCacheInfo(fs, dir);
    return info === null ? null : { dir, info };
  };

  const runExtract = async (
    mcVersion: string,
    onProgress: (progress: MinecraftProgress) => void,
  ): Promise<AssetCacheInfo> => {
    const report = (phase: MinecraftProgress['phase'], done: number, total: number): void =>
      onProgress({ mcVersion, phase, done, total });
    const minecraftDir = await requireDir();
    const chosen = pickVersionJar(await listInstalledVersions(fs, minecraftDir), mcVersion);
    if (chosen === undefined) {
      throw new Error(`Minecraft ${mcVersion} is not installed in ${normalize(minecraftDir)}.`);
    }
    const dir = assetCacheDir(msmHome, mcVersion);

    report('reading', 0, 1);
    const jar = await fs.readFile(chosen.jarPath);
    const jarSha1 = sha1Hex(jar);
    report('reading', 1, 1);

    const existing = await readAssetCacheInfo(fs, dir);
    if (existing !== null && existing.jarSha1 === jarSha1 && existing.version === chosen.id) {
      report('done', 1, 1);
      return existing;
    }

    report('extracting', 0, 1);
    const files = extractPreviewAssets(jar);
    report('extracting', 1, 1);

    // Start from an empty folder so files from an older jar do not linger.
    await fs.remove(dir);
    const total = files.length + 1;
    let written = 0;
    const counting: InstallFileSystem = {
      ...fs,
      async writeFile(absPath, data) {
        await fs.writeFile(absPath, data);
        written += 1;
        if (written === total || written % 64 === 0) report('writing', written, total);
      },
    };
    report('writing', 0, total);
    const info = await writeAssetCache(counting, dir, files, {
      version: chosen.id,
      jarSha1,
      extractedAt: now(),
    });
    report('done', 1, 1);
    return info;
  };

  const walk = async (dir: string, relative: string, out: string[]): Promise<void> => {
    for (const entry of await fs.readDir(dir)) {
      const path = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (entry.kind === 'directory') await walk(joinInstallPath(dir, entry.name), path, out);
      else out.push(path);
    }
  };

  return {
    async status(mcVersion) {
      const minecraftDir = await deps.minecraftDir();
      const installed = minecraftDir === null ? [] : await listInstalledVersions(fs, minecraftDir);
      const chosen = pickVersionJar(installed, mcVersion);
      const cache = await validCache(mcVersion);
      return {
        minecraftDir: minecraftDir === null ? null : normalize(minecraftDir),
        installed: installed.map((version) => ({ id: version.id })),
        chosen: chosen === undefined ? null : { id: chosen.id },
        cache: cache?.info ?? null,
      };
    },

    // Placeholder until location discovery is wired in main (brief B54).
    async listLocations() {
      throw new Error('Listing game locations is not available yet.');
    },

    extract(mcVersion, onProgress = () => {}) {
      const pending = running.get(mcVersion);
      if (pending !== undefined) return pending;
      const promise = runExtract(mcVersion, onProgress).finally(() => running.delete(mcVersion));
      running.set(mcVersion, promise);
      return promise;
    },

    async readAsset(mcVersion, path) {
      assertPreviewAssetPath(path);
      const cache = await validCache(mcVersion);
      if (cache === null) return null;
      const file = joinInstallPath(cache.dir, ...path.split('/'));
      if (!(await fs.exists(file))) return null;
      return fs.readFile(file);
    },

    async listAssets(mcVersion, prefix) {
      assertListPrefix(prefix);
      const cache = await validCache(mcVersion);
      if (cache === null) return [];
      const slash = prefix.lastIndexOf('/');
      const base = slash === -1 ? '' : prefix.slice(0, slash);
      const start = base === '' ? cache.dir : joinInstallPath(cache.dir, ...base.split('/'));
      if (!(await fs.exists(start))) return [];
      const out: string[] = [];
      try {
        await walk(start, base, out);
      } catch {
        return []; // The prefix names a file, or the cache changed while listing.
      }
      return out
        .filter((path) => path.startsWith(prefix) && path !== 'cache.json')
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    },

    async installResourcePack(fileName, data) {
      assertPackFileName(fileName, 'resource pack');
      const minecraftDir = await requireDir();
      const packs = joinInstallPath(minecraftDir, 'resourcepacks');
      await fs.mkdirp(packs);
      const path = joinInstallPath(packs, fileName);
      await fs.writeFile(path, data);
      return { path: normalize(path) };
    },

    async listWorlds() {
      const saves = joinInstallPath(await requireDir(), 'saves');
      if (!(await fs.exists(saves))) return [];
      const worlds: WorldInfo[] = [];
      for (const entry of await fs.readDir(saves)) {
        if (entry.kind !== 'directory' || !isSafeSegment(entry.name)) continue;
        const lastModified = await modifiedAt(joinInstallPath(saves, entry.name, 'level.dat'));
        if (lastModified === null) continue;
        worlds.push({ dir: entry.name, name: entry.name, lastModified });
      }
      // Most recently played first; ties by folder name.
      return worlds.sort((a, b) =>
        a.lastModified !== b.lastModified
          ? a.lastModified < b.lastModified
            ? 1
            : -1
          : a.dir < b.dir
            ? -1
            : a.dir > b.dir
              ? 1
              : 0,
      );
    },

    async installDataPack(worldDir, fileName, data) {
      if (!isSafeSegment(worldDir)) {
        throw new Error(`${JSON.stringify(worldDir)} is not a valid world folder name.`);
      }
      assertPackFileName(fileName, 'data pack');
      const saves = joinInstallPath(await requireDir(), 'saves');
      const world = joinInstallPath(saves, worldDir);
      if (!(await fs.exists(world))) {
        throw new Error(`The world ${JSON.stringify(worldDir)} does not exist.`);
      }
      // A symlinked world folder must still resolve inside `saves/`.
      const [realSaves, realWorld] = await Promise.all([resolveReal(saves), resolveReal(world)]);
      if (!isInside(realSaves, realWorld)) {
        throw new Error(`The world ${JSON.stringify(worldDir)} is outside the saves folder.`);
      }
      const datapacks = joinInstallPath(world, 'datapacks');
      await fs.mkdirp(datapacks);
      const path = joinInstallPath(datapacks, fileName);
      await fs.writeFile(path, data);
      return { path: normalize(path) };
    },
  };
}
