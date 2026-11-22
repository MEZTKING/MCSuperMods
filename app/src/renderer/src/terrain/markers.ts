/**
 * Structure start markers on the live world map (ADR 0119 D6, D7; limit WL5; B585): the chunks
 * where a structure of a `random_spread` structure set may start, worked out from the set's
 * placement by deepslate's `StructurePlacement` (exact in the spike: 136 of 136 starts, B574),
 * with its frequency, its frequency reduction and its exclusion zone. A marker says "may start
 * here": whether a structure really does is the game's (its biome check at the exact start, the
 * land, its pieces). Markers whose chunk centre lies in a biome none of the set's structures
 * accepts are left out when the view's biomes are known. `concentric_rings` (strongholds) and any
 * other placement are not marked, and the notes name them.
 *
 * This is no noise sampling (a few random numbers a region), so it runs on the main thread.
 */

import { StructurePlacement } from 'deepslate/worldgen';
import type { WorldgenFileMap } from './client';
import { withNamespace } from './hosts';
import { biomesNamed } from './views';

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** One place a structure may start. */
export interface StructureMarker {
  /** The structure set's id. */
  readonly set: string;
  /** The structures the set can place there (ids). */
  readonly structures: readonly string[];
  readonly chunkX: number;
  readonly chunkZ: number;
  /** The chunk's centre block. */
  readonly x: number;
  readonly z: number;
}

/** The markers of a region and the notes that say what was not marked. */
export interface MarkerResult {
  readonly markers: readonly StructureMarker[];
  readonly notes: readonly string[];
}

/** At most this many markers a view (a set with a tiny spacing would mark every chunk). */
export const MAX_MARKERS = 1500;

/** The words that say what a marker means (plan, limit WL5). */
export const MARKER_WORDS =
  "Markers show where a structure may start; whether it does is the game's (its exact biome check, the land and its pieces).";

/** What {@link structureMarkers} reads. */
export interface MarkerInput {
  readonly project: WorldgenFileMap;
  readonly vanilla: WorldgenFileMap | null;
  /** The world's seed (`WorldSummary.seed`). */
  readonly seed: bigint;
  /** The region in blocks. */
  readonly region: {
    readonly x0: number;
    readonly z0: number;
    readonly width: number;
    readonly depth: number;
  };
  /**
   * The biome at a block, when the view has sampled it; `undefined` where it has not. Leave it
   * out when the world's biomes are not known (WL7): markers are then not checked by biome.
   */
  readonly biomeAt?: (x: number, z: number) => string | undefined;
}

/** A placement and the set it belongs to, made once per JSON value. */
interface Placement {
  readonly placement: StructurePlacement;
  readonly spacing: number;
  readonly exclusion: { readonly other: string; readonly chunks: number } | null;
}

const placements = new WeakMap<object, Placement | null>();

/** A `random_spread` placement of a set's JSON, or `null` for any other type. */
function placementOf(set: Json): Placement | null {
  const json = set.placement;
  if (!isObject(json)) return null;
  const known = placements.get(json);
  if (known !== undefined) return known;
  let made: Placement | null = null;
  if (typeOf(json) === 'random_spread') {
    // The exclusion zone is checked here, against the files' other set (deepslate's reads its
    // own static registry, which this view does not fill).
    const { exclusion_zone: zone, ...rest } = json;
    const placement = StructurePlacement.fromJson(rest);
    const spacing = typeof json.spacing === 'number' ? Math.max(1, Math.floor(json.spacing)) : 1;
    made = {
      placement,
      spacing,
      exclusion:
        isObject(zone) && typeof zone.other_set === 'string'
          ? {
              other: withNamespace(zone.other_set),
              chunks: typeof zone.chunk_count === 'number' ? zone.chunk_count : 1,
            }
          : null,
    };
  }
  placements.set(json, made);
  return made;
}

function typeOf(placement: Json): string {
  return typeof placement.type === 'string' ? placement.type.replace(/^minecraft:/, '') : '';
}

/** Every structure set of the files, vanilla's with the project's laid over them. */
export function structureSets(
  project: WorldgenFileMap,
  vanilla: WorldgenFileMap | null,
): Map<string, Json> {
  const out = new Map<string, Json>();
  for (const files of [vanilla?.['worldgen/structure_set'], project['worldgen/structure_set']]) {
    for (const [id, json] of Object.entries(files ?? {})) {
      if (isObject(json)) out.set(withNamespace(id), json);
    }
  }
  return out;
}

/** The structures a set names, in its order. */
function structuresOf(set: Json): string[] {
  const list = Array.isArray(set.structures) ? set.structures : [];
  return list
    .map((entry) => (isObject(entry) ? entry.structure : undefined))
    .filter((id): id is string => typeof id === 'string')
    .map(withNamespace);
}

/** A set's name for people: its path, with spaces (`minecraft:villages` reads "villages"). */
export function setName(id: string): string {
  const path = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  return path.replace(/[_/]/g, ' ');
}

/** Whether the other set of an exclusion zone has a start within `chunks` of a chunk. */
function excluded(
  other: Placement,
  seed: bigint,
  chunkX: number,
  chunkZ: number,
  chunks: number,
): boolean {
  const placement = other.placement as StructurePlacement & {
    getPotentialStructureChunks(
      seed: bigint,
      minX: number,
      minZ: number,
      maxX: number,
      maxZ: number,
    ): [number, number][];
  };
  return placement
    .getPotentialStructureChunks(
      seed,
      chunkX - chunks,
      chunkZ - chunks,
      chunkX + chunks,
      chunkZ + chunks,
    )
    .some(
      ([x, z]) =>
        Math.abs(x - chunkX) <= chunks &&
        Math.abs(z - chunkZ) <= chunks &&
        placement.isStructureChunk(seed, x, z),
    );
}

/** The markers of a region; see the module comment. */
export function structureMarkers(input: MarkerInput): MarkerResult {
  const sets = structureSets(input.project, input.vanilla);
  const file = (folder: string, id: string): unknown =>
    input.project[folder]?.[id] ?? input.vanilla?.[folder]?.[id];
  const notes: string[] = [];
  const markers: StructureMarker[] = [];
  const { x0, z0, width, depth } = input.region;
  const minX = Math.floor(x0 / 16);
  const minZ = Math.floor(z0 / 16);
  const maxX = Math.floor((x0 + width - 1) / 16);
  const maxZ = Math.floor((z0 + depth - 1) / 16);
  const unmarked = new Map<string, string[]>();
  let tooMany = false;
  for (const [id, set] of [...sets].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const placement = placementOf(set);
    if (placement === null) {
      const type = isObject(set.placement) ? typeOf(set.placement) || 'unknown' : 'unknown';
      unmarked.set(type, [...(unmarked.get(type) ?? []), setName(id)]);
      continue;
    }
    const structures = structuresOf(set);
    // The biomes any of the set's structures accepts; `null` when a structure says nothing.
    let accepted: Set<string> | null = new Set();
    for (const structure of structures) {
      const json = file('worldgen/structure', structure);
      if (!isObject(json) || json.biomes === undefined) {
        accepted = null;
        break;
      }
      for (const biome of biomesNamed(json.biomes, file)) accepted.add(biome);
    }
    const other =
      placement.exclusion === null ? null : (sets.get(placement.exclusion.other) ?? null);
    const otherPlacement = other === null ? null : placementOf(other);
    const potential = (
      placement.placement as StructurePlacement & {
        getPotentialStructureChunks(
          seed: bigint,
          minX: number,
          minZ: number,
          maxX: number,
          maxZ: number,
        ): [number, number][];
      }
    ).getPotentialStructureChunks(input.seed, minX, minZ, maxX, maxZ);
    for (const [chunkX, chunkZ] of potential) {
      if (chunkX < minX || chunkX > maxX || chunkZ < minZ || chunkZ > maxZ) continue;
      if (!placement.placement.isStructureChunk(input.seed, chunkX, chunkZ)) continue;
      if (
        placement.exclusion !== null &&
        otherPlacement !== null &&
        excluded(otherPlacement, input.seed, chunkX, chunkZ, placement.exclusion.chunks)
      ) {
        continue;
      }
      const x = chunkX * 16 + 8;
      const z = chunkZ * 16 + 8;
      if (accepted !== null && input.biomeAt !== undefined) {
        const biome = input.biomeAt(x, z);
        if (biome !== undefined && !accepted.has(withNamespace(biome))) continue;
      }
      if (markers.length >= MAX_MARKERS) {
        tooMany = true;
        break;
      }
      markers.push({ set: id, structures, chunkX, chunkZ, x, z });
    }
    if (placement.exclusion !== null && otherPlacement === null) {
      notes.push(
        `The ${setName(id)} keep away from ${setName(placement.exclusion.other)}, which the preview does not check here.`,
      );
    }
  }
  for (const [type, names] of unmarked) {
    notes.push(
      `Not marked: ${names.join(', ')} (placed by ${type.replace(/_/g, ' ')}, which the preview does not work out).`,
    );
  }
  if (tooMany)
    notes.push(`Only the first ${MAX_MARKERS} places are marked: zoom in to see them all.`);
  if (input.biomeAt === undefined) {
    notes.push(
      'The markers are not checked against biomes here, so some may stand where none can start.',
    );
  }
  return { markers, notes };
}

/** The marker nearest to block `(x, z)` within `reach` blocks, or `null`. */
export function markerNear(
  markers: readonly StructureMarker[],
  x: number,
  z: number,
  reach: number,
): StructureMarker | null {
  let best: StructureMarker | null = null;
  let bestDistance = reach * reach;
  for (const marker of markers) {
    const distance = (marker.x - x) ** 2 + (marker.z - z) ** 2;
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = marker;
    }
  }
  return best;
}
