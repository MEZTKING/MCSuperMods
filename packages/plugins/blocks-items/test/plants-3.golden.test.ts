/**
 * Golden tests of the growing and climbing plant types of ADR 0103 (B511): `growing_plant`,
 * `column_plant`, `multiface` and `dripleaf`. Each sample is lowered for every built-in target,
 * every output is validated against the schema it declares, and the outputs are compared with
 * `fixtures/<target id>/expected/block/plant3-<name>.json`. Set `UPDATE_GOLDENS=1` to rewrite the
 * expected files instead of comparing. Also: the tags are checked against both targets' vendored
 * registries and `BlockFacts.plantSoils`, the generated parents against `BlockFacts.modelTemplates`
 * (plus the templates this brief adds, which the targets do not list yet), the companions, and
 * each type's defaults lower and validate with no problem.
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
import plugin, { BLOCK_TYPE_MODEL_SLOTS, blockGeneratedBlockIds, blockKind } from '../src/index';
import { BAMBOO_BLOCK_TAGS } from '../src/lowering/types/column-plant';
import { BERRIES_PLANT_TAGS, CLIMBABLE_TAG } from '../src/lowering/types/growing-plant';
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
const TYPES = ['growing_plant', 'column_plant', 'multiface', 'dripleaf'] as const;

/**
 * Vanilla block models the new types name as parents that `BlockFacts.modelTemplates` does not
 * list yet (the facts belong to the plugin API briefs). Each is in both built-in targets'
 * client jar listings (checked by name only at B511, 2026-11-22).
 */
const TEMPLATES_NOT_IN_FACTS: readonly string[] = [
  'minecraft:block/cactus',
  ...[1, 2, 3, 4].flatMap((n) => [0, 1].map((age) => `minecraft:block/bamboo${n}_age${age}`)),
  'minecraft:block/bamboo_small_leaves',
  'minecraft:block/bamboo_large_leaves',
  'minecraft:block/glow_lichen',
  'minecraft:block/big_dripleaf',
  'minecraft:block/big_dripleaf_partial_tilt',
  'minecraft:block/big_dripleaf_full_tilt',
  'minecraft:block/big_dripleaf_stem',
  'minecraft:block/small_dripleaf_top',
  'minecraft:block/small_dripleaf_bottom',
];

interface Sample {
  name: string;
  id: ResourceLocation;
  data: JsonObject;
}

const sample = (name: string, id: string, data: JsonObject): Sample => ({
  name: `plant3-${name}`,
  id: id as ResourceLocation,
  data: { format: 1, ...data },
});

const SAMPLES: Sample[] = [
  sample('growing-kelp', 'example:sea_ribbon', {
    type: 'growing_plant',
    display_name: 'Sea Ribbon',
    needs_water: true,
    growth_chance: 0.2,
    textures: { head: 'example:block/sea_ribbon', body: 'example:block/sea_ribbon_plant' },
    loot: 'self',
  }),
  sample('growing-vine', 'example:dusk_vine', {
    type: 'growing_plant',
    direction: 'down',
    max_age: 20,
    soil: ['#minecraft:base_stone_overworld', 'minecraft:netherrack'],
    textures: { head: 'example:block/dusk_vine' },
    loot: 'self',
  }),
  sample('growing-berries', 'example:glow_vine', {
    type: 'growing_plant',
    direction: 'down',
    berries: { item: 'example:glow_fruit', light: 12 },
    textures: {
      head: 'example:block/glow_vine',
      body: 'example:block/glow_vine_plant',
      head_berries: 'example:block/glow_vine_lit',
      body_berries: 'example:block/glow_vine_plant_lit',
      item: 'example:item/glow_fruit',
    },
    item: { id: 'example:glow_fruit' },
    loot: 'self',
  }),
  sample('growing-models', 'example:rope_vine', {
    type: 'growing_plant',
    climbable: false,
    models: { head: 'example:block/rope_tip', body: 'example:block/rope' },
  }),
  sample('column-cane', 'example:reed', {
    type: 'column_plant',
    style: 'cane',
    max_height: 4,
    min_height: 2,
    soil: ['#minecraft:sand', 'minecraft:mud'],
    textures: { all: 'example:block/reed' },
    loot: 'self',
  }),
  sample('column-cactus', 'example:spine_cactus', {
    type: 'column_plant',
    style: 'cactus',
    touch_damage: 2,
    textures: {
      top: 'example:block/spine_cactus_top',
      side: 'example:block/spine_cactus_side',
      bottom: 'example:block/spine_cactus_bottom',
    },
    loot: 'self',
  }),
  sample('column-bamboo', 'example:reed_bamboo', {
    type: 'column_plant',
    style: 'bamboo',
    display_name: 'Reed Bamboo',
    textures: {
      stalk: 'example:block/reed_bamboo_stalk',
      leaves_small: 'example:block/reed_bamboo_small_leaves',
      leaves_large: 'example:block/reed_bamboo_large_leaves',
      shoot: 'example:block/reed_bamboo_shoot',
      item: 'example:item/reed_bamboo',
    },
    loot: 'self',
  }),
  sample('column-bamboo-stalk', 'example:bare_bamboo', {
    type: 'column_plant',
    style: 'bamboo',
    max_height: 8,
    textures: { stalk: 'example:block/bare_bamboo' },
  }),
  sample('multiface', 'example:glow_moss', {
    type: 'multiface',
    light: 5,
    textures: { texture: 'example:block/glow_moss' },
    loot: 'self',
  }),
  sample('dripleaf-big', 'example:wide_leaf', {
    type: 'dripleaf',
    size: 'big',
    tilt_ticks: [4, 12, 12],
    textures: {
      top: 'example:block/wide_leaf_top',
      side: 'example:block/wide_leaf_side',
      tip: 'example:block/wide_leaf_tip',
      stem: 'example:block/wide_leaf_stem',
    },
    loot: 'self',
  }),
  sample('dripleaf-small', 'example:small_leaf', {
    type: 'dripleaf',
    size: 'small',
    grows_into: 'example:wide_leaf',
    textures: {
      top: 'example:block/small_leaf_top',
      side: 'example:block/small_leaf_side',
      stem_top: 'example:block/small_leaf_stem_top',
      stem_bottom: 'example:block/small_leaf_stem_bottom',
    },
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
 * The test indexes with the ids a sample brings into the project: its block and companions, its
 * block item, the blocks and items it names, the models it names or generates and the textures
 * of its models.
 */
function withSampleIds(indexes: TargetIndexes, plant: Sample, files: OutputFile[]): TargetIndexes {
  const { data } = plant;
  const item = data.item as Record<string, unknown> | false | undefined;
  const itemIds = item === false ? [] : [String(item?.id ?? plant.id)];
  const models = files.filter((file) => file.path.includes('/models/'));
  const modelIds = models.map((file) =>
    file.path.replace(/^assets\/([^/]+)\/models\/(.+)\.json$/, '$1:$2'),
  );
  const named = [...strings(data.berries), data.grows_into].filter(
    (id): id is string => typeof id === 'string' && id.startsWith('example:'),
  );
  const project: Record<string, readonly string[]> = {
    ...PROJECT_IDS,
    block: [
      ...(PROJECT_IDS.block ?? []),
      plant.id,
      ...blockGeneratedBlockIds(plant.id, data),
      ...named,
    ],
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
  const found = SAMPLES.find((entry) => entry.name === `plant3-${name}`);
  if (found === undefined) throw new Error(`no sample ${name}`);
  return found;
};

const contentsOf = (files: OutputFile[], suffix: string): JsonObject | undefined =>
  files.find((file) => file.path.endsWith(suffix))?.contents as JsonObject | undefined;

const variantsOf = (files: OutputFile[], path: string): Record<string, Json> =>
  (contentsOf(files, `/blockstates/${path}.json`) as { variants: Record<string, Json> }).variants;

const tagValues = (files: OutputFile[], tag: string): Json | undefined =>
  contentsOf(files, `data/minecraft/tags/block/${tag}.json`)?.values;

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
 * (no single `model`), with the type's required fields and one texture.
 */
function defaultsOf(type: (typeof TYPES)[number]): Sample {
  const { model: _model, ...base } = blockKind.defaultData as JsonObject;
  const id = `demo:default_${type}`;
  const fields: Record<string, JsonObject> = {
    growing_plant: { textures: { head: 'demo:block/default_growing_plant' } },
    column_plant: { style: 'cane', textures: { all: 'demo:block/default_column_plant' } },
    multiface: { textures: { texture: 'demo:block/default_multiface' } },
    dripleaf: { size: 'big', textures: { top: 'demo:block/default_dripleaf' } },
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
  'growing plant lowering for %s',
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

    it('names only tags the target has, the soils as its plant facts', async () => {
      const { registries } = await indexesFor(bundle);
      for (const tag of [CLIMBABLE_TAG, ...BERRIES_PLANT_TAGS, ...BAMBOO_BLOCK_TAGS]) {
        expect(registries.has('tag/block', `minecraft:${tag}`), tag).toBe(true);
      }
      const soils = bundle.target.blocks?.plantSoils;
      expect(soils?.bamboo).toBe(`minecraft:${BAMBOO_BLOCK_TAGS[0]}`);
      expect(soils?.caveVines).toBe(`minecraft:${BERRIES_PLANT_TAGS[1]}`);
      for (const plant of SAMPLES) {
        for (const file of await lower(plant, bundle)) {
          const match = /^data\/minecraft\/tags\/(block|item)\/(.+)\.json$/.exec(file.path);
          if (match === null) continue;
          expect(registries.has(`tag/${match[1]}`, `minecraft:${match[2]}`), file.path).toBe(true);
        }
      }
    });

    it('parents every generated block model on a vanilla template', async () => {
      const templates = new Set([
        ...(bundle.target.blocks?.modelTemplates ?? []),
        ...TEMPLATES_NOT_IN_FACTS,
      ]);
      for (const plant of SAMPLES) {
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

    it('validates every sample together with no validator problem', async () => {
      const elements = SAMPLES.map((plant) => element(blockKind.id, plant.id, plant.data));
      expect(await validatorProblems(elements, bundle)).toEqual([]);
    });
  },
);

describe('growing plant types', () => {
  it('names the model slots', () => {
    expect(BLOCK_TYPE_MODEL_SLOTS.growing_plant).toEqual([
      'head',
      'body',
      'head_berries',
      'body_berries',
      'item',
    ]);
    expect(BLOCK_TYPE_MODEL_SLOTS.column_plant).toEqual([
      'default',
      'stalk2',
      'stalk3',
      'stalk4',
      'thick',
      'thick2',
      'thick3',
      'thick4',
      'leaves_small',
      'leaves_large',
      'shoot',
      'item',
    ]);
    expect(BLOCK_TYPE_MODEL_SLOTS.multiface).toEqual(['face', 'item']);
    expect(BLOCK_TYPE_MODEL_SLOTS.dripleaf).toEqual([
      'leaf',
      'partial_tilt',
      'full_tilt',
      'stem',
      'bottom',
      'item',
    ]);
  });

  it('registers the companions by type, style and size', () => {
    const ids = (plant: Sample) => blockGeneratedBlockIds(plant.id, plant.data);
    expect(ids(byName('growing-kelp'))).toEqual(['example:sea_ribbon_plant']);
    expect(ids(byName('column-bamboo'))).toEqual(['example:reed_bamboo_shoot']);
    expect(ids(byName('column-cane'))).toEqual([]);
    expect(ids(byName('column-cactus'))).toEqual([]);
    expect(ids(byName('multiface'))).toEqual([]);
    expect(ids(byName('dripleaf-big'))).toEqual(['example:wide_leaf_stem']);
    expect(ids(byName('dripleaf-small'))).toEqual([]);
  });

  it('writes a strand without berries as one variant, with berries by berries', async () => {
    const kelp = await lower(byName('growing-kelp'));
    expect(variantsOf(kelp, 'sea_ribbon')).toEqual({ '': { model: 'example:block/sea_ribbon' } });
    expect(variantsOf(kelp, 'sea_ribbon_plant')).toEqual({
      '': { model: 'example:block/sea_ribbon_plant' },
    });
    const vines = await lower(byName('growing-berries'));
    expect(variantsOf(vines, 'glow_vine')).toEqual({
      'berries=false': { model: 'example:block/glow_vine' },
      'berries=true': { model: 'example:block/glow_vine_berries' },
    });
    expect(variantsOf(vines, 'glow_vine_plant')).toEqual({
      'berries=false': { model: 'example:block/glow_vine_plant' },
      'berries=true': { model: 'example:block/glow_vine_plant_berries' },
    });
    const vine = await lower(byName('growing-vine'));
    expect(contentsOf(vine, '/models/block/dusk_vine_plant.json')).toEqual({
      parent: 'minecraft:block/cross',
      textures: { cross: 'example:block/dusk_vine' },
    });
  });

  it('joins climbable and the cave vine tags as the strand allows', async () => {
    const vine = await lower(byName('growing-vine'));
    expect(tagValues(vine, 'climbable')).toEqual(['example:dusk_vine']);
    expect(
      vine
        .filter((file) => file.path === 'data/minecraft/tags/block/climbable.json')
        .map((file) => (file.contents as JsonObject).values),
    ).toEqual([['example:dusk_vine'], ['example:dusk_vine_plant']]);
    const kelp = await lower(byName('growing-kelp'));
    expect(tagValues(kelp, 'climbable')).toBeUndefined();
    const rope = await lower(byName('growing-models'));
    expect(tagValues(rope, 'climbable')).toBeUndefined();
    const berries = await lower(byName('growing-berries'));
    expect(tagValues(berries, 'cave_vines')).toEqual(['example:glow_vine']);
    expect(tagValues(berries, 'bee_growables')).toEqual(['example:glow_vine']);
  });

  it('drops as vanilla: vines to shears or by chance, kelp itself, berries only when ripe', async () => {
    const vine = await lower(byName('growing-vine'));
    const vineLoot = JSON.stringify(contentsOf(vine, '/loot_table/blocks/dusk_vine.json'));
    expect(vineLoot).toContain('minecraft:tool/can_shear');
    expect(vineLoot).toContain('[0.33,0.55,0.77,1]');
    const strand = contentsOf(vine, '/loot_table/blocks/dusk_vine_plant.json');
    expect(strand?.random_sequence).toBe('example:blocks/dusk_vine_plant');
    const berries = await lower(byName('growing-berries'));
    const berryLoot = contentsOf(berries, '/loot_table/blocks/glow_vine_plant.json') as {
      pools: JsonObject[];
    };
    expect(berryLoot.pools[0]?.condition).toEqual({
      type: 'minecraft:match_block',
      blocks: 'example:glow_vine_plant',
      state: { berries: 'true' },
    });
    const kelp = await lower(byName('growing-kelp'));
    expect(JSON.stringify(contentsOf(kelp, '/loot_table/blocks/sea_ribbon.json'))).toContain(
      'minecraft:survives_explosion',
    );
  });

  it('writes bamboo as vanilla: four stalks by age, leaves, a shoot and its soil tag', async () => {
    const files = await lower(byName('column-bamboo'));
    const state = contentsOf(files, '/blockstates/reed_bamboo.json') as {
      multipart: JsonObject[];
    };
    expect(state.multipart).toHaveLength(4);
    expect(state.multipart[0]?.apply).toEqual([
      { model: 'example:block/reed_bamboo' },
      { model: 'example:block/reed_bamboo_stalk2' },
      { model: 'example:block/reed_bamboo_stalk3' },
      { model: 'example:block/reed_bamboo_stalk4' },
    ]);
    expect(state.multipart[3]).toEqual({
      apply: { model: 'example:block/reed_bamboo_leaves_large' },
      when: { leaves: 'large' },
    });
    expect(variantsOf(files, 'reed_bamboo_shoot')).toEqual({
      '': { model: 'example:block/reed_bamboo_shoot' },
    });
    expect(
      files
        .filter((file) => file.path === 'data/minecraft/tags/block/supports_bamboo.json')
        .map((file) => (file.contents as JsonObject).values),
    ).toEqual([['example:reed_bamboo'], ['example:reed_bamboo_shoot']]);
    expect(contentsOf(files, '/loot_table/blocks/reed_bamboo_shoot.json')).toBeDefined();
    // Without leaves textures there are no leaves parts.
    const bare = contentsOf(
      await lower(byName('column-bamboo-stalk')),
      '/blockstates/bare_bamboo.json',
    ) as {
      multipart: JsonObject[];
    };
    expect(bare.multipart).toHaveLength(2);
  });

  it('writes cane and cactus as one variant on vanilla templates', async () => {
    const cactus = await lower(byName('column-cactus'));
    expect(contentsOf(cactus, '/models/block/spine_cactus.json')).toEqual({
      parent: 'minecraft:block/cactus',
      textures: {
        bottom: 'example:block/spine_cactus_bottom',
        particle: 'example:block/spine_cactus_side',
        side: 'example:block/spine_cactus_side',
        top: 'example:block/spine_cactus_top',
      },
    });
    expect(contentsOf(cactus, '/models/item/spine_cactus.json')).toEqual({
      parent: 'minecraft:item/generated',
      textures: { layer0: 'example:block/spine_cactus_side' },
    });
    expect(variantsOf(await lower(byName('column-cane')), 'reed')).toEqual({
      '': { model: 'example:block/reed' },
    });
  });

  it('writes the multiface multipart and drops one item per face to shears', async () => {
    const files = await lower(byName('multiface'));
    const state = contentsOf(files, '/blockstates/glow_moss.json') as { multipart: JsonObject[] };
    expect(state.multipart).toHaveLength(12);
    expect(state.multipart[10]).toEqual({
      apply: { model: 'example:block/glow_moss', uvlock: true, x: 90 },
      when: { down: 'true' },
    });
    const loot = contentsOf(files, '/loot_table/blocks/glow_moss.json') as {
      pools: { entries: { modifier: JsonObject[] }[] }[];
    };
    expect(loot.pools[0]?.entries[0]?.modifier).toHaveLength(8);
  });

  it('writes dripleaves by facing and tilt or half, the big one with its stem', async () => {
    const big = await lower(byName('dripleaf-big'));
    const leaf = variantsOf(big, 'wide_leaf');
    expect(Object.keys(leaf)).toHaveLength(16);
    expect(leaf['facing=east,tilt=partial']).toEqual({
      model: 'example:block/wide_leaf_partial_tilt',
      y: 90,
    });
    expect(leaf['facing=north,tilt=unstable']).toEqual({ model: 'example:block/wide_leaf' });
    expect(variantsOf(big, 'wide_leaf_stem')['facing=south']).toEqual({
      model: 'example:block/wide_leaf_stem',
      y: 180,
    });
    const small = await lower(byName('dripleaf-small'));
    const halves = variantsOf(small, 'small_leaf');
    expect(halves['facing=west,half=lower']).toEqual({
      model: 'example:block/small_leaf_bottom',
      y: 270,
    });
    expect(halves['facing=north,half=upper']).toEqual({ model: 'example:block/small_leaf' });
    const loot = contentsOf(small, '/loot_table/blocks/small_leaf.json') as { pools: JsonObject[] };
    expect(loot.pools[0]?.condition).toBe('minecraft:tool/can_shear');
    expect(small.some((file) => file.path.includes('small_leaf_stem'))).toBe(false);
  });
});
