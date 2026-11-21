/**
 * The recipe table (ADR 0092 D7): every recipe's row, in family order (blocks, items, worn
 * pictures, icons and particles), joined from the family files under `recipes/`.
 *
 * @packageDocumentation
 */

import type { ArtRecipeEntry, ArtRecipeId, ArtRecipeInfo } from './info';
import { BLOCK_RECIPES } from './recipes/blocks';
import { ICON_RECIPES } from './recipes/icons';
import { ITEM_RECIPES } from './recipes/items';
import { WORN_RECIPES } from './recipes/worn';

/** Every recipe with its drawing (none for a stub), in table order. */
export const ART_TABLE: readonly ArtRecipeEntry[] = Object.freeze([
  ...BLOCK_RECIPES,
  ...ITEM_RECIPES,
  ...WORN_RECIPES,
  ...ICON_RECIPES,
]);

/** Every recipe's row, in table order: what the Draw dialog offers and the sheet shows. */
export const ART_RECIPE_INFO: readonly ArtRecipeInfo[] = Object.freeze(
  ART_TABLE.map((entry) => entry.info),
);

const BY_ID: ReadonlyMap<string, ArtRecipeEntry> = new Map(
  ART_TABLE.map((entry) => [entry.info.id, entry]),
);

/** The table entry of a recipe; throws for an id that is not in the table. */
export function artRecipe(id: ArtRecipeId): ArtRecipeEntry {
  const entry = BY_ID.get(id);
  if (entry === undefined) throw new Error(`Unknown art recipe ${String(id)}.`);
  return entry;
}

/** The row of a recipe; throws for an id that is not in the table. */
export function artRecipeInfo(id: ArtRecipeId): ArtRecipeInfo {
  return artRecipe(id).info;
}
