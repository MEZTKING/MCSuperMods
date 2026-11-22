/**
 * Weathering and waxing (ADR 0094 D8, D9): `msm:weathering { next?, stage }` makes a block age
 * into `next` on random ticks by vanilla's own chance and neighbour rule (a lower-stage
 * neighbour, project or vanilla, stops the ageing; B440 S5), and `msm:waxable { into }` names
 * the waxed copy honeycomb turns it into. The waxed copy is a block of its own without
 * `msm:weathering`, so it never ages; it names its unwaxed partner only implicitly (the
 * runtime's reverse map), and an axe turns it back.
 *
 * Lowering passes both components through to the definition, with `next` and `into` written as
 * full ids (`minecraft:` added to a bare path), so the runtime's maps and the eject's generated
 * `BlockWaxing` compare ids as written. No other file is written: ageing, waxing and scraping are
 * runtime behaviour, and vanilla keeps no tag for them.
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import { isRecord } from './paths';
import type { BlockTypeName } from './types';

/** The weathering component. */
export const WEATHERING_COMPONENT = 'msm:weathering';
/** The waxing component. */
export const WAXABLE_COMPONENT = 'msm:waxable';

/** The weathering stages in order, as copper's. */
export const WEATHERING_STAGES = Object.freeze([
  'unaffected',
  'exposed',
  'weathered',
  'oxidized',
] as const);
/** A weathering stage. */
export type WeatheringStage = (typeof WEATHERING_STAGES)[number];

/**
 * The types that take `msm:weathering` and `msm:waxable`: the eleven types vanilla's copper
 * comes in apart from bulbs (ADR 0094 D8), then the six of ADR 0104 D1 (`rod`, as the lightning
 * rod, and `button`, `pressure_plate`, `fence`, `fence_gate` and `wall`, which vanilla has no
 * copper of but which age by the same rule). Each ages through the same stage chain (`next`
 * and `stage`), keeps every state property when it ages, is waxed into its own waxed copy (a
 * block of the same type without `msm:weathering`) and is scraped back by an axe.
 */
export const WEATHERING_BLOCK_TYPES: readonly BlockTypeName[] = Object.freeze([
  'block',
  'pillar',
  'horizontal',
  'directional',
  'slab',
  'stairs',
  'door',
  'trapdoor',
  'pane',
  'chain',
  'lantern',
  'rod',
  'button',
  'pressure_plate',
  'fence',
  'fence_gate',
  'wall',
]);

/** What `msm:weathering` says, read leniently (the schema checks the shape). */
export interface WeatheringFields {
  /** The block of the next stage, when set. */
  next: string | undefined;
  /** The stage, when it is one of {@link WEATHERING_STAGES}. */
  stage: WeatheringStage | undefined;
}

const componentsOf = (data: Json | undefined): JsonObject | undefined => {
  const components = isRecord(data) ? data.components : undefined;
  return isRecord(components) ? components : undefined;
};

const nonEmpty = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/** A block id with `minecraft:` added to a bare path. */
export const fullBlockId = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

/** The `msm:weathering` component of block data, or `undefined` without one. */
export function weatheringOf(data: Json | undefined): WeatheringFields | undefined {
  const weathering = componentsOf(data)?.[WEATHERING_COMPONENT];
  if (!isRecord(weathering)) return undefined;
  const stage = weathering.stage;
  return {
    next: nonEmpty(weathering.next),
    stage: (WEATHERING_STAGES as readonly Json[]).includes(stage ?? null)
      ? (stage as WeatheringStage)
      : undefined,
  };
}

/** The `into` of the `msm:waxable` component of block data, `''` when it has none, or `undefined` without the component. */
export function waxableInto(data: Json | undefined): string | undefined {
  const waxable = componentsOf(data)?.[WAXABLE_COMPONENT];
  if (!isRecord(waxable)) return undefined;
  return nonEmpty(waxable.into) ?? '';
}

/** The stage after `stage`, or `undefined` after the last. */
export function nextWeatheringStage(stage: WeatheringStage): WeatheringStage | undefined {
  return WEATHERING_STAGES[WEATHERING_STAGES.indexOf(stage) + 1];
}

/**
 * Writes `next` of `msm:weathering` and `into` of `msm:waxable` as full ids, in place.
 *
 * @param components - The definition's `components`.
 */
export function lowerWeatheringInPlace(components: JsonObject): void {
  const weathering = components[WEATHERING_COMPONENT];
  if (isRecord(weathering) && typeof weathering.next === 'string' && weathering.next !== '') {
    weathering.next = fullBlockId(weathering.next);
  }
  const waxable = components[WAXABLE_COMPONENT];
  if (isRecord(waxable) && typeof waxable.into === 'string' && waxable.into !== '') {
    waxable.into = fullBlockId(waxable.into);
  }
}
