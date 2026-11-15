/**
 * `stem` (ADR 0094 D1): a stub until B448. It has no model slots and generates nothing, so a block of this type has no
 * appearance yet; B448 fills the models, the block state, the tags and the loot.
 */
import type { TypeLowering } from './models';

export const stemType: TypeLowering = {
  slots: [],
  generate: () => [],
  blockstate: () => ({}),
};
