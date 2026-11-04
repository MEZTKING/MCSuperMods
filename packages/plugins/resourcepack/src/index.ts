/**
 * `@msm/plugin-resourcepack`: built-in MSM plugin contributing the vanilla resource pack
 * kinds (models, block and item definitions, lang, sounds and `pack.mcmeta`).
 */
import { definePlugin } from '@msm/plugin-api';
import { resourcePackKinds } from './kinds';

export * from './kinds';
export * from './lowering';

export default definePlugin({
  id: 'msm.resourcepack',
  apiVersion: '^0.4.0',
  contributes: { elementKinds: [...resourcePackKinds] },
});
