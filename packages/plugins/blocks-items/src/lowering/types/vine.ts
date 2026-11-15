/**
 * `vine` (ADR 0094 D1, D10): a vine on the sides of and under blocks that entities climb. The
 * generated model is vanilla's `minecraft:block/vine` from one texture (`texture` or `all`) as
 * its `vine` and `particle` variables, at `<ns>:block/<path>`; the block state is vanilla's
 * multipart: the model on each side that is `true`, turned with `uvlock` as vanilla's, and on
 * every side when no side is set. The block item is a flat `minecraft:item/generated` model of
 * the texture, as vanilla's vine item (without vanilla's foliage tint: a project vine's texture
 * carries its own colour).
 *
 * Tags: block `climbable` (entities climb only `#minecraft:climbable` blocks; B440, S6).
 *
 * `"loot": "self"` drops the vine.
 *
 * Model slots: `vine`.
 */
import type { JsonObject } from '@msm/plugin-api';
import { part, variant } from './blockstates';
import type { TypeLowering } from './models';
import type { TypeTags } from './tags';

/** The block tags every vine joins. */
export const VINE_BLOCK_TAGS: readonly string[] = Object.freeze(['climbable']);

/** No side set: vanilla draws the vine on every side then. */
const NO_SIDE = { east: 'false', north: 'false', south: 'false', up: 'false', west: 'false' };

/** Each side with the turn of the model, in vanilla's order. */
const SIDES: readonly (readonly [string, { x?: number; y?: number }])[] = [
  ['north', {}],
  ['east', { y: 90 }],
  ['south', { y: 180 }],
  ['west', { y: 270 }],
  ['up', { x: 270 }],
];

export const vineType: TypeLowering = {
  slots: ['vine'],
  generate: (texture) => {
    const picture = texture('texture');
    return [
      {
        slot: 'vine',
        suffix: '',
        parent: 'minecraft:block/vine',
        textures: { particle: picture, vine: picture },
      },
    ];
  },
  itemTexture: (texture) => texture('texture'),
  blockstate: (models) => {
    const model = models.vine ?? '';
    const multipart: JsonObject[] = SIDES.flatMap(([side, rotation]) => {
      const turned = rotation.x === undefined && rotation.y === undefined;
      const apply = variant(model, turned ? {} : { ...rotation, uvlock: true });
      return [part(apply, { [side]: 'true' }), part(apply, NO_SIDE)];
    });
    return { multipart };
  },
  tags: (): TypeTags => ({ block: VINE_BLOCK_TAGS, item: [] }),
};
