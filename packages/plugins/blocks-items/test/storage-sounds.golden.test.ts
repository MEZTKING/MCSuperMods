/**
 * Golden tests of storage 2 (ADR 0104 D3 to D6), own block sounds and set types (ADR 0105 D1,
 * D2, with the amendment after B503) and the rules for vanilla blocks (D4); B515. Each sample is
 * lowered for every built-in target, its element data and every output are validated against
 * their schemas, and the outputs are compared with
 * `fixtures/<target id>/expected/<block|vanilla_block_rules>/<name>.json`. Set
 * `UPDATE_GOLDENS=1` to rewrite the expected files instead of comparing.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElementKind, Json, JsonObject, OutputFile, ResourceLocation } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { blockKind, vanillaBlockRulesKind } from '../src/index';
import { CHEST_TYPE_VALUES, isDoubleChest } from '../src/lowering/block';
import {
  BLOCK_SOUND_SET_SCHEMA,
  blockSoundSetEntry,
  blockSoundsOf,
  FORMAT_SOUND_TYPES,
  soundSetOf,
} from '../src/lowering/sounds';
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
  id: ResourceLocation;
  data: JsonObject;
}

const sample = (kind: ElementKind, name: string, id: string, data: JsonObject): Sample => ({
  name,
  kind,
  id: id as ResourceLocation,
  data: { format: 1, ...data },
});

/** A project sound key the samples name (a key of the project's `sounds.json`). */
const PROJECT_SOUNDS = [
  'example:block.chime.break',
  'example:block.chime.step',
  'example:block.chime.place',
  'example:door.chime.open',
  'example:door.chime.close',
];

const crateTextures = {
  front: 'example:block/crate_front',
  front_open: 'example:block/crate_front_open',
  side: 'example:block/crate_side',
  top: 'example:block/crate_top',
};

const SAMPLES: Sample[] = [
  sample(blockKind, 'storage2-double-chest', 'example:oak_crate', {
    type: 'horizontal',
    loot: 'self',
    textures: crateTextures,
    components: { 'msm:container': { double: true } },
  }),
  sample(blockKind, 'storage2-double-chest-wet', 'example:sea_crate', {
    loot: 'self',
    model: 'example:block/sea_crate',
    components: { 'msm:container': { rows: 3, double: true }, 'msm:waterloggable': {} },
  }),
  sample(blockKind, 'storage2-per-player', 'example:void_chest', {
    type: 'horizontal',
    loot: 'self',
    textures: crateTextures,
    components: { 'msm:container': { per_player: true, hoppers: false, comparator: false } },
  }),
  sample(blockKind, 'storage2-wet-machine', 'example:wet_mill', {
    type: 'horizontal',
    loot: 'self',
    textures: {
      front: 'example:block/mill_front',
      front_lit: 'example:block/mill_front_lit',
      side: 'example:block/mill_side',
      top: 'example:block/mill_top',
    },
    components: { 'msm:machine': {}, 'msm:waterloggable': {} },
  }),
  sample(blockKind, 'storage2-ageing-chest', 'example:tin_chest', {
    type: 'horizontal',
    loot: 'self',
    textures: crateTextures,
    components: {
      'msm:container': {},
      'msm:weathering': { stage: 'unaffected', next: 'example:exposed_tin_chest' },
      'msm:waxable': { into: 'example:waxed_tin_chest' },
    },
  }),
  sample(blockKind, 'sounds-own', 'example:chime_block', {
    loot: 'self',
    model: 'example:block/chime_block',
    sound_type: 'amethyst',
    block_sounds: {
      break: 'example:block.chime.break',
      step: 'example:block.chime.step',
      place: 'example:block.chime.place',
      hit: 'minecraft:block.amethyst_block.hit',
      fall: 'minecraft:block.amethyst_block.fall',
      volume: 0.8,
      pitch: 1.2,
    },
  }),
  sample(blockKind, 'sounds-partial-high', 'example:squeaky_block', {
    model: 'example:block/squeaky_block',
    block_sounds: { step: 'minecraft:block.wool.step', pitch: 3, volume: 0 },
  }),
  sample(blockKind, 'sounds-own-door', 'example:chime_door', {
    type: 'door',
    loot: 'self',
    textures: { top: 'example:block/chime_door_top', bottom: 'example:block/chime_door_bottom' },
    set_type: {
      base: 'iron',
      sounds: { open: 'example:door.chime.open', close: 'example:door.chime.close' },
      can_open_by_hand: true,
    },
  }),
  sample(blockKind, 'sounds-own-plate', 'example:chime_plate', {
    type: 'pressure_plate',
    loot: 'self',
    textures: { all: 'example:block/chime_block' },
    set_type: {
      sounds: { press: 'minecraft:block.copper.place', release: 'minecraft:block.copper.break' },
      plate_sensitivity: 'mobs',
    },
  }),
  sample(vanillaBlockRulesKind, 'rules-every-kind', 'example:farm_rules', {
    strip: [{ block: 'minecraft:mossy_cobblestone', into: 'minecraft:cobblestone' }],
    flatten: [{ block: 'minecraft:moss_block', into: 'minecraft:dirt_path' }],
    till: [{ block: 'minecraft:mud', into: 'minecraft:farmland', drops: 'minecraft:clay_ball' }],
    wax: [{ block: 'minecraft:tuff', into: 'minecraft:polished_tuff' }],
    age: [{ block: 'minecraft:stone_bricks', next: 'minecraft:cracked_stone_bricks' }],
    burn: [{ block: 'minecraft:mushroom_stem', burn_odds: 5, ignite_odds: 20 }],
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
function withSampleIds(indexes: TargetIndexes, item: Sample, files: OutputFile[]): TargetIndexes {
  const named = strings(item.data);
  const models = files
    .filter((file) => file.path.includes('/models/'))
    .map((file) => file.path.replace(/^assets\/([^/]+)\/models\/(.+)\.json$/, '$1:$2'));
  const isBlock = item.kind === blockKind;
  const blocks = named.filter((id) => /^example:[a-z_]+$/.test(id));
  const project: Record<string, readonly string[]> = {
    ...PROJECT_IDS,
    block: [...(PROJECT_IDS.block ?? []), ...(isBlock ? [item.id] : []), ...blocks],
    item: [...(PROJECT_IDS.item ?? []), item.id],
    model: [
      ...(PROJECT_IDS.model ?? []),
      ...models,
      ...named.filter((id) => /^example:(block|item)\//.test(id)),
    ],
    texture: named.filter((id) => /^example:(block|item)\//.test(id)),
    sound_event: PROJECT_SOUNDS,
    weighed_sound_event: PROJECT_SOUNDS,
  };
  // The app seeds `weighed_sound_event` with the vanilla sound events (vanilla's `sounds.json`
  // defines an event for each; `schema-context.ts` WEIGHED_SOUND_EVENT).
  const vanilla = { ...indexes.vanilla, weighed_sound_event: indexes.vanilla.sound_event ?? [] };
  return { ...indexes, registries: createRegistryIndex({ vanilla, project }) };
}

const fixturesRoot = new URL('./fixtures/', import.meta.url);

const recorded = (file: OutputFile): Record<string, unknown> => ({
  contents: file.contents,
  layer: file.layer,
  merge: file.merge,
  path: file.path,
  schema: file.schema,
});

async function lowerSample(item: Sample, bundle = builtInTargets[0]): Promise<OutputFile[]> {
  if (bundle === undefined) throw new Error('no built-in target');
  return item.kind.lower(element(item.kind.id, item.id, item.data), bundle.target);
}

const byName = (name: string): Sample => {
  const found = SAMPLES.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`no sample ${name}`);
  return found;
};

const fileOf = (files: OutputFile[], suffix: string): OutputFile | undefined =>
  files.find((file) => file.path.endsWith(suffix));
const contentsOf = (files: OutputFile[], suffix: string): JsonObject =>
  fileOf(files, suffix)?.contents as JsonObject;

const bundleOf = (soundModel: string) => {
  const found = builtInTargets.find((entry) => entry.target.blocks?.soundModel === soundModel);
  if (found === undefined) throw new Error(`no target with ${soundModel}`);
  return found;
};

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'storage 2, own sounds and vanilla block rules for %s',
  (targetId, bundle) => {
    it.each(SAMPLES.map((entry) => [entry.name, entry] as const))('%s', async (_label, item) => {
      const files = await lowerSample(item, bundle);
      const indexes = withSampleIds(await indexesFor(bundle), item, files);
      const problems = (schema: string, value: Json) => blockingProblems(indexes, schema, value);
      expect(problems(item.kind.schema, item.data), item.id).toEqual([]);
      for (const file of files) {
        expect(file.schema, file.path).toBeDefined();
        if (file.schema === undefined) continue;
        expect(problems(file.schema, file.contents as Json), file.path).toEqual([]);
      }
      const actual = sortedJson(files.map(recorded));
      const url = new URL(
        `${targetId}/expected/${item.kind.folder}/${item.name}.json`,
        fixturesRoot,
      );
      if (UPDATE) {
        await mkdir(dirname(fileURLToPath(url)), { recursive: true });
        await writeFile(url, actual);
      }
      expect(actual).toBe(await readFile(url, 'utf8'));
    });

    it("maps every format sound type onto one of the target's own", () => {
      const own = bundle.target.blocks?.soundTypes ?? [];
      const alias = (name: string): string =>
        bundle.target.blocks?.soundModel === 'block_sound_set' && name === 'amethyst'
          ? 'amethyst_block'
          : name;
      for (const name of FORMAT_SOUND_TYPES) expect(own, name).toContain(alias(name));
    });
  },
);

describe('double chests (ADR 0104 D4)', () => {
  it('writes the closed variants once per half, without open', async () => {
    const files = await lowerSample(byName('storage2-double-chest'));
    const variants = contentsOf(files, '/blockstates/oak_crate.json').variants as JsonObject;
    expect(Object.keys(variants)).toHaveLength(12);
    for (const key of Object.keys(variants)) expect(key).not.toContain('open');
    for (const half of CHEST_TYPE_VALUES) {
      expect(variants[`facing=north,type=${half}`]).toEqual(variants['facing=north,type=single']);
    }
  });

  it('adds waterlogged on top for a chest that holds water', async () => {
    const files = await lowerSample(byName('storage2-double-chest-wet'));
    const variants = contentsOf(files, '/blockstates/sea_crate.json').variants as JsonObject;
    expect(Object.keys(variants)).toEqual([
      'type=single,waterlogged=false',
      'type=single,waterlogged=true',
      'type=left,waterlogged=false',
      'type=left,waterlogged=true',
      'type=right,waterlogged=false',
      'type=right,waterlogged=true',
    ]);
  });

  it('takes the chest as the runtime does', () => {
    const chest = (container: JsonObject, extra: JsonObject = {}) => ({
      components: { 'msm:container': container, ...extra },
    });
    expect(isDoubleChest('horizontal', chest({ double: true }))).toBe(true);
    expect(isDoubleChest('block', chest({ double: true, rows: 3, per_player: true }))).toBe(true);
    expect(isDoubleChest('horizontal', chest({ double: true, rows: 6 }))).toBe(false);
    expect(isDoubleChest('horizontal', chest({ double: true, keep_contents: true }))).toBe(false);
    expect(isDoubleChest('horizontal', chest({ double: true, layout: 'hopper' }))).toBe(false);
    expect(isDoubleChest('horizontal', chest({ double: true }, { 'msm:machine': {} }))).toBe(false);
    expect(isDoubleChest('slab', chest({ double: true }))).toBe(false);
    expect(isDoubleChest('horizontal', chest({}))).toBe(false);
  });

  it('leaves a per-player chest with its open state', async () => {
    const files = await lowerSample(byName('storage2-per-player'));
    const variants = contentsOf(files, '/blockstates/void_chest.json').variants as JsonObject;
    expect(Object.keys(variants)).toContain('facing=north,open=true');
  });
});

describe('waterlogged machines and ageing containers (ADR 0104 D3, D6)', () => {
  it('gives a machine waterlogged on top of lit', async () => {
    const files = await lowerSample(byName('storage2-wet-machine'));
    const variants = contentsOf(files, '/blockstates/wet_mill.json').variants as JsonObject;
    expect(Object.keys(variants)).toHaveLength(16);
    expect(Object.keys(variants)).toContain('facing=east,lit=true,waterlogged=true');
  });

  it('keeps the container and the weathering in the definition', async () => {
    const files = await lowerSample(byName('storage2-ageing-chest'));
    const definition = contentsOf(files, 'msm/example/block/tin_chest.json');
    const components = definition.components as JsonObject;
    expect(components['msm:container']).toEqual({});
    expect(components['msm:weathering']).toEqual({
      stage: 'unaffected',
      next: 'example:exposed_tin_chest',
    });
  });
});

describe('own block sounds (ADR 0105 D1)', () => {
  it('writes no sound set where the runtime builds the sounds (sound_type)', async () => {
    const files = await lowerSample(byName('sounds-own'), bundleOf('sound_type'));
    expect(files.some((file) => file.path.includes('block_sound_set'))).toBe(false);
    const definition = contentsOf(files, 'msm/example/block/chime_block.json');
    expect(definition.block_sounds).toEqual(byName('sounds-own').data.block_sounds);
  });

  it('writes the block_sound_set entry under the block id where sounds are data', async () => {
    const files = await lowerSample(byName('sounds-own'), bundleOf('block_sound_set'));
    const entry = fileOf(files, 'data/example/block_sound_set/chime_block.json');
    expect(entry?.layer).toBe('datapack');
    expect(entry?.schema).toBe(BLOCK_SOUND_SET_SCHEMA);
    expect(entry?.contents).toEqual({
      break_sound: { sound_id: 'example:block.chime.break' },
      fall_sound: { sound_id: 'minecraft:block.amethyst_block.fall' },
      hit_sound: { sound_id: 'minecraft:block.amethyst_block.hit' },
      pitch: 1.2,
      place_sound: { sound_id: 'example:block.chime.place' },
      step_sound: { sound_id: 'example:block.chime.step' },
      volume: 0.8,
    });
    // The definition keeps the field for the runtime, which names the entry.
    const definition = contentsOf(files, 'msm/example/block/chime_block.json');
    expect(definition.block_sounds).toBeDefined();
  });

  it('writes only the events given, within the ranges the entry takes', () => {
    const sounds = blockSoundsOf({
      block_sounds: { step: 'block.wool.step', pitch: 3, volume: 0 },
    });
    expect(sounds?.events).toEqual({ step: 'minecraft:block.wool.step' });
    expect(
      blockSoundSetEntry(sounds ?? { events: {}, pitch: undefined, volume: undefined }),
    ).toEqual({ pitch: 2, step_sound: { sound_id: 'minecraft:block.wool.step' }, volume: 0.00001 });
    expect(blockSoundsOf({})).toBeUndefined();
  });

  it("fills the events left out from the sound type's vanilla set where sounds are data", async () => {
    const bundle = bundleOf('block_sound_set');
    const files = await lowerSample(byName('sounds-partial-high'), bundle);
    // No `sound_type`: the format's default `stone`; pitch and volume as the entry takes them.
    expect(contentsOf(files, 'data/example/block_sound_set/squeaky_block.json')).toEqual({
      break_sound: { sound_id: 'minecraft:block.stone.break' },
      fall_sound: { sound_id: 'minecraft:block.stone.fall' },
      hit_sound: { sound_id: 'minecraft:block.stone.hit' },
      pitch: 2,
      place_sound: { sound_id: 'minecraft:block.stone.place' },
      step_sound: { sound_id: 'minecraft:block.wool.step' },
      volume: 0.00001,
    });
    // The format's `amethyst` is the `amethyst_block` set.
    expect(soundSetOf(bundle.target.blocks, { sound_type: 'amethyst' })?.break).toBe(
      'minecraft:block.amethyst_block.break',
    );
    // The set's own volume and pitch, unless the block gives its own; a set's missing event stays out.
    const metal = soundSetOf(bundle.target.blocks, { sound_type: 'metal' });
    const own = { events: { step: 'minecraft:block.wool.step' }, pitch: undefined, volume: 0.5 };
    expect(blockSoundSetEntry(own, metal)).toMatchObject({ pitch: 1.5, volume: 0.5 });
    const flower = soundSetOf(bundle.target.blocks, { sound_type: 'cactus_flower' });
    expect(Object.keys(blockSoundSetEntry({ ...own, events: {} }, flower))).toEqual([
      'break_sound',
      'place_sound',
      'volume',
    ]);
    expect(
      soundSetOf(bundleOf('sound_type').target.blocks, { sound_type: 'stone' }),
    ).toBeUndefined();
  });

  it('leaves own set type sounds to the runtime (no data file)', async () => {
    for (const bundle of builtInTargets) {
      const files = await lowerSample(byName('sounds-own-door'), bundle);
      expect(files.some((file) => file.path.includes('block_sound_set'))).toBe(false);
      const definition = contentsOf(files, 'msm/example/block/chime_door.json');
      expect(definition.set_type).toEqual(byName('sounds-own-door').data.set_type);
    }
  });
});

describe('rules for vanilla blocks (ADR 0105 D4)', () => {
  it('lowers to the runtime folder only, as written', async () => {
    for (const bundle of builtInTargets) {
      const files = await lowerSample(byName('rules-every-kind'), bundle);
      expect(files.map((file) => [file.path, file.layer])).toEqual([
        ['msm/example/vanilla_block_rules/farm_rules.json', 'msm'],
      ]);
      expect(files[0]?.contents).toEqual(byName('rules-every-kind').data);
    }
  });
});
