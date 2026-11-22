/**
 * The engine over the vanilla worldgen files of the Loom cache's client jars (read at test time,
 * never kept; skipped without a jar). Checks that every vanilla world loads, that the walker lists
 * exactly the types the spike found missing, that our fill (cell grid, per-column cache, shared
 * names) gives the same density as deepslate's own classes, bit for bit, and that the height
 * search agrees with a block by block search.
 */

import {
  Chunk,
  ChunkPos,
  DensityFunction,
  FixedBiomeSource,
  Identifier,
  NoiseChunkGenerator,
  NoiseGeneratorSettings,
  NormalNoise,
  RandomState,
  WorldgenRegistries,
} from 'deepslate/worldgen';
import { afterEach, describe, expect, it } from 'vitest';
import { buildColumns, createTerrainWorld, sampleBiomes } from '../src';
import { ChunkFill, HeightSearch } from '../src/fill';
import { prepassDensityFunction, prepassNoiseSettings } from '../src/prepass';
import { forgetRegistries } from '../src/registries';
import type { EngineWorld } from '../src/world';
import { FACTS } from './fixture';
import { loomJars, readJarWorldgen } from './vanilla-jar';

const jars = loomJars();

afterEach(() => forgetRegistries());

/** deepslate's own route, as the spike used it: its parsers, its `RandomState`, its router. */
function stockState(vanilla: ReturnType<typeof readJarWorldgen>, settingsId: string, seed: bigint) {
  const noises = WorldgenRegistries.NOISE;
  noises.clear();
  for (const [id, json] of Object.entries(vanilla['worldgen/noise'] ?? {})) {
    noises.register(Identifier.parse(id), NormalNoise.fromJson(json));
  }
  const functions = WorldgenRegistries.DENSITY_FUNCTION;
  functions.clear();
  for (const [id, json] of Object.entries(vanilla['worldgen/density_function'] ?? {})) {
    functions.register(Identifier.parse(id), () =>
      DensityFunction.fromJson(prepassDensityFunction(json)),
    );
  }
  const settingsJson = vanilla['worldgen/noise_settings']?.[settingsId];
  const settings = NoiseGeneratorSettings.fromJson(prepassNoiseSettings(settingsJson));
  forgetRegistries();
  return { settings, randomState: new RandomState(settings, seed) };
}

function presetWorld(
  vanilla: ReturnType<typeof readJarWorldgen>,
  preset: string,
  dimension: string,
  seed = 0n,
) {
  return createTerrainWorld({
    files: { vanilla, project: {} },
    source: { preset, dimension },
    seed,
    facts: FACTS,
  }) as EngineWorld;
}

describe.skipIf(jars.length === 0)('vanilla files from the Loom jars', () => {
  for (const jar of jars) {
    describe(jar.version, () => {
      const vanilla = jars.length ? readJarWorldgen(jar.path) : {};

      it('loads every dimension of every world preset', () => {
        const presets = Object.keys(vanilla['worldgen/world_preset'] ?? {});
        expect(presets.length).toBeGreaterThan(3);
        const seen = new Set<string>();
        for (const preset of presets) {
          const file = vanilla['worldgen/world_preset']?.[preset] as
            | { dimensions?: Record<string, unknown> }
            | undefined;
          const dims = file?.dimensions ?? {};
          for (const dim of Object.keys(dims)) {
            const world = presetWorld(vanilla, preset, dim);
            seen.add(world.generator);
            for (const note of world.unsupported()) {
              seen.add(`${note.kind} ${note.type}`);
              expect(note.kind).not.toBe('file');
            }
            if (world.generator === 'noise') {
              const ground = buildColumns(
                world,
                { x0: 0, z0: 0, y0: 40, sizeX: 16, sizeY: 32, sizeZ: 16 },
                'surface',
              );
              expect(ground.blocks.some((b) => b !== 0) || world.minY > 40).toBe(true);
            }
          }
        }
        // What the spike found missing (WS1), and nothing else.
        expect([...seen].sort()).toEqual([
          'biome_source multi_noise.preset',
          'chunk_generator minecraft:debug',
          'chunk_generator minecraft:flat',
          'debug',
          'flat',
          'material_condition minecraft:hole',
          'material_condition minecraft:steep',
          'material_rule minecraft:bandlands',
          'material_rule minecraft:ore_vein',
          'noise',
        ]);
      });

      for (const settingsId of Object.keys(vanilla['worldgen/noise_settings'] ?? {})) {
        it(`gives deepslate's own density for ${settingsId}`, () => {
          const seed = -7046235981325167892n;
          const world = createTerrainWorld({
            files: {
              vanilla,
              project: {
                dimension: {
                  'msm:probe': {
                    type: 'minecraft:overworld',
                    generator: {
                      type: 'minecraft:noise',
                      settings: settingsId,
                      biome_source: { type: 'minecraft:fixed', biome: 'minecraft:plains' },
                    },
                  },
                },
              },
            },
            source: { dimension: 'msm:probe' },
            seed,
            facts: FACTS,
          }) as EngineWorld;
          const ours = world.noise?.router.finalDensity;
          if (!ours) throw new Error('no noise world');
          const stock = stockState(vanilla, settingsId, seed).randomState.router.finalDensity;
          let n = 0;
          for (let i = 0; i < 40; i += 1) {
            const x = i * 37 - 700;
            const z = i * 53 - 300;
            for (let y = world.minY; y < world.minY + world.height; y += 11) {
              const a = ours.compute({ x, y, z });
              const b = stock.compute({ x, y, z });
              if (!Object.is(a, b))
                throw new Error(`${settingsId} at ${x} ${y} ${z}: ${a} != ${b}`);
              n += 1;
            }
          }
          expect(n).toBeGreaterThan(400);
        });
      }

      it("fills a chunk as deepslate's own doFill does, aquifers included", () => {
        const seed = 12345n;
        const world = presetWorld(vanilla, 'minecraft:normal', 'minecraft:overworld', seed);
        const parts = world.noise;
        if (!parts) throw new Error('no noise world');
        const { settings, randomState } = stockState(vanilla, 'minecraft:overworld', seed);
        const generator = new NoiseChunkGenerator(
          new FixedBiomeSource(Identifier.parse('minecraft:plains')),
          settings,
        );
        const cx = -3;
        const cz = 5;
        const chunk = new Chunk(
          settings.noise.minY,
          settings.noise.height,
          ChunkPos.create(cx, cz),
        );
        // deepslate's own fill (private in its types; the spike called it the same way).
        const own = generator as unknown as {
          createNoiseChunk(r: RandomState, c: Chunk, onlyFirstZ: boolean): unknown;
          doFill(c: Chunk, n: unknown): void;
        };
        own.doFill(chunk, own.createNoiseChunk(randomState, chunk, false));
        const fill = new ChunkFill(parts, cx, cz);
        let fluids = 0;
        for (let x = 0; x < 16; x += 5) {
          for (let z = 0; z < 16; z += 5) {
            for (let y = world.minY; y < world.minY + world.height; y += 1) {
              const pos = [cx * 16 + x, y, cz * 16 + z] as [number, number, number];
              const want = chunk.getBlockState(pos).toString();
              const got = fill.state(pos[0], pos[1], pos[2]).toString();
              if (want !== got) throw new Error(`${pos.join(' ')}: ${got} != ${want}`);
              if (/water|lava/.test(got) && y < 40) fluids += 1;
            }
          }
        }
        expect(fluids).toBeGreaterThan(0);
      });

      it('finds the same heights as a block by block search in the overworld', () => {
        const world = presetWorld(vanilla, 'minecraft:normal', 'minecraft:overworld', 12345n);
        const parts = world.noise;
        if (!parts) throw new Error('no noise world');
        const search = new HeightSearch(parts);
        const fd = parts.router.finalDensity;
        for (let i = 0; i < 60; i += 1) {
          const x = i * 97 - 3000;
          const z = (i % 7) * 131 + 400;
          let top = world.minY - 1;
          for (let y = world.minY + world.height - 1; y >= world.minY; y -= 1) {
            if (fd.compute({ x, y, z }) > 0) {
              top = y;
              break;
            }
          }
          expect(search.height(x, z, 'ocean_floor')).toBe(top);
        }
      });

      it('reports the overworld preset and draws one biome (WS9)', () => {
        const world = presetWorld(vanilla, 'minecraft:normal', 'minecraft:overworld');
        expect(world.biomesKnown).toBe(false);
        expect(
          sampleBiomes(world, { x0: 0, z0: 0, width: 64, depth: 64, step: 16 }).palette,
        ).toEqual(['minecraft:plains']);
      });
    });
  }
});
