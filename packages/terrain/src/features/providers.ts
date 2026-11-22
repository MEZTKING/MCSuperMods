/**
 * Number and block providers of the feature data, read from the file format's fields: int
 * providers (`constant`, `uniform`, `biased_to_bottom`, `very_biased_to_bottom`, `clamped`,
 * `clamped_normal`, `trapezoid`, `weighted_list`, or a bare number), float providers, height
 * providers (deepslate's, MIT, Copyright (c) Misode) and block state providers (`simple`,
 * `weighted`, `random_block`, `randomized_int`, `rotated`, `copy_properties`, `noise`,
 * `noise_threshold`, `dual_noise`, `rule_based`, a bare state, or the id of a
 * `worldgen/block_state_provider` file). The distributions are MSM's own readings of their names
 * (ADR 0119 D6: features are approximate).
 */

import {
  HeightProvider,
  LegacyRandom,
  type Noise,
  NormalNoise,
  type WorldgenContext,
} from 'deepslate/worldgen';
import { withNamespace } from '../registries';
import { idOf, isObject, propertiesOf, readState, stateString, withProperties } from './blocks';
import type { FeatureRandom } from './random';

/** A feature's folders (their keys in `WorldgenFileMap`). */
export const FEATURE_FOLDERS = Object.freeze({
  configured: 'worldgen/feature',
  placed: 'worldgen/placed_feature',
  stateProvider: 'worldgen/block_state_provider',
  blockTags: 'tags/block',
  biome: 'worldgen/biome',
});

function shortType(value: unknown): string {
  return typeof value === 'string' ? value.replace(/^minecraft:/, '') : '';
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A weighted pick from `[{ data, weight }]`; undefined when the list is empty. */
export function pickWeighted<T>(
  random: FeatureRandom,
  entries: readonly unknown[],
  read: (data: unknown) => T,
): T | undefined {
  let total = 0;
  for (const e of entries) if (isObject(e)) total += Math.max(0, num(e.weight, 1));
  if (total <= 0) return undefined;
  let r = random.nextInt(total);
  for (const e of entries) {
    if (!isObject(e)) continue;
    r -= Math.max(0, num(e.weight, 1));
    if (r < 0) return read(e.data);
  }
  return undefined;
}

/** A value of an int provider. */
export function sampleInt(value: unknown, random: FeatureRandom): number {
  if (typeof value === 'number') return Math.floor(value);
  if (!isObject(value)) return 0;
  const min = Math.floor(num(value.min_inclusive ?? value.min, 0));
  const max = Math.floor(num(value.max_inclusive ?? value.max, min));
  switch (shortType(value.type)) {
    case 'constant':
      return Math.floor(num(value.value, 0));
    case 'uniform':
      return random.between(min, max);
    case 'biased_to_bottom': {
      // A uniform pick below a uniform bound leans to the low end.
      return min + random.nextInt(random.nextInt(max - min + 1) + 1);
    }
    case 'very_biased_to_bottom': {
      const a = random.nextInt(max - min + 1);
      const b = random.nextInt(a + 1);
      return min + random.nextInt(b + 1);
    }
    case 'clamped': {
      const v = sampleInt(value.source, random);
      return Math.min(max, Math.max(min, v));
    }
    case 'clamped_normal': {
      const v = Math.round(num(value.mean, 0) + random.nextGaussian() * num(value.deviation, 1));
      return Math.min(max, Math.max(min, v));
    }
    case 'trapezoid': {
      // Two uniform halves add up to a trapezoid; `plateau` widens its flat top.
      const plateau = Math.max(0, Math.floor(num(value.plateau, 0)));
      const range = max - min;
      if (plateau >= range) return random.between(min, max);
      const side = (range - plateau) / 2;
      const a = random.nextFloat() * (side + plateau);
      const b = random.nextFloat() * side;
      return Math.min(max, Math.max(min, Math.round(min + a + b)));
    }
    case 'weighted_list':
      return (
        pickWeighted(random, Array.isArray(value.distribution) ? value.distribution : [], (d) =>
          sampleInt(d, random),
        ) ?? 0
      );
    default:
      return 0;
  }
}

/** The largest value an int provider can give (for reach and count bounds). */
export function maxInt(value: unknown): number {
  if (typeof value === 'number') return Math.floor(value);
  if (!isObject(value)) return 0;
  switch (shortType(value.type)) {
    case 'constant':
      return Math.floor(num(value.value, 0));
    case 'weighted_list': {
      let m = 0;
      for (const e of Array.isArray(value.distribution) ? value.distribution : []) {
        if (isObject(e)) m = Math.max(m, maxInt(e.data));
      }
      return m;
    }
    default:
      return Math.floor(num(value.max_inclusive ?? value.max, 0));
  }
}

/** A value of a float provider. */
export function sampleFloat(value: unknown, random: FeatureRandom): number {
  if (typeof value === 'number') return value;
  if (!isObject(value)) return 0;
  const min = num(value.min_inclusive ?? value.min, 0);
  const max = num(value.max_inclusive ?? value.max, min);
  switch (shortType(value.type)) {
    case 'constant':
      return num(value.value, 0);
    case 'uniform':
      return min + random.nextFloat() * (max - min);
    case 'clamped_normal':
      return Math.min(
        max,
        Math.max(min, num(value.mean, 0) + random.nextGaussian() * num(value.deviation, 1)),
      );
    case 'trapezoid': {
      const plateau = num(value.plateau, 0);
      const side = (max - min - plateau) / 2;
      return min + random.nextFloat() * (side + plateau) + random.nextFloat() * side;
    }
    default:
      return 0;
  }
}

const heightProviders = new Map<string, HeightProvider>();

/** A height of a height provider (deepslate's, with the features' random). */
export function sampleHeight(
  value: unknown,
  random: FeatureRandom,
  context: WorldgenContext,
): number {
  const key = JSON.stringify(value ?? null);
  let provider = heightProviders.get(key);
  if (!provider) {
    provider = HeightProvider.fromJson(value);
    if (heightProviders.size > 1024) heightProviders.clear();
    heightProviders.set(key, provider);
  }
  return provider(random, context);
}

// --- Block state providers ---

/** What a block state provider can read at its position. */
export interface ProviderContext {
  readonly random: FeatureRandom;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** A `worldgen/block_state_provider` file. */
  file(id: string): unknown;
  /** A rule's block predicate at the position. */
  test(predicate: unknown): boolean;
}

const noises = new Map<string, Noise>();

function noiseOf(params: unknown, seed: number): Noise {
  const key = `${seed}|${JSON.stringify(params ?? null)}`;
  let noise = noises.get(key);
  if (!noise) {
    noise = NormalNoise.fromJson(params ?? {}).create(new LegacyRandom(BigInt(Math.floor(seed))));
    if (noises.size > 256) noises.clear();
    noises.set(key, noise);
  }
  return noise;
}

function noiseValue(json: Record<string, unknown>, ctx: ProviderContext, scaleKey = 'scale') {
  const noise = noiseOf(json.noise, num(json.seed, 0));
  const scale = num(json[scaleKey], 1);
  return noise.get3D(ctx.x * scale, ctx.y * scale, ctx.z * scale);
}

function fromList(list: unknown, value: number): string | undefined {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const t = Math.min(0.9999, Math.max(0, (value + 1) / 2));
  return readState(list[Math.floor(t * list.length)]);
}

function anyOf(list: unknown, random: FeatureRandom): string | undefined {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  return readState(list[random.nextInt(list.length)]);
}

/** A block of a block state provider, or undefined when it gives none. */
export function provideState(value: unknown, ctx: ProviderContext, depth = 0): string | undefined {
  if (depth > 16) return undefined;
  if (typeof value === 'string') {
    const file = ctx.file(withNamespace(value));
    if (file !== undefined) return provideState(file, ctx, depth + 1);
    return readState(value);
  }
  if (!isObject(value)) return undefined;
  if (value.type === undefined) return readState(value);
  const random = ctx.random;
  switch (shortType(value.type)) {
    case 'simple':
      return readState(value.state);
    case 'weighted':
      return pickWeighted(random, Array.isArray(value.entries) ? value.entries : [], readState);
    case 'random_block': {
      const blocks = typeof value.blocks === 'string' ? [value.blocks] : value.blocks;
      return anyOf(blocks, random);
    }
    case 'randomized_int': {
      const state = provideState(value.source, ctx, depth + 1);
      if (!state || typeof value.property !== 'string') return state;
      return withProperties(state, { [value.property]: String(sampleInt(value.values, random)) });
    }
    case 'rotated': {
      const state = provideState(value.state, ctx, depth + 1);
      if (!state) return state;
      const axis = ['x', 'y', 'z'][random.nextInt(3)] as string;
      return 'axis' in propertiesOf(state) ? withProperties(state, { axis }) : state;
    }
    case 'copy_properties':
      return provideState(value.source, ctx, depth + 1);
    case 'noise':
      return fromList(value.states, noiseValue(value, ctx));
    case 'dual_noise': {
      // The slow noise picks how varied a spot is; the plain noise picks the block.
      return fromList(value.states, noiseValue(value, ctx));
    }
    case 'noise_threshold': {
      const v = noiseValue(value, ctx);
      if (v < num(value.threshold, 0)) return anyOf(value.low_states, random);
      if (random.nextFloat() < num(value.high_chance, 0)) return anyOf(value.high_states, random);
      return readState(value.default_state);
    }
    case 'rule_based': {
      for (const rule of Array.isArray(value.rules) ? value.rules : []) {
        if (isObject(rule) && ctx.test(rule.if_true))
          return provideState(rule.then, ctx, depth + 1);
      }
      return value.fallback === undefined
        ? undefined
        : provideState(value.fallback, ctx, depth + 1);
    }
    default:
      return undefined;
  }
}

/** The same block turned to lie along an axis, when it has one. */
export function onAxis(state: string, axis: 'x' | 'y' | 'z'): string {
  return 'axis' in propertiesOf(state) ? withProperties(state, { axis }) : state;
}

/** A plain state string of an id (for fallbacks). */
export function plain(id: string): string {
  return stateString(idOf(id));
}
