/**
 * Worn pictures of the vanilla-style generator (ADR 0092 D7): the humanoid armour layers
 * (64 by 32) and the horse (64 by 64) and wolf (64 by 32) body armour layers, drawn from the
 * same ramps as the armour items. All are stubs that still draw their placeholder pattern;
 * B494 draws them. Box skins of models are in `skins.ts`.
 *
 * @packageDocumentation
 */

import { type ArtRecipeEntry, recipeEntry } from '../info';

/** The worn recipes, in table order. */
export const WORN_RECIPES: readonly ArtRecipeEntry[] = Object.freeze([
  recipeEntry({
    id: 'armor_layer_1',
    label: 'Worn armour: helmet, chestplate and boots',
    kind: 'entity',
    fallback: 'armor_layer_1',
    width: 64,
    height: 32,
  }),
  recipeEntry({
    id: 'armor_layer_2',
    label: 'Worn armour: leggings',
    kind: 'entity',
    fallback: 'armor_layer_2',
    width: 64,
    height: 32,
  }),
  recipeEntry({
    id: 'horse_armor_layer',
    label: 'Worn horse armour',
    kind: 'entity',
    fallback: 'horse_armor_layer',
    width: 64,
    height: 64,
  }),
  recipeEntry({
    id: 'wolf_armor_layer',
    label: 'Worn wolf armour',
    kind: 'entity',
    fallback: 'wolf_armor_layer',
    width: 64,
    height: 32,
  }),
]);
