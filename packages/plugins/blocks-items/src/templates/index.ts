/**
 * "New element" templates of `@msm/plugin-blocks-items`: blocks, items and the mod metadata.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { blockTemplates } from './blocks';
import { itemTemplates } from './items';
import { modTemplates } from './mod';

export { modIdFromNamespace } from './mod';

/** Every template, blocks first. */
export const blocksItemsTemplates: readonly ElementTemplate[] = Object.freeze([
  ...blockTemplates,
  ...itemTemplates,
  ...modTemplates,
]);
