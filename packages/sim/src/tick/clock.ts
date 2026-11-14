/**
 * The Try it clock (B391): 20 ticks a second, as the game runs, with pause, a single step and a
 * speed for the fast clock (ADR 0085 L9). The caller passes the time that went by, so the clock
 * stays deterministic: no `Date`, no timers of its own.
 */

import { TICKS_PER_SECOND } from '../player/constants.js';

/** The length of one tick in milliseconds at normal speed. */
export const TICK_MS = 1000 / TICKS_PER_SECOND;
/**
 * The most ticks one {@link SimClock.advance} runs. After a long stall (a hidden window, a
 * breakpoint) the clock drops the rest instead of racing to catch up.
 */
export const MAX_CATCH_UP_TICKS = 10;
/** The speeds the clock accepts, slowest and fastest. */
export const MIN_CLOCK_SPEED = 0.25;
export const MAX_CLOCK_SPEED = 8;

/** Called once for every tick the clock runs, with that tick's number (1 for the first). */
export type TickListener = (tick: number) => void;

/** Counts ticks from elapsed time and runs one listener per tick. */
export class SimClock {
  private ticks = 0;
  private carry = 0;
  private stopped = false;
  private rate = 1;

  private readonly onTick: TickListener;

  constructor(onTick: TickListener) {
    this.onTick = onTick;
  }

  /** The number of ticks run so far. */
  get tick(): number {
    return this.ticks;
  }

  /** Whether the clock is paused. */
  get paused(): boolean {
    return this.stopped;
  }

  /** The speed: 1 is the game's own, 2 twice as fast. */
  get speed(): number {
    return this.rate;
  }

  /**
   * How far the time is between the last tick and the next, from 0 to 1, for drawing moving
   * things in between ticks. 0 while paused.
   */
  get alpha(): number {
    return this.stopped ? 0 : Math.min(1, this.carry / TICK_MS);
  }

  /** Stops ticking; {@link step} still runs single ticks. */
  pause(): void {
    this.stopped = true;
    this.carry = 0;
  }

  /** Starts ticking again from now. */
  resume(): void {
    this.stopped = false;
    this.carry = 0;
  }

  /** Sets the speed, clamped to {@link MIN_CLOCK_SPEED}..{@link MAX_CLOCK_SPEED}. */
  setSpeed(speed: number): void {
    const finite = Number.isFinite(speed) ? speed : 1;
    this.rate = Math.min(MAX_CLOCK_SPEED, Math.max(MIN_CLOCK_SPEED, finite));
  }

  /**
   * Lets `elapsedMs` milliseconds go by and runs the ticks that fall due, at most
   * {@link MAX_CATCH_UP_TICKS}. Returns how many ran; none while paused.
   */
  advance(elapsedMs: number): number {
    if (this.stopped || !(elapsedMs > 0)) return 0;
    this.carry += elapsedMs * this.rate;
    let due = Math.floor(this.carry / TICK_MS);
    this.carry -= due * TICK_MS;
    if (due > MAX_CATCH_UP_TICKS) {
      due = MAX_CATCH_UP_TICKS;
      this.carry = 0;
    }
    for (let i = 0; i < due; i++) this.runTick();
    return due;
  }

  /** Runs exactly one tick now, paused or not (the Step button). */
  step(): void {
    this.runTick();
  }

  /** Back to tick 0, running at normal speed. */
  reset(): void {
    this.ticks = 0;
    this.carry = 0;
    this.stopped = false;
    this.rate = 1;
  }

  private runTick(): void {
    this.ticks += 1;
    this.onTick(this.ticks);
  }
}
