/**
 * Colours of the live world map (ADR 0119 D7; B582): biomes as the climate map picks them (a
 * project biome's own grass or sky colour, else a stable colour from its id), the height of the
 * land as shading (water blue by depth, land from green to brown to white, lit from the
 * north-west), and blocks in a side cut as Try it draws them without the client jar (MSM's own
 * colours, `fallback-colours.ts`). No DOM: the painters fill RGBA arrays a canvas puts as they are.
 */

import type { Project } from '@msm/plugin-api';
import { biomeColour, projectBiomes, projectSkyColourAttribute } from '../preview/climate';
import { fallbackLook } from '../tryit/render/fallback-colours';

/** An RGB colour, 0..255 each. */
export type Rgb = readonly [number, number, number];

/** Pixels outside what the engine has answered yet: a neutral grey. */
export const UNKNOWN: Rgb = [128, 128, 128];

/** `#rrggbb` as RGB. */
export function rgbOf(hex: string): Rgb {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/** Picks a biome's colour; made once per project. */
export type BiomeColours = (id: string) => Rgb;

/** The colours of the project's biomes and everyone else's, as the climate map picks them. */
export function biomeColoursOf(project: Project): BiomeColours {
  const biomes = projectBiomes(project);
  const sky = projectSkyColourAttribute(project);
  const known = new Map<string, Rgb>();
  return (id) => {
    let colour = known.get(id);
    if (colour === undefined) {
      const full = id.includes(':') ? id : `minecraft:${id}`;
      colour = rgbOf(biomeColour(full, biomes.get(full), sky));
      known.set(id, colour);
    }
    return colour;
  };
}

/** A colour moved towards the panel's grey (other biomes while one is lit). */
export function dim(colour: Rgb, amount = 0.7): Rgb {
  return [
    Math.round(colour[0] + (96 - colour[0]) * amount),
    Math.round(colour[1] + (96 - colour[1]) * amount),
    Math.round(colour[2] + (96 - colour[2]) * amount),
  ];
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const DEEP_WATER: Rgb = [24, 52, 120];
const SHALLOW_WATER: Rgb = [70, 130, 200];
const SHORE: Rgb = [196, 190, 120];
const LOWLAND: Rgb = [92, 150, 62];
const HILLS: Rgb = [128, 110, 70];
const PEAKS: Rgb = [236, 236, 240];

/**
 * The colour of land `height` blocks high (the top solid block's y), before shading: under the
 * sea level water from deep to shallow, above it shore, lowland, hills and white peaks over the
 * world's range up to `top`.
 */
export function heightColour(height: number, seaLevel: number, minY: number, top: number): Rgb {
  if (height < seaLevel) {
    const depth = clamp01((seaLevel - height) / Math.max(1, Math.min(64, seaLevel - minY)));
    return mix(SHALLOW_WATER, DEEP_WATER, depth);
  }
  const above = height - seaLevel;
  const span = Math.max(16, top - seaLevel);
  const t = clamp01(above / span);
  if (above <= 2) return SHORE;
  if (t < 0.25) return mix(LOWLAND, HILLS, t / 0.25);
  return mix(HILLS, PEAKS, (t - 0.25) / 0.75);
}

/** A grid of samples the painters read: `columns` by `rows`, row-major from the north-west. */
export interface SampleGrid {
  readonly columns: number;
  readonly rows: number;
}

/**
 * The shade of each height sample: the land lit from the north-west, so slopes facing it are
 * brighter. Returns one factor per sample, about 0.7 to 1.3.
 */
export function hillShade(
  heights: Int16Array,
  grid: SampleGrid,
  step: number,
  rowDone?: Uint8Array,
): Float32Array {
  const { columns, rows } = grid;
  const out = new Float32Array(columns * rows);
  for (let r = 0; r < rows; r += 1) {
    if (rowDone !== undefined && rowDone[r] !== 1) continue;
    const self = (c: number): number => heights[r * columns + c] ?? 0;
    // A neighbour outside the grid, or in a row not known yet, counts as level ground.
    const at = (c: number, rr: number, fallback: number): number => {
      if (rr < 0 || rr >= rows || (rowDone !== undefined && rowDone[rr] !== 1)) return fallback;
      return heights[rr * columns + Math.min(columns - 1, Math.max(0, c))] ?? fallback;
    };
    for (let c = 0; c < columns; c += 1) {
      const h = self(c);
      const slope =
        (at(c - 1, r, h) - at(c + 1, r, h) + at(c, r - 1, h) - at(c, r + 1, h)) / (4 * step);
      out[r * columns + c] = 1 + Math.max(-0.3, Math.min(0.3, slope * 0.6));
    }
  }
  return out;
}

/** A colour scaled by a shade factor. */
export function shade(colour: Rgb, factor: number): Rgb {
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(v * factor)));
  return [f(colour[0]), f(colour[1]), f(colour[2])];
}

const blockColours = new Map<string, Rgb | null>();

/**
 * A block's colour in a side cut (its side face) or from above (its top face), from MSM's own
 * colours; `null` for air, which the cut leaves as sky.
 */
export function blockColour(id: string, face: 'side' | 'top' = 'side'): Rgb | null {
  const key = `${face} ${id}`;
  if (blockColours.has(key)) return blockColours.get(key) ?? null;
  const path = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  let colour: Rgb | null;
  if (path === 'air' || path === 'cave_air' || path === 'void_air') colour = null;
  else {
    const look = fallbackLook(id);
    const rgba = face === 'top' ? look.top : look.side;
    colour = [rgba[0], rgba[1], rgba[2]];
  }
  blockColours.set(key, colour);
  return colour;
}

/** The sky behind a side cut. */
export const SKY: Rgb = [178, 206, 236];

/**
 * One grid of colours laid on the map: `columns` by `rows` samples, one every `step` blocks from
 * `(x0, z0)`, three bytes a sample; rows with `rowDone[row] !== 1` are not known yet and show the
 * layer below.
 */
export interface PaintLayer {
  readonly x0: number;
  readonly z0: number;
  readonly step: number;
  readonly columns: number;
  readonly rows: number;
  readonly rgb: Uint8Array;
  readonly rowDone?: Uint8Array;
}

/** The sample of a layer under block `(x, z)`, or -1 when the layer has none there. */
export function layerIndex(layer: PaintLayer, x: number, z: number): number {
  const column = Math.floor((x - layer.x0) / layer.step);
  const row = Math.floor((z - layer.z0) / layer.step);
  if (column < 0 || row < 0 || column >= layer.columns || row >= layer.rows) return -1;
  if (layer.rowDone !== undefined && layer.rowDone[row] !== 1) return -1;
  return row * layer.columns + column;
}

/** Where the map's pixels are: the block at pixel (0, 0)'s north-west corner, and blocks a pixel. */
export interface Viewport {
  readonly left: number;
  readonly top: number;
  readonly zoom: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The map's RGBA pixels from its layers, the last layer on top: each pixel takes the colour of
 * the topmost layer that has a sample under its centre, else {@link UNKNOWN}.
 */
export function paintLayers(layers: readonly PaintLayer[], viewport: Viewport): Uint8ClampedArray {
  const { left, top, zoom, width, height } = viewport;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let py = 0; py < height; py += 1) {
    const z = top + py * zoom + zoom / 2;
    for (let px = 0; px < width; px += 1) {
      const x = left + px * zoom + zoom / 2;
      let colour: Rgb = UNKNOWN;
      for (let i = layers.length - 1; i >= 0; i -= 1) {
        const layer = layers[i] as PaintLayer;
        const index = layerIndex(layer, x, z);
        if (index < 0) continue;
        colour = [
          layer.rgb[index * 3] ?? 0,
          layer.rgb[index * 3 + 1] ?? 0,
          layer.rgb[index * 3 + 2] ?? 0,
        ];
        break;
      }
      const o = (py * width + px) * 4;
      out[o] = colour[0];
      out[o + 1] = colour[1];
      out[o + 2] = colour[2];
      out[o + 3] = 255;
    }
  }
  return out;
}
