/**
 * Element kinds contributed by `@msm/plugin-structures`.
 */
import type { ElementKind } from '@msm/plugin-api';
import { processorListKind, structureKind, structureSetKind, templatePoolKind } from './json-kinds';
import { structureTemplateKind } from './structure-template';

export * from './json-kinds';
export * from './structure-template';

/** Every kind of this plugin, in sidebar order. */
export const structureKinds: readonly ElementKind[] = Object.freeze([
  structureTemplateKind,
  templatePoolKind,
  structureKind,
  structureSetKind,
  processorListKind,
]);
