/**
 * `lantern` (ADR 0094 D1, D10): a lantern standing on a block or hanging under one. The
 * generated models are vanilla's `minecraft:block/template_lantern` at `<ns>:block/<path>` and
 * `template_hanging_lantern` at `<ns>:block/<path>_hanging`, both with the `lantern` variable
 * from one texture (`texture` or `all`). The block state is vanilla's `hanging` variants (the
 * `waterlogged` property does not change the look). The block item is a flat
 * `minecraft:item/generated` model of `textures.item` (default the block texture), as vanilla's
 * lantern item, which has a picture of its own.
 *
 * Tags: none.
 *
 * `"loot": "self"` drops the lantern, as vanilla's.
 *
 * Model slots: `lantern`, `hanging`.
 */
import { variant, variants } from './blockstates';
import type { TypeLowering } from './models';

export const lanternType: TypeLowering = {
  slots: ['lantern', 'hanging'],
  generate: (texture) => {
    const lantern = texture('texture');
    return [
      {
        slot: 'lantern',
        suffix: '',
        parent: 'minecraft:block/template_lantern',
        textures: { lantern },
      },
      {
        slot: 'hanging',
        suffix: '_hanging',
        parent: 'minecraft:block/template_hanging_lantern',
        textures: { lantern },
      },
    ];
  },
  itemTexture: (texture) => texture('item', 'texture'),
  blockstate: (models) =>
    variants([
      [{ hanging: 'false' }, variant(models.lantern ?? '')],
      [{ hanging: 'true' }, variant(models.hanging ?? models.lantern ?? '')],
    ]),
};
