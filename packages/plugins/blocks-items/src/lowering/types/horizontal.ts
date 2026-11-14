/**
 * `horizontal`: faces one of four directions, towards the placer, as a furnace does (ADR 0067
 * D2). The generated model is vanilla's `orientable` from `front`, `side` and `top`.
 *
 * Model slots: `default` (facing north; also the element's `model`).
 */
import { HORIZONTAL_FACINGS, NORTH_BASED_Y, variant, variants } from './blockstates';
import type { TypeLowering } from './models';

export const horizontalType: TypeLowering = {
  slots: ['default'],
  acceptsModel: true,
  generate: (texture) => [
    {
      slot: 'default',
      suffix: '',
      parent: 'minecraft:block/orientable',
      textures: { front: texture('front'), side: texture('side'), top: texture('top') },
    },
  ],
  blockstate: (models) =>
    variants(
      HORIZONTAL_FACINGS.map(
        (facing) =>
          [{ facing }, variant(models.default ?? '', { y: NORTH_BASED_Y[facing] })] as const,
      ),
    ),
};
