/**
 * `pillar`: turns to the clicked face's axis, as logs do (ADR 0067 D2). Generated models follow
 * vanilla's logs: `cube_column` and `cube_column_horizontal` from `side` and `end`.
 *
 * Model slots: `default` (axis y; also the element's `model`), optional `horizontal` (axes x and
 * z). Without `horizontal` the `default` model is turned on its side, as vanilla basalt is.
 */
import { variant, variants } from './blockstates';
import type { TypeLowering } from './models';

export const pillarType: TypeLowering = {
  slots: ['default'],
  optionalSlots: ['horizontal'],
  acceptsModel: true,
  generate: (texture) => {
    const textures = { end: texture('end'), side: texture('side') };
    return [
      { slot: 'default', suffix: '', parent: 'minecraft:block/cube_column', textures },
      {
        slot: 'horizontal',
        suffix: '_horizontal',
        parent: 'minecraft:block/cube_column_horizontal',
        textures,
      },
    ];
  },
  blockstate: (models) => {
    const vertical = models.default ?? '';
    const horizontal = models.horizontal ?? vertical;
    return variants([
      [{ axis: 'x' }, variant(horizontal, { x: 90, y: 90 })],
      [{ axis: 'y' }, variant(vertical)],
      [{ axis: 'z' }, variant(horizontal, { x: 90 })],
    ]);
  },
};
