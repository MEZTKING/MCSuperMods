import { describe, expect, it } from 'vitest';
import { IDLE_TICKS_MAX, mixSeed, SimRandom, Wander } from '../../src/index.js';

describe('seeded random', () => {
  it('repeats for a seed and differs between seeds', () => {
    const a = new SimRandom(42);
    const b = new SimRandom(42);
    const c = new SimRandom(43);
    const seqA = Array.from({ length: 20 }, () => a.next());
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(seqA);
    expect(Array.from({ length: 20 }, () => c.next())).not.toEqual(seqA);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('keeps whole numbers in range', () => {
    const r = new SimRandom(7);
    for (let i = 0; i < 500; i++) {
      const n = r.int(3, 5);
      expect([3, 4, 5]).toContain(n);
    }
  });

  it('mixes seeds per entity', () => {
    expect(mixSeed(1, 1)).toBe(mixSeed(1, 1));
    expect(mixSeed(1, 1)).not.toBe(mixSeed(1, 2));
    expect(mixSeed(1, 1)).not.toBe(mixSeed(2, 1));
  });
});

describe('wander', () => {
  it('stands first, then walks a unit direction, and stops when blocked', () => {
    const wander = new Wander(new SimRandom(5), 'walk');
    let first = -1;
    for (let t = 0; t <= IDLE_TICKS_MAX; t++) {
      const intent = wander.next(false, 0);
      if (intent.walking) {
        first = t;
        expect(Math.hypot(intent.dirX, intent.dirZ)).toBeCloseTo(1);
        break;
      }
      expect(intent.dirX).toBe(0);
    }
    expect(first).toBeGreaterThan(0);
    expect(wander.next(true, 0).walking).toBe(false);
  });

  it('never moves a still wanderer', () => {
    const wander = new Wander(new SimRandom(5), 'still');
    for (let t = 0; t < 600; t++)
      expect(wander.next(false, 0)).toEqual({ dirX: 0, dirZ: 0, walking: false });
  });

  it('gives flyers a height above the ground', () => {
    const wander = new Wander(new SimRandom(9), 'fly');
    const height = wander.next(false, 3).height as number;
    expect(height).toBeGreaterThanOrEqual(4.5);
    expect(height).toBeLessThanOrEqual(7);
  });
});
