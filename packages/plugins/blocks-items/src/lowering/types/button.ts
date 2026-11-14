/**
 * `button`: a short redstone pulse (ADR 0067 D2). Generated models are vanilla's `button`,
 * `button_pressed` and `button_inventory` from `texture`.
 *
 * Model slots: `default`, `pressed`, `inventory` (the item).
 */
import { HORIZONTAL_FACINGS, NORTH_BASED_Y, variant, variants } from './blockstates';
import type { TypeLowering } from './models';
import { buttonTags } from './tags';

const FACES = ['ceiling', 'floor', 'wall'] as const;
const POWERED = ['false', 'true'] as const;

export const buttonType: TypeLowering = {
  slots: ['default', 'pressed', 'inventory'],
  itemSlot: 'inventory',
  generate: (texture) => {
    const textures = { texture: texture('texture') };
    return [
      { slot: 'default', suffix: '', parent: 'minecraft:block/button', textures },
      { slot: 'pressed', suffix: '_pressed', parent: 'minecraft:block/button_pressed', textures },
      {
        slot: 'inventory',
        suffix: '_inventory',
        parent: 'minecraft:block/button_inventory',
        textures,
      },
    ];
  },
  blockstate: (models) =>
    variants(
      FACES.flatMap((face) =>
        HORIZONTAL_FACINGS.flatMap((facing) =>
          POWERED.map((powered) => {
            const model = (powered === 'true' ? models.pressed : models.default) ?? '';
            const y = NORTH_BASED_Y[facing];
            const value =
              face === 'floor'
                ? variant(model, { y })
                : face === 'wall'
                  ? variant(model, { x: 90, y, uvlock: true })
                  : variant(model, { x: 180, y: y + 180 });
            return [{ face, facing, powered }, value] as const;
          }),
        ),
      ),
    ),
  tags: buttonTags,
};
