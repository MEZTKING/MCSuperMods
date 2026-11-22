/**
 * Blocks as the features see them: state strings (`minecraft:oak_log[axis=y]`, the palette's
 * form), read from the data's three ways of writing a state (a bare id, `{ id, properties }`,
 * `{ Name, Properties }`), and what a feature needs to know of a block: air, fluid, a plant a
 * player walks through, leaves, or solid. The engine has no block facts of the game, so these
 * classes are MSM's own, by the block's name (ADR 0119 D6: approximate). Block tags come from the
 * files when the host passes `tags/block`; otherwise a few tags the features use are guessed by
 * name, and any other tag matches nothing (reported once).
 */

import { withNamespace } from '../registries';

type Json = Record<string, unknown>;

export function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const AIR = 'minecraft:air';

/** The id of a state string (without its properties). */
export function idOf(state: string): string {
  const i = state.indexOf('[');
  return i === -1 ? state : state.slice(0, i);
}

/** The properties of a state string. */
export function propertiesOf(state: string): Record<string, string> {
  const i = state.indexOf('[');
  if (i === -1) return {};
  const out: Record<string, string> = {};
  for (const part of state.slice(i + 1, -1).split(',')) {
    const [k, v] = part.split('=');
    if (k && v !== undefined) out[k] = v;
  }
  return out;
}

/** A state string from an id and properties (properties sorted, as one form for each state). */
export function stateString(id: string, properties: Readonly<Record<string, string>> = {}): string {
  const keys = Object.keys(properties).sort();
  const name = withNamespace(id);
  if (keys.length === 0) return name;
  return `${name}[${keys.map((k) => `${k}=${properties[k]}`).join(',')}]`;
}

/** The same state with some properties set. */
export function withProperties(state: string, set: Readonly<Record<string, string>>): string {
  return stateString(idOf(state), { ...propertiesOf(state), ...set });
}

/** A block state from the data (a bare id, `{ id, properties }` or `{ Name, Properties }`). */
export function readState(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const i = value.indexOf('[');
    if (i === -1) return withNamespace(value);
    return stateString(value.slice(0, i), propertiesOf(value));
  }
  if (!isObject(value)) return undefined;
  const id = value.id ?? value.Name;
  if (typeof id !== 'string') return undefined;
  const props = value.properties ?? value.Properties;
  const out: Record<string, string> = {};
  if (isObject(props)) for (const [k, v] of Object.entries(props)) out[k] = String(v);
  return stateString(id, out);
}

// --- Classes by name ---

const AIRS = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);
const FLUIDS = new Set([
  'minecraft:water',
  'minecraft:lava',
  'minecraft:flowing_water',
  'minecraft:flowing_lava',
]);
const PLANTS = new Set(
  [
    'short_grass',
    'grass',
    'tall_grass',
    'fern',
    'large_fern',
    'dandelion',
    'poppy',
    'blue_orchid',
    'allium',
    'azure_bluet',
    'oxeye_daisy',
    'cornflower',
    'lily_of_the_valley',
    'wither_rose',
    'sunflower',
    'lilac',
    'rose_bush',
    'peony',
    'torchflower',
    'pitcher_plant',
    'dead_bush',
    'bush',
    'firefly_bush',
    'sweet_berry_bush',
    'short_dry_grass',
    'tall_dry_grass',
    'wildflowers',
    'pink_petals',
    'leaf_litter',
    'open_eyeblossom',
    'closed_eyeblossom',
    'cactus_flower',
    'sugar_cane',
    'lily_pad',
    'seagrass',
    'tall_seagrass',
    'kelp',
    'kelp_plant',
    'vine',
    'glow_lichen',
    'sculk_vein',
    'hanging_roots',
    'spore_blossom',
    'small_dripleaf',
    'big_dripleaf_stem',
    'cave_vines',
    'cave_vines_plant',
    'weeping_vines',
    'weeping_vines_plant',
    'twisting_vines',
    'twisting_vines_plant',
    'nether_sprouts',
    'snow',
    'cobweb',
    'torch',
    'mangrove_propagule',
    'resin_clump',
    'pale_hanging_moss',
    'sea_pickle',
  ].map((n) => `minecraft:${n}`),
);
const PLANT_SUFFIXES = [
  '_sapling',
  '_tulip',
  '_roots',
  '_fungus',
  '_coral',
  '_coral_fan',
  '_carpet',
  '_button',
];

/** What a block is, for heightmaps, survival and the trees. */
export interface BlockClass {
  readonly id: string;
  readonly air: boolean;
  readonly fluid: boolean;
  /** Waterlogged, or a block that is always in water (kelp, seagrass). */
  readonly water: boolean;
  /** A plant or other block a player walks through (not motion blocking, not air). */
  readonly plant: boolean;
  readonly leaves: boolean;
  readonly log: boolean;
  /** Motion blocking and not a fluid: full ground. */
  readonly solid: boolean;
}

const classes = new Map<string, BlockClass>();

/** The class of a state string. */
export function classOf(state: string): BlockClass {
  let c = classes.get(state);
  if (c) return c;
  const id = idOf(state);
  const air = AIRS.has(id);
  const fluid = FLUIDS.has(id);
  const leaves = id.endsWith('_leaves');
  const log =
    id.endsWith('_log') || id.endsWith('_wood') || id.endsWith('_stem') || id.endsWith('_hyphae');
  const mushroom = id.endsWith('_mushroom');
  const plant =
    !air &&
    !fluid &&
    (PLANTS.has(id) ||
      mushroom ||
      PLANT_SUFFIXES.some((s) => id.endsWith(s)) ||
      id.includes('torch'));
  const water =
    id === 'minecraft:water' ||
    id === 'minecraft:flowing_water' ||
    id === 'minecraft:seagrass' ||
    id === 'minecraft:tall_seagrass' ||
    id === 'minecraft:kelp' ||
    id === 'minecraft:kelp_plant' ||
    propertiesOf(state).waterlogged === 'true';
  c = Object.freeze({ id, air, fluid, water, plant, leaves, log, solid: !air && !fluid && !plant });
  if (classes.size > 4096) classes.clear();
  classes.set(state, c);
  return c;
}

/** Blocks a feature may replace as if they were air (plants, snow, fluids for trees not). */
export function replaceable(c: BlockClass): boolean {
  return c.air || c.plant;
}

// --- Tags ---

const DIRT = new Set(
  [
    'dirt',
    'grass_block',
    'podzol',
    'coarse_dirt',
    'mycelium',
    'rooted_dirt',
    'moss_block',
    'pale_moss_block',
    'mud',
    'muddy_mangrove_roots',
    'farmland',
    'dirt_path',
  ].map((n) => `minecraft:${n}`),
);
const SAND = new Set(['minecraft:sand', 'minecraft:red_sand', 'minecraft:suspicious_sand']);
const STONE_ORE = new Set(['stone', 'granite', 'diorite', 'andesite'].map((n) => `minecraft:${n}`));
const DEEPSLATE_ORE = new Set(['minecraft:deepslate', 'minecraft:tuff']);

/** Tags guessed by name when the files have none (MSM's own approximation). */
const GUESSED: Readonly<Record<string, (id: string) => boolean>> = {
  'minecraft:air': (id) => AIRS.has(id),
  'minecraft:dirt': (id) => DIRT.has(id),
  'minecraft:sand': (id) => SAND.has(id),
  'minecraft:stone_ore_replaceables': (id) => STONE_ORE.has(id),
  'minecraft:deepslate_ore_replaceables': (id) => DEEPSLATE_ORE.has(id),
  'minecraft:base_stone_overworld': (id) => STONE_ORE.has(id) || DEEPSLATE_ORE.has(id),
  'minecraft:base_stone_nether': (id) =>
    id === 'minecraft:netherrack' || id === 'minecraft:basalt' || id === 'minecraft:blackstone',
  'minecraft:leaves': (id) => id.endsWith('_leaves'),
  'minecraft:logs': (id) =>
    id.endsWith('_log') || id.endsWith('_wood') || id.endsWith('_stem') || id.endsWith('_hyphae'),
  'minecraft:snow': (id) => id === 'minecraft:snow' || id === 'minecraft:snow_block',
  'minecraft:ice': (id) => id.endsWith('ice'),
  'minecraft:replaceable': (id) => AIRS.has(id) || FLUIDS.has(id) || classOf(id).plant,
  'minecraft:replaceable_by_trees': (id) =>
    AIRS.has(id) || id.endsWith('_leaves') || classOf(id).plant || id === 'minecraft:water',
  'minecraft:terracotta': (id) => id.endsWith('terracotta'),
  'minecraft:moss_replaceable': (id) => DIRT.has(id) || STONE_ORE.has(id) || DEEPSLATE_ORE.has(id),
};

/** Whether a tag is guessed by name when the files lack it. */
export function guessedTag(tag: string): boolean {
  return withNamespace(tag) in GUESSED;
}

/** Block tags from the files (`tags/block`), with nested tags; guessed by name otherwise. */
export class BlockTags {
  private readonly resolved = new Map<string, Set<string> | null>();
  private readonly read: (id: string) => unknown;
  /** Tags neither the files nor the guesses know (the caller reports them). */
  readonly unknown = new Set<string>();

  constructor(read: (id: string) => unknown) {
    this.read = read;
  }

  has(tag: string, id: string): boolean {
    const key = withNamespace(tag.startsWith('#') ? tag.slice(1) : tag);
    const set = this.resolve(key, new Set());
    if (set) return set.has(id);
    const guess = GUESSED[key];
    if (guess) return guess(id);
    this.unknown.add(key);
    return false;
  }

  private resolve(key: string, seen: Set<string>): Set<string> | null {
    const known = this.resolved.get(key);
    if (known !== undefined) return known;
    if (seen.has(key)) return new Set();
    seen.add(key);
    const json = this.read(key);
    if (!isObject(json) || !Array.isArray(json.values)) {
      this.resolved.set(key, null);
      return null;
    }
    const out = new Set<string>();
    for (const entry of json.values) {
      const value =
        typeof entry === 'string' ? entry : isObject(entry) ? (entry.id as unknown) : undefined;
      if (typeof value !== 'string') continue;
      if (value.startsWith('#')) {
        const inner = withNamespace(value.slice(1));
        const set = this.resolve(inner, seen);
        if (set) for (const v of set) out.add(v);
        else {
          const guess = GUESSED[inner];
          // A guessed tag inside a file tag cannot be listed; leave it to the guess.
          if (!guess) this.unknown.add(inner);
        }
      } else out.add(withNamespace(value));
    }
    this.resolved.set(key, out);
    return out;
  }
}

// --- Survival (MSM's own rules by name) ---

/** Neighbours a placed block may need. */
export interface Around {
  below(): string;
  above(): string;
  at(): string;
  /** The four sides at the same height, then the four sides one below. */
  side(dx: number, dy: number, dz: number): string;
}

function isDirtLike(id: string): boolean {
  return DIRT.has(id);
}

const ON_SAND_OR_DIRT = new Set([
  'minecraft:dead_bush',
  'minecraft:short_dry_grass',
  'minecraft:tall_dry_grass',
  'minecraft:cactus_flower',
]);

/** Whether a block could stand where `around` is (approximate; MSM's own by name). */
export function canSurvive(state: string, around: Around): boolean {
  const id = idOf(state);
  const c = classOf(state);
  const below = classOf(around.below());
  if (id === 'minecraft:lily_pad') return below.id === 'minecraft:water';
  if (id === 'minecraft:seagrass' || id === 'minecraft:kelp' || id === 'minecraft:tall_seagrass') {
    return below.solid && classOf(around.at()).water;
  }
  if (id === 'minecraft:sea_pickle') return below.solid;
  if (id === 'minecraft:sugar_cane') {
    if (below.id === 'minecraft:sugar_cane') return true;
    if (!isDirtLike(below.id) && !SAND.has(below.id)) return false;
    for (const [dx, dz] of SIDES) if (classOf(around.side(dx, -1, dz)).water) return true;
    return false;
  }
  if (id === 'minecraft:cactus') {
    if (below.id !== 'minecraft:cactus' && !SAND.has(below.id)) return false;
    for (const [dx, dz] of SIDES) if (classOf(around.side(dx, 0, dz)).solid) return false;
    return true;
  }
  if (ON_SAND_OR_DIRT.has(id)) {
    return isDirtLike(below.id) || SAND.has(below.id) || below.id.endsWith('terracotta');
  }
  if (id.endsWith('_mushroom') || id.endsWith('_fungus') || id.endsWith('_roots')) {
    return below.solid;
  }
  if (id === 'minecraft:snow') return below.solid && !below.id.endsWith('ice');
  if (id === 'minecraft:vine' || id === 'minecraft:glow_lichen' || id === 'minecraft:sculk_vein') {
    if (classOf(around.above()).solid || below.solid) return true;
    for (const [dx, dz] of SIDES) if (classOf(around.side(dx, 0, dz)).solid) return true;
    return false;
  }
  if (id.endsWith('_vines') || id.endsWith('_vines_plant') || id === 'minecraft:hanging_roots') {
    const above = classOf(around.above());
    return above.solid || above.id === id || above.id === id.replace(/_plant$/, '');
  }
  if (id === 'minecraft:mangrove_propagule') return classOf(around.above()).leaves || below.solid;
  if (c.plant) {
    // Flowers, grass, ferns, saplings, bushes: on dirt-like ground.
    return isDirtLike(below.id) || (id.endsWith('_sapling') && below.id === 'minecraft:mud');
  }
  return true;
}

export const SIDES: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Two-block plants: the lower half is placed with the upper above it. */
export const DOUBLE_PLANTS = new Set(
  [
    'tall_grass',
    'large_fern',
    'sunflower',
    'lilac',
    'rose_bush',
    'peony',
    'pitcher_plant',
    'tall_seagrass',
  ].map((n) => `minecraft:${n}`),
);
