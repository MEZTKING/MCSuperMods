/**
 * "New element" templates contributed by `@msm/plugin-resourcepack` (ADR 0020), one module
 * per picker category. Data references only vanilla ids and ids derived from the new
 * element's own id.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { blockstateTemplates } from './blockstates';
import { equipmentTemplates } from './equipment';
import { fontTemplates } from './font';
import { itemDefinitionTemplates } from './item-definitions';
import { modelTemplates } from './models';
import { packTemplates } from './pack';
import { soundsTemplates } from './sounds';
import { textTemplates } from './text';

export { blockstateTemplates } from './blockstates';
export { equipmentTemplates } from './equipment';
export { fontTemplates } from './font';
export { itemDefinitionTemplates } from './item-definitions';
export { modelTemplates } from './models';
export { packTemplates } from './pack';
export { soundsTemplates } from './sounds';
export { textTemplates } from './text';

/** Every resource pack template, in picker order. */
export const resourcePackTemplates: readonly ElementTemplate[] = Object.freeze([
  ...modelTemplates,
  ...equipmentTemplates,
  ...blockstateTemplates,
  ...itemDefinitionTemplates,
  ...textTemplates,
  ...soundsTemplates,
  ...fontTemplates,
  ...packTemplates,
]);
