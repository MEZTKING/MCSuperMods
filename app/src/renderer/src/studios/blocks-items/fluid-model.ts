/**
 * Pure helpers of the Fluid Studio (ADR 0099 D1, ADR 0101 D1): what the preview shows (the
 * still, flowing, overlay and bucket pictures, the plugin's vanilla fallbacks where a picture is
 * missing, and the tint as a CSS colour), the flow numbers in words ("blocks a second") and the
 * words of `behaves_like`. The numbers and fallbacks are the blocks-items plugin's
 * (`fluidFlowOf`, `fluidTextures`, `fluidSpreadDistance`), so the Studio and lowering agree.
 * No React, no session.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import {
  type FluidBehaviour,
  type FluidFlowNumbers,
  fluidBehaviourOf,
  fluidFlowOf,
  fluidSpreadDistance,
  fluidTextureOf,
  fluidTextures,
} from '@msm/plugin-blocks-items';
import { asObject } from './blocks-items-model';

/** The game's ticks per second. */
const TICKS_PER_SECOND = 20;

/** The `behaves_like` values, in picker order. */
export const FLUID_BEHAVIOURS: readonly FluidBehaviour[] = Object.freeze(['water', 'lava', 'none']);

/** Words for each `behaves_like` value. */
export const FLUID_BEHAVIOUR_LABELS: Readonly<Record<FluidBehaviour, string>> = Object.freeze({
  water: 'Water: you swim, float and drown in it, and it puts fires out',
  lava: 'Lava: it sets you on fire and hurts',
  none: 'Neither: you move through it',
});

/** The ranges of the flow sliders (the format's). */
export const FLOW_RANGES = Object.freeze({
  tickDelay: { min: 1, max: 100 },
  slopeDistance: { min: 1, max: 8 },
  dropOff: { min: 1, max: 4 },
  light: { min: 0, max: 15 },
});

/** An RGB number as a CSS colour, `#rrggbb`. */
export function tintColour(tint: number): string {
  return `#${(tint & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** A `#rrggbb` colour as an RGB number, or `undefined`. */
export function tintFromColour(colour: string): number | undefined {
  const match = /^#([0-9a-f]{6})$/i.exec(colour.trim());
  return match === null ? undefined : Number.parseInt(match[1] as string, 16);
}

/** The fluid's tint as a CSS colour, or `undefined` when it has none. */
export function fluidTintOf(data: Json | undefined): string | undefined {
  const tint = asObject(data).tint;
  return typeof tint === 'number' && Number.isInteger(tint) && tint >= 0 && tint <= 0xffffff
    ? tintColour(tint)
    : undefined;
}

/** How fast flowing fluid spreads: blocks a second, from the ticks between two flow steps. */
export function blocksPerSecond(tickDelay: number): number {
  return Math.round((TICKS_PER_SECOND / Math.max(1, tickDelay)) * 100) / 100;
}

/** "4 blocks a second" (rounded to two places). */
export function speedWords(tickDelay: number): string {
  const speed = blocksPerSecond(tickDelay);
  return `${speed} ${speed === 1 ? 'block' : 'blocks'} a second`;
}

/** "Spreads 7 blocks from its source" for a `drop_off`. */
export function spreadWords(dropOff: number): string {
  const blocks = fluidSpreadDistance(dropOff);
  return `Spreads ${blocks} ${blocks === 1 ? 'block' : 'blocks'} from its source on flat ground`;
}

/** One picture of the preview. */
export interface FluidPicture {
  /** The texture id the preview draws. */
  texture: string;
  /** True when the fluid has no picture of its own here and vanilla's is shown. */
  fallback: boolean;
}

/** What the Fluid Studio's preview shows. */
export interface FluidPreview {
  behaviour: FluidBehaviour;
  /** The tint as a CSS colour, or `undefined`. */
  tint: string | undefined;
  still: FluidPicture;
  flowing: FluidPicture;
  /** The overlay, when the fluid has one. */
  overlay: FluidPicture | undefined;
  bucket: FluidPicture;
  flow: FluidFlowNumbers;
  /** Light level of the liquid block (the format's default is 0, lava-like or not). */
  light: number;
}

/** The preview of fluid element data. */
export function fluidPreviewOf(data: Json | undefined): FluidPreview {
  const pictures = fluidTextures(data);
  const picture = (slot: 'still' | 'flowing' | 'bucket'): FluidPicture => ({
    texture: pictures[slot],
    fallback: fluidTextureOf(data, slot) === undefined,
  });
  const light = asObject(data).light;
  return {
    behaviour: fluidBehaviourOf(data),
    tint: fluidTintOf(data),
    still: picture('still'),
    flowing: picture('flowing'),
    overlay:
      pictures.overlay === undefined ? undefined : { texture: pictures.overlay, fallback: false },
    bucket: picture('bucket'),
    flow: fluidFlowOf(data),
    light: typeof light === 'number' ? light : 0,
  };
}

/** `assets/<ns>/textures/<path>.png` of a texture id (vanilla's under `minecraft`). */
export function pictureAssetPath(texture: string): string {
  const colon = texture.indexOf(':');
  const namespace = colon < 0 ? 'minecraft' : texture.slice(0, colon);
  const path = colon < 0 ? texture : texture.slice(colon + 1);
  return `assets/${namespace}/textures/${path}.png`;
}

/** Words for the two tags a mixing rule's `with` may name (ADR 0108 D1). */
export const MIXING_WITH_LABELS: Readonly<Record<string, string>> = Object.freeze({
  water: 'Water (any water-like liquid)',
  lava: 'Lava (any lava-like liquid)',
});

/** The mixing rules of fluid data (`mixing`), objects only. */
export function mixingRulesOf(data: Json | undefined): { [key: string]: Json }[] {
  const list = asObject(data).mixing;
  return Array.isArray(list) ? list.map((rule) => ({ ...asObject(rule) })) : [];
}

/** `rules` with rule `index` replaced by `rule`. */
export function withMixingRule(
  rules: readonly { [key: string]: Json }[],
  index: number,
  rule: { [key: string]: Json },
): { [key: string]: Json }[] {
  return rules.map((entry, at) => (at === index ? rule : entry));
}
