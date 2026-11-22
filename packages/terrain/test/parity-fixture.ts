/**
 * Test helper: plays `fixtures/worldgen-parity/expectations.json` (format 1, measured on the real
 * game by B579's `WorldgenParityTest`) through the engine and scores it at ADR 0119 D13's measures.
 * The fixture's files are MSM's own (`<target>/lowered/data/`), so no jar is read: every world is
 * played with `vanilla: null`.
 *
 * Measures, per dimension and over its three seeds:
 * - biome cells: the stored biome of each quart cell against the engine's biome source;
 * - cells of the same class (solid, water, lava, air) over every block of the 100 columns;
 * - surface height: the highest solid block, exact and within one block;
 * - top four: where the heights are equal, the four blocks from the top solid one down (block names,
 *   properties left out) are the same.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { TerrainTargetFacts, Unsupported, WorldgenFileMap } from '../src/api';
import { buildColumns, createTerrainWorld, sampleBiomes } from '../src/api';

export const FIXTURE = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'worldgen-parity');
const TARGETS = join(import.meta.dirname, '..', '..', 'targets');

/** One dimension of one target in `expectations.json`. */
interface DimensionExpectations {
  readonly minY: number;
  readonly height: number;
  readonly columns: readonly (readonly [number, number])[];
  readonly biomeCells: readonly (readonly [number, number, number])[];
  readonly blocks: readonly string[];
  readonly biomes: readonly string[];
  readonly seeds: Readonly<
    Record<string, { readonly biomes: readonly number[]; readonly columns: readonly number[][] }>
  >;
}

interface Expectations {
  readonly format: number;
  readonly seeds: readonly string[];
  readonly targets: Readonly<
    Record<string, { readonly dimensions: Readonly<Record<string, DimensionExpectations>> }>
  >;
}

/** The folders of a data pack the engine reads, by key (as the jar cache's `WorldgenFileMap`). */
const FOLDERS = [
  'worldgen/noise_settings',
  'worldgen/density_function',
  'worldgen/noise',
  'worldgen/material_rule',
  'worldgen/material_condition',
  'worldgen/biome',
  'worldgen/world_preset',
  'worldgen/multi_noise_biome_source_parameter_list',
  'worldgen/flat_level_generator_preset',
  'dimension_type',
  'dimension',
  'tags/worldgen/biome',
];

export function readExpectations(): Expectations {
  return JSON.parse(readFileSync(join(FIXTURE, 'expectations.json'), 'utf8')) as Expectations;
}

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith('.json')) out.push(path);
  }
  return out;
}

/** A target's lowered data pack as the engine's file map. */
export function loweredFiles(target: string): WorldgenFileMap {
  const root = join(FIXTURE, target, 'lowered', 'data');
  const out: Record<string, Record<string, unknown>> = {};
  for (const path of walk(root, [])) {
    const parts = relative(root, path).split(sep);
    const ns = parts[0] as string;
    const rest = parts
      .slice(1)
      .join('/')
      .replace(/\.json$/, '');
    const folder = FOLDERS.filter((f) => rest.startsWith(`${f}/`)).sort(
      (a, b) => b.length - a.length,
    )[0];
    if (!folder) continue;
    const files = out[folder] ?? {};
    out[folder] = files;
    files[`${ns}:${rest.slice(folder.length + 1)}`] = JSON.parse(readFileSync(path, 'utf8'));
  }
  return out;
}

/**
 * The target's `worldgen.terrainPreview.approximate` fact, read from its source in
 * `packages/targets` (the engine's tests do not depend on the targets package).
 */
export function targetFacts(target: string): TerrainTargetFacts {
  const source = readFileSync(join(TARGETS, target, 'src', 'target.ts'), 'utf8');
  const match = /terrainPreview:\s*\{[^}]*?approximate:\s*\[([^\]]*)\]/s.exec(source);
  const approximate = [...(match?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]) as (
    | 'biome_layout'
    | 'end'
  )[];
  return { dataFolders: [], approximate };
}

/** A dimension's scores (counts, so dimensions can be summed). */
export interface Score {
  biomeCells: number;
  biomeMatch: number;
  cells: number;
  cellMatch: number;
  columns: number;
  heightExact: number;
  heightNear: number;
  top4Columns: number;
  top4Match: number;
  /** A few top-four misses, for the report. */
  samples: string[];
  /** What the worlds of the dimension report (once each). */
  unsupported: Unsupported[];
}

export function emptyScore(): Score {
  return {
    biomeCells: 0,
    biomeMatch: 0,
    cells: 0,
    cellMatch: 0,
    columns: 0,
    heightExact: 0,
    heightNear: 0,
    top4Columns: 0,
    top4Match: 0,
    samples: [],
    unsupported: [],
  };
}

const rate = (n: number, d: number) => (d === 0 ? 1 : n / d);

export function rates(s: Score) {
  return {
    biomes: rate(s.biomeMatch, s.biomeCells),
    cells: rate(s.cellMatch, s.cells),
    heightExact: rate(s.heightExact, s.columns),
    heightNear: rate(s.heightNear, s.columns),
    top4: rate(s.top4Match, s.top4Columns),
  };
}

function nameOf(state: string): string {
  const i = state.indexOf('[');
  return i < 0 ? state : state.slice(0, i);
}

/** S (solid), W (water), L (lava) or A (air). */
function classOf(state: string): 'S' | 'W' | 'L' | 'A' {
  const name = nameOf(state);
  if (name === 'minecraft:air' || name === 'minecraft:cave_air' || name === 'minecraft:void_air') {
    return 'A';
  }
  if (name === 'minecraft:water') return 'W';
  if (name === 'minecraft:lava') return 'L';
  return 'S';
}

function expand(runs: readonly number[], palette: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < runs.length; i += 2) {
    const state = palette[runs[i] as number] ?? 'minecraft:air';
    for (let n = runs[i + 1] as number; n > 0; n -= 1) out.push(state);
  }
  return out;
}

/** Plays one dimension of one target through the engine. */
export function scoreDimension(
  files: WorldgenFileMap,
  facts: TerrainTargetFacts,
  id: string,
  dim: DimensionExpectations,
): Score {
  const score = emptyScore();
  const unsupported = new Map<string, Unsupported>();
  for (const [seedText, measured] of Object.entries(dim.seeds)) {
    const world = createTerrainWorld({
      files: { vanilla: null, project: files },
      source: { dimension: id },
      seed: BigInt(seedText),
      facts,
    });
    for (const u of world.unsupported()) unsupported.set(`${u.kind}|${u.type}|${u.where}`, u);
    dim.biomeCells.forEach(([qx, qy, qz], i) => {
      const grid = sampleBiomes(world, {
        x0: qx * 4,
        z0: qz * 4,
        width: 4,
        depth: 4,
        step: 4,
        y: qy * 4,
      });
      const engine = grid.palette[grid.cells[0] as number];
      const game = dim.biomes[measured.biomes[i] as number];
      score.biomeCells += 1;
      if (engine === game) score.biomeMatch += 1;
    });
    // The columns lie in four chunks; one window per chunk over the whole height.
    const byChunk = new Map<string, number[]>();
    dim.columns.forEach(([x, z], i) => {
      const key = `${x >> 4},${z >> 4}`;
      const list = byChunk.get(key) ?? [];
      list.push(i);
      byChunk.set(key, list);
    });
    for (const indexes of byChunk.values()) {
      const xs = indexes.map((i) => (dim.columns[i] as readonly number[])[0] as number);
      const zs = indexes.map((i) => (dim.columns[i] as readonly number[])[1] as number);
      const x0 = Math.min(...xs);
      const z0 = Math.min(...zs);
      const sizeX = Math.max(...xs) - x0 + 1;
      const sizeZ = Math.max(...zs) - z0 + 1;
      const window = { x0, z0, y0: dim.minY, sizeX, sizeY: dim.height, sizeZ };
      const built = buildColumns(world, window, 'surface');
      for (const i of indexes) {
        const [x, z] = dim.columns[i] as readonly [number, number];
        const game = expand(measured.columns[i] as number[], dim.blocks);
        const engine: string[] = [];
        for (let y = 0; y < dim.height; y += 1) {
          const b = built.blocks[(y * sizeZ + (z - z0)) * sizeX + (x - x0)] as number;
          engine.push(built.palette[b] ?? 'minecraft:air');
        }
        let topGame = -1;
        let topEngine = -1;
        for (let y = dim.height - 1; y >= 0; y -= 1) {
          const g = classOf(game[y] ?? 'minecraft:air');
          const e = classOf(engine[y] as string);
          score.cells += 1;
          if (g === e) score.cellMatch += 1;
          if (topGame < 0 && g === 'S') topGame = y;
          if (topEngine < 0 && e === 'S') topEngine = y;
        }
        score.columns += 1;
        if (topGame === topEngine) score.heightExact += 1;
        if (Math.abs(topGame - topEngine) <= 1) score.heightNear += 1;
        if (topGame === topEngine && topGame >= 3) {
          score.top4Columns += 1;
          const g4: string[] = [];
          const e4: string[] = [];
          for (let y = topGame; y > topGame - 4; y -= 1) {
            g4.push(nameOf(game[y] ?? 'minecraft:air').replace('minecraft:', ''));
            e4.push(nameOf(engine[y] as string).replace('minecraft:', ''));
          }
          if (g4.join() === e4.join()) score.top4Match += 1;
          else if (score.samples.length < 6) {
            score.samples.push(
              `seed ${seedText} (${x}, ${topGame + dim.minY}, ${z}): game ${g4.join(' ')} | engine ${e4.join(' ')}`,
            );
          }
        }
      }
    }
  }
  score.unsupported = [...unsupported.values()];
  return score;
}

/** Percent with one decimal, for the report. */
export function pct(r: number): string {
  return `${(r * 100).toFixed(2)} %`;
}
