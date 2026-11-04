/**
 * "New element" templates of `@msm/plugin-structures` (ADR 0020, plan D9), category
 * `Structures`.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { structureTemplateTemplates } from './structure-templates';
import { worldgenTemplates } from './worldgen';

export { type JigsawSpec, PieceBuilder } from './pieces';

/** Every template of this plugin, in picker order. */
export const structureTemplates: readonly ElementTemplate[] = Object.freeze([
  ...structureTemplateTemplates,
  ...worldgenTemplates,
]);
