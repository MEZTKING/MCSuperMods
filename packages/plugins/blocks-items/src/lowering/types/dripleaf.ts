/**
 * `dripleaf` (ADR 0103 D3). A stub from B505: it lowers to nothing yet and B511 fills it in (slots,
 * generated models, block state, tags, companions).
 */
import type { TypeLowering } from './models';

export const dripleafType: TypeLowering = {
  slots: [],
  generate: () => [],
  blockstate: () => ({}),
};
