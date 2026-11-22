/**
 * Cauldrons, bottles and mixing of project fluids in Try it (B540, ADR 0108 as amended after
 * B525, the runtime's `MsmCauldrons`, `MsmCauldronBlock` and `FluidMixing`, B529). Pure helpers
 * over the world, so the area (`area.ts`) and the sim-parity scenarios use the same rules.
 *
 * Cauldrons, by the item used on them (a sneaking use with an item skips them, as the game's):
 * - vanilla's empty cauldron takes a project fluid's bucket (the fluid's cauldron, full) and,
 *   for a cauldron with levels, its bottle (level 1); vanilla's water and lava cauldrons take
 *   a project bucket too, which replaces what they hold (vanilla's own buckets fill vanilla's
 *   cauldrons as in the game);
 * - a project cauldron: the empty bucket takes only a full one (it becomes vanilla's empty
 *   cauldron and the fluid's bucket goes into the inventory); any bucket that has a cauldron
 *   (a project fluid's, vanilla's water or lava bucket) replaces what it holds; with levels the
 *   glass bottle takes a level (from 1 it is empty) and gives the fluid's bottle, and the
 *   fluid's bottle adds one up to 3.
 *
 * Mixing: a source of a fluid with `mixing` checks its five neighbours other than the one below,
 * every fluid-id rule first (in file order), then the `water` and `lava` rules; `water` is
 * vanilla's water, a waterlogged block or a water-like project fluid, `lava` vanilla's lava or a
 * lava-like project fluid (never the fluid itself). On a match the source becomes the rule's
 * `source` block. The preview's fluids do not flow, so `flowing` rules are said, not used.
 */

import type { BlockPos, BlockState } from '../types.js';
import type { SimWorld } from '../world/sim-world.js';
import type { FluidCatalogue, FluidSpec, MixingRule } from './catalogue.js';

/** Vanilla's empty cauldron. */
export const CAULDRON = 'minecraft:cauldron';
/** Vanilla's water and lava cauldrons. */
export const WATER_CAULDRON = 'minecraft:water_cauldron';
export const LAVA_CAULDRON = 'minecraft:lava_cauldron';
/** Vanilla's empty glass bottle. */
export const GLASS_BOTTLE = 'minecraft:glass_bottle';
/** Vanilla's buckets. */
export const BUCKET = 'minecraft:bucket';
export const WATER_BUCKET = 'minecraft:water_bucket';
export const LAVA_BUCKET = 'minecraft:lava_bucket';
/** Vanilla's liquids as the preview places them (props). */
export const WATER_BLOCK = 'minecraft:water';
export const LAVA_BLOCK = 'minecraft:lava';

/** What a use on a cauldron did. */
export interface CauldronUse {
  readonly handled: boolean;
  /** An item the use gives the player. */
  readonly give?: string;
  /** What happened, in words. */
  readonly message?: string;
}

const NOT_HANDLED: CauldronUse = Object.freeze({ handled: false });

/** The full state of a fluid's cauldron. */
function fullCauldron(fluid: FluidSpec): BlockState | null {
  const cauldron = fluid.cauldron;
  if (cauldron === undefined) return null;
  return { name: cauldron.id, properties: cauldron.levels ? { level: '3' } : {} };
}

/** The level a cauldron state holds: 3 for one without levels. */
const levelOf = (state: BlockState): number => Number(state.properties.level ?? '3');

/** The state a bucket fills a cauldron with: a project fluid's cauldron, or vanilla's. */
function bucketContent(fluids: FluidCatalogue, item: string): BlockState | null {
  if (item === WATER_BUCKET) return { name: WATER_CAULDRON, properties: { level: '3' } };
  if (item === LAVA_BUCKET) return { name: LAVA_CAULDRON, properties: {} };
  const fluid = fluids.forBucket(item);
  return fluid === undefined ? null : fullCauldron(fluid);
}

/**
 * Uses `item` on the cauldron at `pos`, if it is one; `nameOf` names blocks and items for the
 * message. See the module comment.
 */
export function useCauldron(
  world: SimWorld,
  fluids: FluidCatalogue,
  pos: BlockPos,
  item: string | undefined,
  nameOf: (id: string) => string = (id) => id,
): CauldronUse {
  const state = world.get(pos);
  if (state === null || item === undefined) return NOT_HANDLED;
  const vanilla =
    state.name === CAULDRON || state.name === WATER_CAULDRON || state.name === LAVA_CAULDRON;
  const fluid = fluids.forCauldron(state.name);
  if (!vanilla && fluid === undefined) return NOT_HANDLED;
  const set = (next: BlockState): void => {
    world.set(pos, next);
  };

  // Buckets that fill (a project fluid's, vanilla's water or lava) replace what any holds.
  const content = bucketContent(fluids, item);
  if (content !== null) {
    set(content);
    return {
      handled: true,
      give: BUCKET,
      message: `You emptied ${nameOf(item)} into the cauldron: it is now ${nameOf(content.name)}.`,
    };
  }
  if (fluid === undefined) {
    // Vanilla's empty cauldron and a project bottle of a fluid whose cauldron has levels.
    const bottled = fluids.forBottle(item);
    if (state.name === CAULDRON && bottled?.cauldron?.levels === true) {
      set({ name: bottled.cauldron.id, properties: { level: '1' } });
      return {
        handled: true,
        give: GLASS_BOTTLE,
        message: `You poured ${nameOf(item)} into the cauldron (level 1 of 3).`,
      };
    }
    return NOT_HANDLED;
  }
  const cauldron = fluid.cauldron;
  if (cauldron === undefined) return NOT_HANDLED;
  const level = levelOf(state);
  if (item === BUCKET) {
    if (level < 3) {
      return {
        handled: true,
        message: `${cauldron.displayName} is not full (level ${level} of 3): a bucket takes only a full cauldron.`,
      };
    }
    set({ name: CAULDRON, properties: {} });
    return {
      handled: true,
      give: fluid.bucket,
      message: `You filled ${fluid.bucketName} from ${cauldron.displayName}.`,
    };
  }
  if (!cauldron.levels) return NOT_HANDLED;
  if (item === GLASS_BOTTLE && fluid.bottle !== undefined) {
    set(
      level <= 1
        ? { name: CAULDRON, properties: {} }
        : { ...state, properties: { level: String(level - 1) } },
    );
    return {
      handled: true,
      give: fluid.bottle.id,
      message: `You filled ${fluid.bottle.name} from ${cauldron.displayName}${level <= 1 ? '; it is empty now' : ` (level ${level - 1} of 3)`}.`,
    };
  }
  if (item === fluid.bottle?.id) {
    if (level >= 3) return { handled: true, message: `${cauldron.displayName} is full.` };
    set({ ...state, properties: { level: String(level + 1) } });
    return {
      handled: true,
      give: GLASS_BOTTLE,
      message: `You poured ${fluid.bottle.name} into ${cauldron.displayName} (level ${level + 1} of 3).`,
    };
  }
  return NOT_HANDLED;
}

/** The block a bucket pours where a block would go: a project fluid or vanilla water or lava. */
export function bucketPours(fluids: FluidCatalogue, item: string): string | undefined {
  if (item === WATER_BUCKET) return WATER_BLOCK;
  if (item === LAVA_BUCKET) return LAVA_BLOCK;
  return fluids.forBucket(item)?.id;
}

/** The five neighbours a liquid checks for mixing: every side but the one below. */
const MIX_SIDES: readonly BlockPos[] = Object.freeze([
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: -1 },
  { x: 0, y: 0, z: 1 },
  { x: -1, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
]);

/** The liquid a state holds, as mixing compares them: a fluid id, or `null`. */
function liquidOf(fluids: FluidCatalogue, state: BlockState | null): string | null {
  if (state === null) return null;
  if (state.name === WATER_BLOCK || state.properties.waterlogged === 'true') return WATER_BLOCK;
  if (state.name === LAVA_BLOCK) return LAVA_BLOCK;
  return fluids.get(state.name) === undefined ? null : state.name;
}

/** Whether `liquid` matches a rule's `with` for `self`. */
function matches(
  fluids: FluidCatalogue,
  self: FluidSpec,
  rule: MixingRule,
  liquid: string,
): boolean {
  if (liquid === self.id) return false;
  if (rule.with === 'water' || rule.with === 'lava') {
    if (liquid === (rule.with === 'water' ? WATER_BLOCK : LAVA_BLOCK)) return true;
    return fluids.get(liquid)?.behavesLike === rule.with;
  }
  const other = rule.with.includes(':') ? rule.with : `minecraft:${rule.with}`;
  return other === liquid;
}

/** What one meeting made. */
export interface Mixed {
  readonly pos: BlockPos;
  readonly fluid: FluidSpec;
  /** The liquid it met: a fluid id. */
  readonly other: string;
  readonly rule: MixingRule;
  /** The block it became; absent when only a `flowing` rule matched (said, not used). */
  readonly became?: string;
}

/**
 * Checks the source at `pos` for its mixing rules; `null` when nothing matches. `stateOf` gives
 * a block id's default state (the catalogue's), so a made block has its properties.
 */
export function mixingAt(
  world: SimWorld,
  fluids: FluidCatalogue,
  pos: BlockPos,
  stateOf: (id: string) => BlockState = (id) => ({ name: id, properties: {} }),
): Mixed | null {
  const state = world.get(pos);
  if (state === null) return null;
  const fluid = fluids.get(state.name);
  const rules = fluid?.mixing ?? [];
  if (fluid === undefined || rules.length === 0) return null;
  const neighbours: string[] = [];
  for (const side of MIX_SIDES) {
    const liquid = liquidOf(
      fluids,
      world.get({ x: pos.x + side.x, y: pos.y + side.y, z: pos.z + side.z }),
    );
    if (liquid !== null) neighbours.push(liquid);
  }
  if (neighbours.length === 0) return null;
  const byId = rules.filter((rule) => rule.with !== 'water' && rule.with !== 'lava');
  const byTag = rules.filter((rule) => rule.with === 'water' || rule.with === 'lava');
  for (const rule of [...byId, ...byTag]) {
    const other = neighbours.find((liquid) => matches(fluids, fluid, rule, liquid));
    if (other === undefined) continue;
    if (rule.source === undefined) return { pos, fluid, other, rule };
    world.set(pos, stateOf(rule.source));
    return { pos, fluid, other, rule, became: rule.source };
  }
  return null;
}

/** The cells whose mixing a change at `pos` may start: `pos` and the liquids beside it. */
export function mixingCandidates(pos: BlockPos): BlockPos[] {
  // A neighbour checks `pos` unless `pos` is right below it.
  return [
    pos,
    { x: pos.x, y: pos.y - 1, z: pos.z },
    { x: pos.x, y: pos.y, z: pos.z - 1 },
    { x: pos.x, y: pos.y, z: pos.z + 1 },
    { x: pos.x - 1, y: pos.y, z: pos.z },
    { x: pos.x + 1, y: pos.y, z: pos.z },
  ];
}
