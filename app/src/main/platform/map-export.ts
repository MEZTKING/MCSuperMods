/**
 * Export as a map and builds from the game (ADR 0116 D2, D3) in the main process.
 *
 * - `listWorlds` lists the worlds a map can be made from: the managed Play instance's (first)
 *   and every discovered game location's `saves/`.
 * - `exportMap` asks where to save the map, then streams the chosen world into that one file
 *   through a temporary file beside it (world backups' `zipTree`, ADR 0102): a world `.zip`
 *   with the project's data pack in `datapacks/` and its resource pack as `resources.zip`, or,
 *   for a project that needs the jar, a `.mrpack` (ADR 0046 D4: `modrinth.index.json`, the jar
 *   under `overrides/mods/`, the world under `overrides/saves/`). What goes in and what is left
 *   out is `@msm/interop`'s map plan. `level.dat` is copied, never written.
 * - `listStructureSaves` and `readStructureSave` read the structure-block saves of the managed
 *   instance's worlds (`generated/<ns>/structure/<path>.nbt`, B547) for the `.nbt` importer.
 *
 * Containment: worlds are named by a source id and a folder name this service listed; every
 * folder resolves through its real path inside the real `saves/`, inside the real game folder
 * (and, for an instance, inside the instance folder). Symbolic links inside a world are not
 * followed or copied. The only write is the map file the user picked, which must not lie
 * inside the world being copied. Nothing in a world is changed.
 *
 * @packageDocumentation
 */

import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, normalize } from 'node:path';
import {
  isMapFolderName,
  isMapJarFileName,
  isPathInside,
  isSafeSegment,
  listStructureSaves,
  locationPathKey,
  type MapLeftOutReason,
  type MapPackage,
  mapEntryLeftOut,
  mapEntryPrefix,
  mapExtraFiles,
  mapFileName,
  readLevelName,
  STRUCTURE_SAVE_MAX_BYTES,
  structureSavePath,
} from '@msm/interop';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import type {
  FileFilter,
  MapExportRequest,
  MapExportResult,
  MapWorldSource,
  StructureSaveInfo,
  WorldInfo,
} from '../../shared/platform';
import type { LocationResolver } from './locations';
import { zipTree } from './world-backups';

/** The source id of the managed Play instance. */
export const MANAGED_MAP_SOURCE = 'msm-play';
/** The largest `level.dat` read for a world name, in bytes. */
const LEVEL_DAT_MAX_BYTES = 16 * 1024 * 1024;
/** The most worlds listed per source. */
export const MAP_WORLDS_MAX = 500;
/** The `.mrpack` index file (ADR 0046 D4). */
const MRPACK_INDEX = 'modrinth.index.json';

/** The managed instance of a target, as Play reports it. */
export interface ManagedGame {
  /** The managed instance's game folder. */
  gameDir: string;
  /** The world open in the game now, or `null`. */
  openWorld: string | null;
}

/** What the service needs from its host. */
export interface MapExportDeps {
  /** Discovers game locations (ADR 0019). */
  locations: Pick<LocationResolver, 'resolve'>;
  /** The managed Play instance of a target, or `null` when it does not exist yet. */
  managedGame(targetId: string): Promise<ManagedGame | null>;
  /** Shows a save dialog; returns the chosen absolute path, or `null` when cancelled. */
  saveFilePath(opts: {
    title: string;
    defaultName: string;
    filters?: FileFilter[] | undefined;
  }): Promise<string | null>;
  /** Called with the written map (the reveal list). */
  onWritten?(path: string): void;
}

/** The service the IPC layer serves `maps:*` from. */
export interface MapExportService {
  listWorlds(targetId: string): Promise<MapWorldSource[]>;
  exportMap(request: MapExportRequest): Promise<MapExportResult | null>;
  listStructureSaves(targetId: string): Promise<StructureSaveInfo[]>;
  readStructureSave(targetId: string, world: string, id: string): Promise<Uint8Array>;
}

/** A game folder whose `saves/` may be read. */
interface GameFolder {
  id: string;
  name: string;
  managed: boolean;
  gameDir: string;
  instanceDir: string | null;
}

async function realOrNull(path: string): Promise<string | null> {
  try {
    return await realpath(normalize(path));
  } catch {
    return null;
  }
}

function isSameOrInside(parent: string, child: string): boolean {
  return locationPathKey(parent) === locationPathKey(child) || isPathInside(parent, child);
}

const byNewest = (a: WorldInfo, b: WorldInfo): number =>
  a.lastModified !== b.lastModified
    ? a.lastModified < b.lastModified
      ? 1
      : -1
    : a.dir < b.dir
      ? -1
      : a.dir > b.dir
        ? 1
        : 0;

/** Throws unless `text` is a `.mrpack` index object (format 1, game `minecraft`). */
function checkedIndex(text: string): Uint8Array {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The modpack index is not valid JSON.');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    (parsed as Record<string, unknown>).formatVersion !== 1 ||
    (parsed as Record<string, unknown>).game !== 'minecraft'
  ) {
    throw new Error('The modpack index is not a Modrinth modpack index.');
  }
  return new TextEncoder().encode(text.endsWith('\n') ? text : `${text}\n`);
}

/** Creates the map export service. */
export function createMapExportService(deps: MapExportDeps): MapExportService {
  const installFs = createNodeInstallFileSystem();

  /** The managed instance first, then every discovered location once (by real path). */
  const gameFolders = async (targetId: string): Promise<GameFolder[]> => {
    const folders: GameFolder[] = [];
    const managed = await deps.managedGame(targetId);
    if (managed !== null) {
      const gameDir = normalize(managed.gameDir);
      const instanceDir = dirname(gameDir);
      folders.push({
        id: MANAGED_MAP_SOURCE,
        name: basename(instanceDir),
        managed: true,
        gameDir,
        instanceDir,
      });
    }
    try {
      const { locations } = await deps.locations.resolve();
      for (const location of locations) {
        folders.push({
          id: location.id,
          name: location.displayName,
          managed: false,
          gameDir: normalize(location.gameDir),
          instanceDir: location.instanceDir === null ? null : normalize(location.instanceDir),
        });
      }
    } catch {
      // Discovery failed: the managed instance alone.
    }
    const seen = new Set<string>();
    const out: GameFolder[] = [];
    for (const folder of folders) {
      const key = locationPathKey((await realOrNull(folder.gameDir)) ?? folder.gameDir);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(folder);
    }
    return out;
  };

  /** The real `saves/` of a game folder after the containment checks, or `null`. */
  const realSaves = async (folder: GameFolder): Promise<string | null> => {
    const realGame = await realOrNull(folder.gameDir);
    if (realGame === null) return null;
    if (folder.instanceDir !== null) {
      const realInstance = await realOrNull(folder.instanceDir);
      if (realInstance === null || !isSameOrInside(realInstance, realGame)) return null;
    }
    const saves = await realOrNull(join(folder.gameDir, 'saves'));
    if (saves === null || !isPathInside(realGame, saves)) return null;
    return saves;
  };

  /** The real world folder `<saves>/<dir>` holding a `level.dat`, or `null`. */
  const realWorld = async (saves: string, dir: string): Promise<string | null> => {
    if (!isSafeSegment(dir)) return null;
    const real = await realOrNull(join(saves, dir));
    if (real === null || !isPathInside(saves, real)) return null;
    try {
      return (await stat(join(real, 'level.dat'))).isFile() ? real : null;
    } catch {
      return null;
    }
  };

  const worldsIn = async (saves: string): Promise<WorldInfo[]> => {
    const worlds: WorldInfo[] = [];
    let names: string[];
    try {
      names = (await installFs.readDir(saves))
        .filter((entry) => entry.kind === 'directory')
        .map((entry) => entry.name);
    } catch {
      return worlds;
    }
    for (const dir of names) {
      const world = await realWorld(saves, dir);
      if (world === null) continue;
      const levelDat = join(world, 'level.dat');
      let name = dir;
      let lastModified = new Date(0).toISOString();
      try {
        const info = await stat(levelDat);
        lastModified = info.mtime.toISOString();
        if (info.size <= LEVEL_DAT_MAX_BYTES) {
          name = readLevelName(new Uint8Array(await readFile(levelDat))) ?? dir;
        }
      } catch {
        // The folder name and the epoch stand in.
      }
      worlds.push({ dir, name, lastModified });
      if (worlds.length >= MAP_WORLDS_MAX) break;
    }
    return worlds.sort(byNewest);
  };

  /** The real world folder of a listed source and folder name; throws when it is not one. */
  const requireWorld = async (
    targetId: string,
    sourceId: string,
    dir: string,
  ): Promise<{ world: string; folder: GameFolder }> => {
    const folder = (await gameFolders(targetId)).find((entry) => entry.id === sourceId);
    const saves = folder === undefined ? null : await realSaves(folder);
    const world = saves === null ? null : await realWorld(saves, dir);
    if (folder === undefined || world === null) {
      throw new Error('That world is no longer there. Choose it again from the list.');
    }
    return { world, folder };
  };

  /** The real world folders of the managed instance's `saves/`, by folder name. */
  const managedWorlds = async (targetId: string): Promise<{ dir: string; path: string }[]> => {
    const folder = (await gameFolders(targetId)).find((entry) => entry.managed);
    const saves = folder === undefined ? null : await realSaves(folder);
    if (saves === null) return [];
    const out: { dir: string; path: string }[] = [];
    for (const world of await worldsIn(saves)) {
      const path = await realWorld(saves, world.dir);
      if (path !== null) out.push({ dir: world.dir, path });
    }
    return out;
  };

  return {
    async listWorlds(targetId) {
      const sources: MapWorldSource[] = [];
      for (const folder of await gameFolders(targetId)) {
        const saves = await realSaves(folder);
        const worlds = saves === null ? [] : await worldsIn(saves);
        if (worlds.length === 0 && !folder.managed) continue;
        sources.push({ id: folder.id, name: folder.name, managed: folder.managed, worlds });
      }
      return sources;
    },

    async exportMap(request) {
      if (!isMapFolderName(request.mapName)) {
        throw new Error(`${JSON.stringify(request.mapName)} is not a valid map name.`);
      }
      const pkg: MapPackage = request.mrpack === undefined ? 'world-zip' : 'mrpack';
      if (
        pkg === 'mrpack' &&
        (request.dataPack !== undefined || request.resourcePack !== undefined)
      ) {
        throw new Error('A map with the mod jar carries no separate packs.');
      }
      const before: { name: string; data: Uint8Array }[] = [];
      if (request.mrpack !== undefined) {
        before.push({ name: MRPACK_INDEX, data: checkedIndex(request.mrpack.index) });
        const names = new Set<string>();
        for (const jar of request.mrpack.jars) {
          if (!isMapJarFileName(jar.fileName) || names.has(jar.fileName.toLowerCase())) {
            throw new Error(`${JSON.stringify(jar.fileName)} is not a jar file name.`);
          }
          names.add(jar.fileName.toLowerCase());
          before.push({ name: `overrides/mods/${jar.fileName}`, data: jar.data });
        }
      }
      const extras = mapExtraFiles({
        dataPack: request.dataPack,
        resourcePack: request.resourcePack,
      });
      const { world, folder } = await requireWorld(
        request.targetId,
        request.sourceId,
        request.worldDir,
      );
      if (folder.managed) {
        const managed = await deps.managedGame(request.targetId);
        if (managed?.openWorld === request.worldDir) {
          throw new Error(
            'That world is open in the game. Leave it (or close Minecraft) first, then export it.',
          );
        }
      }
      const path = await deps.saveFilePath({
        title: 'Export as a map',
        defaultName: mapFileName(pkg, request.mapName),
        filters:
          pkg === 'mrpack'
            ? [{ name: 'Modrinth modpack with the map', extensions: ['mrpack'] }]
            : [{ name: 'Minecraft world', extensions: ['zip'] }],
      });
      if (path === null) return null;
      const out = normalize(path);
      const realOutDir = await realOrNull(dirname(out));
      if (realOutDir === null) throw new Error('The folder to save the map in does not exist.');
      if (isSameOrInside(world, realOutDir)) {
        throw new Error('Save the map outside the world folder it is made from.');
      }
      const options = {
        keepPlayerData: request.keepPlayerData,
        dataPackFile: request.dataPack?.fileName,
        resourcePack: request.resourcePack !== undefined,
      };
      const leftOut: { path: string; reason: MapLeftOutReason }[] = [];
      const { entries } = await zipTree({
        root: world,
        top: mapEntryPrefix(pkg, request.mapName),
        out: join(realOutDir, basename(out)),
        read: async (file) => new Uint8Array(await readFile(file)),
        skip: (relative, directory) => {
          const reason = mapEntryLeftOut(relative, directory, options);
          if (reason !== null) leftOut.push({ path: relative, reason });
          return reason !== null;
        },
        before,
        after: extras.map((extra) => ({ name: extra.path, data: extra.data })),
        verb: 'export as a map',
      });
      const written = join(realOutDir, basename(out));
      deps.onWritten?.(written);
      leftOut.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      return { path: written, kind: pkg, entries, leftOut };
    },

    async listStructureSaves(targetId) {
      const out: StructureSaveInfo[] = [];
      for (const { dir, path } of await managedWorlds(targetId)) {
        for (const save of await listStructureSaves(installFs, path)) {
          const file = await realOrNull(join(path, ...save.relative.split('/')));
          if (file === null || !isPathInside(path, file)) continue;
          try {
            const info = await lstat(file);
            if (!info.isFile()) continue;
            out.push({
              world: dir,
              id: save.id,
              size: info.size,
              lastModified: info.mtime.toISOString(),
            });
          } catch {
            // Gone while listing.
          }
        }
      }
      return out;
    },

    async readStructureSave(targetId, worldDir, id) {
      const world = (await managedWorlds(targetId)).find((entry) => entry.dir === worldDir);
      if (world === undefined) {
        throw new Error('That test world is no longer there. Open the list again.');
      }
      const file = await realOrNull(join(world.path, ...structureSavePath(id).split('/')));
      if (file === null || !isPathInside(world.path, file)) {
        throw new Error(`The build ${id} is no longer in ${worldDir}.`);
      }
      const info = await lstat(file);
      if (!info.isFile() || info.size > STRUCTURE_SAVE_MAX_BYTES) {
        throw new Error(`The build ${id} is too large to import.`);
      }
      return new Uint8Array(await readFile(file));
    },
  };
}
