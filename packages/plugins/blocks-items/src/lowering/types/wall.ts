/**
 * `wall`: connects to walls and solid blocks (ADR 0067 D2). Generated models are vanilla's
 * `template_wall_post`, `template_wall_side`, `template_wall_side_tall` and `wall_inventory`,
 * whose one texture variable `wall` takes `texture`, else `all`, else `side` (the templates
 * have no separate top and bottom).
 *
 * Model slots: `post`, `side`, `side_tall`, `inventory` (the item).
 */
import { NORTH_BASED_Y, part, variant } from './blockstates';
import { slotSpecs, type TypeLowering } from './models';

const PARENTS: Readonly<Record<string, string>> = {
  post: 'minecraft:block/template_wall_post',
  side: 'minecraft:block/template_wall_side',
  side_tall: 'minecraft:block/template_wall_side_tall',
  inventory: 'minecraft:block/wall_inventory',
};

/** Vanilla's multipart order: north, east, south, west. */
const SIDES = ['north', 'east', 'south', 'west'] as const;

export const wallType: TypeLowering = {
  slots: ['post', 'side', 'side_tall', 'inventory'],
  itemSlot: 'inventory',
  generate: (texture) =>
    slotSpecs(Object.keys(PARENTS), (slot) => PARENTS[slot] ?? '', {
      wall: texture('texture', 'all', 'side'),
    }),
  blockstate: (models) => ({
    multipart: [
      part(variant(models.post ?? ''), { up: 'true' }),
      ...(['low', 'tall'] as const).flatMap((height) =>
        SIDES.map((side) =>
          part(
            variant((height === 'low' ? models.side : models.side_tall) ?? '', {
              y: NORTH_BASED_Y[side],
              uvlock: true,
            }),
            { [side]: height },
          ),
        ),
      ),
    ],
  }),
  tags: () => ({ block: ['walls'], item: ['walls'] }),
};
