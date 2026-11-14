/**
 * `trapdoor` (ADR 0067 D2). Generated models are vanilla's
 * `template_orientable_trapdoor_{bottom,top,open}` from `texture`, so the texture turns with
 * the trapdoor, as most vanilla trapdoors do.
 *
 * Model slots: `bottom` (also the item), `top`, `open`.
 */
import { HORIZONTAL_FACINGS, NORTH_BASED_Y, variant, variants } from './blockstates';
import { slotSpecs, type TypeLowering } from './models';
import { trapdoorTags } from './tags';

const HALVES = ['bottom', 'top'] as const;
const OPEN = ['false', 'true'] as const;

export const trapdoorType: TypeLowering = {
  slots: ['bottom', 'top', 'open'],
  generate: (texture) =>
    slotSpecs(
      ['bottom', 'top', 'open'],
      (slot) => `minecraft:block/template_orientable_trapdoor_${slot}`,
      { texture: texture('texture') },
    ),
  blockstate: (models) =>
    variants(
      HORIZONTAL_FACINGS.flatMap((facing) =>
        HALVES.flatMap((half) =>
          OPEN.map((open) => {
            const y = NORTH_BASED_Y[facing];
            const value =
              open === 'false'
                ? variant(models[half] ?? '', { y })
                : half === 'bottom'
                  ? variant(models.open ?? '', { y })
                  : variant(models.open ?? '', { x: 180, y: y + 180 });
            return [{ facing, half, open }, value] as const;
          }),
        ),
      ),
    ),
  tags: trapdoorTags,
};
