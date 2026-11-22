/**
 * Golden tests of project flower pots (ADR 0103 D2) and of weathering on the six more types of
 * ADR 0104 D1 (B512). Each sample is lowered for every built-in target, its element data and
 * every output are validated against their schemas, and the outputs are compared with
 * `fixtures/<target id>/expected/block/<name>.json`. Set `UPDATE_GOLDENS=1` to rewrite the
 * expected files instead of comparing. Also: the pot's potted companions (block state, tags,
 * loot) from `flowerPotType.companionsFromData`, the expander's `plant_item` map, a potted
 * plant in a project pot, the tags against both targets' vendored registries and the
 * generated parents against the target's templates and vanilla's pot model.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Element, Json, JsonObject, OutputFile, ResourceLocation } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { BLOCK_TYPE_MODEL_SLOTS, blockKind, expandPottedPlants } from '../src/index';
import { BLOCK_STATE_SCHEMA, LOOT_TABLE_SCHEMA } from '../src/lowering/shared';
import {
  FLOWER_POT_BLOCK_TAGS,
  FLOWER_POT_MODEL,
  flowerPotCompanionIds,
  flowerPotPlantsOf,
  flowerPotType,
} from '../src/lowering/types/flower-pot';
import type { TypeContext } from '../src/lowering/types/models';
import { WEATHERING_BLOCK_TYPES } from '../src/lowering/weathering';
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
  id: ResourceLocation;
  data: JsonObject;
}

const sample = (name: string, id: string, data: JsonObject): Sample => ({
  name,
  id: id as ResourceLocation,
  data: { format: 1, ...data },
});

/** The six types of ADR 0104 D1 and a texture key each takes. */
const WEATHERING_2_TYPES = [
  'rod',
  'button',
  'pressure_plate',
  'fence',
  'fence_gate',
  'wall',
] as const;

/** The fields a type requires besides its textures. */
const REQUIRED: Readonly<Record<string, JsonObject>> = {
  button: { set_type: 'copper' },
  pressure_plate: { set_type: 'copper' },
  fence_gate: { wood_type: 'oak' },
};

const weatheringSample = (type: (typeof WEATHERING_2_TYPES)[number]): Sample =>
  sample(`weathering2-${type.replaceAll('_', '-')}`, `example:tin_${type}`, {
    type,
    ...REQUIRED[type],
    textures: { texture: 'minecraft:block/copper_block' },
    components: {
      'msm:weathering': { stage: 'unaffected', next: `example:exposed_tin_${type}` },
      'msm:waxable': { into: `example:waxed_tin_${type}` },
    },
    loot: 'self',
  });

const SAMPLES: Sample[] = [
  sample('pot-clay', 'example:clay_pot', {
    type: 'flower_pot',
    display_name: 'Clay Pot',
    plants: ['minecraft:dandelion', 'example:ruby_sprout', 'oak_sapling'],
    textures: {
      pot: 'example:block/clay_pot',
      dirt: 'example:block/clay_pot_soil',
      item: 'example:item/clay_pot',
    },
    loot: 'self',
  }),
  sample('pot-defaults', 'example:plain_pot', {
    type: 'flower_pot',
    plants: ['minecraft:fern'],
  }),
  sample('potted-plant-project-pot', 'example:clay_pot_ruby', {
    type: 'potted_plant',
    plant: 'example:ruby_sprout',
    pot: 'example:clay_pot',
    loot: 'self',
  }),
  ...WEATHERING_2_TYPES.map(weatheringSample),
];

/** Every string in `value`, nested lists and objects included. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

/** The test indexes with the ids a sample brings into the project. */
function withSampleIds(indexes: TargetIndexes, entry: Sample, files: OutputFile[]): TargetIndexes {
  const models = files.filter((file) => file.path.includes('/models/'));
  const modelIds = models.map((file) =>
    file.path.replace(/^assets\/([^/]+)\/models\/(.+)\.json$/, '$1:$2'),
  );
  const blocks = [
    entry.id,
    'example:clay_pot',
    ...flowerPotCompanionIds(entry.id, entry.data),
    ...WEATHERING_2_TYPES.flatMap((type) => [
      `example:exposed_tin_${type}`,
      `example:waxed_tin_${type}`,
    ]),
  ];
  const project: Record<string, readonly string[]> = {
    ...PROJECT_IDS,
    block: [...(PROJECT_IDS.block ?? []), ...blocks],
    item: [...(PROJECT_IDS.item ?? []), ...blocks],
    model: [...(PROJECT_IDS.model ?? []), ...modelIds],
    texture: [
      ...strings(entry.data.textures),
      ...models.flatMap((file) => strings((file.contents as JsonObject).textures)),
    ],
  };
  return { ...indexes, registries: createRegistryIndex({ vanilla: indexes.vanilla, project }) };
}

const fixturesRoot = new URL('./fixtures/', import.meta.url);
const fixtureUrl = (targetId: string, entry: Sample): URL =>
  new URL(`${targetId}/expected/${blockKind.folder}/${entry.name}.json`, fixturesRoot);

const recorded = (file: OutputFile): Record<string, unknown> => ({
  contents: file.contents,
  layer: file.layer,
  merge: file.merge,
  path: file.path,
  schema: file.schema,
});

const firstBundle = builtInTargets[0] as TargetBundle;
const lower = (entry: Sample, bundle: TargetBundle = firstBundle): Promise<OutputFile[]> =>
  Promise.resolve(blockKind.lower(element(blockKind.id, entry.id, entry.data), bundle.target));

const byName = (name: string): Sample => {
  const found = SAMPLES.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`no sample ${name}`);
  return found;
};

const contentsOf = (files: OutputFile[], suffix: string): JsonObject | undefined =>
  files.find((file) => file.path.endsWith(suffix))?.contents as JsonObject | undefined;

/** The contents of the file ending in `suffix`; throws when there is none. */
function contentsAt(files: OutputFile[], suffix: string): JsonObject {
  const contents = contentsOf(files, suffix);
  if (contents === undefined) throw new Error(`no file ${suffix}`);
  return contents;
}

async function lowerAndCheck(entry: Sample, bundle: TargetBundle) {
  const files = await lower(entry, bundle);
  const indexes = withSampleIds(await indexesFor(bundle), entry, files);
  const problems: string[] = [];
  const check = (schema: string, value: Json, where: string) => {
    for (const problem of blockingProblems(indexes, schema, value)) {
      problems.push(`${where}: ${problem.code} ${problem.message}`);
    }
  };
  check(blockKind.schema, entry.data, 'element');
  for (const file of files) {
    if (file.schema === undefined) problems.push(`${file.path}: no schema`);
    else check(file.schema, file.contents as Json, file.path);
  }
  return { files, problems, indexes };
}

/** The pot's companion files as `companions.ts` writes them, from `companionsFromData`. */
function companionOutputs(entry: Sample) {
  const colon = entry.id.indexOf(':');
  const context: TypeContext = {
    blockId: entry.id,
    itemId: entry.id,
    namespace: entry.id.slice(0, colon),
    path: entry.id.slice(colon + 1),
    data: entry.data,
  };
  const slots: Record<string, string> = {};
  for (const spec of flowerPotType.generateFromData?.(entry.data) ?? []) {
    slots[spec.slot] = `${context.namespace}:block/${context.path}${spec.suffix}`;
  }
  return flowerPotType.companionsFromData(entry.data).map((companion) => {
    const own = { ...context, companionId: `${entry.id}${companion.suffix}` };
    return {
      id: own.companionId,
      blockstate: companion.blockstate(slots, own),
      tags: companion.blockTags,
      loot: companion.selfLoot?.({ ...own, itemId: entry.id }),
    };
  });
}

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'pots and weathering 2 lowering for %s',
  (targetId, bundle) => {
    it.each(SAMPLES.map((entry) => [entry.name, entry] as const))('%s', async (_label, entry) => {
      const { files, problems } = await lowerAndCheck(entry, bundle);
      expect(problems).toEqual([]);
      const actual = sortedJson(files.map(recorded));
      const url = fixtureUrl(targetId, entry);
      if (UPDATE) {
        await mkdir(dirname(fileURLToPath(url)), { recursive: true });
        await writeFile(url, actual);
      }
      expect(actual).toBe(await readFile(url, 'utf8'));
    });

    it('names only tags the target has', async () => {
      const { registries } = await indexesFor(bundle);
      for (const tag of FLOWER_POT_BLOCK_TAGS) {
        expect(registries.has('tag/block', `minecraft:${tag}`), tag).toBe(true);
      }
      for (const entry of SAMPLES) {
        for (const file of await lower(entry, bundle)) {
          const match = /^data\/minecraft\/tags\/(block|item)\/(.+)\.json$/.exec(file.path);
          if (match === null) continue;
          expect(registries.has(`tag/${match[1]}`, `minecraft:${match[2]}`), file.path).toBe(true);
        }
      }
    });

    it("parents the pots' models on a template the target lists, or vanilla's pot", async () => {
      const templates = new Set(bundle.target.blocks?.modelTemplates ?? []);
      const { vanilla } = await indexesFor(bundle);
      for (const entry of SAMPLES.filter((one) => !one.name.startsWith('weathering2-'))) {
        for (const file of await lower(entry, bundle)) {
          if (!file.path.includes('/models/block/')) continue;
          const parent = (file.contents as JsonObject).parent as string;
          if (parent === FLOWER_POT_MODEL) {
            // Vanilla's own pot model: not a template, but a model of the target's game.
            expect(vanilla.model ?? [], parent).toContain('block/flower_pot');
            continue;
          }
          expect(templates.has(parent), `${file.path}: ${parent}`).toBe(true);
        }
      }
    });

    it('writes valid companion block states and loot tables', async () => {
      const entry = byName('pot-clay');
      const files = await lower(entry, bundle);
      const indexes = withSampleIds(await indexesFor(bundle), entry, files);
      for (const companion of companionOutputs(entry)) {
        expect(blockingProblems(indexes, BLOCK_STATE_SCHEMA, companion.blockstate)).toEqual([]);
        expect(
          blockingProblems(indexes, LOOT_TABLE_SCHEMA, companion.loot as Json).map(
            (p) => p.message,
          ),
        ).toEqual([]);
      }
    });
  },
);

describe('project flower pots (ADR 0103 D2)', () => {
  it('names the model slots', () => {
    expect(BLOCK_TYPE_MODEL_SLOTS.flower_pot).toEqual(['pot', 'item']);
  });

  it("generates the empty pot over vanilla's pot and one potted model per plant", async () => {
    const files = await lower(byName('pot-clay'));
    expect(contentsOf(files, 'models/block/clay_pot.json')).toEqual({
      parent: 'minecraft:block/flower_pot',
      textures: {
        dirt: 'example:block/clay_pot_soil',
        flowerpot: 'example:block/clay_pot',
        particle: 'example:block/clay_pot',
      },
    });
    expect(contentsOf(files, 'models/block/clay_pot_ruby_sprout.json')).toEqual({
      parent: 'minecraft:block/flower_pot_cross',
      textures: {
        dirt: 'example:block/clay_pot_soil',
        flowerpot: 'example:block/clay_pot',
        particle: 'example:block/clay_pot',
        plant: 'example:block/ruby_sprout',
      },
    });
    expect(
      (contentsAt(files, 'models/block/clay_pot_oak_sapling.json').textures as JsonObject).plant,
    ).toBe('minecraft:block/oak_sapling');
    expect(contentsOf(files, 'blockstates/clay_pot.json')).toEqual({
      variants: { '': { model: 'example:block/clay_pot' } },
    });
    expect(contentsOf(files, 'models/item/clay_pot.json')).toEqual({
      parent: 'minecraft:item/generated',
      textures: { layer0: 'example:item/clay_pot' },
    });
    expect(contentsOf(files, 'tags/block/flower_pots.json')).toEqual({
      values: ['example:clay_pot'],
    });
    // "self" drops the pot itself; the definition keeps `plants` for the runtime.
    expect(
      (contentsAt(files, 'loot_table/blocks/clay_pot.json').pools as JsonObject[])[0]?.entries,
    ).toEqual([{ type: 'minecraft:item', name: 'example:clay_pot' }]);
    expect(contentsOf(files, 'msm/example/block/clay_pot.json')?.plants).toEqual([
      'minecraft:dandelion',
      'example:ruby_sprout',
      'oak_sapling',
    ]);
  });

  it("takes vanilla's pot, earth and item pictures by default", async () => {
    const files = await lower(byName('pot-defaults'));
    expect(contentsOf(files, 'models/block/plain_pot.json')?.textures).toEqual({
      dirt: 'minecraft:block/dirt',
      flowerpot: 'minecraft:block/flower_pot',
      particle: 'minecraft:block/flower_pot',
    });
    expect(contentsOf(files, 'models/item/plain_pot.json')?.textures).toEqual({
      layer0: 'minecraft:item/flower_pot',
    });
  });

  it('gives one potted companion per plant, the first of a path winning', () => {
    const data = {
      type: 'flower_pot',
      plants: ['dandelion', 'minecraft:dandelion', 'example:dandelion', 'example:fern', ''],
    };
    expect(flowerPotPlantsOf(data)).toEqual(['minecraft:dandelion', 'example:fern']);
    expect(flowerPotCompanionIds('example:clay_pot', data)).toEqual([
      'example:clay_pot_dandelion',
      'example:clay_pot_fern',
    ]);
    expect(flowerPotCompanionIds('example:clay_pot', { type: 'flower_pot' })).toEqual([]);
  });

  it('writes each companion as a one-variant pot in flower_pots dropping the pot and plant', () => {
    const [dandelion, sprout] = companionOutputs(byName('pot-clay'));
    expect(dandelion?.id).toBe('example:clay_pot_dandelion');
    expect(dandelion?.blockstate).toEqual({
      variants: { '': { model: 'example:block/clay_pot_dandelion' } },
    });
    expect(dandelion?.tags).toEqual(['flower_pots']);
    const survives = { type: 'minecraft:survives_explosion' };
    expect(sprout?.loot).toEqual({
      type: 'minecraft:block',
      pools: [
        {
          condition: survives,
          entries: [{ type: 'minecraft:item', name: 'example:clay_pot' }],
          rolls: 1,
        },
        {
          condition: survives,
          entries: [{ type: 'minecraft:item', name: 'example:ruby_sprout' }],
          rolls: 1,
        },
      ],
      random_sequence: 'example:blocks/clay_pot_ruby_sprout',
    });
  });

  it("drops a project plant's own item through the expander's plant_item map", () => {
    const bush = element('msm:block', 'example:blue_berry_bush', {
      format: 1,
      type: 'berry_bush',
      berry: 'example:blue_berries',
      item: { id: 'example:blue_berries' },
    });
    const pot = element('msm:block', 'example:clay_pot', {
      format: 1,
      type: 'flower_pot',
      plants: ['minecraft:fern', 'example:blue_berry_bush'],
      loot: 'self',
    });
    const { patches } = expandPottedPlants({
      elements: [bush, pot],
      target: firstBundle.target as never,
    });
    expect(patches).toEqual([
      {
        elementId: 'example:clay_pot',
        path: ['plant_item', 'example:blue_berry_bush'],
        value: 'example:blue_berries',
        origin: { elementId: 'example:clay_pot', pointer: '/plants/1' },
      },
    ]);
    const patched = {
      ...(pot.data as JsonObject),
      plant_item: { 'example:blue_berry_bush': 'example:blue_berries' },
    };
    const companions = companionOutputs({ name: 'patched', id: pot.id, data: patched });
    const names = (loot: unknown) =>
      (loot as { pools: { entries: JsonObject[] }[] }).pools.map((p) => p.entries[0]?.name);
    expect(names(companions[0]?.loot)).toEqual(['example:clay_pot', 'minecraft:fern']);
    expect(names(companions[1]?.loot)).toEqual(['example:clay_pot', 'example:blue_berries']);
    // The map is editor-only: the definition leaves it out.
    const files = blockKind.lower(
      { ...pot, data: patched } as Element,
      firstBundle.target,
    ) as OutputFile[];
    expect(contentsOf(files, 'msm/example/block/clay_pot.json')?.plant_item).toBeUndefined();
  });

  it('drops the project pot of a potted plant that names one', async () => {
    const files = await lower(byName('potted-plant-project-pot'));
    const loot = contentsOf(files, 'loot_table/blocks/clay_pot_ruby.json') as {
      pools: { entries: JsonObject[] }[];
    };
    expect(loot.pools.map((pool) => pool.entries[0]?.name)).toEqual([
      'example:clay_pot',
      'example:ruby_sprout',
    ]);
    expect(contentsOf(files, 'msm/example/block/clay_pot_ruby.json')?.pot).toBe('example:clay_pot');
  });
});

describe('weathering on more types (ADR 0104 D1)', () => {
  it('lets rods, buttons, plates, fences, gates and walls age', () => {
    for (const type of WEATHERING_2_TYPES) expect(WEATHERING_BLOCK_TYPES).toContain(type);
    expect(WEATHERING_BLOCK_TYPES).toHaveLength(17);
  });

  it.each(WEATHERING_2_TYPES.map((type) => [type] as const))(
    'passes the stage chain of %s through to the definition',
    async (type) => {
      const files = await lower(weatheringSample(type));
      const definition = contentsAt(files, `msm/example/block/tin_${type}.json`);
      expect((definition.components as JsonObject)['msm:weathering']).toEqual({
        next: `example:exposed_tin_${type}`,
        stage: 'unaffected',
      });
      expect((definition.components as JsonObject)['msm:waxable']).toEqual({
        into: `example:waxed_tin_${type}`,
      });
    },
  );
});
