/**
 * Block predicates (placement filters, columns, disks) and rule tests (ore targets), read from the
 * file format's fields. Blocks, fluids, tags, biomes and heights are checked as the data says;
 * `solid`, `replaceable`, `has_sturdy_face` and `would_survive` use MSM's own block classes
 * (`blocks.ts`), so `block_predicate_filter` is approximate (ADR 0119 D6). `unobstructed` is
 * always true (the preview has no entities).
 */

import { VerticalAnchor } from 'deepslate/worldgen';
import { withNamespace } from '../registries';
import {
  type Around,
  canSurvive,
  classOf,
  idOf,
  isObject,
  propertiesOf,
  readState,
  replaceable,
} from './blocks';
import type { FeatureContext } from './context';
import { FEATURE_FOLDERS, type ProviderContext } from './providers';

function shortType(value: unknown): string {
  return typeof value === 'string' ? value.replace(/^minecraft:/, '') : '';
}

function idList(value: unknown): string[] {
  if (typeof value === 'string') return [withNamespace(value)];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string').map(withNamespace);
  }
  return [];
}

function offsetOf(value: unknown): [number, number, number] {
  if (Array.isArray(value) && value.length >= 3) {
    return [Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0];
  }
  return [0, 0, 0];
}

function anchor(value: unknown, ctx: FeatureContext): number {
  return VerticalAnchor.fromJson(value)(ctx.worldgen);
}

const DIRECTIONS: Readonly<Record<string, [number, number, number]>> = {
  up: [0, 1, 0],
  down: [0, -1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  west: [-1, 0, 0],
  east: [1, 0, 0],
};

export function directionOf(value: unknown, fallback: [number, number, number] = [0, 1, 0]) {
  return typeof value === 'string' ? (DIRECTIONS[value] ?? fallback) : fallback;
}

/** The neighbours of a position, for `canSurvive`. */
export function around(ctx: FeatureContext, x: number, y: number, z: number): Around {
  const level = ctx.level;
  return {
    below: () => level.get(x, y - 1, z),
    above: () => level.get(x, y + 1, z),
    at: () => level.get(x, y, z),
    side: (dx, dy, dz) => level.get(x + dx, y + dy, z + dz),
  };
}

/** Whether a block predicate holds at a position. */
export function testPredicate(
  ctx: FeatureContext,
  predicate: unknown,
  x: number,
  y: number,
  z: number,
): boolean {
  if (!isObject(predicate)) return true;
  const [ox, oy, oz] = offsetOf(predicate.offset);
  const px = x + ox;
  const py = y + oy;
  const pz = z + oz;
  const level = ctx.level;
  switch (shortType(predicate.type)) {
    case 'true':
      return true;
    case 'not':
      return !testPredicate(ctx, predicate.predicate, x, y, z);
    case 'all_of':
      return (Array.isArray(predicate.predicates) ? predicate.predicates : []).every((p) =>
        testPredicate(ctx, p, x, y, z),
      );
    case 'any_of':
      return (Array.isArray(predicate.predicates) ? predicate.predicates : []).some((p) =>
        testPredicate(ctx, p, x, y, z),
      );
    case 'matching_blocks':
      return idList(predicate.blocks).includes(idOf(level.get(px, py, pz)));
    case 'matching_block_tag':
      return typeof predicate.tag === 'string'
        ? ctx.tags.has(predicate.tag, idOf(level.get(px, py, pz)))
        : false;
    case 'matching_fluids': {
      const c = classOf(level.get(px, py, pz));
      const fluids = idList(predicate.fluids);
      if (c.fluid) return fluids.includes(c.id);
      if (c.water) return fluids.includes('minecraft:water');
      return false;
    }
    case 'matching_biomes': {
      const biome = level.biome(px, py, pz);
      for (const entry of idList(predicate.biomes)) {
        if (entry.startsWith('#') || entry.startsWith('minecraft:#')) {
          const tag = entry.replace(/^minecraft:#/, '').replace(/^#/, '');
          if (ctx.files.biomeTag(tag).includes(biome)) return true;
        } else if (entry === biome) return true;
      }
      return false;
    }
    case 'solid':
      return classOf(level.get(px, py, pz)).solid;
    case 'replaceable':
      return replaceable(classOf(level.get(px, py, pz)));
    case 'has_sturdy_face':
      // Full ground has every face sturdy; leaves and plants have none (MSM's reading).
      return classOf(level.get(px, py, pz)).solid && !classOf(level.get(px, py, pz)).leaves;
    case 'inside_world_bounds':
      return level.inWorld(py);
    case 'height_range': {
      const lo = anchor(predicate.min_inclusive, ctx);
      const hi = anchor(predicate.max_inclusive, ctx);
      return py >= lo && py <= hi;
    }
    case 'would_survive': {
      const state = readState(predicate.state);
      return state ? canSurvive(state, around(ctx, px, py, pz)) : false;
    }
    case 'unobstructed':
      return true;
    case 'volume_match': {
      const [ax, ay, az] = offsetOf(predicate.min);
      const [bx, by, bz] = offsetOf(predicate.max);
      for (let dx = Math.min(ax, bx); dx <= Math.max(ax, bx); dx += 1) {
        for (let dy = Math.min(ay, by); dy <= Math.max(ay, by); dy += 1) {
          for (let dz = Math.min(az, bz); dz <= Math.max(az, bz); dz += 1) {
            if (!testPredicate(ctx, predicate.match, x + dx, y + dy, z + dz)) return false;
          }
        }
      }
      return true;
    }
    default:
      if (typeof predicate.type === 'string') {
        ctx.notes.add({
          kind: 'feature',
          type: withNamespace(predicate.type),
          where: ctx.topFeature,
          drawnInstead: 'This block check is taken as true.',
        });
      }
      return true;
  }
}

/** Whether an ore's rule test holds for a block at height `y`. */
export function testRule(ctx: FeatureContext, rule: unknown, state: string, y: number): boolean {
  if (!isObject(rule)) return false;
  const id = idOf(state);
  const random = ctx.random;
  switch (shortType(rule.predicate_type)) {
    case 'always_true':
      return true;
    case 'block_match':
      return typeof rule.block === 'string' && withNamespace(rule.block) === id;
    case 'blockstate_match':
      return sameState(rule.block_state, state);
    case 'tag_match':
      return typeof rule.tag === 'string' && ctx.tags.has(rule.tag, id);
    case 'random_block_match':
      return (
        typeof rule.block === 'string' &&
        withNamespace(rule.block) === id &&
        random.nextFloat() < Number(rule.probability ?? 1)
      );
    case 'random_blockstate_match':
      return (
        sameState(rule.block_state, state) && random.nextFloat() < Number(rule.probability ?? 1)
      );
    case 'height_match': {
      const lo = Number(rule.min_inclusive ?? Number.MIN_SAFE_INTEGER);
      const hi = Number(rule.max_inclusive ?? Number.MAX_SAFE_INTEGER);
      return y >= lo && y <= hi;
    }
    case 'not':
      return !testRule(ctx, rule.rule ?? rule.predicate, state, y);
    case 'all_of':
      return (Array.isArray(rule.rules) ? rule.rules : []).every((r) => testRule(ctx, r, state, y));
    case 'any_of':
      return (Array.isArray(rule.rules) ? rule.rules : []).some((r) => testRule(ctx, r, state, y));
    default:
      if (typeof rule.predicate_type === 'string') {
        ctx.notes.add({
          kind: 'feature',
          type: withNamespace(rule.predicate_type),
          where: ctx.topFeature,
          drawnInstead: 'This block check matches nothing.',
        });
      }
      return false;
  }
}

function sameState(want: unknown, state: string): boolean {
  const w = readState(want);
  if (!w) return false;
  if (idOf(w) !== idOf(state)) return false;
  const have = propertiesOf(state);
  for (const [k, v] of Object.entries(propertiesOf(w))) if (have[k] !== v) return false;
  return true;
}

/** A provider context at a position. */
export function providerAt(ctx: FeatureContext, x: number, y: number, z: number): ProviderContext {
  return {
    random: ctx.random,
    x,
    y,
    z,
    file: (id) => ctx.files.get(FEATURE_FOLDERS.stateProvider, id),
    test: (predicate) => testPredicate(ctx, predicate, x, y, z),
  };
}
