/**
 * "New element" templates of `@msm/plugin-blocks-items`: blocks, items, effects, the mod
 * metadata and the additions to vanilla content.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { additionTemplates } from './additions';
import { blockTypeTemplates } from './block-types';
import { blockTemplates } from './blocks';
import { containerTemplates } from './containers';
import { effectTemplates } from './effects';
import { itemTemplates } from './items';
import { modTemplates } from './mod';

export { modIdFromNamespace } from './mod';

/** Every template, blocks first (plain blocks, one per block type, then containers and machines). */
export const blocksItemsTemplates: readonly ElementTemplate[] = Object.freeze([
  ...blockTemplates,
  ...blockTypeTemplates,
  ...containerTemplates,
  ...itemTemplates,
  ...effectTemplates,
  ...modTemplates,
  ...additionTemplates,
]);
