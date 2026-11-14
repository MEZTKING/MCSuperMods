/**
 * "New element" templates of `@msm/plugin-blocks-items`: blocks, items, effects, the mod
 * metadata, the additions to vanilla content, portals and particles.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { additionTemplates } from './additions';
import { blockTypeTemplates } from './block-types';
import { blockTemplates } from './blocks';
import { containerTemplates } from './containers';
import { effectTemplates } from './effects';
import { itemTemplates } from './items';
import { modTemplates } from './mod';
import { particleTemplates } from './particles';
import { portalTemplates } from './portals';

export { modIdFromNamespace } from './mod';

/**
 * Every template, blocks first (plain blocks, one per block type, containers and machines, then
 * portals).
 */
export const blocksItemsTemplates: readonly ElementTemplate[] = Object.freeze([
  ...blockTemplates,
  ...blockTypeTemplates,
  ...containerTemplates,
  ...portalTemplates,
  ...itemTemplates,
  ...effectTemplates,
  ...modTemplates,
  ...additionTemplates,
  ...particleTemplates,
]);
