/**
 * `rod` (ADR 0094 D1, D10): a thin rod facing any of the six directions, as vanilla's end rod.
 * The generated model is vanilla's `minecraft:block/end_rod` from one texture (`texture` or
 * `all`) as its `end_rod` and `particle` variables, at `<ns>:block/<path>`. The block state is
 * vanilla's `facing` variants: `up` as the model stands, `down` turned over, the four sides
 * laid down and turned about Y. The block item shows the block model, as vanilla's end rod.
 *
 * Tags: none.
 *
 * `"loot": "self"` drops the rod, as vanilla's.
 *
 * Model slots: `rod`.
 */
import { variant, variants } from './blockstates';
import type { TypeLowering } from './models';

/** The rotation of the upright model for each facing, as vanilla's end rod block state. */
export const ROD_ROTATIONS: Readonly<Record<string, { x?: number; y?: number }>> = Object.freeze({
  down: { x: 180 },
  east: { x: 90, y: 90 },
  north: { x: 90 },
  south: { x: 90, y: 180 },
  up: {},
  west: { x: 90, y: 270 },
});

export const rodType: TypeLowering = {
  slots: ['rod'],
  generate: (texture) => {
    const rod = texture('texture');
    return [
      {
        slot: 'rod',
        suffix: '',
        parent: 'minecraft:block/end_rod',
        textures: { end_rod: rod, particle: rod },
      },
    ];
  },
  blockstate: (models) =>
    variants(
      Object.entries(ROD_ROTATIONS).map(
        ([facing, rotation]) => [{ facing }, variant(models.rod ?? '', rotation)] as const,
      ),
    ),
};
