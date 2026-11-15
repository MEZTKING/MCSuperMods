/**
 * `bed` (ADR 0094 D1, D10): a two-block bed, head and foot. The generated models are vanilla's
 * `minecraft:block/template_bed_head` and `template_bed_foot`, at `<ns>:block/<path>_head` and
 * `_foot`, with one picture (`textures.bed`, else `all` or the first texture) on every face
 * variable the templates leave to the bed (head `up`, `north`, `east`, `west`; foot `up`,
 * `south`, `east`, `west`) and as `particle`; the underside keeps the template's own picture.
 * The block state is vanilla's `facing` by `part` variants, the models facing north turned
 * about Y (the `occupied` property does not change the look).
 *
 * The block item is a flat `minecraft:item/generated` model of `textures.item` when given;
 * otherwise, as vanilla's bed items, a `minecraft:composite` of the head and the foot moved one
 * block south.
 *
 * Tags: `beds` (block and item): vanilla's list of beds, which `#minecraft:beds` readers (bed
 * rules, villagers' sleep checks, piglins' and raids' lists) use.
 *
 * `"loot": "self"` drops the item from the head only, surviving explosions, as vanilla's bed
 * tables, so breaking either half drops one bed.
 *
 * Model slots: `head`, `foot`.
 */
import type { JsonObject } from '@msm/plugin-api';
import { HORIZONTAL_FACINGS, NORTH_BASED_Y, variant, variants } from './blockstates';
import { readTextures, type TypeLowering } from './models';
import { both } from './tags';

/** The tags every bed joins, as a block tag and an item tag. */
export const BED_TAGS: readonly string[] = Object.freeze(['beds']);

/** The vanilla template of each half. */
export const BED_TEMPLATES: Readonly<Record<'head' | 'foot', string>> = Object.freeze({
  head: 'minecraft:block/template_bed_head',
  foot: 'minecraft:block/template_bed_foot',
});

/** The face variables each template leaves to the bed's own picture. */
const BED_FACES: Readonly<Record<'head' | 'foot', readonly string[]>> = {
  head: ['up', 'north', 'east', 'west'],
  foot: ['up', 'south', 'east', 'west'],
};

const PARTS = ['head', 'foot'] as const;

/** The translation of the foot in the composite bed item (one block south, as vanilla's). */
const FOOT_TRANSLATION = [0, 0, 1];

export const bedType: TypeLowering = {
  slots: [...PARTS],
  generate: (texture) => {
    const bed = texture('bed');
    return PARTS.map((part) => ({
      slot: part,
      suffix: `_${part}`,
      parent: BED_TEMPLATES[part],
      textures: Object.fromEntries([
        ...BED_FACES[part].map((face) => [face, bed] as const),
        ['particle', bed] as const,
      ]),
    }));
  },
  itemTextureFromData: (data) => readTextures(data).item,
  itemModel: (models): JsonObject => ({
    type: 'minecraft:composite',
    models: [
      { type: 'minecraft:model', model: models.head ?? '' },
      {
        type: 'minecraft:model',
        model: models.foot ?? models.head ?? '',
        transformation: {
          left_rotation: [0, 0, 0, 1],
          right_rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
          translation: [...FOOT_TRANSLATION],
        },
      },
    ],
  }),
  blockstate: (models) =>
    variants(
      HORIZONTAL_FACINGS.flatMap((facing) =>
        PARTS.map(
          (part) =>
            [{ facing, part }, variant(models[part] ?? '', { y: NORTH_BASED_Y[facing] })] as const,
        ),
      ),
    ),
  tags: () => both(...BED_TAGS),
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
              state: { part: 'head' },
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
