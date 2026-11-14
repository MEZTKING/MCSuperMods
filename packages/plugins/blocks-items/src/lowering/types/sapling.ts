/**
 * `sapling` (ADR 0068): a stub until B264 writes the plant's own models, block state, tags and
 * loot preset. It writes only a single-variant block state of the `default` slot (the first
 * model of `models`, else `<ns>:block/<path>`); no models are generated yet.
 *
 * Model slots: `default` (provisional).
 */
import { variant } from './blockstates';
import type { TypeLowering } from './models';

export const saplingType: TypeLowering = {
  slots: ['default'],
  ownModelFallback: true,
  generate: () => [],
  blockstate: (models) => ({ variants: { '': variant(models.default ?? '') } }),
};
