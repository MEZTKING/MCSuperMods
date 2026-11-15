/**
 * `torch` (ADR 0094 D1, D3, D10): a torch standing on a block, with its generated wall
 * companion `<path>_wall` on the side of a block. The generated models are vanilla's
 * `minecraft:block/template_torch` at `<ns>:block/<path>` and `template_torch_wall` at
 * `<ns>:block/<path>_wall`, both with the `torch` variable from one texture (`texture` or
 * `all`). The torch's block state is one variant; the wall torch's is vanilla's `facing`
 * variants, the model facing east turned about Y. The block item is a flat
 * `minecraft:item/generated` model of the same texture, as vanilla's torch item; it places the
 * torch on a floor and the wall torch on a wall (`StandingAndWallBlockItem`).
 *
 * The flame particle is the element's `particle` (the target's `defaultTorchParticle` when
 * absent); it is a runtime field and changes no file here.
 *
 * Tags: none.
 *
 * `"loot": "self"` drops the item from both blocks (ADR 0094 D10).
 *
 * Model slots: `torch`, `wall`.
 */
import { EAST_BASED_Y, HORIZONTAL_FACINGS, variant, variants } from './blockstates';
import { type TypeLowering, WALL_COMPANION_SUFFIX } from './models';

export const torchType: TypeLowering = {
  slots: ['torch', 'wall'],
  generate: (texture) => {
    const torch = texture('texture');
    return [
      { slot: 'torch', suffix: '', parent: 'minecraft:block/template_torch', textures: { torch } },
      {
        slot: 'wall',
        suffix: WALL_COMPANION_SUFFIX,
        parent: 'minecraft:block/template_torch_wall',
        textures: { torch },
      },
    ];
  },
  itemTexture: (texture) => texture('texture'),
  blockstate: (models) => ({ variants: { '': variant(models.torch ?? '') } }),
  companions: [
    {
      suffix: WALL_COMPANION_SUFFIX,
      blockstate: (models) =>
        variants(
          HORIZONTAL_FACINGS.map(
            (facing) =>
              [{ facing }, variant(models.wall ?? '', { y: EAST_BASED_Y[facing] })] as const,
          ),
        ),
    },
  ],
};
