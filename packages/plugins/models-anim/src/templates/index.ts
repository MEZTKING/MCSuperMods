/**
 * "New element" templates of `@msm/plugin-models-anim`: geo models, then animation sets.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { animationTemplates } from './animations';
import { modelTemplates } from './models';

/** Every template, models first. */
export const modelsAnimTemplates: readonly ElementTemplate[] = Object.freeze([
  ...modelTemplates,
  ...animationTemplates,
]);
