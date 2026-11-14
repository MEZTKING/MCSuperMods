/**
 * Golden tests of the plant types (ADR 0068 D3, D4, D6; B264): crops, saplings and leaves are
 * lowered for every built-in target, every output is validated against the schema it declares
 * (loot tables against each target's loot schema), and the outputs are compared with
 * `fixtures/<target id>/expected/block/plant-<name>.json`. Set `UPDATE_GOLDENS=1` to rewrite
 * the expected files instead of comparing.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Json, JsonObject, OutputFile, ResourceLocation } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { BLOCK_TYPE_MODEL_SLOTS, blockKind } from '../src/index';
import { CROP_BLOCK_TAGS, CROP_ITEM_TAGS, stageModelIndex } from '../src/lowering/types/crop';
import { LEAVES_BLOCK_TAGS, LEAVES_ITEM_TAGS, opaqueArgb } from '../src/lowering/types/leaves';
import { SAPLING_TAGS } from '../src/lowering/types/sapling';
import {
  blockingProblems,
  element,
  indexesFor,
  PROJECT_IDS,
  sortedJson,
  type TargetIndexes,
} from './support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

interface PlantSample {
  name: string;
  id: ResourceLocation;
  data: JsonObject;
}

const sample = (name: string, id: string, data: JsonObject): PlantSample => ({
  name: `plant-${name}`,
  id: id as ResourceLocation,
  data: { format: 1, ...data },
});

const SAMPLES: PlantSample[] = [
  sample('crop', 'example:tomatoes', {
    type: 'crop',
    display_name: 'Tomatoes',
    textures: {
      stages: [
        'example:block/tomatoes_stage0',
        'example:block/tomatoes_stage1',
        'example:block/tomatoes_stage2',
        'example:block/tomatoes_stage3',
      ],
    },
    item: { id: 'example:tomato_seeds' },
    loot: 'crop',
    crop_drops: { produce: 'example:tomato', produce_count: { min: 1, max: 3 } },
  }),
  sample('crop-produce', 'example:onions', {
    type: 'crop',
    max_age: 3,
    textures: {
      stages: [
        'example:block/onions_stage0',
        'example:block/onions_stage1',
        'example:block/onions_stage2',
        'example:block/onions_stage3',
        'example:block/onions_stage4',
      ],
    },
    item: { id: 'example:onion' },
    loot: 'crop',
    crop_drops: { produce: 'example:onion' },
  }),
  sample('crop-models', 'example:glow_berries_crop', {
    type: 'crop',
    max_age: 5,
    models: {
      stage0: 'example:block/glow_crop_small',
      stage1: 'example:block/glow_crop_medium',
      stage2: 'example:block/glow_crop_ripe',
      item: 'example:item/glow_seeds',
    },
    villager_plantable: false,
    loot: 'crop',
    crop_drops: { produce: 'example:glow_fruit', produce_count: 2, seed_bonus: false },
  }),
  sample('crop-no-item', 'example:wild_wheat', {
    type: 'crop',
    max_age: 1,
    textures: { stages: ['example:block/wild_wheat_stage0', 'example:block/wild_wheat_stage1'] },
    item: false,
    loot: 'crop',
    crop_drops: { produce: 'minecraft:wheat' },
  }),
  sample('sapling', 'example:ruby_sapling', {
    type: 'sapling',
    display_name: 'Ruby Sapling',
    tree: 'minecraft:oak',
    textures: { sapling: 'example:block/ruby_sapling' },
    loot: 'self',
  }),
  sample('sapling-models', 'example:glow_sapling', {
    type: 'sapling',
    tree: 'minecraft:birch',
    mega_tree: 'minecraft:mega_spruce',
    models: { sapling: 'example:block/glow_sapling_cross', item: 'example:item/glow_sapling' },
  }),
  sample('leaves', 'example:ruby_leaves', {
    type: 'leaves',
    display_name: 'Ruby Leaves',
    tint: 'foliage',
    textures: { all: 'example:block/ruby_leaves' },
    loot: 'leaves',
    leaves_drops: {
      sapling: 'example:ruby_sapling',
      extra: { item: 'example:ruby' },
    },
  }),
  sample('leaves-colour', 'example:glow_leaves', {
    type: 'leaves',
    tint: 0x4a8f2b,
    models: { leaves: 'example:block/glow_leaves_custom' },
    loot: 'leaves',
    leaves_drops: { sticks: false, extra: { item: 'minecraft:apple', chances: [0.1, 0.2] } },
  }),
  sample('leaves-grass', 'example:moss_leaves', {
    type: 'leaves',
    tint: 'grass',
    textures: { all: 'example:block/moss_leaves' },
  }),
  sample('leaves-untinted', 'example:blossom_leaves', {
    type: 'leaves',
    falling_particle: 'minecraft:cherry_leaves',
    textures: { all: 'example:block/blossom_leaves' },
    loot: 'self',
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
 * The test indexes with the ids a plant sample brings into the project: its block, its block
 * item, the items its loot preset names, the models it names or generates and its textures.
 */
function withSampleIds(
  indexes: TargetIndexes,
  plant: PlantSample,
  files: OutputFile[],
): TargetIndexes {
  const { data } = plant;
  const item = data.item as Record<string, unknown> | false | undefined;
  const itemIds = item === false ? [] : [String(item?.id ?? plant.id)];
  const modelIds = files
    .filter((file) => file.path.includes('/models/'))
    .map((file) => file.path.replace(/^assets\/([^/]+)\/models\/(.+)\.json$/, '$1:$2'));
  const lootItems = [...strings(data.crop_drops), ...strings(data.leaves_drops)].filter(
    (id) => id.startsWith('example:') && !id.startsWith('example:ruby'),
  );
  const project: Record<string, readonly string[]> = {
    ...PROJECT_IDS,
    block: [...(PROJECT_IDS.block ?? []), plant.id],
    item: [...(PROJECT_IDS.item ?? []), ...itemIds, ...lootItems, 'example:ruby_sapling'],
    model: [...(PROJECT_IDS.model ?? []), ...modelIds, ...strings(data.models)],
    texture: strings(data.textures),
  };
  return { ...indexes, registries: createRegistryIndex({ vanilla: indexes.vanilla, project }) };
}

const fixturesRoot = new URL('./fixtures/', import.meta.url);

const fixtureUrl = (targetId: string, plant: PlantSample): URL =>
  new URL(`${targetId}/expected/${blockKind.folder}/${plant.name}.json`, fixturesRoot);

const recorded = (file: OutputFile): Record<string, unknown> => ({
  contents: file.contents,
  layer: file.layer,
  merge: file.merge,
  path: file.path,
  schema: file.schema,
});

const lower = async (plant: PlantSample, targetIndex = 0): Promise<OutputFile[]> => {
  const target = builtInTargets[targetIndex]?.target;
  if (target === undefined) throw new Error('no built-in target');
  return blockKind.lower(element(blockKind.id, plant.id, plant.data), target);
};

const byName = (name: string): PlantSample => {
  const found = SAMPLES.find((entry) => entry.name === `plant-${name}`);
  if (found === undefined) throw new Error(`no sample ${name}`);
  return found;
};

const contentsOf = (files: OutputFile[], suffix: string): Json | undefined =>
  files.find((file) => file.path.endsWith(suffix))?.contents as Json | undefined;

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'plant lowering for %s',
  (targetId, bundle) => {
    it.each(SAMPLES.map((plant) => [plant.name, plant] as const))('%s', async (_label, plant) => {
      const files = await blockKind.lower(
        element(blockKind.id, plant.id, plant.data),
        bundle.target,
      );
      const indexes = withSampleIds(await indexesFor(bundle), plant, files);
      const problems = (schema: string, value: Json) => blockingProblems(indexes, schema, value);
      expect(problems(blockKind.schema, plant.data)).toEqual([]);
      for (const file of files) {
        expect(file.schema, file.path).toBeDefined();
        if (file.schema === undefined) continue;
        expect(problems(file.schema, file.contents as Json), file.path).toEqual([]);
      }

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
      for (const tag of [...CROP_BLOCK_TAGS, ...SAPLING_TAGS, ...LEAVES_BLOCK_TAGS])
        expect(registries.has('tag/block', `minecraft:${tag}`), tag).toBe(true);
      for (const tag of [...CROP_ITEM_TAGS, ...SAPLING_TAGS, ...LEAVES_ITEM_TAGS])
        expect(registries.has('tag/item', `minecraft:${tag}`), tag).toBe(true);
    });
  },
);

describe('plant types', () => {
  it('names the plant model slots', () => {
    expect(BLOCK_TYPE_MODEL_SLOTS.crop).toEqual([
      ...Array.from({ length: 16 }, (_, index) => `stage${index}`),
      'item',
    ]);
    expect(BLOCK_TYPE_MODEL_SLOTS.sapling).toEqual(['sapling', 'item']);
    expect(BLOCK_TYPE_MODEL_SLOTS.leaves).toEqual(['leaves', 'item']);
  });

  it('spreads fewer stage models over the ages, first and last kept', () => {
    const spread = (count: number, stages: number) =>
      Array.from({ length: stages }, (_, age) => stageModelIndex(age, count, stages));
    expect(spread(4, 8)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(spread(8, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(spread(1, 8)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(spread(3, 6)).toEqual([0, 0, 1, 1, 2, 2]);
    for (let stages = 2; stages <= 16; stages += 1) {
      for (let count = 1; count <= stages; count += 1) {
        const ages = spread(count, stages);
        expect(ages[0]).toBe(0);
        expect(ages.at(-1)).toBe(count - 1);
      }
    }
  });

  it('writes one model per stage texture and an age variant per stage', async () => {
    const files = await lower(byName('crop'));
    const models = files.filter((file) => file.path.includes('/models/block/'));
    expect(models.map((file) => file.contents)).toEqual(
      [0, 1, 2, 3].map((stage) => ({
        parent: 'minecraft:block/crop',
        textures: { crop: `example:block/tomatoes_stage${stage}` },
      })),
    );
    const state = files[models.length + 1]?.contents as { variants: Record<string, Json> };
    expect(Object.keys(state.variants)).toEqual(
      Array.from({ length: 8 }, (_, age) => `age=${age}`),
    );
    expect(state.variants['age=7']).toEqual({ model: 'example:block/tomatoes_stage3' });
  });

  it('uses only the textures the stages need', async () => {
    const files = await lower(byName('crop-produce'));
    expect(files.filter((file) => file.path.includes('/models/block/'))).toHaveLength(4);
  });

  it('writes no appearance for a plant without textures or models', async () => {
    for (const type of ['crop', 'sapling', 'leaves']) {
      const files = await lower(sample('bare', 'example:bare', { type }));
      expect(
        files.some((file) => file.path.startsWith('assets/') && !file.path.includes('/lang/')),
        type,
      ).toBe(false);
    }
  });

  it('writes the crop preset in wheat shape and the produce-planted crop as potatoes', async () => {
    const wheat = contentsOf(await lower(byName('crop')), '/blocks/tomatoes.json') as JsonObject;
    expect(wheat.modifier).toEqual({ type: 'minecraft:explosion_decay' });
    expect(wheat.pools).toHaveLength(2);
    const potatoes = contentsOf(
      await lower(byName('crop-produce')),
      '/blocks/onions.json',
    ) as JsonObject;
    expect((potatoes.pools as JsonObject[])[0]).toEqual({
      entries: [{ type: 'minecraft:item', name: 'example:onion' }],
      rolls: 1,
    });
    expect(JSON.stringify(potatoes)).toContain('"age":"3"');
  });

  it('writes no crop table without a produce or on another type', async () => {
    const noProduce = await lower(
      sample('np', 'example:np', { type: 'crop', loot: 'crop', crop_drops: {} }),
    );
    expect(noProduce.some((file) => file.path.includes('loot_table'))).toBe(false);
    const block = await lower(
      sample('nc', 'example:nc', {
        loot: 'crop',
        crop_drops: { produce: 'minecraft:wheat' },
      }),
    );
    expect(block.some((file) => file.path.includes('loot_table'))).toBe(false);
  });

  it('leaves a crop out of villager_plantable_seeds when vetoed', async () => {
    const files = await lower(byName('crop-models'));
    expect(files.some((file) => file.path.endsWith('/villager_plantable_seeds.json'))).toBe(false);
    const planted = await lower(byName('crop'));
    expect(
      contentsOf(planted, '/item/villager_plantable_seeds.json') as JsonObject | undefined,
    ).toEqual({ values: ['example:tomato_seeds'] });
  });

  it('tints the leaves item as vanilla does', async () => {
    const tintOf = async (name: string) => {
      const files = await lower(byName(name));
      const id = byName(name).id.split(':')[1] as string;
      const definition = files.find(
        (file) => file.path.includes('/items/') && file.path.endsWith(`/${id}.json`),
      )?.contents as { model: { tints?: Json[] } };
      return definition.model.tints;
    };
    expect(await tintOf('leaves')).toEqual([{ type: 'minecraft:constant', value: -12012264 }]);
    expect(await tintOf('leaves-colour')).toEqual([
      { type: 'minecraft:constant', value: opaqueArgb(0x4a8f2b) },
    ]);
    expect(await tintOf('leaves-grass')).toEqual([
      { type: 'minecraft:grass', downfall: 1, temperature: 0.5 },
    ]);
    expect(await tintOf('leaves-untinted')).toBeUndefined();
    expect(opaqueArgb(0x48b518)).toBe(-12012264);
  });

  it('writes no leaves table when nothing can drop', async () => {
    const files = await lower(
      sample('nothing', 'example:nothing', {
        type: 'leaves',
        item: false,
        loot: 'leaves',
        leaves_drops: { sticks: false },
      }),
    );
    expect(files.some((file) => file.path.includes('loot_table'))).toBe(false);
  });

  it('strips the plant editor fields from the definition', async () => {
    const [definition] = await lower(byName('crop'));
    expect(definition?.contents).toEqual({
      format: 1,
      type: 'crop',
      item: { id: 'example:tomato_seeds' },
    });
  });
});
