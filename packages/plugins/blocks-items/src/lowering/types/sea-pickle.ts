/**
 * `sea_pickle` (ADR 0094 D1, D10): one to four pickles that glow in water. The generated models
 * are vanilla's `minecraft:block/sea_pickle`, `two_sea_pickles`, `three_sea_pickles` and
 * `four_sea_pickles` (in water) and their `dead_` forms (dry), all from one texture (`texture`
 * or `all`, the variables `all` and `particle`, as vanilla's): `<ns>:block/<path>_one` to
 * `_four` and `_dead_one` to `_dead_four`. The block state is vanilla's `pickles` by
 * `waterlogged` variants, each a list of the four turns about Y, as vanilla's. The block item
 * shows the one-pickle model (the format has no separate item picture).
 *
 * Tags: none. Light is fixed by the state (6 to 15 by count in water, none dry; the
 * `light-fixed-by-state` validator warns about `msm:light_emitter`).
 *
 * `"loot": "self"` drops the item by count, as vanilla's sea pickle table.
 *
 * Model slots: `one`, `two`, `three`, `four` (in water, required) and `dead_one` to `dead_four`
 * (dry, optional; without one the dry state shows the model in water).
 */
import { COUNT_SLOTS, countLootTable } from './candle';
import type { ModelSpec, TypeLowering } from './models';

/** The vanilla sea pickle model of each count, in water. */
export const SEA_PICKLE_TEMPLATES: readonly string[] = Object.freeze([
  'minecraft:block/sea_pickle',
  'minecraft:block/two_sea_pickles',
  'minecraft:block/three_sea_pickles',
  'minecraft:block/four_sea_pickles',
]);

/** The vanilla sea pickle model of each count, dry. */
export const DEAD_SEA_PICKLE_TEMPLATES: readonly string[] = Object.freeze([
  'minecraft:block/dead_sea_pickle',
  'minecraft:block/two_dead_sea_pickles',
  'minecraft:block/three_dead_sea_pickles',
  'minecraft:block/four_dead_sea_pickles',
]);

/** The dry slot of a count slot. */
export const deadSlot = (slot: string): string => `dead_${slot}`;

/** The four turns of each sea pickle variant, as vanilla's. */
const turns = (model: string) => [0, 90, 180, 270].map((y) => (y === 0 ? { model } : { model, y }));

export const seaPickleType: TypeLowering = {
  slots: [...COUNT_SLOTS],
  optionalSlots: COUNT_SLOTS.map(deadSlot),
  generate: (texture) => {
    const all = texture('texture');
    const textures = { all, particle: all };
    return COUNT_SLOTS.flatMap((slot, index): ModelSpec[] => [
      { slot, suffix: `_${slot}`, parent: SEA_PICKLE_TEMPLATES[index] as string, textures },
      {
        slot: deadSlot(slot),
        suffix: `_${deadSlot(slot)}`,
        parent: DEAD_SEA_PICKLE_TEMPLATES[index] as string,
        textures,
      },
    ]);
  },
  blockstate: (models) => {
    const out: Record<string, ReturnType<typeof turns>> = {};
    COUNT_SLOTS.forEach((slot, index) => {
      const wet = models[slot] ?? '';
      const dry = models[deadSlot(slot)] ?? wet;
      out[`pickles=${index + 1},waterlogged=false`] = turns(dry);
      out[`pickles=${index + 1},waterlogged=true`] = turns(wet);
    });
    return { variants: out };
  },
  selfLoot: (context) => countLootTable(context, 'pickles', 4),
};
