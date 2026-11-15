/**
 * "New element" templates of `@msm/plugin-blocks-items`: blocks, items, effects, the mod
 * metadata, the additions to vanilla content, portals, particles and the vanilla parity block types and bags.
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
import { vanillaParityBlockTemplates, vanillaParityItemTemplates } from './vanilla-parity';

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
  ...vanillaParityBlockTemplates,
  ...itemTemplates,
  ...vanillaParityItemTemplates,
  ...effectTemplates,
  ...modTemplates,
  ...additionTemplates,
  ...particleTemplates,
]);
