/**
 * `candle` (ADR 0094 D1, D10): one to four candles that flint and steel lights. The generated
 * models are vanilla's candle templates, `minecraft:block/template_candle` and
 * `template_two_candles` to `template_four_candles`, each written unlit from `textures.candle`
 * and lit from `textures.lit` (default `candle`) with the texture variables `all` and
 * `particle`, as vanilla's candle models: `<ns>:block/<path>_one_candle` to `_four_candles` and
 * `_one_candle_lit` to `_four_candles_lit`. The block state is vanilla's `candles` by `lit`
 * variants (the `waterlogged` property does not change the look). The block item is a flat
 * `minecraft:item/generated` model of `textures.item` (default `candle`), as vanilla's candle
 * item.
 *
 * Tags: `candles` (block and item): vanilla lights only `#minecraft:candles` with flint and
 * steel (B440, S4).
 *
 * `"loot": "self"` drops the item by count (two from two candles), decaying in explosions, in
 * the shape of vanilla's candle table. The shared count table ({@link countLootTable}) is also
 * the self loot of `sea_pickle` and `layers`.
 *
 * Model slots: `one`, `two`, `three`, `four` (unlit, required) and `one_lit` to `four_lit`
 * (optional; without one the lit state shows the unlit model).
 */
import type { JsonObject } from '@msm/plugin-api';
import { variant, variants } from './blockstates';
import type { ModelSpec, TypeContext, TypeLowering } from './models';
import { both } from './tags';

/** The tags every candle joins, as a block tag and an item tag. */
export const CANDLE_TAGS: readonly string[] = Object.freeze(['candles']);

/** The counts of a candle or sea pickle block, as slot names. */
export const COUNT_SLOTS = Object.freeze(['one', 'two', 'three', 'four'] as const);

/** The vanilla candle template of each count. */
export const CANDLE_TEMPLATES: readonly string[] = Object.freeze([
  'minecraft:block/template_candle',
  'minecraft:block/template_two_candles',
  'minecraft:block/template_three_candles',
  'minecraft:block/template_four_candles',
]);

const CANDLE_SUFFIXES = ['_one_candle', '_two_candles', '_three_candles', '_four_candles'];

/** The lit slot of a count slot. */
export const litSlot = (slot: string): string => `${slot}_lit`;

/**
 * A self loot table that drops the item by the block's count state, as vanilla's candles, sea
 * pickles and snow layers: one roll of the item with a `set_count` of `n` matched on
 * `<property>=n` for each count from 2 to `max`, then `explosion_decay`.
 */
export function countLootTable(
  context: TypeContext & { itemId: string },
  property: string,
  max: number,
): JsonObject {
  const { blockId, itemId, namespace, path } = context;
  const counts: JsonObject[] = [];
  for (let count = 2; count <= max; count += 1) {
    counts.push({
      type: 'minecraft:set_count',
      condition: {
        type: 'minecraft:match_block',
        blocks: blockId,
        state: { [property]: String(count) },
      },
      count,
    });
  }
  return {
    type: 'minecraft:block',
    pools: [
      {
        entries: [
          {
            type: 'minecraft:item',
            modifier: [...counts, { type: 'minecraft:explosion_decay' }],
            name: itemId,
          },
        ],
        rolls: 1,
      },
    ],
    random_sequence: `${namespace}:blocks/${path}`,
  };
}

export const candleType: TypeLowering = {
  slots: [...COUNT_SLOTS],
  optionalSlots: COUNT_SLOTS.map(litSlot),
  generate: (texture) => {
    const unlit = texture('candle');
    const lit = texture('lit', 'candle');
    return COUNT_SLOTS.flatMap((slot, index): ModelSpec[] => {
      const parent = CANDLE_TEMPLATES[index] as string;
      const suffix = CANDLE_SUFFIXES[index] as string;
      return [
        { slot, suffix, parent, textures: { all: unlit, particle: unlit } },
        {
          slot: litSlot(slot),
          suffix: `${suffix}_lit`,
          parent,
          textures: { all: lit, particle: lit },
        },
      ];
    });
  },
  itemTexture: (texture) => texture('item', 'candle'),
  blockstate: (models) =>
    variants(
      COUNT_SLOTS.flatMap((slot, index) => {
        const unlit = models[slot] ?? '';
        const lit = models[litSlot(slot)] ?? unlit;
        return [
          [{ candles: String(index + 1), lit: 'false' }, variant(unlit)] as const,
          [{ candles: String(index + 1), lit: 'true' }, variant(lit)] as const,
        ];
      }),
    ),
  tags: () => both(...CANDLE_TAGS),
  selfLoot: (context) => countLootTable(context, 'candles', 4),
};
