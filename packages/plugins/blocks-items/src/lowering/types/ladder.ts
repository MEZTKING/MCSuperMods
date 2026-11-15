/**
 * `ladder` (ADR 0094 D1, D10): a flat ladder on the side of a block that entities climb. The
 * generated model is vanilla's `minecraft:block/ladder` from one texture (`texture` or `all`) as
 * its `texture` and `particle` variables, at `<ns>:block/<path>`. The block state is vanilla's
 * `facing` variants, the model facing north turned about Y (the `waterlogged` property does not
 * change the look). The block item is a flat `minecraft:item/generated` model of the same
 * texture, as vanilla's ladder item.
 *
 * Tags: block `climbable` (vanilla climbs every member, B440).
 *
 * `"loot": "self"` drops the ladder, as vanilla's.
 *
 * Model slots: `ladder`.
 */
import { HORIZONTAL_FACINGS, NORTH_BASED_Y, variant, variants } from './blockstates';
import type { TypeLowering } from './models';
import type { TypeTags } from './tags';

/** The block tags every ladder joins. */
export const LADDER_BLOCK_TAGS: readonly string[] = Object.freeze(['climbable']);

export const ladderType: TypeLowering = {
  slots: ['ladder'],
  generate: (texture) => {
    const ladder = texture('texture');
    return [
      {
        slot: 'ladder',
        suffix: '',
        parent: 'minecraft:block/ladder',
        textures: { particle: ladder, texture: ladder },
      },
    ];
  },
  itemTexture: (texture) => texture('texture'),
  blockstate: (models) =>
    variants(
      HORIZONTAL_FACINGS.map(
        (facing) =>
          [{ facing }, variant(models.ladder ?? '', { y: NORTH_BASED_Y[facing] })] as const,
      ),
    ),
  tags: (): TypeTags => ({ block: LADDER_BLOCK_TAGS, item: [] }),
};
