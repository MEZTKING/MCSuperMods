/**
 * Golden tests of the plant and food types of ADR 0094 (B447): `cake`, `berry_bush`,
 * `tall_plant`, `potted_plant`, `vine`, `sea_pickle`, `carpet`, `layers`, `cocoa`, `candle` and
 * the crop's `soil`. Each sample is lowered for every built-in target, every output is validated
 * against the schema it declares, and the outputs are compared with
 * `fixtures/<target id>/expected/block/plant2-<name>.json`. Set `UPDATE_GOLDENS=1` to rewrite the
 * expected files instead of comparing. Also: the tags are checked against both targets' vendored
 * registries, the generated parents against `BlockFacts.modelTemplates`, and each type's
 * defaults (the kind's default data turned into the type) lower and validate with no problem.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Element,
  Json,
  JsonObject,
  OutputFile,
  Problem,
  ResourceLocation,
} from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, { BLOCK_TYPE_MODEL_SLOTS, blockKind } from '../src/index';
import { BERRY_BUSH_BLOCK_TAGS } from '../src/lowering/types/berry-bush';
import { CANDLE_TAGS } from '../src/lowering/types/candle';
import { CROP_BLOCK_TAGS, CROP_ITEM_TAGS } from '../src/lowering/types/crop';
import { POTTED_PLANT_BLOCK_TAGS } from '../src/lowering/types/potted-plant';
import { VINE_BLOCK_TAGS } from '../src/lowering/types/vine';
import {
  blockingProblems,
  element,
  indexesFor,
  PROJECT_IDS,
  sortedJson,
  type TargetIndexes,
} from './support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

/** The types of this brief. */
const TYPES = [
  'cake',
  'berry_bush',
  'tall_plant',
  'potted_plant',
  'vine',
  'sea_pickle',
  'carpet',
  'layers',
  'cocoa',
  'candle',
] as const;

interface Sample {
  name: string;
  id: ResourceLocation;
  data: JsonObject;
}

const sample = (name: string, id: string, data: JsonObject): Sample => ({
  name: `plant2-${name}`,
  id: id as ResourceLocation,
  data: { format: 1, ...data },
});

const SAMPLES: Sample[] = [
  sample('cake', 'example:berry_cake', {
    type: 'cake',
    display_name: 'Berry Cake',
    food: { nutrition: 3, saturation: 0.2 },
    textures: {
      top: 'example:block/berry_cake_top',
      bottom: 'example:block/berry_cake_bottom',
      side: 'example:block/berry_cake_side',
      inside: 'example:block/berry_cake_inner',
      item: 'example:item/berry_cake',
    },
    item: { max_stack_size: 1 },
    loot: 'self',
  }),
  sample('cake-models', 'example:moss_cake', {
    type: 'cake',
    models: { cake: 'example:block/moss_cake', slice1: 'example:block/moss_cake_slice' },
  }),
  sample('berry-bush', 'example:blue_berry_bush', {
    type: 'berry_bush',
    berry: 'example:blue_berries',
    harvest: { ripe: [1, 1], full: [2, 4] },
    textures: {
      stages: [
        'example:block/blue_berry_bush_stage0',
        'example:block/blue_berry_bush_stage1',
        'example:block/blue_berry_bush_stage2',
        'example:block/blue_berry_bush_stage3',
      ],
    },
    item: { id: 'example:blue_berries' },
    loot: 'self',
  }),
  sample('berry-bush-two-stages', 'example:thorn_bush', {
    type: 'berry_bush',
    berry: 'minecraft:sweet_berries',
    hurts: false,
    textures: { stages: ['example:block/thorn_bush_young', 'example:block/thorn_bush_ripe'] },
    loot: 'self',
  }),
  sample('tall-plant', 'example:tall_bluebell', {
    type: 'tall_plant',
    display_name: 'Tall Bluebell',
    textures: {
      top: 'example:block/tall_bluebell_top',
      bottom: 'example:block/tall_bluebell_bottom',
    },
    loot: 'self',
  }),
  sample('potted-plant', 'example:potted_ruby_sapling', {
    type: 'potted_plant',
    plant: 'example:ruby_sprout',
    textures: { plant: 'example:block/ruby_sprout_small' },
    loot: 'self',
  }),
  sample('potted-plant-vanilla', 'example:potted_short_grass', {
    type: 'potted_plant',
    plant: 'minecraft:short_grass',
    loot: 'self',
  }),
  sample('vine', 'example:ivy', {
    type: 'vine',
    spreads: false,
    textures: { texture: 'example:block/ivy' },
    loot: 'self',
  }),
  sample('sea-pickle', 'example:glow_pod', {
    type: 'sea_pickle',
    textures: { all: 'example:block/glow_pod' },
    loot: 'self',
  }),
  sample('carpet', 'example:moss_rug', {
    type: 'carpet',
    textures: { texture: 'example:block/moss_rug' },
    loot: 'self',
  }),
  sample('layers', 'example:ash_layer', {
    type: 'layers',
    display_name: 'Ash',
    textures: { texture: 'example:block/ash' },
    loot: 'self',
  }),
  sample('cocoa', 'example:coffee_pod', {
    type: 'cocoa',
    support: '#minecraft:logs',
    textures: { stages: ['example:block/coffee_pod_small', 'example:block/coffee_pod_ripe'] },
    item: { id: 'example:coffee_beans' },
    loot: 'self',
  }),
  sample('candle', 'example:wax_candle', {
    type: 'candle',
    textures: {
      candle: 'example:block/wax_candle',
      lit: 'example:block/wax_candle_lit',
      item: 'example:item/wax_candle',
    },
    loot: 'self',
  }),
  sample('candle-models', 'example:tallow_candle', {
    type: 'candle',
    models: {
      one: 'example:block/tallow_one',
      two: 'example:block/tallow_two',
      three: 'example:block/tallow_three',
      four: 'example:block/tallow_four',
      one_lit: 'example:block/tallow_one_lit',
    },
  }),
  sample('crop-soil', 'example:soul_wart', {
    type: 'crop',
    max_age: 3,
    soil: '#minecraft:soul_fire_base_blocks',
    villager_plantable: false,
    textures: {
      stages: ['example:block/soul_wart_stage0', 'example:block/soul_wart_stage1'],
    },
    loot: 'crop',
    crop_drops: { produce: 'example:soul_wart' },
  }),
];

/** Every string in `value`, nested lists and objects included. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

/**
 * The test indexes with the ids a sample brings into the project: its block, its block item,
 * the items it names, the models it names or generates and the textures of its models.
 */
function withSampleIds(indexes: TargetIndexes, plant: Sample, files: OutputFile[]): TargetIndexes {
  const { data } = plant;
  const item = data.item as Record<string, unknown> | false | undefined;
  const itemIds = item === false ? [] : [String(item?.id ?? plant.id)];
  const models = files.filter((file) => file.path.includes('/models/'));
  const modelIds = models.map((file) =>
    file.path.replace(/^assets\/([^/]+)\/models\/(.+)\.json$/, '$1:$2'),
  );
  const named = [data.berry, data.plant, ...strings(data.crop_drops)].filter(
    (id): id is string => typeof id === 'string' && id.startsWith('example:'),
  );
  const project: Record<string, readonly string[]> = {
    ...PROJECT_IDS,
    block: [...(PROJECT_IDS.block ?? []), plant.id],
    item: [...(PROJECT_IDS.item ?? []), ...itemIds, ...named],
    model: [...(PROJECT_IDS.model ?? []), ...modelIds, ...strings(data.models)],
    texture: [
      ...strings(data.textures),
      ...models.flatMap((file) => strings((file.contents as JsonObject).textures)),
    ],
  };
  return { ...indexes, registries: createRegistryIndex({ vanilla: indexes.vanilla, project }) };
}

const fixturesRoot = new URL('./fixtures/', import.meta.url);

const fixtureUrl = (targetId: string, plant: Sample): URL =>
  new URL(`${targetId}/expected/${blockKind.folder}/${plant.name}.json`, fixturesRoot);

const recorded = (file: OutputFile): Record<string, unknown> => ({
  contents: file.contents,
  layer: file.layer,
  merge: file.merge,
  path: file.path,
  schema: file.schema,
});

const firstBundle = builtInTargets[0] as TargetBundle;

const lower = (plant: Sample, bundle: TargetBundle = firstBundle): Promise<OutputFile[]> =>
  Promise.resolve(blockKind.lower(element(blockKind.id, plant.id, plant.data), bundle.target));

const byName = (name: string): Sample => {
  const found = SAMPLES.find((entry) => entry.name === `plant2-${name}`);
  if (found === undefined) throw new Error(`no sample ${name}`);
  return found;
};

const contentsOf = (files: OutputFile[], suffix: string): JsonObject | undefined =>
  files.find((file) => file.path.endsWith(suffix))?.contents as JsonObject | undefined;

const variantsOf = (files: OutputFile[], path: string): Record<string, Json> =>
  (contentsOf(files, `/blockstates/${path}.json`) as { variants: Record<string, Json> }).variants;

/** Lowered files and every schema problem of them and of the element, against `bundle`. */
async function lowerAndCheck(plant: Sample, bundle: TargetBundle) {
  const files = await lower(plant, bundle);
  const indexes = withSampleIds(await indexesFor(bundle), plant, files);
  const problems: string[] = [];
  const check = (schema: string, value: Json, where: string) => {
    for (const problem of blockingProblems(indexes, schema, value)) {
      problems.push(`${where}: ${problem.code} ${problem.message}`);
    }
  };
  check(blockKind.schema, plant.data, 'element');
  for (const file of files) {
    if (file.schema === undefined) problems.push(`${file.path}: no schema`);
    else check(file.schema, file.contents as Json, file.path);
  }
  return { files, problems, indexes };
}

/**
 * The defaults of `type`: the kind's default data turned into the type as the Block Studio does
 * (no single `model`), with the type's required fields and one texture in its first slot.
 */
function defaultsOf(type: (typeof TYPES)[number]): Sample {
  const { model: _model, ...base } = blockKind.defaultData as JsonObject;
  const id = `demo:default_${type}`;
  const fields: Record<string, JsonObject> = {
    cake: { textures: { top: 'demo:block/default_cake' } },
    berry_bush: { berry: id, textures: { stages: ['demo:block/default_berry_bush'] } },
    tall_plant: { textures: { top: 'demo:block/default_tall_plant' } },
    potted_plant: { plant: 'minecraft:short_grass' },
    vine: { textures: { texture: 'demo:block/default_vine' } },
    sea_pickle: { textures: { texture: 'demo:block/default_sea_pickle' } },
    carpet: { textures: { texture: 'demo:block/default_carpet' } },
    layers: { textures: { texture: 'demo:block/default_layers' } },
    cocoa: { textures: { stages: ['demo:block/default_cocoa'] } },
    candle: { textures: { candle: 'demo:block/default_candle' } },
  };
  return {
    name: `defaults-${type}`,
    id: id as ResourceLocation,
    data: { ...base, type, ...fields[type] },
  };
}

async function validatorProblems(elements: Element[], bundle: TargetBundle): Promise<Problem[]> {
  const { registries } = await indexesFor(bundle);
  const results = await Promise.all(
    (plugin.contributes.validators ?? []).map((validator) =>
      validator.validate({ elements, target: bundle.target, registry: registries }),
    ),
  );
  return results.flat();
}

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'plant and food lowering for %s',
  (targetId, bundle) => {
    it.each(SAMPLES.map((plant) => [plant.name, plant] as const))('%s', async (_label, plant) => {
      const { files, problems } = await lowerAndCheck(plant, bundle);
      expect(problems).toEqual([]);
      const actual = sortedJson(files.map(recorded));
      const url = fixtureUrl(targetId, plant);
      if (UPDATE) {
        await mkdir(dirname(fileURLToPath(url)), { recursive: true });
        await writeFile(url, actual);
      }
      expect(actual).toBe(await readFile(url, 'utf8'));
    });

    it('names only tags the target has', async () => {
      const { registries } = await indexesFor(bundle);
      const blockTags = [
        ...BERRY_BUSH_BLOCK_TAGS,
        ...CANDLE_TAGS,
        ...POTTED_PLANT_BLOCK_TAGS,
        ...VINE_BLOCK_TAGS,
        ...CROP_BLOCK_TAGS,
      ];
      for (const tag of blockTags) {
        expect(registries.has('tag/block', `minecraft:${tag}`), tag).toBe(true);
      }
      for (const tag of [...CANDLE_TAGS, ...CROP_ITEM_TAGS]) {
        expect(registries.has('tag/item', `minecraft:${tag}`), tag).toBe(true);
      }
      // Every tag file the samples write names a vanilla tag of the target.
      for (const plant of SAMPLES) {
        for (const file of await lower(plant, bundle)) {
          const match = /^data\/minecraft\/tags\/(block|item)\/(.+)\.json$/.exec(file.path);
          if (match === null) continue;
          expect(registries.has(`tag/${match[1]}`, `minecraft:${match[2]}`), file.path).toBe(true);
        }
      }
    });

    it('parents every generated block model on a template the target lists', async () => {
      const templates = new Set(bundle.target.blocks?.modelTemplates ?? []);
      expect(templates.size).toBeGreaterThan(0);
      for (const plant of SAMPLES.filter((entry) => entry.data.type !== 'crop')) {
        for (const file of await lower(plant, bundle)) {
          if (!file.path.includes('/models/block/')) continue;
          const parent = (file.contents as JsonObject).parent as string;
          expect(templates.has(parent), `${file.path}: ${parent}`).toBe(true);
        }
      }
    });

    it.each(TYPES.map((type) => [type] as const))(
      'lowers and validates the defaults of %s with no problem',
      async (type) => {
        const plant = defaultsOf(type);
        const { files, problems } = await lowerAndCheck(plant, bundle);
        expect(problems).toEqual([]);
        expect(files.some((file) => file.path.includes('/blockstates/'))).toBe(true);
        expect(
          await validatorProblems([element(blockKind.id, plant.id, plant.data)], bundle),
        ).toEqual([]);
      },
    );
  },
);

describe('plant and food types', () => {
  it('names the model slots', () => {
    expect(BLOCK_TYPE_MODEL_SLOTS.cake).toEqual([
      'cake',
      'slice1',
      'slice2',
      'slice3',
      'slice4',
      'slice5',
      'slice6',
      'item',
    ]);
    expect(BLOCK_TYPE_MODEL_SLOTS.berry_bush).toEqual([
      'stage0',
      'stage1',
      'stage2',
      'stage3',
      'item',
    ]);
    expect(BLOCK_TYPE_MODEL_SLOTS.tall_plant).toEqual(['bottom', 'top', 'item']);
    expect(BLOCK_TYPE_MODEL_SLOTS.potted_plant).toEqual(['potted', 'item']);
    expect(BLOCK_TYPE_MODEL_SLOTS.vine).toEqual(['vine', 'item']);
    expect(BLOCK_TYPE_MODEL_SLOTS.sea_pickle).toEqual([
      'one',
      'two',
      'three',
      'four',
      'dead_one',
      'dead_two',
      'dead_three',
      'dead_four',
      'item',
    ]);
    expect(BLOCK_TYPE_MODEL_SLOTS.carpet).toEqual(['carpet', 'item']);
    expect(BLOCK_TYPE_MODEL_SLOTS.layers).toEqual([
      ...Array.from({ length: 8 }, (_, index) => `layers${index + 1}`),
      'item',
    ]);
    expect(BLOCK_TYPE_MODEL_SLOTS.cocoa).toEqual(['stage0', 'stage1', 'stage2', 'item']);
    expect(BLOCK_TYPE_MODEL_SLOTS.candle).toEqual([
      'one',
      'two',
      'three',
      'four',
      'one_lit',
      'two_lit',
      'three_lit',
      'four_lit',
      'item',
    ]);
  });

  it('writes the cake bites and drops only a whole cake', async () => {
    const files = await lower(byName('cake'));
    expect(Object.keys(variantsOf(files, 'berry_cake'))).toEqual(
      Array.from({ length: 7 }, (_, bites) => `bites=${bites}`),
    );
    expect(variantsOf(files, 'berry_cake')['bites=6']).toEqual({
      model: 'example:block/berry_cake_slice6',
    });
    const loot = JSON.stringify(contentsOf(files, '/loot_table/blocks/berry_cake.json'));
    expect(loot).toContain('"bites":"0"');
    expect(contentsOf(files, '/models/item/berry_cake.json')).toEqual({
      parent: 'minecraft:item/generated',
      textures: { layer0: 'example:item/berry_cake' },
    });
  });

  it('spreads fewer bush textures over the four ages and drops berries by age', async () => {
    const files = await lower(byName('berry-bush-two-stages'));
    const variants = variantsOf(files, 'thorn_bush');
    expect(Object.values(variants)).toEqual([
      { model: 'example:block/thorn_bush_stage0' },
      { model: 'example:block/thorn_bush_stage0' },
      { model: 'example:block/thorn_bush_stage1' },
      { model: 'example:block/thorn_bush_stage1' },
    ]);
    const loot = contentsOf(files, '/loot_table/blocks/thorn_bush.json') as {
      pools: JsonObject[];
    };
    expect(loot.pools.map((pool) => (pool.condition as JsonObject).state)).toEqual([
      { age: '3' },
      { age: '2' },
    ]);
    expect(JSON.stringify(loot)).toContain('"name":"minecraft:sweet_berries"');
    const custom = contentsOf(
      await lower(byName('berry-bush')),
      '/loot_table/blocks/blue_berry_bush.json',
    ) as { pools: { modifier: JsonObject[] }[] };
    expect(custom.pools.map((pool) => pool.modifier[0]?.count)).toEqual([
      { type: 'minecraft:uniform', max: 4, min: 2 },
      1,
    ]);
  });

  it('drops a tall plant from its lower half', async () => {
    const loot = JSON.stringify(
      contentsOf(await lower(byName('tall-plant')), '/loot_table/blocks/tall_bluebell.json'),
    );
    expect(loot).toContain('"half":"lower"');
    expect(loot).not.toContain('"half":"upper"');
  });

  it('drops the pot and the plant, and draws a vanilla plant from its own texture', async () => {
    const files = await lower(byName('potted-plant-vanilla'));
    const loot = contentsOf(files, '/loot_table/blocks/potted_short_grass.json') as {
      pools: { entries: JsonObject[] }[];
    };
    expect(loot.pools.map((pool) => pool.entries[0]?.name)).toEqual([
      'minecraft:flower_pot',
      'minecraft:short_grass',
    ]);
    expect(contentsOf(files, '/models/block/potted_short_grass.json')).toEqual({
      parent: 'minecraft:block/flower_pot_cross',
      textures: { plant: 'minecraft:block/short_grass' },
    });
    expect(contentsOf(files, '/tags/block/flower_pots.json')).toEqual({
      values: ['example:potted_short_grass'],
    });
  });

  it('writes the vine multipart with a fallback for no side', async () => {
    const state = contentsOf(await lower(byName('vine')), '/blockstates/ivy.json') as {
      multipart: JsonObject[];
    };
    expect(state.multipart).toHaveLength(10);
    expect(state.multipart[0]).toEqual({
      apply: { model: 'example:block/ivy' },
      when: { north: 'true' },
    });
    expect(state.multipart[9]).toEqual({
      apply: { model: 'example:block/ivy', uvlock: true, x: 270 },
      when: { east: 'false', north: 'false', south: 'false', up: 'false', west: 'false' },
    });
  });

  it('writes sea pickles and candles by count, with dead and lit forms', async () => {
    const pickles = await lower(byName('sea-pickle'));
    const pickleState = variantsOf(pickles, 'glow_pod');
    expect(Object.keys(pickleState)).toHaveLength(8);
    expect(pickleState['pickles=2,waterlogged=false']).toEqual([
      { model: 'example:block/glow_pod_dead_two' },
      { model: 'example:block/glow_pod_dead_two', y: 90 },
      { model: 'example:block/glow_pod_dead_two', y: 180 },
      { model: 'example:block/glow_pod_dead_two', y: 270 },
    ]);
    const pickleLoot = JSON.stringify(contentsOf(pickles, '/loot_table/blocks/glow_pod.json'));
    expect(pickleLoot).toContain('"pickles":"4"');
    const candles = await lower(byName('candle-models'));
    const candleState = variantsOf(candles, 'tallow_candle');
    expect(candleState['candles=1,lit=true']).toEqual({ model: 'example:block/tallow_one_lit' });
    expect(candleState['candles=2,lit=true']).toEqual({ model: 'example:block/tallow_two' });
  });

  it('writes layers up to a full block and drops one item per layer', async () => {
    const files = await lower(byName('layers'));
    const state = variantsOf(files, 'ash_layer');
    expect(state['layers=1']).toEqual({ model: 'example:block/ash_layer_height2' });
    expect(state['layers=8']).toEqual({ model: 'example:block/ash_layer_block' });
    expect(contentsOf(files, '/models/block/ash_layer_block.json')).toEqual({
      parent: 'minecraft:block/cube_all',
      textures: { all: 'example:block/ash' },
    });
    expect(contentsOf(files, '/items/ash_layer.json')).toEqual({
      model: { type: 'minecraft:model', model: 'example:block/ash_layer_height2' },
    });
    expect(JSON.stringify(contentsOf(files, '/loot_table/blocks/ash_layer.json'))).toContain(
      '"layers":"8"',
    );
  });

  it('turns cocoa pods by facing and grows them by age', async () => {
    const files = await lower(byName('cocoa'));
    const state = variantsOf(files, 'coffee_pod');
    expect(Object.keys(state)).toHaveLength(12);
    expect(state['age=2,facing=east']).toEqual({
      model: 'example:block/coffee_pod_stage2',
      y: 270,
    });
    expect(contentsOf(files, '/models/block/coffee_pod_stage1.json')).toEqual({
      parent: 'minecraft:block/cocoa_stage1',
      textures: {
        cocoa: 'example:block/coffee_pod_small',
        particle: 'example:block/coffee_pod_small',
      },
    });
    expect(contentsOf(files, '/items/coffee_beans.json')).toEqual({
      model: { type: 'minecraft:model', model: 'example:block/coffee_pod_stage2' },
    });
  });

  it('keeps the soil of a crop in the definition and its tags on any soil', async () => {
    const files = await lower(byName('crop-soil'));
    expect(files[0]?.contents).toEqual({
      format: 1,
      type: 'crop',
      max_age: 3,
      soil: '#minecraft:soul_fire_base_blocks',
    });
    const tags = files.filter((file) => file.path.includes('/tags/')).map((file) => file.path);
    expect(tags).toEqual(CROP_BLOCK_TAGS.map((tag) => `data/minecraft/tags/block/${tag}.json`));
  });

  it('keeps the type fields in the definition and strips the editor fields', async () => {
    const [definition] = await lower(byName('berry-bush'));
    expect(definition?.contents).toEqual({
      format: 1,
      type: 'berry_bush',
      berry: 'example:blue_berries',
      harvest: { ripe: [1, 1], full: [2, 4] },
      item: { id: 'example:blue_berries' },
    });
  });
});
