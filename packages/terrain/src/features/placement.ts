/**
 * Placement modifiers (ADR 0119 D6), read from the file format's fields: each turns a stream of
 * positions into another, in the data's order, with the features' own random. All 18 types of
 * the targets' `worldgen/placement_modifier_type` registry are here (`PLACEMENT_MODIFIER_TYPES`);
 * `block_predicate_filter`, `environment_scan` and `surface_relative_threshold_filter` read MSM's
 * own block classes and heightmaps, so they are approximate. `noise_threshold_count` and
 * `noise_based_count` read a noise of MSM's own over x and z (deepslate's simplex noise, MIT,
 * Copyright (c) Misode), not the game's. An unknown type is reported and leaves its positions as
 * they are.
 *
 * Positions far from the window are dropped once they have their place (a feature of a
 * neighbouring chunk still counts when it can reach into the window).
 */

import { LegacyRandom, SimplexNoise } from 'deepslate/worldgen';
import { withNamespace } from '../registries';
import { isObject } from './blocks';
import type { FeatureContext } from './context';
import { heightmapOf } from './level';
import { directionOf, testPredicate } from './predicates';
import { maxInt, sampleHeight, sampleInt } from './providers';

export type Pos = [number, number, number];

/** The placement modifier types this engine places by. */
export const PLACEMENT_MODIFIER_TYPES: readonly string[] = Object.freeze([
  'biome',
  'block_predicate_filter',
  'count',
  'count_on_every_layer',
  'cuboid',
  'environment_scan',
  'fixed_placement',
  'height_range',
  'heightmap',
  'in_square',
  'noise_based_count',
  'noise_threshold_count',
  'offset',
  'random_chance',
  'randomly_selected',
  'rarity_filter',
  'surface_relative_threshold_filter',
  'surface_water_depth_filter',
]);

/** The approximate ones (ADR 0119 D6). */
export const APPROXIMATE_MODIFIERS: readonly string[] = Object.freeze([
  'block_predicate_filter',
  'environment_scan',
  'surface_relative_threshold_filter',
]);

/** How far a feature reaches from its position: sideways, below it and above it (blocks). */
export interface Reach {
  readonly xz: number;
  readonly below: number;
  readonly above: number;
}

/** Reaching everywhere (a feature whose reach is not known). */
export const EVERYWHERE: Reach = Object.freeze({
  xz: Number.POSITIVE_INFINITY,
  below: Number.POSITIVE_INFINITY,
  above: Number.POSITIVE_INFINITY,
});

/** Whether a feature at `p` reaching `reach`, moved by up to `more`, can touch the window. */
export function canReach(
  ctx: FeatureContext,
  p: Pos,
  reach: Reach,
  more: Reach = NOWHERE,
): boolean {
  const level = ctx.level;
  if (level.distanceXZ(p[0], p[2]) > reach.xz + more.xz) return false;
  const dy = level.distanceY(p[1]);
  // A feature below the window reaches up into it; one above it reaches down.
  return dy >= -(reach.above + more.above) && dy <= reach.below + more.below;
}

export const NOWHERE: Reach = Object.freeze({ xz: 0, below: 0, above: 0 });

function absMax(value: unknown): number {
  if (typeof value === 'number') return Math.abs(Math.floor(value));
  if (!isObject(value)) return 0;
  const lo = Math.floor(Number(value.min_inclusive ?? value.min ?? value.value ?? 0) || 0);
  const hi = maxInt(value);
  if (shortType(value.type) === 'weighted_list') return Math.max(Math.abs(hi), Math.abs(lo));
  return Math.max(Math.abs(lo), Math.abs(hi));
}

/** How far one modifier can move a position (infinite where it picks a new column or height). */
export function modifierSpread(m: unknown): Reach {
  if (!isObject(m)) return NOWHERE;
  switch (shortType(m.type)) {
    case 'in_square':
    case 'fixed_placement':
      return { xz: Number.POSITIVE_INFINITY, below: 0, above: 0 };
    case 'height_range':
    case 'heightmap':
      return { xz: 0, below: Number.POSITIVE_INFINITY, above: Number.POSITIVE_INFINITY };
    case 'count_on_every_layer':
      return EVERYWHERE;
    case 'offset': {
      const y = absMax(m.y);
      return { xz: Math.max(absMax(m.x), absMax(m.z)), below: y, above: y };
    }
    case 'cuboid': {
      const y = maxInt(m.y_size);
      return { xz: maxInt(m.xz_size), below: 0, above: y };
    }
    case 'environment_scan': {
      const steps = Math.max(0, Math.floor(Number(m.max_steps) || 0));
      return { xz: 0, below: steps, above: steps };
    }
    case 'randomly_selected': {
      let out = NOWHERE;
      for (const q of Array.isArray(m.placements) ? m.placements : [])
        out = add(out, modifierSpread(q), true);
      return out;
    }
    default:
      return NOWHERE;
  }
}

/** Two reaches added (`max`: the larger of each instead). */
export function add(a: Reach, b: Reach, max = false): Reach {
  const f = max ? Math.max : (x: number, y: number) => x + y;
  return { xz: f(a.xz, b.xz), below: f(a.below, b.below), above: f(a.above, b.above) };
}

let infoNoise: SimplexNoise | undefined;

/** A noise of MSM's own over x and z, from -1 to 1 roughly, for the count modifiers. */
function countNoise(x: number, z: number): number {
  infoNoise ??= new SimplexNoise(new LegacyRandom(2345n));
  return infoNoise.get2D(x, z);
}

function shortType(value: unknown): string {
  return typeof value === 'string' ? value.replace(/^minecraft:/, '') : '';
}

function repeat(p: Pos, n: number, out: Pos[]): void {
  for (let i = 0; i < n; i += 1) out.push([p[0], p[1], p[2]]);
}

/** The modifiers that settle a position's column or height; after them a far one is dropped. */
const SETTLES_XZ = new Set(['in_square', 'fixed_placement']);
const SETTLES_Y = new Set(['height_range', 'heightmap', 'fixed_placement']);

/**
 * The positions a list of modifiers gives from an origin. `spread` says whether the origin has
 * its column already (a nested feature's origin has; a chunk's corner has not).
 */
export function placePositions(
  ctx: FeatureContext,
  modifiers: readonly unknown[],
  origin: Pos,
  spread: boolean,
  reach: Reach = EVERYWHERE,
): Pos[] {
  let positions: Pos[] = [origin];
  let settled = spread;
  let height = spread;
  // How far the modifiers after each one can still move a position.
  const later: Reach[] = new Array(modifiers.length);
  let after = NOWHERE;
  for (let i = modifiers.length - 1; i >= 0; i -= 1) {
    later[i] = after;
    after = add(after, modifierSpread(modifiers[i]));
  }
  for (let i = 0; i < modifiers.length; i += 1) {
    if (positions.length === 0) break;
    const modifier = modifiers[i];
    const type = isObject(modifier) ? shortType(modifier.type) : '';
    const next: Pos[] = [];
    for (const p of positions) apply(ctx, modifier, type, p, next);
    positions = next;
    if (SETTLES_XZ.has(type)) settled = true;
    if (SETTLES_Y.has(type)) height = true;
    if ((settled || height) && positions.length > 0) {
      const more = later[i] as Reach;
      const r: Reach = {
        xz: settled ? reach.xz : Number.POSITIVE_INFINITY,
        below: height ? reach.below : Number.POSITIVE_INFINITY,
        above: height ? reach.above : Number.POSITIVE_INFINITY,
      };
      positions = positions.filter((p) => canReach(ctx, p, r, more));
    }
  }
  return positions;
}

function apply(ctx: FeatureContext, m: unknown, type: string, p: Pos, out: Pos[]): void {
  if (!isObject(m)) return;
  const random = ctx.random;
  const level = ctx.level;
  switch (type) {
    case 'count':
      repeat(p, Math.max(0, sampleInt(m.count, random)), out);
      return;
    case 'in_square':
      out.push([p[0] + random.nextInt(16), p[1], p[2] + random.nextInt(16)]);
      return;
    case 'height_range':
      out.push([p[0], sampleHeight(m.height, random, ctx.worldgen), p[2]]);
      return;
    case 'heightmap': {
      const y = level.height(p[0], p[2], heightmapOf(m.heightmap));
      if (y > level.minY) out.push([p[0], y, p[2]]);
      return;
    }
    case 'biome':
      if (ctx.biomeHas(level.biome(p[0], p[1], p[2]), ctx.topFeature)) out.push(p);
      return;
    case 'block_predicate_filter':
      if (testPredicate(ctx, m.predicate, p[0], p[1], p[2])) out.push(p);
      return;
    case 'rarity_filter': {
      const chance = Math.max(1, Math.floor(Number(m.chance) || 1));
      if (random.nextFloat() < 1 / chance) out.push(p);
      return;
    }
    case 'random_chance':
      if (random.nextFloat() < (Number(m.chance) || 0)) out.push(p);
      return;
    case 'offset':
      out.push([
        p[0] + sampleInt(m.x, random),
        p[1] + sampleInt(m.y, random),
        p[2] + sampleInt(m.z, random),
      ]);
      return;
    case 'surface_relative_threshold_filter': {
      const surface = level.height(p[0], p[2], heightmapOf(m.heightmap));
      const lo = surface + (typeof m.min_inclusive === 'number' ? m.min_inclusive : -Infinity);
      const hi = surface + (typeof m.max_inclusive === 'number' ? m.max_inclusive : Infinity);
      if (p[1] >= lo && p[1] <= hi) out.push(p);
      return;
    }
    case 'surface_water_depth_filter': {
      const floor = level.height(p[0], p[2], 'OCEAN_FLOOR_WG');
      const surface = level.height(p[0], p[2], 'WORLD_SURFACE_WG');
      if (surface - floor <= (Number(m.max_water_depth) || 0)) out.push(p);
      return;
    }
    case 'environment_scan': {
      const [, dy] = directionOf(m.direction_of_search, [0, 1, 0]);
      const steps = Math.max(0, Math.floor(Number(m.max_steps) || 0));
      let y = p[1];
      if (m.allowed_search_condition !== undefined) {
        if (!testPredicate(ctx, m.allowed_search_condition, p[0], y, p[2])) return;
      }
      for (let i = 0; i < steps; i += 1) {
        if (testPredicate(ctx, m.target_condition, p[0], y, p[2])) {
          out.push([p[0], y, p[2]]);
          return;
        }
        y += dy;
        if (!level.inWorld(y)) return;
        if (
          m.allowed_search_condition !== undefined &&
          !testPredicate(ctx, m.allowed_search_condition, p[0], y, p[2])
        ) {
          break;
        }
      }
      if (testPredicate(ctx, m.target_condition, p[0], y, p[2])) out.push([p[0], y, p[2]]);
      return;
    }
    case 'noise_threshold_count': {
      const v = countNoise(p[0] / 200, p[2] / 200);
      const n = v < (Number(m.noise_level) || 0) ? m.below_noise : m.above_noise;
      repeat(p, Math.max(0, Math.floor(Number(n) || 0)), out);
      return;
    }
    case 'noise_based_count': {
      const factor = Number(m.noise_factor) || 1;
      const v = countNoise(p[0] / factor, p[2] / factor);
      const n = Math.ceil(
        (v + (Number(m.noise_offset) || 0)) * (Number(m.noise_to_count_ratio) || 0),
      );
      repeat(p, Math.max(0, n), out);
      return;
    }
    case 'count_on_every_layer': {
      // For each layer of ground from the top down, `count` spots on it (MSM's reading).
      const count = Math.max(0, sampleInt(m.count, random));
      for (let layer = 0; layer < 32; layer += 1) {
        let found = false;
        for (let i = 0; i < count; i += 1) {
          const x = p[0] + random.nextInt(16);
          const z = p[2] + random.nextInt(16);
          const y = layerTop(ctx, x, z, layer);
          if (y === undefined) continue;
          found = true;
          out.push([x, y, z]);
        }
        if (!found) return;
      }
      return;
    }
    case 'cuboid': {
      // The faces of a box over the position; edges and the inside only when asked.
      const xz = Math.max(1, sampleInt(m.xz_size, random));
      const h = Math.max(1, sampleInt(m.y_size, random));
      const interior = m.include_interior === true;
      const edges = m.include_edges === true;
      const half = Math.floor(xz / 2);
      for (let dx = 0; dx < xz; dx += 1) {
        for (let dz = 0; dz < xz; dz += 1) {
          for (let dy = 0; dy < h; dy += 1) {
            const onX = dx === 0 || dx === xz - 1;
            const onZ = dz === 0 || dz === xz - 1;
            const onY = dy === 0 || dy === h - 1;
            const faces = (onX ? 1 : 0) + (onZ ? 1 : 0) + (onY ? 1 : 0);
            if (faces === 0 && !interior) continue;
            if (faces >= 2 && !edges) continue;
            out.push([p[0] + dx - half, p[1] + dy, p[2] + dz - half]);
          }
        }
      }
      return;
    }
    case 'randomly_selected': {
      const list = Array.isArray(m.placements) ? m.placements : [];
      if (list.length === 0) return;
      const pick = list[random.nextInt(list.length)];
      apply(ctx, pick, isObject(pick) ? shortType(pick.type) : '', p, out);
      return;
    }
    case 'fixed_placement': {
      // Positions in this chunk only.
      for (const q of Array.isArray(m.positions) ? m.positions : []) {
        if (!Array.isArray(q) || q.length < 3) continue;
        const [x, y, z] = [Number(q[0]), Number(q[1]), Number(q[2])];
        if (x >> 4 === ctx.chunkX && z >> 4 === ctx.chunkZ) out.push([x, y, z]);
      }
      return;
    }
    default:
      ctx.notes.add({
        kind: 'placement',
        type: typeof m.type === 'string' ? withNamespace(m.type) : 'unknown',
        where: ctx.topFeature,
        drawnInstead: 'The feature is placed without this rule.',
      });
      out.push(p);
  }
}

/** The height above the n-th layer of ground from the top of a column, if there is one. */
function layerTop(ctx: FeatureContext, x: number, z: number, layer: number): number | undefined {
  const level = ctx.level;
  let y = level.height(x, z, 'MOTION_BLOCKING');
  let seen = 0;
  let wasOpen = true;
  for (; y >= level.minY; y -= 1) {
    const solid = level.classAt(x, y, z).solid;
    if (solid && wasOpen) {
      if (seen === layer) return y + 1;
      seen += 1;
    }
    wasOpen = !solid;
  }
  return undefined;
}
