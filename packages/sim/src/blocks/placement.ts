/**
 * Placing and breaking blocks (B387): the state a block takes when placed, by its type, from the
 * face clicked, the point hit and where the player looks (ADR 0085 D5's first level: pillar
 * axis, horizontal and directional facing, slab halves and doubling, stairs facing and half,
 * door halves and hinge, trapdoor half, button faces, connections). Written from the game's
 * observable behaviour; the parity fixture checks it against the runtime (ADR 0085 D10).
 */
import type { BlockPos, BlockState, Face, Vec3 } from '../types.js';
import type { SimWorld } from '../world/sim-world.js';
import type { BlockCatalogue, CatalogueBlock } from './catalogue.js';
import {
  axisOf,
  clockwise,
  counterClockwise,
  type Horizontal,
  isHorizontal,
  lookHorizontal,
  lookNearest,
  offset,
  opposite,
} from './directions.js';
import { type BlockChange, connectedState, isSupported, updateNeighbours } from './neighbours.js';
import { isType2 } from './types2/facts.js';
import { otherHalf, placeType2, waterloggedIfInWater } from './types2/placement.js';
import { isType3 } from './types3/facts.js';
import { otherHalf3, pairChest, placeType3 } from './types3/placement.js';

/** A request to place a block: the clicked block and face, the hit point and the look. */
export interface PlaceInput {
  /** The block clicked, or the floor below the area (`y = -1`). */
  readonly pos: BlockPos;
  /** The face of it clicked. */
  readonly face: Face;
  /** Where on the clicked block the ray hit, in block units from 0 to 1. */
  readonly hit: Vec3;
  /** The block to place. */
  readonly block: string;
  /** Where the player looks, in degrees (yaw 0 looks south, 90 west; negative pitch is up). */
  readonly yaw: number;
  readonly pitch: number;
  /** Whether the player sneaks (a hanging sign hangs attached, B463). */
  readonly sneak?: boolean;
}

/** What placing did: the blocks set, in order, or why nothing was placed. */
export type PlaceResult =
  | { readonly placed: true; readonly pos: BlockPos; readonly changes: readonly BlockChange[] }
  | { readonly placed: false; readonly reason: string };

const OFFSET_OF: Readonly<Record<Face, Vec3>> = {
  down: { x: 0, y: -1, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  north: { x: 0, y: 0, z: -1 },
  south: { x: 0, y: 0, z: 1 },
  west: { x: -1, y: 0, z: 0 },
  east: { x: 1, y: 0, z: 0 },
};

/** The hit point relative to the block being placed (next to the clicked one). */
function localHit(input: PlaceInput): Vec3 {
  const step = OFFSET_OF[input.face];
  return { x: input.hit.x - step.x, y: input.hit.y - step.y, z: input.hit.z - step.z };
}

/** The half a half-block takes: the top when clicked from below or high on a side. */
function upperHalf(face: Face, hitY: number): boolean {
  if (face === 'down') return true;
  if (face === 'up') return false;
  return hitY > 0.5;
}

/** Whether a slab clicked at `face` and `hitY` would take a second half there. */
function slabTakesHalf(slab: BlockState, face: Face, hitY: number): boolean {
  const type = slab.properties.type;
  if (type === 'bottom') return face === 'up' || (face !== 'down' && hitY > 0.5);
  if (type === 'top') return face === 'down' || (face !== 'up' && hitY <= 0.5);
  return false;
}

/**
 * A door's hinge, as the game picks it: next to another door of the same block the new one
 * pairs with it; otherwise the side with more solid blocks beside the two halves; otherwise
 * the side of the door the player clicked.
 */
export function doorHinge(
  world: SimWorld,
  catalogue: BlockCatalogue,
  pos: BlockPos,
  facing: Horizontal,
  block: string,
  hit: Vec3,
): 'left' | 'right' {
  const left = counterClockwise(facing);
  const right = clockwise(facing);
  const up = offset(pos, 'up');
  const solidAt = (at: BlockPos): number => {
    const state = world.get(at);
    return state !== null && catalogue.isSolidCube(state) ? 1 : 0;
  };
  const score =
    solidAt(offset(pos, right)) +
    solidAt(offset(up, right)) -
    solidAt(offset(pos, left)) -
    solidAt(offset(up, left));
  const doorAt = (side: Horizontal): boolean => {
    const state = world.get(offset(pos, side));
    return state?.name === block && state.properties.half === 'lower';
  };
  const leftDoor = doorAt(left);
  const rightDoor = doorAt(right);
  if ((leftDoor && !rightDoor) || score > 0) return 'right';
  if ((rightDoor && !leftDoor) || score < 0) return 'left';
  // The player's right-hand side of the door, seen looking the way it faces.
  switch (facing) {
    case 'north':
      return hit.x > 0.5 ? 'right' : 'left';
    case 'south':
      return hit.x < 0.5 ? 'right' : 'left';
    case 'east':
      return hit.z > 0.5 ? 'right' : 'left';
    default:
      return hit.z < 0.5 ? 'right' : 'left';
  }
}

/**
 * The state a block takes when placed at `at`, before connections: its orientation from the
 * click and the look. `undefined` for a block the catalogue does not know.
 */
export function placementState(
  world: SimWorld,
  catalogue: BlockCatalogue,
  input: PlaceInput,
  at: BlockPos,
): BlockState | undefined {
  const block = catalogue.blockFor(input.block);
  if (block === undefined) return undefined;
  const base = block.defaultState;
  const look = lookHorizontal(input.yaw);
  const hit = localHit(input);
  const set = (changes: Record<string, string>): BlockState =>
    catalogue.withProperties(base, changes);
  switch (block.type) {
    case 'pillar':
      return set({ axis: axisOf(input.face) });
    case 'horizontal':
      return set({ facing: opposite(look) });
    case 'directional':
      return set({ facing: opposite(lookNearest(input.yaw, input.pitch)) });
    case 'slab':
      return set({ type: upperHalf(input.face, input.hit.y) ? 'top' : 'bottom' });
    case 'stairs':
      return set({ facing: look, half: upperHalf(input.face, input.hit.y) ? 'top' : 'bottom' });
    case 'fence_gate':
      return set({ facing: look });
    case 'door':
      return set({
        facing: look,
        half: 'lower',
        hinge: doorHinge(world, catalogue, at, look, block.id, hit),
      });
    case 'trapdoor':
      return isHorizontal(input.face)
        ? set({ facing: input.face, half: input.hit.y > 0.5 ? 'top' : 'bottom' })
        : set({ facing: opposite(look), half: input.face === 'up' ? 'bottom' : 'top' });
    case 'button':
      if (input.face === 'up') return set({ face: 'floor', facing: look });
      if (input.face === 'down') return set({ face: 'ceiling', facing: look });
      return set({ face: 'wall', facing: input.face });
    case 'portal':
      return set({ axis: look === 'north' || look === 'south' ? 'x' : 'z' });
    default:
      return base;
  }
}

/** Says out loud, once per block, what a placed block does only in the game. */
function sayOnPlace(catalogue: BlockCatalogue, block: CatalogueBlock): void {
  if (block.type === 'crop' || block.type === 'sapling') {
    catalogue.sayOnce(
      `soil:${block.id}`,
      `${block.displayName} is planted only on ${block.soil ?? 'its soil'}; the preview plants it on anything`,
      block.origin,
    );
  }
  if (block.type === 'portal') {
    catalogue.sayOnce(
      `portal:${block.id}`,
      `${block.displayName} is lit in its frame and takes you to another dimension; the preview places it as a plain block`,
      block.origin,
    );
  }
}

/**
 * Places a block as a player would, applying every change to the world: the block (both halves
 * of a door; a slab doubled in place), then its neighbours brought up to date. Nothing is placed
 * outside the area, into another block, or where the block cannot stand (a door without room or
 * ground, a plate in the air, a button against nothing).
 */
export function placeBlock(
  world: SimWorld,
  catalogue: BlockCatalogue,
  input: PlaceInput,
): PlaceResult {
  const block = catalogue.blockFor(input.block);
  if (block === undefined) {
    return { placed: false, reason: `${input.block} is not a block of this project` };
  }
  const clicked = world.get(input.pos);

  // The twenty types of vanilla parity 2 place by their own rules (B463).
  if (isType2(block.type)) {
    const placing = placeType2(world, catalogue, block, block.type, input);
    return placing.placed
      ? finish(world, catalogue, block, placing.sets)
      : { placed: false, reason: placing.reason };
  }

  // The five types of vanilla parity 3 place by their own rules (B519).
  if (isType3(block.type)) {
    const placing = placeType3(world, catalogue, block, block.type, input);
    return placing.placed
      ? finish(world, catalogue, block, placing.sets)
      : { placed: false, reason: placing.reason };
  }

  // A slab doubles in place when its other half is clicked.
  if (
    block.type === 'slab' &&
    clicked?.name === block.id &&
    slabTakesHalf(clicked, input.face, input.hit.y)
  ) {
    return finish(world, catalogue, block, [
      { pos: input.pos, state: catalogue.withProperties(clicked, { type: 'double' }) },
    ]);
  }

  const at = offset(input.pos, input.face);
  if (!world.inBounds(at)) return { placed: false, reason: 'that is outside the test area' };
  const there = world.get(at);
  // A liquid prop gives way to the block placed into it (B405).
  if (there !== null && !catalogue.isLiquid(there)) {
    if (block.type === 'slab' && there.name === block.id && there.properties.type !== 'double') {
      return finish(world, catalogue, block, [
        { pos: at, state: catalogue.withProperties(there, { type: 'double' }) },
      ]);
    }
    return { placed: false, reason: 'another block is in the way' };
  }

  const state = placementState(world, catalogue, input, at);
  if (state === undefined) return { placed: false, reason: `${input.block} is not known` };

  if (block.type === 'door') {
    const above = offset(at, 'up');
    const aboveState = world.get(above);
    if (!world.inBounds(above) || (aboveState !== null && !catalogue.isLiquid(aboveState))) {
      return { placed: false, reason: 'a door needs two blocks of room' };
    }
    const below = offset(at, 'down');
    const ground = world.get(below);
    if (!world.isFloor(below) && (ground === null || !catalogue.hasSturdyTop(ground))) {
      return { placed: false, reason: 'a door needs solid ground' };
    }
    return finish(world, catalogue, block, [
      { pos: at, state },
      { pos: above, state: catalogue.withProperties(state, { half: 'upper' }) },
    ]);
  }

  const connected = waterloggedIfInWater(
    catalogue,
    connectedState(world, catalogue, at, state),
    there,
  );
  if (!isSupported(world, catalogue, at, connected)) {
    return { placed: false, reason: `${block.displayName} cannot stand there` };
  }
  // A double chest joins a single one beside it (B519, B513).
  if (block.storage?.double === true) {
    return finish(world, catalogue, block, pairChest(world, at, connected, input.sneak === true));
  }
  return finish(world, catalogue, block, [{ pos: at, state: connected }]);
}

function finish(
  world: SimWorld,
  catalogue: BlockCatalogue,
  block: CatalogueBlock,
  sets: readonly BlockChange[],
): PlaceResult {
  const changes: BlockChange[] = [];
  for (const change of sets) {
    if (world.set(change.pos, change.state)) changes.push(change);
  }
  for (const change of sets) changes.push(...updateNeighbours(world, catalogue, change.pos));
  sayOnPlace(catalogue, block);
  const first = sets[0] as BlockChange;
  return { placed: true, pos: first.pos, changes };
}

/** The water a broken waterlogged block leaves (a still water prop; it does not flow, Q29). */
const WATER_LEFT: BlockState = Object.freeze({
  name: 'minecraft:water',
  properties: Object.freeze({ level: '0' }),
});

/**
 * Breaks the block at a position at once (no mining time and no drops, ADR 0085 L8): a door
 * goes with both halves, then the neighbours are brought up to date. Returns every change in
 * order; empty when there was nothing to break.
 */
export function breakBlock(
  world: SimWorld,
  catalogue: BlockCatalogue,
  pos: BlockPos,
): BlockChange[] {
  const state = world.get(pos);
  if (state === null) return [];
  const removed: BlockPos[] = [pos];
  const type = catalogue.blockFor(state.name)?.type;
  if (type !== undefined && isType2(type)) {
    // A bed's other part, a tall plant's other half (B463).
    const other = otherHalf(world, type, pos, state);
    if (other !== undefined) removed.push(other);
  }
  if (type === 'dripleaf') {
    // A small dripleaf's other half (B519).
    const other = otherHalf3(world, pos, state);
    if (other !== undefined) removed.push(other);
  }
  if (type === 'door') {
    const other = offset(pos, state.properties.half === 'upper' ? 'down' : 'up');
    const otherState = world.get(other);
    if (otherState?.name === state.name && otherState.properties.half !== state.properties.half) {
      removed.push(other);
    }
  }
  const changes: BlockChange[] = [];
  for (const at of removed) {
    // A block holding water leaves the water behind (B449).
    const left = world.get(at)?.properties.waterlogged === 'true' ? WATER_LEFT : null;
    if (world.set(at, left)) changes.push({ pos: at, state: left });
  }
  for (const at of removed) changes.push(...updateNeighbours(world, catalogue, at));
  return changes;
}
