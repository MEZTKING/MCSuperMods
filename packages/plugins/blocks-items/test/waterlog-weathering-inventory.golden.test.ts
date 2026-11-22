/**
 * Golden tests of waterlogging, weathering and waxing (ADR 0094 D7 to D9) and of item
 * inventories and bundles (ADR 0095 D1, D4; B451): each sample (one or more elements) is
 * lowered for every built-in target, its element data and every output are validated against
 * their schemas, and the outputs are compared with
 * `fixtures/<target id>/expected/<block|item>/<name>.json`. Set `UPDATE_GOLDENS=1` to rewrite
 * the expected files instead of comparing.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElementKind, Json, JsonObject, OutputFile, ResourceLocation } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  BUNDLE_OPEN_BACK_PARENT,
  BUNDLE_OPEN_FRONT_PARENT,
  blockKind,
  itemKind,
  withWaterloggedVariants,
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

interface Sample {
  name: string;
  kind: ElementKind;
  elements: { id: ResourceLocation; data: JsonObject }[];
}

const one = (kind: ElementKind, name: string, id: string, data: JsonObject): Sample => ({
  name,
  kind,
  elements: [{ id: id as ResourceLocation, data: { format: 1, ...data } }],
});

const tin = (
  path: string,
  stage: string | undefined,
  next: string | undefined,
  waxed: string | undefined,
): { id: ResourceLocation; data: JsonObject } => {
  const components: JsonObject = { 'msm:breakable': { hardness: 3, resistance: 6 } };
  if (stage !== undefined) {
    components['msm:weathering'] = next === undefined ? { stage } : { stage, next };
  }
  if (waxed !== undefined) components['msm:waxable'] = { into: waxed };
  return {
    id: `example:${path}` as ResourceLocation,
    data: {
      format: 1,
      model: `example:block/${path.replace('waxed_', '')}`,
      loot: 'self',
      components,
    },
  };
};

/** The four stages of tin and their waxed copies (the waxed copies share the stage models). */
const TIN_SET: Sample = {
  name: 'weathering-tin-set',
  kind: blockKind,
  elements: [
    tin('tin', 'unaffected', 'example:exposed_tin', 'example:waxed_tin'),
    tin('exposed_tin', 'exposed', 'example:weathered_tin', 'example:waxed_exposed_tin'),
    tin('weathered_tin', 'weathered', 'example:oxidized_tin', 'example:waxed_weathered_tin'),
    tin('oxidized_tin', 'oxidized', undefined, 'example:waxed_oxidized_tin'),
    tin('waxed_tin', undefined, undefined, undefined),
    tin('waxed_exposed_tin', undefined, undefined, undefined),
    tin('waxed_weathered_tin', undefined, undefined, undefined),
    tin('waxed_oxidized_tin', undefined, undefined, undefined),
  ],
};

const SAMPLES: Sample[] = [
  one(blockKind, 'waterlog-block', 'example:wet_lamp', {
    display_name: 'Wet Lamp',
    model: 'example:block/wet_lamp',
    loot: 'self',
    components: { 'msm:waterloggable': {}, 'msm:light_emitter': { level: 12 } },
  }),
  one(blockKind, 'waterlog-horizontal', 'example:coral_shelf', {
    type: 'horizontal',
    textures: {
      front: 'example:block/coral_shelf_front',
      side: 'example:block/coral_shelf_side',
      top: 'example:block/coral_shelf_top',
    },
    components: { 'msm:waterloggable': {} },
  }),
  one(blockKind, 'waterlog-container', 'example:wet_crate', {
    model: 'example:block/wet_crate',
    components: { 'msm:waterloggable': {}, 'msm:container': {} },
  }),
  TIN_SET,
  one(blockKind, 'weathering-stairs-bare-next', 'example:tin_stairs', {
    type: 'stairs',
    base_block: 'minecraft:copper_block',
    textures: { all: 'example:block/tin' },
    components: {
      'msm:weathering': { stage: 'oxidized', next: 'copper_block' },
      'msm:waxable': { into: 'waxed_copper_block' },
    },
  }),
  one(itemKind, 'bag-chest', 'example:satchel', {
    display_name: 'Satchel',
    model: 'example:item/satchel',
    max_stack_size: 1,
    components: {
      'msm:item_inventory': {
        layout: 'chest',
        rows: 2,
        open: 'sneak_use',
        open_sound: 'minecraft:item.armor.equip_leather',
        close_sound: 'minecraft:item.armor.equip_leather',
        on_open: 'example:opened',
      },
    },
    events: {
      'example:opened': { actions: [{ type: 'run_function', function: 'example:ruby/shimmer' }] },
    },
  }),
  one(itemKind, 'bag-hopper', 'example:seed_pouch', {
    model: 'example:item/seed_pouch',
    components: { 'msm:item_inventory': { layout: 'hopper', rows: 4 } },
  }),
  one(itemKind, 'bundle', 'example:pouch', {
    display_name: 'Pouch',
    max_stack_size: 1,
    bundle_textures: {
      closed: 'example:item/pouch',
      open_back: 'example:item/pouch_open_back',
      open_front: 'example:item/pouch_open_front',
    },
    components: { 'msm:bundle': {} },
  }),
  one(itemKind, 'bundle-model-only', 'example:sack', {
    model: 'example:item/sack',
    bundle_textures: { open_front: 'example:item/sack_open_front' },
    components: { 'msm:bundle': {} },
  }),
];

/** Every string in `value`, nested lists and objects included. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

/** The test indexes with every id the sample names or generates counted as a project id. */
function withSampleIds(indexes: TargetIndexes, sample: Sample, files: OutputFile[]): TargetIndexes {
  const ids = sample.elements.map((entry) => entry.id as string);
  const named = sample.elements.flatMap((entry) => strings(entry.data));
  const models = files
    .filter((file) => file.path.includes('/models/'))
    .map((file) => file.path.replace(/^assets\/([^/]+)\/models\/(.+)\.json$/, '$1:$2'));
  const isBlock = sample.kind === blockKind;
  const project: Record<string, readonly string[]> = {
    ...PROJECT_IDS,
    block: [...(PROJECT_IDS.block ?? []), ...(isBlock ? ids : [])],
    item: [...(PROJECT_IDS.item ?? []), ...ids],
    model: [
      ...(PROJECT_IDS.model ?? []),
      ...models,
      ...named.filter((id) => /^example:(block|item)\//.test(id)),
    ],
    texture: named.filter((id) => /^example:(block|item)\//.test(id)),
  };
  return { ...indexes, registries: createRegistryIndex({ vanilla: indexes.vanilla, project }) };
}

const fixturesRoot = new URL('./fixtures/', import.meta.url);

const recorded = (file: OutputFile): Record<string, unknown> => ({
  contents: file.contents,
  layer: file.layer,
  merge: file.merge,
  path: file.path,
  schema: file.schema,
});

async function lowerSample(sample: Sample, bundle = builtInTargets[0]): Promise<OutputFile[]> {
  if (bundle === undefined) throw new Error('no built-in target');
  const files: OutputFile[] = [];
  for (const entry of sample.elements) {
    files.push(
      ...(await sample.kind.lower(element(sample.kind.id, entry.id, entry.data), bundle.target)),
    );
  }
  return files;
}

const byName = (name: string): Sample => {
  const found = SAMPLES.find((sample) => sample.name === name);
  if (found === undefined) throw new Error(`no sample ${name}`);
  return found;
};

const contentsOf = (files: OutputFile[], suffix: string): JsonObject =>
  files.find((file) => file.path.endsWith(suffix))?.contents as JsonObject;

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'waterlogging, weathering, bags and bundles for %s',
  (targetId, bundle) => {
    it.each(SAMPLES.map((sample) => [sample.name, sample] as const))(
      '%s',
      async (_label, sample) => {
        const files = await lowerSample(sample, bundle);
        const indexes = withSampleIds(await indexesFor(bundle), sample, files);
        const problems = (schema: string, value: Json) => blockingProblems(indexes, schema, value);
        for (const entry of sample.elements) {
          expect(problems(sample.kind.schema, entry.data), entry.id).toEqual([]);
        }
        for (const file of files) {
          expect(file.schema, file.path).toBeDefined();
          if (file.schema === undefined) continue;
          expect(problems(file.schema, file.contents as Json), file.path).toEqual([]);
        }
        const actual = sortedJson(files.map(recorded));
        const url = new URL(
          `${targetId}/expected/${sample.kind.folder}/${sample.name}.json`,
          fixturesRoot,
        );
        if (UPDATE) {
          await mkdir(dirname(fileURLToPath(url)), { recursive: true });
          await writeFile(url, actual);
        }
        expect(actual).toBe(await readFile(url, 'utf8'));
      },
    );
  },
);

describe('waterlogging', () => {
  it('writes every variant twice with the same model', async () => {
    const files = await lowerSample(byName('waterlog-horizontal'));
    const state = contentsOf(files, '/blockstates/coral_shelf.json');
    const variants = state.variants as JsonObject;
    expect(Object.keys(variants)).toHaveLength(8);
    expect(variants['facing=east,waterlogged=true']).toEqual(
      variants['facing=east,waterlogged=false'],
    );
  });

  it('gives a container the property on top of open (ADR 0104 D3)', async () => {
    const files = await lowerSample(byName('waterlog-container'));
    const variants = contentsOf(files, '/blockstates/wet_crate.json').variants as JsonObject;
    expect(Object.keys(variants)).toEqual([
      'open=false,waterlogged=false',
      'open=false,waterlogged=true',
      'open=true,waterlogged=false',
      'open=true,waterlogged=true',
    ]);
  });

  it('leaves a multipart definition as it is', () => {
    const multipart = { multipart: [{ apply: { model: 'minecraft:block/stone' } }] };
    expect(withWaterloggedVariants(multipart)).toEqual(multipart);
  });
});

describe('weathering', () => {
  it('writes next and into as full ids in the definition', async () => {
    const files = await lowerSample(byName('weathering-stairs-bare-next'));
    const definition = contentsOf(files, 'msm/example/block/tin_stairs.json');
    expect(definition.components).toMatchObject({
      'msm:weathering': { stage: 'oxidized', next: 'minecraft:copper_block' },
      'msm:waxable': { into: 'minecraft:waxed_copper_block' },
    });
  });

  it('gives the waxed copies no weathering', async () => {
    const files = await lowerSample(TIN_SET);
    const waxed = contentsOf(files, 'msm/example/block/waxed_tin.json');
    expect(Object.keys(waxed.components as JsonObject)).toEqual(['msm:breakable']);
  });
});

describe('bags and bundles', () => {
  it('stack to 1 and drop rows outside the chest', async () => {
    const files = await lowerSample(byName('bag-hopper'));
    const definition = contentsOf(files, 'msm/example/item/seed_pouch.json');
    expect(definition.max_stack_size).toBe(1);
    expect(definition.components).toEqual({ 'msm:item_inventory': { layout: 'hopper' } });
  });

  it('draws a bundle in vanilla’s shape and leaves the pictures out of the definition', async () => {
    const files = await lowerSample(byName('bundle'));
    const definition = contentsOf(files, 'msm/example/item/pouch.json');
    expect(definition.bundle_textures).toBeUndefined();
    expect(definition.max_stack_size).toBe(1);
    expect(contentsOf(files, 'models/item/pouch_open_back.json').parent).toBe(
      BUNDLE_OPEN_BACK_PARENT,
    );
    expect(contentsOf(files, 'models/item/pouch_open_front.json').parent).toBe(
      BUNDLE_OPEN_FRONT_PARENT,
    );
    const model = contentsOf(files, 'items/pouch.json').model as JsonObject;
    expect(model.fallback).toEqual({ type: 'minecraft:model', model: 'example:item/pouch' });
  });

  it('a bundle without pictures or model has no item model definition', async () => {
    const files = await lowerSample(
      one(itemKind, 'bare', 'example:bare', { components: { 'msm:bundle': {} } }),
    );
    expect(files.map((file) => file.path)).toEqual(['msm/example/item/bare.json']);
  });
});
