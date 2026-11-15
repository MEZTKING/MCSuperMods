/**
 * `berry_bush` (ADR 0094 D1, D10): a bush of four ages harvested for `berry`. The generated
 * models are vanilla's `minecraft:block/cross` from `textures.stages`, one model
 * `<ns>:block/<path>_stage<i>` per texture, as vanilla's sweet berry bush; fewer textures than
 * the four ages are spread over them as a crop's are (the first age on the first, the last on
 * the last). The block state is vanilla's `age` variants, 0 to 3. The block item (usually the
 * berry itself, ADR 0068 D2) is a flat `minecraft:item/generated` model of the last stage
 * texture unless `models.item` names one.
 *
 * Tags: block `bee_growables` (bees carrying pollen grow it, as vanilla's bush).
 *
 * `"loot": "self"` is vanilla's sweet berry bush table with the element's `berry` and
 * `harvest` counts: `full` berries at age 3 and `ripe` at age 2 (defaults `[2, 3]` and
 * `[1, 2]`, measured at B440), each with Fortune's uniform bonus, the whole table decaying in
 * explosions; nothing at ages 0 and 1, as vanilla.
 *
 * Model slots: `stage0` (required), optional `stage1` to `stage3`: the age models in order.
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import { isRecord } from '../paths';
import { nonEmptyString } from '../shared';
import { variant, variants } from './blockstates';
import { cropStageSlot, stageModelIndex } from './crop';
import type { ModelSpec, SlotModels, TypeLowering } from './models';
import type { TypeTags } from './tags';

/** The block tags every berry bush joins. */
export const BERRY_BUSH_BLOCK_TAGS: readonly string[] = Object.freeze(['bee_growables']);

/** The ages of a berry bush: 0 to 3. */
export const BERRY_BUSH_AGES = 4;

/** Default harvest counts, as vanilla's sweet berries (B440). */
export const DEFAULT_HARVEST: Readonly<{ ripe: readonly number[]; full: readonly number[] }> =
  Object.freeze({ ripe: Object.freeze([1, 2]), full: Object.freeze([2, 3]) });

/** The non-empty `textures.stages`, at most `ages` of them, up to the first empty one. */
export function ageTextures(data: JsonObject, ages: number): string[] {
  const stages = isRecord(data.textures) ? data.textures.stages : undefined;
  if (!Array.isArray(stages)) return [];
  const out: string[] = [];
  for (const value of stages) {
    const texture = nonEmptyString(value);
    if (texture === undefined) break;
    out.push(texture);
  }
  return out.slice(0, ages);
}

/** The model of each age when the stage slots hold the leading run of filled models. */
export function ageModels(models: SlotModels, ages: number): string[] {
  let count = 0;
  while (count < ages && models[cropStageSlot(count)] !== undefined) count += 1;
  return Array.from(
    { length: ages },
    (_, age) => models[cropStageSlot(stageModelIndex(age, Math.max(count, 1), ages))] ?? '',
  );
}

/** A `[min, max]` count, or the default. */
function countPair(value: Json | undefined, fallback: readonly number[]): readonly number[] {
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((entry) => typeof entry === 'number')
  ) {
    return value as number[];
  }
  return fallback;
}

/** A `set_count` count: a constant, or a uniform range. */
const countOf = ([min, max]: readonly number[]): Json =>
  min === max ? (min ?? 1) : { type: 'minecraft:uniform', max: max ?? 1, min: min ?? 1 };

/** The berry bush's `berry`, or `undefined`. */
export const berryOf = (data: JsonObject): string | undefined => nonEmptyString(data.berry);

const STAGE_SLOTS = Array.from({ length: BERRY_BUSH_AGES }, (_, index) => cropStageSlot(index));

export const berryBushType: TypeLowering = {
  slots: [cropStageSlot(0)],
  optionalSlots: STAGE_SLOTS.slice(1),
  generate: () => [],
  generateFromData: (data) =>
    ageTextures(data, BERRY_BUSH_AGES).map(
      (texture, index): ModelSpec => ({
        slot: cropStageSlot(index),
        suffix: `_${cropStageSlot(index)}`,
        parent: 'minecraft:block/cross',
        textures: { cross: texture },
      }),
    ),
  itemTextureFromData: (data) => ageTextures(data, BERRY_BUSH_AGES).at(-1),
  blockstate: (models) =>
    variants(
      ageModels(models, BERRY_BUSH_AGES).map(
        (model, age) => [{ age: String(age) }, variant(model)] as const,
      ),
    ),
  tags: (): TypeTags => ({ block: BERRY_BUSH_BLOCK_TAGS, item: [] }),
  selfLoot: ({ blockId, data, namespace, path }): JsonObject => {
    const berry = berryOf(data);
    const harvest = isRecord(data.harvest) ? data.harvest : {};
    const pool = (age: number, counts: readonly number[]): JsonObject => ({
      condition: { type: 'minecraft:match_block', blocks: blockId, state: { age: String(age) } },
      entries: [{ type: 'minecraft:item', name: berry ?? '' }],
      modifier: [
        { type: 'minecraft:set_count', count: countOf(counts) },
        {
          type: 'minecraft:apply_bonus',
          enchantment: 'minecraft:fortune',
          formula: 'minecraft:uniform_bonus_count',
          parameters: { bonusMultiplier: 1 },
        },
      ],
      rolls: 1,
    });
    return {
      type: 'minecraft:block',
      modifier: { type: 'minecraft:explosion_decay' },
      pools:
        berry === undefined
          ? []
          : [
              pool(3, countPair(harvest.full, DEFAULT_HARVEST.full)),
              pool(2, countPair(harvest.ripe, DEFAULT_HARVEST.ripe)),
            ],
      random_sequence: `${namespace}:blocks/${path}`,
    };
  },
};
