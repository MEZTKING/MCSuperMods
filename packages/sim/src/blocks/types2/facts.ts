/**
 * The twenty block types of vanilla parity 2 (ADR 0094, ADR 0101 D5, B463) as Try it knows them:
 * their state properties and defaults, their companion blocks (a torch's or sign's wall block, a
 * stem's attached stem), the light the game gives them, and which of them hold water or can be
 * climbed. The states are the runtime's (B445, B446, B449 notes): what the lowered block state
 * names plus the runtime's own properties (a bed's `occupied`, scaffolding's `distance`, vanilla's
 * `waterlogged` on the types that keep it).
 *
 * Everything here is read from the lowered `msm/<ns>/block/<path>.json` definition and the
 * observable game; no Mojang code is read.
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import { HORIZONTALS } from '../directions.js';

/** The block types of vanilla parity 2, in the format's order (ADR 0094 D1). */
export const SIM_BLOCK_TYPES_2 = Object.freeze([
  'cake',
  'berry_bush',
  'tall_plant',
  'potted_plant',
  'vine',
  'sea_pickle',
  'carpet',
  'layers',
  'cocoa',
  'candle',
  'bed',
  'ladder',
  'torch',
  'lantern',
  'chain',
  'rod',
  'sign',
  'hanging_sign',
  'stem',
  'scaffolding',
] as const);

/** One of the twenty types. */
export type SimBlockType2 = (typeof SIM_BLOCK_TYPES_2)[number];

/** Whether a definition's `type` is one of the twenty. */
export const isType2 = (type: string): type is SimBlockType2 =>
  (SIM_BLOCK_TYPES_2 as readonly string[]).includes(type);

/** A property's values and the value it starts with. */
export interface PropertySpec {
  readonly values: readonly string[];
  readonly fallback: string;
}

/** The properties of a block, by name. */
export type PropertySpecs = Record<string, PropertySpec>;

/** A companion block (B448): a second block the game registers beside the element's own. */
export type CompanionKind = 'wall' | 'attached';

/** What Try it knows about a block of the twenty types beyond its state. */
export interface Types2Facts {
  /** For a companion: what it is and the element's own block id. */
  readonly companion?: { readonly kind: CompanionKind; readonly of: string };
  /** The companion block ids the element's own block places, by kind. */
  readonly companions?: Readonly<Partial<Record<CompanionKind, string>>>;
  /** The light the game gives, by the block's own rule (B446 defaults). */
  readonly light?: number;
  /** A cake's food: nutrition and saturation per slice (B443 defaults 2 and 0.1). */
  readonly food?: { readonly nutrition: number; readonly saturation: number };
  /** A cake's `on_eat` event id. */
  readonly onEat?: string;
  /** A berry bush's berry item and harvests (B443 defaults [1, 2] and [2, 3]). */
  readonly berry?: {
    readonly item: string;
    readonly ripe: readonly [number, number];
    readonly full: readonly [number, number];
    readonly hurts: boolean;
  };
  /** A stem's fruit block. */
  readonly fruit?: string;
  /** A potted plant's plant block. */
  readonly plant?: string;
  /** A sign's or hanging sign's vanilla wood type (its sounds and, by Q1, maybe its board). */
  readonly woodType?: string;
  /** A bed's rule (`bed` or `straw_bed`) and dye colour. */
  readonly bed?: { readonly rule: string; readonly colour: string };
  /** A torch's particle. */
  readonly particle?: string;
}

const BOOL = Object.freeze(['false', 'true']);
const bool = (fallback: 'false' | 'true' = 'false'): PropertySpec => ({ values: BOOL, fallback });
const range = (first: number, last: number): readonly string[] =>
  Object.freeze(Array.from({ length: last - first + 1 }, (_, i) => String(first + i)));
const numbers = (first: number, last: number, fallback = first): PropertySpec => ({
  values: range(first, last),
  fallback: String(fallback),
});
const facing4 = (fallback = 'north'): PropertySpec => ({ values: HORIZONTALS, fallback });
const FACING6 = Object.freeze(['down', 'up', 'north', 'south', 'west', 'east']);

/**
 * The types that keep vanilla's `waterlogged` (B445, B446, B449 notes): candles, sea pickles,
 * ladders, lanterns, chains, both signs and scaffolding. Rods, beds, torches and stems have none.
 */
export const WATERLOGGED_TYPES_2: readonly SimBlockType2[] = Object.freeze([
  'candle',
  'sea_pickle',
  'ladder',
  'lantern',
  'chain',
  'sign',
  'hanging_sign',
  'scaffolding',
]);

/** The types players climb (ADR 0101 D5: ladders and vines, and scaffolding, B446). */
export const CLIMBABLE_TYPES_2: readonly SimBlockType2[] = Object.freeze([
  'ladder',
  'vine',
  'scaffolding',
]);

/** The light of each type without a rule of its own (B446: torch 14, lantern 15, rod 14). */
export const TYPE_LIGHT: Readonly<Partial<Record<SimBlockType2, number>>> = Object.freeze({
  torch: 14,
  lantern: 15,
  rod: 14,
});

/** A lit candle's light per candle (B447: 3 per lit candle). */
export const CANDLE_LIGHT_PER_CANDLE = 3;

/** The most bites a cake takes before it is gone (`bites` 0..6). */
export const CAKE_MAX_BITES = 6;

/** Scaffolding's furthest distance from a support (`distance` 0..7; 7 falls). */
export const SCAFFOLDING_MAX_DISTANCE = 7;

/** The light of a block state of the twenty types, as the game gives it. */
export function lightOf(type: SimBlockType2, properties: Readonly<Record<string, string>>): number {
  if (type === 'candle') {
    return properties.lit === 'true'
      ? CANDLE_LIGHT_PER_CANDLE * Number(properties.candles ?? 1)
      : 0;
  }
  if (type === 'sea_pickle') {
    // B445: 3 + 3 per pickle in water, 0 out of it.
    return properties.waterlogged === 'true' ? 3 + 3 * Number(properties.pickles ?? 1) : 0;
  }
  return TYPE_LIGHT[type] ?? 0;
}

/** The properties of a block of the twenty types (the runtime's state definition). */
export function types2Properties(type: SimBlockType2): PropertySpecs {
  const table: PropertySpecs = {};
  switch (type) {
    case 'cake':
      table.bites = numbers(0, CAKE_MAX_BITES);
      break;
    case 'berry_bush':
      table.age = numbers(0, 3);
      break;
    case 'tall_plant':
      table.half = { values: ['lower', 'upper'], fallback: 'lower' };
      break;
    case 'vine':
      for (const side of ['up', ...HORIZONTALS]) table[side] = bool();
      break;
    case 'sea_pickle':
      table.pickles = numbers(1, 4);
      break;
    case 'layers':
      table.layers = numbers(1, 8);
      break;
    case 'cocoa':
      table.age = numbers(0, 2);
      table.facing = facing4();
      break;
    case 'candle':
      table.candles = numbers(1, 4);
      table.lit = bool();
      break;
    case 'bed':
      table.facing = facing4();
      table.part = { values: ['head', 'foot'], fallback: 'foot' };
      table.occupied = bool();
      break;
    case 'ladder':
      table.facing = facing4();
      break;
    case 'lantern':
      table.hanging = bool();
      break;
    case 'chain':
      table.axis = { values: ['x', 'y', 'z'], fallback: 'y' };
      break;
    case 'rod':
      table.facing = { values: FACING6, fallback: 'up' };
      break;
    case 'sign':
      table.rotation = numbers(0, 15);
      break;
    case 'hanging_sign':
      table.attached = bool();
      table.rotation = numbers(0, 15);
      break;
    case 'stem':
      table.age = numbers(0, 7);
      break;
    case 'scaffolding':
      table.distance = numbers(0, SCAFFOLDING_MAX_DISTANCE, SCAFFOLDING_MAX_DISTANCE);
      table.bottom = bool();
      break;
    default:
      break;
  }
  if (WATERLOGGED_TYPES_2.includes(type)) {
    table.waterlogged = bool(type === 'sea_pickle' ? 'true' : 'false');
  }
  return table;
}

/** The properties of a companion block: each faces one horizontal side. */
export function companionProperties(type: SimBlockType2): PropertySpecs {
  const table: PropertySpecs = { facing: facing4() };
  if (type === 'sign' || type === 'hanging_sign') table.waterlogged = bool();
  return table;
}

/** The companions a type registers (B448): `<id>_wall` or `<id>_attached`. */
export function companionKindsOf(type: SimBlockType2): readonly CompanionKind[] {
  if (type === 'torch' || type === 'sign' || type === 'hanging_sign') return ['wall'];
  if (type === 'stem') return ['attached'];
  return [];
}

/** A companion's block id: `<id>_wall` or `<id>_attached`. */
export const companionId = (id: string, kind: CompanionKind): string => `${id}_${kind}`;

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const pair = (value: Json | undefined, fallback: readonly [number, number]) =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === 'number' &&
  typeof value[1] === 'number'
    ? (Object.freeze([value[0], value[1]]) as readonly [number, number])
    : fallback;

/** The facts of a block of the twenty types, from its lowered definition. */
export function types2Facts(type: SimBlockType2, id: string, definition: JsonObject): Types2Facts {
  const companions: Partial<Record<CompanionKind, string>> = {};
  for (const kind of companionKindsOf(type)) companions[kind] = companionId(id, kind);
  const light = TYPE_LIGHT[type];
  const facts: Record<string, unknown> = {};
  if (Object.keys(companions).length > 0) facts.companions = Object.freeze(companions);
  if (light !== undefined) facts.light = light;
  if (type === 'cake') {
    const food = isRecord(definition.food) ? definition.food : {};
    facts.food = Object.freeze({
      nutrition: typeof food.nutrition === 'number' ? food.nutrition : 2,
      saturation: typeof food.saturation === 'number' ? food.saturation : 0.1,
    });
    const onEat = text(definition.on_eat);
    if (onEat !== undefined) facts.onEat = onEat;
  }
  if (type === 'berry_bush') {
    const harvest = isRecord(definition.harvest) ? definition.harvest : {};
    facts.berry = Object.freeze({
      item: text(definition.berry) ?? id,
      ripe: pair(harvest.ripe, [1, 2]),
      full: pair(harvest.full, [2, 3]),
      hurts: definition.hurts !== false,
    });
  }
  if (type === 'stem') {
    const fruit = text(definition.fruit);
    if (fruit !== undefined) facts.fruit = fruit;
  }
  if (type === 'potted_plant') {
    const plant = text(definition.plant);
    if (plant !== undefined) facts.plant = plant;
  }
  if (type === 'sign' || type === 'hanging_sign') {
    const wood = text(definition.wood_type);
    if (wood !== undefined) facts.woodType = wood;
  }
  if (type === 'bed') {
    facts.bed = Object.freeze({
      rule: text(definition.rule) ?? 'bed',
      colour: text(definition.colour) ?? 'white',
    });
  }
  if (type === 'torch') facts.particle = text(definition.particle) ?? 'minecraft:flame';
  return Object.freeze(facts) as Types2Facts;
}
