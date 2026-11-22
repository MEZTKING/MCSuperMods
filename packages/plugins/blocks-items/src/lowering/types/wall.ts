/**
 * `wall`: connects to walls and solid blocks (ADR 0067 D2). Generated models are vanilla's
 * `template_wall_post`, `template_wall_side`, `template_wall_side_tall` and `wall_inventory`,
 * whose one texture variable `wall` takes `texture`, else `all`, else `side` (the order of
 * `TextureLookup`; the templates have no separate top and bottom).
 *
 * Weathering (ADR 0104 D1): `msm:weathering` and `msm:waxable` are allowed on this type
 * (`WEATHERING_BLOCK_TYPES`); lowering passes them through to the definition with full ids
 * (`lowering/weathering.ts`), and the block states and models are the same at every stage.
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
      wall: texture('texture', 'side'),
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
