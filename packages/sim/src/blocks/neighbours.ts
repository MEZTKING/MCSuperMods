/**
 * States that follow the neighbours (B387): fence, wall and pane connections, a fence gate in a
 * wall, stairs corners, the two halves of a door, and blocks that fall off when what holds them
 * goes. Written from the game's observable behaviour (ADR 0085 D5's first level); wall posts
 * and tall sides are approximate (see {@link wallState}).
 */
import type { BlockPos, BlockState, Face } from '../types.js';
import type { SimWorld } from '../world/sim-world.js';
import type { BlockCatalogue, CatalogueBlock } from './catalogue.js';
import {
  clockwise,
  counterClockwise,
  FACES,
  HORIZONTALS,
  type Horizontal,
  isHorizontal,
  offset,
  opposite,
} from './directions.js';

/** One block set by an operation: its position and new state (`null` for air). */
export interface BlockChange {
  readonly pos: BlockPos;
  readonly state: BlockState | null;
}

/** The block at a position with its catalogue entry; the floor counts as a solid cube. */
interface Neighbour {
  readonly state: BlockState | null;
  readonly block: CatalogueBlock | undefined;
  readonly floor: boolean;
}

function neighbourAt(world: SimWorld, catalogue: BlockCatalogue, pos: BlockPos): Neighbour {
  const state = world.get(pos);
  return {
    state,
    block: state === null ? undefined : catalogue.blockFor(state.name),
    floor: world.isFloor(pos),
  };
}

const facingOf = (state: BlockState | null): Horizontal | undefined => {
  const value = state?.properties.facing;
  return value !== undefined && isHorizontal(value) ? value : undefined;
};

const axisOf = (direction: Horizontal): 'x' | 'z' =>
  direction === 'east' || direction === 'west' ? 'x' : 'z';

/** Whether a fence gate lets a fence or wall join it from `direction` (its sides, not its front). */
function gateJoins(neighbour: Neighbour, direction: Horizontal): boolean {
  const facing = facingOf(neighbour.state);
  return (
    neighbour.block?.type === 'fence_gate' &&
    facing !== undefined &&
    axisOf(facing) !== axisOf(direction)
  );
}

function solid(catalogue: BlockCatalogue, neighbour: Neighbour): boolean {
  if (neighbour.floor) return true;
  return neighbour.state !== null && catalogue.isSolidCube(neighbour.state);
}

/** Whether a fence of `self` joins the neighbour in `direction`. */
function fenceJoins(
  catalogue: BlockCatalogue,
  self: CatalogueBlock,
  neighbour: Neighbour,
  direction: Horizontal,
): boolean {
  const other = neighbour.block;
  if (other?.type === 'fence') return (other.woodenFence ?? false) === (self.woodenFence ?? false);
  if (gateJoins(neighbour, direction)) return true;
  return solid(catalogue, neighbour) && !neighbour.floor;
}

/** Whether a wall joins the neighbour in `direction`. */
function wallJoins(
  catalogue: BlockCatalogue,
  neighbour: Neighbour,
  direction: Horizontal,
): boolean {
  const type = neighbour.block?.type;
  if (type === 'wall' || type === 'pane') return true;
  if (gateJoins(neighbour, direction)) return true;
  return solid(catalogue, neighbour) && !neighbour.floor;
}

/** Whether a pane joins the neighbour. */
function paneJoins(catalogue: BlockCatalogue, neighbour: Neighbour): boolean {
  const type = neighbour.block?.type;
  if (type === 'pane' || type === 'wall') return true;
  return solid(catalogue, neighbour) && !neighbour.floor;
}

/** A fence's or pane's sides. */
function crossState(
  world: SimWorld,
  catalogue: BlockCatalogue,
  pos: BlockPos,
  state: BlockState,
  joins: (neighbour: Neighbour, direction: Horizontal) => boolean,
): BlockState {
  const changes: Record<string, string> = {};
  for (const direction of HORIZONTALS) {
    changes[direction] = String(
      joins(neighbourAt(world, catalogue, offset(pos, direction)), direction),
    );
  }
  return catalogue.withProperties(state, changes);
}

/**
 * A wall's sides and post. Approximate: a side is `tall` under a solid cube or under a wall
 * with that side joined, else `low`; the post shows unless the wall runs straight through
 * (exactly two opposite sides of the same height) with no wall post above.
 */
function wallState(
  world: SimWorld,
  catalogue: BlockCatalogue,
  pos: BlockPos,
  state: BlockState,
): BlockState {
  const above = neighbourAt(world, catalogue, offset(pos, 'up'));
  const aboveSolid = above.state !== null && catalogue.isSolidCube(above.state);
  const aboveWall = above.block?.type === 'wall' ? above.state : null;
  const changes: Record<string, string> = {};
  for (const direction of HORIZONTALS) {
    const joined = wallJoins(
      catalogue,
      neighbourAt(world, catalogue, offset(pos, direction)),
      direction,
    );
    const tall =
      aboveSolid || (aboveWall !== null && (aboveWall.properties[direction] ?? 'none') !== 'none');
    changes[direction] = joined ? (tall ? 'tall' : 'low') : 'none';
  }
  const n = changes.north;
  const s = changes.south;
  const e = changes.east;
  const w = changes.west;
  const straightNS = n !== 'none' && n === s && e === 'none' && w === 'none';
  const straightEW = e !== 'none' && e === w && n === 'none' && s === 'none';
  const postAbove = aboveWall !== null && aboveWall.properties.up === 'true';
  changes.up = String(!(straightNS || straightEW) || postAbove);
  return catalogue.withProperties(state, changes);
}

/** A fence gate is `in_wall` when a wall stands on either of its sides. */
function gateState(
  world: SimWorld,
  catalogue: BlockCatalogue,
  pos: BlockPos,
  state: BlockState,
): BlockState {
  const facing = facingOf(state) ?? 'north';
  const sides = [clockwise(facing), counterClockwise(facing)];
  const inWall = sides.some(
    (side) => neighbourAt(world, catalogue, offset(pos, side)).block?.type === 'wall',
  );
  return catalogue.withProperties(state, { in_wall: String(inWall) });
}

/** The stairs at a position, as `facing` and `half`, when there are any. */
function stairsAt(
  world: SimWorld,
  catalogue: BlockCatalogue,
  pos: BlockPos,
): { facing: Horizontal; half: string } | undefined {
  const neighbour = neighbourAt(world, catalogue, pos);
  if (neighbour.block?.type !== 'stairs' || neighbour.state === null) return undefined;
  const facing = facingOf(neighbour.state);
  if (facing === undefined) return undefined;
  return { facing, half: neighbour.state.properties.half ?? 'bottom' };
}

/**
 * Stairs corners, as the game shapes them: stairs behind (in the facing direction) that turn
 * across make an outer corner; stairs in front that turn across make an inner corner; left
 * or right is the side the other stairs face, seen from these stairs' facing. A corner is not
 * taken when stairs facing the same way on that side would be cut by it.
 */
export function stairsShape(
  world: SimWorld,
  catalogue: BlockCatalogue,
  pos: BlockPos,
  state: BlockState,
): string {
  const facing = facingOf(state) ?? 'north';
  const half = state.properties.half ?? 'bottom';
  const sameAs = (at: BlockPos): boolean => {
    const other = stairsAt(world, catalogue, at);
    return other !== undefined && other.facing === facing && other.half === half;
  };
  const behind = stairsAt(world, catalogue, offset(pos, facing));
  if (behind !== undefined && behind.half === half && axisOf(behind.facing) !== axisOf(facing)) {
    if (!sameAs(offset(pos, opposite(behind.facing)))) {
      return behind.facing === counterClockwise(facing) ? 'outer_left' : 'outer_right';
    }
  }
  const front = stairsAt(world, catalogue, offset(pos, opposite(facing)));
  if (front !== undefined && front.half === half && axisOf(front.facing) !== axisOf(facing)) {
    if (!sameAs(offset(pos, front.facing))) {
      return front.facing === counterClockwise(facing) ? 'inner_left' : 'inner_right';
    }
  }
  return 'straight';
}

/**
 * A state with its neighbour-dependent properties worked out for its position: connections
 * for fences, walls and panes, `in_wall` for gates and the corner shape for stairs. Any other
 * state comes back unchanged.
 */
export function connectedState(
  world: SimWorld,
  catalogue: BlockCatalogue,
  pos: BlockPos,
  state: BlockState,
): BlockState {
  const block = catalogue.blockFor(state.name);
  switch (block?.type) {
    case 'fence':
      return crossState(world, catalogue, pos, state, (neighbour, direction) =>
        fenceJoins(catalogue, block, neighbour, direction),
      );
    case 'pane':
      return crossState(world, catalogue, pos, state, (neighbour) =>
        paneJoins(catalogue, neighbour),
      );
    case 'wall':
      return wallState(world, catalogue, pos, state);
    case 'fence_gate':
      return gateState(world, catalogue, pos, state);
    case 'stairs':
      return catalogue.withProperties(state, {
        shape: stairsShape(world, catalogue, pos, state),
      });
    default:
      return state;
  }
}

/**
 * Whether a block still has what holds it: a door's other half and the block under its lower
 * half, a button's block, a plate's support, the block under a crop or sapling. Other blocks
 * always stay.
 */
export function isSupported(
  world: SimWorld,
  catalogue: BlockCatalogue,
  pos: BlockPos,
  state: BlockState,
): boolean {
  const block = catalogue.blockFor(state.name);
  const below = neighbourAt(world, catalogue, offset(pos, 'down'));
  switch (block?.type) {
    case 'door': {
      const upper = state.properties.half === 'upper';
      const other = world.get(offset(pos, upper ? 'down' : 'up'));
      if (other?.name !== state.name || other.properties.half === state.properties.half) {
        return false;
      }
      return upper || below.floor || (below.state !== null && catalogue.hasSturdyTop(below.state));
    }
    case 'button': {
      const face = state.properties.face ?? 'wall';
      const facing = facingOf(state) ?? 'north';
      const toward: Face = face === 'floor' ? 'down' : face === 'ceiling' ? 'up' : opposite(facing);
      const held = neighbourAt(world, catalogue, offset(pos, toward));
      return held.floor || held.state !== null;
    }
    case 'pressure_plate':
      return (
        below.floor ||
        (below.state !== null &&
          (catalogue.hasSturdyTop(below.state) || catalogue.supportsCentre(below.state)))
      );
    case 'crop':
    case 'sapling':
      return below.floor || below.state !== null;
    default:
      return true;
  }
}

/**
 * After the block at `pos` changed, brings its six neighbours up to date: connections and
 * corners are worked out again, a door's halves follow each other, and blocks that lost what
 * holds them are removed (nothing drops, ADR 0085 L8). Applies every change to the world and
 * returns them in order; changes spread on to the neighbours of what changed.
 */
export function updateNeighbours(
  world: SimWorld,
  catalogue: BlockCatalogue,
  pos: BlockPos,
): BlockChange[] {
  const out: BlockChange[] = [];
  const queue: BlockPos[] = [pos];
  // A generous bound: one change can only spread through connected blocks.
  let budget = world.sizeX * world.sizeY * world.sizeZ;
  while (queue.length > 0 && budget > 0) {
    budget -= 1;
    const from = queue.shift() as BlockPos;
    for (const face of FACES) {
      const at = offset(from, face);
      const state = world.get(at);
      if (state === null) continue;
      let next: BlockState | null = connectedState(world, catalogue, at, state);
      if (!isSupported(world, catalogue, at, next)) next = null;
      else if (catalogue.blockFor(state.name)?.type === 'door') next = doorFollows(world, at, next);
      if (world.set(at, next)) {
        out.push({ pos: at, state: next });
        queue.push(at);
      }
    }
  }
  return out;
}

/** An upper door half copies the lower half's facing, hinge and open state. */
function doorFollows(world: SimWorld, pos: BlockPos, state: BlockState): BlockState {
  if (state.properties.half !== 'upper') return state;
  const lower = world.get(offset(pos, 'down'));
  if (lower === null) return state;
  const { facing, hinge, open } = lower.properties;
  if (
    facing === state.properties.facing &&
    hinge === state.properties.hinge &&
    open === state.properties.open
  ) {
    return state;
  }
  return {
    name: state.name,
    properties: {
      ...state.properties,
      ...(facing !== undefined ? { facing } : {}),
      ...(hinge !== undefined ? { hinge } : {}),
      ...(open !== undefined ? { open } : {}),
    },
  };
}
