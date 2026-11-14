/**
 * `crop` (ADR 0068 D3): a plant that grows through `max_age + 1` age stages (default 7, so
 * eight stages, as wheat). Generated models are vanilla's `minecraft:block/crop` from
 * `textures.stages`, one model `<ns>:block/<path>_stage<i>` per texture, as vanilla's crops.
 * Fewer stage models than stages are spread over the ages (age `a` of `n` stages shows stage
 * model `floor(a * k / n)` of `k`), so the first age shows the first model and the last age the
 * last, as vanilla potatoes repeat four models over eight ages; textures beyond the last stage
 * are not used. The block item (seeds, or the produce for a crop planted from its produce) is
 * a flat `minecraft:item/generated` model of the last stage texture unless `models.item` names
 * one (the format has no separate item texture).
 *
 * Tags: block `crops`, `bee_growables`, `maintains_farmland`; item `villager_plantable_seeds`
 * unless `villager_plantable` is `false`. The `crop` loot preset is in `loot-presets.ts`.
 *
 * Model slots: `stage0` (required), optional `stage1` to `stage15`: the stage models in order.
 * The leading run of filled slots is used; a gap ends it.
 */
import type { JsonObject } from '@msm/plugin-api';
import { isRecord } from '../paths';
import { nonEmptyString } from '../shared';
import { variant, variants } from './blockstates';
import type { ModelSpec, TypeLowering } from './models';
import type { TypeTags } from './tags';

/** The default `max_age`, as vanilla wheat (ADR 0068 D3). */
export const DEFAULT_CROP_MAX_AGE = 7;
/** The largest `max_age` the format allows. */
export const MAX_CROP_MAX_AGE = 15;

/** The block tags every crop joins. */
export const CROP_BLOCK_TAGS: readonly string[] = Object.freeze([
  'crops',
  'bee_growables',
  'maintains_farmland',
]);
/** The item tag a crop's block item joins unless `villager_plantable` is `false`. */
export const CROP_ITEM_TAGS: readonly string[] = Object.freeze(['villager_plantable_seeds']);

/** The slot of the `index`th stage model. */
export const cropStageSlot = (index: number): string => `stage${index}`;

const STAGE_SLOTS = Array.from({ length: MAX_CROP_MAX_AGE + 1 }, (_, index) =>
  cropStageSlot(index),
);

/** The crop's `max_age`: an integer from 1 to 15, else the default 7. */
export function cropMaxAge(data: JsonObject): number {
  const age = data.max_age;
  return typeof age === 'number' && Number.isInteger(age) && age >= 1 && age <= MAX_CROP_MAX_AGE
    ? age
    : DEFAULT_CROP_MAX_AGE;
}

/** The stage textures that are used: the non-empty `textures.stages`, at most one per age. */
function stageTextures(data: JsonObject): string[] {
  const textures = isRecord(data.textures) ? data.textures.stages : undefined;
  if (!Array.isArray(textures)) return [];
  const out: string[] = [];
  for (const value of textures) {
    const texture = nonEmptyString(value);
    if (texture === undefined) break;
    out.push(texture);
  }
  return out.slice(0, cropMaxAge(data) + 1);
}

/**
 * The stage model index age `age` shows when `count` stage models cover `stages` ages: the
 * models spread evenly, the first age on the first model and the last age on the last.
 */
export const stageModelIndex = (age: number, count: number, stages: number): number =>
  Math.floor((age * count) / stages);

export const cropType: TypeLowering = {
  slots: [cropStageSlot(0)],
  optionalSlots: STAGE_SLOTS.slice(1),
  generate: () => [],
  generateFromData: (data) =>
    stageTextures(data).map(
      (texture, index): ModelSpec => ({
        slot: cropStageSlot(index),
        suffix: `_${cropStageSlot(index)}`,
        parent: 'minecraft:block/crop',
        textures: { crop: texture },
      }),
    ),
  itemTextureFromData: (data) => stageTextures(data).at(-1),
  blockstate: (models, { data }) => {
    const stages = cropMaxAge(data) + 1;
    let count = 0;
    while (count < stages && models[cropStageSlot(count)] !== undefined) count += 1;
    return variants(
      Array.from({ length: stages }, (_, age) => {
        const model = models[cropStageSlot(stageModelIndex(age, count, stages))] ?? '';
        return [{ age: String(age) }, variant(model)] as const;
      }),
    );
  },
  tags: (data): TypeTags => ({
    block: CROP_BLOCK_TAGS,
    item: data.villager_plantable === false ? [] : CROP_ITEM_TAGS,
  }),
};
