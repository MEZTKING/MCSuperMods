import { readdir, readFile } from 'node:fs/promises';
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
import { WORLDGEN_PROBLEM_CODES, worldgenTemplates, worldgenValidators } from '../src/index';

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
function run(elements: Element[], code: string, on: Target = target): Problem[] {
  return worldgenValidators
    .flatMap((validator) => {
      const problems = validator.validate({ elements, target: on, registry });
      if (problems instanceof Promise) throw new Error(`${validator.id} validates asynchronously.`);
      return problems;
    })
    .filter((problem) => problem.code === code);
}

describe('worldgen validators', () => {
  it('declares the twelve codes and reads only the kinds they name', () => {
    expect(WORLDGEN_PROBLEM_CODES).toHaveLength(12);
    expect(new Set(worldgenValidators.map((validator) => validator.id)).size).toBe(7);
    for (const validator of worldgenValidators) expect(validator.kinds.length).toBeGreaterThan(0);
  });

  describe('worldgen.feature-order', () => {
    it('reports no error for the same placed feature in different steps of two biomes', () => {
      expect(
        run(
          [
            biome('demo:a', { [ORES]: ['demo:ruby_ore', 'demo:x'], [VEGETAL]: ['demo:y'] }),
            biome('demo:b', { [ORES]: ['demo:y'], [VEGETAL]: ['demo:ruby_ore', 'demo:x'] }),
          ],
          'worldgen.feature-order',
        ),
      ).toEqual([]);
    });

    it('reports a placed feature listed twice in one step', () => {
      const problems = run(
        [biome('demo:a', { [VEGETAL]: ['demo:x', 'demo:y', 'demo:x'] })],
        'worldgen.feature-order',
      );
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatchObject({ severity: 'error', elementId: 'demo:a' });
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
      expect(problems[0]).toMatchObject({ severity: 'error', elementId: 'demo:c' });
      expect(problems[0]?.message).toContain('"demo:x", "demo:y", "demo:z"');
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
      expect(problems[0]?.message).toContain('"minecraft:birch", "minecraft:oak"');
    });
  });

  describe('worldgen.vanilla-feature-order (ADR 0097 D2)', () => {
    const CODE = 'worldgen.vanilla-feature-order';

    it('has the vanilla order on every built-in target', () => {
      for (const bundle of builtInTargets) {
        const order = bundle.target.worldgen.vanillaFeatureOrder;
        expect(order, bundle.target.id).toBeDefined();
        const vegetal = order?.vegetal_decoration ?? [];
        // Vanilla runs pumpkins before sugar cane (the reference pack's W-A1 pair).
        expect(vegetal.indexOf('minecraft:patch_pumpkin')).toBeGreaterThanOrEqual(0);
        expect(vegetal.indexOf('minecraft:patch_pumpkin')).toBeLessThan(
          vegetal.indexOf('minecraft:patch_sugar_cane'),
        );
      }
    });

    it('warns about a swapped vanilla pair in a project biome', () => {
      const elements = [
        biome('demo:a', {
          [VEGETAL]: ['minecraft:patch_sugar_cane', 'demo:x', 'minecraft:patch_pumpkin'],
        }),
      ];
      for (const bundle of builtInTargets) {
        const problems = run(elements, CODE, bundle.target);
        expect(problems, bundle.target.id).toHaveLength(1);
        expect(problems[0]).toMatchObject({
          severity: 'warning',
          elementId: 'demo:a',
          path: `/features/${VEGETAL}/2`,
        });
        expect(problems[0]?.message).toBe(
          'Vanilla runs "minecraft:patch_pumpkin" before "minecraft:patch_sugar_cane" in step "vegetal_decoration"; a world with this biome and vanilla biomes stops with "Feature order cycle". Swap them.',
        );
      }
      // Not an error: the project's own lists agree with each other.
      expect(run(elements, 'worldgen.feature-order')).toEqual([]);
    });

    it('accepts vanilla features in vanilla order, an id without a namespace included', () => {
      expect(
        run(
          [
            biome('demo:a', {
              [ORES]: ['ore_dirt', 'demo:ruby_ore', 'minecraft:ore_gravel'],
              [VEGETAL]: ['minecraft:patch_pumpkin', 'demo:x', 'patch_sugar_cane'],
            }),
          ],
          CODE,
        ),
      ).toEqual([]);
    });

    it('finds a loop that a project feature closes between two biomes and vanilla', () => {
      // a: sugar cane, then x; b: x, then pumpkins. Vanilla runs pumpkins before sugar cane.
      const problems = run(
        [
          biome('demo:a', { [VEGETAL]: ['minecraft:patch_sugar_cane', 'demo:x'] }),
          biome('demo:b', { [VEGETAL]: ['demo:x', 'minecraft:patch_pumpkin'] }),
        ],
        CODE,
      );
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatchObject({
        severity: 'warning',
        elementId: 'demo:b',
        path: `/features/${VEGETAL}`,
      });
      expect(problems[0]?.message).toContain(
        '"demo:x", "minecraft:patch_pumpkin", "minecraft:patch_sugar_cane"',
      );
      expect(problems[0]?.message).toContain('biomes "demo:a", "demo:b"');
    });

    it('leaves a project-only loop to worldgen.feature-order', () => {
      const elements = [
        biome('demo:a', { [VEGETAL]: ['demo:x', 'minecraft:patch_pumpkin', 'demo:y'] }),
        biome('demo:b', { [VEGETAL]: ['demo:y', 'demo:x'] }),
      ];
      expect(run(elements, 'worldgen.feature-order')).toHaveLength(1);
      expect(run(elements, CODE)).toEqual([]);
    });

    it('is skipped on a target without the vanilla order', () => {
      const { vanillaFeatureOrder: _order, ...worldgen } = target.worldgen;
      const bare: Target = { ...target, worldgen };
      expect(
        run(
          [
            biome('demo:a', {
              [VEGETAL]: ['minecraft:patch_sugar_cane', 'minecraft:patch_pumpkin'],
            }),
          ],
          CODE,
          bare,
        ),
      ).toEqual([]);
    });

    it('stays silent on the biome templates (Temperate forest included) on every target', () => {
      const biomes = worldgenTemplates.filter((entry) => entry.kind === 'minecraft:worldgen/biome');
      expect(biomes.map((entry) => entry.id)).toContain('biome_temperate_forest');
      for (const bundle of builtInTargets) {
        const elements = biomes.map((template) =>
          element(
            template.kind,
            `demo:${template.id}`,
            template.data({
              id: `demo:${template.id}`,
              namespace: 'demo',
              path: template.id,
              projectNamespace: 'demo',
              namespaces: ['demo'],
              kindDefault: undefined,
              target: bundle.target,
            }) as Json,
          ),
        );
        expect(run(elements, CODE, bundle.target), bundle.target.id).toEqual([]);
      }
    });

    it('stays silent on every biome of the worldgen goldens, examples and fixtures', async () => {
      const root = new URL('../../../../', import.meta.url);
      const files: string[] = [];
      const walk = async (dir: URL): Promise<void> => {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) await walk(new URL(`${entry.name}/`, dir));
          else if (
            entry.name.endsWith('.json') &&
            dir.pathname.endsWith('/worldgen/biome/') &&
            !dir.pathname.includes('/tags/')
          ) {
            files.push(new URL(entry.name, dir).pathname);
          }
        }
      };
      await walk(new URL('examples/', root));
      await walk(new URL('fixtures/', root));
      await walk(new URL('packages/plugins/worldgen/test/fixtures/', root));
      // Five project biomes (starters, examples, the sample) and two goldens per target, plus the
      // worldgen parity fixture's 24 (six biomes, content and lowered, per target; B579).
      expect(files.length).toBe(33);
      const elements: Element[] = [];
      for (const [index, file] of files.entries()) {
        const raw = JSON.parse(await readFile(file, 'utf8')) as { data?: Json } & Json;
        // Project elements wrap the biome in `data`; lowered goldens are the biome itself.
        const data = (raw as { data?: Json }).data ?? raw;
        elements.push(element('minecraft:worldgen/biome', `demo:b${index}`, data));
      }
      for (const bundle of builtInTargets) {
        expect(run(elements, CODE, bundle.target), bundle.target.id).toEqual([]);
      }
    });
  });

  describe('worldgen.feature-step-differs', () => {
    it('warns once about the same placed feature in different steps of two biomes', () => {
      const elements = [
        biome('demo:a', { [ORES]: ['demo:ruby_ore'] }),
        biome('demo:b', { [VEGETAL]: ['demo:ruby_ore'] }),
      ];
      const problems = run(elements, 'worldgen.feature-step-differs');
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatchObject({
        severity: 'warning',
        elementId: 'demo:b',
        path: `/features/${VEGETAL}/0`,
      });
      expect(problems[0]?.message).toContain(steps[ORES]);
      expect(problems[0]?.message).toContain(steps[VEGETAL]);
      expect(problems[0]?.message).toContain('placement seed');
      expect(run(elements, 'worldgen.feature-order')).toEqual([]);
    });

    it('treats a bare id and its minecraft: form as the same feature', () => {
      const problems = run(
        [
          biome('demo:a', { [ORES]: ['freeze_top_layer'] }),
          biome('demo:b', { [VEGETAL]: ['minecraft:freeze_top_layer'] }),
        ],
        'worldgen.feature-step-differs',
      );
      expect(problems).toHaveLength(1);
      expect(problems[0]?.message).toContain('"minecraft:freeze_top_layer"');
    });

    it('reports nothing when every biome uses the same step', () => {
      expect(
        run(
          [
            biome('demo:a', { [ORES]: ['ruby_ore'] }),
            biome('demo:b', { [ORES]: ['minecraft:ruby_ore'] }),
          ],
          'worldgen.feature-step-differs',
        ),
      ).toEqual([]);
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

describe('worldgen dimension type validators (ADR 0100 D3)', () => {
  const DIMENSION_TYPE = 'minecraft:dimension_type';
  const base = {
    has_skylight: true,
    has_ceiling: false,
    has_ender_dragon_fight: false,
    coordinate_scale: 1,
    ambient_light: 0,
    logical_height: 384,
    infiniburn: '#minecraft:infiniburn_overworld',
    min_y: -64,
    height: 384,
    monster_spawn_light_level: 0,
    monster_spawn_block_light_limit: 0,
  };
  const type = (fields: Record<string, Json>, id: ResourceLocation = 'demo:moon'): Element =>
    element(DIMENSION_TYPE, id, { ...base, ...fields });
  const codes = (elements: Element[], on: Target = target): string[] =>
    worldgenValidators
      .flatMap((validator) => validator.validate({ elements, target: on, registry }) as Problem[])
      .map((problem) => problem.code)
      .filter((code) => code.startsWith('worldgen.dimension-'));

  it('accepts a valid dimension type on every target', () => {
    for (const bundle of builtInTargets) {
      expect(codes([type({})], bundle.target), bundle.target.id).toEqual([]);
      expect(
        codes([type({ min_y: -2032, height: 4064, logical_height: 4064 })], bundle.target),
      ).toEqual([]);
    }
  });

  it('worldgen.dimension-height-multiple: min_y and height in steps of 16', () => {
    const problems = run([type({ min_y: -60, height: 380 })], 'worldgen.dimension-height-multiple');
    expect(problems.map((problem) => problem.path)).toEqual(['/min_y', '/height']);
    expect(problems[0]?.severity).toBe('error');
    expect(problems[0]?.message).toContain('-64');
  });

  it('worldgen.dimension-height-range: the bounds come from the target', () => {
    expect(
      run([type({ min_y: -2048, height: 256 })], 'worldgen.dimension-height-range').map(
        (problem) => problem.path,
      ),
    ).toEqual(['/min_y']);
    const top = run([type({ min_y: 0, height: 2048 })], 'worldgen.dimension-height-range');
    expect(top.map((problem) => problem.path)).toEqual(['/height']);
    expect(top[0]?.message).toContain('y 2047');
    expect(top[0]?.message).toContain('at most 2032');
    expect(
      run([type({ height: 0, logical_height: 0 })], 'worldgen.dimension-height-range'),
    ).toHaveLength(1);
    // A target without the fact skips the height checks.
    const { dimensionHeight: _bounds, ...worldgen } = target.worldgen;
    const bare = { ...target, worldgen } as Target;
    expect(codes([type({ min_y: -60, height: 8000 })], bare)).toEqual([]);
  });

  it('worldgen.dimension-logical-height: not above the height', () => {
    const problems = run(
      [type({ height: 256, logical_height: 384 })],
      'worldgen.dimension-logical-height',
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]?.path).toBe('/logical_height');
  });

  it('checks a dimension type written inline in a dimension', () => {
    const inline = element('minecraft:dimension', 'demo:moon_world', {
      type: { ...base, min_y: 8, logical_height: 512 },
      generator: { type: 'minecraft:debug' },
    });
    const problems = worldgenValidators
      .flatMap(
        (validator) => validator.validate({ elements: [inline], target, registry }) as Problem[],
      )
      .filter((problem) => problem.code.startsWith('worldgen.dimension-'));
    expect(problems.map((problem) => [problem.code, problem.path])).toEqual([
      ['worldgen.dimension-height-multiple', '/type/min_y'],
      ['worldgen.dimension-logical-height', '/type/logical_height'],
    ]);
  });

  it('worldgen.dimension-attribute-unknown: only the target attributes, namespace optional', () => {
    const attributes = {
      'minecraft:visual/sky_color': '#000000',
      'visual/fog_color': '#101010',
      'minecraft:visual/sky_colour': '#000000',
      'minecraft:visual/has_sky_occluder': true,
    };
    // The newer target adds visual/has_sky_occluder (plan F31); the older one does not list it,
    // so the checks follow each target's own list.
    const lists = new Set<boolean>();
    for (const bundle of builtInTargets) {
      const occluder = bundle.target.worldgen.environmentAttributes?.includes(
        'minecraft:visual/has_sky_occluder',
      );
      lists.add(occluder === true);
      expect(
        run([type({ attributes })], 'worldgen.dimension-attribute-unknown', bundle.target).map(
          (problem) => problem.path,
        ),
        bundle.target.id,
      ).toEqual([
        '/attributes/minecraft:visual~1sky_colour',
        ...(occluder === true ? [] : ['/attributes/minecraft:visual~1has_sky_occluder']),
      ]);
    }
    expect(lists).toEqual(new Set([true, false]));
    const problem = run([type({ attributes })], 'worldgen.dimension-attribute-unknown')[0];
    expect(problem?.severity).toBe('error');
  });

  it('worldgen.dimension-attribute-mod-particle: an info for a project particle', () => {
    const particle = element('msm:particle', 'demo:moon_dust', { format: 1 });
    const attributes = {
      'minecraft:visual/ambient_particles': [
        { particle: { type: 'demo:moon_dust' }, probability: 0.01 },
      ],
    };
    const problems = run(
      [particle, type({ attributes })],
      'worldgen.dimension-attribute-mod-particle',
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]?.severity).toBe('info');
    expect(problems[0]?.path).toBe('/attributes/minecraft:visual~1ambient_particles');
    expect(problems[0]?.message).toContain('"demo:moon_dust"');
    // A vanilla particle, or no project particle at all, is fine.
    const vanilla = {
      'minecraft:visual/ambient_particles': [
        { particle: { type: 'minecraft:white_ash' }, probability: 0.01 },
      ],
    };
    expect(
      run([particle, type({ attributes: vanilla })], 'worldgen.dimension-attribute-mod-particle'),
    ).toEqual([]);
    expect(run([type({ attributes })], 'worldgen.dimension-attribute-mod-particle')).toEqual([]);
  });

  it('finds nothing in the two dimension type templates on any target', async () => {
    for (const bundle of builtInTargets) {
      for (const id of ['dimension_type_moon', 'dimension_type_nether_like']) {
        const template = worldgenTemplates.find((entry) => entry.id === id);
        if (template === undefined) throw new Error(`no ${id}`);
        const data = (await template.data({
          id: 'demo:sample',
          namespace: 'demo',
          path: 'sample',
          projectNamespace: 'demo',
          namespaces: ['demo'],
          kindDefault: undefined,
          target: bundle.target,
        })) as Json;
        expect(codes([element(DIMENSION_TYPE, 'demo:sample', data)], bundle.target), id).toEqual(
          [],
        );
      }
    }
  });

  it('leaves values the schema rejects to the schema', () => {
    expect(
      codes([type({ min_y: 'low', height: null, logical_height: 1.5, attributes: 3 })]),
    ).toEqual([]);
  });
});
