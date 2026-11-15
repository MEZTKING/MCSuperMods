/**
 * `chain` (ADR 0094 D1, D10): a thin chain along an axis. The generated model is vanilla's
 * `minecraft:block/template_chain` from one texture (`texture` or `all`) as its `texture`
 * variable (the template takes `all` and the breaking particles from it), at
 * `<ns>:block/<path>`. The block state is vanilla's `axis` variants: `y` as the model stands,
 * `x` and `z` laid down (the `waterlogged` property does not change the look). The block item is
 * a flat `minecraft:item/generated` model of `textures.item` (default the block texture), as
 * vanilla's chain item, which has a picture of its own.
 *
 * Tags: none.
 *
 * `"loot": "self"` drops the chain, as vanilla's.
 *
 * Model slots: `chain`.
 */
import { variant, variants } from './blockstates';
import type { TypeLowering } from './models';

export const chainType: TypeLowering = {
  slots: ['chain'],
  generate: (texture) => [
    {
      slot: 'chain',
      suffix: '',
      parent: 'minecraft:block/template_chain',
      textures: { texture: texture('texture') },
    },
  ],
  itemTexture: (texture) => texture('item', 'texture'),
  blockstate: (models) => {
    const chain = models.chain ?? '';
    return variants([
      [{ axis: 'x' }, variant(chain, { x: 90, y: 90 })],
      [{ axis: 'y' }, variant(chain)],
      [{ axis: 'z' }, variant(chain, { x: 90 })],
    ]);
  },
};
