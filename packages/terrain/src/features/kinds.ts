/**
 * The feature types the preview draws (spike B574, WS15: the first subset) and the selectors that
 * reach them: `simple_block`, `block_column`, `ore`, `scattered_ore`, `disk`,
 * `freeze_top_layer`, `no_op`, `random_selector`, `weighted_random_selector`,
 * `simple_random_selector`, `random_boolean_selector`, `sequence`, and `tree` and `fallen_tree`
 * (`trees.ts`). Shapes are MSM's own, read from each type's fields (ADR 0119 D6: about right,
 * not block for block). Every other type is reported by name with what was drawn instead.
 */

import { withNamespace } from '../registries';
import {
  canSurvive,
  classOf,
  DOUBLE_PLANTS,
  idOf,
  isObject,
  readState,
  replaceable,
  withProperties,
} from './blocks';
import type { FeatureContext } from './context';
import {
  add,
  canReach,
  EVERYWHERE,
  modifierSpread,
  NOWHERE,
  type Pos,
  placePositions,
  type Reach,
} from './placement';
import { around, directionOf, providerAt, testPredicate, testRule } from './predicates';
import { FEATURE_FOLDERS, maxInt, pickWeighted, provideState, sampleInt } from './providers';
import { placeFallenTree, placeTree } from './trees';

type Json = Record<string, unknown>;

function shortType(value: unknown): string {
  return typeof value === 'string' ? value.replace(/^minecraft:/, '') : '';
}

/** The feature types the preview draws. */
export const FEATURE_TYPES: readonly string[] = Object.freeze([
  'block_column',
  'disk',
  'fallen_tree',
  'freeze_top_layer',
  'no_op',
  'ore',
  'random_boolean_selector',
  'random_selector',
  'scattered_ore',
  'sequence',
  'simple_block',
  'simple_random_selector',
  'tree',
  'weighted_random_selector',
]);

/** Plain names of the types left out (for the notes); others are "this kind of feature". */
const LEFT_OUT_NAMES: Readonly<Record<string, string>> = {
  geode: 'Geodes',
  monster_room: 'Dungeons',
  lake: 'Lakes',
  spring_feature: 'Springs',
  underwater_magma: 'Magma under water',
  multiface_growth: 'Lichen and veins on cave walls',
  fossil: 'Fossils',
  huge_fungus: 'Huge fungi',
  huge_brown_mushroom: 'Huge mushrooms',
  huge_red_mushroom: 'Huge mushrooms',
  speleothem: 'Dripstone',
  speleothem_cluster: 'Dripstone',
  large_dripstone: 'Dripstone',
  large_speleothem: 'Dripstone',
  crevasse: 'Crevasses',
  pointed_dripstone: 'Dripstone',
  coral_claw: 'Coral',
  coral_tree: 'Coral',
  coral_mushroom: 'Coral',
  end_gateway: 'End gateways',
  end_island: 'End islands',
  end_platform: 'The End platform',
  end_podium: 'The End portal',
  end_spike: 'End pillars',
  chorus_plant: 'Chorus plants',
  void_start_platform: 'The start platform',
  delta_feature: 'Nether deltas',
  netherrack_replace_blobs: 'Nether blobs',
  stepped_column_cluster: 'Basalt columns',
  basalt_columns: 'Basalt columns',
  basalt_pillar: 'Basalt pillars',
  vegetation_patch: 'Moss and clay patches',
  waterlogged_vegetation_patch: 'Moss and clay patches',
  bamboo: 'Bamboo',
  iceberg: 'Icebergs',
  blue_ice: 'Blue ice',
  spike: 'Ice spikes',
  block_pile: 'Piles of blocks',
  block_blob: 'Boulders',
  root_system: 'Roots under azaleas',
  sculk_patch: 'Sculk',
  vines: 'Vines',
  template: 'Small buildings',
  overlay: 'Small buildings',
  bonus_chest: 'The bonus chest',
  random_neighbor_spread: 'Spreading plants',
  projected_random_patchy_square: 'Patches',
  fill_layer: 'Layers of blocks',
  replace_single_block: 'Single replaced blocks',
  single_block_pillar: 'Pillars',
};

const MASS_NOUNS = new Set([
  'Magma under water',
  'Dripstone',
  'Coral',
  'Bamboo',
  'Blue ice',
  'Sculk',
]);

/** The words for a type left out. */
export function leftOutWords(type: string): string {
  const name = LEFT_OUT_NAMES[shortType(type)];
  if (!name) return 'Nothing: this kind of feature is not drawn in the preview yet.';
  const verb = MASS_NOUNS.has(name) || name.startsWith('The ') ? 'is' : 'are';
  return `Nothing: ${name.charAt(0).toLowerCase()}${name.slice(1)} ${verb} not drawn in the preview yet.`;
}

const MAX_DEPTH = 12;

/** A placed feature (an id or written out) at a position: its modifiers, then its feature. */
export function placePlaced(
  ctx: FeatureContext,
  ref: unknown,
  origin: Pos,
  spread: boolean,
  depth = 0,
): boolean {
  if (depth > MAX_DEPTH) return false;
  let json = ref;
  let where = ctx.topFeature;
  if (typeof ref === 'string') {
    where = withNamespace(ref);
    json = ctx.files.get(FEATURE_FOLDERS.placed, where);
    if (json === undefined) {
      ctx.notes.add({
        kind: 'file',
        type: `${FEATURE_FOLDERS.placed}/${where}`,
        where: ctx.topFeature,
        drawnInstead: 'Nothing: the file is missing.',
      });
      return false;
    }
  }
  if (!isObject(json)) return false;
  const placement = Array.isArray(json.placement) ? json.placement : [];
  const reach = featureReach(ctx, json.feature);
  let placed = false;
  for (const p of placePositions(ctx, placement, origin, spread, reach)) {
    if (!canReach(ctx, p, reach)) continue;
    if (placeConfigured(ctx, json.feature, p, where, depth + 1)) placed = true;
  }
  return placed;
}

/** A configured feature (an id or written out) at a position. */
export function placeConfigured(
  ctx: FeatureContext,
  ref: unknown,
  p: Pos,
  where: string,
  depth: number,
): boolean {
  if (depth > MAX_DEPTH) return false;
  let json = ref;
  let id = where;
  if (typeof ref === 'string') {
    id = withNamespace(ref);
    json = ctx.files.get(FEATURE_FOLDERS.configured, id);
    if (json === undefined) {
      ctx.notes.add({
        kind: 'file',
        type: `${FEATURE_FOLDERS.configured}/${id}`,
        where,
        drawnInstead: 'Nothing: the file is missing.',
      });
      return false;
    }
  }
  if (!isObject(json)) return false;
  const type = shortType(json.type);
  const config: Json = isObject(json.config) ? { ...json, ...json.config } : json;
  switch (type) {
    case 'no_op':
      return true;
    case 'simple_block':
      return simpleBlock(ctx, config, p);
    case 'block_column':
      return blockColumn(ctx, config, p);
    case 'ore':
      return ore(ctx, config, p, false);
    case 'scattered_ore':
      return ore(ctx, config, p, true);
    case 'disk':
      return disk(ctx, config, p);
    case 'freeze_top_layer':
      return freezeTopLayer(ctx, p);
    case 'tree':
      return placeTree(ctx, config, p, id);
    case 'fallen_tree':
      return placeFallenTree(ctx, config, p, id);
    case 'random_selector': {
      for (const entry of Array.isArray(config.features) ? config.features : []) {
        if (!isObject(entry)) continue;
        if (ctx.random.nextFloat() < (Number(entry.chance) || 0)) {
          return placePlaced(ctx, entry.feature, p, true, depth);
        }
      }
      return placePlaced(ctx, config.default, p, true, depth);
    }
    case 'simple_random_selector': {
      const list = placedList(config.features);
      if (list.length === 0) return false;
      return placePlaced(ctx, list[ctx.random.nextInt(list.length)], p, true, depth);
    }
    case 'weighted_random_selector': {
      const pick = pickWeighted(
        ctx.random,
        Array.isArray(config.features) ? config.features : [],
        (d) => d,
      );
      return pick === undefined ? false : placePlaced(ctx, pick, p, true, depth);
    }
    case 'random_boolean_selector':
      return placePlaced(
        ctx,
        ctx.random.nextBoolean() ? config.feature_true : config.feature_false,
        p,
        true,
        depth,
      );
    case 'sequence': {
      let any = false;
      for (const f of placedList(config.features)) {
        if (placePlaced(ctx, f, p, true, depth)) any = true;
      }
      return any;
    }
    default:
      ctx.notes.add({
        kind: 'feature',
        type: typeof json.type === 'string' ? withNamespace(json.type) : 'unknown',
        where: id,
        drawnInstead: leftOutWords(type),
      });
      return false;
  }
}

function placedList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined ? [] : [value];
}

function simpleBlock(ctx: FeatureContext, config: Json, p: Pos): boolean {
  const [x, y, z] = p;
  const state = provideState(config.to_place, providerAt(ctx, x, y, z));
  if (!state) return false;
  const level = ctx.level;
  if (!canSurvive(state, around(ctx, x, y, z))) return false;
  if (DOUBLE_PLANTS.has(idOf(state))) {
    if (!replaceable(level.classAt(x, y + 1, z)) && !level.classAt(x, y + 1, z).water) return false;
    level.set(x, y, z, withProperties(state, { half: 'lower' }));
    level.set(x, y + 1, z, withProperties(state, { half: 'upper' }));
    return true;
  }
  level.set(x, y, z, state);
  return true;
}

function blockColumn(ctx: FeatureContext, config: Json, p: Pos): boolean {
  const layers = Array.isArray(config.layers) ? config.layers.filter(isObject) : [];
  if (layers.length === 0) return false;
  const heights = layers.map((l) => Math.max(0, sampleInt(l.height, ctx.random)));
  const total = heights.reduce((a, b) => a + b, 0);
  if (total === 0) return false;
  const [, dy] = directionOf(config.direction, [0, 1, 0]);
  // How far the column can go before `allowed_placement` stops it.
  let room = 0;
  while (room < total) {
    const y = p[1] + dy * room;
    if (!ctx.level.inWorld(y) || !testPredicate(ctx, config.allowed_placement, p[0], y, p[2])) {
      break;
    }
    room += 1;
  }
  if (room === 0) return false;
  // Cut what does not fit: from the tip, or from the base when the tip comes first.
  let cut = total - room;
  const order = heights.map((_, i) => i);
  if (config.prioritize_tip === true) order.reverse();
  for (let k = order.length - 1; k >= 0 && cut > 0; k -= 1) {
    const i = order[k] as number;
    const take = Math.min(cut, heights[i] as number);
    heights[i] = (heights[i] as number) - take;
    cut -= take;
  }
  let at = 0;
  for (let i = 0; i < layers.length; i += 1) {
    for (let n = 0; n < (heights[i] as number); n += 1) {
      const y = p[1] + dy * at;
      const state = provideState(layers[i]?.provider, providerAt(ctx, p[0], y, p[2]));
      if (state) ctx.level.set(p[0], y, p[2], state);
      at += 1;
    }
  }
  return at > 0;
}

interface OreTarget {
  readonly target: unknown;
  readonly state: string;
}

function oreTargets(config: Json): OreTarget[] {
  const out: OreTarget[] = [];
  for (const t of Array.isArray(config.targets) ? config.targets : []) {
    if (!isObject(t)) continue;
    const state = readState(t.state);
    if (state) out.push({ target: t.target, state });
  }
  return out;
}

/** Replaces a block with the first target whose rule holds; true when one did. */
function replaceOre(
  ctx: FeatureContext,
  targets: readonly OreTarget[],
  discard: number,
  x: number,
  y: number,
  z: number,
): boolean {
  const level = ctx.level;
  // Ores change nothing a later feature reads outside the window: only the window is looked at.
  if (!level.inWindow(x, y, z)) return false;
  const here = level.get(x, y, z);
  for (const t of targets) {
    if (!testRule(ctx, t.target, here, y)) continue;
    if (discard > 0 && exposed(ctx, x, y, z) && ctx.random.nextFloat() < discard) return false;
    level.set(x, y, z, t.state);
    return true;
  }
  return false;
}

/** Whether a block touches air (inside the window; a neighbour outside it counts as ground). */
function exposed(ctx: FeatureContext, x: number, y: number, z: number): boolean {
  const l = ctx.level;
  const air = (ax: number, ay: number, az: number) =>
    l.inWindow(ax, ay, az) && l.classAt(ax, ay, az).air;
  return (
    air(x + 1, y, z) ||
    air(x - 1, y, z) ||
    air(x, y + 1, z) ||
    air(x, y - 1, z) ||
    air(x, y, z + 1) ||
    air(x, y, z - 1)
  );
}

/**
 * An ore vein of MSM's own shape: a blob stretched along a random direction, about `size`
 * blocks; scattered ore: up to `size` single blocks spread around the position.
 */
function ore(ctx: FeatureContext, config: Json, p: Pos, scattered: boolean): boolean {
  const size = Math.max(0, Math.floor(Number(config.size) || 0));
  if (size === 0) return false;
  const targets = oreTargets(config);
  if (targets.length === 0) return false;
  const discard = Number(config.discard_chance_on_air_exposure) || 0;
  const random = ctx.random;
  let placed = 0;
  if (scattered) {
    const count = random.nextInt(size + 1);
    const spread = Math.min(size, 7);
    for (let i = 0; i < count; i += 1) {
      const dx = Math.round((random.nextFloat() - random.nextFloat()) * spread);
      const dy = Math.round((random.nextFloat() - random.nextFloat()) * spread);
      const dz = Math.round((random.nextFloat() - random.nextFloat()) * spread);
      if (replaceOre(ctx, targets, discard, p[0] + dx, p[1] + dy, p[2] + dz)) placed += 1;
    }
    return placed > 0;
  }
  // A capsule of about `size` blocks: a segment of length `size / 8` with a radius around it.
  const angle = random.nextFloat() * Math.PI * 2;
  const tilt = (random.nextFloat() - 0.5) * 0.6;
  const half = size / 16;
  const ux = Math.cos(angle);
  const uz = Math.sin(angle);
  let radius = 0.5;
  while (Math.PI * radius * radius * (2 * half + (4 / 3) * radius) < size) radius += 0.05;
  const reach = Math.ceil(half + radius * 1.15 + 1);
  if (ctx.level.distanceXZ(p[0], p[2]) > reach || Math.abs(ctx.level.distanceY(p[1])) > reach) {
    return false;
  }
  for (let dx = -reach; dx <= reach; dx += 1) {
    for (let dy = -reach; dy <= reach; dy += 1) {
      for (let dz = -reach; dz <= reach; dz += 1) {
        const r = radius * (0.85 + random.nextFloat() * 0.3);
        if (!ctx.level.inWindow(p[0] + dx, p[1] + dy, p[2] + dz)) continue;
        // Distance from the segment through the centre.
        const along = Math.max(-half, Math.min(half, dx * ux + dy * tilt + dz * uz));
        const ex = dx - ux * along;
        const ey = dy - tilt * along;
        const ez = dz - uz * along;
        if (ex * ex + ey * ey + ez * ez > r * r) continue;
        if (replaceOre(ctx, targets, discard, p[0] + dx, p[1] + dy, p[2] + dz)) placed += 1;
      }
    }
  }
  return placed > 0;
}

function disk(ctx: FeatureContext, config: Json, p: Pos): boolean {
  const r = Math.max(0, sampleInt(config.radius, ctx.random));
  const hh = Math.max(0, Math.floor(Number(config.half_height) || 0));
  let placed = false;
  for (let dx = -r; dx <= r; dx += 1) {
    for (let dz = -r; dz <= r; dz += 1) {
      if (dx * dx + dz * dz > r * r) continue;
      const x = p[0] + dx;
      const z = p[2] + dz;
      for (let y = p[1] + hh; y >= p[1] - hh; y -= 1) {
        // As ores: a disk changes nothing a later feature reads outside the window.
        if (!ctx.level.inWindow(x, y, z)) continue;
        if (!testPredicate(ctx, config.target, x, y, z)) continue;
        const state = provideState(config.state_provider, providerAt(ctx, x, y, z));
        if (!state) continue;
        ctx.level.set(x, y, z, state);
        placed = true;
      }
    }
  }
  return placed;
}

/** How cold a biome is at a height (MSM's reading: it cools above y 80). */
function temperatureAt(ctx: FeatureContext, biome: string, y: number): number {
  const json = ctx.files.get(FEATURE_FOLDERS.biome, biome);
  const t = isObject(json) && typeof json.temperature === 'number' ? json.temperature : 0.8;
  return t - Math.max(0, y - 80) * (0.05 / 30);
}

/** Snow on the cold columns of the chunk and ice on their still water. */
function freezeTopLayer(ctx: FeatureContext, p: Pos): boolean {
  const level = ctx.level;
  const x0 = (p[0] >> 4) << 4;
  const z0 = (p[2] >> 4) << 4;
  let placed = false;
  for (let x = x0; x < x0 + 16; x += 1) {
    for (let z = z0; z < z0 + 16; z += 1) {
      if (level.distanceXZ(x, z) > 0 || !level.topMaybeInWindow(x, z)) continue;
      const y = level.height(x, z, 'MOTION_BLOCKING');
      if (temperatureAt(ctx, level.biome(x, y, z), y) >= 0.15) continue;
      const top = classOf(level.get(x, y - 1, z));
      if (top.id === 'minecraft:water') {
        level.set(x, y - 1, z, 'minecraft:ice');
        placed = true;
        continue;
      }
      const snow = 'minecraft:snow[layers=1]';
      if (level.classAt(x, y, z).air && canSurvive(snow, around(ctx, x, y, z))) {
        level.set(x, y, z, snow);
        if (top.id === 'minecraft:grass_block' || top.id === 'minecraft:podzol') {
          level.set(x, y - 1, z, withProperties(level.get(x, y - 1, z), { snowy: 'true' }));
        }
        placed = true;
      }
    }
  }
  return placed;
}

/**
 * Reports the types a placed feature would reach that the preview does not draw, without placing
 * it (a feature placed out of the window's reach is still named in the notes).
 */
export function reportLeftOut(
  ctx: FeatureContext,
  ref: unknown,
  seen: Set<unknown>,
  depth = 0,
): void {
  if (depth > MAX_DEPTH || seen.has(ref)) return;
  if (typeof ref === 'string') seen.add(ref);
  const placed = typeof ref === 'string' ? ctx.files.get(FEATURE_FOLDERS.placed, ref) : ref;
  if (!isObject(placed)) return;
  let configured: unknown = placed.feature;
  let id = typeof ref === 'string' ? withNamespace(ref) : ctx.topFeature;
  if (typeof configured === 'string') {
    if (seen.has(`f:${configured}`)) return;
    seen.add(`f:${configured}`);
    id = withNamespace(configured);
    configured = ctx.files.get(FEATURE_FOLDERS.configured, id);
  }
  if (!isObject(configured)) return;
  const type = shortType(configured.type);
  if (!FEATURE_TYPES.includes(type)) {
    ctx.notes.add({
      kind: 'feature',
      type: typeof configured.type === 'string' ? withNamespace(configured.type) : 'unknown',
      where: id,
      drawnInstead: leftOutWords(type),
    });
    return;
  }
  const inner: unknown[] = [];
  switch (type) {
    case 'random_selector':
      for (const e of Array.isArray(configured.features) ? configured.features : []) {
        if (isObject(e)) inner.push(e.feature);
      }
      inner.push(configured.default);
      break;
    case 'weighted_random_selector':
      for (const e of Array.isArray(configured.features) ? configured.features : []) {
        if (isObject(e)) inner.push(e.data);
      }
      break;
    case 'random_boolean_selector':
      inner.push(configured.feature_true, configured.feature_false);
      break;
    case 'simple_random_selector':
    case 'sequence':
      inner.push(...placedList(configured.features));
      break;
    default:
      return;
  }
  for (const f of inner) reportLeftOut(ctx, f, seen, depth + 1);
}

/** How far a configured feature (an id or written out) can place blocks from its position. */
export function featureReach(ctx: FeatureContext, ref: unknown, depth = 0): Reach {
  const known = ctx.reaches.get(ref);
  if (known) return known;
  if (depth > MAX_DEPTH) return EVERYWHERE;
  const json =
    typeof ref === 'string' ? ctx.files.get(FEATURE_FOLDERS.configured, withNamespace(ref)) : ref;
  let reach: Reach = NOWHERE;
  if (isObject(json)) {
    const c: Json = isObject(json.config) ? { ...json, ...json.config } : json;
    const placedReach = (f: unknown): Reach => {
      const placed =
        typeof f === 'string' ? ctx.files.get(FEATURE_FOLDERS.placed, withNamespace(f)) : f;
      if (!isObject(placed)) return NOWHERE;
      let r = featureReach(ctx, placed.feature, depth + 1);
      for (const m of Array.isArray(placed.placement) ? placed.placement : []) {
        r = add(r, modifierSpread(m));
      }
      return r;
    };
    switch (shortType(c.type)) {
      case 'simple_block':
        reach = { xz: 0, below: 0, above: 1 };
        break;
      case 'block_column': {
        let total = 0;
        for (const l of Array.isArray(c.layers) ? c.layers : []) {
          if (isObject(l)) total += Math.max(0, maxInt(l.height));
        }
        reach = { xz: 0, below: total, above: total };
        break;
      }
      case 'ore':
      case 'scattered_ore': {
        const size = Math.max(0, Number(c.size) || 0);
        const r = Math.ceil(size / 16 + Math.cbrt(size) + 2);
        reach = { xz: r, below: r, above: r };
        break;
      }
      case 'disk': {
        const hh = Math.max(0, Math.floor(Number(c.half_height) || 0));
        reach = { xz: Math.max(0, maxInt(c.radius)), below: hh, above: hh };
        break;
      }
      case 'tree':
        reach = { xz: 8, below: 1, above: 48 };
        break;
      case 'fallen_tree':
        reach = { xz: Math.max(0, maxInt(c.log_length)) + 3, below: 1, above: 2 };
        break;
      case 'freeze_top_layer':
        reach = { xz: 16, below: Number.POSITIVE_INFINITY, above: Number.POSITIVE_INFINITY };
        break;
      case 'random_selector':
        for (const e of Array.isArray(c.features) ? c.features : []) {
          if (isObject(e)) reach = add(reach, placedReach(e.feature), true);
        }
        reach = add(reach, placedReach(c.default), true);
        break;
      case 'weighted_random_selector':
        for (const e of Array.isArray(c.features) ? c.features : []) {
          if (isObject(e)) reach = add(reach, placedReach(e.data), true);
        }
        break;
      case 'random_boolean_selector':
        reach = add(placedReach(c.feature_true), placedReach(c.feature_false), true);
        break;
      case 'simple_random_selector':
      case 'sequence':
        for (const f of placedList(c.features)) reach = add(reach, placedReach(f), true);
        break;
      default:
        reach = NOWHERE;
    }
  }
  ctx.reaches.set(ref, reach);
  return reach;
}
