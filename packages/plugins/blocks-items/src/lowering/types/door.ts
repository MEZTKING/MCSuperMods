/**
 * `door`: a two-block-high door (ADR 0067 D2). Generated models are vanilla's eight
 * `door_{bottom,top}_{left,right}[_open]` from `bottom` and `top`; the item is a flat
 * `minecraft:item/generated` model, as vanilla's, showing the `bottom` texture (the format has
 * no separate item texture; the `item` slot takes the user's own). `"loot": "self"` drops from
 * the lower half only.
 *
 * Model slots: `bottom_left`, `bottom_left_open`, `bottom_right`, `bottom_right_open`,
 * `top_left`, `top_left_open`, `top_right`, `top_right_open`.
 */
import { EAST_BASED_Y, HORIZONTAL_FACINGS, variant, variants } from './blockstates';
import type { ModelSpec, TypeLowering } from './models';
import { doorTags } from './tags';

const HALVES = [
  { half: 'lower', part: 'bottom' },
  { half: 'upper', part: 'top' },
] as const;
const HINGES = ['left', 'right'] as const;
const OPEN = ['false', 'true'] as const;

/** The slot of one door model, such as `bottom_left_open`. */
const slotOf = (part: string, hinge: string, open: string): string =>
  `${part}_${hinge}${open === 'true' ? '_open' : ''}`;

const SLOTS = HALVES.flatMap(({ part }) =>
  HINGES.flatMap((hinge) => OPEN.map((open) => slotOf(part, hinge, open))),
);

export const doorType: TypeLowering = {
  slots: SLOTS,
  generate: (texture) => {
    const textures = { bottom: texture('bottom'), top: texture('top') };
    return SLOTS.map(
      (slot): ModelSpec => ({
        slot,
        suffix: `_${slot}`,
        parent: `minecraft:block/door_${slot}`,
        textures,
      }),
    );
  },
  itemTexture: (texture) => texture('bottom'),
  blockstate: (models) =>
    variants(
      HORIZONTAL_FACINGS.flatMap((facing) =>
        HALVES.flatMap(({ half, part }) =>
          HINGES.flatMap((hinge) =>
            OPEN.map((open) => {
              let y = EAST_BASED_Y[facing];
              if (open === 'true') y += hinge === 'left' ? 90 : 270;
              return [
                { facing, half, hinge, open },
                variant(models[slotOf(part, hinge, open)] ?? '', { y }),
              ] as const;
            }),
          ),
        ),
      ),
    ),
  tags: doorTags,
  selfLoot: ({ blockId, itemId, namespace, path }) => ({
    type: 'minecraft:block',
    pools: [
      {
        rolls: 1,
        bonus_rolls: 0,
        entries: [
          {
            type: 'minecraft:item',
            name: itemId,
            condition: {
              type: 'minecraft:match_block',
              blocks: blockId,
              state: { half: 'lower' },
            },
          },
        ],
        condition: { type: 'minecraft:survives_explosion' },
      },
    ],
    random_sequence: `${namespace}:blocks/${path}`,
  }),
};
