/**
 * Minecraft installation access for the main process (ADR 0011): status, client-jar asset
 * extraction into `<msmHome>/cache/assets/<version>/`, cached asset reads for the renderer,
 * and installing resource packs into the game directory.
 *
 * @packageDocumentation
 */

import { normalize } from 'node:path';
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
import type { MinecraftStatus } from '../../shared/platform';

/** Resource pack file names accepted by {@link MinecraftService.installResourcePack}. */
export const RESOURCE_PACK_FILE_NAME = /^[A-Za-z0-9._ -]+\.zip$/;

/** The main-process Minecraft service. */
export interface MinecraftService {
  status(mcVersion: string): Promise<MinecraftStatus>;
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
}

/** What the service needs from its host. */
export interface MinecraftServiceDeps {
  msmHome: string;
  fs: InstallFileSystem;
  /** The game directory in use, or `null` when none is set or detected. */
  minecraftDir(): Promise<string | null>;
  /** ISO 8601 timestamp for `extractedAt`. Defaults to the current time. */
  now?(): string;
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
      if (!RESOURCE_PACK_FILE_NAME.test(fileName) || fileName.length > 255) {
        throw new Error(`${JSON.stringify(fileName)} is not a valid resource pack file name.`);
      }
      const minecraftDir = await requireDir();
      const packs = joinInstallPath(minecraftDir, 'resourcepacks');
      await fs.mkdirp(packs);
      const path = joinInstallPath(packs, fileName);
      await fs.writeFile(path, data);
      return { path: normalize(path) };
    },
  };
}
