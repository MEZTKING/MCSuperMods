/**
 * The features' own random sequence (ADR 0119 D6: features stand "about there" with MSM's own
 * random sequence, not the game's). A small 32-bit generator (sfc32), seeded per world, chunk,
 * decoration step and feature by mixing the numbers through a 32-bit finaliser, so the same seed
 * gives the same placements in any window. It answers deepslate's `Random` calls that deepslate's
 * height providers make (`nextInt`, `nextFloat`, `nextDouble`).
 */

import type { PositionalRandom, Random } from 'deepslate/worldgen';

/** A 32-bit finaliser: spreads the bits of `h` (an integer) over the whole word. */
export function mix32(h: number): number {
  let x = h | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x | 0;
}

/** Mixes a list of integers into one 32-bit word. */
export function mixAll(parts: readonly number[]): number {
  let h = 0x9e3779b9 | 0;
  for (const p of parts) h = mix32((h ^ (p | 0)) + 0x632be5ab);
  return h;
}

/** The world seed as two 32-bit words. */
export function seedWords(seed: bigint): [number, number] {
  const s = BigInt.asUintN(64, seed);
  return [Number(s & 0xffffffffn) | 0, Number((s >> 32n) & 0xffffffffn) | 0];
}

/** The features' random: sfc32 over four words. */
export class FeatureRandom implements Random {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number, salt = 0) {
    this.a = mix32(seed ^ 0x2545f491);
    this.b = mix32(seed + 0x6a09e667);
    this.c = mix32(salt ^ 0x3c6ef372);
    this.d = 1;
    for (let i = 0; i < 12; i += 1) this.next32();
  }

  /** A new random for one feature of one chunk and step. */
  static forFeature(
    world: readonly [number, number],
    chunkX: number,
    chunkZ: number,
    step: number,
    index: number,
  ): FeatureRandom {
    return new FeatureRandom(
      mixAll([world[0], world[1], chunkX, chunkZ]),
      mixAll([step, index, world[1]]),
    );
  }

  private next32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  consume(count: number): void {
    for (let i = 0; i < count; i += 1) this.next32();
  }

  /** An integer from 0 (inclusive) to `max` (exclusive); 0 when `max` is not above 0. */
  nextInt(max?: number): number {
    if (max === undefined) return this.next32() | 0;
    if (!(max > 0)) return 0;
    return Math.floor((this.next32() / 4294967296) * max);
  }

  /** An integer from `min` to `max`, both inclusive. */
  between(min: number, max: number): number {
    if (max <= min) return min;
    return min + this.nextInt(max - min + 1);
  }

  nextLong(): bigint {
    return (BigInt(this.next32()) << 32n) | BigInt(this.next32());
  }

  nextFloat(): number {
    return (this.next32() >>> 8) / 16777216;
  }

  nextDouble(): number {
    return (this.next32() * 2097152 + (this.next32() >>> 11)) / 9007199254740992;
  }

  nextBoolean(): boolean {
    return (this.next32() & 1) === 1;
  }

  /** A normal number (mean 0, deviation 1), by Box and Muller. */
  nextGaussian(): number {
    const u = Math.max(this.nextDouble(), 1e-12);
    const v = this.nextDouble();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  fork(): FeatureRandom {
    return new FeatureRandom(this.next32() | 0, this.next32() | 0);
  }

  forkPositional(): PositionalRandom {
    const base = this.next32() | 0;
    return {
      at: (x, y, z) => new FeatureRandom(mixAll([base, x, y, z])),
      fromHashOf: (name) => {
        let h = base;
        for (let i = 0; i < name.length; i += 1) h = mix32(h ^ name.charCodeAt(i));
        return new FeatureRandom(h);
      },
      seedKey: () => [BigInt(base), 0n],
    };
  }
}
