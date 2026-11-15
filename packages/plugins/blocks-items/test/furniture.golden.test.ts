/**
 * Golden tests of the furniture, light, sign and stem types of ADR 0094 (B448): `bed`,
 * `ladder`, `torch`, `lantern`, `chain`, `rod`, `sign`, `hanging_sign`, `stem` and
 * `scaffolding`, with the companions of torches, signs and stems (D3). Each sample is lowered
 * for every built-in target, every output is validated against the schema it declares, and the
 * outputs are compared with `fixtures/<target id>/expected/block/furniture-<name>.json`. Set
 * `UPDATE_GOLDENS=1` to rewrite the expected files instead of comparing. Also: the tags are
 * checked against both targets' vendored registries, the generated parents against
 * `BlockFacts.modelTemplates`, and each type's defaults lower and validate with no problem.
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
import plugin, {
  BLOCK_TYPE_MODEL_SLOTS,
  blockGeneratedBlockIds,
  blockGeneratedModelIds,
  blockItemIdOf,
  blockKind,
  signGuiPicture,
  signGuiTextureId,
  signGuiTexturePath,
} from '../src/index';
import { BED_TAGS } from '../src/lowering/types/bed';
import { HANGING_SIGN_TAGS } from '../src/lowering/types/hanging-sign';
import { LADDER_BLOCK_TAGS } from '../src/lowering/types/ladder';
import { SCAFFOLDING_BLOCK_TAGS } from '../src/lowering/types/scaffolding';
import { SIGN_TAGS } from '../src/lowering/types/sign';
import { ATTACHED_STEM_BLOCK_TAGS, STEM_BLOCK_TAGS } from '../src/lowering/types/stem';
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
  'bed',
  'ladder',
  'torch',
  'lantern',
  'chain',
  'rod',
  'sign',
  'hanging_sign',
  'stem',
  'scaffolding',
] as const;

interface Sample {
  name: string;
  id: ResourceLocation;
  data: JsonObject;
}

const sample = (name: string, id: string, data: JsonObject): Sample => ({
  name: `furniture-${name}`,
  id: id as ResourceLocation,
  data: { format: 1, ...data },
});

const SAMPLES: Sample[] = [
  sample('bed', 'example:straw_bed', {
    type: 'bed',
    rule: 'straw_bed',
    colour: 'yellow',
    display_name: 'Straw Bed',
    textures: { bed: 'example:block/straw_bed' },
    item: { max_stack_size: 1 },
    loot: 'self',
  }),
  sample('bed-item-picture', 'example:moss_bed', {
    type: 'bed',
    textures: { bed: 'example:block/moss_bed', item: 'example:item/moss_bed' },
    loot: 'self',
  }),
  sample('ladder', 'example:rope_ladder', {
    type: 'ladder',
    textures: { texture: 'example:block/rope_ladder' },
    loot: 'self',
  }),
  sample('torch', 'example:soul_lamp', {
    type: 'torch',
    particle: 'minecraft:soul_fire_flame',
    display_name: 'Soul Lamp',
    textures: { texture: 'example:block/soul_lamp' },
    loot: 'self',
  }),
  sample('lantern', 'example:paper_lantern', {
    type: 'lantern',
    textures: {
      texture: 'example:block/paper_lantern',
      item: 'example:item/paper_lantern',
    },
    loot: 'self',
  }),
  sample('chain', 'example:rope', {
    type: 'chain',
    textures: { all: 'example:block/rope' },
    loot: 'self',
  }),
  sample('rod', 'example:crystal_rod', {
    type: 'rod',
    textures: { texture: 'example:block/crystal_rod' },
    loot: 'self',
  }),
  sample('sign', 'example:ruby_sign', {
    type: 'sign',
    wood_type: 'cherry',
    textures: {
      all: 'example:block/ruby_sign',
      sign: 'example:gui/signs/ruby_sign',
      item: 'example:item/ruby_sign',
    },
    item: { max_stack_size: 16 },
    loot: 'self',
  }),
  sample('sign-models', 'example:plain_sign', {
    type: 'sign',
    wood_type: 'oak',
    models: {
      rot0: 'example:block/plain_sign_a',
      rot1: 'example:block/plain_sign_b',
      rot2: 'example:block/plain_sign_c',
      rot3: 'example:block/plain_sign_d',
      wall: 'example:block/plain_sign_wall',
    },
  }),
  sample('hanging-sign', 'example:ruby_hanging_sign', {
    type: 'hanging_sign',
    wood_type: 'bamboo',
    textures: {
      all: 'example:block/ruby_hanging_sign',
      hanging_gui: 'example:gui/hanging_signs/ruby_hanging_sign',
    },
    item: { max_stack_size: 16 },
    loot: 'self',
  }),
  sample('stem', 'example:gourd_stem', {
    type: 'stem',
    fruit: 'example:gourd',
    textures: { stem: 'example:block/gourd_stem', attached: 'example:block/gourd_stem_bent' },
    item: { id: 'example:gourd_seeds' },
    loot: 'self',
  }),
  sample('scaffolding', 'example:bamboo_frame', {
    type: 'scaffolding',
    textures: {
      top: 'example:block/bamboo_frame_top',
      side: 'example:block/bamboo_frame_side',
      bottom: 'example:block/bamboo_frame_bottom',
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
 * block item, the blocks it names, the models it names or generates and their textures.
 */
function withSampleIds(indexes: TargetIndexes, entry: Sample, files: OutputFile[]): TargetIndexes {
  const { data } = entry;
  const itemId = blockItemIdOf(entry.id, data);
  const models = files.filter((file) => file.path.includes('/models/'));
  const modelIds = models.map((file) =>
    file.path.replace(/^assets\/([^/]+)\/models\/(.+)\.json$/, '$1:$2'),
  );
  const fruit = typeof data.fruit === 'string' ? [data.fruit] : [];
  const project: Record<string, readonly string[]> = {
    ...PROJECT_IDS,
    block: [
      ...(PROJECT_IDS.block ?? []),
      entry.id,
      ...blockGeneratedBlockIds(entry.id, data),
      ...fruit,
    ],
    item: [...(PROJECT_IDS.item ?? []), ...(itemId === undefined ? [] : [itemId])],
    model: [...(PROJECT_IDS.model ?? []), ...modelIds, ...strings(data.models)],
    texture: [
      ...strings(data.textures),
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
  const found = SAMPLES.find((entry) => entry.name === `furniture-${name}`);
  if (found === undefined) throw new Error(`no sample ${name}`);
  return found;
};

const contentsOf = (files: OutputFile[], suffix: string): JsonObject | undefined =>
  files.find((file) => file.path.endsWith(suffix))?.contents as JsonObject | undefined;

const variantsOf = (files: OutputFile[], path: string): Record<string, Json> =>
  (contentsOf(files, `/blockstates/${path}.json`) as { variants: Record<string, Json> }).variants;

/** Lowered files and every schema problem of them and of the element, against `bundle`. */
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

/**
 * The defaults of `type`: the kind's default data turned into the type as the Block Studio does
 * (no single `model`), with the type's required fields and one texture.
 */
function defaultsOf(type: (typeof TYPES)[number]): Sample {
  const { model: _model, ...base } = blockKind.defaultData as JsonObject;
  const id = `demo:default_${type}`;
  const texture = { textures: { texture: `demo:block/default_${type}` } };
  const fields: Record<string, JsonObject> = {
    bed: { textures: { bed: 'demo:block/default_bed' } },
    ladder: texture,
    torch: texture,
    lantern: texture,
    chain: texture,
    rod: texture,
    sign: { wood_type: 'oak', textures: { all: 'demo:block/default_sign' } },
    hanging_sign: { wood_type: 'oak', textures: { all: 'demo:block/default_hanging_sign' } },
    stem: { fruit: 'minecraft:melon', textures: { stem: 'demo:block/default_stem' } },
    scaffolding: { textures: { top: 'demo:block/default_scaffolding' } },
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
  'furniture lowering for %s',
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
      const blockTags = [
        ...BED_TAGS,
        ...LADDER_BLOCK_TAGS,
        ...SCAFFOLDING_BLOCK_TAGS,
        ...SIGN_TAGS.standing,
        ...SIGN_TAGS.wall,
        ...HANGING_SIGN_TAGS.ceiling,
        ...HANGING_SIGN_TAGS.wall,
        ...STEM_BLOCK_TAGS,
        ...ATTACHED_STEM_BLOCK_TAGS,
      ];
      for (const tag of blockTags) {
        expect(registries.has('tag/block', `minecraft:${tag}`), tag).toBe(true);
      }
      for (const tag of [...BED_TAGS, ...SIGN_TAGS.item, ...HANGING_SIGN_TAGS.item]) {
        expect(registries.has('tag/item', `minecraft:${tag}`), tag).toBe(true);
      }
      // Every tag file the samples write names a vanilla tag of the target.
      for (const entry of SAMPLES) {
        for (const file of await lower(entry, bundle)) {
          const match = /^data\/minecraft\/tags\/(block|item)\/(.+)\.json$/.exec(file.path);
          if (match === null) continue;
          expect(registries.has(`tag/${match[1]}`, `minecraft:${match[2]}`), file.path).toBe(true);
        }
      }
    });

    it('parents every generated block model on a template the target lists', async () => {
      const templates = new Set(bundle.target.blocks?.modelTemplates ?? []);
      expect(templates.size).toBeGreaterThan(0);
      for (const entry of SAMPLES) {
        for (const file of await lower(entry, bundle)) {
          if (!file.path.includes('/models/block/')) continue;
          const parent = (file.contents as JsonObject).parent as string;
          expect(templates.has(parent), `${file.path}: ${parent}`).toBe(true);
        }
      }
    });

    it.each(TYPES.map((type) => [type] as const))(
      'lowers and validates the defaults of %s with no problem',
      async (type) => {
        const entry = defaultsOf(type);
        const { files, problems } = await lowerAndCheck(entry, bundle);
        expect(problems).toEqual([]);
        expect(files.some((file) => file.path.includes('/blockstates/'))).toBe(true);
        expect(
          await validatorProblems([element(blockKind.id, entry.id, entry.data)], bundle),
        ).toEqual([]);
      },
    );
  },
);

describe('furniture types', () => {
  it('names the model slots', () => {
    expect(BLOCK_TYPE_MODEL_SLOTS.bed).toEqual(['head', 'foot', 'item']);
    expect(BLOCK_TYPE_MODEL_SLOTS.ladder).toEqual(['ladder', 'item']);
    expect(BLOCK_TYPE_MODEL_SLOTS.torch).toEqual(['torch', 'wall', 'item']);
    expect(BLOCK_TYPE_MODEL_SLOTS.lantern).toEqual(['lantern', 'hanging', 'item']);
    expect(BLOCK_TYPE_MODEL_SLOTS.chain).toEqual(['chain', 'item']);
    expect(BLOCK_TYPE_MODEL_SLOTS.rod).toEqual(['rod', 'item']);
    expect(BLOCK_TYPE_MODEL_SLOTS.sign).toEqual(['rot0', 'rot1', 'rot2', 'rot3', 'wall', 'item']);
    expect(BLOCK_TYPE_MODEL_SLOTS.hanging_sign).toEqual([
      'rot0',
      'rot1',
      'rot2',
      'rot3',
      'attached_rot0',
      'attached_rot1',
      'attached_rot2',
      'attached_rot3',
      'wall',
      'item',
    ]);
    expect(BLOCK_TYPE_MODEL_SLOTS.stem).toEqual([
      ...Array.from({ length: 8 }, (_, age) => `stage${age}`),
      'attached',
      'item',
    ]);
    expect(BLOCK_TYPE_MODEL_SLOTS.scaffolding).toEqual(['stable', 'unstable', 'item']);
  });

  it('lists the companions of torches, signs and stems', () => {
    expect(blockGeneratedBlockIds('demo:lamp', { type: 'torch' })).toEqual(['demo:lamp_wall']);
    expect(blockGeneratedBlockIds('demo:board', { type: 'sign' })).toEqual(['demo:board_wall']);
    expect(blockGeneratedBlockIds('demo:board', { type: 'hanging_sign' })).toEqual([
      'demo:board_wall',
    ]);
    expect(blockGeneratedBlockIds('demo:vine', { type: 'stem' })).toEqual(['demo:vine_attached']);
    for (const type of ['block', 'bed', 'ladder', 'lantern', 'chain', 'rod', 'scaffolding']) {
      expect(blockGeneratedBlockIds('demo:x', { type }), type).toEqual([]);
    }
    expect(blockGeneratedBlockIds('demo:x', { type: 'nonsense' })).toEqual([]);
    expect(blockGeneratedBlockIds('demo:x', null)).toEqual([]);
  });

  it('writes the bed halves by facing, drops from the head and shows both halves as the item', async () => {
    const files = await lower(byName('bed'));
    const state = variantsOf(files, 'straw_bed');
    expect(Object.keys(state)).toHaveLength(8);
    expect(state['facing=east,part=foot']).toEqual({
      model: 'example:block/straw_bed_foot',
      y: 90,
    });
    expect(state['facing=north,part=head']).toEqual({ model: 'example:block/straw_bed_head' });
    expect(contentsOf(files, '/models/block/straw_bed_head.json')).toEqual({
      parent: 'minecraft:block/template_bed_head',
      textures: {
        east: 'example:block/straw_bed',
        north: 'example:block/straw_bed',
        particle: 'example:block/straw_bed',
        up: 'example:block/straw_bed',
        west: 'example:block/straw_bed',
      },
    });
    const item = contentsOf(files, '/items/straw_bed.json') as { model: JsonObject };
    expect(item.model.type).toBe('minecraft:composite');
    expect(JSON.stringify(item)).toContain('"translation":[0,0,1]');
    const loot = JSON.stringify(contentsOf(files, '/loot_table/blocks/straw_bed.json'));
    expect(loot).toContain('"part":"head"');
    expect(files[0]?.contents).toEqual({
      format: 1,
      type: 'bed',
      rule: 'straw_bed',
      colour: 'yellow',
      item: { max_stack_size: 1 },
    });
    const pictured = await lower(byName('bed-item-picture'));
    expect(contentsOf(pictured, '/models/item/moss_bed.json')).toEqual({
      parent: 'minecraft:item/generated',
      textures: { layer0: 'example:item/moss_bed' },
    });
    expect(blockGeneratedModelIds('example:moss_bed', byName('bed-item-picture').data)).toEqual([
      'example:block/moss_bed_head',
      'example:block/moss_bed_foot',
      'example:item/moss_bed',
    ]);
  });

  it('writes the torch and its wall companion, each dropping the item', async () => {
    const files = await lower(byName('torch'));
    expect(variantsOf(files, 'soul_lamp')).toEqual({
      '': { model: 'example:block/soul_lamp' },
    });
    expect(variantsOf(files, 'soul_lamp_wall')).toEqual({
      'facing=east': { model: 'example:block/soul_lamp_wall' },
      'facing=north': { model: 'example:block/soul_lamp_wall', y: 270 },
      'facing=south': { model: 'example:block/soul_lamp_wall', y: 90 },
      'facing=west': { model: 'example:block/soul_lamp_wall', y: 180 },
    });
    const wallLoot = contentsOf(files, '/loot_table/blocks/soul_lamp_wall.json');
    expect(JSON.stringify(wallLoot)).toContain('"name":"example:soul_lamp"');
    expect(wallLoot?.random_sequence).toBe('example:blocks/soul_lamp_wall');
    expect(files[0]?.contents).toMatchObject({ particle: 'minecraft:soul_fire_flame' });
  });

  it('turns signs in sixteen steps and hangs wall signs by facing', async () => {
    const files = await lower(byName('sign'));
    const state = variantsOf(files, 'ruby_sign');
    expect(Object.keys(state)).toHaveLength(16);
    expect(state['rotation=0']).toEqual({ model: 'example:block/ruby_sign_rot_0' });
    expect(state['rotation=6']).toEqual({ model: 'example:block/ruby_sign_rot_2', y: 90 });
    expect(state['rotation=15']).toEqual({ model: 'example:block/ruby_sign_rot_3', y: 270 });
    expect(variantsOf(files, 'ruby_sign_wall')['facing=east']).toEqual({
      model: 'example:block/ruby_sign_wall',
      y: 270,
    });
    expect(contentsOf(files, '/models/block/ruby_sign_rot_1.json')).toEqual({
      parent: 'minecraft:block/template_sign_rot_1',
      textures: { all: 'example:block/ruby_sign', particle: 'example:block/ruby_sign' },
    });
    expect(contentsOf(files, '/tags/block/standing_signs.json')).toEqual({
      values: ['example:ruby_sign'],
    });
    expect(contentsOf(files, '/tags/block/wall_signs.json')).toEqual({
      values: ['example:ruby_sign_wall'],
    });
    expect(contentsOf(files, '/tags/item/signs.json')).toEqual({ values: ['example:ruby_sign'] });
    const models = variantsOf(await lower(byName('sign-models')), 'plain_sign');
    expect(models['rotation=5']).toEqual({ model: 'example:block/plain_sign_b', y: 90 });
  });

  it('writes a hanging sign attached and free, and names its edit screen picture', async () => {
    const files = await lower(byName('hanging-sign'));
    const state = variantsOf(files, 'ruby_hanging_sign');
    expect(Object.keys(state)).toHaveLength(32);
    expect(state['attached=true,rotation=9']).toEqual({
      model: 'example:block/ruby_hanging_sign_attached_rot_1',
      y: 180,
    });
    expect(Object.keys(variantsOf(files, 'ruby_hanging_sign_wall'))).toHaveLength(4);
    const id = 'example:ruby_hanging_sign';
    expect(signGuiTextureId(id, 'hanging_sign')).toBe(
      'example:gui/hanging_signs/ruby_hanging_sign',
    );
    expect(signGuiTexturePath(firstBundle.target, id, 'hanging_sign')).toBe(
      'assets/example/textures/gui/hanging_signs/ruby_hanging_sign.png',
    );
    expect(signGuiPicture(byName('hanging-sign').data, 'hanging_sign')).toBe(
      'example:gui/hanging_signs/ruby_hanging_sign',
    );
    expect(signGuiPicture(byName('sign').data, 'sign')).toBe('example:gui/signs/ruby_sign');
    expect(signGuiPicture({ textures: { all: 'example:block/x' } }, 'sign')).toBe(
      'example:block/x',
    );
  });

  it('grows the stem by age, bends the attached stem and drops seeds as a melon stem', async () => {
    const files = await lower(byName('stem'));
    const state = variantsOf(files, 'gourd_stem');
    expect(Object.keys(state)).toEqual(Array.from({ length: 8 }, (_, age) => `age=${age}`));
    expect(contentsOf(files, '/models/block/gourd_stem_attached.json')).toEqual({
      parent: 'minecraft:block/stem_fruit',
      textures: {
        stem: 'example:block/gourd_stem',
        upperstem: 'example:block/gourd_stem_bent',
      },
    });
    expect(variantsOf(files, 'gourd_stem_attached')['facing=east']).toEqual({
      model: 'example:block/gourd_stem_attached',
      y: 180,
    });
    const loot = JSON.stringify(contentsOf(files, '/loot_table/blocks/gourd_stem.json'));
    expect(loot).toContain('"p":0.06666667');
    expect(loot).toContain('"name":"example:gourd_seeds"');
    const attached = JSON.stringify(
      contentsOf(files, '/loot_table/blocks/gourd_stem_attached.json'),
    );
    expect(attached).toContain('"p":0.53333333');
    expect(contentsOf(files, '/tags/block/maintains_farmland.json')).toBeDefined();
    const farmland = files.filter((file) => file.path.endsWith('/maintains_farmland.json'));
    expect(farmland.map((file) => (file.contents as JsonObject).values)).toEqual([
      ['example:gourd_stem'],
      ['example:gourd_stem_attached'],
    ]);
  });

  it('writes ladders, lanterns, chains, rods and scaffolding in vanilla shape', async () => {
    expect(variantsOf(await lower(byName('ladder')), 'rope_ladder')['facing=west']).toEqual({
      model: 'example:block/rope_ladder',
      y: 270,
    });
    const lantern = await lower(byName('lantern'));
    expect(variantsOf(lantern, 'paper_lantern')['hanging=true']).toEqual({
      model: 'example:block/paper_lantern_hanging',
    });
    expect(contentsOf(lantern, '/models/item/paper_lantern.json')).toEqual({
      parent: 'minecraft:item/generated',
      textures: { layer0: 'example:item/paper_lantern' },
    });
    expect(variantsOf(await lower(byName('chain')), 'rope')['axis=x']).toEqual({
      model: 'example:block/rope',
      x: 90,
      y: 90,
    });
    expect(variantsOf(await lower(byName('rod')), 'crystal_rod')['facing=down']).toEqual({
      model: 'example:block/crystal_rod',
      x: 180,
    });
    const scaffolding = await lower(byName('scaffolding'));
    expect(variantsOf(scaffolding, 'bamboo_frame')['bottom=true']).toEqual({
      model: 'example:block/bamboo_frame_unstable',
    });
    expect(contentsOf(scaffolding, '/items/bamboo_frame.json')).toEqual({
      model: { type: 'minecraft:model', model: 'example:block/bamboo_frame_stable' },
    });
    expect(contentsOf(scaffolding, '/tags/block/climbable.json')).toEqual({
      values: ['example:bamboo_frame'],
    });
  });

  it('writes no companion loot without a block item', async () => {
    const files = await lower(
      sample('torch-no-item', 'example:bare_torch', {
        type: 'torch',
        textures: { texture: 'example:block/bare_torch' },
        item: false,
        loot: 'self',
      }),
    );
    expect(files.some((file) => file.path.includes('/loot_table/'))).toBe(false);
    expect(files.some((file) => file.path.endsWith('/blockstates/bare_torch_wall.json'))).toBe(
      true,
    );
  });
});

describe('potted plants have no item unless given (B448)', () => {
  const pot = (data: JsonObject = {}): JsonObject => ({
    format: 1,
    type: 'potted_plant',
    plant: 'minecraft:short_grass',
    loot: 'self',
    ...data,
  });

  it('gives a potted plant no block item unless item is given', () => {
    expect(blockItemIdOf('demo:pot', pot())).toBeUndefined();
    expect(blockItemIdOf('demo:pot', pot({ item: false }))).toBeUndefined();
    expect(blockItemIdOf('demo:pot', pot({ item: {} }))).toBe('demo:pot');
  });

  it('still writes the pot-and-plant table and no item definition', async () => {
    for (const data of [pot(), pot({ item: false })]) {
      const files = await lower({ name: 'pot', id: 'demo:pot' as ResourceLocation, data });
      const loot = contentsOf(files, '/loot_table/blocks/pot.json') as {
        pools: { entries: JsonObject[] }[];
      };
      expect(loot.pools.map((pool) => pool.entries[0]?.name)).toEqual([
        'minecraft:flower_pot',
        'minecraft:short_grass',
      ]);
      expect(files.some((file) => file.path.includes('/items/'))).toBe(false);
    }
  });
});
