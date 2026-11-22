/**
 * The resolved biome parameter lists of vanilla's `multi_noise` presets (ADR 0119 D4, reserve
 * B592). The jar holds only a preset name for the overworld and the Nether (B574 WS9), so without
 * these lists the live world generation preview draws their land in one biome colour (limit WL7).
 * The runtime's dev mode writes them, from vanilla's own accessor on the user's machine, into the
 * managed Play instance when its test game starts (`msm_runtime`'s `DevBiomeLists`:
 * `<gameDir>/msm-dev/biome-lists.json`), and this reads that file as a save is read: read only,
 * through real paths that must stay inside the instance's game folder, with a size limit, every
 * value checked. The lists are never shipped, exported, committed, written into a project or
 * sent to the AI helper: they go only into the preview's answer (`readWorldgenFiles`).
 *
 * File format 1 (written by the runtime):
 *
 * ```json
 * { "format": 1, "minecraftVersion": "<the game's version id>",
 *   "presets": { "minecraft:overworld": { "biomes": [ids], "points": [[biome, 12 bounds, offset], ...] }, ... } }
 * ```
 *
 * A point is the index of its biome in `biomes`, then min and max of temperature, humidity,
 * continentalness, erosion, depth and weirdness, then the offset, all as the game's quantized whole
 * numbers (the data pack value times 10,000). `@msm/terrain`'s `resolvePreset` turns them into a
 * `multi_noise` source's points.
 *
 * @packageDocumentation
 */

import { readFile, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { isPathInside } from '@msm/interop';
import type { ResolvedBiomeListsView, ResolvedBiomeListView } from '../../shared/platform';

/** The file's folder in the game folder (the dev session folder, `@msm/interop`'s `msm-dev`). */
export const BIOME_LISTS_FOLDER = 'msm-dev';
/** The file's name in {@link BIOME_LISTS_FOLDER}. */
export const BIOME_LISTS_FILE = 'biome-lists.json';
/** The only format read. */
export const BIOME_LISTS_FORMAT = 1;
/** A larger file is not read (vanilla's lists take about 0.5 MB). */
export const BIOME_LISTS_MAX_BYTES = 8 * 1024 * 1024;
/** At most this many presets and points in a list. */
const MAX_PRESETS = 16;
const MAX_POINTS = 100_000;
const MAX_BIOMES = 1024;
/** Numbers in a point: the biome index, six min and max pairs, the offset. */
const POINT_LENGTH = 14;
/** A biome or preset id (`namespace:path`). */
const ID = /^[a-z0-9_.-]{1,64}:[a-z0-9_./-]{1,256}$/;
/** Quantized climate values stay far inside this (the game's range is about ±2 × 10,000). */
const MAX_VALUE = 10_000_000;

/** What {@link readResolvedBiomeLists} is given. */
export interface ResolvedBiomeListsRequest {
  /** The installed version the lists must belong to (the target's `mcVersion`). */
  mcVersion: string;
  /** The managed Play instance's game folder, when Play has reported it (ADR 0084); else `null`. */
  managedGameDir: string | null;
}

/**
 * The resolved lists by preset id for `request.mcVersion`, or `null` when there are none (no
 * Play yet, another version, an unreadable or malformed file). Never throws, never writes.
 */
export async function readResolvedBiomeLists(
  request: ResolvedBiomeListsRequest,
): Promise<ResolvedBiomeListsView | null> {
  if (request.managedGameDir === null) return null;
  try {
    const gameDir = await realpath(request.managedGameDir);
    const file = await realpath(join(gameDir, BIOME_LISTS_FOLDER, BIOME_LISTS_FILE));
    if (!isPathInside(gameDir, file)) return null;
    const info = await stat(file);
    if (!info.isFile() || info.size > BIOME_LISTS_MAX_BYTES) return null;
    return parseResolvedBiomeLists(await readFile(file, 'utf8'), request.mcVersion);
  } catch {
    return null; // No file yet (no Play), or it cannot be read: WL7 stands.
  }
}

/** The lists in `text` when it is a well-formed file of format 1 for `mcVersion`, else `null`. */
export function parseResolvedBiomeLists(
  text: string,
  mcVersion: string,
): ResolvedBiomeListsView | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(json) || json.format !== BIOME_LISTS_FORMAT) return null;
  if (json.minecraftVersion !== mcVersion || !isRecord(json.presets)) return null;
  const entries = Object.entries(json.presets);
  if (entries.length === 0 || entries.length > MAX_PRESETS) return null;
  const out: Record<string, ResolvedBiomeListView> = {};
  for (const [id, value] of entries) {
    if (!ID.test(id)) return null;
    const list = parseList(value);
    if (list === null) return null;
    out[id] = list;
  }
  return out;
}

function parseList(value: unknown): ResolvedBiomeListView | null {
  if (!isRecord(value)) return null;
  const { biomes, points } = value;
  if (!Array.isArray(biomes) || biomes.length === 0 || biomes.length > MAX_BIOMES) return null;
  if (!biomes.every((id) => typeof id === 'string' && ID.test(id))) return null;
  if (!Array.isArray(points) || points.length === 0 || points.length > MAX_POINTS) return null;
  for (const point of points) {
    if (!Array.isArray(point) || point.length !== POINT_LENGTH) return null;
    for (let i = 0; i < POINT_LENGTH; i += 1) {
      const n = point[i];
      if (typeof n !== 'number' || !Number.isInteger(n) || Math.abs(n) > MAX_VALUE) return null;
    }
    if ((point[0] as number) < 0 || (point[0] as number) >= biomes.length) return null;
  }
  return { biomes: biomes as string[], points: points as number[][] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
