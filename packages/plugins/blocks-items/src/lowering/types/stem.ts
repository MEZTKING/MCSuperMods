/**
 * `stem` (ADR 0094 D1, D3, D10): a stem that grows through ages 0 to 7, then grows its `fruit`
 * on a neighbouring block and turns into its generated companion `<path>_attached`, bent
 * towards the fruit. The generated models are vanilla's `minecraft:block/stem_growth0` to
 * `stem_growth7` at `<ns>:block/<path>_stage0` to `_stage7`, with the variable `stem` from
 * `textures.stem` (else the first texture), and `stem_fruit` at `<ns>:block/<path>_attached`
 * with `stem` and `upperstem` (`textures.attached`, default the stem texture), as vanilla's
 * melon stem; the client tints them by age as vanilla's. The stem's block state is vanilla's
 * `age` variants; the attached stem's is vanilla's `facing` variants, the model bent west
 * turned about Y. The block item (usually seeds with their own `item.id`) is a flat
 * `minecraft:item/generated` model of the stem texture unless `models.item` names one.
 *
 * Tags: block `crops`, `bee_growables` and `maintains_farmland` (the crop's tags, so bees help
 * it grow and the farmland under it stays), the attached stem `maintains_farmland`.
 *
 * `"loot": "self"` drops the item by age in the shape of vanilla's melon stem table (three
 * tries, each with a chance of `(age + 1) / 15`, decaying in explosions), and the attached stem
 * three tries at `8 / 15`, as vanilla's attached melon stem.
 *
 * Model slots: `stage0` to `stage7`, `attached`.
 */
import type { JsonObject } from '@msm/plugin-api';
import { splitResourceLocation } from '../paths';
import { variant, variants } from './blockstates';
import { CROP_BLOCK_TAGS, cropStageSlot } from './crop';
import { ATTACHED_COMPANION_SUFFIX, type TypeLowering } from './models';
import type { TypeTags } from './tags';

/** The ages of a stem: 0 to 7, as vanilla's. */
export const STEM_AGES = 8;

/** The block tags every stem joins (a crop's). */
export const STEM_BLOCK_TAGS: readonly string[] = CROP_BLOCK_TAGS;
/** The block tags every attached stem joins. */
export const ATTACHED_STEM_BLOCK_TAGS: readonly string[] = Object.freeze(['maintains_farmland']);

/** Degrees the attached model (bent west) turns about Y to face each direction. */
export const WEST_BASED_Y: Readonly<Record<string, number>> = Object.freeze({
  west: 0,
  north: 90,
  east: 180,
  south: 270,
});

const STAGE_SLOTS = Array.from({ length: STEM_AGES }, (_, age) => cropStageSlot(age));

/** The chance of each of the three tries at `age`: `(age + 1) / 15`, as vanilla's. */
export const stemSeedChance = (age: number): number => Number(((age + 1) / 15).toFixed(8));

/** The binomial count of three tries at `p`. */
const binomial = (p: number): JsonObject => ({ type: 'minecraft:binomial', n: 3, p });

/** A table of one entry of `itemId` with `modifier`, decaying in explosions. */
const seedTable = (itemId: string, randomSequence: string, modifier: JsonObject[]): JsonObject => ({
  type: 'minecraft:block',
  modifier: { type: 'minecraft:explosion_decay' },
  pools: [{ entries: [{ type: 'minecraft:item', modifier, name: itemId }], rolls: 1 }],
  random_sequence: randomSequence,
});

export const stemType: TypeLowering = {
  slots: [...STAGE_SLOTS, 'attached'],
  generate: (texture) => {
    const stem = texture('stem');
    return [
      ...STAGE_SLOTS.map((slot, age) => ({
        slot,
        suffix: `_${slot}`,
        parent: `minecraft:block/stem_growth${age}`,
        textures: { stem },
      })),
      {
        slot: 'attached',
        suffix: ATTACHED_COMPANION_SUFFIX,
        parent: 'minecraft:block/stem_fruit',
        textures: { stem, upperstem: texture('attached', 'stem') },
      },
    ];
  },
  itemTexture: (texture) => texture('stem'),
  blockstate: (models) =>
    variants(
      STAGE_SLOTS.map((slot, age) => [{ age: String(age) }, variant(models[slot] ?? '')] as const),
    ),
  tags: (): TypeTags => ({ block: STEM_BLOCK_TAGS, item: [] }),
  selfLoot: ({ blockId, itemId, namespace, path }) =>
    seedTable(
      itemId,
      `${namespace}:blocks/${path}`,
      STAGE_SLOTS.map((_, age) => ({
        type: 'minecraft:set_count',
        condition: {
          type: 'minecraft:match_block',
          blocks: blockId,
          state: { age: String(age) },
        },
        count: binomial(stemSeedChance(age)),
      })),
    ),
  companions: [
    {
      suffix: ATTACHED_COMPANION_SUFFIX,
      blockstate: (models) =>
        variants(
          Object.entries(WEST_BASED_Y).map(
            ([facing, y]) => [{ facing }, variant(models.attached ?? '', { y })] as const,
          ),
        ),
      blockTags: ATTACHED_STEM_BLOCK_TAGS,
      selfLoot: ({ companionId, itemId }) => {
        const { namespace, path } = splitResourceLocation(companionId);
        return seedTable(itemId, `${namespace}:blocks/${path}`, [
          { type: 'minecraft:set_count', count: binomial(stemSeedChance(7)) },
        ]);
      },
    },
  ],
};
