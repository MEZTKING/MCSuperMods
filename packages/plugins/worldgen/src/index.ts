/**
 * `@msm/plugin-worldgen`: built-in MSM plugin contributing the world generation kinds (ADR 0022
 * D4: biomes, configured and placed features, dimensions, world presets and the tier-B
 * registries), their "New element" templates and the `worldgen.*` project validators (D8).
 */
import { definePlugin } from '@msm/plugin-api';
import { worldgenKinds } from './kinds';
import { worldgenTemplates } from './templates';
import { worldgenValidators } from './validators';

export * from './kinds';
export * from './lowering';
export { worldgenTemplates } from './templates';
export { WORLDGEN_PROBLEM_CODES, worldgenValidators } from './validators';

export default definePlugin({
  id: 'msm.worldgen',
  apiVersion: '^0.5.0',
  contributes: {
    elementKinds: [...worldgenKinds],
    elementTemplates: [...worldgenTemplates],
    validators: [...worldgenValidators],
  },
});
