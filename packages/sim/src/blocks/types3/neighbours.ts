/**
 * States of the five types of ADR 0103 and of double chests that follow the neighbours (B519), as
 * the runtime shows them (B509, B513 notes):
 *
 * - a strand's tip with its own strand ahead turns into the strand block (`<id>_plant`, berries
 *   kept); a strand block with nothing of its own ahead turns back into the tip;
 * - a big dripleaf leaf with its own leaf or stem above turns into the stem, facing the same way;
 * - a multiface plant keeps only the faces that still have a block behind them;
 * - a double chest half whose other half is gone (or turned away) is single again.
 *
 * What holds them: a strand block needs a block, the floor or its own strand behind it; a column
 * plant and a bamboo shoot a block or the floor below; a dripleaf stem its own stem or leaf
 * above; a small dripleaf both halves; a multiface plant at least one face.
 */
import type { BlockPos, BlockState, Face } from '../../types.js';
import type { SimWorld } from '../../world/sim-world.js';
import type { BlockCatalogue, CatalogueBlock } from '../catalogue.js';
import { clockwise, counterClockwise, isHorizontal, offset } from '../directions.js';
import { companion3Id, MULTIFACE_SIDES } from './facts.js';

/** The element id of a block of the five types (the companion's `of`, else its own id). */
export const ownerOf = (block: CatalogueBlock): string => block.types3?.companion?.of ?? block.id;

const holds = (world: SimWorld, catalogue: BlockCatalogue, pos: BlockPos): boolean => {
  if (world.isFloor(pos)) return true;
  const state = world.get(pos);
  return state !== null && !catalogue.isLiquid(state);
};

/** A block of the strand `owner` (its tip or its strand block). */
const isStrand = (state: BlockState | null, owner: string): boolean =>
  state?.name === owner || state?.name === companion3Id(owner, 'plant');

/**
 * The other half of a double chest half at `pos`, when it is there and the same block (ageing,
 * waxing, scraping and lightning change both halves together, B513).
 */
export function chestPartner(
  world: SimWorld,
  pos: BlockPos,
  state: BlockState,
): BlockPos | undefined {
  const type = state.properties.type;
  const facing = state.properties.facing;
  if ((type !== 'left' && type !== 'right') || facing === undefined || !isHorizontal(facing)) {
    return undefined;
  }
  const at = offset(pos, type === 'left' ? clockwise(facing) : counterClockwise(facing));
  return world.get(at)?.name === state.name ? at : undefined;
}

/** A double chest half's state with its pairing worked out. */
function chestState(world: SimWorld, pos: BlockPos, state: BlockState): BlockState {
  const type = state.properties.type;
  const facing = state.properties.facing;
  if ((type !== 'left' && type !== 'right') || facing === undefined || !isHorizontal(facing)) {
    return state;
  }
  const side = type === 'left' ? clockwise(facing) : counterClockwise(facing);
  const partner = world.get(offset(pos, side));
  const paired =
    partner?.name === state.name &&
    partner.properties.facing === facing &&
    partner.properties.type === (type === 'left' ? 'right' : 'left');
  return paired ? state : { name: state.name, properties: { ...state.properties, type: 'single' } };
}

/** The state of a block of the five types (or a double chest) with its neighbours worked out. */
export function connected3(
  world: SimWorld,
  catalogue: BlockCatalogue,
  pos: BlockPos,
  state: BlockState,
  block: CatalogueBlock,
): BlockState {
  if (block.storage?.double === true) return chestState(world, pos, state);
  const facts = block.types3;
  if (facts === undefined) return state;
  const owner = ownerOf(block);
  if (facts.growing !== undefined) {
    const ahead = world.get(offset(pos, facts.growing.direction));
    const body = companion3Id(owner, 'plant');
    const berries = state.properties.berries;
    const keep = berries === undefined ? {} : { berries };
    if (state.name === owner && isStrand(ahead, owner)) {
      const strand = catalogue.defaultState(body);
      return strand === undefined ? state : catalogue.withProperties(strand, keep);
    }
    if (state.name === body && !isStrand(ahead, owner)) {
      const tip = catalogue.defaultState(owner);
      return tip === undefined ? state : catalogue.withProperties(tip, keep);
    }
    return state;
  }
  if (facts.companion?.kind === 'shoot') {
    // A shoot with its stalk above turns into the stalk (B509).
    const above = world.get(offset(pos, 'up'));
    return above?.name === owner ? (catalogue.defaultState(owner) ?? state) : state;
  }
  if (facts.column?.style === 'bamboo' && state.name === owner) {
    // Thickness passes down the column (B509).
    const above = world.get(offset(pos, 'up'));
    return above?.name === owner && above.properties.age === '1' && state.properties.age !== '1'
      ? catalogue.withProperties(state, { age: '1' })
      : state;
  }
  if (facts.dripleaf?.size === 'big' && state.name === owner) {
    const above = world.get(offset(pos, 'up'));
    if (above?.name === owner || above?.name === companion3Id(owner, 'stem')) {
      const stem = catalogue.defaultState(companion3Id(owner, 'stem'));
      if (stem === undefined) return state;
      return catalogue.withProperties(stem, {
        facing: state.properties.facing ?? 'north',
        waterlogged: state.properties.waterlogged ?? 'false',
      });
    }
    return state;
  }
  if (facts.multiface !== undefined) {
    const changes: Record<string, string> = {};
    for (const side of MULTIFACE_SIDES) {
      if (state.properties[side] !== 'true') continue;
      if (!holds(world, catalogue, offset(pos, side as Face))) changes[side] = 'false';
    }
    return Object.keys(changes).length === 0 ? state : catalogue.withProperties(state, changes);
  }
  return state;
}

/** Whether a block of the five types still has what holds it (see the module comment). */
export function supported3(
  world: SimWorld,
  catalogue: BlockCatalogue,
  pos: BlockPos,
  state: BlockState,
  block: CatalogueBlock,
): boolean {
  const facts = block.types3;
  if (facts === undefined) return true;
  const owner = ownerOf(block);
  if (facts.growing !== undefined) {
    const behind = offset(pos, facts.growing.direction === 'down' ? 'up' : 'down');
    return isStrand(world.get(behind), owner) || holds(world, catalogue, behind);
  }
  if (facts.column !== undefined) return holds(world, catalogue, offset(pos, 'down'));
  if (facts.dripleaf !== undefined) {
    if (facts.companion?.kind === 'stem') {
      const above = world.get(offset(pos, 'up'));
      return above?.name === owner || above?.name === state.name;
    }
    if (facts.dripleaf.size === 'small') {
      const half = state.properties.half;
      const other = world.get(offset(pos, half === 'upper' ? 'down' : 'up'));
      return other?.name === state.name && other.properties.half !== half;
    }
    return holds(world, catalogue, offset(pos, 'down'));
  }
  if (facts.multiface !== undefined) {
    return MULTIFACE_SIDES.some((side) => state.properties[side] === 'true');
  }
  return true;
}
