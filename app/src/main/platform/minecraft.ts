/**
 * Minecraft installation access for the main process (ADR 0011, ADR 0019): status, client-jar
 * asset extraction into `<msmHome>/cache/assets/<version>/` from any launcher's jar store,
 * cached asset reads for the renderer, installing resource packs into the selected game
 * location, listing its worlds and installing data packs into a world's `datapacks/` folder.
 *
 * Writes never leave the selected location's game folder: for an instance, the real game
 * folder must lie inside the real instance folder, which must lie inside the real instances
 * folder; the `resourcepacks/`, `saves/<world>/` and `datapacks/` folders must resolve inside
 * the real game folder.
 *
 * @packageDocumentation
 */

import { realpath, stat } from 'node:fs/promises';
import { dirname, normalize } from 'node:path';
import {
  type AssetCacheInfo,
  assetCacheDir,
  extractPreviewAssets,
  findClientJar,
  type GameLocation,
  type InstallFileSystem,
  isPathInside,
  isSafeSegment,
  joinInstallPath,
  listLauncherClientJars,
  locationPathKey,
  PREVIEW_ASSET_PATTERNS,
  pickVersionJar,
  readAssetCacheInfo,
  writeAssetCache,
} from '@msm/interop';
import { sha1Hex } from '@msm/interop/node';
import { assertProjectRelativePath, isProjectRelativePath } from '@msm/plugin-api';
import type { MinecraftProgress } from '../../shared/ipc-channels';
import type { GameLocationList, MinecraftStatus, WorldInfo } from '../../shared/platform';
import { type LocationResolver, targetWarnings, toLocationView } from './locations';

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

/** Shown when no location is selected and none can be found. */
export const NO_LOCATION_MESSAGE =
  'No Minecraft folder or launcher instance was found. Choose one in Settings.';

/** Shown when the selected instance has no game folder yet (`location.game-dir-missing`). */
export const GAME_DIR_MISSING_MESSAGE = 'Start the instance once so its game folder exists.';

/** Whether `child` is `parent` itself (both already resolved). */
function isSamePath(parent: string, child: string): boolean {
  return locationPathKey(parent) === locationPathKey(child);
}

/** Whether `child` is `parent` or lies inside it (both already resolved). */
function isSameOrInside(parent: string, child: string): boolean {
  return isSamePath(parent, child) || isPathInside(parent, child);
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
  /** Worlds in `<gameDir>/saves/` of the selected location that contain `level.dat`, most recent first. */
  listWorlds(): Promise<WorldInfo[]>;
  /** Writes a data pack zip into `<gameDir>/saves/<worldDir>/datapacks/` of the selected location. */
  installDataPack(worldDir: string, fileName: string, data: Uint8Array): Promise<{ path: string }>;
}

/** What the service needs from its host. */
export interface MinecraftServiceDeps {
  msmHome: string;
  fs: InstallFileSystem;
  /** Discovers game locations and resolves the install target (ADR 0019). */
  locations: LocationResolver;
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

  const requireSelected = async (): Promise<GameLocation> => {
    const { selected } = await deps.locations.selected();
    if (selected === null) throw new Error(NO_LOCATION_MESSAGE);
    return selected;
  };

  const realOrNull = async (path: string): Promise<string | null> => {
    try {
      return await resolveReal(normalize(path));
    } catch {
      return null;
    }
  };

  /**
   * The real path of the selected location's game folder after the containment checks, or
   * `null` when the folder does not exist yet. Throws when the folder (or, for an instance,
   * the instance folder) resolves outside where it belongs.
   */
  const realGameDir = async (location: GameLocation): Promise<string | null> => {
    if (!(await fs.exists(location.gameDir))) return null;
    const realGame = await realOrNull(location.gameDir);
    if (realGame === null) return null;
    if (location.instanceDir === null) return realGame;
    const instanceDir = normalize(location.instanceDir);
    const [realInstance, realInstances] = await Promise.all([
      realOrNull(instanceDir),
      realOrNull(dirname(instanceDir)),
    ]);
    if (
      realInstance === null ||
      realInstances === null ||
      !isPathInside(realInstances, realInstance) ||
      !isSameOrInside(realInstance, realGame)
    ) {
      throw new Error(
        `The game folder of ${JSON.stringify(location.displayName)} is outside its instance folder.`,
      );
    }
    return realGame;
  };

  /** Like {@link realGameDir}, but the game folder must exist (installs). */
  const requireGameDir = async (location: GameLocation): Promise<string> => {
    const missing = location.problems.some(
      (problem) => problem.code === 'location.game-dir-missing',
    );
    const real = missing ? null : await realGameDir(location);
    if (real === null) throw new Error(GAME_DIR_MISSING_MESSAGE);
    return real;
  };

  /** Throws unless the existing folder `dir` resolves inside the real game folder. */
  const assertInsideGameDir = async (realGame: string, dir: string, what: string) => {
    const real = await realOrNull(dir);
    if (real === null || !isPathInside(realGame, real)) {
      throw new Error(`The ${what} folder is outside the game folder.`);
    }
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
    const { locations, selected } = await deps.locations.resolve();
    if (locations.length === 0) throw new Error(NO_LOCATION_MESSAGE);
    const chosen = await findClientJar(fs, locations, selected, mcVersion);
    if (chosen === null) {
      throw new Error(
        `Minecraft ${mcVersion} is not installed in any launcher MSM found. Start it once in your launcher, then extract.`,
      );
    }
    const dir = assetCacheDir(msmHome, mcVersion);

    report('reading', 0, 1);
    const jar = await fs.readFile(chosen.jarPath);
    const jarSha1 = sha1Hex(jar);
    report('reading', 1, 1);

    const existing = await readAssetCacheInfo(fs, dir);
    if (
      existing !== null &&
      existing.jarSha1 === jarSha1 &&
      existing.version === chosen.versionId
    ) {
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
      version: chosen.versionId,
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
      const { locations, selected, targetMissing } = await deps.locations.resolve();
      let installed: Awaited<ReturnType<typeof listLauncherClientJars>> = [];
      if (selected !== null) {
        try {
          installed = await listLauncherClientJars(fs, selected.ref.launcher, selected.ref.root);
        } catch {
          installed = [];
        }
      }
      const chosen = pickVersionJar(installed, mcVersion);
      const jar = await findClientJar(fs, locations, selected, mcVersion);
      const cache = await validCache(mcVersion);
      return {
        // The game folder in use: the selected location's (the official one by default).
        minecraftDir: selected === null ? null : normalize(selected.gameDir),
        installed: installed.map((version) => ({ id: version.id })),
        chosen: chosen === undefined ? null : { id: chosen.id },
        cache: cache?.info ?? null,
        target: selected === null ? null : toLocationView(selected, mcVersion),
        targetMissing,
        jar: jar === null ? null : { versionId: jar.versionId, launcher: jar.launcher },
        warnings: targetWarnings(selected, mcVersion),
      };
    },

    listLocations(mcVersion) {
      return deps.locations.list(mcVersion);
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
      const location = await requireSelected();
      const realGame = await requireGameDir(location);
      const packs = normalize(joinInstallPath(location.gameDir, 'resourcepacks'));
      await fs.mkdirp(packs);
      await assertInsideGameDir(realGame, packs, 'resourcepacks');
      const path = joinInstallPath(packs, fileName);
      await fs.writeFile(path, data);
      return { path: normalize(path) };
    },

    async listWorlds() {
      const location = await requireSelected();
      const realGame = await realGameDir(location);
      if (realGame === null) return [];
      const saves = normalize(joinInstallPath(location.gameDir, 'saves'));
      if (!(await fs.exists(saves))) return [];
      await assertInsideGameDir(realGame, saves, 'saves');
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
      const location = await requireSelected();
      const realGame = await requireGameDir(location);
      const saves = normalize(joinInstallPath(location.gameDir, 'saves'));
      const world = joinInstallPath(saves, worldDir);
      if (!(await fs.exists(world))) {
        throw new Error(`The world ${JSON.stringify(worldDir)} does not exist.`);
      }
      // A symlinked world folder must still resolve inside `saves/`, and `saves/` inside the
      // game folder.
      await assertInsideGameDir(realGame, saves, 'saves');
      const [realSaves, realWorld] = await Promise.all([resolveReal(saves), resolveReal(world)]);
      if (!isPathInside(realSaves, realWorld)) {
        throw new Error(`The world ${JSON.stringify(worldDir)} is outside the saves folder.`);
      }
      const datapacks = joinInstallPath(world, 'datapacks');
      await fs.mkdirp(datapacks);
      await assertInsideGameDir(realGame, datapacks, 'datapacks');
      const path = joinInstallPath(datapacks, fileName);
      await fs.writeFile(path, data);
      return { path: normalize(path) };
    },
  };
}
