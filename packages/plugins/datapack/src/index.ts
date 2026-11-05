/**
 * `@msm/plugin-datapack`: built-in MSM plugin contributing the vanilla data pack kinds
 * (recipes, loot tables, advancements, predicates, item modifiers, functions, tags and the
 * tier-B generic registries such as enchantments, damage types and dialogs) and their
 * "New element" templates (ADR 0020).
 */
import { definePlugin } from '@msm/plugin-api';
import { dataPackKinds } from './kinds';
import { dataPackTemplates } from './templates';

export * from './kinds';
export * from './lowering';
export { dataPackTemplates } from './templates';

export default definePlugin({
  id: 'msm.datapack',
  apiVersion: '^1.0.0',
  contributes: {
    elementKinds: [...dataPackKinds],
    elementTemplates: [...dataPackTemplates],
  },
});
