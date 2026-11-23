/**
 * A banner's and a shield's picture from their layers (ADR 0121 D5, the spike B619's 3S6): the
 * base picture (the jar's `entity/banner/banner_base.png` or `entity/shield/shield_base.png`),
 * then the base colour layer, then each pattern, each layer its mask picture times its dye's
 * colour, alpha-blended over what is below, in list order. The dye colours are the target's
 * `TargetFacts.dyes` (B621). Without the jar MSM paints its own cloth and fills the base colour
 * over the whole flag or plate. The pole, bar and handle of B623's shapes sample `WOOD_TEXEL`,
 * which is painted MSM's own wood colour last.
 */

import type { TargetFacts } from '@msm/plugin-api';
import { WOOD_TEXEL } from '../bodies/shapes';
import {
  blankPixels,
  drawOver,
  fillRect,
  hexToRgb,
  type Pixels,
  type Rect,
  type Rgb,
  scalePixels,
} from './pixels';

/** Banner and shield pictures are 64 by 64 (B623's shapes). */
export const BANNER_PICTURE_SIZE = 64;

/** Which picture: a standing banner's or a shield's. */
export type BannerPictureKind = 'banner' | 'shield';

/** The flag's front in the banner layout, and the plate's front in the shield layout. */
export const FRONT: Readonly<Record<BannerPictureKind, Rect>> = {
  banner: [1, 1, 20, 40],
  shield: [1, 1, 12, 22],
};

/** The texels the flag's or plate's box covers (front, back, edges), for MSM's stand-in. */
const CLOTH_AREA: Readonly<Record<BannerPictureKind, Rect>> = {
  banner: [0, 0, 42, 41],
  shield: [0, 0, 26, 23],
};

/** MSM's own colours: the cloth under the layers without the jar, and the wood. */
const STAND_IN_CLOTH: readonly [number, number, number, number] = [226, 224, 216, 255];
export const WOOD_COLOUR: readonly [number, number, number, number] = [137, 101, 62, 255];

/** The pattern colour and the banner colour a view starts with. */
export const DEFAULT_PATTERN_DYE = 'black';
export const DEFAULT_BASE_DYE = 'white';

/** One layer: its mask picture (`null`: the whole flag, MSM's stand-in base) and its dye. */
export interface BannerLayer {
  readonly mask: Pixels | null;
  readonly dye: Rgb;
}

/** The dye names of the target, in the game's order (the facts' own names without `minecraft:`). */
export function dyeNames(facts: TargetFacts | null): readonly string[] {
  const order = (facts?.blocks?.dyeColours ?? []).map((name) => name.replace(/^minecraft:/, ''));
  const known = Object.keys(facts?.dyes ?? {});
  const named = order.filter((name) => known.includes(name));
  return [...named, ...known.filter((name) => !named.includes(name))];
}

/** A dye's colour from the target's facts, or `null` when the target does not know it. */
export function dyeRgb(facts: TargetFacts | null, name: string): Rgb | null {
  return hexToRgb(facts?.dyes?.[name.replace(/^minecraft:/, '')]);
}

/** A picture at the banner size (a larger or smaller pack picture is sampled to it). */
function atSize(picture: Pixels): Pixels {
  return picture.width === BANNER_PICTURE_SIZE && picture.height === BANNER_PICTURE_SIZE
    ? picture
    : scalePixels(picture, BANNER_PICTURE_SIZE, BANNER_PICTURE_SIZE);
}

/**
 * The 64 by 64 picture of a banner or shield: `base` (or MSM's cloth), then each layer, then the
 * wood texel. A layer whose mask is `null` covers the whole flag or plate.
 */
export function composeBannerPicture(
  kind: BannerPictureKind,
  base: Pixels | null,
  layers: readonly BannerLayer[],
): Pixels {
  const picture = blankPixels(BANNER_PICTURE_SIZE, BANNER_PICTURE_SIZE);
  if (base !== null) drawOver(picture, atSize(base));
  else fillRect(picture, CLOTH_AREA[kind], STAND_IN_CLOTH);
  for (const layer of layers) {
    if (layer.mask === null) fillRect(picture, CLOTH_AREA[kind], [...layer.dye, 255]);
    else drawOver(picture, atSize(layer.mask), { tint: layer.dye });
  }
  fillRect(picture, WOOD_TEXEL, WOOD_COLOUR);
  return picture;
}
