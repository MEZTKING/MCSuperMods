/**
 * `@msm/plugin-entities`: built-in MSM plugin contributing custom mobs (ADR 0028 D6): the
 * `msm:entity` kind, its lowering to the runtime definition under `msm/` plus language keys and
 * the spawn egg's item files, the `entities.*` project validators and the "New element"
 * templates.
 */
import { definePlugin } from '@msm/plugin-api';
import { entitiesKinds } from './kinds';
import { entitiesTemplates } from './templates';
import { entitiesValidators } from './validators';

export * from './kinds';
export * from './lowering';
export { displayName, entitiesTemplates } from './templates';
export { ENTITIES_PROBLEM_CODES, entitiesValidators } from './validators';

export default definePlugin({
  id: 'msm.entities',
  apiVersion: '^0.8.0',
  contributes: {
    elementKinds: [...entitiesKinds],
    elementTemplates: [...entitiesTemplates],
    validators: [...entitiesValidators],
  },
});
