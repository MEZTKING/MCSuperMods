/**
 * The mobs' wandering (B393, limit L3): a seeded random walk. A mob stands for a while, then walks
 * in a random direction for a while, and stops early when a wall, a block or the edge of the area
 * stops it. Flyers pick a height above the ground below them and hold it (hovering); swimmers
 * stand still. There are no targets, no pathfinding and no goals: that is the game's AI, which
 * Try it does not run. Pure and deterministic: the same seed gives the same walk.
 */
import {
  HOVER_MAX,
  HOVER_MIN,
  IDLE_TICKS_MAX,
  IDLE_TICKS_MIN,
  WALK_TICKS_MAX,
  WALK_TICKS_MIN,
} from './constants.js';

/**
 * A small seeded random source (mulberry32): the same seed gives the same numbers on every
 * machine. Never `Math.random` (the package's rule).
 */
export class SimRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** A number from 0 (included) to 1 (excluded). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** A whole number from `min` to `max`, both included. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** A number from `min` to `max`. */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

/** Mixes a seed with a number (an entity id) into a new seed, so each mob walks its own way. */
export function mixSeed(seed: number, n: number): number {
  let h = (seed ^ Math.imul(n + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** How a wanderer moves: walking on the floor, flying, or standing still (swimmers). */
export type WanderStyle = 'walk' | 'fly' | 'still';

/** What the wander wants for one tick. */
export interface WanderIntent {
  /** The direction to go along the ground, a unit vector, or zero to stand. */
  readonly dirX: number;
  readonly dirZ: number;
  /** True while it is on a walk (false while standing). */
  readonly walking: boolean;
  /** Flyers: the height (feet) to hold; absent for the others. */
  readonly height?: number;
}

/** The wander of one mob. Call {@link next} once a tick. */
export class Wander {
  private readonly random: SimRandom;
  private readonly style: WanderStyle;
  private walkingNow = false;
  private ticksLeft: number;
  private dirX = 0;
  private dirZ = 0;
  private height: number | undefined;

  constructor(random: SimRandom, style: WanderStyle) {
    this.random = random;
    this.style = style;
    this.ticksLeft = random.int(IDLE_TICKS_MIN, IDLE_TICKS_MAX);
  }

  /** Whether it is on a walk now. */
  get walking(): boolean {
    return this.walkingNow;
  }

  /**
   * The intent for this tick.
   *
   * @param blocked - Whether the last tick's move was stopped sideways (a wall or the edge).
   * @param ground - The height of the ground below the mob (for flyers' hover height).
   */
  next(blocked: boolean, ground: number): WanderIntent {
    if (this.style === 'still') return { dirX: 0, dirZ: 0, walking: false };
    if (this.style === 'fly' && this.height === undefined) this.pickHeight(ground);
    if (this.walkingNow && blocked) {
      this.stand();
    } else if (--this.ticksLeft <= 0) {
      if (this.walkingNow) this.stand();
      else this.walk(ground);
    }
    return {
      dirX: this.walkingNow ? this.dirX : 0,
      dirZ: this.walkingNow ? this.dirZ : 0,
      walking: this.walkingNow,
      ...(this.height === undefined ? {} : { height: this.height }),
    };
  }

  private stand(): void {
    this.walkingNow = false;
    this.ticksLeft = this.random.int(IDLE_TICKS_MIN, IDLE_TICKS_MAX);
  }

  private walk(ground: number): void {
    const angle = this.random.next() * Math.PI * 2;
    this.dirX = Math.cos(angle);
    this.dirZ = Math.sin(angle);
    this.walkingNow = true;
    this.ticksLeft = this.random.int(WALK_TICKS_MIN, WALK_TICKS_MAX);
    if (this.style === 'fly') this.pickHeight(ground);
  }

  private pickHeight(ground: number): void {
    this.height = ground + this.random.range(HOVER_MIN, HOVER_MAX);
  }
}
