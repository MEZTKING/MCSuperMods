/**
 * `slab`: a half block that stacks into a double slab (ADR 0067 D2). Generated models are
 * vanilla's `slab` and `slab_top` and, for the double slab, `cube_bottom_top`, from `top`,
 * `bottom` and `side` (an empty top or bottom takes `all`, else `side`; see `TextureLookup`).
 * `"loot": "self"` drops two from a double slab, in vanilla's shape.
 *
 * Model slots: `bottom` (also the item), `top`, `double`.
 */
import { variant, variants } from './blockstates';
import type { TypeLowering } from './models';

export const slabType: TypeLowering = {
  slots: ['bottom', 'top', 'double'],
  generate: (texture) => {
    const textures = {
      bottom: texture('bottom', 'side'),
      side: texture('side'),
      top: texture('top', 'side'),
    };
    return [
      { slot: 'bottom', suffix: '', parent: 'minecraft:block/slab', textures },
      { slot: 'top', suffix: '_top', parent: 'minecraft:block/slab_top', textures },
      { slot: 'double', suffix: '_double', parent: 'minecraft:block/cube_bottom_top', textures },
    ];
  },
  blockstate: (models) =>
    variants([
      [{ type: 'bottom' }, variant(models.bottom ?? '')],
      [{ type: 'double' }, variant(models.double ?? '')],
      [{ type: 'top' }, variant(models.top ?? '')],
    ]),
  tags: () => ({ block: ['slabs'], item: ['slabs'] }),
  selfLoot: ({ blockId, itemId, namespace, path }) => ({
    type: 'minecraft:block',
    pools: [
      {
        rolls: 1,
        bonus_rolls: 0,
        entries: [
          {
            type: 'minecraft:item',
            name: itemId,
            modifier: [
              {
                type: 'minecraft:set_count',
                count: 2,
                condition: {
                  type: 'minecraft:match_block',
                  blocks: blockId,
                  state: { type: 'double' },
                },
              },
              { type: 'minecraft:explosion_decay' },
            ],
          },
        ],
      },
    ],
    random_sequence: `${namespace}:blocks/${path}`,
  }),
};
