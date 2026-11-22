/**
 * The growing and climbing plants and the project flower pot of vanilla parity 3 (ADR 0103, B519)
 * as Try it knows them: `growing_plant`, `column_plant`, `multiface`, `dripleaf` and `flower_pot`,
 * their state properties (the runtime's, B509 and B511 notes), their companion blocks (a strand's
 * `<id>_plant`, a bamboo shoot `<id>_shoot`, a big dripleaf's `<id>_stem`, a pot's potted
 * `<pot id>_<plant path>`) and the numbers of the format's defaults (B506).
 *
 * Everything here is read from the lowered `msm/<ns>/block/<path>.json` definition; the rules
 * follow the ADRs and what the runtime measured (B503, B509), never Mojang code.
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import { HORIZONTALS } from '../directions.js';

/** The block types of ADR 0103, in the format's order. */
export const SIM_BLOCK_TYPES_3 = Object.freeze([
  'growing_plant',
  'column_plant',
  'multiface',
  'dripleaf',
  'flower_pot',
] as const);

/** One of the five types. */
export type SimBlockType3 = (typeof SIM_BLOCK_TYPES_3)[number];

/** Whether a definition's `type` is one of the five. */
export const isType3 = (type: string): type is SimBlockType3 =>
  (SIM_BLOCK_TYPES_3 as readonly string[]).includes(type);

/** A companion of the five types: a strand, a shoot, a stem or a potted plant. */
export type Companion3Kind = 'plant' | 'shoot' | 'stem' | 'potted';

/** The oldest age of a growing plant's tip (vanilla's fixed range, B503: 0 to 25). */
export const STRAND_MAX_AGE = 25;
/** A column plant's top grows one block after this many random ticks (B509: 16 a block). */
export const COLUMN_TICKS_PER_BLOCK = 16;
/** A bamboo-like column is thick from this height on (B509, `MsmBambooBlock.THICK_FROM`). */
export const BAMBOO_THICK_FROM = 4;
/** How long a big dripleaf stays fully tilted before it springs back, in ticks (B503 X3). */
export const FULL_TILT_TICKS = 100;
/** The most blocks a small dripleaf grows into (B509: 2 to 4 high). */
export const SMALL_DRIPLEAF_MAX_HEIGHT = 4;

/** A growing plant's facts (B506 defaults). */
export interface GrowingPlantFacts {
  readonly direction: 'up' | 'down';
  /** The blocks the tip may still grow when placed (25 keeps vanilla's random start). */
  readonly maxAge: number;
  readonly growthChance: number;
  /** Blocks one bone meal adds, or `undefined` for vanilla's count for the shape. */
  readonly bonemeal?: { readonly min: number; readonly max: number };
  readonly needsWater: boolean;
  readonly berries?: { readonly item: string; readonly light: number };
  readonly climbable: boolean;
  readonly soil?: readonly string[];
}

/** A column plant's facts (B506 defaults). */
export interface ColumnPlantFacts {
  readonly style: 'cane' | 'cactus' | 'bamboo';
  readonly maxHeight: number;
  readonly minHeight: number;
  readonly soil?: readonly string[];
  readonly needsWaterNearby: boolean;
  readonly touchDamage: number;
}

/** A multiface plant's facts (B506 defaults). */
export interface MultifaceFacts {
  readonly light: number;
  readonly spreads: boolean;
  readonly waterloggable: boolean;
}

/** A dripleaf's facts (B506 defaults). */
export interface DripleafFacts {
  readonly size: 'big' | 'small';
  readonly growsInto?: string;
  /** Ticks to unstable, to a partial tilt and to a full tilt. */
  readonly tiltTicks: readonly [number, number, number];
}

/** A project flower pot: the plants it takes, each with the potted block it becomes. */
export interface FlowerPotFacts {
  /** Plant block id to potted block id (listed plants, then `potted_plant`s naming the pot). */
  readonly plants: Readonly<Record<string, string>>;
}

/** What Try it knows about a block of the five types beyond its state. */
export interface Types3Facts {
  /** For a companion: what it is and the element's own block id. */
  readonly companion?: { readonly kind: Companion3Kind; readonly of: string };
  readonly growing?: GrowingPlantFacts;
  readonly column?: ColumnPlantFacts;
  readonly multiface?: MultifaceFacts;
  readonly dripleaf?: DripleafFacts;
  readonly pot?: FlowerPotFacts;
  /** A potted companion's plant. */
  readonly plant?: string;
}

/** A property's values and the value it starts with. */
export interface Property3Spec {
  readonly values: readonly string[];
  readonly fallback: string;
}

/** The properties of a block, by name. */
export type Property3Specs = Record<string, Property3Spec>;

const BOOL = Object.freeze(['false', 'true']);
const bool = (fallback: 'false' | 'true' = 'false'): Property3Spec => ({
  values: BOOL,
  fallback,
});
const range = (first: number, last: number): readonly string[] =>
  Object.freeze(Array.from({ length: last - first + 1 }, (_, i) => String(first + i)));
const numbers = (first: number, last: number, fallback = first): Property3Spec => ({
  values: range(first, last),
  fallback: String(fallback),
});
const facing4: Property3Spec = { values: HORIZONTALS, fallback: 'north' };
/** The six faces of a multiface block, as its state names them. */
export const MULTIFACE_SIDES = Object.freeze(['down', 'up', 'north', 'south', 'west', 'east']);

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;
const int = (value: Json | undefined, fallback: number, low: number, high: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= low && value <= high
    ? value
    : fallback;
const ids = (value: Json | undefined): readonly string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((one): one is string => typeof one === 'string' && one !== '');
  return out.length === 0 ? undefined : Object.freeze(out);
};

/** A growing plant's facts from its definition. */
export function growingFacts(definition: JsonObject): GrowingPlantFacts {
  const needsWater = definition.needs_water === true;
  const growth = isRecord(definition.bonemeal_growth) ? definition.bonemeal_growth : undefined;
  const berries = isRecord(definition.berries) ? definition.berries : undefined;
  const berryItem = text(berries?.item);
  const soil = ids(definition.soil);
  const min = int(growth?.min, 1, 0, 15);
  const chance = definition.growth_chance;
  return Object.freeze({
    direction: definition.direction === 'down' ? 'down' : 'up',
    maxAge: int(definition.max_age, STRAND_MAX_AGE, 0, STRAND_MAX_AGE),
    growthChance: typeof chance === 'number' && chance >= 0 && chance <= 1 ? chance : 0.14,
    ...(growth === undefined
      ? {}
      : { bonemeal: Object.freeze({ min, max: Math.max(min, int(growth.max, min, 0, 15)) }) }),
    needsWater,
    ...(berryItem === undefined
      ? {}
      : { berries: Object.freeze({ item: berryItem, light: int(berries?.light, 14, 0, 15) }) }),
    climbable:
      typeof definition.climbable === 'boolean' ? definition.climbable : needsWater === false,
    ...(soil === undefined ? {} : { soil }),
  });
}

/** A column plant's facts from its definition. */
export function columnFacts(definition: JsonObject): ColumnPlantFacts {
  const style =
    definition.style === 'cactus' || definition.style === 'bamboo' ? definition.style : 'cane';
  const maxHeight = int(definition.max_height, style === 'bamboo' ? 16 : 3, 1, 32);
  const minHeight = int(
    definition.min_height,
    style === 'bamboo' ? Math.min(12, maxHeight) : maxHeight,
    1,
    32,
  );
  const soil = ids(definition.soil);
  const damage = definition.touch_damage;
  return Object.freeze({
    style,
    maxHeight,
    minHeight: Math.min(minHeight, maxHeight),
    ...(soil === undefined ? {} : { soil }),
    needsWaterNearby:
      typeof definition.needs_water_nearby === 'boolean'
        ? definition.needs_water_nearby
        : style === 'cane',
    touchDamage: typeof damage === 'number' && damage >= 0 ? damage : style === 'cactus' ? 1 : 0,
  });
}

/** A multiface plant's facts from its definition. */
export function multifaceFacts(definition: JsonObject): MultifaceFacts {
  return Object.freeze({
    light: int(definition.light, 7, 0, 15),
    spreads: definition.spreads !== false,
    waterloggable: definition.waterloggable !== false,
  });
}

/** A dripleaf's facts from its definition. */
export function dripleafFacts(definition: JsonObject): DripleafFacts {
  const ticks = definition.tilt_ticks;
  const tilt: [number, number, number] =
    Array.isArray(ticks) &&
    ticks.length === 3 &&
    ticks.every((one) => typeof one === 'number' && Number.isInteger(one) && one >= 1)
      ? [ticks[0] as number, ticks[1] as number, ticks[2] as number]
      : [2, 10, 10];
  const growsInto = text(definition.grows_into);
  return Object.freeze({
    size: definition.size === 'small' ? 'small' : 'big',
    ...(growsInto === undefined ? {} : { growsInto }),
    tiltTicks: Object.freeze(tilt),
  });
}

/** The listed plants of a pot definition (`plants`), in order. */
export function potPlants(definition: JsonObject): readonly string[] {
  return ids(definition.plants) ?? [];
}

/** The path of a resource location (`minecraft:dandelion` to `dandelion`). */
export const pathOf = (id: string): string => id.slice(id.indexOf(':') + 1);

/** A pot's potted companion of `plant`: `<pot id>_<plant path>` (B510b `PotTypes.companionId`). */
export const pottedId = (pot: string, plant: string): string => `${pot}_${pathOf(plant)}`;

/** The companion kinds a block of the five types registers, by its facts. */
export function companions3Of(
  type: SimBlockType3,
  facts: Types3Facts,
): readonly Exclude<Companion3Kind, 'potted'>[] {
  if (type === 'growing_plant') return ['plant'];
  if (type === 'column_plant' && facts.column?.style === 'bamboo') return ['shoot'];
  if (type === 'dripleaf' && facts.dripleaf?.size === 'big') return ['stem'];
  return [];
}

/** A companion's block id: `<id>_plant`, `<id>_shoot` or `<id>_stem`. */
export const companion3Id = (id: string, kind: 'plant' | 'shoot' | 'stem'): string =>
  `${id}_${kind}`;

/** The facts of a block of the five types (not the potted companions'), from its definition. */
export function types3Facts(type: SimBlockType3, definition: JsonObject): Types3Facts {
  switch (type) {
    case 'growing_plant':
      return Object.freeze({ growing: growingFacts(definition) });
    case 'column_plant':
      return Object.freeze({ column: columnFacts(definition) });
    case 'multiface':
      return Object.freeze({ multiface: multifaceFacts(definition) });
    case 'dripleaf':
      return Object.freeze({ dripleaf: dripleafFacts(definition) });
    default:
      return Object.freeze({ pot: Object.freeze({ plants: Object.freeze({}) }) });
  }
}

/** The properties of the element's own block of the five types (the runtime's states). */
export function types3Properties(type: SimBlockType3, facts: Types3Facts): Property3Specs {
  const table: Property3Specs = {};
  switch (type) {
    case 'growing_plant':
      table.age = numbers(0, STRAND_MAX_AGE, STRAND_MAX_AGE - (facts.growing?.maxAge ?? 25));
      if (facts.growing?.berries !== undefined) table.berries = bool();
      break;
    case 'column_plant':
      if (facts.column?.style === 'bamboo') {
        table.age = numbers(0, 1);
        table.leaves = { values: Object.freeze(['none', 'small', 'large']), fallback: 'none' };
        table.stage = numbers(0, 1);
      } else {
        table.age = numbers(0, 15);
      }
      break;
    case 'multiface':
      for (const side of MULTIFACE_SIDES) table[side] = bool();
      table.waterlogged = bool();
      break;
    case 'dripleaf':
      table.facing = facing4;
      if (facts.dripleaf?.size === 'small') {
        table.half = { values: Object.freeze(['lower', 'upper']), fallback: 'lower' };
      } else {
        table.tilt = {
          values: Object.freeze(['none', 'unstable', 'partial', 'full']),
          fallback: 'none',
        };
      }
      table.waterlogged = bool();
      break;
    default:
      break;
  }
  return table;
}

/** The properties of a companion: a strand keeps berries, a stem faces, a shoot has none. */
export function companion3Properties(kind: Companion3Kind, facts: Types3Facts): Property3Specs {
  if (kind === 'plant' && facts.growing?.berries !== undefined) return { berries: bool() };
  if (kind === 'stem') return { facing: facing4, waterlogged: bool() };
  return {};
}

/** The light a block of the five types gives in a state (B509 notes). */
export function light3Of(facts: Types3Facts | undefined, state: Readonly<Record<string, string>>) {
  if (facts?.growing?.berries !== undefined) {
    return state.berries === 'true' ? facts.growing.berries.light : 0;
  }
  if (facts?.multiface !== undefined && facts.companion === undefined) {
    return facts.multiface.light;
  }
  return 0;
}
