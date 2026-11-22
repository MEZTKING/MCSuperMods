/**
 * Trees and fallen trees, drawn with MSM's own shapes from a tree's own fields (spike B574, WS15;
 * ADR 0119 D6): the trunk placer's type and heights give the trunk (straight, two by two,
 * leaning, branching), the foliage placer's type, radius, offset and height give the crown, the
 * providers give the blocks. They stand where the data's modifiers put them and are about the
 * right size, not block for block. A trunk or foliage placer the engine does not know is drawn
 * with Quick world's oak crown (`@msm/sim` `grounds/quick.ts`, MSM's own) and reported; so are
 * decorations and roots that are not drawn.
 */

import { withNamespace } from '../registries';
import { classOf, isObject } from './blocks';
import type { FeatureContext } from './context';
import type { Pos } from './placement';
import { providerAt } from './predicates';
import { onAxis, provideState, sampleInt } from './providers';

type Json = Record<string, unknown>;

function shortType(value: unknown): string {
  return typeof value === 'string' ? value.replace(/^minecraft:/, '') : '';
}

/** A place on the trunk where a crown grows. */
interface Attachment {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** A two by two trunk: the crown is one wider. */
  readonly wide: boolean;
  /** Smaller crowns on branches. */
  readonly shrink: number;
}

interface Trunk {
  readonly logs: [number, number, number, 'x' | 'y' | 'z'][];
  readonly crowns: Attachment[];
  readonly base: [number, number][];
}

const HORIZONTAL: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Quick world's oak crown: radius by height above the top log (MSM's own). */
const CROWN_RADII: readonly (readonly [number, number])[] = [
  [-2, 2.3],
  [-1, 2.6],
  [0, 2.6],
  [1, 2.0],
  [2, 1.2],
];

function canGrowThrough(ctx: FeatureContext, x: number, y: number, z: number): boolean {
  const c = ctx.level.classAt(x, y, z);
  return c.air || c.plant || c.leaves || c.water;
}

function report(ctx: FeatureContext, type: string, where: string, words: string): void {
  ctx.notes.add({ kind: 'feature', type: withNamespace(type), where, drawnInstead: words });
}

/** A tree at a position (its base: the block above the ground). */
export function placeTree(ctx: FeatureContext, config: Json, p: Pos, where: string): boolean {
  const level = ctx.level;
  const random = ctx.random;
  const [x, y, z] = p;
  if (!canGrowThrough(ctx, x, y, z)) return false;
  if (!classOf(level.get(x, y - 1, z)).solid) return false;
  const trunk = isObject(config.trunk_placer) ? config.trunk_placer : {};
  const foliage = isObject(config.foliage_placer) ? config.foliage_placer : {};
  const base = Math.max(1, Math.floor(Number(trunk.base_height) || 4));
  const height =
    base +
    random.nextInt(Math.max(0, Math.floor(Number(trunk.height_rand_a) || 0)) + 1) +
    random.nextInt(Math.max(0, Math.floor(Number(trunk.height_rand_b) || 0)) + 1);
  // The trunk needs room: shorten it to the room there is, down to the base height.
  let room = 0;
  while (room < height && canGrowThrough(ctx, x, y + room, z) && level.inWorld(y + room)) room += 1;
  if (room < Math.min(base, height)) return false;
  const shape = trunkShape(ctx, trunk, p, Math.min(height, room), where);
  const logState = (px: number, py: number, pz: number) =>
    provideState(config.trunk_provider, providerAt(ctx, px, py, pz));
  // Crowns first (into air and plants only), then the trunk (which replaces leaves).
  const leaves: Pos[] = [];
  for (const crown of shape.crowns) growCrown(ctx, config, foliage, crown, leaves, where);
  const logs: Pos[] = [];
  for (const [lx, ly, lz, axis] of shape.logs) {
    if (!canGrowThrough(ctx, lx, ly, lz)) continue;
    const state = logState(lx, ly, lz);
    if (!state) continue;
    level.set(lx, ly, lz, onAxis(state, axis));
    logs.push([lx, ly, lz]);
  }
  for (const [bx, bz] of shape.base) {
    const below = provideState(config.below_trunk_provider, providerAt(ctx, bx, y - 1, bz));
    if (below && classOf(level.get(bx, y - 1, bz)).solid) level.set(bx, y - 1, bz, below);
  }
  if (isObject(config.root_placer)) {
    report(
      ctx,
      shortType(config.root_placer.type) || 'root_placer',
      where,
      'Trees are drawn without their roots.',
    );
  }
  decorate(ctx, config.decorators, logs, leaves, p, where);
  return logs.length > 0;
}

function trunkShape(
  ctx: FeatureContext,
  trunk: Json,
  p: Pos,
  height: number,
  where: string,
): Trunk {
  const random = ctx.random;
  const [x, y, z] = p;
  const logs: Trunk['logs'] = [];
  const crowns: Attachment[] = [];
  const column = (cx: number, cz: number, from: number, to: number) => {
    for (let ly = from; ly < to; ly += 1) logs.push([cx, ly, cz, 'y']);
  };
  const branch = (
    sx: number,
    sy: number,
    sz: number,
    dx: number,
    dz: number,
    length: number,
    rise: number,
  ) => {
    let bx = sx;
    let by = sy;
    let bz = sz;
    for (let i = 0; i < length; i += 1) {
      bx += dx;
      bz += dz;
      if (i < rise) by += 1;
      logs.push([bx, by, bz, dx !== 0 ? 'x' : 'z']);
    }
    return [bx, by, bz] as const;
  };
  const type = shortType(trunk.type);
  switch (type) {
    case 'straight_trunk_placer':
      column(x, z, y, y + height);
      crowns.push({ x, y: y + height, z, wide: false, shrink: 0 });
      return { logs, crowns, base: [[x, z]] };
    case 'giant_trunk_placer':
    case 'dark_oak_trunk_placer':
    case 'mega_jungle_trunk_placer': {
      for (const [dx, dz] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        column(x + dx, z + dz, y, y + height);
      }
      crowns.push({ x, y: y + height, z, wide: true, shrink: 0 });
      if (type === 'mega_jungle_trunk_placer') {
        for (let by = y + height - 3; by > y + height / 2; by -= 2 + random.nextInt(3)) {
          const [dx, dz] = HORIZONTAL[random.nextInt(4)] as readonly [number, number];
          const [ex, ey, ez] = branch(x, by, z, dx, dz, 2 + random.nextInt(2), 1);
          crowns.push({ x: ex, y: ey + 1, z: ez, wide: false, shrink: 1 });
        }
      }
      return {
        logs,
        crowns,
        base: [
          [x, z],
          [x + 1, z],
          [x, z + 1],
          [x + 1, z + 1],
        ],
      };
    }
    case 'forking_trunk_placer':
    case 'bending_trunk_placer': {
      // Up, then leaning one way for the last few logs; a second, shorter lean sometimes.
      const bend =
        type === 'bending_trunk_placer'
          ? Math.max(1, sampleInt(trunk.bend_length, random))
          : 1 + random.nextInt(3);
      const straight = Math.max(1, height - bend);
      column(x, z, y, y + straight);
      const [dx, dz] = HORIZONTAL[random.nextInt(4)] as readonly [number, number];
      let lx = x;
      let ly = y + straight - 1;
      let lz = z;
      for (let i = 0; i < bend; i += 1) {
        lx += dx;
        lz += dz;
        ly += 1;
        logs.push([lx, ly, lz, 'y']);
      }
      crowns.push({ x: lx, y: ly + 1, z: lz, wide: false, shrink: 0 });
      if (type === 'forking_trunk_placer' && random.nextFloat() < 0.5) {
        const [ex, ey, ez] = branch(x, y + straight - 2, z, -dx || dz, -dz || dx, 2, 2);
        crowns.push({ x: ex, y: ey + 1, z: ez, wide: false, shrink: 1 });
      }
      return { logs, crowns, base: [[x, z]] };
    }
    case 'fancy_trunk_placer': {
      column(x, z, y, y + height);
      crowns.push({ x, y: y + height - 1, z, wide: false, shrink: 0 });
      const count = Math.max(1, Math.floor(height / 3));
      for (let i = 0; i < count; i += 1) {
        const by =
          y + Math.floor(height * 0.4) + random.nextInt(Math.max(1, Math.ceil(height * 0.5)));
        const [dx, dz] = HORIZONTAL[random.nextInt(4)] as readonly [number, number];
        const [ex, ey, ez] = branch(
          x,
          Math.min(by, y + height - 1),
          z,
          dx,
          dz,
          2 + random.nextInt(2),
          1,
        );
        crowns.push({ x: ex, y: ey, z: ez, wide: false, shrink: 0 });
      }
      return { logs, crowns, base: [[x, z]] };
    }
    case 'cherry_trunk_placer': {
      column(x, z, y, y + height);
      const branches = Math.max(1, sampleInt(trunk.branch_count, random));
      const first = random.nextInt(4);
      for (let i = 0; i < branches; i += 1) {
        const [dx, dz] = HORIZONTAL[(first + i * 2) % 4] as readonly [number, number];
        const start =
          y + height - 1 - Math.max(0, sampleInt(trunk.branch_start_offset_from_top, random));
        const length = Math.max(1, sampleInt(trunk.branch_horizontal_length, random));
        const [ex, ey, ez] = branch(x, Math.max(y + 1, start), z, dx, dz, length, length);
        crowns.push({ x: ex, y: ey + 1, z: ez, wide: false, shrink: 0 });
      }
      if (branches < 2) crowns.push({ x, y: y + height, z, wide: false, shrink: 0 });
      return { logs, crowns, base: [[x, z]] };
    }
    case 'upwards_branching_trunk_placer': {
      column(x, z, y, y + height);
      crowns.push({ x, y: y + height, z, wide: false, shrink: 0 });
      const chance = Number(trunk.place_branch_per_log_probability) || 0;
      for (let ly = y + Math.floor(height / 2); ly < y + height - 1; ly += 1) {
        if (random.nextFloat() >= chance) continue;
        const [dx, dz] = HORIZONTAL[random.nextInt(4)] as readonly [number, number];
        const length = Math.max(1, sampleInt(trunk.extra_branch_length, random));
        const [ex, ey, ez] = branch(x, ly, z, dx, dz, length, length);
        crowns.push({ x: ex, y: ey + 1, z: ez, wide: false, shrink: 1 });
      }
      return { logs, crowns, base: [[x, z]] };
    }
    case 'poplar_trunk_placer': {
      const above = Math.max(0, sampleInt(trunk.trunk_height_above_branches, random));
      const total = height + above;
      column(x, z, y, y + total);
      crowns.push({ x, y: y + total, z, wide: false, shrink: 0 });
      const branches = Math.max(0, sampleInt(trunk.branch_amount, random));
      for (let i = 0; i < branches; i += 1) {
        const [dx, dz] = HORIZONTAL[random.nextInt(4)] as readonly [number, number];
        const by = y + height - 1 - random.nextInt(Math.max(1, Math.floor(height / 2)));
        branch(x, Math.max(y + 1, by), z, dx, dz, 1, 0);
      }
      return { logs, crowns, base: [[x, z]] };
    }
    default:
      report(ctx, type || 'trunk_placer', where, 'Drawn as a plain trunk with a round crown.');
      column(x, z, y, y + height);
      crowns.push({ x, y: y + height, z, wide: false, shrink: 0 });
      return { logs, crowns, base: [[x, z]] };
  }
}

/** One leaf, into air and plants only. */
function leaf(
  ctx: FeatureContext,
  state: string,
  x: number,
  y: number,
  z: number,
  out: Pos[],
): void {
  const c = ctx.level.classAt(x, y, z);
  if (!(c.air || c.plant)) return;
  ctx.level.set(x, y, z, state);
  out.push([x, y, z]);
}

/** A flat layer of leaves of a radius around a centre (square, corners left off sometimes). */
function layer(
  ctx: FeatureContext,
  state: string,
  crown: Attachment,
  y: number,
  radius: number,
  round: boolean,
  out: Pos[],
): void {
  if (radius < 0) return;
  const extra = crown.wide ? 1 : 0;
  for (let dx = -radius; dx <= radius + extra; dx += 1) {
    for (let dz = -radius; dz <= radius + extra; dz += 1) {
      const ex = dx < 0 ? -dx : dx > extra ? dx - extra : 0;
      const ez = dz < 0 ? -dz : dz > extra ? dz - extra : 0;
      if (round && ex * ex + ez * ez > radius * radius + radius * 0.8) continue;
      if (ex === radius && ez === radius && radius > 0 && ctx.random.nextFloat() < 0.5) continue;
      leaf(ctx, state, crown.x + dx, y, crown.z + dz, out);
    }
  }
}

function growCrown(
  ctx: FeatureContext,
  config: Json,
  foliage: Json,
  crown: Attachment,
  out: Pos[],
  where: string,
): void {
  const random = ctx.random;
  const state = provideState(config.foliage_provider, providerAt(ctx, crown.x, crown.y, crown.z));
  if (!state) return;
  const radius = Math.max(0, sampleInt(foliage.radius, random) - crown.shrink);
  const offset = sampleInt(foliage.offset, random);
  const top = crown.y + offset;
  const type = shortType(foliage.type);
  switch (type) {
    case 'blob_foliage_placer':
    case 'bush_foliage_placer':
    case 'jungle_foliage_placer': {
      const h = Math.max(1, Math.floor(Number(foliage.height) || 3));
      for (let i = 0; i < h + 1; i += 1) {
        const r = i === 0 ? radius - 1 : i === h ? radius - 1 : radius;
        if (type === 'bush_foliage_placer' && i === 0) continue;
        layer(ctx, state, crown, top - i, r, false, out);
      }
      return;
    }
    case 'fancy_foliage_placer': {
      const h = Math.max(1, Math.floor(Number(foliage.height) || 4));
      for (let i = 0; i < h; i += 1) {
        const r = i === 0 || i === h - 1 ? radius : radius + 1;
        layer(ctx, state, crown, top - i + 1, r, true, out);
      }
      return;
    }
    case 'spruce_foliage_placer':
    case 'pine_foliage_placer':
    case 'mega_pine_foliage_placer': {
      const h = Math.max(
        2,
        type === 'spruce_foliage_placer'
          ? 4 + sampleInt(foliage.trunk_height, random)
          : type === 'pine_foliage_placer'
            ? sampleInt(foliage.height, random)
            : sampleInt(foliage.crown_height, random),
      );
      for (let i = 0; i < h; i += 1) {
        const r =
          type === 'spruce_foliage_placer'
            ? Math.min(radius, i === 0 ? 0 : 1 + ((i - 1) % (radius + 1)))
            : Math.min(radius, Math.floor((i + 1) / 2));
        layer(ctx, state, crown, top - i, r, type === 'mega_pine_foliage_placer', out);
      }
      return;
    }
    case 'acacia_foliage_placer':
      layer(ctx, state, crown, top - 1, radius + 1, true, out);
      layer(ctx, state, crown, top, radius - 1, false, out);
      return;
    case 'dark_oak_foliage_placer':
      layer(ctx, state, crown, top - 1, radius + 1, true, out);
      layer(ctx, state, crown, top, radius + 1, true, out);
      layer(ctx, state, crown, top + 1, radius, true, out);
      return;
    case 'cherry_foliage_placer': {
      const h = Math.max(2, sampleInt(foliage.height, random));
      const hang = Number(foliage.hanging_leaves_chance) || 0;
      for (let i = 0; i < h; i += 1) {
        const r = i === 0 ? radius - 1 : radius;
        layer(ctx, state, crown, top - i, r, true, out);
      }
      // Leaves hanging under the rim.
      const bottom = top - h + 1;
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dz = -radius; dz <= radius; dz += 1) {
          if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
          if (random.nextFloat() < hang)
            leaf(ctx, state, crown.x + dx, bottom - 1, crown.z + dz, out);
        }
      }
      return;
    }
    case 'random_spread_foliage_placer': {
      const h = Math.max(1, sampleInt(foliage.foliage_height, random));
      const attempts = Math.max(0, Math.floor(Number(foliage.leaf_placement_attempts) || 0));
      for (let i = 0; i < attempts; i += 1) {
        leaf(
          ctx,
          state,
          crown.x + random.between(-radius, radius),
          top - random.nextInt(h),
          crown.z + random.between(-radius, radius),
          out,
        );
      }
      return;
    }
    case 'poplar_foliage_placer': {
      const h = Math.max(2, sampleInt(foliage.height, random));
      for (let i = 0; i < h; i += 1) {
        const t = (i - h / 2) / (h / 2);
        const r = Math.round(Math.max(0, radius * Math.sqrt(Math.max(0, 1 - t * t))));
        layer(ctx, state, crown, top - i, r, true, out);
      }
      return;
    }
    default: {
      if (type) report(ctx, type, where, 'Drawn with a plain round crown.');
      for (const [dy, r] of CROWN_RADII) {
        const reach = Math.ceil(r);
        for (let dx = -reach; dx <= reach; dx += 1) {
          for (let dz = -reach; dz <= reach; dz += 1) {
            const spare = r * r - (dx * dx + dz * dz);
            if (spare < 0 || (spare < 1.2 && random.nextFloat() < 0.35)) continue;
            leaf(ctx, state, crown.x + dx, crown.y - 1 + dy, crown.z + dz, out);
          }
        }
      }
    }
  }
}

const VINE_FACE: Readonly<Record<string, string>> = {
  '1,0': 'west',
  '-1,0': 'east',
  '0,1': 'north',
  '0,-1': 'south',
};

const FACING: Readonly<Record<string, string>> = {
  '1,0': 'east',
  '-1,0': 'west',
  '0,1': 'south',
  '0,-1': 'north',
};

function decorate(
  ctx: FeatureContext,
  decorators: unknown,
  logs: readonly Pos[],
  leaves: readonly Pos[],
  base: Pos,
  where: string,
): void {
  const level = ctx.level;
  const random = ctx.random;
  for (const d of Array.isArray(decorators) ? decorators : []) {
    if (!isObject(d)) continue;
    const type = shortType(d.type);
    const chance = Number(d.probability) || 0;
    switch (type) {
      case 'beehive': {
        if (random.nextFloat() >= chance || logs.length === 0) break;
        const [lx, ly, lz] = logs[Math.min(logs.length - 1, 1 + random.nextInt(2))] as Pos;
        const [dx, dz] = HORIZONTAL[random.nextInt(4)] as readonly [number, number];
        if (level.classAt(lx + dx, ly, lz + dz).air) {
          level.set(
            lx + dx,
            ly,
            lz + dz,
            `minecraft:bee_nest[facing=${FACING[`${dx},${dz}`]},honey_level=0]`,
          );
        }
        break;
      }
      case 'trunk_vine':
        for (const [lx, ly, lz] of logs) {
          for (const [dx, dz] of HORIZONTAL) {
            if (random.nextInt(3) !== 0 || !level.classAt(lx + dx, ly, lz + dz).air) continue;
            level.set(lx + dx, ly, lz + dz, `minecraft:vine[${VINE_FACE[`${dx},${dz}`]}=true]`);
          }
        }
        break;
      case 'leave_vine':
        for (const [lx, ly, lz] of leaves) {
          for (const [dx, dz] of HORIZONTAL) {
            if (random.nextFloat() >= chance) continue;
            const face = VINE_FACE[`${dx},${dz}`] as string;
            for (let i = 0; i < 4 && level.classAt(lx + dx, ly - i, lz + dz).air; i += 1) {
              level.set(lx + dx, ly - i, lz + dz, `minecraft:vine[${face}=true]`);
            }
          }
        }
        break;
      case 'cocoa':
        if (random.nextFloat() >= chance) break;
        for (const [lx, ly, lz] of logs.slice(0, 3)) {
          for (const [dx, dz] of HORIZONTAL) {
            if (random.nextInt(4) !== 0 || !level.classAt(lx + dx, ly, lz + dz).air) continue;
            const facing = FACING[`${-dx},${-dz}`] as string;
            level.set(
              lx + dx,
              ly,
              lz + dz,
              `minecraft:cocoa[age=${random.nextInt(3)},facing=${facing}]`,
            );
          }
        }
        break;
      case 'attached_to_logs':
      case 'attached_to_leaves': {
        const list = type === 'attached_to_logs' ? logs : leaves;
        const dirs = Array.isArray(d.directions) ? d.directions : ['up'];
        for (const [lx, ly, lz] of list) {
          for (const dir of dirs) {
            if (random.nextFloat() >= chance) continue;
            const [dx, dy, dz] =
              dir === 'up'
                ? [0, 1, 0]
                : dir === 'down'
                  ? [0, -1, 0]
                  : dir === 'north'
                    ? [0, 0, -1]
                    : dir === 'south'
                      ? [0, 0, 1]
                      : dir === 'west'
                        ? [-1, 0, 0]
                        : [1, 0, 0];
            if (!level.classAt(lx + dx, ly + dy, lz + dz).air) continue;
            const state = provideState(
              d.block_provider,
              providerAt(ctx, lx + dx, ly + dy, lz + dz),
            );
            if (state) level.set(lx + dx, ly + dy, lz + dz, state);
          }
        }
        break;
      }
      case 'alter_ground': {
        for (let dx = -2; dx <= 2; dx += 1) {
          for (let dz = -2; dz <= 2; dz += 1) {
            if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
            const x = base[0] + dx;
            const z = base[2] + dz;
            for (let y = base[1] + 1; y >= base[1] - 3; y -= 1) {
              const c = level.classAt(x, y, z);
              if (!c.solid || c.log) continue;
              if (!level.classAt(x, y + 1, z).solid || level.classAt(x, y + 1, z).log) {
                const state = provideState(d.provider, providerAt(ctx, x, y, z));
                if (
                  state &&
                  (c.id.endsWith('dirt') ||
                    c.id === 'minecraft:grass_block' ||
                    c.id === 'minecraft:podzol')
                ) {
                  level.set(x, y, z, state);
                }
                break;
              }
            }
          }
        }
        break;
      }
      case 'place_on_ground': {
        const tries = Math.max(0, Math.floor(Number(d.tries) || 128));
        const r = Math.max(0, Math.floor(Number(d.radius) || 2));
        const h = Math.max(0, Math.floor(Number(d.height) || 1));
        for (let i = 0; i < Math.min(tries, 64); i += 1) {
          const x = base[0] + random.between(-r, r);
          const y = base[1] + random.between(-h, h);
          const z = base[2] + random.between(-r, r);
          if (!level.classAt(x, y, z).air || !level.classAt(x, y - 1, z).solid) continue;
          const state = provideState(d.block_state_provider, providerAt(ctx, x, y, z));
          if (state) level.set(x, y, z, state);
        }
        break;
      }
      default:
        if (type) report(ctx, type, where, 'Trees are drawn without this decoration.');
    }
  }
}

/** A fallen tree: a stump and a log lying beside it. */
export function placeFallenTree(ctx: FeatureContext, config: Json, p: Pos, where: string): boolean {
  const level = ctx.level;
  const random = ctx.random;
  const [x, y, z] = p;
  if (!canGrowThrough(ctx, x, y, z) || !classOf(level.get(x, y - 1, z)).solid) return false;
  const stump = provideState(config.trunk_provider, providerAt(ctx, x, y, z));
  if (!stump) return false;
  level.set(x, y, z, onAxis(stump, 'y'));
  decorate(ctx, config.stump_decorators, [[x, y, z]], [], p, where);
  const length = Math.max(0, sampleInt(config.log_length, random));
  const [dx, dz] = HORIZONTAL[random.nextInt(4)] as readonly [number, number];
  const logs: Pos[] = [];
  for (let i = 0; i < length; i += 1) {
    const lx = x + dx * (2 + i);
    const lz = z + dz * (2 + i);
    if (!canGrowThrough(ctx, lx, y, lz) || !level.classAt(lx, y - 1, lz).solid) return true;
    logs.push([lx, y, lz]);
  }
  const axis = dx !== 0 ? 'x' : 'z';
  for (const [lx, ly, lz] of logs) {
    const state = provideState(config.trunk_provider, providerAt(ctx, lx, ly, lz));
    if (state) level.set(lx, ly, lz, onAxis(state, axis));
  }
  decorate(ctx, config.log_decorators, logs, [], p, where);
  return true;
}
