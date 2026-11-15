/**
 * Placing the twenty types (B463), from the face clicked, the point hit and the look, as the game
 * shows it (B445, B446, B448 notes):
 *
 * - candles, sea pickles and layers add one to the block clicked (or the one in the way) until it
 *   is full; a cake, carpet, pot, berry bush, stem or chain-like block is placed as it is;
 * - a tall plant and a bed take two blocks: the lower and upper half, the foot and the head (the
 *   head the way the player looks);
 * - a torch or a sign on a side face becomes its wall block facing out of that face; a hanging
 *   sign under a block hangs (attached with any of sixteen turns while sneaking, else snapped to
 *   four), on a side it is the wall hanging sign;
 * - a ladder or cocoa pod goes only on a side face (cocoa faces the block it grows on); a vine on
 *   a side or the underside; a lantern under a block hangs; a chain follows the face's axis; a rod
 *   faces out of the face;
 * - scaffolding counts its distance from a support (0 on the ground or on a solid block, the
 *   distance of scaffolding below, else one more than its nearest side neighbour, refused at 7);
 *   clicking scaffolding with the same scaffolding builds up the column from a side face and a row
 *   out from the top face, at most six along (B446).
 *
 * A block placed into water takes `waterlogged=true` when it has the property. What holds a torch,
 * vine, cocoa pod or stem in place is checked only in the game (the local source says so).
 */
import type { BlockPos, BlockState, Face } from '../../types.js';
import type { SimWorld } from '../../world/sim-world.js';
import type { BlockCatalogue, CatalogueBlock } from '../catalogue.js';
import {
  axisOf,
  clockwise,
  HORIZONTALS,
  isHorizontal,
  lookHorizontal,
  offset,
  opposite,
} from '../directions.js';
import type { BlockChange } from '../neighbours.js';
import type { PlaceInput } from '../placement.js';
import { companionId, SCAFFOLDING_MAX_DISTANCE, type SimBlockType2 } from './facts.js';

/** What placing one of the twenty types asks for: the blocks to set, or why not. */
export type Types2Placing =
  | { readonly placed: true; readonly sets: readonly BlockChange[] }
  | { readonly placed: false; readonly reason: string };

/** The most of each stacking type a block holds. */
const STACKS: Readonly<Partial<Record<SimBlockType2, { property: string; max: number }>>> = {
  candle: { property: 'candles', max: 4 },
  sea_pickle: { property: 'pickles', max: 4 },
  layers: { property: 'layers', max: 8 },
};

/** How far scaffolding builds out along a row or up a column from the block clicked (B446). */
export const SCAFFOLDING_REACH = 6;

const refuse = (reason: string): Types2Placing => ({ placed: false, reason });

/** Whether a state is water (a water prop, or a block holding water). */
export function isWater(state: BlockState | null): boolean {
  return state?.name === 'minecraft:water' || state?.properties.waterlogged === 'true';
}

/**
 * The state with `waterlogged=true` when it is placed into water and has the property (B449:
 * the waterlogged look is the same model plus water).
 */
export function waterloggedIfInWater(
  catalogue: BlockCatalogue,
  state: BlockState,
  there: BlockState | null,
): BlockState {
  if (there?.name !== 'minecraft:water') return state;
  const block = catalogue.blockFor(state.name);
  if (block?.properties.waterlogged === undefined) return state;
  return catalogue.withProperties(state, { waterlogged: 'true' });
}

/** A cell a block may go into: air or a liquid prop. */
const free = (world: SimWorld, catalogue: BlockCatalogue, pos: BlockPos): boolean => {
  if (!world.inBounds(pos)) return false;
  const state = world.get(pos);
  return state === null || catalogue.isLiquid(state);
};

/** A sign's sixteen-way rotation from the look: 0 faces the player looking north. */
export function rotationFromYaw(yaw: number): number {
  return ((Math.floor(((yaw + 180) * 16) / 360 + 0.5) % 16) + 16) % 16;
}

/** The distance a scaffolding block placed at `at` would have (B446), 7 when unsupported. */
export function scaffoldingDistance(
  world: SimWorld,
  catalogue: BlockCatalogue,
  id: string,
  at: BlockPos,
): number {
  const below = offset(at, 'down');
  const under = world.get(below);
  if (under?.name === id) return Number(under.properties.distance ?? SCAFFOLDING_MAX_DISTANCE);
  if (world.isFloor(below) || (under !== null && catalogue.hasSturdyTop(under))) return 0;
  let best = SCAFFOLDING_MAX_DISTANCE;
  for (const side of HORIZONTALS) {
    const next = world.get(offset(at, side));
    if (next?.name !== id) continue;
    best = Math.min(best, Number(next.properties.distance ?? SCAFFOLDING_MAX_DISTANCE) + 1);
  }
  return best;
}

/** Scaffolding's `bottom`: it hangs (distance above 0) with no scaffolding under it. */
export function scaffoldingBottom(world: SimWorld, id: string, at: BlockPos, distance: number) {
  return distance > 0 && world.get(offset(at, 'down'))?.name !== id;
}

/** Where scaffolding clicked with the same scaffolding builds: up the column or out a row. */
function scaffoldingTarget(
  world: SimWorld,
  catalogue: BlockCatalogue,
  from: BlockPos,
  face: Face,
  yaw: number,
): BlockPos | undefined {
  const direction: Face = face === 'up' ? lookHorizontal(yaw) : 'up';
  let at = from;
  for (let step = 0; step < SCAFFOLDING_REACH; step++) {
    at = offset(at, direction);
    if (!world.inBounds(at)) return undefined;
    if (free(world, catalogue, at)) return at;
    if (world.get(at)?.name !== world.get(from)?.name) return undefined;
  }
  return undefined;
}

/** A block of `type`'s state at `at` from the click, or why it cannot go there. */
function stateFor(
  world: SimWorld,
  catalogue: BlockCatalogue,
  block: CatalogueBlock,
  type: SimBlockType2,
  input: PlaceInput,
  at: BlockPos,
): { state: BlockState; extra?: BlockChange } | { reason: string } {
  const base = block.defaultState;
  const face = input.face;
  const look = lookHorizontal(input.yaw);
  const set = (changes: Record<string, string>, id = block.id): BlockState => {
    const start = id === block.id ? base : (catalogue.defaultState(id) ?? base);
    return catalogue.withProperties(start, changes);
  };
  switch (type) {
    case 'tall_plant':
    case 'bed': {
      const other = type === 'bed' ? offset(at, look) : offset(at, 'up');
      if (!free(world, catalogue, other)) {
        return {
          reason: type === 'bed' ? 'a bed needs two blocks of room' : 'it needs two blocks of room',
        };
      }
      if (type === 'tall_plant') {
        return {
          state: set({ half: 'lower' }),
          extra: { pos: other, state: set({ half: 'upper' }) },
        };
      }
      return {
        state: set({ facing: look, part: 'foot' }),
        extra: { pos: other, state: set({ facing: look, part: 'head' }) },
      };
    }
    case 'vine':
      if (face === 'up') return { reason: 'a vine hangs on the side or underside of a block' };
      return { state: set({ [face === 'down' ? 'up' : opposite(face)]: 'true' }) };
    case 'cocoa':
      if (!isHorizontal(face)) return { reason: 'a pod grows on the side of a block' };
      return { state: set({ facing: opposite(face), age: '0' }) };
    case 'ladder':
      if (!isHorizontal(face)) return { reason: 'a ladder goes on the side of a block' };
      return { state: set({ facing: face }) };
    case 'torch':
      if (face === 'down') return { reason: 'a torch stands on top or on the side of a block' };
      if (face === 'up') return { state: base };
      return { state: set({ facing: face }, companionId(block.id, 'wall')) };
    case 'sign':
      if (face === 'down') return { reason: 'a sign stands on top or on the side of a block' };
      if (face === 'up') return { state: set({ rotation: String(rotationFromYaw(input.yaw)) }) };
      return { state: set({ facing: face }, companionId(block.id, 'wall')) };
    case 'hanging_sign': {
      if (face === 'up') return { reason: 'a hanging sign hangs under a block or from its side' };
      if (isHorizontal(face)) {
        return { state: set({ facing: clockwise(face) }, companionId(block.id, 'wall')) };
      }
      const rotation = rotationFromYaw(input.yaw);
      return input.sneak === true
        ? { state: set({ attached: 'true', rotation: String(rotation) }) }
        : {
            state: set({
              attached: 'false',
              rotation: String((Math.round(rotation / 4) * 4) % 16),
            }),
          };
    }
    case 'lantern':
      return { state: set({ hanging: String(face === 'down') }) };
    case 'chain':
      return { state: set({ axis: axisOf(face) }) };
    case 'rod':
      return { state: set({ facing: face }) };
    case 'scaffolding': {
      const distance = scaffoldingDistance(world, catalogue, block.id, at);
      if (distance >= SCAFFOLDING_MAX_DISTANCE) {
        return { reason: 'scaffolding needs a support within six blocks' };
      }
      return {
        state: set({
          distance: String(distance),
          bottom: String(scaffoldingBottom(world, block.id, at, distance)),
        }),
      };
    }
    case 'sea_pickle':
      return { state: set({ waterlogged: 'false' }) };
    default:
      return { state: base };
  }
}

/** Adds one to a stacking block's count, or `undefined` when it is full or not the same block. */
function stacked(
  catalogue: BlockCatalogue,
  type: SimBlockType2,
  state: BlockState | null,
  id: string,
): BlockState | undefined {
  const stack = STACKS[type];
  if (stack === undefined || state?.name !== id) return undefined;
  const count = Number(state.properties[stack.property] ?? 1);
  if (count >= stack.max) return undefined;
  return catalogue.withProperties(state, { [stack.property]: String(count + 1) });
}

/**
 * Places a block of the twenty types: the blocks to set in order (the first is the block placed),
 * or why it cannot be placed. The caller applies them and brings the neighbours up to date.
 */
export function placeType2(
  world: SimWorld,
  catalogue: BlockCatalogue,
  block: CatalogueBlock,
  type: SimBlockType2,
  input: PlaceInput,
): Types2Placing {
  const clicked = world.get(input.pos);
  const more = stacked(catalogue, type, clicked, block.id);
  if (more !== undefined && (type !== 'layers' || input.face === 'up')) {
    return { placed: true, sets: [{ pos: input.pos, state: more }] };
  }
  let at = offset(input.pos, input.face);
  if (type === 'scaffolding' && clicked?.name === block.id) {
    const target = scaffoldingTarget(world, catalogue, input.pos, input.face, input.yaw);
    if (target === undefined) return refuse('there is no room to build the scaffolding on');
    at = target;
  }
  if (!world.inBounds(at)) return refuse('that is outside the test area');
  const there = world.get(at);
  const added = stacked(catalogue, type, there, block.id);
  if (added !== undefined) return { placed: true, sets: [{ pos: at, state: added }] };
  if (there !== null && !catalogue.isLiquid(there)) return refuse('another block is in the way');
  const made = stateFor(world, catalogue, block, type, input, at);
  if ('reason' in made) return refuse(made.reason);
  const sets: BlockChange[] = [
    { pos: at, state: waterloggedIfInWater(catalogue, made.state, there) },
  ];
  if (made.extra !== undefined) {
    sets.push({
      pos: made.extra.pos,
      state:
        made.extra.state === null
          ? null
          : waterloggedIfInWater(catalogue, made.extra.state, world.get(made.extra.pos)),
    });
  }
  return { placed: true, sets };
}

/**
 * The other half of a two-block type (a bed's head or foot, a tall plant's upper or lower half)
 * at `pos`, when it is there; it goes with the block broken.
 */
export function otherHalf(
  world: SimWorld,
  type: SimBlockType2,
  pos: BlockPos,
  state: BlockState,
): BlockPos | undefined {
  let other: BlockPos | undefined;
  if (type === 'tall_plant') {
    other = offset(pos, state.properties.half === 'upper' ? 'down' : 'up');
  } else if (type === 'bed') {
    const facing = state.properties.facing;
    if (facing === undefined || !isHorizontal(facing)) return undefined;
    other = offset(pos, state.properties.part === 'head' ? opposite(facing) : facing);
  }
  if (other === undefined) return undefined;
  const there = world.get(other);
  return there?.name === state.name &&
    (type === 'bed'
      ? there.properties.part !== state.properties.part
      : there.properties.half !== state.properties.half)
    ? other
    : undefined;
}
