/**
 * `fence`: connects to fences of the same kind and solid blocks (ADR 0067 D2). Generated models
 * are vanilla's `fence_post`, `fence_side` and `fence_inventory` from `texture`. A wooden fence
 * (editor field `wooden`, default from `sound_type`) joins `#minecraft:wooden_fences`.
 *
 * Model slots: `post`, `side`, `inventory` (the item).
 */
import { NORTH_BASED_Y, part, variant } from './blockstates';
import { slotSpecs, type TypeLowering } from './models';
import { fenceTags } from './tags';

const SIDES = ['north', 'east', 'south', 'west'] as const;

export const fenceType: TypeLowering = {
  slots: ['post', 'side', 'inventory'],
  itemSlot: 'inventory',
  generate: (texture) =>
    slotSpecs(['post', 'side', 'inventory'], (slot) => `minecraft:block/fence_${slot}`, {
      texture: texture('texture'),
    }),
  blockstate: (models) => ({
    multipart: [
      part(variant(models.post ?? '')),
      ...SIDES.map((side) =>
        part(variant(models.side ?? '', { y: NORTH_BASED_Y[side], uvlock: true }), {
          [side]: 'true',
        }),
      ),
    ],
  }),
  tags: fenceTags,
};
