import { describe, expect, it } from 'vitest';
import { MAX_CATCH_UP_TICKS, SimClock, TICK_MS, TICKS_PER_SECOND } from '../../src/index.js';

function counting(): { clock: SimClock; ticks: number[] } {
  const ticks: number[] = [];
  return { clock: new SimClock((tick) => ticks.push(tick)), ticks };
}

describe('SimClock', () => {
  it('runs 20 ticks a second', () => {
    const { clock, ticks } = counting();
    expect(TICKS_PER_SECOND).toBe(20);
    for (let i = 0; i < 60; i++) clock.advance(1000 / 60);
    expect(clock.tick).toBe(20);
    expect(ticks).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('keeps the remainder between calls and reports the time in between ticks', () => {
    const { clock } = counting();
    expect(clock.advance(TICK_MS * 0.5)).toBe(0);
    expect(clock.alpha).toBeCloseTo(0.5);
    expect(clock.advance(TICK_MS * 0.75)).toBe(1);
    expect(clock.alpha).toBeCloseTo(0.25);
  });

  it('pauses, steps one tick at a time and resumes', () => {
    const { clock, ticks } = counting();
    clock.advance(TICK_MS * 3);
    clock.pause();
    expect(clock.paused).toBe(true);
    expect(clock.advance(1000)).toBe(0);
    clock.step();
    clock.step();
    expect(ticks).toEqual([1, 2, 3, 4, 5]);
    clock.resume();
    expect(clock.advance(TICK_MS)).toBe(1);
    expect(clock.tick).toBe(6);
  });

  it('runs faster with a higher speed and drops a long stall', () => {
    const { clock } = counting();
    clock.setSpeed(4);
    expect(clock.advance(TICK_MS)).toBe(4);
    clock.setSpeed(1000);
    expect(clock.speed).toBe(8);
    clock.setSpeed(1);
    expect(clock.advance(60_000)).toBe(MAX_CATCH_UP_TICKS);
    expect(clock.alpha).toBe(0);
    clock.reset();
    expect(clock.tick).toBe(0);
  });

  it('ignores time that is not positive', () => {
    const { clock } = counting();
    expect(clock.advance(-5)).toBe(0);
    expect(clock.advance(Number.NaN)).toBe(0);
    expect(clock.tick).toBe(0);
  });
});
