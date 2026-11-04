/**
 * The climate map's model (ADR 0023): which multi-noise biome lists an element holds, which
 * biome wins at each point of a 2D slice through the six-parameter climate space, and the
 * colour each biome is drawn in. No vanilla data and no DOM: the nearest-entry search is
 * deepslate's `Climate.Parameters`, the same R-tree search the game uses.
 */

import type { Project } from '@msm/plugin-api';
import { Climate } from 'deepslate/worldgen';

/** The six climate parameters, in the order `Climate.target` takes them. */
export const CLIMATE_PARAMETERS = [
  'temperature',
  'humidity',
  'continentalness',
  'erosion',
  'depth',
  'weirdness',
] as const;

/** One climate parameter. */
export type ClimateParameter = (typeof CLIMATE_PARAMETERS)[number];

/** A value for every climate parameter. */
export type ClimatePoint = Record<ClimateParameter, number>;

/** One `biomes` entry of a `multi_noise` biome source. */
export interface ClimateEntry {
  biome: string;
  /** The raw `parameters` object; read with `Climate.ParamPoint.fromJson`. */
  parameters: unknown;
}

/** A `multi_noise` biome source with an explicit biome list. */
export interface ClimateSource {
  /** The dimension key for a world preset (`minecraft:overworld`), or `null` for a dimension. */
  dimension: string | null;
  entries: ClimateEntry[];
}

/** What an element offers the climate map. */
export interface ClimateSources {
  sources: ClimateSource[];
  /**
   * Why nothing can be mapped when `sources` is empty: for example a fixed biome source or a
   * `multi_noise` source that names a preset instead of listing biomes.
   */
  reason: string | null;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normaliseId = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

/** Reads the biome source of one dimension object. */
function readDimension(
  dimension: unknown,
  key: string | null,
): { source: ClimateSource | null; reason: string } {
  const generator = isObject(dimension) ? dimension.generator : undefined;
  const biomeSource = isObject(generator) ? generator.biome_source : undefined;
  if (!isObject(biomeSource)) {
    return { source: null, reason: 'The dimension has no biome source.' };
  }
  const type = typeof biomeSource.type === 'string' ? normaliseId(biomeSource.type) : '';
  if (type !== 'minecraft:multi_noise') {
    return {
      source: null,
      reason: `The biome source is ${type === '' ? 'not set' : type}; only multi_noise sources have a climate map.`,
    };
  }
  if (!Array.isArray(biomeSource.biomes)) {
    const preset = typeof biomeSource.preset === 'string' ? ` ${biomeSource.preset}` : '';
    return {
      source: null,
      reason: `The biome source uses the preset${preset}; list the biomes explicitly to see them here.`,
    };
  }
  const entries: ClimateEntry[] = [];
  for (const entry of biomeSource.biomes) {
    if (isObject(entry) && typeof entry.biome === 'string' && isObject(entry.parameters)) {
      entries.push({ biome: normaliseId(entry.biome), parameters: entry.parameters });
    }
  }
  if (entries.length === 0) {
    return { source: null, reason: 'The biome list is empty.' };
  }
  return { source: { dimension: key, entries }, reason: '' };
}

/**
 * The multi-noise biome lists of a `minecraft:dimension` element, or of every dimension of a
 * `minecraft:worldgen/world_preset` element (the overworld first, then by key).
 */
export function climateSources(data: unknown): ClimateSources {
  if (isObject(data) && isObject(data.dimensions)) {
    const keys = Object.keys(data.dimensions).sort((a, b) => {
      const rank = (key: string): number => (normaliseId(key) === 'minecraft:overworld' ? 0 : 1);
      return rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);
    });
    const sources: ClimateSource[] = [];
    let reason: string | null = null;
    for (const key of keys) {
      const read = readDimension(data.dimensions[key], key);
      if (read.source !== null) sources.push(read.source);
      else reason ??= `${key}: ${read.reason}`;
    }
    return sources.length > 0 ? { sources, reason: null } : { sources, reason };
  }
  const read = readDimension(data, null);
  return read.source === null
    ? { sources: [], reason: read.reason }
    : { sources: [read.source], reason: null };
}

/** A nearest-entry search over one biome list. */
export interface ClimateIndex {
  /** The biome at `point`. */
  find(point: ClimatePoint): string;
}

/** Builds the search with deepslate's `Climate.Parameters` (ties go to the lower `offset`). */
export function climateIndex(entries: readonly ClimateEntry[]): ClimateIndex {
  const parameters = new Climate.Parameters<string>(
    entries.map((entry) => [Climate.ParamPoint.fromJson(entry.parameters), () => entry.biome]),
  );
  return {
    find: (point) =>
      parameters.find(
        Climate.target(
          point.temperature,
          point.humidity,
          point.continentalness,
          point.erosion,
          point.depth,
          point.weirdness,
        ),
      ),
  };
}

/** Options for {@link climateGrid}. */
export interface ClimateGridOptions {
  /** The parameter along the horizontal axis (left to right, low to high). */
  x: ClimateParameter;
  /** The parameter along the vertical axis (bottom to top, low to high). */
  y: ClimateParameter;
  /** Values of the other parameters (the `x` and `y` values here are ignored). */
  fixed: ClimatePoint;
  /** Cells per axis. */
  resolution: number;
  /** The range of both axes (default `[-1, 1]`). */
  range?: readonly [number, number];
}

/** The axis value at the centre of cell `i` of `resolution`. */
export function cellValue(i: number, resolution: number, range: readonly [number, number]): number {
  const [min, max] = range;
  return min + ((i + 0.5) / resolution) * (max - min);
}

/**
 * The biome of every cell of the slice, row by row from the top (highest `y`) row, left to
 * right within a row.
 */
export function climateGrid(index: ClimateIndex, options: ClimateGridOptions): string[] {
  const { x, y, fixed, resolution } = options;
  const range = options.range ?? [-1, 1];
  const cells: string[] = [];
  for (let row = 0; row < resolution; row += 1) {
    const yValue = cellValue(resolution - 1 - row, resolution, range);
    for (let column = 0; column < resolution; column += 1) {
      cells.push(index.find({ ...fixed, [y]: yValue, [x]: cellValue(column, resolution, range) }));
    }
  }
  return cells;
}

/** An integer RGB colour or a `#rrggbb` string as `#rrggbb`, or `null`. */
function colourOf(value: unknown): string | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff) {
    return `#${value.toString(16).padStart(6, '0')}`;
  }
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  return null;
}

/**
 * A stable colour for `id`: a 32-bit FNV-1a hash picks the hue, with fixed saturation and
 * lightness so neighbouring biomes stay distinguishable.
 */
export function hashColour(id: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const hue = hash % 360;
  const saturation = 0.55;
  const lightness = 0.55;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const second = chroma * (1 - Math.abs((segment % 2) - 1));
  const [r, g, b] =
    segment < 1
      ? [chroma, second, 0]
      : segment < 2
        ? [second, chroma, 0]
        : segment < 3
          ? [0, chroma, second]
          : segment < 4
            ? [0, second, chroma]
            : segment < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];
  const m = lightness - chroma / 2;
  const hex = (v: number): string =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** The kind id of project biomes. */
const BIOME_KIND = 'minecraft:worldgen/biome';

/**
 * The colour a biome is drawn in: from the project biome of that id, its `effects.grass_color`,
 * else its sky colour (the `minecraft:visual/sky_color` attribute, or `effects.sky_color` in
 * older formats); otherwise, and for biomes not in the project, {@link hashColour}.
 */
export function biomeColour(id: string, biome: unknown): string {
  if (isObject(biome)) {
    const effects = isObject(biome.effects) ? biome.effects : {};
    const attributes = isObject(biome.attributes) ? biome.attributes : {};
    const colour =
      colourOf(effects.grass_color) ??
      colourOf(attributes['minecraft:visual/sky_color']) ??
      colourOf(effects.sky_color);
    if (colour !== null) return colour;
  }
  return hashColour(normaliseId(id));
}

/** The data of every project biome, by normalised id. */
export function projectBiomes(project: Project): Map<string, unknown> {
  const biomes = new Map<string, unknown>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind === BIOME_KIND) biomes.set(normaliseId(element.id), element.data);
    }
  }
  return biomes;
}
