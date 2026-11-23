/**
 * Trim colours (ADR 0121 D5, the spike B619's 3S5): a trim pattern's layer picture is coloured by
 * swapping its key colours for the material's palette. The key is the palette the layer's
 * `.png.mcmeta` names (`palette.base_palette`; vanilla's is `trim_base`, eight greys),
 * read in file order: a pixel at key colour i takes palette colour i. Colours outside the key pass
 * unchanged; a layer without the `.mcmeta` key is drawn as it is. The palette is the material's
 * `palette_id`, unless the armour's equipment asset swaps it through `trim_overrides` for that
 * material (vanilla iron armour wears `trim/iron_darker` for iron trims). A half-clear pattern
 * pixel shows fully (the game draws trims cut out).
 */

import type { Json } from '@msm/plugin-api';
import { blankPixels, type Pixels, type Rgb } from '../banner/pixels';
import { splitId } from '../particle/look-pictures';

const recordOf = (value: Json | undefined): Record<string, Json> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;

/** The two layers a trim pattern draws (helmet, chestplate and boots; leggings). */
export type TrimLayer = 'humanoid' | 'humanoid_leggings';
export const TRIM_LAYERS: readonly TrimLayer[] = ['humanoid', 'humanoid_leggings'];

/** The jar path of a trim pattern's layer picture (`textures/trims/entity/<layer>/<path>.png`). */
export function trimLayerPath(assetId: string, layer: TrimLayer, textures = 'textures'): string {
  const { namespace, path } = splitId(assetId);
  return `assets/${namespace}/${textures}/trims/entity/${layer}/${path}.png`;
}

/** The jar path of a palette picture (`textures/palettes/<path>.png`). */
export function palettePath(paletteId: string, textures = 'textures'): string {
  const { namespace, path } = splitId(paletteId);
  return `assets/${namespace}/${textures}/palettes/${path}.png`;
}

/** The key palette a layer's `.png.mcmeta` names (`palette.base_palette`), or `null`. */
export function keyPaletteOf(mcmeta: Json | undefined): string | null {
  const key = recordOf(recordOf(mcmeta)?.palette)?.base_palette;
  return typeof key === 'string' && key !== '' ? key : null;
}

/** The palette a material names: `palette_id`, or `null`. */
export function materialPaletteId(material: Json | undefined): string | null {
  const id = recordOf(material)?.palette_id;
  return typeof id === 'string' && id !== '' ? id : null;
}

const sameId = (a: string, b: string): boolean => {
  const x = splitId(a);
  const y = splitId(b);
  return x.namespace === y.namespace && x.path === y.path;
};

/**
 * The palette a material shows in on an armour: the equipment's first `trim_overrides` entry
 * whose `when.material` is this material, else the material's own `palette_id`.
 */
export function trimPaletteId(
  materialId: string,
  material: Json | undefined,
  equipment: Json | undefined,
): { readonly id: string | null; readonly override: boolean } {
  const overrides = recordOf(equipment)?.trim_overrides;
  if (Array.isArray(overrides)) {
    for (const entry of overrides) {
      const object = recordOf(entry);
      const when = recordOf(object?.when)?.material;
      const palette = object?.palette;
      if (typeof when === 'string' && typeof palette === 'string' && sameId(when, materialId)) {
        return { id: palette, override: true };
      }
    }
  }
  return { id: materialPaletteId(material), override: false };
}

/** A palette picture's colours: its pixels in file order (row by row). */
export function paletteColours(picture: Pixels | null): Rgb[] {
  if (picture === null) return [];
  const out: Rgb[] = [];
  const d = picture.data;
  for (let i = 0; i + 3 < d.length; i += 4) out.push([d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0]);
  return out;
}

/** The game's cut-out line: a pixel at least this opaque is drawn fully. */
const CUTOUT_ALPHA = 26;

/**
 * The layer coloured: each pixel whose colour is key colour i becomes palette colour i (the first
 * match in file order; key colours beyond the palette's length stay), every other colour passes
 * unchanged; drawn pixels become fully opaque, nearly clear ones clear. With no key (or no
 * palette) only the cut-out applies.
 */
export function applyTrimPalette(
  pattern: Pixels,
  key: readonly Rgb[] | null,
  palette: readonly Rgb[] | null,
): Pixels {
  const out = blankPixels(pattern.width, pattern.height);
  const lookup = new Map<number, Rgb>();
  if (key !== null && palette !== null) {
    key.forEach((colour, index) => {
      const code = (colour[0] << 16) | (colour[1] << 8) | colour[2];
      const swapped = palette[index];
      if (swapped !== undefined && !lookup.has(code)) lookup.set(code, swapped);
    });
  }
  const s = pattern.data;
  const d = out.data;
  for (let i = 0; i + 3 < s.length; i += 4) {
    if ((s[i + 3] ?? 0) < CUTOUT_ALPHA) continue;
    const rgb: Rgb = [s[i] ?? 0, s[i + 1] ?? 0, s[i + 2] ?? 0];
    const swapped = lookup.get((rgb[0] << 16) | (rgb[1] << 8) | rgb[2]) ?? rgb;
    d[i] = swapped[0];
    d[i + 1] = swapped[1];
    d[i + 2] = swapped[2];
    d[i + 3] = 255;
  }
  return out;
}
