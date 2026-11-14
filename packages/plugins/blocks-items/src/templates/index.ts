/**
 * "New element" templates of `@msm/plugin-blocks-items`: blocks, items, effects, the mod
 * metadata and the additions to vanilla content.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { additionTemplates } from './additions';
import { blockTemplates } from './blocks';
import { effectTemplates } from './effects';
import { itemTemplates } from './items';
import { modTemplates } from './mod';

export { modIdFromNamespace } from './mod';

/** Every template, blocks first. */
export const blocksItemsTemplates: readonly ElementTemplate[] = Object.freeze([
  ...blockTemplates,
  ...itemTemplates,
  ...effectTemplates,
  ...modTemplates,
  ...additionTemplates,
]);
