/**
 * The engine's presets seam (ADR 0119 D3, D4; reserve B592): the biome points of vanilla's
 * `multi_noise` presets (`minecraft:overworld`, `minecraft:nether`). The jar holds only their
 * names (spike B574, WS9); the runtime's dev mode writes the resolved lists into the managed Play
 * instance on the user's machine, the app reads them and lays them into the vanilla files under
 * {@link RESOLVED_BIOME_LISTS_FOLDER}, one entry per preset id:
 *
 * ```json
 * { "biomes": ["minecraft:badlands", ...],
 *   "points": [[biome, tMin, tMax, hMin, hMax, cMin, cMax, eMin, eMax, dMin, dMax, wMin, wMax, offset], ...] }
 * ```
 *
 * `biome` indexes `biomes`; the six climate parameters (temperature, humidity, continentalness,
 * erosion, depth, weirdness) and the offset are the game's quantized whole numbers (the data pack
 * value times 10,000). Without an entry the preset stays unknown and the world draws one biome
 * (limit WL7).
 */

import type { WorldgenFiles } from './api';

/** The folder key of the resolved lists in `WorldgenFiles.vanilla` (the app's `files.ts` writes it). */
export const RESOLVED_BIOME_LISTS_FOLDER = 'msm/resolved_biome_list';

/** The game's quantization of a climate value (`Climate.quantizeCoord`'s factor). */
const QUANTIZATION = 10_000;

/** Numbers in a point: the biome index, six min and max pairs, the offset. */
const POINT_LENGTH = 14;

/** One entry of a `multi_noise` biome source's `biomes`, as a data pack writes it. */
export interface BiomePoint {
  readonly biome: string;
  readonly parameters: {
    readonly temperature: readonly [number, number];
    readonly humidity: readonly [number, number];
    readonly continentalness: readonly [number, number];
    readonly erosion: readonly [number, number];
    readonly depth: readonly [number, number];
    readonly weirdness: readonly [number, number];
    readonly offset: number;
  };
}

/**
 * The biome points of a `multi_noise` preset (`minecraft:overworld`), in the list's order, as a
 * `multi_noise` source's `biomes`; `null` when the preset's resolved list is not in `files` (no
 * Play yet) or is not well formed.
 */
export function resolvePreset(files: WorldgenFiles, preset: string): BiomePoint[] | null {
  const entry = files.vanilla?.[RESOLVED_BIOME_LISTS_FOLDER]?.[preset];
  if (typeof entry !== 'object' || entry === null) return null;
  const { biomes, points } = entry as { biomes?: unknown; points?: unknown };
  if (!Array.isArray(biomes) || !biomes.every((id) => typeof id === 'string')) return null;
  if (!Array.isArray(points) || points.length === 0) return null;
  const out: BiomePoint[] = [];
  for (const point of points) {
    if (!Array.isArray(point) || point.length !== POINT_LENGTH) return null;
    if (!point.every((n) => typeof n === 'number' && Number.isInteger(n))) return null;
    const biome = biomes[point[0] as number] as string | undefined;
    if (biome === undefined) return null;
    const span = (i: number): readonly [number, number] => [
      (point[i] as number) / QUANTIZATION,
      (point[i + 1] as number) / QUANTIZATION,
    ];
    out.push({
      biome,
      parameters: {
        temperature: span(1),
        humidity: span(3),
        continentalness: span(5),
        erosion: span(7),
        depth: span(9),
        weirdness: span(11),
        offset: (point[13] as number) / QUANTIZATION,
      },
    });
  }
  return out;
}
