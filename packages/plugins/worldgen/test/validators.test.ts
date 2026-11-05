import type {
  Element,
  Json,
  Problem,
  ResourceLocation,
  Target,
  ValidationInput,
} from '@msm/plugin-api';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { WORLDGEN_PROBLEM_CODES, worldgenValidators } from '../src/index';

const target: Target = (builtInTargets[0] as TargetBundle).target;
const steps = target.worldgen.featureSteps;
const ORES = steps.indexOf('underground_ores');
const VEGETAL = steps.indexOf('vegetal_decoration');

const element = (kind: string, id: ResourceLocation, data: Json): Element => ({
  formatVersion: 1,
  id,
  kind,
  data,
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
});

/** A biome whose `features` lists `byStep[step]` at each step index. */
function biome(id: ResourceLocation, byStep: Record<number, string[]>): Element {
  const features: string[][] = [];
  for (const [step, list] of Object.entries(byStep)) {
    while (features.length <= Number(step)) features.push([]);
    features[Number(step)] = list;
  }
  return element('minecraft:worldgen/biome', id, {
    has_precipitation: true,
    temperature: 0.5,
    downfall: 0.5,
    effects: { water_color: 4159204 },
    carvers: [],
    features,
  });
}

const fixed = (biomeId: string): Json => ({
  type: 'minecraft:overworld',
  generator: {
    type: 'minecraft:noise',
    settings: 'minecraft:overworld',
    biome_source: { type: 'minecraft:fixed', biome: biomeId },
  },
});

const dimension = (id: ResourceLocation, biomeId: string): Element =>
  element('minecraft:dimension', id, fixed(biomeId));

function preset(id: ResourceLocation, dimensions: Record<string, Json>): Element {
  return element('minecraft:worldgen/world_preset', id, { dimensions });
}

const multiNoise = (biomes: string[]): Json => ({
  type: 'minecraft:overworld',
  generator: {
    type: 'minecraft:noise',
    settings: 'minecraft:overworld',
    biome_source: {
      type: 'minecraft:multi_noise',
      biomes: biomes.map((b) => ({
        biome: b,
        parameters: {
          temperature: 0,
          humidity: 0,
          continentalness: 0,
          erosion: 0,
          weirdness: 0,
          depth: 0,
          offset: 0,
        },
      })),
    },
  },
});

const tag = (kind: string, id: ResourceLocation, values: Json[]): Element =>
  element(kind, id, { replace: false, values });

const placed = (id: ResourceLocation): Element =>
  element('minecraft:worldgen/placed_feature', id, { feature: 'minecraft:oak', placement: [] });

const registry: ValidationInput['registry'] = { has: () => true, ids: () => [] };

/** Runs every validator and returns the problems with the given code. */
function run(elements: Element[], code: string): Problem[] {
  return worldgenValidators
    .flatMap((validator) => {
      const problems = validator.validate({ elements, target, registry });
      if (problems instanceof Promise) throw new Error(`${validator.id} validates asynchronously.`);
      return problems;
    })
    .filter((problem) => problem.code === code);
}

describe('worldgen validators', () => {
  it('declares the five codes and reads only the kinds they name', () => {
    expect(WORLDGEN_PROBLEM_CODES).toHaveLength(5);
    expect(new Set(worldgenValidators.map((validator) => validator.id)).size).toBe(5);
    for (const validator of worldgenValidators) expect(validator.kinds.length).toBeGreaterThan(0);
  });

  describe('worldgen.feature-order', () => {
    it('reports the same placed feature in different steps of two biomes', () => {
      const problems = run(
        [
          biome('demo:a', { [ORES]: ['demo:ruby_ore'] }),
          biome('demo:b', { [VEGETAL]: ['demo:ruby_ore'] }),
        ],
        'worldgen.feature-order',
      );
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatchObject({
        severity: 'error',
        elementId: 'demo:b',
        path: `/features/${VEGETAL}/0`,
      });
      expect(problems[0]?.message).toContain(steps[ORES]);
      expect(problems[0]?.message).toContain(steps[VEGETAL]);
    });

    it('reports two placed features in opposite order within one step of two biomes', () => {
      const problems = run(
        [
          biome('demo:a', { [VEGETAL]: ['demo:x', 'minecraft:flower_default', 'demo:y'] }),
          biome('demo:b', { [VEGETAL]: ['demo:y', 'demo:x'] }),
        ],
        'worldgen.feature-order',
      );
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatchObject({
        severity: 'error',
        elementId: 'demo:b',
        path: `/features/${VEGETAL}`,
      });
      expect(problems[0]?.message).toContain('"demo:x"');
      expect(problems[0]?.message).toContain('"demo:y"');
      expect(problems[0]?.message).toContain('"demo:a"');
    });

    it('finds a cycle that only three biomes together form', () => {
      const problems = run(
        [
          biome('demo:a', { [VEGETAL]: ['demo:x', 'demo:y'] }),
          biome('demo:b', { [VEGETAL]: ['demo:y', 'demo:z'] }),
          biome('demo:c', { [VEGETAL]: ['demo:z', 'demo:x'] }),
        ],
        'worldgen.feature-order',
      );
      expect(problems).toHaveLength(1);
      expect(problems[0]?.elementId).toBe('demo:c');
    });

    it('reports nothing for a consistent order', () => {
      expect(
        run(
          [
            biome('demo:a', {
              [ORES]: ['minecraft:ore_dirt', 'demo:ruby_ore'],
              [VEGETAL]: ['demo:x', 'demo:y', 'demo:z'],
            }),
            biome('demo:b', { [ORES]: ['demo:ruby_ore'], [VEGETAL]: ['demo:x', 'demo:z'] }),
            biome('demo:c', { [VEGETAL]: ['#demo:tagged', 'demo:y', 'demo:z'] }),
          ],
          'worldgen.feature-order',
        ),
      ).toEqual([]);
    });

    it('treats an id without a namespace as minecraft', () => {
      const problems = run(
        [
          biome('demo:a', { [VEGETAL]: ['oak', 'minecraft:birch'] }),
          biome('demo:b', { [VEGETAL]: ['minecraft:birch', 'minecraft:oak'] }),
        ],
        'worldgen.feature-order',
      );
      expect(problems).toHaveLength(1);
    });
  });

  describe('worldgen.biome-unreachable', () => {
    const forest = biome('demo:forest', {});

    it('accepts a biome listed in a dimension', () => {
      expect(
        run([forest, dimension('demo:realm', 'demo:forest')], 'worldgen.biome-unreachable'),
      ).toEqual([]);
    });

    it('accepts a biome listed in a world preset', () => {
      expect(
        run(
          [
            forest,
            preset('demo:world', {
              'minecraft:overworld': multiNoise(['minecraft:plains', 'demo:forest']),
            }),
          ],
          'worldgen.biome-unreachable',
        ),
      ).toEqual([]);
    });

    it('accepts a biome reached through a biome tag in a biome source', () => {
      expect(
        run(
          [
            forest,
            tag('minecraft:tag/worldgen/biome', 'demo:board', ['#demo:inner']),
            tag('minecraft:tag/worldgen/biome', 'demo:inner', [
              { id: 'demo:forest', required: false },
            ]),
            element('minecraft:dimension', 'demo:board', {
              type: 'minecraft:overworld',
              generator: {
                type: 'minecraft:noise',
                settings: 'minecraft:overworld',
                biome_source: { type: 'minecraft:checkerboard', biomes: '#demo:board' },
              },
            }),
          ],
          'worldgen.biome-unreachable',
        ),
      ).toEqual([]);
    });

    it('warns about a biome that is only in a tag', () => {
      const problems = run(
        [forest, tag('minecraft:tag/worldgen/biome', 'demo:has_ruins', ['demo:forest'])],
        'worldgen.biome-unreachable',
      );
      expect(problems).toEqual([
        expect.objectContaining({ severity: 'warning', elementId: 'demo:forest' }),
      ]);
    });
  });

  describe('worldgen.preset-not-selectable', () => {
    const world = preset('demo:world', { 'minecraft:overworld': fixed('minecraft:plains') });

    it('accepts a preset in the minecraft:normal tag', () => {
      expect(
        run(
          [world, tag('minecraft:tag/worldgen/world_preset', 'minecraft:normal', ['demo:world'])],
          'worldgen.preset-not-selectable',
        ),
      ).toEqual([]);
    });

    it('accepts a preset in the minecraft:extended tag through a nested tag', () => {
      expect(
        run(
          [
            world,
            tag('minecraft:tag/worldgen/world_preset', 'minecraft:extended', ['#demo:mine']),
            tag('minecraft:tag/worldgen/world_preset', 'demo:mine', ['demo:world']),
          ],
          'worldgen.preset-not-selectable',
        ),
      ).toEqual([]);
    });

    it('reports info for a preset in no selectable tag', () => {
      expect(run([world], 'worldgen.preset-not-selectable')).toEqual([
        expect.objectContaining({ severity: 'info', elementId: 'demo:world' }),
      ]);
    });
  });

  describe('worldgen.preset-missing-overworld', () => {
    it('reports an error for a preset without the overworld', () => {
      expect(
        run(
          [preset('demo:world', { 'minecraft:the_nether': fixed('minecraft:nether_wastes') })],
          'worldgen.preset-missing-overworld',
        ),
      ).toEqual([
        expect.objectContaining({
          severity: 'error',
          elementId: 'demo:world',
          path: '/dimensions',
        }),
      ]);
    });

    it('accepts a preset with only the overworld', () => {
      expect(
        run(
          [preset('demo:world', { 'minecraft:overworld': fixed('minecraft:plains') })],
          'worldgen.preset-missing-overworld',
        ),
      ).toEqual([]);
    });
  });

  describe('worldgen.placed-feature-unused', () => {
    it('reports info for a placed feature no element names', () => {
      expect(run([placed('demo:ruby_ore')], 'worldgen.placed-feature-unused')).toEqual([
        expect.objectContaining({ severity: 'info', elementId: 'demo:ruby_ore' }),
      ]);
    });

    it('accepts a placed feature a biome lists', () => {
      expect(
        run(
          [placed('demo:ruby_ore'), biome('demo:a', { [ORES]: ['demo:ruby_ore'] })],
          'worldgen.placed-feature-unused',
        ),
      ).toEqual([]);
    });
  });

  it('reports nothing for a clean project', async () => {
    const elements = [
      biome('demo:forest', { [ORES]: ['demo:ruby_ore'] }),
      placed('demo:ruby_ore'),
      preset('demo:world', {
        'minecraft:overworld': multiNoise(['minecraft:plains', 'demo:forest']),
      }),
      tag('minecraft:tag/worldgen/world_preset', 'minecraft:normal', ['demo:world']),
    ];
    expect(
      (
        await Promise.all(
          worldgenValidators.map((validator) => validator.validate({ elements, target, registry })),
        )
      ).flat(),
    ).toEqual([]);
  });
});
