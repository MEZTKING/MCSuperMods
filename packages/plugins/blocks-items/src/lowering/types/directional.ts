/**
 * `directional`: faces one of six directions, as an observer or dropper does (ADR 0067 D2).
 * Generated models follow vanilla's dropper: `orientable` from `front`, `side` and `top`, and
 * `orientable_vertical` from `front` and `side` for up and down.
 *
 * Model slots: `default` (facing north; also the element's `model`), optional `vertical`
 * (facing up). Without `vertical` the `default` model is turned up and down, as vanilla's
 * observer is.
 */
import { HORIZONTAL_FACINGS, NORTH_BASED_Y, variant, variants } from './blockstates';
import type { TypeLowering } from './models';

export const directionalType: TypeLowering = {
  slots: ['default'],
  optionalSlots: ['vertical'],
  acceptsModel: true,
  generate: (texture) => [
    {
      slot: 'default',
      suffix: '',
      parent: 'minecraft:block/orientable',
      textures: { front: texture('front'), side: texture('side'), top: texture('top') },
    },
    {
      slot: 'vertical',
      suffix: '_vertical',
      parent: 'minecraft:block/orientable_vertical',
      textures: { front: texture('front'), side: texture('side') },
    },
  ],
  blockstate: (models) => {
    const model = models.default ?? '';
    const vertical = models.vertical;
    const down = vertical === undefined ? variant(model, { x: 90 }) : variant(vertical, { x: 180 });
    const up = vertical === undefined ? variant(model, { x: 270 }) : variant(vertical);
    return variants([
      [{ facing: 'down' }, down],
      ...HORIZONTAL_FACINGS.map(
        (facing) => [{ facing }, variant(model, { y: NORTH_BASED_Y[facing] })] as const,
      ),
      [{ facing: 'up' }, up],
    ]);
  },
};
