/**
 * Weathering (B463, ADR 0094 D7, B449 notes): blocks with `msm:weathering` age one stage at a
 * time (`unaffected`, `exposed`, `weathered`, `oxidized`) into their `next` block, on random
 * ticks, at copper's rate as the runtime measured it beside vanilla copper:
 *
 * - on a random tick the block tries to age with the chance {@link AGEING_TRY} (64 in 1125);
 * - it looks at the other weathering blocks within {@link SCAN_DISTANCE} blocks (counted along
 *   the three axes together): **one at a lower stage stops it**; otherwise, with `same` of its
 *   own stage and `older` at a later one, it ages with `((older + 1) / (same + older + 1))²`
 *   of that try, and three quarters of it at the first stage (B449 measured 0.0436 alone at
 *   `unaffected`, 0.0576 at `exposed`, 0 beside a lower stage and 0.00275 among three of its own
 *   stage).
 *
 * In the area this runs on the clock's random ticks ({@link WeatheringField.tick}, the odds of
 * `RANDOM_TICK_ODDS`, so a stage takes about half an hour of real time), and in a time-lapse
 * ({@link WeatheringField.timeLapse}): the random ticks a whole in-game day gives every block, at
 * once. Waxed blocks are plain blocks and never age (B451); honeycomb and the axe are only in the
 * game (said by the local source).
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import type { BlockPos, BlockState } from '../types.js';
import type { SimWorld } from '../world/sim-world.js';
import type { BlockCatalogue } from './catalogue.js';
import type { BlockChange } from './neighbours.js';

/** The weathering stages in order (ADR 0094 D7). */
export const WEATHERING_STAGES = Object.freeze([
  'unaffected',
  'exposed',
  'weathered',
  'oxidized',
] as const);

/** A block's weathering, from `msm:weathering` and `msm:waxable`. */
export interface WeatheringFacts {
  /** Its stage. */
  readonly stage: (typeof WEATHERING_STAGES)[number];
  /** The block it ages into; none at the last stage. */
  readonly next?: string;
  /** The waxed copy honeycomb turns it into, when `msm:waxable` is set. */
  readonly waxInto?: string;
}

/** The chance a random tick tries to age a block (64 in 1125). */
export const AGEING_TRY = 64 / 1125;
/** The part of {@link AGEING_TRY} at the first stage. */
export const FIRST_STAGE_MODIFIER = 0.75;
/** How far the neighbour rule looks, along the three axes together. */
export const SCAN_DISTANCE = 4;
/** One in-game day in ticks: what one time-lapse step stands for. */
export const TIME_LAPSE_TICKS = 24000;
/** The odds a block gets a random tick in a tick (the game's default speed of 3 a section). */
export const WEATHERING_RANDOM_TICK_ODDS = 3 / 4096;

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The weathering of a lowered block definition, or `undefined` without `msm:weathering`. */
export function weatheringOf(definition: JsonObject): WeatheringFacts | undefined {
  const components = isRecord(definition.components) ? definition.components : {};
  const weathering = components['msm:weathering'];
  if (!isRecord(weathering)) return undefined;
  const stage = weathering.stage;
  if (typeof stage !== 'string' || !(WEATHERING_STAGES as readonly string[]).includes(stage)) {
    return undefined;
  }
  const waxable = components['msm:waxable'];
  const next = typeof weathering.next === 'string' ? weathering.next : undefined;
  const into = isRecord(waxable) && typeof waxable.into === 'string' ? waxable.into : undefined;
  return Object.freeze({
    stage: stage as WeatheringFacts['stage'],
    ...(next === undefined ? {} : { next }),
    ...(into === undefined ? {} : { waxInto: into }),
  });
}

const stageIndex = (facts: WeatheringFacts): number => WEATHERING_STAGES.indexOf(facts.stage);

/**
 * The chance one random tick ages the block at `pos` (the neighbour rule above): 0 when it does
 * not weather, is at its last stage, or a weathering block of a lower stage is near.
 */
export function ageingChance(world: SimWorld, catalogue: BlockCatalogue, pos: BlockPos): number {
  const state = world.get(pos);
  const facts = state === null ? undefined : catalogue.blockFor(state.name)?.weathering;
  if (facts?.next === undefined) return 0;
  const own = stageIndex(facts);
  let same = 0;
  let older = 0;
  const d = SCAN_DISTANCE;
  for (let dy = -d; dy <= d; dy++) {
    for (let dz = -d; dz <= d; dz++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > d) continue;
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const near = world.get({ x: pos.x + dx, y: pos.y + dy, z: pos.z + dz });
        if (near === null) continue;
        const other = catalogue.blockFor(near.name)?.weathering;
        if (other === undefined) continue;
        const stage = stageIndex(other);
        if (stage < own) return 0;
        if (stage > own) older += 1;
        else same += 1;
      }
    }
  }
  const ratio = (older + 1) / (same + older + 1);
  return AGEING_TRY * ratio * ratio * (own === 0 ? FIRST_STAGE_MODIFIER : 1);
}

/** The next stage's state, keeping the properties both blocks share (a stair's facing). */
export function agedState(
  catalogue: BlockCatalogue,
  state: BlockState,
  next: string,
): BlockState | undefined {
  const target = catalogue.blockFor(next);
  if (target === undefined) return undefined;
  return catalogue.withProperties(target.defaultState, state.properties);
}

/** A number from 0 (inclusive) to 1. */
export type Random = () => number;

/** What a round of ageing did. */
export interface AgeingResult {
  /** Blocks set, in order (each block on its own: a door's halves are not kept together). */
  readonly changes: readonly BlockChange[];
  /** How many blocks aged into each block id. */
  readonly aged: ReadonlyMap<string, number>;
  /** Blocks that could not age because a lower stage is near, by block id. */
  readonly held: ReadonlyMap<string, number>;
}

const posKey = (pos: BlockPos): string => `${pos.x},${pos.y},${pos.z}`;

/** The weathering blocks of an area and their ageing; see the module comment. */
export class WeatheringField {
  private readonly world: SimWorld;
  private catalogue: BlockCatalogue;
  private readonly tracked = new Map<string, BlockPos>();

  constructor(world: SimWorld, catalogue: BlockCatalogue) {
    this.world = world;
    this.catalogue = catalogue;
    world.onChange((change) => this.track(change.pos, change.state));
    for (const { pos, state } of world.blocks()) this.track(pos, state);
  }

  /** How many weathering blocks the area holds. */
  get count(): number {
    return this.tracked.size;
  }

  /** Takes a new catalogue after a live edit. */
  setCatalogue(catalogue: BlockCatalogue): void {
    this.catalogue = catalogue;
    this.tracked.clear();
    for (const { pos, state } of this.world.blocks()) this.track(pos, state);
  }

  /** Forgets every block (the area was cleared). */
  clear(): void {
    this.tracked.clear();
  }

  /** One tick: each weathering block gets a random tick with the game's odds. */
  tick(random: Random): AgeingResult {
    return this.round(random, () => (random() < WEATHERING_RANDOM_TICK_ODDS ? 1 : 0));
  }

  /**
   * A time-lapse step: every weathering block gets the random ticks of `ticks` game ticks (one
   * in-game day by default), drawn from the odds, and may age once per step. The neighbour rule
   * reads the area as it was at the start of the step.
   */
  timeLapse(random: Random, ticks: number = TIME_LAPSE_TICKS): AgeingResult {
    const expected = ticks * WEATHERING_RANDOM_TICK_ODDS;
    return this.round(random, () => {
      // A Poisson draw of the random ticks the block gets.
      let k = 0;
      let p = Math.exp(-expected);
      let sum = p;
      const u = random();
      while (u > sum && k < 1000) {
        k += 1;
        p *= expected / k;
        sum += p;
      }
      return k;
    });
  }

  private round(random: Random, randomTicks: () => number): AgeingResult {
    const due: { pos: BlockPos; state: BlockState; next: string }[] = [];
    const held = new Map<string, number>();
    for (const pos of [...this.tracked.values()]) {
      const ticks = randomTicks();
      if (ticks === 0) continue;
      const state = this.world.get(pos);
      const facts = state === null ? undefined : this.catalogue.blockFor(state.name)?.weathering;
      if (state === null || facts?.next === undefined) continue;
      const chance = ageingChance(this.world, this.catalogue, pos);
      if (chance === 0) {
        held.set(state.name, (held.get(state.name) ?? 0) + 1);
        continue;
      }
      const odds = 1 - (1 - chance) ** ticks;
      if (random() < odds) due.push({ pos, state, next: facts.next });
    }
    const changes: BlockChange[] = [];
    const aged = new Map<string, number>();
    for (const one of due) {
      const next = agedState(this.catalogue, one.state, one.next);
      if (next === undefined || !this.world.set(one.pos, next)) continue;
      changes.push({ pos: one.pos, state: next });
      aged.set(one.next, (aged.get(one.next) ?? 0) + 1);
    }
    return { changes, aged, held };
  }

  private track(pos: BlockPos, state: BlockState | null): void {
    const key = posKey(pos);
    const facts = state === null ? undefined : this.catalogue.blockFor(state.name)?.weathering;
    if (facts?.next !== undefined) this.tracked.set(key, pos);
    else this.tracked.delete(key);
  }
}
