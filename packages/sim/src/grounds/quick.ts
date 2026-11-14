/**
 * Quick worlds (ADR 0087 D1, B405): a small landscape made from a few choices, pure and seeded,
 * so the same options always give the same blocks.
 *
 * - **Shape**: flat, gentle hills, an island in water, or a valley. Heights come from MSM's own
 *   smooth value noise over the 48 by 48 area.
 * - **Layers**, top to bottom, each a block and a thickness. The thickest layer (the lower one on
 *   a tie) stretches with the land: layers above it keep their thickness under the surface,
 *   layers below it keep theirs from the bottom of the area. Where a column is too short, the
 *   top layer keeps its thickness, then the bottom layers, then the rest. On flat land the
 *   layers stack exactly, as a superflat preset does.
 * - **Water** up to a level (cells below it that are still air become water). Where water is on,
 *   grass and dirt at the water's edge and under water become sand (shores).
 * - **Trees**: none, a few or many. Simple oak trees of MSM's own shape (a straight trunk under
 *   a rounded crown), only on grass, dirt, podzol, mycelium or moss above the water, apart from
 *   each other, as the reference pack's notes say vanilla trees stand only on soil that supports
 *   plants (`docs/reference/vanilla-worldgen/`, section 6). No vanilla feature is copied.
 */

import { blockIdOf, GROUND_SIZE, type GroundBlocks, GroundBuilder } from './ground.js';

/** The land shapes. */
export const QUICK_SHAPES = Object.freeze(['flat', 'hills', 'island', 'valley'] as const);
export type QuickShape = (typeof QUICK_SHAPES)[number];

/** How many trees. */
export const QUICK_TREES = Object.freeze(['none', 'few', 'many'] as const);
export type QuickTrees = (typeof QUICK_TREES)[number];

/** One layer: a block state string and how many blocks thick it is. */
export interface QuickLayer {
  readonly block: string;
  readonly thickness: number;
}

/** What a quick world is made from. */
export interface QuickWorldOptions {
  readonly shape: QuickShape;
  /** Top to bottom. */
  readonly layers: readonly QuickLayer[];
  readonly water: boolean;
  /** Water fills the air below this height (cells `y < waterLevel`). */
  readonly waterLevel: number;
  readonly trees: QuickTrees;
  /** Any whole number; the same seed gives the same world. */
  readonly seed: number;
}

/** The limits the options are kept within. */
export const QUICK_LIMITS = Object.freeze({
  maxLayers: 8,
  maxThickness: 16,
  minWaterLevel: 1,
  maxWaterLevel: 24,
  /** The highest a column's land reaches (its top block is one below), leaving room for trees. */
  maxSurface: 24,
});

/** How many trees each setting aims for over the area, and how far apart they stand. */
export const TREE_TARGETS: Readonly<Record<QuickTrees, { count: number; spacing: number }>> =
  Object.freeze({
    none: { count: 0, spacing: 0 },
    few: { count: 4, spacing: 7 },
    many: { count: 14, spacing: 4 },
  });

/** Blocks a tree may stand on (soil that supports plants). */
export const TREE_SOILS: ReadonlySet<string> = new Set([
  'minecraft:grass_block',
  'minecraft:dirt',
  'minecraft:coarse_dirt',
  'minecraft:rooted_dirt',
  'minecraft:podzol',
  'minecraft:mycelium',
  'minecraft:moss_block',
]);

/** Blocks that turn to sand at the water's edge. */
const SHORE_SOILS: ReadonlySet<string> = new Set([
  'minecraft:grass_block',
  'minecraft:dirt',
  'minecraft:coarse_dirt',
  'minecraft:podzol',
  'minecraft:mycelium',
]);

export const QUICK_WATER = 'minecraft:water';
export const QUICK_SAND = 'minecraft:sand';
export const TREE_LOG = 'minecraft:oak_log[axis=y]';
export const TREE_LEAVES = 'minecraft:oak_leaves[persistent=true]';

const CLASSIC_LAYERS: readonly QuickLayer[] = Object.freeze([
  { block: 'minecraft:grass_block[snowy=false]', thickness: 1 },
  { block: 'minecraft:dirt', thickness: 3 },
  { block: 'minecraft:stone', thickness: 4 },
  { block: 'minecraft:bedrock', thickness: 1 },
]);

/** A named set of options. */
export interface QuickPreset {
  readonly id: string;
  readonly name: string;
  readonly options: QuickWorldOptions;
}

/** The built-in presets. */
export const QUICK_PRESETS: readonly QuickPreset[] = Object.freeze([
  {
    id: 'classic-flat',
    name: 'Classic flat',
    options: {
      shape: 'flat',
      layers: CLASSIC_LAYERS,
      water: false,
      waterLevel: 8,
      trees: 'none',
      seed: 1,
    },
  },
  {
    id: 'island',
    name: 'Island',
    options: {
      shape: 'island',
      layers: CLASSIC_LAYERS,
      water: true,
      waterLevel: 8,
      trees: 'few',
      seed: 7,
    },
  },
  {
    id: 'hills',
    name: 'Hills',
    options: {
      shape: 'hills',
      layers: CLASSIC_LAYERS,
      water: false,
      waterLevel: 6,
      trees: 'many',
      seed: 3,
    },
  },
  {
    id: 'sandbox',
    name: 'Sandbox',
    options: {
      shape: 'flat',
      layers: [
        { block: 'minecraft:smooth_stone', thickness: 1 },
        { block: 'minecraft:stone', thickness: 2 },
        { block: 'minecraft:bedrock', thickness: 1 },
      ],
      water: false,
      waterLevel: 4,
      trees: 'none',
      seed: 1,
    },
  },
] satisfies QuickPreset[]);

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, number));
};

/** Options kept within {@link QUICK_LIMITS}: unknown words and bad numbers become defaults. */
export function normaliseQuickOptions(input: Partial<QuickWorldOptions>): QuickWorldOptions {
  const base = (QUICK_PRESETS[0] as QuickPreset).options;
  const layers = (Array.isArray(input.layers) ? input.layers : base.layers)
    .slice(0, QUICK_LIMITS.maxLayers)
    .map((layer) => ({
      block:
        typeof layer?.block === 'string' && layer.block.trim() !== ''
          ? layer.block.trim()
          : 'minecraft:stone',
      thickness: clampInt(layer?.thickness, 1, QUICK_LIMITS.maxThickness, 1),
    }));
  return {
    shape: QUICK_SHAPES.includes(input.shape as QuickShape) ? (input.shape as QuickShape) : 'flat',
    layers: layers.length === 0 ? base.layers : layers,
    water: input.water === true,
    waterLevel: clampInt(
      input.waterLevel,
      QUICK_LIMITS.minWaterLevel,
      QUICK_LIMITS.maxWaterLevel,
      8,
    ),
    trees: QUICK_TREES.includes(input.trees as QuickTrees) ? (input.trees as QuickTrees) : 'none',
    seed: clampInt(input.seed, 0, 0xffffffff, 1) >>> 0,
  };
}

/** The layer that stretches with the land: the thickest, the lower one on a tie. */
export function stretchLayerIndex(layers: readonly QuickLayer[]): number {
  let best = 0;
  layers.forEach((layer, index) => {
    if (layer.thickness >= (layers[best] as QuickLayer).thickness) best = index;
  });
  return best;
}

/** The height of flat land: the layers' thicknesses added up, kept within the limits. */
export function baseHeight(layers: readonly QuickLayer[]): number {
  const total = layers.reduce((sum, layer) => sum + layer.thickness, 0);
  return Math.min(QUICK_LIMITS.maxSurface, Math.max(1, total));
}

/** A whole-number hash of a seed and a lattice point, from 0 (included) to 1 (excluded). */
function hash01(seed: number, x: number, z: number): number {
  let h = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Smooth value noise from -1 to 1 at `(x, z)` (lattice units), for one seed. */
export function valueNoise(seed: number, x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fz = smooth(z - z0);
  const a = hash01(seed, x0, z0);
  const b = hash01(seed, x0 + 1, z0);
  const c = hash01(seed, x0, z0 + 1);
  const d = hash01(seed, x0 + 1, z0 + 1);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return (top + (bottom - top) * fz) * 2 - 1;
}

/** 0 below `edge0`, 1 above `edge1`, smooth between. */
function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return smooth(t);
}

/**
 * The land height of a column (its top block is at `height - 1`), from 1 to
 * {@link QUICK_LIMITS.maxSurface}.
 */
export function columnHeight(options: QuickWorldOptions, x: number, z: number): number {
  const seed = options.seed >>> 0;
  const base = baseHeight(options.layers);
  const centreX = (GROUND_SIZE.x - 1) / 2;
  const centreZ = (GROUND_SIZE.z - 1) / 2;
  let height: number;
  switch (options.shape) {
    case 'flat':
      height = base;
      break;
    case 'hills':
      height =
        base +
        4.5 * valueNoise(seed, x / 13, z / 13) +
        1.5 * valueNoise(seed ^ 0x5bd1e995, x / 5, z / 5);
      break;
    case 'valley': {
      const river = centreX + 5 * valueNoise(seed ^ 0x2545f491, 0.5, z / 14);
      const side = smoothstep(2, 16, Math.abs(x - river));
      height = base - 3 + 9 * side + valueNoise(seed ^ 0x3c6ef372, x / 6, z / 6);
      break;
    }
    case 'island': {
      const level = options.waterLevel;
      const distance =
        Math.hypot(x - centreX, z - centreZ) / 24 +
        0.12 * valueNoise(seed ^ 0x6a09e667, x / 9, z / 9);
      const land = 1 - smoothstep(0.35, 0.9, distance);
      height = level - 4 + 9 * land + 1.2 * land * valueNoise(seed ^ 0x1f83d9ab, x / 6, z / 6);
      break;
    }
  }
  return Math.min(QUICK_LIMITS.maxSurface, Math.max(1, Math.round(height)));
}

/** The layer state of each cell of a column `height` high, from the bottom (index 0) up. */
export function columnLayers(layers: readonly QuickLayer[], height: number): string[] {
  const stretch = stretchLayerIndex(layers);
  const column: string[] = Array.from(
    { length: height },
    () => (layers[stretch] as QuickLayer).block,
  );
  // Layers below the stretching one, from the bottom up.
  let y = 0;
  for (let index = layers.length - 1; index > stretch; index -= 1) {
    const layer = layers[index] as QuickLayer;
    for (let i = 0; i < layer.thickness && y < height; i += 1, y += 1) column[y] = layer.block;
  }
  const bottomTop = y;
  // Layers above it, from the surface down, stopping at the bottom layers; the top layer always
  // keeps its thickness.
  y = height - 1;
  for (let index = 0; index < stretch; index += 1) {
    const layer = layers[index] as QuickLayer;
    for (let i = 0; i < layer.thickness && y >= 0; i += 1, y -= 1) {
      if (index > 0 && y < bottomTop) return column;
      column[y] = layer.block;
    }
  }
  return column;
}

/** A tree a quick world placed. */
export interface QuickTree {
  readonly x: number;
  readonly z: number;
  /** The y of its lowest log (the land height there). */
  readonly y: number;
  /** How many logs tall. */
  readonly trunk: number;
}

/** A quick world: its blocks, the land height of each column and its trees. */
export interface QuickWorld extends GroundBlocks {
  /** Land height per column, `z * size.x + x` (the top land block is one below). */
  readonly heights: Uint8Array;
  readonly trees: readonly QuickTree[];
  /** The options it was made from, kept within the limits. */
  readonly options: QuickWorldOptions;
}

/** A seeded random source (mulberry32) for tree spots. */
function randomFrom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The crown's radius by height above the trunk's top log (MSM's own rounded crown). */
const CROWN_RADII: readonly (readonly [number, number])[] = [
  [-2, 2.3],
  [-1, 2.6],
  [0, 2.6],
  [1, 2.0],
  [2, 1.2],
];

/** Makes a quick world; see the module comment. The same options give the same world. */
export function quickWorld(input: Partial<QuickWorldOptions>): QuickWorld {
  const options = normaliseQuickOptions(input);
  const ground = new GroundBuilder();
  const { size } = ground;
  const heights = new Uint8Array(size.x * size.z);
  const level = options.waterLevel;
  const topLayer = options.layers[0] as QuickLayer;
  const shoreTop = SHORE_SOILS.has(blockIdOf(topLayer.block));

  for (let z = 0; z < size.z; z += 1) {
    for (let x = 0; x < size.x; x += 1) {
      const height = columnHeight(options, x, z);
      heights[z * size.x + x] = height;
      const column = columnLayers(options.layers, height);
      // Shores: grass and dirt at the water's edge or under water become sand.
      if (options.water && shoreTop && height <= level + 1) {
        for (let y = height - 1; y >= Math.max(0, height - topLayer.thickness); y -= 1) {
          column[y] = QUICK_SAND;
        }
      }
      column.forEach((state, y) => {
        ground.set(x, y, z, state);
      });
      if (options.water) {
        for (let y = height; y < level; y += 1) ground.set(x, y, z, QUICK_WATER);
      }
    }
  }

  const trees = placeTrees(ground, heights, options);
  return { ...ground.build(), heights, trees, options };
}

function placeTrees(
  ground: GroundBuilder,
  heights: Uint8Array,
  options: QuickWorldOptions,
): QuickTree[] {
  const target = TREE_TARGETS[options.trees];
  if (target.count === 0) return [];
  const { size } = ground;
  const random = randomFrom((options.seed ^ 0x9e3779b9) >>> 0);
  const trees: QuickTree[] = [];
  const margin = 3;
  for (let attempt = 0; attempt < target.count * 30 && trees.length < target.count; attempt += 1) {
    const x = margin + Math.floor(random() * (size.x - 2 * margin));
    const z = margin + Math.floor(random() * (size.z - 2 * margin));
    const trunk = 4 + Math.floor(random() * 3);
    const height = heights[z * size.x + x] as number;
    const soil = blockIdOf(ground.get(x, height - 1, z));
    if (!TREE_SOILS.has(soil)) continue;
    if (options.water && height - 1 < options.waterLevel) continue;
    if (height + trunk + 2 >= size.y) continue;
    if (trees.some((tree) => (tree.x - x) ** 2 + (tree.z - z) ** 2 < target.spacing ** 2)) {
      continue;
    }
    trees.push({ x, z, y: height, trunk });
  }
  for (const tree of trees) growTree(ground, tree, random);
  return trees;
}

/** Writes one tree: leaves into air only, then the trunk (which replaces leaves). */
function growTree(ground: GroundBuilder, tree: QuickTree, random: () => number): void {
  const top = tree.y + tree.trunk - 1;
  for (const [dy, radius] of CROWN_RADII) {
    const reach = Math.ceil(radius);
    for (let dz = -reach; dz <= reach; dz += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        const spare = radius * radius - (dx * dx + dz * dz);
        if (spare < 0) continue;
        // The rim is ragged: some outer leaves are left off.
        if (spare < 1.2 && random() < 0.35) continue;
        const x = tree.x + dx;
        const y = top + dy;
        const z = tree.z + dz;
        if (ground.get(x, y, z) === 'minecraft:air') ground.set(x, y, z, TREE_LEAVES);
      }
    }
  }
  for (let y = tree.y; y <= top; y += 1) ground.set(tree.x, y, tree.z, TREE_LOG);
}
