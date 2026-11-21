/**
 * The low-level helpers of the vanilla-style generator (ADR 0092), exported from the library as
 * `minecraftArt`: colour maths, hue-shifted ramps, seeded clustered noise, palettes and the
 * sprite renderers. The recipe table, `artPixels`, `artPng`, `checkArtRules` and the box skins
 * are exported from the library itself.
 *
 * @packageDocumentation
 */

export { drawSprite, renderSprite, type SpriteOptions, type SpriteRamps } from './canvas';
export {
  type ArtImage,
  blankImage,
  colourDistance,
  hueDelta,
  type Oklab,
  type Oklch,
  oklabToRgb,
  oklchToRgb,
  packRgb,
  rgbToOklab,
  rgbToOklch,
  unpackRgb,
} from './colour';
export {
  ART_HUE_SHIFT,
  barkRamp,
  CRUST,
  DEEPSLATE_GREY,
  HANDLE_BROWN,
  handleRamp,
  LEAF_GREEN,
  materialRamp,
  type Ramp,
  STONE_GREY,
  spreadShades,
  stoneRamp,
  woodRamp,
} from './materials';
export { clusteredField, type FieldOptions, hashSeed, quantise, rng } from './noise';
export { colourCount, extractPalette, type PaletteEntry } from './palette';
export {
  COOL_HUE,
  DEFAULT_HUE_SHIFT,
  defaultSteps,
  generateRamp,
  type RampOptions,
  type ShadeStep,
  WARM_HUE,
} from './ramp';
export type { Silhouette } from './sprites';
