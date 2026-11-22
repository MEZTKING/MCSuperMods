/**
 * `flower_pot` (ADR 0103 D2). A stub from B505: it lowers to nothing yet and B512 fills it in (slots,
 * generated models, block state, tags, companions).
 */
import type { TypeLowering } from './models';

export const flowerPotType: TypeLowering = {
  slots: [],
  generate: () => [],
  blockstate: () => ({}),
};
