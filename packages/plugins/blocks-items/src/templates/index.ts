/**
 * "New element" templates of `@msm/plugin-blocks-items`: blocks, items, effects, the mod
 * metadata and the additions to vanilla content.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { additionTemplates } from './additions';
import { blockTypeTemplates } from './block-types';
import { blockTemplates } from './blocks';
import { effectTemplates } from './effects';
import { itemTemplates } from './items';
import { modTemplates } from './mod';

export { modIdFromNamespace } from './mod';

/** Every template, blocks first (plain blocks, then one per block type). */
export const blocksItemsTemplates: readonly ElementTemplate[] = Object.freeze([
  ...blockTemplates,
  ...blockTypeTemplates,
  ...itemTemplates,
  ...effectTemplates,
  ...modTemplates,
  ...additionTemplates,
]);
