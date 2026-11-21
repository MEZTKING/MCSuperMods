/**
 * Materials of the vanilla-style generator (ADR 0092 D8): the style's hue shift, the base
 * colours of the parts a recipe adds by itself (handle wood, stone, deepslate, pastry, leaves)
 * and the ramps every recipe draws from. All values are original and tuned by eye; nothing here
 * comes from a Minecraft texture.
 *
 * @packageDocumentation
 */

import type { Rgb } from '../assets/png';
import { oklchToRgb, rgbToOklch } from './colour';
import { generateRamp, type ShadeStep, shadeOf, squeezeFor } from './ramp';

/**
 * The hue shift of the drawn pictures, in degrees at the ends of a ramp (ADR 0092 D8): chosen
 * by eye on the contact sheet between 10 and 16 (B491). The low-level {@link generateRamp}
 * keeps its own default of 16, which the vanilla parity pictures (B459) are drawn with.
 */
export const ART_HUE_SHIFT = 12;

/** The default leaf colour (leaves of a fruit, foliage). */
export const LEAF_GREEN: Rgb = Object.freeze([78, 132, 44]) as Rgb;

/** Handle wood: every handle, grip and stem shares this one ramp (ADR 0092 D8). */
export const HANDLE_BROWN: Rgb = Object.freeze([128, 94, 52]) as Rgb;

/** The stone an ore sits in. */
export const STONE_GREY: Rgb = Object.freeze([124, 124, 126]) as Rgb;

/** The deepslate a deepslate ore sits in. */
export const DEEPSLATE_GREY: Rgb = Object.freeze([82, 82, 90]) as Rgb;

/** Pastry crust. */
export const CRUST: Rgb = Object.freeze([214, 158, 92]) as Rgb;

/** A ramp of shades, darkest first. */
export type Ramp = readonly Rgb[];

/** Gentle five-shade steps for stone: low contrast, as on vanilla-style blocks. */
export const STONE_STEPS: readonly ShadeStep[] = Object.freeze([
  { lightness: -0.14, chroma: 1 },
  { lightness: -0.065, chroma: 1 },
  { lightness: 0, chroma: 1 },
  { lightness: 0.055, chroma: 0.9 },
  { lightness: 0.105, chroma: 0.8 },
]);

/** Five-shade steps for boards and cut wood, as offsets from the wood's colour. */
export const WOOD_STEPS: readonly ShadeStep[] = Object.freeze([
  { lightness: -0.17, chroma: 1.05 },
  { lightness: -0.08, chroma: 1.02 },
  { lightness: 0, chroma: 1 },
  { lightness: 0.06, chroma: 0.95 },
  { lightness: 0.11, chroma: 0.85 },
]);

/** Bark: the wood's steps 0.13 darker and duller, on the same ramp as the wood. */
export const BARK_STEPS: readonly ShadeStep[] = Object.freeze(
  WOOD_STEPS.map((step) => ({ lightness: step.lightness - 0.13, chroma: step.chroma * 0.8 })),
);

/**
 * Shades of `colour` at fixed offsets from it, all on one ramp: the same squeeze (from
 * `family`, every offset the ramp's materials use) and the same hue lean per offset (`span`,
 * the offset that leans by the whole hue shift), so the shades of two materials drawn from one
 * colour (wood and its bark) never disagree on which is warmer.
 */
function familyRamp(
  colour: Rgb,
  steps: readonly ShadeStep[],
  family: readonly number[],
  span: number,
  hueShift: number,
): Ramp {
  const squeeze = squeezeFor(rgbToOklch(colour)[0], family);
  const ramp = steps.map((step) =>
    shadeOf(colour, step, squeeze, Math.max(-1.5, Math.min(1.5, step.lightness / span)), hueShift),
  );
  for (let i = 1; i < ramp.length; i += 1) {
    const prev = ramp[i - 1] as Rgb;
    const cur = ramp[i] as Rgb;
    if (prev[0] === cur[0] && prev[1] === cur[1] && prev[2] === cur[2]) {
      const [l, c, h] = rgbToOklch(cur);
      ramp[i] = oklchToRgb([Math.min(1, l + 0.03), c, h]);
    }
  }
  return ramp;
}

const WOOD_FAMILY: readonly number[] = [...WOOD_STEPS, ...BARK_STEPS].map((step) => step.lightness);
const WOOD_SPAN = 0.17;

/**
 * The material ramp of a colour, six shades darkest first with the colour itself fourth (the
 * darkest is an item's outline), and its shine: a near-white of the lightest shade's hue.
 */
export function materialRamp(colour: Rgb, hueShift: number): { material: Ramp; shine: Rgb } {
  const material = generateRamp(colour, { count: 6, anchor: 3, hueShift });
  const [l, c, h] = rgbToOklch(material[5] as Rgb);
  const shine = oklchToRgb([Math.min(0.97, l + 0.16), c * 0.35, h]);
  return { material, shine };
}

/** The stone ramp (or the deepslate one) behind an ore. */
export function stoneRamp(deepslate: boolean, hueShift: number): Ramp {
  return generateRamp(deepslate ? DEEPSLATE_GREY : STONE_GREY, { steps: STONE_STEPS, hueShift });
}

/** The ramp of boards and cut wood in `colour`, darkest first. */
export function woodRamp(colour: Rgb, hueShift: number): Ramp {
  return familyRamp(colour, WOOD_STEPS, WOOD_FAMILY, WOOD_SPAN, hueShift);
}

/** The ramp of bark in `colour`: darker and duller than the wood, on the same ramp. */
export function barkRamp(colour: Rgb, hueShift: number): Ramp {
  return familyRamp(colour, BARK_STEPS, WOOD_FAMILY, WOOD_SPAN, hueShift);
}

/** The handle ramp: four shades of {@link HANDLE_BROWN}, the darkest the outline. */
export function handleRamp(hueShift: number): Ramp {
  return generateRamp(HANDLE_BROWN, { count: 4, anchor: 2, hueShift });
}

/**
 * Shade proportions with more or less noise: every share but the `centre` one is scaled by
 * `noise` and the centre takes the rest (at least a tenth). With `noise` 1 the proportions come
 * back unchanged.
 */
export function spreadShades(
  proportions: readonly number[],
  centre: number,
  noise: number,
): readonly number[] {
  if (noise === 1) return proportions;
  const total = proportions.reduce((sum, value) => sum + value, 0) || 1;
  const shares = proportions.map((value) => value / total);
  let others = 0;
  const scaled = shares.map((value, i) => {
    if (i === centre) return 0;
    others += value * noise;
    return value * noise;
  });
  const fit = others > 0.9 ? 0.9 / others : 1;
  return scaled.map((value, i) => (i === centre ? 1 - Math.min(0.9, others) : value * fit));
}
