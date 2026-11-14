/**
 * Minecraft-style art prototype (ADR 0092, Proposed): approach A recolours the user's own
 * textures ({@link recolourTexture}), approach B draws original textures by vanilla's rules
 * ({@link generateArt}). Not wired into any flow yet.
 *
 * @packageDocumentation
 */

export {
  type ArtImage,
  hueDelta,
  type Oklab,
  type Oklch,
  oklchToRgb,
  packRgb,
  rgbToOklab,
  rgbToOklch,
} from './colour';
export {
  ART_RECIPES,
  type ArtOptions,
  type ArtRecipe,
  type ArtStyle,
  DEFAULT_STYLE,
  generateArt,
  generateArtPng,
  LEAF_GREEN,
} from './generator';
export { clusteredField, hashSeed, quantise, rng } from './noise';
export {
  BASE_DIFFERENCE,
  extractPalette,
  type MaterialMaskOptions,
  materialColours,
  materialMask,
  type PaletteEntry,
  type TextureRamps,
  textureRamps,
} from './palette';
export { defaultSteps, generateRamp, type RampOptions, type ShadeStep } from './ramp';
export {
  applyColourMap,
  colourCount,
  type RecolourOptions,
  rampMap,
  recolourTexture,
  stripFrames,
} from './recolour';
export { learnStyle, meanRunLength, rampHueTurn } from './style';
