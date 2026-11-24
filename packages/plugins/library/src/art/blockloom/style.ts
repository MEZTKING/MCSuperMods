/**
 * The block picture style (ADR 0135): which recipes Blockloom draws, how an MSM look (recipe,
 * colour, detail, seed, description) becomes a request to `@blockloom/core`, and the style the
 * library uses when a look names none (`blockloom` unless the host sets `classic`).
 *
 * `@blockloom/core` is the texture engine of Blockloom (https://github.com/MEZTKING/blockloom,
 * MIT Licence, Copyright (c) 2026 Lelouch), vendored unchanged in `vendor/blockloom-core/` at the
 * tag `core-v1.1.0`. This file only adapts MSM's looks to it; MSM encodes the PNGs itself.
 *
 * @packageDocumentation
 */

import {
  ENGINE_VERSION,
  type Finish,
  type GenerateOptions,
  generate,
  getMaterial,
  listMaterials,
  type MaterialRecipe,
  type ParsedPrompt,
  type PromptColor,
  parsePrompt,
  type ResolvedRecipe,
} from '@blockloom/core';
import type { Rgb } from '../../assets/png';
import { colourDistance } from '../colour';
import type { ArtDetail, ArtRecipeId } from '../info';

/** The engine version of the vendored `@blockloom/core`: the same inputs draw the same pixels. */
export const BLOCKLOOM_ENGINE_VERSION: string = ENGINE_VERSION;

/** Which generator draws block faces: Blockloom's recipes or MSM's own (Classic). */
export type BlockPictureStyle = 'blockloom' | 'classic';

/** The styles, the default first. */
export const BLOCK_PICTURE_STYLES: readonly BlockPictureStyle[] = Object.freeze([
  'blockloom',
  'classic',
]);

/** The styles in words, for the Settings choice. */
export const BLOCK_PICTURE_STYLE_LABELS: Readonly<Record<BlockPictureStyle, string>> =
  Object.freeze({ blockloom: 'Blockloom', classic: 'Classic' });

let current: BlockPictureStyle = 'blockloom';

/**
 * Sets the style used when a look names none (ADR 0135 D5): the app sets it from Settings at
 * start-up and when it changes. Anything but `classic` is `blockloom`.
 */
export function setBlockPictureStyle(style: BlockPictureStyle | string): void {
  current = style === 'classic' ? 'classic' : 'blockloom';
}

/** The style used when a look names none; `blockloom` unless the host set `classic`. */
export function blockPictureStyle(): BlockPictureStyle {
  return current;
}

/**
 * The part of a picture cache key that names who draws block faces: `classic`, or
 * `blockloom@<engine version>`, so a cached picture is redrawn when the style or the engine
 * changes (ADR 0135 D5).
 */
export function blockPictureCacheKey(style: BlockPictureStyle = current): string {
  return style === 'classic' ? 'classic' : `blockloom@${BLOCKLOOM_ENGINE_VERSION}`;
}

/** How a recipe is drawn in the Blockloom style. */
interface BlockloomRecipe {
  readonly material: string;
  readonly face: 'side' | 'top' | 'bottom';
  /** One step smoother than the detail asks (the plain block). */
  readonly smoother?: true;
  /** The colour picks the ore (the nearest vein colour); on deepslate, crystals and flecks. */
  readonly ore?: 'stone' | 'deepslate';
  /** The look's colour does not tint it (a grass side: a tint would colour its dirt too). */
  readonly untinted?: true;
}

/** The recipes Blockloom draws (ADR 0135 D3); every other recipe is MSM's in both styles. */
const BLOCKLOOM_RECIPES: Readonly<Partial<Record<ArtRecipeId, BlockloomRecipe>>> = Object.freeze({
  plain: { material: 'stone', face: 'side', smoother: true },
  stone: { material: 'stone', face: 'side' },
  cobblestone: { material: 'cobblestone', face: 'side' },
  bricks: { material: 'bricks', face: 'side' },
  ore: { material: 'gold_ore', face: 'side', ore: 'stone' },
  deepslate_ore: { material: 'deepslate', face: 'side', ore: 'deepslate' },
  dirt: { material: 'dirt', face: 'side' },
  grass_top: { material: 'grass_block', face: 'top' },
  grass_side: { material: 'grass_block', face: 'side', untinted: true },
  sand: { material: 'sand', face: 'side' },
  gravel: { material: 'gravel', face: 'side' },
  planks: { material: 'oak_planks', face: 'side' },
  bark: { material: 'oak_log', face: 'side' },
  log_top: { material: 'oak_log', face: 'top' },
  leaves: { material: 'leaves_cutout', face: 'side' },
});

/** The recipes Blockloom draws. */
export const BLOCKLOOM_RECIPE_IDS: readonly ArtRecipeId[] = Object.freeze(
  Object.keys(BLOCKLOOM_RECIPES) as ArtRecipeId[],
);

/** Whether the Blockloom style draws `recipe` (else MSM's generator does, in both styles). */
export function blockloomDraws(recipe: string): boolean {
  return Object.hasOwn(BLOCKLOOM_RECIPES, recipe);
}

/** Blockloom's materials (89 in core 1.1.0), as `listMaterials` gives them. */
export function blockloomMaterials(): MaterialRecipe[] {
  return listMaterials();
}

/** A description read by Blockloom's parser: the material, effects and colour it names. */
export function parseBlockDescription(text: string): ParsedPrompt {
  return parsePrompt(text);
}

const FINISH_OF_DETAIL: Readonly<Record<ArtDetail, Finish>> = Object.freeze({
  smooth: 'smooth',
  normal: 'balanced',
  rough: 'rugged',
});

const SMOOTHER: Readonly<Record<Finish, Finish>> = Object.freeze({
  rugged: 'balanced',
  balanced: 'smooth',
  smooth: 'smooth',
});

/** A colour as Blockloom's HSL: hue in degrees, saturation and lightness 0 to 1. */
function hsl(colour: Rgb): { h: number; s: number; l: number } {
  const [r, g, b] = colour.map((channel) => channel / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

const hexOf = (colour: Rgb): string =>
  `#${colour.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;

const rgbOfHex = (value: string): Rgb => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
];

/** Below this saturation a colour is a grey: the material keeps its own colours. */
const GREY_SATURATION = 0.12;

/**
 * The look's colour as Blockloom's `promptColor` over `material`: its hue and saturation, and
 * its lightness as a shift from the material's; `undefined` for a grey (Blockloom lifts every
 * tint to a saturation of at least 0.24, so a grey would turn red).
 */
export function colourTint(colour: Rgb, material: string): PromptColor | undefined {
  const own = hsl(colour);
  if (own.s < GREY_SATURATION) return undefined;
  const base = hsl(rgbOfHex(getMaterial(material).base));
  return { hue: own.h, sat: own.s, light: own.l - base.l };
}

const ORES = listMaterials().filter((entry) => entry.type === 'ore');

/** The ore whose vein colour is nearest `colour`: its veins and shape draw the ore. */
export function nearestOre(colour: Rgb): string {
  let best = 'gold_ore';
  let distance = Number.POSITIVE_INFINITY;
  for (const entry of ORES) {
    const d = colourDistance(colour, rgbOfHex(entry.accent ?? '#b8e264'));
    if (d < distance) {
      distance = d;
      best = entry.id;
    }
  }
  return best;
}

/** A look as the Blockloom style takes it. */
export interface BlockloomLook {
  readonly recipe: string;
  readonly colour: Rgb;
  readonly detail?: ArtDetail | undefined;
  readonly seed?: number | undefined;
  /** Words such as "mossy cobblestone with cyan crystals" (ADR 0135 D4). */
  readonly description?: string | undefined;
}

/**
 * The `@blockloom/core` options of a look, or `undefined` when Blockloom does not draw its
 * recipe. The recipe names the material and face; the colour tints it (an ore's colour picks
 * the ore); the detail picks the finish; MSM's seed `s` is Blockloom's `s + 1`. A description
 * is passed as the prompt: a material it names replaces the recipe's with its own colours, its
 * effects are added, and its colour word tints the block or colours the effects.
 */
export function blockloomOptions(look: BlockloomLook): GenerateOptions | undefined {
  const recipe = BLOCKLOOM_RECIPES[look.recipe as ArtRecipeId];
  if (recipe === undefined) return undefined;
  const prompt = look.description?.trim() ?? '';
  const words = prompt === '' ? undefined : parsePrompt(prompt);
  const finish = FINISH_OF_DETAIL[look.detail ?? 'normal'] ?? 'balanced';
  const seed = ((Math.trunc(look.seed ?? 0) >>> 0) % 999_999_999) + 1;
  const common = {
    seed,
    size: 16,
    face: recipe.face,
    finish: recipe.smoother === true ? SMOOTHER[finish] : finish,
  };
  if (words?.materialId != null) return { ...common, prompt };
  let materialId = recipe.material;
  let promptColor: PromptColor | undefined;
  let deepslateOre: { modifiers: string[]; accent: string } | undefined;
  if (recipe.ore === 'stone') materialId = nearestOre(look.colour);
  else if (recipe.ore === 'deepslate') {
    // Blockloom has no deepslate ore: deepslate with crystals and flecks in the ore's colour.
    deepslateOre = {
      modifiers: [...new Set(['crystal', 'flecked', ...(words?.modifiers ?? [])])],
      accent: hexOf(look.colour),
    };
  } else if (recipe.untinted !== true) promptColor = colourTint(look.colour, materialId);
  // A colour word in the words tints the block in place of the look's colour.
  if (words?.color != null && !words.colorAsAccent) promptColor = undefined;
  return {
    ...common,
    ...(prompt === '' ? {} : { prompt }),
    recipe: {
      materialId,
      ...(promptColor === undefined ? {} : { promptColor }),
      ...(deepslateOre === undefined ? {} : deepslateOre),
    },
  };
}

/** A face drawn by Blockloom: its RGBA pixels and the recipe Blockloom resolved. */
export interface BlockloomDrawing {
  readonly data: Uint8Array;
  readonly recipe: ResolvedRecipe;
}

/** A look drawn by `@blockloom/core`, 16 by 16, or `undefined` (not a Blockloom recipe). */
export function blockloomDrawing(look: BlockloomLook): BlockloomDrawing | undefined {
  const options = blockloomOptions(look);
  if (options === undefined) return undefined;
  const drawn = generate(options);
  return {
    data: new Uint8Array(drawn.rgba.buffer, drawn.rgba.byteOffset, drawn.rgba.byteLength),
    recipe: drawn.recipe,
  };
}

/**
 * What is stored with a Blockloom picture (ADR 0135 D8), as the PNG's `tEXt` entry
 * `blockloom`: the engine version, the words, the material, effects, seed, face and finish, so
 * the same picture can be drawn again. ASCII JSON (other characters escaped).
 */
export function blockloomPictureNote(recipe: ResolvedRecipe): string {
  const note = {
    engineVersion: recipe.engineVersion,
    prompt: recipe.prompt,
    materialId: recipe.materialId,
    modifiers: recipe.modifiers,
    seed: recipe.seed,
    face: recipe.face,
    finish: recipe.finish,
    ...(recipe.promptColor === null ? {} : { promptColor: recipe.promptColor }),
  };
  return JSON.stringify(note).replace(
    /[^\x20-\x7e]/g,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}
