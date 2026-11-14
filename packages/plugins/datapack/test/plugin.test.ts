import type { Element, ElementKind, Json } from '@msm/plugin-api';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  DataPackLoweringError,
  dataPackKinds,
  dataPath,
  functionKind,
  GENERIC_DATA_REGISTRIES,
  genericKind,
  genericKinds,
  lowerJsonData,
  MCFUNCTION_LANGUAGE,
  recipeKind,
  TAG_REGISTRIES,
  tagKind,
  tagKinds,
} from '../src/index';
import { blockingProblems, indexesFor } from './support';

const TIER_A = [
  ['minecraft:recipe', 'resource:recipe', 'recipe'],
  ['minecraft:loot_table', 'resource:loot_table', 'loot_table'],
  ['minecraft:advancement', 'resource:advancement', 'advancement'],
  ['minecraft:predicate', 'resource:predicate', 'predicate'],
  ['minecraft:item_modifier', 'resource:item_modifier', 'item_modifier'],
  ['minecraft:function', 'msm:function', 'function'],
] as const;

const kinds = (): ElementKind[] => plugin.contributes.elementKinds ?? [];

const element = (kind: string, id: `${string}:${string}`, data: Json): Element => ({
  formatVersion: 1,
  id,
  kind,
  data,
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
});

const firstTarget = (builtInTargets[0] as TargetBundle).target;

describe('@msm/plugin-datapack', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.datapack');
    expect(plugin.apiVersion).toBe('^1.0.0');
    expect(Object.isFrozen(plugin)).toBe(true);
  });

  it('contributes the tier-A kinds, the tag kinds, then the generic kinds, in a stable order', () => {
    const expected = [
      ...TIER_A.map(([id, schema, folder]) => ({ id, schema, folder })),
      ...TAG_REGISTRIES.map((registry) => ({
        id: `minecraft:tag/${registry}`,
        schema: `tag:${registry}`,
        folder: `tags/${registry}`,
      })),
      ...GENERIC_DATA_REGISTRIES.map((registry) => ({
        id: `minecraft:${registry}`,
        schema: `resource:${registry}`,
        folder: registry,
      })),
    ];
    const actual = kinds().map(({ id, schema, folder }) => ({ id, schema, folder }));
    expect(actual).toEqual(expected);
    expect(dataPackKinds.map((kind) => kind.id)).toEqual(expected.map((kind) => kind.id));
    expect(tagKinds).toHaveLength(21);
    expect(genericKinds).toHaveLength(28);
    expect(new Set(kinds().map((kind) => kind.id)).size).toBe(kinds().length);
    expect(new Set(kinds().map((kind) => kind.folder)).size).toBe(kinds().length);
    for (const kind of kinds()) {
      expect(kind.defaultData, kind.id).toBeDefined();
      expect(kind.previewKind, kind.id).toBeUndefined();
    }
  });

  it('builds tag kinds for any registry', async () => {
    const kind = tagKind('worldgen/biome');
    expect(kind.id).toBe('minecraft:tag/worldgen/biome');
    expect(kind.schema).toBe('tag:worldgen/biome');
    expect(kind.folder).toBe('tags/worldgen/biome');
    const [file] = await kind.lower(
      element(kind.id, 'example:hot', { values: ['minecraft:desert'] }),
      firstTarget,
    );
    expect(file?.path).toBe(
      `data/example/${firstTarget.folders.data.tags}/worldgen/biome/hot.json`,
    );
    expect(file?.merge).toBe('tag');
  });

  it('lowers generic kinds into the target folder of their registry', async () => {
    for (const registry of GENERIC_DATA_REGISTRIES) {
      const kind = genericKind(registry);
      const [file] = await kind.lower(element(kind.id, 'example:dir/thing', {}), firstTarget);
      expect(file, registry).toEqual({
        path: `data/example/${firstTarget.folders.data[registry]}/dir/thing.json`,
        contents: {},
        layer: 'datapack',
        schema: `resource:${registry}`,
      });
    }
  });

  it('gives each generic kind its own copy of the default data', () => {
    const [first] = GENERIC_DATA_REGISTRIES;
    expect(genericKind(first).defaultData).not.toBe(genericKind(first).defaultData);
    expect(genericKind(first).defaultData).toEqual(genericKind(first).defaultData);
  });

  it('keeps defaults free of any user namespace', () => {
    const text = JSON.stringify(kinds().map((kind) => kind.defaultData));
    expect(text).not.toMatch(/"(?!minecraft:)[a-z0-9_.-]+:[a-z0-9_./-]+"/);
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'target %s',
  (_id, bundle) => {
    it('resolves every kind schema', async () => {
      const { schemaIndex } = await indexesFor(bundle);
      for (const kind of kinds()) {
        expect(() => schemaIndex.resolveSchemaRef(kind.schema), kind.id).not.toThrow();
      }
    });

    it('has defaults that validate with no errors and no unknown ids', async () => {
      const indexes = await indexesFor(bundle);
      for (const kind of kinds()) {
        expect(blockingProblems(indexes, kind.schema, kind.defaultData ?? {}), kind.id).toEqual([]);
      }
    });

    it.each([
      ['banner_pattern', 'minecraft:creeper'],
      ['dialog', 'minecraft:server_links'],
      ['instrument', 'minecraft:ponder_goat_horn'],
      ['point_of_interest_type', 'minecraft:armorer'],
      ['potion', 'minecraft:water'],
      ['timeline', 'minecraft:day'],
      ['worldgen/feature', 'minecraft:flower_default'],
      ['worldgen/flat_level_generator_preset', 'minecraft:classic_flat'],
    ])(
      'tag:%s accepts a vanilla id and flags an unknown one (ADR 0064 D3)',
      async (registry, id) => {
        const indexes = await indexesFor(bundle);
        const schema = `tag:${registry}`;
        expect(blockingProblems(indexes, schema, { values: [id] })).toEqual([]);
        const unknown = blockingProblems(indexes, schema, { values: ['minecraft:no_such_entry'] });
        expect(unknown.map((problem) => problem.code)).toEqual(['schema.unknown-id']);
      },
    );

    it('accepts NBT booleans as 0 and 1 in trial spawner entities, as vanilla writes them', async () => {
      const indexes = await indexesFor(bundle);
      // The shape of vanilla's trial_chamber/small_melee/baby_zombie/normal.json, by hand.
      const babyZombie = {
        simultaneous_mobs: 3.0,
        simultaneous_mobs_added_per_player: 0.5,
        spawn_potentials: [
          {
            data: {
              entity: { id: 'minecraft:zombie', IsBaby: 1 },
              equipment: {
                loot_table: 'minecraft:equipment/trial_chamber_melee',
                slot_drop_chances: 0.0,
              },
            },
            weight: 1,
          },
        ],
        ticks_between_spawn: 20,
        total_mobs: 6.0,
        total_mobs_added_per_player: 2.0,
        loot_tables_to_eject: [
          { data: 'minecraft:spawners/trial_chamber/consumables', weight: 1 },
          { data: 'minecraft:spawners/trial_chamber/key', weight: 1 },
        ],
        items_to_drop_when_ominous: 'minecraft:spawners/trial_chamber/items_to_drop_when_ominous',
      };
      expect(blockingProblems(indexes, 'resource:trial_spawner', babyZombie)).toEqual([]);
      const two = structuredClone(babyZombie);
      (two.spawn_potentials[0] as { data: { entity: { IsBaby: number } } }).data.entity.IsBaby = 2;
      expect(
        blockingProblems(indexes, 'resource:trial_spawner', two).map((problem) => problem.path),
      ).toEqual(['/spawn_potentials/0/data/entity/IsBaby']);
      // Plain JSON booleans outside NBT still reject numbers.
      const recipe = {
        type: 'minecraft:crafting_shapeless',
        ingredients: ['minecraft:stick'],
        result: { id: 'minecraft:stick' },
        show_notification: 1,
      };
      expect(
        blockingProblems(indexes, recipeKind.schema, recipe).map((problem) => [
          problem.path,
          problem.code,
        ]),
      ).toEqual([['/show_notification', 'schema.type-mismatch']]);
    });

    it('lowers every default to a valid file', async () => {
      const indexes = await indexesFor(bundle);
      for (const kind of kinds()) {
        const files = await kind.lower(
          element(kind.id, 'example:thing', kind.defaultData ?? {}),
          bundle.target,
        );
        expect(files, kind.id).toHaveLength(1);
        const [file] = files;
        if (file?.schema !== undefined) {
          expect(blockingProblems(indexes, file.schema, file.contents as Json), kind.id).toEqual(
            [],
          );
        }
      }
    });

    it('reports problems for invalid data, so the checks above are not vacuous', async () => {
      const indexes = await indexesFor(bundle);
      expect(blockingProblems(indexes, recipeKind.schema, { type: 1 })).not.toEqual([]);
      expect(blockingProblems(indexes, functionKind.schema, { lines: [1] })).not.toEqual([]);
      expect(
        blockingProblems(indexes, 'tag:item', { values: ['minecraft:not_an_item'] }),
      ).not.toEqual([]);
      expect(blockingProblems(indexes, 'tag:item', { values: ['#example:missing'] })).not.toEqual(
        [],
      );
      // The worldgen and painting variant tag schemas resolve `Tag<E>` with the registry's own id type.
      for (const [registry, valid, invalid] of [
        ['worldgen/biome', 'minecraft:plains', 'minecraft:diamond'],
        ['worldgen/structure', 'minecraft:village_plains', 'minecraft:plains'],
        ['worldgen/world_preset', 'minecraft:flat', 'minecraft:plains'],
        ['painting_variant', 'minecraft:sunset', 'minecraft:plains'],
      ] as const) {
        expect(blockingProblems(indexes, `tag:${registry}`, { values: [valid] })).toEqual([]);
        expect(
          blockingProblems(indexes, `tag:${registry}`, { values: [invalid] }),
          registry,
        ).not.toEqual([]);
      }
      // A texture id is accepted only when it exists after its mcdoc path prefix is applied.
      expect(
        blockingProblems(indexes, 'resource:painting_variant', {
          asset_id: 'minecraft:not_a_painting',
          width: 1,
          height: 1,
        }),
      ).not.toEqual([]);
      expect(
        blockingProblems(indexes, 'resource:dimension_type', {
          ...(genericKind('dimension_type').defaultData as Record<string, Json>),
          infiniburn: '#minecraft:not_a_tag',
        }),
      ).not.toEqual([]);
    });
  },
);

describe('lowering', () => {
  const folders = firstTarget.folders.data;

  it('builds data paths from the target folders', () => {
    expect(dataPath(firstTarget, 'recipe', 'example', 'tools/ruby_sword')).toBe(
      `data/example/${folders.recipe}/tools/ruby_sword.json`,
    );
    expect(dataPath(firstTarget, 'function', 'example', 'greet', '.mcfunction')).toBe(
      `data/example/${folders.function}/greet.mcfunction`,
    );
    expect(dataPath(firstTarget, 'tags', 'example', 'gems', '.json', 'item')).toBe(
      `data/example/${folders.tags}/item/gems.json`,
    );
  });

  it.each(['', '../x', 'a//b', '/abs', 'A'])('rejects the unsafe subfolder %j', (subfolder) => {
    expect(() => dataPath(firstTarget, 'tags', 'example', 'gems', '.json', subfolder)).toThrow(
      DataPackLoweringError,
    );
  });

  it('produces one data pack file and does not share data with the element', () => {
    const data = { type: 'minecraft:crafting_shapeless', ingredients: [] };
    const input = element(recipeKind.id, 'example:thing', data);
    const files = lowerJsonData(input, firstTarget, 'recipe', recipeKind.schema);
    expect(files).toEqual([
      {
        path: `data/example/${folders.recipe}/thing.json`,
        contents: data,
        layer: 'datapack',
        schema: recipeKind.schema,
      },
    ]);
    expect(files[0]?.contents).not.toBe(data);
  });

  it('lowers a function to UTF-8 text with a trailing newline and no schema', async () => {
    const input = element(functionKind.id, 'example:dir/greet', {
      lines: ['# Grüße', 'say hi', '$say $(name)'],
    });
    const [file] = await functionKind.lower(input, firstTarget);
    expect(file?.path).toBe(`data/example/${folders.function}/dir/greet.mcfunction`);
    expect(file?.layer).toBe('datapack');
    expect(file?.language).toBe(MCFUNCTION_LANGUAGE);
    expect(file?.schema).toBeUndefined();
    expect(file?.contents).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(file?.contents as Uint8Array)).toBe(
      '# Grüße\nsay hi\n$say $(name)\n',
    );
  });

  it('lowers an empty function to an empty file', async () => {
    const [file] = await functionKind.lower(
      element(functionKind.id, 'example:empty', { lines: [] }),
      firstTarget,
    );
    expect(file?.contents).toEqual(new Uint8Array(0));
  });

  it.each([{}, { lines: 'say hi' }, { lines: ['ok', 1] }, [], null])(
    'rejects function data %j',
    (data) => {
      const input = element(functionKind.id, 'example:bad', data as Json);
      expect(() => functionKind.lower(input, firstTarget)).toThrow(DataPackLoweringError);
    },
  );

  it('is deterministic', () => {
    for (const kind of kinds()) {
      const input = element(kind.id, 'example:thing', kind.defaultData ?? {});
      expect(kind.lower(input, firstTarget), kind.id).toEqual(kind.lower(input, firstTarget));
    }
  });

  it.each(['example:', 'Example:thing', 'example:../escape', 'example:a//b', 'example:/abs'])(
    'rejects the unsafe id %s',
    (id) => {
      for (const kind of kinds()) {
        const input = element(kind.id, id as `${string}:${string}`, kind.defaultData ?? {});
        expect(() => kind.lower(input, firstTarget), kind.id).toThrow(DataPackLoweringError);
      }
    },
  );
});
