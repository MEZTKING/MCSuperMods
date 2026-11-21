/**
 * Icons and particles of the vanilla-style generator (ADR 0092 D7): the effect icon (18 by 18,
 * a round badge with a symbol chosen by the finish) and the four particle pictures (8 by 8,
 * four frames each, at most three alpha levels). All are stubs that still draw their
 * placeholder pattern; B494 draws them.
 *
 * @packageDocumentation
 */

import { EFFECT_ICON_SIZE, PARTICLE_FRAMES, PARTICLE_SIZE } from '../../assets/png';
import { type ArtRecipeEntry, type RecipeRow, recipeEntry } from '../info';

const particle = (id: RecipeRow['id'], label: string): RecipeRow => ({
  id,
  label,
  kind: 'particle',
  fallback: id as RecipeRow['fallback'],
  width: PARTICLE_SIZE,
  height: PARTICLE_SIZE,
  frames: PARTICLE_FRAMES,
});

/** The icon and particle recipes, in table order. */
export const ICON_RECIPES: readonly ArtRecipeEntry[] = Object.freeze([
  recipeEntry({
    id: 'effect_icon',
    label: 'Effect icon',
    kind: 'icon',
    fallback: 'effect_icon',
    width: EFFECT_ICON_SIZE,
    height: EFFECT_ICON_SIZE,
    finishes: ['drop', 'heart', 'star', 'flame', 'swirl'],
  }),
  recipeEntry(particle('particle_spark', 'Spark')),
  recipeEntry(particle('particle_orb', 'Glowing orb')),
  recipeEntry(particle('particle_puff', 'Puff of smoke')),
  recipeEntry(particle('particle_leaf', 'Falling leaf')),
]);
