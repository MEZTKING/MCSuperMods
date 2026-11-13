/**
 * "New element" templates of `@msm/plugin-blocks-items`: blocks, items, effects and the mod
 * metadata.
 */
import type { ElementTemplate } from '@msm/plugin-api';
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
]);
