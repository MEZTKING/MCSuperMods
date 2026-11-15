/**
 * `cake` (ADR 0094 D1, D10): a cake of seven slices. The generated models are vanilla's
 * `minecraft:block/cake` (whole) and `cake_slice1` to `cake_slice6` from `textures.top`,
 * `bottom`, `side` and `inside` (the cut face; default `side`), with `particle` the side, at
 * `<ns>:block/<path>` and `<ns>:block/<path>_slice1` to `_slice6`; the block state is vanilla's
 * `bites` variants, 0 to 6. The block item is a flat `minecraft:item/generated` model of
 * `textures.item` when given (as vanilla's cake item), else the whole cake model.
 *
 * Tags: none (`#minecraft:candle_cakes` is for vanilla's candle cakes; a project cake takes no
 * candles, ADR 0094 D14).
 *
 * `"loot": "self"` drops the item only from a whole cake (`bites=0`), so an eaten cake is not
 * given back whole (vanilla's cake drops nothing).
 *
 * Model slots: `cake` (whole) and `slice1` to `slice6`.
 */
import type { JsonObject } from '@msm/plugin-api';
import { variant, variants } from './blockstates';
import type { ModelSpec, TypeLowering } from './models';
import { readTextures } from './models';

/** The most bites: a cake has `MAX_BITES + 1` states. */
export const MAX_BITES = 6;

/** The slot of a cake with `bites` slices eaten. */
export const cakeSlot = (bites: number): string => (bites === 0 ? 'cake' : `slice${bites}`);

const SLOTS = Array.from({ length: MAX_BITES + 1 }, (_, bites) => cakeSlot(bites));

export const cakeType: TypeLowering = {
  slots: SLOTS,
  generate: (texture) => {
    const side = texture('side');
    const faces = { bottom: texture('bottom', 'side'), particle: side, side, top: texture('top') };
    const inside = texture('inside', 'side');
    return SLOTS.map(
      (slot, bites): ModelSpec =>
        bites === 0
          ? { slot, suffix: '', parent: 'minecraft:block/cake', textures: faces }
          : {
              slot,
              suffix: `_${slot}`,
              parent: `minecraft:block/cake_${slot}`,
              textures: { ...faces, inside },
            },
    );
  },
  itemTextureFromData: (data) => readTextures(data).item,
  blockstate: (models) =>
    variants(
      SLOTS.map((slot, bites) => [{ bites: String(bites) }, variant(models[slot] ?? '')] as const),
    ),
  selfLoot: ({ blockId, itemId, namespace, path }): JsonObject => ({
    type: 'minecraft:block',
    pools: [
      {
        condition: {
          type: 'minecraft:all_of',
          terms: [
            { type: 'minecraft:match_block', blocks: blockId, state: { bites: '0' } },
            { type: 'minecraft:survives_explosion' },
          ],
        },
        entries: [{ type: 'minecraft:item', name: itemId }],
        rolls: 1,
      },
    ],
    random_sequence: `${namespace}:blocks/${path}`,
  }),
};
