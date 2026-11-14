/**
 * `stairs`: stairs that shape into corners next to other stairs (ADR 0067 D2). Generated models
 * are vanilla's `stairs`, `inner_stairs` and `outer_stairs` from `top`, `bottom` and `side`
 * (an empty top or bottom takes `all`, else `side`; see `TextureLookup`);
 * the block state turns them as vanilla's stairs do (`uvlock` on every turned variant).
 *
 * Model slots: `straight` (also the item), `inner`, `outer`.
 */
import { EAST_BASED_Y, HORIZONTAL_FACINGS, variant, variants } from './blockstates';
import type { TypeLowering } from './models';

const HALVES = ['bottom', 'top'] as const;
const SHAPES = ['inner_left', 'inner_right', 'outer_left', 'outer_right', 'straight'] as const;

export const stairsType: TypeLowering = {
  slots: ['straight', 'inner', 'outer'],
  generate: (texture) => {
    const textures = {
      bottom: texture('bottom', 'side'),
      side: texture('side'),
      top: texture('top', 'side'),
    };
    return [
      { slot: 'straight', suffix: '', parent: 'minecraft:block/stairs', textures },
      { slot: 'inner', suffix: '_inner', parent: 'minecraft:block/inner_stairs', textures },
      { slot: 'outer', suffix: '_outer', parent: 'minecraft:block/outer_stairs', textures },
    ];
  },
  blockstate: (models) => {
    const entries = HORIZONTAL_FACINGS.flatMap((facing) =>
      HALVES.flatMap((half) =>
        SHAPES.map((shape) => {
          const model =
            shape === 'straight'
              ? models.straight
              : shape.startsWith('inner')
                ? models.inner
                : models.outer;
          const left = shape.endsWith('_left');
          const right = shape.endsWith('_right');
          let y = EAST_BASED_Y[facing];
          if (half === 'bottom' && left) y += 270;
          if (half === 'top' && right) y += 90;
          const x = half === 'top' ? 180 : 0;
          const uvlock = x !== 0 || y % 360 !== 0;
          return [{ facing, half, shape }, variant(model ?? '', { x, y, uvlock })] as const;
        }),
      ),
    );
    return variants(entries);
  },
  tags: () => ({ block: ['stairs'], item: ['stairs'] }),
};
