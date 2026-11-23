/**
 * Minecraft installation access for the main process (ADR 0011, ADR 0019): status, client-jar
 * asset extraction into `<msmHome>/cache/assets/<version>/` from any launcher's jar store,
 * cached asset reads for the renderer, the cached vanilla worldgen files of a version in one
 * answer for the live world generation preview (ADR 0119 D4), the cached vanilla data files of
 * some folders in one answer for the live views (ADR 0120 D11), installing resource packs into the
 * selected game location, listing its worlds and installing data packs into a world's
 * `datapacks/` folder.
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
  mergeDataFolders,
  PREVIEW_ASSET_PATTERNS,
  pickVersionJar,
  readAssetCacheInfo,
  readCachedDataFiles,
  readLevelName,
  readOutdatedAssetCacheInfo,
  sameDataFolders,
  writeAssetCache,
} from '@msm/interop';
import { sha1Hex } from '@msm/interop/node';
import { assertProjectRelativePath, isProjectRelativePath } from '@msm/plugin-api';
import type { MinecraftProgress } from '../../shared/ipc-channels';
import type {
  GameLocationList,
  MinecraftStatus,
  ResolvedBiomeListsView,
  VanillaDataFiles,
  VanillaNames,
  VanillaWorldgenFiles,
  WorldBackupList,
  WorldBackupRef,
  WorldBackupRestoreRequest,
  WorldInfo,
} from '../../shared/platform';
import { type LocationResolver, targetWarnings, toLocationView } from './locations';
import { LANG_FILE_PATH, parseLangNames } from './vanilla-names';
import { locationSlug, type WorldBackupService } from './world-backups';

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
  /**
   * Every cached vanilla worldgen file of `mcVersion` (the target's
   * `worldgen.terrainPreview.dataFolders`) as folder key to id to JSON, with the resolved biome
   * lists of {@link MinecraftServiceDeps.resolvedBiomeLists}; `null` when the cache is not set
   * up for the target's folders or the target has none (ADR 0119 D4, D10).
   */
  readWorldgenFiles(mcVersion: string): Promise<VanillaWorldgenFiles | null>;
  /**
   * The cached vanilla files of `folders` as folder key to id to JSON (ADR 0120 D11): the live
   * views' bulk read by folder. Each folder must be one the cache keeps (the live views' and the
   * world generation folders); `null` when the cache is not set up for the version.
   *
   * @throws Error When a folder is not one the cache keeps for the version.
   */
  readDataFiles(mcVersion: string, folders: readonly string[]): Promise<VanillaDataFiles | null>;
  /**
   * The English names of `mcVersion`'s vanilla things from the cached `en_us.json` (ADR 0124
   * D3, B656; `vanilla-names.ts`), or `null` when the cache is not set up or holds no lang file.
   *
   * @throws Error When the lang file's real path is outside the cache folder, or the file is too
   * large or not a JSON object.
   */
  readLangNames(mcVersion: string): Promise<VanillaNames | null>;
  installResourcePack(fileName: string, data: Uint8Array): Promise<{ path: string }>;
  /**
   * Worlds in `<gameDir>/saves/` of the selected location that contain `level.dat`, most
   * recent first, named by `Data.LevelName` (the folder name when `level.dat` is unreadable).
   */
  listWorlds(): Promise<WorldInfo[]>;
  /**
   * Writes a data pack zip into `<gameDir>/saves/<worldDir>/datapacks/` of the selected
   * location. With a backup service and `backups.beforeInstall` on, the whole world is backed
   * up first (ADR 0102 D1); a failed backup stops the install and nothing is written.
   */
  installDataPack(
    worldDir: string,
    fileName: string,
    data: Uint8Array,
  ): Promise<{ path: string; backup: WorldBackupRef | null }>;
  /** Every world backup, named by the game locations found now (ADR 0102 D3). */
  listWorldBackups(): Promise<WorldBackupList>;
  /**
   * Unpacks a backup beside its world in the `saves/` folder of the location it came from,
   * as `<world-dir>-restored-<stamp>`; never over the live world.
   */
  restoreWorldBackup(request: WorldBackupRestoreRequest): Promise<{ dir: string; path: string }>;
}

/** The start of the message when a backup before an install failed. */
export const BACKUP_FAILED_MESSAGE = 'The world could not be backed up, so nothing was installed';

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
  /** World backups before data pack installs (ADR 0102); without it, nothing is backed up. */
  backups?: WorldBackupService;
  /**
   * The `data/minecraft/` folders the target of `mcVersion` keeps for the world generation
   * preview (its `worldgen.terrainPreview.dataFolders`), or `null` when it has none. The list
   * comes from the target (ADR 0119 D16); without this, no data folder is extracted.
   */
  dataFoldersFor?(mcVersion: string): readonly string[] | null;
  /**
   * The `data/minecraft/` folders the live views read for `mcVersion`
   * (`LIVE_VIEW_DATA_FOLDERS` for a built-in target), or `null`. Extracted and recorded beside
   * {@link dataFoldersFor}'s; without this, none (ADR 0120 D11).
   */
  liveViewDataFoldersFor?(mcVersion: string): readonly string[] | null;
  /**
   * The resolved biome lists of vanilla's `multi_noise` presets for `mcVersion` (reserve B592,
   * `worldgen-biome-lists.ts`), or `null`. Defaults to none.
   */
  resolvedBiomeLists?(mcVersion: string): Promise<ResolvedBiomeListsView | null>;
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
  /** The world generation preview's folders (read by `readWorldgenFiles`). */
  const foldersFor = (mcVersion: string): readonly string[] =>
    deps.dataFoldersFor?.(mcVersion) ?? [];
  /** Every folder the cache keeps and records: the world generation and the live views' ones. */
  const cacheFoldersFor = (mcVersion: string): readonly string[] =>
    mergeDataFolders(foldersFor(mcVersion), deps.liveViewDataFoldersFor?.(mcVersion));

  const requireSelected = async (): Promise<GameLocation> => {
    const { selected } = await deps.locations.selected();
    if (selected === null) throw new Error(NO_LOCATION_MESSAGE);
    return selected;
  };

  /** The world name from `level.dat` (read whole; it is small), else the folder name. */
  const worldName = async (levelDat: string, dir: string): Promise<string> => {
    try {
      return readLevelName(await fs.readFile(levelDat)) ?? dir;
    } catch {
      return dir;
    }
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
    // A cache made for another folder list is extracted again (ADR 0119 D4).
    if (info === null || !sameDataFolders(info.dataFolders, cacheFoldersFor(mcVersion))) {
      return null;
    }
    return { dir, info };
  };

  /**
   * The jar an outdated cache of `mcVersion` came from, when one exists: an older schema, or
   * the current schema made for another folder list. Its `jarPath` is `null` before schema 4.
   */
  const outdatedCache = async (
    mcVersion: string,
  ): Promise<{ version: string; jarPath: string | null } | null> => {
    const dir = assetCacheDir(msmHome, mcVersion);
    const current = await readAssetCacheInfo(fs, dir);
    if (current !== null) {
      return sameDataFolders(current.dataFolders, cacheFoldersFor(mcVersion))
        ? null
        : { version: current.version, jarPath: current.jarPath };
    }
    const older = await readOutdatedAssetCacheInfo(fs, dir);
    return older === null ? null : { version: older.version, jarPath: older.jarPath };
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

    const dataFolders = cacheFoldersFor(mcVersion);
    const existing = await readAssetCacheInfo(fs, dir);
    if (
      existing !== null &&
      existing.jarSha1 === jarSha1 &&
      existing.version === chosen.versionId &&
      sameDataFolders(existing.dataFolders, dataFolders)
    ) {
      report('done', 1, 1);
      return existing;
    }

    report('extracting', 0, 1);
    // The preview assets, and the JSON files of the worldgen and live views' data folders.
    const files = extractPreviewAssets(jar, { dataFolders });
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
      jarPath: chosen.jarPath,
      dataFolders: [...dataFolders],
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
      // ADR 0119 D4: a user who extracted before gets the new set without the banner, as long
      // as the jar the old cache came from is still there (its recorded path from schema 4 on;
      // before that, a jar for the recorded version).
      let cacheOutdated = false;
      if (cache === null && jar !== null) {
        const outdated = await outdatedCache(mcVersion);
        if (outdated !== null) {
          cacheOutdated =
            outdated.jarPath === null
              ? jar.versionId === outdated.version
              : await fs.exists(outdated.jarPath);
        }
      }
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
        cacheOutdated,
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

    async readWorldgenFiles(mcVersion) {
      const folders = foldersFor(mcVersion);
      if (folders.length === 0) return null;
      const cache = await validCache(mcVersion);
      if (cache === null) return null;
      const read = await readCachedDataFiles(fs, cache.dir, folders, {
        owners: cache.info.dataFolders,
      });
      let resolvedBiomeLists: ResolvedBiomeListsView | null = null;
      try {
        resolvedBiomeLists = (await deps.resolvedBiomeLists?.(mcVersion)) ?? null;
      } catch {
        resolvedBiomeLists = null; // WL7: the vanilla overworld in one colour.
      }
      return {
        version: cache.info.version,
        files: read.folders,
        fileCount: read.fileCount,
        resolvedBiomeLists,
      };
    },

    async readDataFiles(mcVersion, folders) {
      const kept = new Set(cacheFoldersFor(mcVersion));
      for (const folder of folders) {
        if (!kept.has(folder)) {
          throw new Error(`${JSON.stringify(folder)} is not a data folder the cache keeps.`);
        }
      }
      const cache = await validCache(mcVersion);
      if (cache === null) return null;
      const read = await readCachedDataFiles(fs, cache.dir, folders, {
        owners: cache.info.dataFolders,
      });
      return { version: cache.info.version, folders: read.folders, fileCount: read.fileCount };
    },

    async readLangNames(mcVersion) {
      const cache = await validCache(mcVersion);
      if (cache === null) return null;
      const file = joinInstallPath(cache.dir, ...LANG_FILE_PATH.split('/'));
      if (!(await fs.exists(file))) return null;
      // Real-path containment: a lang file linked out of the cache folder is refused.
      const [realDir, realFile] = await Promise.all([realOrNull(cache.dir), realOrNull(file)]);
      if (realDir === null || realFile === null || !isPathInside(realDir, realFile)) {
        throw new Error('The cached en_us.json is outside the asset cache.');
      }
      return parseLangNames(await fs.readFile(realFile), cache.info.version);
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
        const levelDat = joinInstallPath(saves, entry.name, 'level.dat');
        const lastModified = await modifiedAt(levelDat);
        if (lastModified === null) continue;
        worlds.push({ dir: entry.name, name: await worldName(levelDat, entry.name), lastModified });
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
      // ADR 0102 D1: back the whole world up first; the install waits for it and stops when
      // it fails.
      let backup: WorldBackupRef | null = null;
      if (deps.backups !== undefined) {
        try {
          backup = await deps.backups.beforeInstall(location, worldDir, realWorld);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new Error(
            `${BACKUP_FAILED_MESSAGE}: ${reason} Try again, or turn off "Back up a world before installing into it" in Settings, World backups.`,
          );
        }
      }
      const datapacks = joinInstallPath(world, 'datapacks');
      await fs.mkdirp(datapacks);
      await assertInsideGameDir(realGame, datapacks, 'datapacks');
      const path = joinInstallPath(datapacks, fileName);
      await fs.writeFile(path, data);
      return { path: normalize(path), backup };
    },

    async listWorldBackups() {
      if (deps.backups === undefined) throw new Error('World backups are not available.');
      let locations: GameLocation[] = [];
      try {
        locations = (await deps.locations.resolve()).locations;
      } catch {
        // Discovery failed: list the backups under their folder names.
      }
      return deps.backups.list(locations);
    },

    async restoreWorldBackup(request) {
      const backups = deps.backups;
      if (backups === undefined) throw new Error('World backups are not available.');
      const zip = await backups.resolveBackup(request);
      const { locations } = await deps.locations.resolve();
      const location = locations.find((entry) => locationSlug(entry.ref) === request.location);
      if (location === undefined) {
        throw new Error(
          'The game folder this backup came from was not found. Unzip it by hand from the backups folder.',
        );
      }
      const realGame = await requireGameDir(location);
      const saves = normalize(joinInstallPath(location.gameDir, 'saves'));
      await fs.mkdirp(saves);
      await assertInsideGameDir(realGame, saves, 'saves');
      return backups.restoreInto(zip, await resolveReal(saves), request.worldDir);
    },
  };
}
