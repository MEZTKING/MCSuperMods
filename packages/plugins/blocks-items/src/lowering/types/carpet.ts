/**
 * `carpet` (ADR 0094 D1, D10): a thin carpet on top of a block. The generated model is
 * vanilla's `minecraft:block/carpet` from one texture (`texture` or `all`) as its `wool`
 * variable, at `<ns>:block/<path>`, with one block state variant; the block item shows the
 * block model, as vanilla's carpets.
 *
 * Tags: none (`#minecraft:wool_carpets` is for wool; a project carpet joins it through a tag
 * element when it should).
 *
 * `"loot": "self"` drops the carpet, as vanilla's.
 *
 * Model slots: `carpet`.
 */
import { variant } from './blockstates';
import type { TypeLowering } from './models';

export const carpetType: TypeLowering = {
  slots: ['carpet'],
  generate: (texture) => [
    {
      slot: 'carpet',
      suffix: '',
      parent: 'minecraft:block/carpet',
      textures: { wool: texture('texture') },
    },
  ],
  blockstate: (models) => ({ variants: { '': variant(models.carpet ?? '') } }),
};
