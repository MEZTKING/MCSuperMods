/**
 * `@msm/plugin-models-anim`: built-in MSM plugin contributing GeckoLib geo models and
 * animation sets (ADR 0029 D2): the `msm:geo_model` and `msm:animation` kinds, their lowering
 * to `assets/<ns>/geckolib/{models,animations}/`, the `models-anim.*` project validators and
 * the "New element" templates.
 */
import { definePlugin } from '@msm/plugin-api';
import { modelsAnimKinds } from './kinds';
import { modelsAnimTemplates } from './templates';
import { modelsAnimValidators } from './validators';

export * from './kinds';
export * from './lowering';
export { modelsAnimTemplates } from './templates';
export { MODELS_ANIM_PROBLEM_CODES, modelsAnimValidators } from './validators';

export default definePlugin({
  id: 'msm.models-anim',
  apiVersion: '^0.7.0',
  contributes: {
    elementKinds: [...modelsAnimKinds],
    elementTemplates: [...modelsAnimTemplates],
    validators: [...modelsAnimValidators],
  },
});
