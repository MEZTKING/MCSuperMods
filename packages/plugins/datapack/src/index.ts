/**
 * `@msm/plugin-datapack`: built-in MSM plugin contributing the vanilla data pack kinds
 * (recipes, loot tables, advancements, predicates, item modifiers, functions and tags).
 */
import { definePlugin } from '@msm/plugin-api';
import { dataPackKinds } from './kinds';

export * from './kinds';
export * from './lowering';

export default definePlugin({
  id: 'msm.datapack',
  apiVersion: '^0.3.0',
  contributes: { elementKinds: [...dataPackKinds] },
});
