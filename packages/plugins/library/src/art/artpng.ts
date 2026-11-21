/**
 * Placeholder patterns drawn as art (ADR 0092 D14): every one of the 70
 * {@link PlaceholderPattern}s maps to a recipe ({@link PATTERN_RECIPES}), and {@link artPng}
 * draws a pattern with its recipe, falling back to {@link placeholderPng}, byte for byte, while
 * the recipe is a stub. `placeholderPng` and its patterns stay as they are.
 *
 * @packageDocumentation
 */

import {
  DEFAULT_COLOUR,
  encodePng,
  type PlaceholderOptions,
  type PlaceholderPattern,
  placeholderPng,
} from '../assets/png';
import { artPixels } from './draw';
import type { ArtDetail, ArtRecipeId } from './info';
import { artRecipeInfo } from './table';

/** The recipe of every placeholder pattern; only `egg` is named differently (`spawn_egg`). */
export const PATTERN_RECIPES: Readonly<Record<PlaceholderPattern, ArtRecipeId>> = Object.freeze({
  plain: 'plain',
  ore: 'ore',
  gem: 'gem',
  disc: 'disc',
  egg: 'spawn_egg',
  sword: 'sword',
  pickaxe: 'pickaxe',
  axe: 'axe',
  shovel: 'shovel',
  hoe: 'hoe',
  helmet: 'helmet',
  chestplate: 'chestplate',
  leggings: 'leggings',
  boots: 'boots',
  ingot: 'ingot',
  armor_layer_1: 'armor_layer_1',
  armor_layer_2: 'armor_layer_2',
  bow: 'bow',
  bow_pulling_0: 'bow_pulling_0',
  bow_pulling_1: 'bow_pulling_1',
  bow_pulling_2: 'bow_pulling_2',
  crossbow: 'crossbow',
  crossbow_pulling_0: 'crossbow_pulling_0',
  crossbow_pulling_1: 'crossbow_pulling_1',
  crossbow_pulling_2: 'crossbow_pulling_2',
  crossbow_arrow: 'crossbow_arrow',
  crossbow_firework: 'crossbow_firework',
  shield: 'shield',
  spear: 'spear',
  mace: 'mace',
  bottle: 'bottle',
  totem: 'totem',
  smithing_template: 'smithing_template',
  horse_armor: 'horse_armor',
  wolf_armor: 'wolf_armor',
  horse_armor_layer: 'horse_armor_layer',
  wolf_armor_layer: 'wolf_armor_layer',
  ball: 'ball',
  knife: 'knife',
  boomerang: 'boomerang',
  flask: 'flask',
  effect_icon: 'effect_icon',
  bark: 'bark',
  log_top: 'log_top',
  stripped_log: 'stripped_log',
  stripped_log_top: 'stripped_log_top',
  planks: 'planks',
  door_top: 'door_top',
  door_bottom: 'door_bottom',
  trapdoor: 'trapdoor',
  leaves: 'leaves',
  sapling: 'sapling',
  stone: 'stone',
  polished_stone: 'polished_stone',
  bricks: 'bricks',
  pillar_side: 'pillar_side',
  pillar_top: 'pillar_top',
  crop_stage0: 'crop_stage0',
  crop_stage1: 'crop_stage1',
  crop_stage2: 'crop_stage2',
  crop_stage3: 'crop_stage3',
  seeds: 'seeds',
  produce: 'produce',
  block_front: 'block_front',
  portal: 'portal',
  portal_frame: 'portal_frame',
  particle_spark: 'particle_spark',
  particle_orb: 'particle_orb',
  particle_puff: 'particle_puff',
  particle_leaf: 'particle_leaf',
});

/** Options for {@link artPng}: the placeholder's options and the look's seed, finish and detail. */
export type ArtPngOptions = PlaceholderOptions & {
  /** The variation; defaults to 0. */
  seed?: number | undefined;
  /** One of the recipe's finishes; defaults to its first. */
  finish?: string | undefined;
  /** How much shade noise; defaults to `normal`. */
  detail?: ArtDetail | undefined;
};

/**
 * A byte-stable PNG of a placeholder pattern drawn by its recipe, of the size the pattern has
 * ({@link placeholderSize}); for a particle pattern, the frame `options.frame` asks for. While
 * the recipe is a stub, the bytes are those of {@link placeholderPng} with the same options.
 *
 * @param pattern - The pattern to draw.
 * @param options - The colours, the frame, and the look's seed, finish and detail.
 */
export function artPng(pattern: PlaceholderPattern, options: ArtPngOptions = {}): Uint8Array {
  const recipe = PATTERN_RECIPES[pattern];
  if (!artRecipeInfo(recipe).drawn) return placeholderPng(pattern, options);
  const pixels = artPixels({
    recipe,
    colour: options.colour ?? DEFAULT_COLOUR,
    accent: options.accent,
    finish: options.finish,
    detail: options.detail,
    seed: options.seed,
  });
  const frame =
    (((Math.trunc(options.frame ?? 0) % pixels.frames) + pixels.frames) % pixels.frames) | 0;
  const size = pixels.width * pixels.height * 4;
  return encodePng(
    pixels.data.subarray(frame * size, (frame + 1) * size),
    pixels.width,
    pixels.height,
  );
}
