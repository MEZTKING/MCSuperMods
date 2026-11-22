/**
 * The worldgen parity test (ADR 0119 D13; plan brief B581): `fixtures/worldgen-parity`'s
 * expectations, measured on the real game by B579's `WorldgenParityTest`, played through the
 * engine on both targets with the fixture's own files (`vanilla: null`).
 *
 * Floors (D13, as amended after B574): biome cells 99.5 %; cells of the same class 99 %; surface
 * height exact 95 % and within one block 98 %; the top four blocks 95 % where the heights match.
 * Reported, not gated (each with its reason, printed with `TERRAIN_PARITY=1`):
 * - biome cells of a dimension whose biome source is not `fixed`, on a target whose biome layout
 *   is approximate (`terrainPreview.approximate` has `biome_layout`): the newer target stores
 *   biomes moved a cell or two at borders, for its checkerboards too (B581);
 * - the top four blocks of a dimension whose world names a type the engine draws only about right
 *   (its `unsupported()` note says "About right"), and of `rules_biome` (`TOP_FOUR_REPORTED`).
 * Every other note in `unsupported()` fails the test: every fixture dimension is drawn.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  emptyScore,
  FIXTURE,
  loweredFiles,
  pct,
  rates,
  readExpectations,
  type Score,
  scoreDimension,
  targetFacts,
} from './parity-fixture';

const FLOORS = { biomes: 0.995, cells: 0.99, heightExact: 0.95, heightNear: 0.98, top4: 0.95 };

/** Dimensions whose top four blocks are reported, not gated, and why. */
const TOP_FOUR_REPORTED: Readonly<Record<string, string>> = {
  'worldgen_parity:rules_biome':
    "near a biome border the game reads a biome condition's biome from a nearby cell, in all three directions; not learned (B581)",
};

const expectations = readExpectations();
const report = process.env.TERRAIN_PARITY === '1';

function biomeSourceType(target: string, id: string): string {
  const [ns, path] = id.split(':') as [string, string];
  const file = join(FIXTURE, target, 'lowered', 'data', ns, 'dimension', `${path}.json`);
  const json = JSON.parse(readFileSync(file, 'utf8')) as {
    generator?: { type?: string; biome_source?: { type?: string } };
  };
  if (json.generator?.type?.endsWith('flat')) return 'flat';
  return (json.generator?.biome_source?.type ?? '').replace(/^minecraft:/, '');
}

describe('worldgen parity fixture (ADR 0119 D13)', () => {
  it('is format 1 with three seeds', () => {
    expect(expectations.format).toBe(1);
    expect(expectations.seeds).toHaveLength(3);
  });

  for (const [target, section] of Object.entries(expectations.targets)) {
    describe(target, () => {
      const files = loweredFiles(target);
      const facts = targetFacts(target);
      const total = emptyScore();
      for (const [id, dim] of Object.entries(section.dimensions)) {
        it(`${id} meets the floors`, () => {
          const score: Score = scoreDimension(files, facts, id, dim);
          for (const key of Object.keys(total) as (keyof Score)[]) {
            if (typeof total[key] === 'number') {
              (total[key] as number) += score[key] as number;
            }
          }
          const r = rates(score);
          const source = biomeSourceType(target, id);
          const biomesReported =
            facts.approximate.includes('biome_layout') && source !== 'fixed' && source !== 'flat';
          const aboutRight = score.unsupported.filter((u) =>
            u.drawnInstead.startsWith('About right'),
          );
          const others = score.unsupported.filter((u) => !u.drawnInstead.startsWith('About right'));
          const topFourWhy =
            TOP_FOUR_REPORTED[id] ??
            (aboutRight.length > 0
              ? `drawn about right: ${[...new Set(aboutRight.map((u) => u.type))].join(', ')}`
              : undefined);
          if (report) {
            console.log(
              `${target} ${id}: biomes ${pct(r.biomes)}${biomesReported ? ' (reported)' : ''}, cells ${pct(r.cells)}, height exact ${pct(r.heightExact)}, within one ${pct(r.heightNear)}, top four ${pct(r.top4)}${topFourWhy ? ` (reported: ${topFourWhy})` : ''}`,
            );
          }
          expect(others.map((u) => `${u.type} (${u.where})`)).toEqual([]);
          if (!biomesReported) expect(r.biomes).toBeGreaterThanOrEqual(FLOORS.biomes);
          expect(r.cells).toBeGreaterThanOrEqual(FLOORS.cells);
          expect(r.heightExact).toBeGreaterThanOrEqual(FLOORS.heightExact);
          expect(r.heightNear).toBeGreaterThanOrEqual(FLOORS.heightNear);
          if (!topFourWhy) expect(r.top4).toBeGreaterThanOrEqual(FLOORS.top4);
        });
      }
      it('reports the whole target', () => {
        if (report) {
          const r = rates(total);
          console.log(
            `${target} all: biomes ${pct(r.biomes)}, cells ${pct(r.cells)}, height exact ${pct(r.heightExact)}, within one ${pct(r.heightNear)}, top four ${pct(r.top4)}`,
          );
        }
        expect(total.columns).toBeGreaterThan(0);
      });
    });
  }
});
