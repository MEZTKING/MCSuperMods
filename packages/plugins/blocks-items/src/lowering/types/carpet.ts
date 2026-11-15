/**
 * `carpet` (ADR 0094 D1): a stub until B447. It has no model slots and generates nothing, so a block of this type has no
 * appearance yet; B447 fills the models, the block state, the tags and the loot.
 */
import type { TypeLowering } from './models';

export const carpetType: TypeLowering = {
  slots: [],
  generate: () => [],
  blockstate: () => ({}),
};
