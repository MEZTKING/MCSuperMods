/**
 * The data pack element templates (ADR 0020), in picker order: recipes, loot tables,
 * advancements, predicates, item modifiers, functions and function tags, other tags,
 * enchantments, then the other tier-B registries. Every template uses only vanilla ids, ids
 * derived from the new element's own id, or the project's `root`, `tick` and `load`.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { advancementTemplates } from './advancements';
import { functionTemplates } from './functions';
import { itemModifierTemplates } from './item-modifiers';
import { lootTableTemplates } from './loot-tables';
import { predicateTemplates } from './predicates';
import { recipeTemplates } from './recipes';
import { enchantmentTemplates, otherDataTemplates } from './registries';
import { tagTemplates } from './tags';

export const dataPackTemplates: readonly ElementTemplate[] = Object.freeze([
  ...recipeTemplates,
  ...lootTableTemplates,
  ...advancementTemplates,
  ...predicateTemplates,
  ...itemModifierTemplates,
  ...functionTemplates,
  ...tagTemplates,
  ...enchantmentTemplates,
  ...otherDataTemplates,
]);
