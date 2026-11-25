/**
 * The worlds of Play without mods and Open this map (ADR 0133 D6, B766), in the main process.
 *
 * A game that plays without mods opens in the Plain instance `MCSuperMods Plain (<mc>)` (no
 * loader, no mods) on a copy of a world: Play without mods copies the project's game world
 * (`msm-game-<ns>`) out of the test instance; Open this map copies the world a map was just
 * exported from. Either copy is made by the map export's own code (`map-export.ts`
 * `copyWorld`): the project's data pack (and resource pack) in, the dev data pack and the
 * game's lock file out, player data out unless kept. The runtime's other overlays live in the
 * test instance's game folder (`msm-dev/`), never in a world, so they never come along.
 *
 * The copy is made in MSM's own work folder (`<msmHome>/cache/plain-worlds/<id>/<world>`) and
 * handed to `ensureInstance` as the recipe's world source, which moves it into the Plain
 * instance's `saves/` through its staging folder (D5); the work folder is removed afterwards.
 * `level.dat` is copied, never written.
 *
 * The instances service (`instances.ts`) serves the `playPlain` and `openMap` channels with
 * this; nothing here touches a launcher folder.
 *
 * @packageDocumentation
 */

import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { isWorldFolderName } from '@msm/interop';
import type { MapExportService, MapWorldCopy } from './map-export';

/** The work folder of the copies, below the MSM home. */
export const PLAIN_WORLDS_DIR = join('cache', 'plain-worlds');

/** What Play without mods says when the game has no world yet. */
export const NO_GAME_WORLD_MESSAGE =
  'Your game has no world yet. Press Play my game once: Minecraft makes the world, then Play without mods opens a copy of it.';

/** What a game that needs its mod hears from Play without mods. */
export const NEEDS_MOD_MESSAGE =
  'This game needs its mod, so it cannot be played without mods. Use Play my game instead.';

/** A world to copy into the Plain instance. */
export interface PlainWorldRequest {
  targetId: string;
  /** A `maps.listWorlds` source id. */
  sourceId: string;
  /** A world folder of that source. */
  worldDir: string;
  /** The folder name the copy gets in the Plain instance's `saves/`. */
  folder: string;
  keepPlayerData: boolean;
  dataPack?: { fileName: string; data: Uint8Array } | undefined;
  resourcePack?: Uint8Array | undefined;
}

/** A copy ready for `ensureInstance`. */
export interface PreparedWorld {
  /** The folder name in `saves/`. */
  folder: string;
  /** The absolute folder of the copy (the recipe's world source). */
  source: string;
  leftOut: MapWorldCopy['leftOut'];
  /** Removes the copy's work folder (call once `ensureInstance` has moved it). */
  dispose(): Promise<void>;
}

/** The worlds Play without mods and Open this map copy. */
export interface PlainWorlds {
  /** The real folder of a listed world, or `null` when it is not there. */
  locate(targetId: string, sourceId: string, worldDir: string): Promise<string | null>;
  /** Copies a listed world by the map's plan into a new work folder. */
  prepare(request: PlainWorldRequest): Promise<PreparedWorld>;
}

/** What {@link createPlainWorlds} needs. */
export interface PlainWorldsDeps {
  maps: Pick<MapExportService, 'locateWorld' | 'copyWorld'>;
  /** The MSM home; the copies are made below it in {@link PLAIN_WORLDS_DIR}. */
  msmHome: string;
  /** A fresh work folder id (tests); a random UUID by default. */
  newId?(): string;
}

/**
 * The world folder a map gets in the Plain instance: its name with the characters a world
 * folder cannot hold made `_`, trimmed, at most 128 characters; `map` when nothing usable is left.
 */
export function plainWorldFolder(name: string): string {
  const cleaned = name
    .replace(/[^A-Za-z0-9 ._()'+-]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[^A-Za-z0-9_(]+/, '')
    .slice(0, 128)
    .replace(/[^A-Za-z0-9_)]+$/, '');
  return isWorldFolderName(cleaned) ? cleaned : 'map';
}

/** Creates the Plain instance's world copier. */
export function createPlainWorlds(deps: PlainWorldsDeps): PlainWorlds {
  const workRoot = join(deps.msmHome, PLAIN_WORLDS_DIR);
  const newId = deps.newId ?? (() => randomUUID());
  return {
    locate: (targetId, sourceId, worldDir) => deps.maps.locateWorld(targetId, sourceId, worldDir),

    async prepare(request) {
      if (!isWorldFolderName(request.folder)) {
        throw new Error(`${JSON.stringify(request.folder)} is not a world folder name.`);
      }
      const work = join(workRoot, newId());
      const dispose = async (): Promise<void> => {
        await rm(work, { recursive: true, force: true });
      };
      await mkdir(work, { recursive: true });
      try {
        const source = join(work, request.folder);
        const copy = await deps.maps.copyWorld(
          {
            targetId: request.targetId,
            sourceId: request.sourceId,
            worldDir: request.worldDir,
            keepPlayerData: request.keepPlayerData,
            dataPack: request.dataPack,
            resourcePack: request.resourcePack,
          },
          source,
        );
        return { folder: request.folder, source, leftOut: copy.leftOut, dispose };
      } catch (error) {
        await dispose().catch(() => {});
        throw error;
      }
    },
  };
}
