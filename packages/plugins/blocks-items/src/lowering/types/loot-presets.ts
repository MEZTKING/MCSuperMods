/**
 * The `crop` and `leaves` loot presets of `msm:block` (ADR 0068 D3, D6), written in the shape
 * of vanilla's own block loot tables (F15; the same on both built-in targets): `crop` as
 * wheat (or potatoes for a crop planted from its produce), `leaves` as oak leaves. Both go to `loot_table/blocks/<path>.json` with the random sequence
 * `<ns>:blocks/<path>`.
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import { isRecord } from '../paths';
import { nonEmptyString } from '../shared';
import { cropMaxAge } from './crop';
import type { BlockTypeName } from './index';
import type { TypeContext } from './models';

/** The loot presets other than `self`. */
export const PLANT_LOOT_PRESETS = Object.freeze(['crop', 'leaves'] as const);
export type PlantLootPreset = (typeof PLANT_LOOT_PRESETS)[number];

/** Wheat's extra seeds at the maximum age: Fortune's binomial bonus. */
const SEED_BONUS: JsonObject = {
  type: 'minecraft:apply_bonus',
  enchantment: 'minecraft:fortune',
  formula: 'minecraft:binomial_with_bonus_count',
  parameters: { extra: 3, probability: 0.5714286 },
};

/** Oak leaves' sapling chances per Fortune level. */
export const SAPLING_CHANCES: readonly number[] = Object.freeze([0.05, 0.0625, 0.083333336, 0.1]);
/** Oak leaves' stick chances per Fortune level. */
export const STICK_CHANCES: readonly number[] = Object.freeze([
  0.02, 0.022222223, 0.025, 0.033333335, 0.1,
]);
/** Oak leaves' apple chances per Fortune level, the default of `leaves_drops.extra`. */
export const EXTRA_CHANCES: readonly number[] = Object.freeze([
  0.005, 0.0055555557, 0.00625, 0.008333334, 0.025,
]);

const item = (name: string, extra: JsonObject = {}): JsonObject => ({
  type: 'minecraft:item',
  ...extra,
  name,
});

const tableBonus = (chances: readonly number[]): JsonObject => ({
  type: 'minecraft:table_bonus',
  chances: [...chances],
  enchantment: 'minecraft:fortune',
});

/** The `set_count` count of `produce_count`, or `undefined` for one. */
function produceCount(value: Json | undefined): JsonObject['count'] | undefined {
  if (typeof value === 'number') return value === 1 ? undefined : value;
  if (isRecord(value) && typeof value.min === 'number' && typeof value.max === 'number') {
    return { type: 'minecraft:uniform', max: value.max, min: value.min };
  }
  return undefined;
}

/**
 * The `crop` preset: at the maximum age (`minecraft:match_block` on `age`) the produce, else
 * the seed item, and with `seed_bonus` (default true) Fortune's extra seeds at the maximum age;
 * the whole table decays in explosions, as wheat's. A crop planted from its produce
 * (`produce` is the block item) with one produce is written as potatoes: always the produce,
 * plus the bonus. Without a block item only the produce drops, at the maximum age.
 *
 * @returns The table, or `undefined` without `crop_drops.produce`.
 */
export function cropLootTable(context: TypeContext): JsonObject | undefined {
  const { blockId, itemId, namespace, path, data } = context;
  const drops = isRecord(data.crop_drops) ? data.crop_drops : undefined;
  const produce = nonEmptyString(drops?.produce);
  if (produce === undefined) return undefined;
  const count = produceCount(drops?.produce_count);
  const seedBonus = drops?.seed_bonus !== false;
  const mature: JsonObject = {
    type: 'minecraft:match_block',
    blocks: blockId,
    state: { age: String(cropMaxAge(data)) },
  };
  const produceEntry = (extra: JsonObject = {}): JsonObject =>
    item(
      produce,
      count === undefined ? extra : { ...extra, modifier: { type: 'minecraft:set_count', count } },
    );
  const pools: JsonObject[] = [];
  if (itemId === undefined) {
    pools.push({ condition: mature, entries: [produceEntry()], rolls: 1 });
  } else {
    if (itemId === produce && count === undefined) {
      pools.push({ entries: [item(produce)], rolls: 1 });
    } else {
      pools.push({
        entries: [
          {
            type: 'minecraft:alternatives',
            children: [produceEntry({ condition: mature }), item(itemId)],
          },
        ],
        rolls: 1,
      });
    }
    if (seedBonus) {
      pools.push({
        condition: mature,
        entries: [item(itemId, { modifier: SEED_BONUS })],
        rolls: 1,
      });
    }
  }
  return {
    type: 'minecraft:block',
    modifier: { type: 'minecraft:explosion_decay' },
    pools,
    random_sequence: `${namespace}:blocks/${path}`,
  };
}

/** Shears or Silk Touch, as vanilla's leaves test them. */
const SHEARS_OR_SILK_TOUCH: JsonObject = {
  type: 'minecraft:any_of',
  terms: ['minecraft:tool/can_shear', 'minecraft:tool/can_silk_touch'],
};
const NOT_SHEARS_OR_SILK_TOUCH: JsonObject = {
  type: 'minecraft:inverted',
  term: SHEARS_OR_SILK_TOUCH,
};

/** A `survives_explosion` and `table_bonus` condition. */
const survivesWithChances = (chances: readonly number[]): JsonObject => ({
  type: 'minecraft:all_of',
  terms: [{ type: 'minecraft:survives_explosion' }, tableBonus(chances)],
});

/** The `extra.chances` of `leaves_drops`, numbers only, or the apple's. */
function extraChances(value: unknown): readonly number[] {
  if (!Array.isArray(value)) return EXTRA_CHANCES;
  const chances = value.filter((chance): chance is number => typeof chance === 'number');
  return chances.length > 0 ? chances : EXTRA_CHANCES;
}

/**
 * The `leaves` preset, as vanilla oak leaves: shears or Silk Touch drop the leaves (with a
 * block item), otherwise a chance of the sapling (`leaves_drops.sapling`), of one or two sticks
 * (`sticks`, default true) and of the extra item (`extra`, the apple's chances by default).
 *
 * @returns The table; `undefined` when it would have no pool (no block item, sapling, sticks or
 *   extra item).
 */
export function leavesLootTable(context: TypeContext): JsonObject | undefined {
  const { itemId, namespace, path, data } = context;
  const drops = isRecord(data.leaves_drops) ? data.leaves_drops : {};
  const sapling = nonEmptyString(drops.sapling);
  const extra = isRecord(drops.extra) ? drops.extra : undefined;
  const extraItem = nonEmptyString(extra?.item);
  const pools: JsonObject[] = [];
  const first: JsonObject[] = [];
  if (itemId !== undefined) first.push(item(itemId, { condition: SHEARS_OR_SILK_TOUCH }));
  if (sapling !== undefined) {
    first.push(item(sapling, { condition: survivesWithChances(SAPLING_CHANCES) }));
  }
  if (first.length === 1 && first[0] !== undefined) {
    pools.push({ entries: first, rolls: 1 });
  } else if (first.length > 1) {
    pools.push({ entries: [{ type: 'minecraft:alternatives', children: first }], rolls: 1 });
  }
  if (drops.sticks !== false) {
    pools.push({
      condition: NOT_SHEARS_OR_SILK_TOUCH,
      entries: [
        item('minecraft:stick', {
          condition: tableBonus(STICK_CHANCES),
          modifier: [
            {
              type: 'minecraft:set_count',
              count: { type: 'minecraft:uniform', max: 2, min: 1 },
            },
            { type: 'minecraft:explosion_decay' },
          ],
        }),
      ],
      rolls: 1,
    });
  }
  if (extraItem !== undefined) {
    pools.push({
      condition: NOT_SHEARS_OR_SILK_TOUCH,
      entries: [item(extraItem, { condition: survivesWithChances(extraChances(extra?.chances)) })],
      rolls: 1,
    });
  }
  if (pools.length === 0) return undefined;
  return { type: 'minecraft:block', pools, random_sequence: `${namespace}:blocks/${path}` };
}

/** Whether `loot` names a plant loot preset. */
export const isPlantLootPreset = (loot: string | undefined): loot is PlantLootPreset =>
  (PLANT_LOOT_PRESETS as readonly string[]).includes(loot ?? '');

/**
 * The table of a plant loot preset on a block of `type`: `crop` only on crops (it matches the
 * `age` state), `leaves` on any type (it reads no state).
 *
 * @returns The table, or `undefined` when the preset does not apply or has nothing to drop
 *   (the validators report both).
 */
export function plantLootTable(
  type: BlockTypeName,
  preset: PlantLootPreset,
  context: TypeContext,
): JsonObject | undefined {
  if (preset === 'crop') return type === 'crop' ? cropLootTable(context) : undefined;
  return leavesLootTable(context);
}
