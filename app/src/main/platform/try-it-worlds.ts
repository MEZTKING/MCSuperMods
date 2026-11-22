/**
 * Try it's worlds (ADR 0087): lists the saves Try it can copy an area from, with each save's
 * seed (`@msm/interop`'s `readWorldSeed`; ADR 0119, for "Seed of one of my worlds"), and reads
 * that area through `@msm/interop`'s pure `readWorldArea`, with Node's zlib.
 *
 * Read-only (D2): nothing here writes. Reads are limited to the `saves/` folders of the game
 * folders the app already knows (every discovered location, which includes the selected one and
 * the launcher instances, plus the managed Play instance when Play has seen it). Every file is
 * resolved through its real path and must lie inside the real world folder, which must lie
 * inside the real `saves/` folder, which must lie inside the real game folder (and, for an
 * instance, the game folder inside the instance folder). The renderer names a world only by
 * the id this service gave it; paths never come from the renderer.
 *
 * @packageDocumentation
 */

import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, normalize } from 'node:path';
import { gunzipSync, inflateSync } from 'node:zlib';
import {
  FIRST_FLAT_CHUNK_DATA_VERSION,
  type Inflate,
  isPathInside,
  isSafeSegment,
  locationPathKey,
  readLevelSummary,
  readWorldArea,
  readWorldSeed,
  type WorldArea,
  WorldReadError,
} from '@msm/interop';
import { TRYIT_ICON_MAX_BYTES, TRYIT_WORLDS_MAX } from '../../shared/ipc-contract';
import type {
  TryItAreaRequest,
  TryItWorldArea,
  TryItWorldInfo,
  TryItWorldsPlatform,
} from '../../shared/platform';
import type { LocationResolver } from './locations';

/** The largest `level.dat` read, in bytes. */
export const LEVEL_DAT_MAX_BYTES = 16 * 1024 * 1024;

/** The game folder id of the managed Play instance when discovery did not already list it. */
export const MANAGED_GAME_FOLDER_ID = 'msm-play';

/** Node's zlib as `readWorldArea`'s inflate. */
export const nodeInflate: Inflate = (data, format) =>
  format === 'gzip' ? gunzipSync(data) : inflateSync(data);

/** A game folder whose `saves/` Try it may read. */
interface GameFolder {
  id: string;
  name: string;
  gameDir: string;
  instanceDir: string | null;
  selected: boolean;
}

/** The service the IPC layer serves `tryit:*` from. */
export type TryItWorldsService = TryItWorldsPlatform;

/** What the service needs from its host. */
export interface TryItWorldsDeps {
  /** Discovers game locations (ADR 0019). */
  locations: Pick<LocationResolver, 'resolve'>;
  /** The managed Play instance's game folder, when Play has reported it (ADR 0084). */
  managedGameDir?(): string | null;
  /** Decompression for chunks; Node's zlib by default. */
  inflate?: Inflate;
}

/** Whether `child` is `parent` or inside it (both real paths). */
function isSameOrInside(parent: string, child: string): boolean {
  return locationPathKey(parent) === locationPathKey(child) || isPathInside(parent, child);
}

async function realOrNull(path: string): Promise<string | null> {
  try {
    return await realpath(normalize(path));
  } catch {
    return null;
  }
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}

/** A file's bytes when it is a regular file of at most `max` bytes, else `null`. */
async function readSmallFile(path: string, max: number): Promise<Uint8Array | null> {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > max) return null;
    return new Uint8Array(await readFile(path));
  } catch {
    return null;
  }
}

/** The error the renderer sees: `tryit.<code>: <plain sentence>`. */
export class TryItWorldError extends Error {
  constructor(code: string, message: string) {
    super(`tryit.${code}: ${message}`);
    this.name = 'TryItWorldError';
  }
}

/** Creates the Try it worlds service. */
export function createTryItWorldsService(deps: TryItWorldsDeps): TryItWorldsService {
  const inflate = deps.inflate ?? nodeInflate;

  /** Every known game folder once (by real path), discovery order, the managed one last. */
  const gameFolders = async (): Promise<GameFolder[]> => {
    const { locations, selected } = await deps.locations.resolve();
    const folders: GameFolder[] = locations.map((location) => ({
      id: location.id,
      name: location.displayName,
      gameDir: normalize(location.gameDir),
      instanceDir: location.instanceDir === null ? null : normalize(location.instanceDir),
      selected: selected !== null && selected.id === location.id,
    }));
    const managed = deps.managedGameDir?.() ?? null;
    if (managed !== null) {
      const instanceDir = dirname(normalize(managed));
      folders.push({
        id: MANAGED_GAME_FOLDER_ID,
        name: basename(instanceDir),
        gameDir: normalize(managed),
        instanceDir,
        selected: false,
      });
    }
    const seen = new Set<string>();
    const out: GameFolder[] = [];
    for (const folder of folders) {
      const real = await realOrNull(folder.gameDir);
      const key = locationPathKey(real ?? folder.gameDir);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(folder);
    }
    return out;
  };

  /**
   * The real `saves/` folder of a game folder after the containment checks, or `null` when it
   * does not exist or resolves where it should not.
   */
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

  /** The real world folder of `<saves>/<folder>`, or `null` when it is not inside `saves`. */
  const realWorld = async (saves: string, folder: string): Promise<string | null> => {
    if (!isSafeSegment(folder)) return null;
    const real = await realOrNull(join(saves, folder));
    return real !== null && isPathInside(saves, real) ? real : null;
  };

  /** Reads a file of the world; `null` when missing; throws when it leaves the world folder. */
  const containedReader =
    (world: string) =>
    async (path: string): Promise<Uint8Array | null> => {
      let real: string;
      try {
        real = await realpath(normalize(path));
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
      if (!isPathInside(world, real)) {
        throw new Error('the file resolves outside the world folder, so MSM does not read it');
      }
      return new Uint8Array(await readFile(real));
    };

  return {
    async listWorlds() {
      const worlds: TryItWorldInfo[] = [];
      for (const folder of await gameFolders()) {
        const saves = await realSaves(folder);
        if (saves === null) continue;
        let entries: string[];
        try {
          entries = (await readdir(saves, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
            .map((entry) => entry.name);
        } catch {
          continue;
        }
        for (const name of entries) {
          const world = await realWorld(saves, name);
          if (world === null) continue;
          const levelPath = join(world, 'level.dat');
          const level = await readSmallFile(levelPath, LEVEL_DAT_MAX_BYTES);
          if (level === null) continue;
          const summary = readLevelSummary(level);
          let lastPlayed: string | null = null;
          const played = summary?.lastPlayed ?? null;
          if (played !== null && played > 0) {
            lastPlayed = new Date(played).toISOString();
          } else {
            try {
              lastPlayed = (await stat(levelPath)).mtime.toISOString();
            } catch {
              lastPlayed = null;
            }
          }
          const iconPath = await realOrNull(join(world, 'icon.png'));
          const icon =
            iconPath !== null && isPathInside(world, iconPath)
              ? await readSmallFile(iconPath, TRYIT_ICON_MAX_BYTES)
              : null;
          const dataVersion = summary?.dataVersion ?? null;
          // The seed lives in data/minecraft/world_gen_settings.dat (B574 WS17), read through
          // the same containment as the area.
          const seed = await readWorldSeed(containedReader(world), world);
          worlds.push({
            id: `${folder.id}/${name}`,
            name: summary?.name ?? name,
            folder: name,
            gameFolder: { id: folder.id, name: folder.name, selected: folder.selected },
            lastPlayed,
            versionName: summary?.versionName ?? null,
            dataVersion,
            readable:
              summary !== null &&
              (dataVersion === null || dataVersion >= FIRST_FLAT_CHUNK_DATA_VERSION),
            icon,
            seed: seed === null ? null : seed.toString(),
          });
          if (worlds.length >= TRYIT_WORLDS_MAX) break;
        }
        if (worlds.length >= TRYIT_WORLDS_MAX) break;
      }
      // Most recently played first; ties by name.
      return worlds.sort((a, b) => {
        const left = a.lastPlayed ?? '';
        const right = b.lastPlayed ?? '';
        if (left !== right) return left < right ? 1 : -1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
    },

    async readArea(request: TryItAreaRequest): Promise<TryItWorldArea> {
      const slash = request.worldId.lastIndexOf('/');
      const folderId = request.worldId.slice(0, slash);
      const name = request.worldId.slice(slash + 1);
      if (slash <= 0 || !isSafeSegment(name)) {
        throw new TryItWorldError('unknown-world', 'That world is not in the list.');
      }
      const folder = (await gameFolders()).find((candidate) => candidate.id === folderId);
      const saves = folder === undefined ? null : await realSaves(folder);
      const world = saves === null ? null : await realWorld(saves, name);
      if (world === null) {
        throw new TryItWorldError(
          'unknown-world',
          'That world is no longer there. Pick it again from the list.',
        );
      }
      try {
        const area: WorldArea = await readWorldArea(containedReader(world), world, {
          centre: request.centre,
          inflate,
        });
        return area;
      } catch (error) {
        if (error instanceof WorldReadError) throw new TryItWorldError(error.code, error.message);
        throw new TryItWorldError(
          'read-failed',
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  };
}
