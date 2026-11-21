/**
 * Golden tests of `msm:fluid` (ADR 0099 D1, D4; B477): a water-like, a lava-like, a fluid in no
 * tag and a minimal fluid are lowered for every built-in target, every output is validated
 * against the schema it declares, and the outputs are compared with
 * `fixtures/<target id>/expected/fluid/<name>.json`. Set `UPDATE_GOLDENS=1` to rewrite the
 * expected files instead of comparing.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Json, JsonObject, OutputFile, ResourceLocation, TargetFacts } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  FLUID_FALLBACK_TEXTURES,
  FLUID_FLOW_DEFAULTS,
  FLUID_KIND,
  flowingFluidId,
  fluidBucketId,
  fluidDefinition,
  fluidFlowOf,
  fluidKind,
  fluidRegistryIds,
  fluidSpreadDistance,
} from '../src/index';
import {
  blockingProblems,
  element,
  indexesFor,
  PROJECT_IDS,
  sortedJson,
  type TargetIndexes,
} from './support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

interface FluidSample {
  name: string;
  id: ResourceLocation;
  data: JsonObject;
}

const sample = (name: string, id: string, data: JsonObject): FluidSample => ({
  name,
  id: id as ResourceLocation,
  data: { format: 1, ...data },
});

const SAMPLES: FluidSample[] = [
  sample('water-like', 'example:oil', {
    behaves_like: 'water',
    display_name: 'Oil',
    bucket_display_name: 'Bucket of Oil',
    flow: { tick_delay: 10, slope_distance: 4, drop_off: 1, infinite: true },
    light: 2,
    tint: 0x2a2418,
    explosion_resistance: 100,
    on_entity_inside: 'example:oily',
    events: {
      'example:oily': {
        actions: [
          { type: 'apply_effect', effect: 'minecraft:slowness', seconds: 2, target: 'other' },
        ],
      },
    },
    textures: {
      still: 'example:block/oil_still',
      flowing: 'example:block/oil_flow',
      overlay: 'example:block/oil_overlay',
      bucket: 'example:item/oil_bucket',
    },
  }),
  sample('lava-like', 'example:liquids/magma', {
    behaves_like: 'lava',
    display_name: 'Magma',
    flow: { tick_delay: 30, slope_distance: 2, drop_off: 2, infinite: false },
    light: 15,
    textures: {
      still: 'example:block/magma_still',
      flowing: 'example:block/magma_flow',
      bucket: 'example:item/magma_bucket',
    },
  }),
  sample('no-tag', 'example:mist', {
    behaves_like: 'none',
    tint: 0xd0e0ff,
    textures: {
      still: 'minecraft:block/water_still',
      flowing: 'minecraft:block/water_flow',
      bucket: 'minecraft:item/water_bucket',
    },
  }),
  sample('minimal', 'example:plain', {}),
];

/** Every string in `value`, nested lists and objects included. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

/**
 * The test indexes with the ids a fluid sample brings: its liquid block, bucket item, fluid ids,
 * models and pictures.
 */
function withSampleIds(
  indexes: TargetIndexes,
  fluid: FluidSample,
  files: OutputFile[],
  target: TargetFacts,
): TargetIndexes {
  const modelIds = files
    .filter((file) => file.path.includes('/models/'))
    .map((file) => file.path.replace(/^assets\/([^/]+)\/models\/(.+)\.json$/, '$1:$2'));
  const project: Record<string, readonly string[]> = {
    ...PROJECT_IDS,
    block: [...(PROJECT_IDS.block ?? []), fluid.id],
    item: [...(PROJECT_IDS.item ?? []), fluidBucketId(fluid.id)],
    model: [...(PROJECT_IDS.model ?? []), ...modelIds],
    fluid: fluidRegistryIds(target, fluid.id),
    texture: strings(fluid.data.textures).filter((id) => !id.startsWith('minecraft:')),
  };
  return { ...indexes, registries: createRegistryIndex({ vanilla: indexes.vanilla, project }) };
}

const fixturesRoot = new URL('./fixtures/', import.meta.url);

const fixtureUrl = (targetId: string, fluid: FluidSample): URL =>
  new URL(`${targetId}/expected/${fluidKind.folder}/${fluid.name}.json`, fixturesRoot);

const recorded = (file: OutputFile): Record<string, unknown> => ({
  contents: file.contents,
  layer: file.layer,
  merge: file.merge,
  path: file.path,
  schema: file.schema,
});

const byName = (name: string): FluidSample => {
  const found = SAMPLES.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`no sample ${name}`);
  return found;
};

const lowerFor = async (fluid: FluidSample, target: TargetFacts): Promise<OutputFile[]> =>
  fluidKind.lower(element(FLUID_KIND, fluid.id, fluid.data), target);

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'fluid lowering for %s',
  (targetId, bundle) => {
    it.each(SAMPLES.map((fluid) => [fluid.name, fluid] as const))('%s', async (_, fluid) => {
      const files = await lowerFor(fluid, bundle.target);
      const indexes = withSampleIds(await indexesFor(bundle), fluid, files, bundle.target);
      const problems = (schema: string, value: Json) => blockingProblems(indexes, schema, value);
      expect(problems(fluidKind.schema, fluid.data)).toEqual([]);
      for (const file of files) {
        expect(file.schema, file.path).toBeDefined();
        if (file.schema === undefined) continue;
        expect(problems(file.schema, file.contents as Json), file.path).toEqual([]);
      }

      const actual = sortedJson(files.map(recorded));
      const url = fixtureUrl(targetId, fluid);
      if (UPDATE) {
        await mkdir(dirname(fileURLToPath(url)), { recursive: true });
        await writeFile(url, actual);
      }
      expect(actual).toBe(await readFile(url, 'utf8'));
    });

    it('writes the fluid tags of the target, with the flowing id only on two-fluid targets', async () => {
      const target = bundle.target;
      const twoFluids = target.blocks?.fluidModel === 'two_fluids';
      for (const name of ['water-like', 'lava-like'] as const) {
        const fluid = byName(name);
        const files = await lowerFor(fluid, target);
        const tags = files.filter((file) => file.path.includes('/tags/fluid/'));
        const behaviour = name === 'water-like' ? 'water' : 'lava';
        const expected = (target.blocks?.fluidTags?.[behaviour] ?? []).map((tag) => {
          const [ns, path] = tag.split(':');
          return `data/${ns}/${target.folders.data.tags}/fluid/${path}.json`;
        });
        expect(tags.map((file) => file.path)).toEqual(expected);
        for (const file of tags) {
          expect(file.merge).toBe('tag');
          expect((file.contents as { values: string[] }).values).toEqual(
            twoFluids ? [fluid.id, flowingFluidId(target, fluid.id)] : [fluid.id],
          );
        }
      }
      const none = await lowerFor(byName('no-tag'), target);
      expect(none.some((file) => file.path.includes('/tags/'))).toBe(false);
    });

    it("names only vanilla's fluid tags and fallback pictures", async () => {
      const { registries } = await indexesFor(bundle);
      for (const tag of [
        ...(bundle.target.blocks?.fluidTags?.water ?? []),
        ...(bundle.target.blocks?.fluidTags?.lava ?? []),
      ]) {
        expect(registries.has('tag/fluid', tag), tag).toBe(true);
      }
      for (const set of Object.values(FLUID_FALLBACK_TEXTURES)) {
        for (const id of Object.values(set)) {
          expect(registries.has('texture', id), id).toBe(true);
        }
      }
      expect(registries.has('texture', 'minecraft:block/water_overlay')).toBe(true);
      expect(registries.has('model', 'minecraft:item/generated')).toBe(true);
    });
  },
);

describe('msm:fluid', () => {
  it('strips the editor fields from the definition and keeps the rest', () => {
    const oil = byName('water-like');
    const definition = fluidDefinition(element(FLUID_KIND, oil.id, oil.data));
    expect(Object.keys(definition).sort()).toEqual([
      'behaves_like',
      'events',
      'explosion_resistance',
      'flow',
      'format',
      'light',
      'on_entity_inside',
      'tint',
    ]);
    expect(definition.tint).toBe(0x2a2418);
  });

  it('derives the bucket and flowing ids from the last path segment', () => {
    const [twoFluid, oneFluid] = [
      { blocks: { fluidModel: 'two_fluids' as const } },
      { blocks: { fluidModel: 'one_fluid' as const } },
    ];
    expect(fluidBucketId('example:liquids/magma')).toBe('example:liquids/magma_bucket');
    expect(flowingFluidId(twoFluid as never, 'example:liquids/magma')).toBe(
      'example:liquids/flowing_magma',
    );
    expect(flowingFluidId(oneFluid as never, 'example:oil')).toBeUndefined();
    expect(flowingFluidId({} as never, 'example:oil')).toBeUndefined();
    expect(fluidRegistryIds(twoFluid as never, 'example:oil')).toEqual([
      'example:oil',
      'example:flowing_oil',
    ]);
  });

  it("fills in the flow defaults of behaves_like and spreads water's and lava's distances", () => {
    expect(fluidFlowOf({})).toEqual(FLUID_FLOW_DEFAULTS.water);
    expect(fluidFlowOf({ behaves_like: 'lava' })).toEqual(FLUID_FLOW_DEFAULTS.lava);
    expect(fluidFlowOf({ behaves_like: 'none' })).toEqual(FLUID_FLOW_DEFAULTS.water);
    expect(fluidFlowOf({ behaves_like: 'lava', flow: { drop_off: 1 } })).toEqual({
      ...FLUID_FLOW_DEFAULTS.lava,
      dropOff: 1,
    });
    expect([1, 2, 3, 4].map(fluidSpreadDistance)).toEqual([7, 3, 2, 1]);
  });

  it('lowers a minimal fluid with vanilla water pictures and no language keys', async () => {
    const target = builtInTargets[0]?.target as TargetFacts;
    const files = await lowerFor(byName('minimal'), target);
    expect(files.some((file) => file.path.includes('/lang/'))).toBe(false);
    const model = files.find((file) => file.path.endsWith('models/block/plain.json'));
    expect(model?.contents).toEqual({
      textures: {
        particle: 'minecraft:block/water_still',
        still: 'minecraft:block/water_still',
        flowing: 'minecraft:block/water_flow',
      },
    });
  });
});
