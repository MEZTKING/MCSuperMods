/**
 * Try it's tools for the twenty types (B463): Grow learns berry bushes, cocoa pods and stems (a
 * full-grown stem puts its fruit beside it and becomes its attached stem, B446); Water puts water
 * into a block that can hold it or takes it out (the waterlogged look, B449); Explode sets off an
 * explosion with no source, as a bed or respawn anchor does, so the place and explosion rules can
 * be tried (ADR 0096 D3, Q29: the blast itself is logged, not shown).
 */
import type { BlockPos, BlockState } from '../../types.js';
import type { SimWorld } from '../../world/sim-world.js';
import type { BlockCatalogue, CatalogueBlock } from '../catalogue.js';
import { HORIZONTALS, offset } from '../directions.js';
import type { BlockChange } from '../neighbours.js';
import { companionId, type SimBlockType2 } from './facts.js';

/** The id of the Water tool in a `tool` action. */
export const WATER_TOOL = 'water';
/** The id of the Explode tool. */
export const EXPLODE_TOOL = 'explode';
/**
 * How far the Explode tool breaks blocks, in blocks from the centre of the block pointed at: a
 * plain sphere, an approximation (the game casts rays whose reach falls off with resistance).
 */
export const EXPLOSION_RADIUS = 2.5;

/** What Grow did to one of the twenty types. */
export interface Types2Grow {
  /** False when the type does not grow by the tool (the caller says so). */
  readonly handled: boolean;
  readonly changes: readonly BlockChange[];
  readonly message?: string;
  readonly onlyInMinecraft?: string;
}

const NOT_GROWN: Types2Grow = Object.freeze({ handled: false, changes: Object.freeze([]) });

const AGE_LAST: Readonly<Partial<Record<SimBlockType2, number>>> = {
  berry_bush: 3,
  cocoa: 2,
  stem: 7,
};

/** Grows a berry bush, cocoa pod or stem one age; a full stem grows its fruit (B446). */
export function growType2(
  world: SimWorld,
  catalogue: BlockCatalogue,
  block: CatalogueBlock,
  type: SimBlockType2,
  state: BlockState,
  pos: BlockPos,
): Types2Grow {
  const name = block.displayName;
  if (block.types2?.companion !== undefined) {
    return { handled: true, changes: [], message: `${name} has grown its fruit` };
  }
  const last = AGE_LAST[type];
  if (last === undefined) {
    if (type === 'sea_pickle' || type === 'tall_plant') {
      return {
        handled: true,
        changes: [],
        onlyInMinecraft:
          type === 'sea_pickle'
            ? `bone meal on ${name} spreads more of it over coral blocks`
            : `bone meal on ${name} drops a copy of it`,
      };
    }
    return NOT_GROWN;
  }
  const age = Number(state.properties.age ?? 0);
  if (age < last) {
    const grown = catalogue.withProperties(state, { age: String(age + 1) });
    const changes = world.set(pos, grown) ? [{ pos, state: grown }] : [];
    return {
      handled: true,
      changes,
      message: `${name} grew to stage ${age + 2} of ${last + 1}`,
    };
  }
  if (type !== 'stem') return { handled: true, changes: [], message: `${name} is fully grown` };
  const fruit = block.types2?.fruit;
  const fruitState = fruit === undefined ? undefined : catalogue.defaultState(fruit);
  const attached = catalogue.defaultState(companionId(block.id, 'attached'));
  if (fruitState === undefined || attached === undefined) {
    return {
      handled: true,
      changes: [],
      onlyInMinecraft: `${name} grows its fruit (${fruit ?? 'none set'}) only in the game`,
    };
  }
  for (const side of HORIZONTALS) {
    const at = offset(pos, side);
    if (!world.inBounds(at) || world.get(at) !== null) continue;
    const below = offset(at, 'down');
    if (!world.isFloor(below) && world.get(below) === null) continue;
    const stem = catalogue.withProperties(attached, { facing: side });
    const changes: BlockChange[] = [];
    if (world.set(at, fruitState)) changes.push({ pos: at, state: fruitState });
    if (world.set(pos, stem)) changes.push({ pos, state: stem });
    return {
      handled: true,
      changes,
      message: `${name} grew ${catalogue.blockFor(fruitState.name)?.displayName ?? fruit} beside it`,
    };
  }
  return { handled: true, changes: [], message: `${name} has no room beside it for its fruit` };
}

/** What the Water tool did. */
export interface WaterResult {
  readonly changed: boolean;
  readonly changes: readonly BlockChange[];
  readonly message: string;
}

/** Puts water into the block at `pos`, or takes it out, when it has `waterlogged`. */
export function waterBlock(world: SimWorld, catalogue: BlockCatalogue, pos: BlockPos): WaterResult {
  const state = world.get(pos);
  if (state === null) return { changed: false, changes: [], message: 'There is no block here.' };
  const block = catalogue.blockFor(state.name);
  const name = block?.displayName ?? state.name;
  if (block?.properties.waterlogged === undefined) {
    return { changed: false, changes: [], message: `${name} cannot hold water.` };
  }
  const wet = state.properties.waterlogged !== 'true';
  const next = catalogue.withProperties(state, { waterlogged: String(wet) });
  const changes = world.set(pos, next) ? [{ pos, state: next }] : [];
  return {
    changed: changes.length > 0,
    changes,
    message: wet ? `${name} is now full of water.` : `You took the water out of ${name}.`,
  };
}

/** The blocks an explosion at the centre of `pos` breaks, nearest first. */
export function explosionReach(world: SimWorld, pos: BlockPos): BlockPos[] {
  const out: { at: BlockPos; d: number }[] = [];
  const r = Math.ceil(EXPLOSION_RADIUS);
  for (let dy = -r; dy <= r; dy++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dy, dz);
        if (d > EXPLOSION_RADIUS) continue;
        const at = { x: pos.x + dx, y: pos.y + dy, z: pos.z + dz };
        if (world.inBounds(at) && world.get(at) !== null) out.push({ at, d });
      }
    }
  }
  return out.sort((a, b) => a.d - b.d).map((one) => one.at);
}
