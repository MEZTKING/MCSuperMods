/**
 * `tall_plant` (ADR 0094 D1, D10): a plant two blocks high, as tall flowers and tall grass. The
 * generated models are vanilla's `minecraft:block/cross` from `textures.bottom` and
 * `textures.top`, at `<ns>:block/<path>_bottom` and `_top`, as vanilla's lilac; the block state
 * is vanilla's `half` variants. The block item is a flat `minecraft:item/generated` model of the
 * top texture, as vanilla's tall flower items.
 *
 * Tags: none (vanilla's flower tags carry bee and trade behaviour a project plant opts into
 * through tag elements).
 *
 * `"loot": "self"` drops the item from the lower half only, as vanilla's lilac table, so
 * breaking either half drops one item.
 *
 * Model slots: `bottom`, `top`.
 */
import type { JsonObject } from '@msm/plugin-api';
import { variant } from './blockstates';
import type { TypeLowering } from './models';

export const tallPlantType: TypeLowering = {
  slots: ['bottom', 'top'],
  generate: (texture) => [
    {
      slot: 'bottom',
      suffix: '_bottom',
      parent: 'minecraft:block/cross',
      textures: { cross: texture('bottom', 'top') },
    },
    {
      slot: 'top',
      suffix: '_top',
      parent: 'minecraft:block/cross',
      textures: { cross: texture('top', 'bottom') },
    },
  ],
  itemTexture: (texture) => texture('top', 'bottom'),
  blockstate: (models) => ({
    variants: {
      'half=lower': variant(models.bottom ?? ''),
      'half=upper': variant(models.top ?? models.bottom ?? ''),
    },
  }),
  selfLoot: ({ blockId, itemId, namespace, path }): JsonObject => ({
    type: 'minecraft:block',
    pools: [
      {
        condition: { type: 'minecraft:survives_explosion' },
        entries: [
          {
            type: 'minecraft:item',
            condition: {
              type: 'minecraft:match_block',
              blocks: blockId,
              state: { half: 'lower' },
            },
            name: itemId,
          },
        ],
        rolls: 1,
      },
    ],
    random_sequence: `${namespace}:blocks/${path}`,
  }),
};
