/**
 * Vanilla pack safety (ADR 0066): data pack files naming ids only the mod jar registers are
 * left out of the vanilla data pack with a warning, tag entries become optional, functions are
 * kept with a warning; projects without mod content are untouched.
 */
import { createMemoryFileSystem, type Problem } from '@msm/core';
import type { Exporter, Json, OutputFile, ResourceLocation } from '@msm/plugin-api';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  MOD_ONLY_FUNCTION,
  MOD_ONLY_REFERENCE,
  type ModOnlyIds,
  modOnlyIdsOf,
  modOnlyReferenceMessage,
  vanillaSafeDataFiles,
  vanillaSafeExporter,
} from '../src/renderer/src/session/vanilla-pack-safety';
import { defaultTarget, newSession } from './session-fixture';

const folders = defaultTarget.folders.data;

const MOD: ModOnlyIds = modOnlyIdsOf({
  item: ['demo:ruby', 'demo:ruby_block', 'demo:golem_spawn_egg'],
  block: ['demo:ruby_block'],
  mob_effect: ['demo:frost'],
  potion: ['demo:frost', 'demo:long_frost'],
  entity_type: ['demo:golem'],
  // Not a runtime registry: ignored.
  recipe: ['demo:ruby'],
});

const json = (path: string, contents: Json): OutputFile => ({
  path,
  contents,
  layer: 'datapack',
});
const fn = (path: string, text: string): OutputFile => ({
  path,
  contents: new TextEncoder().encode(text),
  layer: 'datapack',
  language: 'mcfunction',
});

function run(files: OutputFile[], owners: Record<string, ResourceLocation> = {}) {
  return vanillaSafeDataFiles(files, MOD, folders, (path) => owners[path]);
}
const paths = (files: readonly OutputFile[]) => files.map((file) => file.path);

describe('modOnlyIdsOf', () => {
  it('keeps the runtime registries only', () => {
    expect([...MOD.keys()].sort()).toEqual([
      'block',
      'entity_type',
      'item',
      'mob_effect',
      'potion',
    ]);
    expect(modOnlyIdsOf({ recipe: ['demo:x'], item: [] }).size).toBe(0);
  });
});

describe('vanillaSafeDataFiles: fatal folders', () => {
  const cases: [string, string, Json, string][] = [
    [
      'recipe result',
      'data/demo/recipe/ruby_block.json',
      {
        type: 'minecraft:crafting_shapeless',
        ingredients: ['minecraft:diamond'],
        result: { id: 'demo:ruby_block', count: 1 },
      },
      'demo:ruby_block',
    ],
    [
      'recipe ingredient',
      'data/demo/recipe/sword.json',
      {
        type: 'minecraft:crafting_shapeless',
        ingredients: ['demo:ruby'],
        result: { id: 'minecraft:diamond_sword' },
      },
      'demo:ruby',
    ],
    [
      'brewing recipe',
      'data/demo/recipe/brewing/frost.json',
      {
        type: 'minecraft:brewing',
        input: { item: 'minecraft:potion', potion_contents: { potions: 'minecraft:awkward' } },
        reagent: { item: 'minecraft:snowball' },
        output: {
          id: 'minecraft:potion',
          components: { 'minecraft:potion_contents': { potion: 'demo:frost' } },
        },
      },
      'demo:frost',
    ],
    [
      'loot table item entry',
      'data/demo/loot_table/blocks/ruby_block.json',
      {
        type: 'minecraft:block',
        pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'demo:ruby_block' }] }],
      },
      'demo:ruby_block',
    ],
    [
      'loot table set_potion',
      'data/demo/loot_table/chests/potions.json',
      {
        pools: [
          {
            rolls: 1,
            entries: [
              {
                type: 'minecraft:item',
                name: 'minecraft:potion',
                functions: [{ function: 'minecraft:set_potion', id: 'demo:long_frost' }],
              },
            ],
          },
        ],
      },
      'demo:long_frost',
    ],
    [
      'advancement icon',
      'data/demo/advancement/root.json',
      {
        display: { icon: { id: 'demo:ruby' }, title: 'Rubies', description: 'Find one' },
        criteria: { tick: { trigger: 'minecraft:tick' } },
      },
      'demo:ruby',
    ],
    [
      'advancement trigger conditions',
      'data/demo/advancement/kill_golem.json',
      {
        criteria: {
          kill: {
            trigger: 'minecraft:player_killed_entity',
            conditions: {
              entity: [
                { condition: 'minecraft:entity_properties', predicate: { type: 'demo:golem' } },
              ],
            },
          },
        },
      },
      'demo:golem',
    ],
    [
      'predicate',
      'data/demo/predicate/has_frost.json',
      {
        condition: 'minecraft:entity_properties',
        entity: 'this',
        predicate: { effects: { 'demo:frost': {} } },
      },
      'demo:frost',
    ],
    [
      'item modifier',
      'data/demo/item_modifier/rubify.json',
      { function: 'minecraft:set_item', item: 'demo:ruby' },
      'demo:ruby',
    ],
    [
      'villager trade',
      'data/demo/villager_trade/ruby.json',
      {
        wants: { id: 'minecraft:emerald', count: 2 },
        gives: { id: 'demo:ruby' },
      },
      'demo:ruby',
    ],
    [
      'enchantment effects',
      'data/demo/enchantment/chill.json',
      {
        supported_items: '#minecraft:swords',
        effects: {
          'minecraft:post_attack': [
            {
              enchanted: 'attacker',
              affected: 'victim',
              effect: { type: 'minecraft:apply_mob_effect', to_apply: 'demo:frost' },
            },
          ],
        },
      },
      'demo:frost',
    ],
  ];

  for (const [name, path, contents, id] of cases) {
    it(`leaves out a ${name} naming a mod-only id, with one warning`, () => {
      const keep = json('data/demo/recipe/plain.json', {
        type: 'minecraft:crafting_shapeless',
        ingredients: ['minecraft:stick'],
        result: { id: 'minecraft:diamond' },
      });
      const result = run([json(path, contents), keep], { [path]: 'demo:thing' });
      expect(paths(result.files)).toEqual([keep.path]);
      expect(result.problems).toEqual([
        {
          severity: 'warning',
          code: MOD_ONLY_REFERENCE,
          file: path,
          elementId: 'demo:thing',
          message: modOnlyReferenceMessage(path, id),
        },
      ]);
    });
  }

  it('words the warning as the brief asks', () => {
    expect(modOnlyReferenceMessage('data/demo/recipe/a.json', 'demo:ruby', 2)).toBe(
      'Left out of the vanilla data pack: data/demo/recipe/a.json (and 2 other files) names demo:ruby, which only the Fabric mod jar provides. A vanilla server would refuse the whole data pack; export the Fabric mod jar to use it.',
    );
  });

  it('cascades: references to a left-out loot table, trade or enchantment are left out too', () => {
    const files = [
      json('data/demo/loot_table/inner.json', {
        pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'demo:ruby' }] }],
      }),
      json('data/demo/loot_table/outer.json', {
        pools: [{ rolls: 1, entries: [{ type: 'minecraft:loot_table', value: 'demo:inner' }] }],
      }),
      json('data/demo/advancement/reward.json', {
        criteria: { tick: { trigger: 'minecraft:tick' } },
        rewards: { loot: ['demo:outer'] },
      }),
      json('data/demo/villager_trade/ruby.json', { gives: { id: 'demo:ruby' } }),
      json('data/demo/trade_set/rubies.json', { trades: ['demo:ruby'], amount: 1 }),
    ];
    const result = run(files);
    expect(result.files).toEqual([]);
    expect(result.problems.map((problem) => problem.file)).toEqual([
      'data/demo/advancement/reward.json',
      'data/demo/loot_table/inner.json',
      'data/demo/loot_table/outer.json',
      'data/demo/trade_set/rubies.json',
      'data/demo/villager_trade/ruby.json',
    ]);
  });

  it('gives one warning per element, naming its first file', () => {
    const owners: Record<string, ResourceLocation> = {
      'data/demo/loot_table/a.json': 'demo:drops',
      'data/demo/loot_table/b.json': 'demo:drops',
      'data/demo/recipe/c.json': 'demo:other',
    };
    const loot = {
      pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'demo:ruby' }] }],
    };
    const result = run(
      [
        json('data/demo/loot_table/b.json', loot),
        json('data/demo/loot_table/a.json', loot),
        json('data/demo/recipe/c.json', { result: { id: 'demo:ruby' } }),
      ],
      owners,
    );
    expect(result.files).toEqual([]);
    expect(result.problems.map((problem) => [problem.elementId, problem.message])).toEqual([
      ['demo:drops', modOnlyReferenceMessage('data/demo/loot_table/a.json', 'demo:ruby', 1)],
      ['demo:other', modOnlyReferenceMessage('data/demo/recipe/c.json', 'demo:ruby')],
    ]);
  });
});

describe('vanillaSafeDataFiles: no false positives', () => {
  it('keeps files naming vanilla ids and the project data pack content', () => {
    const files = [
      json('data/demo/loot_table/ruby.json', {
        pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:diamond' }] }],
      }),
      // `demo:ruby` is also a mod item, but here it names the project's own loot table.
      json('data/demo/loot_table/outer.json', {
        pools: [{ rolls: 1, entries: [{ type: 'minecraft:loot_table', value: 'demo:ruby' }] }],
      }),
      json('data/demo/advancement/unlock.json', {
        criteria: {
          has: { trigger: 'minecraft:recipe_unlocked', conditions: { recipe: 'demo:ruby' } },
        },
        rewards: { recipes: ['demo:ruby'], function: 'demo:ruby', loot: ['demo:ruby'] },
      }),
      json('data/demo/predicate/ref.json', { condition: 'minecraft:reference', name: 'demo:ruby' }),
      json('data/demo/item_modifier/ref.json', {
        function: 'minecraft:reference',
        name: 'demo:ruby',
      }),
      json('data/demo/trade_set/set.json', { trades: '#minecraft:fletcher/level_1', amount: 2 }),
      json('data/demo/recipe/text.json', {
        type: 'minecraft:crafting_shapeless',
        ingredients: ['minecraft:stick'],
        result: {
          id: 'minecraft:written_book',
          components: { 'minecraft:custom_name': 'demo:rubyish' },
        },
      }),
      // Not a fatal folder: kept as is.
      json('data/demo/worldgen/biome/ruby.json', { features: [] }),
      fn('data/demo/function/load.mcfunction', '# give @s demo:ruby\nfunction demo:ruby\nsay hi\n'),
    ];
    const result = run(files);
    expect(result.problems).toEqual([]);
    expect(result.files).toBe(files);
  });

  it('returns the same files without mod-only ids, and the same exporter', () => {
    const files = [json('data/demo/recipe/a.json', { result: { id: 'demo:ruby' } })];
    const result = vanillaSafeDataFiles(files, new Map(), folders);
    expect(result.files).toBe(files);
    expect(result.problems).toEqual([]);
    const exporter: Exporter = {
      id: 'x',
      displayName: 'X',
      layers: ['datapack'],
      run: async () => {},
    };
    expect(vanillaSafeExporter(exporter, new Map())).toBe(exporter);
  });

  it('ignores resource pack and msm layer files', () => {
    const files: OutputFile[] = [
      { path: 'msm/demo/item/ruby.json', contents: { id: 'demo:ruby' }, layer: 'msm' },
      { path: 'data/demo/recipe/x.json', contents: { result: 'demo:ruby' }, layer: 'resourcepack' },
    ];
    expect(run(files)).toEqual({ files, problems: [] });
  });
});

describe('vanillaSafeDataFiles: tags', () => {
  it('makes mod-only entries optional and keeps the rest', () => {
    const tag = json('data/demo/tags/item/gems.json', {
      values: [
        'minecraft:diamond',
        'demo:ruby',
        { id: 'demo:ruby_block' },
        { id: 'demo:golem_spawn_egg', required: false },
      ],
    });
    const result = run([tag]);
    expect(result.problems).toEqual([]);
    expect(result.files[0]?.contents).toEqual({
      values: [
        'minecraft:diamond',
        { id: 'demo:ruby', required: false },
        { id: 'demo:ruby_block', required: false },
        { id: 'demo:golem_spawn_egg', required: false },
      ],
    });
  });

  it('checks entries against the tag registry: an item id in a block tag is not mod-only', () => {
    const tag = json('data/demo/tags/block/ores.json', {
      values: ['demo:ruby', 'demo:ruby_block'],
    });
    const result = run([tag]);
    expect(result.files[0]?.contents).toEqual({
      values: ['demo:ruby', { id: 'demo:ruby_block', required: false }],
    });
  });

  it('treats a tag of mod-only entries as mod-only: tags naming it and files using it', () => {
    const files = [
      json('data/demo/tags/item/rubies.json', { values: ['demo:ruby', 'demo:ruby_block'] }),
      json('data/demo/tags/item/shiny.json', { values: ['#demo:rubies', 'minecraft:gold_ingot'] }),
      json('data/demo/tags/item/only_rubies.json', { values: ['#demo:rubies'] }),
      json('data/demo/enchantment/polish.json', {
        supported_items: '#demo:only_rubies',
        effects: {},
      }),
      json('data/demo/enchantment/shine.json', { supported_items: '#demo:shiny', effects: {} }),
      json('data/demo/tags/enchantment/polishes.json', { values: ['demo:polish', 'demo:shine'] }),
      json('data/demo/loot_table/tagged.json', {
        pools: [
          { rolls: 1, entries: [{ type: 'minecraft:tag', name: 'demo:rubies', expand: true }] },
        ],
      }),
    ];
    const result = run(files);
    expect(paths(result.files)).toEqual([
      'data/demo/tags/item/rubies.json',
      'data/demo/tags/item/shiny.json',
      'data/demo/tags/item/only_rubies.json',
      'data/demo/enchantment/shine.json',
      'data/demo/tags/enchantment/polishes.json',
    ]);
    expect(result.files[1]?.contents).toEqual({
      values: [{ id: '#demo:rubies', required: false }, 'minecraft:gold_ingot'],
    });
    expect(result.files[2]?.contents).toEqual({
      values: [{ id: '#demo:rubies', required: false }],
    });
    // The left-out enchantment's entry in an enchantment tag is optional too.
    expect(result.files[4]?.contents).toEqual({
      values: [{ id: 'demo:polish', required: false }, 'demo:shine'],
    });
    expect(result.problems.map((problem) => problem.file)).toEqual([
      'data/demo/enchantment/polish.json',
      'data/demo/loot_table/tagged.json',
    ]);
  });

  it('never treats a minecraft tag that does not replace as mod-only', () => {
    const files = [
      json('data/minecraft/tags/item/swords.json', { values: ['demo:ruby'] }),
      json('data/demo/enchantment/edge.json', {
        supported_items: '#minecraft:swords',
        effects: {},
      }),
    ];
    const result = run(files);
    expect(paths(result.files)).toEqual(paths(files));
    expect(result.files[0]?.contents).toEqual({ values: [{ id: 'demo:ruby', required: false }] });
    const replacing = run([
      json('data/minecraft/tags/item/swords.json', { replace: true, values: ['demo:ruby'] }),
      json('data/demo/enchantment/edge.json', {
        supported_items: '#minecraft:swords',
        effects: {},
      }),
    ]);
    expect(paths(replacing.files)).toEqual(['data/minecraft/tags/item/swords.json']);
  });

  it('reads tag bytes and worldgen registry folders', () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ values: ['demo:ruby'] }));
    const result = run([
      { path: 'data/demo/tags/item/b.json', contents: bytes, layer: 'datapack' },
      json('data/demo/tags/worldgen/biome/hot.json', { values: ['demo:ruby'] }),
    ]);
    expect(result.files[0]?.contents).toEqual({ values: [{ id: 'demo:ruby', required: false }] });
    expect(result.files[1]?.contents).toEqual({ values: ['demo:ruby'] });
  });
});

describe('vanillaSafeDataFiles: functions', () => {
  it('keeps a function naming mod-only content and warns once per element', () => {
    const owners: Record<string, ResourceLocation> = {
      'data/demo/function/a.mcfunction': 'demo:a',
      'data/demo/function/b.mcfunction': 'demo:a',
    };
    const files = [
      fn(
        'data/demo/function/a.mcfunction',
        'say hi\ngive @s demo:ruby[minecraft:custom_name="x"] 1\n',
      ),
      fn(
        'data/demo/function/b.mcfunction',
        'execute if entity @e[type=demo:golem] run say golem\n',
      ),
      fn('data/demo/function/c.mcfunction', 'clear @s #demo:rubies\n'),
      json('data/demo/tags/item/rubies.json', { values: ['demo:ruby'] }),
    ];
    const result = run(files, owners);
    expect(paths(result.files)).toEqual(paths(files));
    expect(result.files[0]).toBe(files[0]);
    expect(result.problems).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: MOD_ONLY_FUNCTION,
        elementId: 'demo:a',
        file: 'data/demo/function/a.mcfunction',
        message:
          'data/demo/function/a.mcfunction (and 1 other file) names demo:ruby, which only the Fabric mod jar provides. A vanilla server skips this function; export the Fabric mod jar to use it.',
      }),
      expect.objectContaining({
        code: MOD_ONLY_FUNCTION,
        file: 'data/demo/function/c.mcfunction',
        message: expect.stringContaining('names #demo:rubies,'),
      }),
    ]);
    expect(result.problems[1]?.elementId).toBeUndefined();
  });
});

describe('vanillaSafeExporter', () => {
  it('passes the safe files to the wrapped exporter and reports the warnings', async () => {
    const seen: string[] = [];
    const reported: string[] = [];
    const exporter: Exporter = {
      id: 'x',
      displayName: 'X',
      layers: ['datapack'],
      run: async (input) => {
        seen.push(...paths(input.files));
      },
    };
    const wrapped = vanillaSafeExporter(exporter, MOD);
    await wrapped.run({
      projectName: 'Demo',
      target: defaultTarget,
      files: [
        json('data/demo/recipe/a.json', { result: { id: 'demo:ruby' } }),
        json('data/demo/recipe/b.json', { result: { id: 'minecraft:stone' } }),
      ],
      sink: { writeFile: async () => {} },
      problems: { report: (problem) => reported.push(problem.code) },
      meta: { msmVersion: '0.0.0', plugins: [] },
      options: {},
    });
    expect(seen).toEqual(['data/demo/recipe/b.json']);
    expect(reported).toEqual([MOD_ONLY_REFERENCE]);
  });
});

const SHAPELESS = (ingredient: string, result: string): Json => ({
  type: 'minecraft:crafting_shapeless',
  category: 'misc',
  ingredients: [ingredient],
  result: { id: result, count: 1 },
});
const VANILLA_ELEMENTS: { id: ResourceLocation; kind: string; data: Json }[] = [
  {
    id: 'demo:diamond_from_coal',
    kind: 'minecraft:recipe',
    data: SHAPELESS('minecraft:coal', 'minecraft:diamond'),
  },
  { id: 'demo:gems', kind: 'minecraft:tag/item', data: { values: ['minecraft:diamond'] } },
  { id: 'demo:hello', kind: 'minecraft:function', data: { lines: ['say hello'] } },
];
const MOD_ELEMENTS: { id: ResourceLocation; kind: string; data: Json }[] = [
  {
    id: 'demo:ruby_from_diamond',
    kind: 'minecraft:recipe',
    data: SHAPELESS('minecraft:diamond', 'demo:ruby'),
  },
  {
    id: 'demo:ruby_drop',
    kind: 'minecraft:loot_table',
    data: { pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'demo:ruby' }] }] },
  },
  {
    id: 'demo:shiny',
    kind: 'minecraft:tag/item',
    data: { values: ['minecraft:diamond', 'demo:ruby'] },
  },
  { id: 'demo:give_ruby', kind: 'minecraft:function', data: { lines: ['give @s demo:ruby'] } },
];

async function modSession(elements: { id: ResourceLocation; kind: string; data?: Json }[]) {
  const fixture = newSession(createMemoryFileSystem());
  await fixture.session.newProject();
  for (const element of elements) fixture.session.addElement(element);
  await fixture.session.flushValidation();
  return fixture;
}

const unzipText = (bytes: Uint8Array | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [path, data] of Object.entries(unzipSync(bytes ?? new Uint8Array()))) {
    out[path] = new TextDecoder().decode(data);
  }
  return out;
};
const modOnly = (problems: readonly Problem[]) =>
  problems.filter(
    (problem) => problem.code === MOD_ONLY_REFERENCE || problem.code === MOD_ONLY_FUNCTION,
  );

describe('ProjectSession: vanilla data pack safety (ADR 0066)', () => {
  it('leaves out files naming mod items, makes tag entries optional and warns on functions', async () => {
    const { session, calls } = await modSession([
      { id: 'demo:ruby', kind: 'msm:item' },
      ...VANILLA_ELEMENTS,
      ...MOD_ELEMENTS,
    ]);
    const result = await session.exportPack('data', 'zip');
    expect(result.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(result.ok).toBe(true);
    expect(
      modOnly(result.problems).map((problem) => [problem.code, problem.elementId, problem.file]),
    ).toEqual([
      [MOD_ONLY_REFERENCE, 'demo:ruby_drop', 'data/demo/loot_table/ruby_drop.json'],
      [MOD_ONLY_REFERENCE, 'demo:ruby_from_diamond', 'data/demo/recipe/ruby_from_diamond.json'],
      [MOD_ONLY_FUNCTION, 'demo:give_ruby', 'data/demo/function/give_ruby.mcfunction'],
    ]);
    const zip = unzipText(calls.saved[0]?.data);
    expect(Object.keys(zip)).not.toContain('data/demo/recipe/ruby_from_diamond.json');
    expect(Object.keys(zip)).not.toContain('data/demo/loot_table/ruby_drop.json');
    expect(Object.keys(zip)).toContain('data/demo/recipe/diamond_from_coal.json');
    expect(zip['data/demo/function/give_ruby.mcfunction']).toBe('give @s demo:ruby\n');
    expect(JSON.parse(zip['data/demo/tags/item/shiny.json'] ?? '')).toEqual({
      values: ['minecraft:diamond', { id: 'demo:ruby', required: false }],
    });
    expect(JSON.parse(zip['data/demo/tags/item/gems.json'] ?? '')).toEqual({
      values: ['minecraft:diamond'],
    });
    expect(result.files).not.toContain('data/demo/recipe/ruby_from_diamond.json');
  }, 60_000);

  it('does the same in both packs, warning once', async () => {
    const { session, platform } = await modSession([
      { id: 'demo:ruby', kind: 'msm:item' },
      ...MOD_ELEMENTS,
    ]);
    const files: Record<string, Uint8Array> = {};
    platform.exports.pickFolder = async () => '/exports/both';
    platform.exports.writeFiles = async (folder, list) => {
      for (const file of list) files[file.name] = file.data;
      return { paths: list.map((file) => `${folder}/${file.name}`) };
    };
    const result = await session.exportPack('data', 'combined');
    expect(result.ok).toBe(true);
    expect(modOnly(result.problems)).toHaveLength(3);
    const data = Object.entries(files).find(([name]) => name.endsWith('-data.zip'))?.[1];
    expect(Object.keys(unzipText(data))).not.toContain('data/demo/recipe/ruby_from_diamond.json');
  }, 60_000);

  it('leaves a modded block loot table out', async () => {
    const { session } = await modSession([{ id: 'demo:ruby_block', kind: 'msm:block' }]);
    const result = await session.exportPack('data', 'zip');
    expect(modOnly(result.problems)).toEqual([
      expect.objectContaining({
        elementId: 'demo:ruby_block',
        message: modOnlyReferenceMessage(
          'data/demo/loot_table/blocks/ruby_block.json',
          'demo:ruby_block',
        ),
      }),
    ]);
  }, 60_000);

  it('keeps every file in the mod jar, without the warnings', async () => {
    const { session, calls, platform } = await modSession([
      { id: 'demo:ruby', kind: 'msm:item' },
      ...MOD_ELEMENTS,
    ]);
    platform.exports = {
      ...platform.exports,
      runtimeJar: async () => new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
    };
    const result = await session.exportFabricJar();
    expect(result.ok).toBe(true);
    expect(modOnly(result.problems)).toEqual([]);
    const zip = unzipText(calls.saved.at(-1)?.data);
    expect(Object.keys(zip)).toContain('data/demo/recipe/ruby_from_diamond.json');
    expect(Object.keys(zip)).toContain('data/demo/loot_table/ruby_drop.json');
    expect(JSON.parse(zip['data/demo/tags/item/shiny.json'] ?? '')).toEqual({
      values: ['minecraft:diamond', 'demo:ruby'],
    });
  }, 60_000);

  it('exports a project without references to mod content byte-identically', async () => {
    const plain = await modSession(VANILLA_ELEMENTS);
    const modded = await modSession([{ id: 'demo:ruby', kind: 'msm:item' }, ...VANILLA_ELEMENTS]);
    const a = await plain.session.exportPack('data', 'zip');
    const b = await modded.session.exportPack('data', 'zip');
    expect(modOnly(a.problems)).toEqual([]);
    expect(modOnly(b.problems)).toEqual([]);
    expect(plain.calls.saved[0]?.data).toEqual(modded.calls.saved[0]?.data);
  }, 60_000);
});
