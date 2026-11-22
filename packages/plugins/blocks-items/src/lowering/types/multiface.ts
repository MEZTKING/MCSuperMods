/**
 * `multiface` (ADR 0103 D1). A stub from B505: it lowers to nothing yet and B511 fills it in (slots,
 * generated models, block state, tags, companions).
 */
import type { TypeLowering } from './models';

export const multifaceType: TypeLowering = {
  slots: [],
  generate: () => [],
  blockstate: () => ({}),
};
