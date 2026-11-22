/**
 * "New element" templates of `@msm/plugin-blocks-items`: blocks, items, effects, the mod
 * metadata, the additions to vanilla content, portals, particles, the vanilla parity block types and bags, fluids,
 * and the plants, pots, storage, sounds and vanilla block rules of vanilla parity 3.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { additionTemplates } from './additions';
import { blockTypeTemplates } from './block-types';
import { blockTemplates } from './blocks';
import { containerTemplates } from './containers';
import { effectTemplates } from './effects';
import { fluidTemplates } from './fluids';
import { itemTemplates } from './items';
import { modTemplates } from './mod';
import { particleTemplates } from './particles';
import { portalTemplates } from './portals';
import { vanillaParityBlockTemplates, vanillaParityItemTemplates } from './vanilla-parity';
import { vanillaParity3AdditionTemplates, vanillaParity3BlockTemplates } from './vanilla-parity-3';

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
  ...vanillaParity3BlockTemplates,
  ...itemTemplates,
  ...vanillaParityItemTemplates,
  ...effectTemplates,
  ...modTemplates,
  ...additionTemplates,
  ...vanillaParity3AdditionTemplates,
  ...particleTemplates,
  ...fluidTemplates,
]);
