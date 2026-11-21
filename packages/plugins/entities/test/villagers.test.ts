/**
 * Lowering of ADR 0098: the `msm:trader`, `msm:storage` and `msm:shoulder_riding` entity
 * components and the `msm:villager_profession` kind. Golden tests lower a trader, a pack mule, a
 * shoulder pet and two professions for every built-in target, validate each output against the
 * schema it declares and compare with `fixtures/<target id>/expected/villagers/<sample>.json`
 * (`UPDATE_GOLDENS=1` rewrites them).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElementKind, Json, OutputFile, ResourceLocation } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  ACQUIRABLE_JOB_SITE_TAG,
  DEFAULT_STORAGE_ROWS,
  DEFAULT_TRADES_PER_LEVEL,
  defaultTradeSets,
  EntitiesLoweringError,
  entityKind,
  lowerProfession,
  PROFESSION_LEVELS,
  professionDefinition,
  professionKind,
  professionNameKey,
  professionTexturePaths,
  SHOULDER_MAX_WIDTH,
  shoulderDefinition,
  storageDefinition,
  traderDefinition,
} from '../src/index';
import { blockingProblems, element, indexesFor, sortedJson } from './support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';
const firstTarget = (builtInTargets[0] as TargetBundle).target;

interface Sample {
  name: string;
  kind: ElementKind;
  id: ResourceLocation;
  data: Json;
}

const model = (id: string) => ({ model: id, texture: id });

const SAMPLES: Sample[] = [
  {
    // A trader with every field: two levels (one vanilla, one project set), the trade sound
    // left to the target.
    name: 'trader',
    kind: entityKind,
    id: 'example:ruby_golem',
    data: {
      format: 1,
      display_name: 'Ruby Merchant',
      category: 'creature',
      size: { width: 0.6, height: 1.95 },
      spawn_egg: false,
      components: {
        'msm:trader': {
          trade_sets: [
            { trade_set: 'minecraft:mason/level_1' },
            { trade_set: 'minecraft:mason/level_2', xp_to_next: 70 },
          ],
          levels: true,
          restock: 'never',
          on_trade: 'example:traded',
        },
        'msm:animated_model': model('example:entity/ruby_golem'),
      },
      events: {
        'example:traded': {
          actions: [{ type: 'play_sound', sound: 'minecraft:entity.villager.celebrate' }],
        },
      },
    },
  },
  {
    // A trader that names its own sound keeps it.
    name: 'trader_own_sound',
    kind: entityKind,
    id: 'example:shade',
    data: {
      format: 1,
      category: 'monster',
      base: 'monster',
      size: { width: 0.6, height: 1.9 },
      spawn_egg: false,
      components: {
        'msm:trader': {
          trade_sets: [{ trade_set: 'minecraft:wandering_trader/common' }],
          levels: false,
          trade_sound: 'minecraft:entity.wandering_trader.yes',
        },
        'msm:animated_model': model('example:entity/shade'),
      },
    },
  },
  {
    // A pack mule: a saddled, tamed mount whose storage needs a chest (the saddle tag entry
    // comes from the entity lowering; storage defaults are written out).
    name: 'pack_mule',
    kind: entityKind,
    id: 'example:shade',
    data: {
      format: 1,
      display_name: 'Pack Mule',
      base: 'animal',
      category: 'creature',
      size: { width: 1.4, height: 1.6 },
      spawn_egg: false,
      components: {
        'msm:tameable': { items: ['minecraft:apple'], sit: false },
        'msm:rideable': { controlled_by: 'owner' },
        'msm:storage': { needs_chest: true, close_sound: 'minecraft:entity.donkey.chest' },
        'msm:animated_model': model('example:entity/shade'),
      },
    },
  },
  {
    // A shoulder pet: a small tamed animal; the component lowers to `{}`.
    name: 'shoulder_pet',
    kind: entityKind,
    id: 'example:mobs/moth',
    data: {
      format: 1,
      display_name: 'Moth',
      base: 'animal',
      category: 'creature',
      size: { width: 0.4, height: 0.4 },
      spawn_egg: false,
      components: {
        'msm:tameable': { items: ['minecraft:sweet_berries'] },
        'msm:shoulder_riding': {},
        'msm:storage': { rows: 1 },
        'msm:animated_model': model('example:entity/moth'),
      },
    },
  },
  {
    // A profession with every field but its own trade sets: lowering creates the five sets and
    // their tags, the job site entry and the name.
    name: 'profession',
    kind: professionKind,
    id: 'example:jobs/gem_cutter',
    data: {
      format: 1,
      display_name: 'Gem Cutter',
      job_site: 'example:cutting_table',
      work_sound: 'minecraft:entity.villager.work_mason',
      requested_items: ['minecraft:emerald'],
      secondary_job_blocks: ['minecraft:stone'],
      textures: { villager: 'example:entity/villager/profession/jobs/gem_cutter' },
    },
  },
  {
    // A profession naming its own five sets: no sets or tags are created; no name, no lang file.
    name: 'profession_own_sets',
    kind: professionKind,
    id: 'example:smith',
    data: {
      job_site: 'example:smithing_anvil',
      trade_sets: [
        'minecraft:armorer/level_1',
        'minecraft:armorer/level_2',
        'minecraft:toolsmith/level_3',
        'minecraft:toolsmith/level_4',
        'minecraft:weaponsmith/level_5',
      ],
    },
  },
];

const recorded = (file: OutputFile): Record<string, unknown> => ({
  contents: file.contents,
  layer: file.layer,
  merge: file.merge,
  path: file.path,
  schema: file.schema,
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'golden villager lowering for %s',
  (targetId, bundle) => {
    it.each(SAMPLES.map((sample) => [sample.name, sample] as const))(
      '%s',
      async (_label, sample) => {
        const created = element(sample.kind.id, sample.id, sample.data);
        const files = await sample.kind.lower(created, bundle.target);
        const indexes = await indexesFor(bundle);
        const problems = (schema: string, value: Json) =>
          blockingProblems(indexes, schema, value).filter(
            // Project ids the shared test registry does not list (models, job site blocks,
            // trade tags lowering creates) are not what this test checks.
            (problem) => problem.code !== 'schema.unknown-id',
          );
        expect(problems(sample.kind.schema, sample.data)).toEqual([]);
        for (const file of files) {
          expect(file.schema, file.path).toBeDefined();
          expect(problems(file.schema as string, file.contents as Json), file.path).toEqual([]);
        }
        expect(await sample.kind.lower(created, bundle.target)).toEqual(files);
        const actual = sortedJson(files.map(recorded));
        const url = new URL(
          `./fixtures/${targetId}/expected/villagers/${sample.name}.json`,
          import.meta.url,
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

describe('trader, storage and shoulder components', () => {
  it('defaults the trade sound to the target fact and keeps a set one', () => {
    for (const bundle of builtInTargets) {
      const yes = bundle.target.entities?.tradeSounds?.yes;
      expect(yes).toBe('minecraft:entity.villager.yes');
      expect(traderDefinition({ trade_sets: [] }, bundle.target).trade_sound).toBe(yes);
      expect(
        traderDefinition({ trade_sets: [], trade_sound: 'minecraft:x' }, bundle.target).trade_sound,
      ).toBe('minecraft:x');
    }
    const { entities: _entities, ...noFacts } = firstTarget;
    expect(traderDefinition({ trade_sets: [] }, noFacts).trade_sound).toBeUndefined();
  });

  it('writes storage defaults without changing the input', () => {
    const input = { open_sound: 'minecraft:block.barrel.open' };
    expect(storageDefinition(input)).toEqual({
      open_sound: 'minecraft:block.barrel.open',
      rows: DEFAULT_STORAGE_ROWS,
      needs_chest: false,
    });
    expect(input).toEqual({ open_sound: 'minecraft:block.barrel.open' });
    expect(storageDefinition({ rows: 6, needs_chest: true })).toEqual({
      rows: 6,
      needs_chest: true,
    });
    expect(DEFAULT_STORAGE_ROWS).toBe(3);
  });

  it('lowers the shoulder component to an empty object and leaves odd values alone', async () => {
    expect(shoulderDefinition()).toEqual({});
    expect(SHOULDER_MAX_WIDTH).toBe(0.7);
    const lowered = async (value: Json) => {
      const files = await entityKind.lower(
        element('msm:entity', 'demo:x', {
          format: 1,
          category: 'creature',
          size: { width: 0.5, height: 0.5 },
          components: {
            'msm:shoulder_riding': value,
            'msm:animated_model': model('demo:entity/x'),
          },
        }),
        firstTarget,
      );
      return ((files[0] as OutputFile).contents as { components: Record<string, Json> }).components[
        'msm:shoulder_riding'
      ];
    };
    expect(await lowered({ stray: 1 })).toEqual({});
    expect(await lowered(true)).toBe(true);
  });

  it('does not change the element data while lowering components', async () => {
    const data = SAMPLES.find((sample) => sample.name === 'pack_mule')?.data as Json;
    const before = structuredClone(data);
    await entityKind.lower(element('msm:entity', 'example:shade', data), firstTarget);
    expect(data).toEqual(before);
  });
});

describe('msm:villager_profession', () => {
  it('is a kind of the villager_profession registry with a hidden format', () => {
    expect([
      professionKind.id,
      professionKind.schema,
      professionKind.folder,
      professionKind.registry,
      professionKind.hiddenPaths,
    ]).toEqual([
      'msm:villager_profession',
      MSM_SCHEMA_REFS.villagerProfession,
      'villager_profession',
      'villager_profession',
      ['/format'],
    ]);
    expect(professionKind.defaultData).toEqual({ format: 1, job_site: '' });
  });

  it('names the five default trade sets and strips the element-only fields', () => {
    expect(PROFESSION_LEVELS).toBe(5);
    expect(DEFAULT_TRADES_PER_LEVEL).toBe(2);
    expect(defaultTradeSets('demo:jobs/miner')).toEqual([
      'demo:jobs/miner/level_1',
      'demo:jobs/miner/level_2',
      'demo:jobs/miner/level_3',
      'demo:jobs/miner/level_4',
      'demo:jobs/miner/level_5',
    ]);
    const created = element('msm:villager_profession', 'demo:miner', {
      format: 7,
      job_site: 'demo:drill',
      display_name: 'Miner',
      textures: { villager: 'demo:entity/miner' },
    });
    // An absent `trade_sets` stays absent: the runtime defaults it.
    expect(professionDefinition(created)).toEqual({ format: 1, job_site: 'demo:drill' });
    expect((created.data as { format: number }).format).toBe(7);
  });

  it('names the job with the villager key the game reads', () => {
    expect(professionNameKey('demo', 'jobs/miner')).toBe('entity.demo.villager.jobs.miner');
  });

  it('writes the acquirable job site entry as an optional mod-only entry', () => {
    const files = lowerProfession(
      element('msm:villager_profession', 'demo:miner', { job_site: 'demo:drill' }),
      firstTarget,
    );
    const tag = files.find((file) => file.schema === 'tag:point_of_interest_type');
    expect(ACQUIRABLE_JOB_SITE_TAG).toBe('minecraft:acquirable_job_site');
    expect(tag).toEqual({
      path: `data/minecraft/${firstTarget.folders.data.tags}/point_of_interest_type/acquirable_job_site.json`,
      contents: { values: [{ id: 'demo:miner', required: false }] },
      layer: 'datapack',
      schema: 'tag:point_of_interest_type',
      merge: 'tag',
    });
    expect(files.filter((file) => file.path.includes('/trade_set/'))).toHaveLength(5);
    expect(files.filter((file) => file.path.includes('/villager_trade/'))).toHaveLength(5);
    expect(files.some((file) => file.path.includes('/lang/'))).toBe(false);
  });

  it('gives the fixed picture paths, the zombie villager defaulting to the villager', () => {
    const textures = firstTarget.folders.resource.textures;
    const at = (data: Json) =>
      professionTexturePaths(
        firstTarget,
        element('msm:villager_profession', 'demo:jobs/miner', data),
      );
    expect(at({ job_site: 'demo:drill', textures: { villager: 'demo:entity/miner' } })).toEqual([
      {
        from: `assets/demo/${textures}/entity/miner.png`,
        to: `assets/demo/${textures}/entity/villager/profession/jobs/miner.png`,
      },
      {
        from: `assets/demo/${textures}/entity/miner.png`,
        to: `assets/demo/${textures}/entity/zombie_villager/profession/jobs/miner.png`,
      },
    ]);
    expect(
      at({
        job_site: 'demo:drill',
        textures: { villager: 'demo:entity/miner', zombie_villager: 'demo:entity/zombie_miner' },
      })[1]?.from,
    ).toBe(`assets/demo/${textures}/entity/zombie_miner.png`);
    expect(at({ job_site: 'demo:drill' })).toEqual([]);
    expect(at({ job_site: 'demo:drill', textures: { villager: 'Bad Id' } })).toEqual([]);
  });

  it('rejects unsafe ids and non-object data', () => {
    expect(() =>
      lowerProfession(element('msm:villager_profession', 'demo:x', [1]), firstTarget),
    ).toThrow(EntitiesLoweringError);
    expect(() =>
      lowerProfession(element('msm:villager_profession', 'demo:../x', {}), firstTarget),
    ).toThrow(EntitiesLoweringError);
  });
});
