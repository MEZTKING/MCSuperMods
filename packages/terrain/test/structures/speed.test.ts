/**
 * The speed of spike question 4S7 for the assembler (B637): a 100-piece assembly and the 341-piece
 * case, timed in Node with the times printed. The only limits are ADR 0122 D10's budget (100
 * pieces within 2 s, the first piece within 250 ms); CI runs some 5.7 times slower than a desk.
 */

import { describe, expect, it } from 'vitest';
import type { AssemblyInput } from '../../src/structures/api';
import { assemble, assembleSteps } from '../../src/structures/assemble';
import { fixtureWorld } from './fixtures';

const world = fixtureWorld();
let seed = 0n;

/** A new seed for every run. */
function nextSeed(): bigint {
  seed += 1n;
  return seed;
}

function time(
  label: string,
  input: () => AssemblyInput,
  runs: number,
): { median: number; worst: number; pieces: number } {
  const times: number[] = [];
  let pieces = 0;
  for (let i = 0; i < runs; i += 1) {
    const inp = input();
    const t0 = performance.now();
    pieces = assemble(inp).pieces.length;
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)] as number;
  const worst = times.at(-1) as number;
  console.log(
    `[B637 speed] ${label}: ${pieces} pieces, median ${median.toFixed(2)} ms, worst ${worst.toFixed(2)} ms over ${runs}`,
  );
  return { median, worst, pieces };
}

function firstPiece(input: AssemblyInput): number {
  const t0 = performance.now();
  for (const step of assembleSteps(input)) if (step.kind === 'placed') break;
  return performance.now() - t0;
}

describe('4S7 speed', () => {
  it('100 pieces (the 841-lattice stopped at 100) and the first piece', () => {
    const input = () =>
      world.input(
        { startPool: 'fx:start_grid', size: 20, maxDistanceFromCenter: 116 },
        nextSeed(),
        { pieceLimit: 100 },
      );
    const r = time('lattice to 100', input, 30);
    expect(r.pieces).toBe(100);
    expect(r.worst).toBeLessThan(2000);
    const first = firstPiece(input());
    console.log(`[B637 speed] first piece after ${first.toFixed(3)} ms`);
    expect(first).toBeLessThan(250);
  });

  it('the 113-piece lattice of the spike', () => {
    const r = time(
      'lattice 113',
      () =>
        world.input(
          { startPool: 'fx:start_grid', size: 7, maxDistanceFromCenter: 116 },
          nextSeed(),
        ),
      30,
    );
    expect(r.pieces).toBe(113);
  });

  it('a town of streets and houses (about a plains village: 55 to 170 pieces, about 129 on average)', () => {
    const r = time(
      'town',
      () => world.input({ startPool: 'fx:town', size: 6, maxDistanceFromCenter: 40 }, nextSeed()),
      50,
    );
    expect(r.worst).toBeLessThan(2000);
  });

  it('the 341-piece case (a 3D lattice the size of the largest trial chambers)', () => {
    const r = time(
      '3D lattice 341',
      () =>
        world.input(
          {
            startPool: 'fx:start_cube',
            size: 6,
            maxDistanceFromCenter: { horizontal: 24, vertical: 24 },
          },
          nextSeed(),
        ),
      20,
    );
    expect(r.pieces).toBe(341);
    expect(r.worst).toBeLessThan(2000 * 3.41);
  });

  it('the 841-piece lattice and its 500-piece stop', () => {
    const full = time(
      'lattice 841',
      () =>
        world.input(
          { startPool: 'fx:start_grid', size: 20, maxDistanceFromCenter: 116 },
          nextSeed(),
          { pieceLimit: 1000 },
        ),
      10,
    );
    expect(full.pieces).toBe(841);
    const cut = time(
      'lattice stopped at 500',
      () =>
        world.input(
          { startPool: 'fx:start_grid', size: 20, maxDistanceFromCenter: 116 },
          nextSeed(),
        ),
      10,
    );
    expect(cut.pieces).toBe(500);
  });
});
