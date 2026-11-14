/**
 * `sapling` (ADR 0068 D4): a plant that grows into its tree feature. The generated model is
 * vanilla's `minecraft:block/cross` from `textures.sapling` at `<ns>:block/<path>`, and the item
 * a flat `minecraft:item/generated` model of the same texture at `<item ns>:item/<item path>`,
 * as vanilla's saplings. The block state has one variant (`stage` does not change the look).
 * No potted plant is made (ADR 0067 D11). `"loot": "self"` drops the sapling, as vanilla's.
 *
 * Tags: `saplings` (block and item).
 *
 * Model slots: `sapling`.
 */
import { variant } from './blockstates';
import type { TypeLowering } from './models';
import { both } from './tags';

/** The tags every sapling joins, as a block tag and an item tag. */
export const SAPLING_TAGS: readonly string[] = Object.freeze(['saplings']);

export const saplingType: TypeLowering = {
  slots: ['sapling'],
  generate: (texture) => [
    {
      slot: 'sapling',
      suffix: '',
      parent: 'minecraft:block/cross',
      textures: { cross: texture('sapling') },
    },
  ],
  itemTexture: (texture) => texture('sapling'),
  blockstate: (models) => ({ variants: { '': variant(models.sapling ?? '') } }),
  tags: () => both(...SAPLING_TAGS),
};
