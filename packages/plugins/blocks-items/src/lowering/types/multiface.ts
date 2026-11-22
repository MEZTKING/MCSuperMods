/**
 * `multiface` (ADR 0103 D1): a thin layer on any face of the blocks around it that spreads by
 * bone meal, as glow lichen. The generated model is vanilla's `minecraft:block/glow_lichen` from
 * one texture (`texture` or `all`) as its `glow_lichen` and `particle` variables, at
 * `<ns>:block/<path>`; the block state is vanilla's multipart: the model on each face that is
 * `true`, turned with `uvlock` as vanilla's, and on every face when no face is set. Water is drawn
 * by the game, so the block state leaves `waterlogged` out, as vanilla's does. The block item is a
 * flat `minecraft:item/generated` model of the texture, as vanilla's glow lichen item.
 *
 * Tags: none.
 *
 * `"loot": "self"` is vanilla's glow lichen table: shears drop one item per face the block
 * covers, the drop decaying in explosions; nothing otherwise.
 *
 * Model slots: `face`.
 */
import type { JsonObject } from '@msm/plugin-api';
import { part, variant } from './blockstates';
import type { TypeLowering } from './models';

/** No face set: vanilla draws the layer on every face then. */
const NO_FACE = {
  down: 'false',
  east: 'false',
  north: 'false',
  south: 'false',
  up: 'false',
  west: 'false',
};

/** Each face with the turn of the model, in vanilla's order. */
const FACES: readonly (readonly [string, { x?: number; y?: number }])[] = [
  ['north', {}],
  ['east', { y: 90 }],
  ['south', { y: 180 }],
  ['west', { y: 270 }],
  ['up', { x: 270 }],
  ['down', { x: 90 }],
];

/** The faces in the order of vanilla's glow lichen table. */
const LOOT_FACES = ['down', 'up', 'north', 'south', 'west', 'east'] as const;

export const multifaceType: TypeLowering = {
  slots: ['face'],
  generate: (texture) => {
    const picture = texture('texture');
    return [
      {
        slot: 'face',
        suffix: '',
        parent: 'minecraft:block/glow_lichen',
        textures: { glow_lichen: picture, particle: picture },
      },
    ];
  },
  itemTexture: (texture) => texture('texture'),
  blockstate: (models) => {
    const model = models.face ?? '';
    const multipart: JsonObject[] = FACES.flatMap(([face, rotation]) => {
      const turned = rotation.x === undefined && rotation.y === undefined;
      const apply = variant(model, turned ? {} : { ...rotation, uvlock: true });
      return [part(apply, { [face]: 'true' }), part(apply, NO_FACE)];
    });
    return { multipart };
  },
  selfLoot: ({ blockId, itemId, namespace, path }): JsonObject => ({
    type: 'minecraft:block',
    pools: [
      {
        entries: [
          {
            type: 'minecraft:item',
            condition: 'minecraft:tool/can_shear',
            modifier: [
              ...LOOT_FACES.map((face) => ({
                type: 'minecraft:set_count',
                add: true,
                condition: {
                  type: 'minecraft:match_block',
                  blocks: blockId,
                  state: { [face]: 'true' },
                },
                count: 1,
              })),
              { type: 'minecraft:set_count', add: true, count: -1 },
              { type: 'minecraft:explosion_decay' },
            ],
            name: itemId,
          },
        ],
        rolls: 1,
      },
    ],
    random_sequence: `${namespace}:blocks/${path}`,
  }),
};
