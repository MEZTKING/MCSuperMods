/**
 * Lowering of ADR 0107 and ADR 0109: the `msm:villager_type` kind, the bucket of
 * `msm:bucketable`, the shoulder's `sides`, and the trader, movement, goal and dash fields that
 * pass through. Golden tests lower each sample for every built-in target, validate each output
 * against the schema it declares and compare with
 * `fixtures/<target id>/expected/mobs-2/<sample>.json` (`UPDATE_GOLDENS=1` rewrites them).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElementKind, Json, OutputFile, ResourceLocation } from '@msm/plugin-api';
import { createRegistryIndex, MSM_SCHEMA_REFS } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  BUCKET_PARENT_MODEL,
  bucketItemFiles,
  bucketItemId,
  bucketLanguageKeys,
  bucketNameKey,
  bucketTexture,
  DEFAULT_EMPTY_BUCKET_TEXTURE,
  DEFAULT_WATER_BUCKET_TEXTURE,
  EntitiesLoweringError,
  entityDefinition,
  entityKind,
  lowerVillagerType,
  SHOULDER_SIDES,
  shoulderDefinition,
  TEXTURE_META_SCHEMA,
  villagerTypeDefinition,
  villagerTypeKind,
  villagerTypeTextureId,
  villagerTypeTexturePaths,
} from '../src/index';
import { blockingProblems, element, indexesFor, PROJECT_IDS, sortedJson } from './support';

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
    // A bucketable fish with its own bucket name, picture and language key.
    name: 'bucket_fish',
    kind: entityKind,
    id: 'example:minnow',
    data: {
      format: 1,
      display_name: 'Minnow',
      category: 'water_ambient',
      size: { width: 0.4, height: 0.3 },
      spawn_egg: false,
      bucket_display_name: 'Pail of Minnow',
      bucket_texture: 'example:item/minnow_bucket',
      components: {
        'msm:movement': { mode: 'swim', speed: 1 },
        'msm:bucketable': { item_name: 'item.example.minnow_pail' },
        'msm:ai_goals': { goals: [{ type: 'play_dead', below_health: 0.4 }, { type: 'wander' }] },
        'msm:animated_model': model('example:entity/minnow'),
      },
    },
  },
  {
    // A fish caught without water: vanilla's empty bucket picture and the default name.
    name: 'bucket_dry',
    kind: entityKind,
    id: 'example:sand_eel',
    data: {
      format: 1,
      display_name: 'Sand Eel',
      category: 'water_ambient',
      size: { width: 0.4, height: 0.3 },
      spawn_egg: false,
      components: {
        'msm:movement': { mode: 'swim' },
        'msm:bucketable': { water: false },
        'msm:animated_model': model('example:entity/sand_eel'),
      },
    },
  },
  {
    // Flight, habits, a dash, a trader with reputation and a shoulder side, all passing through.
    name: 'habits',
    kind: entityKind,
    id: 'example:moth_king',
    data: {
      format: 1,
      base: 'animal',
      category: 'creature',
      size: { width: 0.6, height: 0.6 },
      spawn_egg: false,
      components: {
        'msm:movement': { mode: 'hover', hover_height: 6 },
        'msm:tameable': { items: ['minecraft:apple'] },
        'msm:shoulder_riding': { sides: 'left' },
        'msm:rideable': { saddle: false, dash: { power: 1.5, cooldown_ticks: 40 } },
        'msm:trader': {
          trade_sets: [{ trade_set: 'minecraft:mason/level_1' }],
          reputation: { hurt: 30, gift_item: 'minecraft:emerald', price_step: 10 },
          demand: false,
          work_site: 'minecraft:barrel',
        },
        'msm:ai_goals': {
          goals: [
            { type: 'swoop', targets: ['minecraft:player'], height: 10 },
            { type: 'roost', when_idle: true },
            { type: 'collect_items', range: 16 },
            {
              type: 'dig_items',
              dig_blocks: ['#minecraft:dirt'],
              loot_table: 'minecraft:gameplay/sniffer_digging',
            },
            {
              type: 'barter',
              item: 'minecraft:gold_ingot',
              loot_table: 'minecraft:gameplay/piglin_bartering',
            },
          ],
        },
        'msm:animated_model': model('example:entity/moth_king'),
      },
    },
  },
  {
    // A villager type with both pictures and a hat.
    name: 'villager_type',
    kind: villagerTypeKind,
    id: 'example:moor',
    data: {
      biomes: ['minecraft:swamp', '#minecraft:is_badlands'],
      textures: {
        villager: 'example:entity/villager/type/moor',
        zombie_villager: 'example:entity/moor_zombie',
        hat: 'partial',
      },
    },
  },
  {
    // A villager type without pictures: the definition only.
    name: 'villager_type_plain',
    kind: villagerTypeKind,
    id: 'example:dune',
    data: { format: 1, biomes: ['minecraft:desert'] },
  },
];

/** Project ids the samples name, for the schema checks of the lowered files. */
const SAMPLE_IDS: Record<string, readonly string[]> = {
  ...PROJECT_IDS,
  entity_type: [...(PROJECT_IDS.entity_type ?? []), 'example:minnow', 'example:sand_eel'],
  item: [...(PROJECT_IDS.item ?? []), 'example:minnow_bucket', 'example:sand_eel_bucket'],
  texture: [...(PROJECT_IDS.texture ?? []), 'example:item/minnow_bucket'],
  model: [
    ...(PROJECT_IDS.model ?? []),
    'example:item/minnow_bucket',
    'example:item/sand_eel_bucket',
  ],
};

describe('fish buckets (ADR 0109 D1)', () => {
  const data = (extra: Record<string, Json>, bucketable: Json = {}) => ({
    format: 1,
    category: 'water_ambient',
    size: { width: 0.4, height: 0.3 },
    ...extra,
    components: {
      'msm:movement': { mode: 'swim' },
      'msm:bucketable': bucketable,
      'msm:animated_model': model('demo:entity/x'),
    },
  });

  it('derives the bucket id, name key, name and picture', () => {
    expect(bucketItemId('demo:fish/cod')).toBe('demo:fish/cod_bucket');
    expect(bucketNameKey(data({}), 'demo', 'fish/cod')).toBe('item.demo.fish.cod_bucket');
    expect(bucketNameKey(data({}, { item_name: 'item.demo.pail' }), 'demo', 'x')).toBe(
      'item.demo.pail',
    );
    expect(bucketLanguageKeys(data({ display_name: 'Cod' }), 'demo', 'cod')).toEqual({
      'item.demo.cod_bucket': 'Bucket of Cod',
    });
    expect(
      bucketLanguageKeys(data({ display_name: 'Cod', bucket_display_name: 'Pail' }), 'demo', 'cod'),
    ).toEqual({ 'item.demo.cod_bucket': 'Pail' });
    expect(bucketLanguageKeys(data({}), 'demo', 'cod')).toEqual({});
    expect(bucketLanguageKeys({ display_name: 'Cod' }, 'demo', 'cod')).toEqual({});
    expect(bucketTexture(data({}))).toBe(DEFAULT_WATER_BUCKET_TEXTURE);
    expect(bucketTexture(data({}, { water: false }))).toBe(DEFAULT_EMPTY_BUCKET_TEXTURE);
    expect(bucketTexture(data({ bucket_texture: 'demo:item/b' }))).toBe('demo:item/b');
    expect([
      DEFAULT_WATER_BUCKET_TEXTURE,
      DEFAULT_EMPTY_BUCKET_TEXTURE,
      BUCKET_PARENT_MODEL,
    ]).toEqual([
      'minecraft:item/water_bucket',
      'minecraft:item/bucket',
      'minecraft:item/generated',
    ]);
  });

  it('strips the bucket fields from the definition and keeps the component', () => {
    const created = element(
      'msm:entity',
      'demo:x',
      data({ bucket_display_name: 'B', bucket_texture: 'demo:item/b' }, { water: false }),
    );
    const definition = entityDefinition(created);
    expect(definition.bucket_display_name).toBeUndefined();
    expect(definition.bucket_texture).toBeUndefined();
    expect((definition.components as Record<string, Json>)['msm:bucketable']).toEqual({
      water: false,
    });
  });

  it('writes the bucket item files only for a bucketable mob', () => {
    const { item_definition: items, model: models } = firstTarget.folders.resource;
    expect(
      bucketItemFiles(element('msm:entity', 'demo:x', data({})), firstTarget).map((f) => f.path),
    ).toEqual([`assets/demo/${items}/x_bucket.json`, `assets/demo/${models}/item/x_bucket.json`]);
    const plain = element('msm:entity', 'demo:x', {
      format: 1,
      components: { 'msm:animated_model': model('demo:entity/x') },
    });
    expect(bucketItemFiles(plain, firstTarget)).toEqual([]);
  });
});

describe('both shoulders (ADR 0109 D2)', () => {
  it('keeps sides only', async () => {
    expect(SHOULDER_SIDES).toEqual(['left', 'right', 'either']);
    expect(shoulderDefinition({ sides: 'right', stray: 1 })).toEqual({ sides: 'right' });
    expect(shoulderDefinition({ sides: 3 })).toEqual({});
    const files = await entityKind.lower(
      element('msm:entity', 'demo:x', {
        format: 1,
        components: {
          'msm:shoulder_riding': { sides: 'either' },
          'msm:animated_model': model('demo:entity/x'),
        },
      }),
      firstTarget,
    );
    expect(
      ((files[0] as OutputFile).contents as { components: Record<string, Json> }).components[
        'msm:shoulder_riding'
      ],
    ).toEqual({ sides: 'either' });
  });
});

describe('msm:villager_type (ADR 0107 D5)', () => {
  it('is a kind of the villager_type registry with a hidden format', () => {
    expect(villagerTypeKind.id).toBe('msm:villager_type');
    expect(villagerTypeKind.schema).toBe(MSM_SCHEMA_REFS.villagerType);
    expect(villagerTypeKind.defaultData).toEqual({ format: 1, biomes: [] });
  });

  it('strips the pictures and sets the format', () => {
    const created = element('msm:villager_type', 'demo:x', {
      format: 7,
      biomes: ['minecraft:plains'],
      textures: { villager: 'demo:entity/x' },
    });
    expect(villagerTypeDefinition(created)).toEqual({ format: 1, biomes: ['minecraft:plains'] });
    expect(() =>
      lowerVillagerType(element('msm:villager_type', 'demo:x', []), firstTarget),
    ).toThrow(EntitiesLoweringError);
  });

  it('names the fixed picture paths, the zombie villager defaulting to the villager', () => {
    const textures = firstTarget.folders.resource.textures;
    expect(villagerTypeTextureId('zombie_villager', 'a', 'b')).toBe(
      'a:entity/zombie_villager/type/b',
    );
    expect(
      villagerTypeTexturePaths(
        firstTarget,
        element('msm:villager_type', 'demo:moor', {
          biomes: ['minecraft:swamp'],
          textures: { villager: 'demo:entity/villager/type/moor' },
        }),
      ),
    ).toEqual([
      {
        entity: 'villager',
        from: `assets/demo/${textures}/entity/villager/type/moor.png`,
        to: `assets/demo/${textures}/entity/villager/type/moor.png`,
      },
      {
        entity: 'zombie_villager',
        from: `assets/demo/${textures}/entity/villager/type/moor.png`,
        to: `assets/demo/${textures}/entity/zombie_villager/type/moor.png`,
      },
    ]);
    expect(
      villagerTypeTexturePaths(
        firstTarget,
        element('msm:villager_type', 'demo:moor', { biomes: ['minecraft:swamp'] }),
      ),
    ).toEqual([]);
  });

  it('writes the hat beside each picture only when it is set', () => {
    const lowered = (textures: Json) =>
      lowerVillagerType(
        element('msm:villager_type', 'demo:moor', { biomes: ['minecraft:swamp'], textures }),
        firstTarget,
      );
    const withHat = lowered({ villager: 'demo:entity/v', hat: 'full' });
    expect(withHat.slice(1).map((file) => [file.path, file.contents, file.schema])).toEqual([
      [
        `assets/demo/${firstTarget.folders.resource.textures}/entity/villager/type/moor.png.mcmeta`,
        { villager: { hat: 'full' } },
        TEXTURE_META_SCHEMA,
      ],
      [
        `assets/demo/${firstTarget.folders.resource.textures}/entity/zombie_villager/type/moor.png.mcmeta`,
        { villager: { hat: 'full' } },
        TEXTURE_META_SCHEMA,
      ],
    ]);
    expect(lowered({ villager: 'demo:entity/v' })).toHaveLength(1);
    expect(lowered({ hat: 'full' })).toHaveLength(1);
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'golden lowering of ADR 0107 and 0109 for %s',
  (targetId, bundle) => {
    it.each(SAMPLES.map((sample) => [sample.name, sample] as const))(
      '%s matches the golden and validates',
      async (name, sample) => {
        const indexes = await indexesFor(bundle);
        const withRegistry = {
          ...indexes,
          registries: createRegistryIndex({ vanilla: indexes.vanilla, project: SAMPLE_IDS }),
        };
        const files = await sample.kind.lower(
          element(sample.kind.id, sample.id, sample.data),
          bundle.target,
        );
        for (const file of files) {
          if (file.schema === undefined) continue;
          expect(
            blockingProblems(withRegistry, file.schema, file.contents as Json),
            file.path,
          ).toEqual([]);
        }
        const actual = sortedJson(
          files.map((file) => ({
            contents: file.contents,
            layer: file.layer,
            merge: file.merge,
            path: file.path,
            schema: file.schema,
          })),
        );
        const url = new URL(`./fixtures/${targetId}/expected/mobs-2/${name}.json`, import.meta.url);
        if (UPDATE) {
          await mkdir(dirname(fileURLToPath(url)), { recursive: true });
          await writeFile(url, actual);
        }
        expect(actual).toBe(await readFile(url, 'utf8'));
      },
    );
  },
);
