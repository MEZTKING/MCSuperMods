/**
 * `@msm/plugin-resourcepack`: built-in MSM plugin contributing the vanilla resource pack
 * kinds (models, block and item definitions, lang, sounds and `pack.mcmeta`) and their
 * "New element" templates.
 */
import { definePlugin } from '@msm/plugin-api';
import { resourcePackKinds } from './kinds';
import { resourcePackTemplates } from './templates';

export * from './kinds';
export * from './lowering';
export * from './templates';

export default definePlugin({
  id: 'msm.resourcepack',
  apiVersion: '^0.7.0',
  contributes: {
    elementKinds: [...resourcePackKinds],
    elementTemplates: [...resourcePackTemplates],
  },
});
