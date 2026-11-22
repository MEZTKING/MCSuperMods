/**
 * The Grow tool on the five types of ADR 0103 (B519): what one bone meal does in the game, by the
 * runtime's rules (B509 notes), with the parts that come only from random ticks said out loud.
 *
 * - A strand without berries grows `bonemeal_growth` blocks (one for a water plant; a dry strand's
 *   own count is drawn 1 to 4 here) from its tip, each new tip one age older (at most 25); a strand
 *   with berries ripens the block grown on instead.
 * - Cane and cactus do not take bone meal in the game; Grow stands in for their random ticks and
 *   adds one block until the column's stop height (from `min_height` to `max_height`).
 * - A bamboo-like stalk grows its top one or two blocks up to `max_height` (leaves large, large,
 *   small, then none from the top; thick from the fourth block); its shoot grows a stalk above.
 * - A multiface plant with `spreads` covers one more face beside it.
 * - A big dripleaf grows a block taller (the leaf moves up, its old place turns into stem); a small
 *   one turns into its `grows_into` big dripleaf, two to four blocks high as there is room.
 */
import type { BlockPos, BlockState, Face } from '../../types.js';
import type { SimWorld } from '../../world/sim-world.js';
import type { BlockCatalogue, CatalogueBlock } from '../catalogue.js';
import { FACES, offset, opposite } from '../directions.js';
import { type BlockChange, updateNeighbours } from '../neighbours.js';
import {
  BAMBOO_THICK_FROM,
  COLUMN_TICKS_PER_BLOCK,
  companion3Id,
  MULTIFACE_SIDES,
  SMALL_DRIPLEAF_MAX_HEIGHT,
  STRAND_MAX_AGE,
} from './facts.js';
import { ownerOf } from './neighbours.js';

/** What Grow did to one of the five types. */
export interface Types3Grow {
  readonly changes: readonly BlockChange[];
  readonly message?: string;
  readonly onlyInMinecraft?: string;
}

const free = (world: SimWorld, catalogue: BlockCatalogue, pos: BlockPos): boolean => {
  if (!world.inBounds(pos)) return false;
  const state = world.get(pos);
  return state === null || catalogue.isLiquid(state);
};

const holds = (world: SimWorld, catalogue: BlockCatalogue, pos: BlockPos): boolean => {
  if (world.isFloor(pos)) return true;
  const state = world.get(pos);
  return state !== null && !catalogue.isLiquid(state);
};

const between = (low: number, high: number, random: () => number): number =>
  low + Math.floor(random() * (high - low + 1));

/** Applies `sets`, then brings their neighbours up to date. */
function apply(
  world: SimWorld,
  catalogue: BlockCatalogue,
  sets: readonly BlockChange[],
): BlockChange[] {
  const changes: BlockChange[] = [];
  for (const one of sets) if (world.set(one.pos, one.state)) changes.push(one);
  for (const one of sets) changes.push(...updateNeighbours(world, catalogue, one.pos));
  return changes;
}

/**
 * A column's stop height from `min` to `max`, fixed per column by its base (the game picks it from
 * the base's position too; the numbers here are the preview's own).
 */
export function stopHeight(base: BlockPos, min: number, max: number): number {
  if (min >= max) return max;
  const hash = (Math.imul(base.x, 0x2fc6a5) ^ Math.imul(base.z, 0x6ebfb)) >>> 0;
  return min + (hash % (max - min + 1));
}

/** The leaves of the block `fromTop` below the top of a bamboo column `height` high (B509). */
export function bambooLeaves(fromTop: number, height: number): 'none' | 'small' | 'large' {
  if (height <= 1) return 'none';
  if (height === 2) return fromTop === 0 ? 'small' : 'none';
  if (fromTop <= 1) return 'large';
  return fromTop === 2 ? 'small' : 'none';
}

/** Uses Grow on a block of the five types. */
export function growType3(
  world: SimWorld,
  catalogue: BlockCatalogue,
  block: CatalogueBlock,
  state: BlockState,
  pos: BlockPos,
  random: () => number,
): Types3Grow {
  const facts = block.types3;
  const name = block.displayName;
  const owner = ownerOf(block);
  if (facts?.growing !== undefined) {
    const growing = facts.growing;
    if (growing.berries !== undefined) {
      if (state.properties.berries === 'true')
        return { changes: [], message: `${name} already has berries` };
      const ripe = catalogue.withProperties(state, { berries: 'true' });
      return {
        changes: apply(world, catalogue, [{ pos, state: ripe }]),
        message: `${name} grew berries`,
      };
    }
    let tip = pos;
    while (
      world.get(offset(tip, growing.direction))?.name === owner ||
      world.get(offset(tip, growing.direction))?.name === companion3Id(owner, 'plant')
    ) {
      tip = offset(tip, growing.direction);
    }
    const count =
      growing.bonemeal !== undefined
        ? between(growing.bonemeal.min, growing.bonemeal.max, random)
        : growing.needsWater
          ? 1
          : between(1, 4, random);
    const sets: BlockChange[] = [];
    let age = Number(world.get(tip)?.properties.age ?? 0);
    let at = tip;
    for (let i = 0; i < count; i++) {
      const next = offset(at, growing.direction);
      if (!free(world, catalogue, next)) break;
      age = Math.min(age + 1, STRAND_MAX_AGE);
      const tipState = catalogue.withProperties(
        catalogue.defaultState(owner) ?? block.defaultState,
        { age: String(age) },
      );
      sets.push({ pos: next, state: tipState });
      at = next;
    }
    if (sets.length === 0) return { changes: [], message: `${name} has no room to grow` };
    return {
      changes: apply(world, catalogue, sets),
      message: `${name} grew ${sets.length} block${sets.length === 1 ? '' : 's'} longer`,
      ...(growing.bonemeal === undefined && !growing.needsWater
        ? {
            onlyInMinecraft: `how many blocks one bone meal adds to ${name} (the preview picks 1 to 4)`,
          }
        : {}),
    };
  }
  if (facts?.column !== undefined) {
    const column = facts.column;
    if (column.style === 'bamboo') return growBamboo(world, catalogue, block, state, pos, random);
    let base = pos;
    while (world.get(offset(base, 'down'))?.name === owner) base = offset(base, 'down');
    let top = pos;
    while (world.get(offset(top, 'up'))?.name === owner) top = offset(top, 'up');
    const height = top.y - base.y + 1;
    const stop = stopHeight(base, column.minHeight, column.maxHeight);
    const words = `${name} grows by itself in the game, one block every ${COLUMN_TICKS_PER_BLOCK} random ticks; bone meal does not grow it (Grow stands in for the ticks)`;
    if (height >= stop) {
      return {
        changes: [],
        message: `${name} is as tall as it grows here (${stop})`,
        onlyInMinecraft: words,
      };
    }
    const above = offset(top, 'up');
    if (!free(world, catalogue, above))
      return { changes: [], message: `${name} has no room to grow` };
    return {
      changes: apply(world, catalogue, [{ pos: above, state: block.defaultState }]),
      message: `${name} grew to ${height + 1} blocks`,
      onlyInMinecraft: words,
    };
  }
  if (facts?.multiface !== undefined) {
    if (!facts.multiface.spreads) return { changes: [], message: `${name} does not spread` };
    return spreadMultiface(world, catalogue, block, state, pos, random);
  }
  if (facts?.dripleaf !== undefined) {
    if (facts.dripleaf.size === 'small')
      return growSmallLeaf(world, catalogue, block, state, pos, random);
    // From a stem, up to its leaf.
    let leaf = pos;
    while (world.get(leaf)?.name === companion3Id(owner, 'stem')) leaf = offset(leaf, 'up');
    const leafState = world.get(leaf);
    if (leafState?.name !== owner) return { changes: [], message: `${name} has no leaf to grow` };
    const up = offset(leaf, 'up');
    if (!free(world, catalogue, up)) return { changes: [], message: `${name} has no room to grow` };
    const grown = catalogue.withProperties(leafState, { tilt: 'none' });
    return {
      changes: apply(world, catalogue, [{ pos: up, state: grown }]),
      message: `${name} grew a block taller`,
    };
  }
  return { changes: [], message: `${name} does not grow` };
}

function growBamboo(
  world: SimWorld,
  catalogue: BlockCatalogue,
  block: CatalogueBlock,
  state: BlockState,
  pos: BlockPos,
  random: () => number,
): Types3Grow {
  const owner = ownerOf(block);
  const name = block.displayName;
  const maxHeight = block.types3?.column?.maxHeight ?? 16;
  const stalk = catalogue.blockFor(owner);
  if (stalk === undefined) return { changes: [] };
  if (state.name !== owner) {
    // The shoot grows a stalk above with small leaves and turns into the stalk itself.
    const up = offset(pos, 'up');
    if (!free(world, catalogue, up)) return { changes: [], message: `${name} has no room to grow` };
    const grown = catalogue.withProperties(stalk.defaultState, { leaves: 'small' });
    return {
      changes: apply(world, catalogue, [{ pos: up, state: grown }]),
      message: `${name} grew out of its shoot`,
    };
  }
  const times = between(1, 2, random);
  const changes: BlockChange[] = [];
  let grownBy = 0;
  for (let i = 0; i < times; i++) {
    let base = pos;
    while (world.get(offset(base, 'down'))?.name === owner) base = offset(base, 'down');
    let top = pos;
    while (world.get(offset(top, 'up'))?.name === owner) top = offset(top, 'up');
    const height = top.y - base.y + 1;
    const topState = world.get(top) as BlockState;
    const up = offset(top, 'up');
    if (
      height >= maxHeight ||
      topState.properties.stage === '1' ||
      world.get(up) !== null ||
      !world.inBounds(up)
    )
      break;
    const newHeight = height + 1;
    const age = topState.properties.age === '1' || newHeight >= BAMBOO_THICK_FROM ? '1' : '0';
    const sets: BlockChange[] = [
      {
        pos: up,
        state: catalogue.withProperties(stalk.defaultState, {
          age,
          leaves: bambooLeaves(0, newHeight),
          stage: newHeight >= maxHeight ? '1' : '0',
        }),
      },
    ];
    for (let down = 1; down <= 3; down++) {
      const at = offset(up, 'down', down);
      const here = world.get(at);
      if (here?.name !== owner) break;
      const leaves = bambooLeaves(down, newHeight);
      if (here.properties.leaves !== leaves) {
        sets.push({ pos: at, state: catalogue.withProperties(here, { leaves }) });
      }
    }
    changes.push(...apply(world, catalogue, sets));
    grownBy += 1;
  }
  if (grownBy === 0) return { changes, message: `${name} cannot grow any taller` };
  return {
    changes,
    message: `${name} grew ${grownBy} block${grownBy === 1 ? '' : 's'} taller`,
  };
}

function spreadMultiface(
  world: SimWorld,
  catalogue: BlockCatalogue,
  block: CatalogueBlock,
  state: BlockState,
  pos: BlockPos,
  random: () => number,
): Types3Grow {
  const candidates: BlockChange[] = [];
  const faces = MULTIFACE_SIDES.filter((side) => state.properties[side] === 'true') as Face[];
  // Another face of the same block with something behind it.
  for (const side of MULTIFACE_SIDES as readonly Face[]) {
    if (state.properties[side] === 'true' || !holds(world, catalogue, offset(pos, side))) continue;
    candidates.push({ pos, state: catalogue.withProperties(state, { [side]: 'true' }) });
  }
  // The same face on a block beside it.
  for (const face of faces) {
    for (const dir of FACES) {
      if (dir === face || dir === opposite(face)) continue;
      const at = offset(pos, dir);
      if (!holds(world, catalogue, offset(at, face))) continue;
      const there = world.get(at);
      if (there === null && world.inBounds(at)) {
        candidates.push({
          pos: at,
          state: catalogue.withProperties(block.defaultState, { [face]: 'true' }),
        });
      } else if (there?.name === block.id && there.properties[face] !== 'true') {
        candidates.push({ pos: at, state: catalogue.withProperties(there, { [face]: 'true' }) });
      }
    }
  }
  if (candidates.length === 0)
    return { changes: [], message: `${block.displayName} has nowhere to spread` };
  const pick = candidates[Math.floor(random() * candidates.length)] as BlockChange;
  return {
    changes: apply(world, catalogue, [pick]),
    message: `${block.displayName} spread to another face`,
  };
}

function growSmallLeaf(
  world: SimWorld,
  catalogue: BlockCatalogue,
  block: CatalogueBlock,
  state: BlockState,
  pos: BlockPos,
  random: () => number,
): Types3Grow {
  const name = block.displayName;
  const into = block.types3?.dripleaf?.growsInto;
  const big = into === undefined ? undefined : catalogue.get(into);
  if (big?.types3?.dripleaf?.size !== 'big') {
    return {
      changes: [],
      message: `${name} has no big dripleaf of this project to grow into`,
    };
  }
  const lower = state.properties.half === 'upper' ? offset(pos, 'down') : pos;
  const facing = state.properties.facing ?? 'north';
  const wanted = between(2, SMALL_DRIPLEAF_MAX_HEIGHT, random);
  let height = 2;
  while (height < wanted && free(world, catalogue, offset(lower, 'up', height))) height += 1;
  const stem = catalogue.defaultState(companion3Id(big.id, 'stem'));
  if (stem === undefined) return { changes: [] };
  const sets: BlockChange[] = [];
  for (let i = 0; i < height; i++) {
    const at = offset(lower, 'up', i);
    const wet = String(world.get(at)?.properties.waterlogged === 'true');
    sets.push({
      pos: at,
      state: catalogue.withProperties(i === height - 1 ? big.defaultState : stem, {
        facing,
        waterlogged: wet,
      }),
    });
  }
  return {
    changes: apply(world, catalogue, sets),
    message: `${name} grew into ${big.displayName}, ${height} blocks high`,
  };
}
