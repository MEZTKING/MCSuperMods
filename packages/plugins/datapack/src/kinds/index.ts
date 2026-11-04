/**
 * Element kinds contributed by `@msm/plugin-datapack`, one module per kind.
 */
import type { ElementKind } from '@msm/plugin-api';
import { advancementKind } from './advancement';
import { functionKind } from './function';
import { itemModifierKind } from './item-modifier';
import { lootTableKind } from './loot-table';
import { predicateKind } from './predicate';
import { recipeKind } from './recipe';
import { tagKinds } from './tag';

export { advancementKind } from './advancement';
export { functionKind } from './function';
export { itemModifierKind } from './item-modifier';
export { lootTableKind } from './loot-table';
export { predicateKind } from './predicate';
export { recipeKind } from './recipe';
export { TAG_REGISTRIES, type TagRegistry, tagKind, tagKinds } from './tag';

/** Every kind this plugin contributes, in a stable order: tier A, then the tag kinds. */
export const dataPackKinds: readonly ElementKind[] = Object.freeze([
  recipeKind,
  lootTableKind,
  advancementKind,
  predicateKind,
  itemModifierKind,
  functionKind,
  ...tagKinds,
]);
