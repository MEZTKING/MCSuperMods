/**
 * `growing_plant` (ADR 0103 D1, D4 and its amendment after the spike): a strand that grows one
 * block at a time from its tip, as kelp, weeping and twisting vines and cave vines. The element is
 * the tip; the strand behind it is the generated companion `<path>_plant` (vanilla's naming).
 *
 * The generated models are vanilla's `minecraft:block/cross`, as vanilla's strands: the tip at
 * `<ns>:block/<path>` from `textures.head`, the strand at `<ns>:block/<path>_plant` from
 * `textures.body` (default `head`), and for a plant with `berries` the lit models
 * `<ns>:block/<path>_berries` and `<path>_plant_berries` from `head_berries` and `body_berries`
 * when those are given (otherwise the plant shows the same model with and without berries). The
 * block states are vanilla's: one variant for a strand without berries (kelp, vines), the
 * `berries` variants for one with them (cave vines). The block item is a flat
 * `minecraft:item/generated` model of `textures.item` (default `head`), as vanilla's kelp and
 * vine items.
 *
 * Tags: block `climbable` for a climbable strand (`climbable`, default true unless
 * `needs_water`), and with `berries` `bee_growables` and `cave_vines` (bees grow the berries, as
 * on cave vines; the tag id is `TargetFacts.blocks.plantSoils.caveVines`); the strand companion
 * joins the same tags.
 *
 * `"loot": "self"`, as vanilla's tables for the family: a strand with `berries` drops the berry
 * item only while it bears them (cave vines; the item, never the strand); a water plant drops its
 * item (kelp); any other strand drops its item to shears or Silk Touch, and otherwise by Fortune's
 * chances 0.33, 0.55, 0.77 and 1 (weeping and twisting vines). The strand companion's table is the
 * same over its own id.
 *
 * Model slots: `head`, `body`, optional `head_berries`, `body_berries`.
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import { isRecord, splitResourceLocation } from '../paths';
import { nonEmptyString } from '../shared';
import type { CompanionContext } from './companions';
import {
  type ModelSpec,
  readTextures,
  type SlotModels,
  type TypeLowering,
  textureLookup,
} from './models';
import type { TypeTags } from './tags';

/** The suffix of a growing plant's strand companion (ADR 0103 D1). */
export const PLANT_COMPANION_SUFFIX = '_plant';

/** The block tag a climbable strand joins. */
export const CLIMBABLE_TAG = 'climbable';
/**
 * The block tags a strand with berries joins: bees grow it, and it counts as cave vines (the
 * second is `TargetFacts.blocks.plantSoils.caveVines` on both built-in targets).
 */
export const BERRIES_PLANT_TAGS: readonly string[] = Object.freeze(['bee_growables', 'cave_vines']);

/** Vanilla's weeping vines' chances per Fortune level without shears or Silk Touch. */
export const VINE_DROP_CHANCES: readonly number[] = Object.freeze([0.33, 0.55, 0.77, 1.0]);

/** The `berries` of a growing plant, when it is an object with an item. */
export function plantBerriesOf(data: Json | undefined): { item: string } | undefined {
  const berries = isRecord(data) ? data.berries : undefined;
  if (!isRecord(berries)) return undefined;
  const item = nonEmptyString(berries.item);
  return item === undefined ? undefined : { item };
}

/** Whether a growing plant lives in water (`needs_water`, default false). */
export const needsWater = (data: JsonObject): boolean => data.needs_water === true;

/** Whether entities climb the strand: `climbable`, default true unless `needs_water`. */
export const isClimbable = (data: JsonObject): boolean =>
  typeof data.climbable === 'boolean' ? data.climbable : !needsWater(data);

/** The block tags of the tip and of the strand. */
export function growingPlantTags(data: JsonObject): readonly string[] {
  return [
    ...(isClimbable(data) ? [CLIMBABLE_TAG] : []),
    ...(plantBerriesOf(data) === undefined ? [] : BERRIES_PLANT_TAGS),
  ];
}

const cross = (slot: string, suffix: string, texture: string): ModelSpec => ({
  slot,
  suffix,
  parent: 'minecraft:block/cross',
  textures: { cross: texture },
});

/** The models from the element's textures; the lit ones only when their textures are given. */
function growingPlantSpecs(data: JsonObject): ModelSpec[] {
  const textures = readTextures(data);
  const texture = textureLookup(textures);
  if (texture === undefined) return [];
  const specs = [
    cross('head', '', texture('head')),
    cross('body', PLANT_COMPANION_SUFFIX, texture('body', 'head')),
  ];
  if (plantBerriesOf(data) !== undefined) {
    if (textures.head_berries !== undefined) {
      specs.push(cross('head_berries', '_berries', textures.head_berries));
    }
    const bodyBerries = textures.body_berries ?? textures.head_berries;
    if (bodyBerries !== undefined) {
      specs.push(cross('body_berries', `${PLANT_COMPANION_SUFFIX}_berries`, bodyBerries));
    }
  }
  return specs;
}

/** The block state of the tip or strand: `berries` variants with berries, else one variant. */
function strandBlockstate(data: JsonObject, model: string, lit: string | undefined): JsonObject {
  if (plantBerriesOf(data) === undefined) return { variants: { '': { model } } };
  return {
    variants: { 'berries=false': { model }, 'berries=true': { model: lit ?? model } },
  };
}

/** A pool of one entry that survives explosions, as kelp's table. */
const survivingItem = (itemId: string): JsonObject => ({
  condition: { type: 'minecraft:survives_explosion' },
  entries: [{ type: 'minecraft:item', name: itemId }],
  rolls: 1,
});

/**
 * The `self` table of the tip (`blockId`) or strand, as vanilla's for the family (see the module
 * comment).
 */
export function growingPlantLoot(
  blockId: string,
  itemId: string,
  data: JsonObject,
  randomSequence: string,
): JsonObject {
  const berries = plantBerriesOf(data);
  let pool: JsonObject;
  if (berries !== undefined) {
    pool = {
      condition: { type: 'minecraft:match_block', blocks: blockId, state: { berries: 'true' } },
      entries: [{ type: 'minecraft:item', name: berries.item }],
      rolls: 1,
    };
  } else if (needsWater(data)) {
    pool = survivingItem(itemId);
  } else {
    pool = {
      entries: [
        {
          type: 'minecraft:alternatives',
          children: [
            {
              type: 'minecraft:item',
              condition: {
                type: 'minecraft:any_of',
                terms: ['minecraft:tool/can_shear', 'minecraft:tool/can_silk_touch'],
              },
              name: itemId,
            },
            {
              type: 'minecraft:item',
              condition: {
                type: 'minecraft:table_bonus',
                chances: [...VINE_DROP_CHANCES],
                enchantment: 'minecraft:fortune',
              },
              name: itemId,
            },
          ],
        },
      ],
      rolls: 1,
    };
  }
  return { type: 'minecraft:block', pools: [pool], random_sequence: randomSequence };
}

/** The random sequence `<ns>:blocks/<path>` of a companion's table. */
export const companionSequence = ({ companionId }: CompanionContext): string => {
  const { namespace, path } = splitResourceLocation(companionId);
  return `${namespace}:blocks/${path}`;
};

const headModel = (models: SlotModels): string => models.head ?? '';

export const growingPlantType: TypeLowering = {
  slots: ['head', 'body'],
  optionalSlots: ['head_berries', 'body_berries'],
  generate: () => [],
  generateFromData: growingPlantSpecs,
  itemTextureFromData: (data) => textureLookup(readTextures(data))?.('item', 'head'),
  blockstate: (models, { data }) => strandBlockstate(data, headModel(models), models.head_berries),
  tags: (data): TypeTags => ({ block: growingPlantTags(data), item: [] }),
  selfLoot: ({ blockId, itemId, data, namespace, path }) =>
    growingPlantLoot(blockId, itemId, data, `${namespace}:blocks/${path}`),
  companions: [
    {
      suffix: PLANT_COMPANION_SUFFIX,
      blockstate: (models, { data }) =>
        strandBlockstate(
          data,
          models.body ?? headModel(models),
          models.body_berries ?? models.head_berries,
        ),
      blockTags: growingPlantTags,
      selfLoot: (context) =>
        growingPlantLoot(
          context.companionId,
          context.itemId,
          context.data,
          companionSequence(context),
        ),
    },
  ],
};
