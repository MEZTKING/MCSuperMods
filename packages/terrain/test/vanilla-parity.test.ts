/**
 * ADR 0119 D13's vanilla step (plan briefs B579, B581): MSM's own test dimensions over vanilla's
 * own noise settings (`fixtures/worldgen-parity/vanilla/`), measured on the real game by the parity
 * build's `worldgenVanilla` task into a file that is never committed, played through the engine
 * with the vanilla files of the Loom cache's client jar of the same Minecraft version.
 *
 * Runs only with `MSM_WORLDGEN_VANILLA=<measured file>` and that jar (the `engine-mod` CI job);
 * skipped everywhere else. Reports every rate; fails only below D13's floor for this step: biome
 * cells 99.5 % (on a target whose biome layout is not approximate, not the End), cells of the
 * same class 98 % and surface height exact 85 % (not the End). The End is reported, not gated,
 * while the target says it is approximate. The measured chunks (the `terrain` status) hold the
 * carvers' caves and structures' land changes, which the preview does not draw (D6, WL4, WL15):
 * the Nether's cave carver opens about 3 % of its cells, so the Nether's cells are reported
 * (`CELLS_REPORTED`); its heights are gated.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WorldgenFileMap } from '../src/api';
import {
  emptyScore,
  FIXTURE,
  pct,
  rates,
  type Score,
  scoreDimension,
  targetFacts,
} from './parity-fixture';
import { loomJars, readJarWorldgen } from './vanilla-jar';

const FLOORS = { biomes: 0.995, cells: 0.98, heightExact: 0.85 };

/** Test dimensions whose cells are reported, not gated, and why. */
const CELLS_REPORTED: Readonly<Record<string, string>> = {
  'worldgen_vanilla:nether_wastes':
    "the Nether's cave carver opens cells the preview leaves solid (carvers are not drawn, WL4)",
};

interface Measured {
  readonly format: number;
  readonly target: string;
  readonly minecraft?: string;
  readonly dimensions: Readonly<Record<string, Parameters<typeof scoreDimension>[3]>>;
}

const path = process.env.MSM_WORLDGEN_VANILLA;
const measured: Measured | undefined =
  path && existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Measured) : undefined;
const jar = measured ? loomJars().find((j) => j.version === measured.minecraft) : undefined;

/** The test dimensions, as the project files of the engine's input. */
function testDimensions(): WorldgenFileMap {
  const root = join(FIXTURE, 'vanilla', 'data');
  const dimension: Record<string, unknown> = {};
  for (const ns of readdirSync(root)) {
    const dir = join(root, ns, 'dimension');
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      dimension[`${ns}:${name.slice(0, -5)}`] = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    }
  }
  return { dimension };
}

describe.skipIf(!measured || !jar)('vanilla settings against the real game (ADR 0119 D13)', () => {
  // The body is collected even when skipped: nothing here may need the measurements or the jar.
  const m: Measured = measured ?? { format: 0, target: '', dimensions: {} };
  const vanilla = jar ? readJarWorldgen(jar.path) : {};
  const project = measured ? testDimensions() : {};
  const facts = measured ? targetFacts(m.target) : { dataFolders: [], approximate: [] };
  const total = emptyScore();

  it('measured every test dimension, format 1', () => {
    expect(m.format).toBe(1);
    expect(Object.keys(m.dimensions).sort()).toEqual(Object.keys(project.dimension ?? {}).sort());
  });

  for (const [id, dim] of Object.entries(m.dimensions)) {
    it(`${id} stays above the vanilla step's floor`, () => {
      const score: Score = scoreDimension({ ...vanilla, ...project }, facts, id, dim);
      for (const key of Object.keys(total) as (keyof Score)[]) {
        if (typeof total[key] === 'number' && !id.endsWith(':end')) {
          (total[key] as number) += score[key] as number;
        }
      }
      const r = rates(score);
      const end = id.endsWith(':end');
      const endReported = end && facts.approximate.includes('end');
      const json = project.dimension?.[id] as {
        generator?: { biome_source?: { type?: string } };
      };
      const source = (json.generator?.biome_source?.type ?? '').replace(/^minecraft:/, '');
      const biomesReported =
        endReported || (facts.approximate.includes('biome_layout') && source !== 'fixed');
      const cellsWhy = endReported ? 'the End' : CELLS_REPORTED[id];
      console.log(
        `vanilla ${m.target} ${id}: biomes ${pct(r.biomes)}${biomesReported ? ' (reported)' : ''}, cells ${pct(r.cells)}${cellsWhy ? ` (reported: ${cellsWhy})` : ''}, height exact ${pct(r.heightExact)}, within one ${pct(r.heightNear)}, top four ${pct(r.top4)} (reported)${endReported ? '; the End is reported' : ''}${score.unsupported.length ? `; notes: ${[...new Set(score.unsupported.map((u) => u.type))].join(', ')}` : ''}`,
      );
      if (!biomesReported) expect(r.biomes).toBeGreaterThanOrEqual(FLOORS.biomes);
      if (!cellsWhy) expect(r.cells).toBeGreaterThanOrEqual(FLOORS.cells);
      if (!endReported) expect(r.heightExact).toBeGreaterThanOrEqual(FLOORS.heightExact);
    });
  }

  it('reports the whole target (the End left out)', () => {
    const r = rates(total);
    console.log(
      `vanilla ${m.target} all but the End: biomes ${pct(r.biomes)}, cells ${pct(r.cells)}, height exact ${pct(r.heightExact)}, within one ${pct(r.heightNear)}, top four ${pct(r.top4)}`,
    );
    expect(total.columns).toBeGreaterThan(0);
  });
});
