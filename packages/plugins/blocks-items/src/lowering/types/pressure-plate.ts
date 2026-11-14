/**
 * `pressure_plate` (ADR 0067 D2). Generated models are vanilla's `pressure_plate_up` and
 * `pressure_plate_down` from `texture`. An ordinary plate has `powered`; a weighted plate
 * (`weighted_max`) has `power` 0 to 15, as vanilla's gold and iron plates.
 *
 * Model slots: `up` (also the item), `down`.
 */
import { variant, variants } from './blockstates';
import type { TypeLowering } from './models';
import { pressurePlateTags } from './tags';

/** The redstone power levels of a weighted plate. */
const POWER_LEVELS = Array.from({ length: 16 }, (_, level) => level);

export const pressurePlateType: TypeLowering = {
  slots: ['up', 'down'],
  generate: (texture) => {
    const textures = { texture: texture('texture') };
    return [
      { slot: 'up', suffix: '', parent: 'minecraft:block/pressure_plate_up', textures },
      { slot: 'down', suffix: '_down', parent: 'minecraft:block/pressure_plate_down', textures },
    ];
  },
  blockstate: (models, { data }) => {
    const up = variant(models.up ?? '');
    const down = variant(models.down ?? '');
    if (data.weighted_max !== undefined) {
      return variants(
        POWER_LEVELS.map((level) => [{ power: String(level) }, level === 0 ? up : down] as const),
      );
    }
    return variants([
      [{ powered: 'false' }, up],
      [{ powered: 'true' }, down],
    ]);
  },
  tags: pressurePlateTags,
};
