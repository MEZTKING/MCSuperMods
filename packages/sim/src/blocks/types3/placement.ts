/**
 * Placing the five types of ADR 0103 and double chests (B519), from the face clicked, the point
 * hit and the look, as the runtime does it (B509, B510, B513 notes):
 *
 * - a growing plant's tip goes where the block behind it (below for `up`, above for `down`) is a
 *   block, the floor or its own strand; placed on its own tip it lengthens the strand (the old tip
 *   becomes the strand block, `../neighbours.ts`); it starts at age `25 - max_age`;
 * - a column plant stands on a block or on itself; a bamboo-like item on anything but its own
 *   stalk plants the shoot, on the shoot or stalk it adds a stalk block (thickness copied);
 * - a multiface plant covers the face of the block clicked; clicked into one of its own, it adds
 *   that face;
 * - a big dripleaf faces the player (a leaf placed on a leaf turns the lower one into the stem),
 *   a small one takes two blocks, lower and upper;
 * - a double chest joins a single chest of the same block facing the same way on its left or right
 *   (not while sneaking): a `left` half has its other half clockwise of its facing.
 *
 * A block placed into water takes `waterlogged=true` when it has the property. Soil, light and
 * water rules are checked only in the game (the area says so once per block).
 */
import type { BlockPos, BlockState } from '../../types.js';
import type { SimWorld } from '../../world/sim-world.js';
import type { BlockCatalogue, CatalogueBlock } from '../catalogue.js';
import {
  clockwise,
  counterClockwise,
  type Horizontal,
  isHorizontal,
  lookHorizontal,
  offset,
  opposite,
} from '../directions.js';
import type { BlockChange } from '../neighbours.js';
import type { PlaceInput } from '../placement.js';
import { waterloggedIfInWater } from '../types2/placement.js';
import { companion3Id, type SimBlockType3 } from './facts.js';

/** What placing one of the five types asks for: the blocks to set, or why not. */
export type Types3Placing =
  | { readonly placed: true; readonly sets: readonly BlockChange[] }
  | { readonly placed: false; readonly reason: string };

const refuse = (reason: string): Types3Placing => ({ placed: false, reason });

/** A cell a block may go into: air or a liquid prop. */
const free = (world: SimWorld, catalogue: BlockCatalogue, pos: BlockPos): boolean => {
  if (!world.inBounds(pos)) return false;
  const state = world.get(pos);
  return state === null || catalogue.isLiquid(state);
};

/** Whether `pos` holds something a plant can stand on or hang from: a block or the floor. */
const holds = (world: SimWorld, catalogue: BlockCatalogue, pos: BlockPos): boolean => {
  if (world.isFloor(pos)) return true;
  const state = world.get(pos);
  return state !== null && !catalogue.isLiquid(state);
};

/** Places a block of the five types; see the module comment. */
export function placeType3(
  world: SimWorld,
  catalogue: BlockCatalogue,
  block: CatalogueBlock,
  type: SimBlockType3,
  input: PlaceInput,
): Types3Placing {
  const at = offset(input.pos, input.face);
  if (!world.inBounds(at)) return refuse('that is outside the test area');
  const there = world.get(at);
  const facts = block.types3;
  const look = lookHorizontal(input.yaw);
  const set = (changes: Record<string, string>, id = block.id): BlockState =>
    catalogue.withProperties(catalogue.defaultState(id) ?? block.defaultState, changes);
  const wet = (state: BlockState, pos = at): BlockState =>
    waterloggedIfInWater(catalogue, state, world.get(pos));

  // A multiface plant clicked into one of its own adds the face.
  if (type === 'multiface') {
    const side = opposite(input.face);
    if (there?.name === block.id) {
      if (there.properties[side] === 'true') return refuse('it already covers that face');
      return {
        placed: true,
        sets: [{ pos: at, state: set({ ...there.properties, [side]: 'true' }) }],
      };
    }
    if (there !== null && !catalogue.isLiquid(there)) return refuse('another block is in the way');
    return { placed: true, sets: [{ pos: at, state: wet(set({ [side]: 'true' })) }] };
  }

  if (there !== null && !catalogue.isLiquid(there)) return refuse('another block is in the way');

  switch (type) {
    case 'growing_plant': {
      const down = facts?.growing?.direction === 'down';
      const behind = offset(at, down ? 'up' : 'down');
      if (!holds(world, catalogue, behind)) {
        return refuse(down ? 'it hangs under a block' : 'it grows on top of a block');
      }
      return { placed: true, sets: [{ pos: at, state: block.defaultState }] };
    }
    case 'column_plant': {
      const below = offset(at, 'down');
      if (!holds(world, catalogue, below)) return refuse('it grows on top of a block');
      if (facts?.column?.style !== 'bamboo')
        return { placed: true, sets: [{ pos: at, state: block.defaultState }] };
      const under = world.get(below);
      const shoot = companion3Id(block.id, 'shoot');
      if (under?.name === block.id) {
        return {
          placed: true,
          sets: [{ pos: at, state: set({ age: under.properties.age ?? '0' }) }],
        };
      }
      if (under?.name === shoot) return { placed: true, sets: [{ pos: at, state: set({}) }] };
      return { placed: true, sets: [{ pos: at, state: set({}, shoot) }] };
    }
    case 'dripleaf': {
      const facing = opposite(look);
      if (!holds(world, catalogue, offset(at, 'down'))) return refuse('it grows on top of a block');
      if (facts?.dripleaf?.size === 'small') {
        const above = offset(at, 'up');
        if (!free(world, catalogue, above)) return refuse('it needs two blocks of room');
        return {
          placed: true,
          sets: [
            { pos: at, state: wet(set({ facing, half: 'lower' })) },
            { pos: above, state: wet(set({ facing, half: 'upper' }), above) },
          ],
        };
      }
      const under = world.get(offset(at, 'down'));
      const leafFacing =
        under?.name === block.id && isHorizontal(under.properties.facing ?? '')
          ? (under.properties.facing as Horizontal)
          : facing;
      return { placed: true, sets: [{ pos: at, state: wet(set({ facing: leafFacing })) }] };
    }
    default:
      return { placed: true, sets: [{ pos: at, state: wet(block.defaultState) }] };
  }
}

/**
 * A double chest placed at `at` in `state` (B513): it joins a single chest of the same block that
 * faces the same way on its left or right unless the player sneaks. Returns the blocks to set.
 */
export function pairChest(
  world: SimWorld,
  at: BlockPos,
  state: BlockState,
  sneak: boolean,
): BlockChange[] {
  const facing = state.properties.facing;
  if (sneak || facing === undefined || !isHorizontal(facing)) return [{ pos: at, state }];
  const candidates: [Horizontal, 'left' | 'right'][] = [
    [clockwise(facing), 'left'],
    [counterClockwise(facing), 'right'],
  ];
  for (const [side, type] of candidates) {
    const partnerPos = offset(at, side);
    const partner = world.get(partnerPos);
    if (
      partner?.name !== state.name ||
      partner.properties.facing !== facing ||
      partner.properties.type !== 'single'
    ) {
      continue;
    }
    const mine = { name: state.name, properties: { ...state.properties, type } };
    const theirs = {
      name: partner.name,
      properties: { ...partner.properties, type: type === 'left' ? 'right' : 'left' },
    };
    return [
      { pos: at, state: mine },
      { pos: partnerPos, state: theirs },
    ];
  }
  return [{ pos: at, state }];
}

/** The other half of a small dripleaf at `pos`, when it is there; it goes with the block broken. */
export function otherHalf3(
  world: SimWorld,
  pos: BlockPos,
  state: BlockState,
): BlockPos | undefined {
  const half = state.properties.half;
  if (half === undefined) return undefined;
  const other = offset(pos, half === 'upper' ? 'down' : 'up');
  const there = world.get(other);
  return there?.name === state.name && there.properties.half !== half ? other : undefined;
}
