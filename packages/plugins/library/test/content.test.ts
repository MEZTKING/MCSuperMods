/**
 * Shape of the library content: starter and example ids, categories, kinds, determinism,
 * namespaces and placeholder assets. Validation against the schema, loading and export with
 * the real resource pack and data pack plugins live in `packages/exporters/test/library.test.ts`.
 */
import type { ContentBundle, ExampleProject, Json, ProjectStarter } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { COLOURS } from '../src/content/bundle';
import {
  behaviourExamples,
  categoryTag,
  entityBehaviourExamples,
  kindExamples,
  libraryExamples,
  libraryStarters,
  PLACEHOLDER_PATTERNS,
  paintingPng,
  placeholderPng,
  placeholderSkinPng,
  STARTERS_CATEGORY,
  scriptBehaviourExamples,
  starterExamples,
} from '../src/index';

const STARTER_IDS = [
  'blank',
  'resource_pack',
  'data_pack',
  'combined',
  'custom_ore',
  'custom-sword',
  'gear-set',
  'simple-block',
  'food',
  'weapon',
  'consumable',
  'totem',
  'enchantment',
  'painting',
  'music-disc-item',
  'recipe_pack',
  'music_disc',
  'function_starter',
  'custom_biome',
  'jigsaw_structure',
  'worldgen_pack',
  'custom_mob',
  'scripted_ore',
  'scripted-item',
];

/**
 * The 60 kinds of the built-in resource pack, data pack, structures, worldgen, blocks and
 * items, entities, models and animations and scripting plugins, in per-kind example order.
 */
const KIND_IDS = [
  'minecraft:model',
  'minecraft:block_definition',
  'minecraft:item_definition',
  'minecraft:lang',
  'minecraft:sounds',
  'minecraft:pack_mcmeta',
  'minecraft:equipment',
  'minecraft:recipe',
  'minecraft:loot_table',
  'minecraft:advancement',
  'minecraft:predicate',
  'minecraft:item_modifier',
  'minecraft:function',
  'minecraft:tag/block',
  'minecraft:tag/item',
  'minecraft:tag/entity_type',
  'minecraft:tag/fluid',
  'minecraft:tag/game_event',
  'minecraft:tag/function',
  'minecraft:tag/damage_type',
  'minecraft:tag/enchantment',
  'minecraft:tag/painting_variant',
  'minecraft:tag/worldgen/biome',
  'minecraft:tag/worldgen/structure',
  'minecraft:tag/worldgen/world_preset',
  'minecraft:enchantment',
  'minecraft:damage_type',
  'minecraft:dimension_type',
  'minecraft:chat_type',
  'minecraft:jukebox_song',
  'minecraft:banner_pattern',
  'minecraft:painting_variant',
  'minecraft:trim_material',
  'minecraft:trim_pattern',
  'minecraft:dialog',
  'minecraft:structure_template',
  'minecraft:worldgen/template_pool',
  'minecraft:worldgen/structure',
  'minecraft:worldgen/structure_set',
  'minecraft:worldgen/processor_list',
  'minecraft:worldgen/biome',
  'minecraft:worldgen/feature',
  'minecraft:worldgen/placed_feature',
  'minecraft:dimension',
  'minecraft:worldgen/world_preset',
  'minecraft:worldgen/noise_settings',
  'minecraft:worldgen/density_function',
  'minecraft:worldgen/noise',
  'minecraft:worldgen/carver',
  'minecraft:worldgen/flat_level_generator_preset',
  'minecraft:worldgen/multi_noise_biome_source_parameter_list',
  'minecraft:worldgen/block_state_provider',
  'minecraft:worldgen/material_condition',
  'minecraft:worldgen/material_rule',
  'msm:block',
  'msm:item',
  'msm:mod',
  'msm:entity',
  'msm:geo_model',
  'msm:animation',
  'msm:script',
];

const entries: readonly (ProjectStarter | ExampleProject)[] = [
  ...libraryStarters,
  ...libraryExamples,
];

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

const build = (
  entry: ProjectStarter | ExampleProject,
  namespace = 'demo',
  values: Record<string, Json> = {},
): ContentBundle => {
  const bundle = entry.build({ namespace, projectName: 'Demo Project', target, values });
  if (bundle instanceof Promise) throw new Error(`${entry.id} builds asynchronously.`);
  return bundle;
};

/**
 * Every placeholder the library may produce: each pattern, the entity skin and the painting
 * placeholder of every size up to 4 by 4 in each library colour.
 */
const PLACEHOLDERS = new Set([
  ...PLACEHOLDER_PATTERNS.flatMap((pattern) =>
    Object.values(COLOURS).map((colour) =>
      Buffer.from(placeholderPng(pattern, { colour })).toString('hex'),
    ),
  ),
  ...Object.values(COLOURS).map((colour) =>
    Buffer.from(placeholderSkinPng({ colour })).toString('hex'),
  ),
  ...[1, 2, 3, 4].flatMap((width) =>
    [1, 2, 3, 4].flatMap((height) =>
      Object.values(COLOURS).map((colour) =>
        Buffer.from(paintingPng(width, height, colour)).toString('hex'),
      ),
    ),
  ),
]);

describe('project starters', () => {
  it('lists the twenty-four starters in order', () => {
    expect(libraryStarters.map((starter) => starter.id)).toEqual(STARTER_IDS);
  });

  it('groups them as blank, pack and content starters', () => {
    expect(libraryStarters.map((starter) => starter.category)).toEqual([
      'blank',
      'pack',
      'pack',
      'pack',
      ...Array<string>(20).fill('content'),
    ]);
  });

  it('leaves the blank starter empty so the host adds only pack.mcmeta', () => {
    const blank = libraryStarters[0] as ProjectStarter;
    expect(build(blank)).toEqual({ elements: [], assets: [] });
    expect(blank.requiresKinds).toEqual([]);
  });

  it('gives every non-blank starter its own pack.mcmeta element', () => {
    for (const starter of libraryStarters.slice(1)) {
      const packs = build(starter).elements.filter(
        (entry) => entry.kind === 'minecraft:pack_mcmeta',
      );
      expect(
        packs.map((entry) => entry.id),
        starter.id,
      ).toEqual(['demo:pack']);
    }
  });

  it('builds the Custom ore starter from real blocks and items, with no vanilla overrides', () => {
    const ore = libraryStarters.find((starter) => starter.id === 'custom_ore') as ProjectStarter;
    expect(ore.description).toMatch(/Fabric mod jar/);
    expect(ore.layers).toEqual(['resourcepack', 'datapack', 'msm']);
    const bundle = build(ore);
    const ids = bundle.elements.map((entry) => `${entry.kind} ${entry.id}`);
    expect(ids).toEqual([
      'minecraft:pack_mcmeta demo:pack',
      'msm:mod demo:mod',
      'msm:block demo:ruby_ore',
      'minecraft:loot_table demo:blocks/ruby_ore',
      'msm:item demo:ruby',
      'msm:block demo:ruby_block',
      'minecraft:model demo:block/ruby_ore',
      'minecraft:model demo:block/ruby_block',
      'minecraft:model demo:item/ruby',
      'minecraft:recipe demo:ruby_block_from_rubies',
      'minecraft:recipe demo:ruby_from_block',
      'minecraft:recipe demo:ruby_from_smelting',
      'minecraft:tag/item demo:gems',
      'minecraft:advancement demo:root',
      'minecraft:advancement demo:get_ruby',
    ]);
    const rubyOre = bundle.elements.find((entry) => entry.id === 'demo:ruby_ore');
    expect(rubyOre?.data).toMatchObject({
      loot: 'demo:blocks/ruby_ore',
      components: {
        'msm:breakable': { tool: 'pickaxe', min_tier: 'iron' },
        'msm:light_emitter': { level: 3 },
      },
    });
    const loot = bundle.elements.find((entry) => entry.id === 'demo:blocks/ruby_ore');
    expect(JSON.stringify(loot?.data)).toContain('"name":"demo:ruby"');
    expect(bundle.elements.find((entry) => entry.kind === 'msm:mod')?.data).toMatchObject({
      mod_id: 'demo',
    });
    expect(bundle.assets.map((asset) => asset.path)).toEqual([
      'textures/block/ruby_ore.png',
      'textures/block/ruby_block.png',
      'textures/item/ruby.png',
    ]);
  });

  it('builds the Custom mob starter: an animated Ruby Golem with its model, loot and egg', () => {
    const mob = libraryStarters.find((starter) => starter.id === 'custom_mob') as ProjectStarter;
    expect(mob.category).toBe('content');
    expect(mob.description).toMatch(/Fabric mod jar/);
    expect(mob.layers).toEqual(['resourcepack', 'datapack', 'msm']);
    const bundle = build(mob);
    expect(bundle.elements.map((entry) => `${entry.kind} ${entry.id}`)).toEqual([
      'minecraft:pack_mcmeta demo:pack',
      'msm:mod demo:mod',
      'msm:entity demo:ruby_golem',
      'msm:geo_model demo:entity/ruby_golem',
      'msm:animation demo:entity/ruby_golem_animations',
      'minecraft:loot_table demo:entities/ruby_golem',
      'minecraft:function demo:golem/death',
    ]);
    const golem = bundle.elements.find((entry) => entry.id === 'demo:ruby_golem');
    expect(golem?.data).toMatchObject({
      category: 'creature',
      size: { width: 0.9, height: 1.6 },
      loot_table: 'demo:entities/ruby_golem',
      spawn: { biomes: ['#minecraft:is_forest'], weight: 6, min_group: 1, max_group: 2 },
      spawn_egg: { texture: 'demo:item/ruby_golem_spawn_egg' },
      components: {
        'msm:health': { max: 30 },
        'msm:movement': { speed: 0.28 },
        'msm:attack': { damage: 4, on_attack: 'demo:ruby_golem_attack' },
        'msm:animated_model': {
          model: 'demo:entity/ruby_golem',
          animations: 'demo:entity/ruby_golem_animations',
          texture: 'demo:entity/ruby_golem',
        },
        'msm:on_death': { event: 'demo:ruby_golem_death' },
      },
    });
    expect(JSON.parse(JSON.stringify(golem?.data ?? {})).components['msm:ai_goals'].goals).toEqual([
      { type: 'melee_attack', retaliate: true },
      { type: 'wander' },
      { type: 'look_at_player' },
      { type: 'look_around' },
    ]);
    const animations = bundle.elements.find((entry) => entry.kind === 'msm:animation');
    expect(Object.keys(JSON.parse(JSON.stringify(animations?.data ?? {})).animations)).toEqual([
      'idle',
      'walk',
      'attack',
    ]);
    const loot = bundle.elements.find((entry) => entry.kind === 'minecraft:loot_table');
    expect(JSON.stringify(loot?.data)).toContain('"name":"minecraft:emerald"');
    expect(bundle.assets.map((asset) => asset.path)).toEqual([
      'textures/entity/ruby_golem.png',
      'textures/item/ruby_golem_spawn_egg.png',
    ]);
  });

  it('builds the Custom sword starter: an msm:item sword with a handheld model, recipe and name', () => {
    const sword = libraryStarters.find(
      (starter) => starter.id === 'custom-sword',
    ) as ProjectStarter;
    expect(sword.title).toBe('Custom sword');
    expect(sword.category).toBe('content');
    expect(sword.description).toMatch(/Fabric mod jar/);
    expect(sword.layers).toEqual(['resourcepack', 'datapack', 'msm']);
    expect(sword.requiresKinds).toEqual([
      'minecraft:lang',
      'minecraft:model',
      'minecraft:pack_mcmeta',
      'minecraft:recipe',
      'msm:item',
      'msm:mod',
    ]);
    const bundle = build(sword);
    expect(bundle.elements.map((entry) => `${entry.kind} ${entry.id}`)).toEqual([
      'minecraft:pack_mcmeta demo:pack',
      'msm:mod demo:mod',
      'msm:item demo:ruby_sword',
      'minecraft:model demo:item/ruby_sword',
      'minecraft:lang demo:en_us',
      'minecraft:recipe demo:ruby_sword_from_emerald',
    ]);
    expect(bundle.elements.find((entry) => entry.id === 'demo:ruby_sword')?.data).toMatchObject({
      model: 'demo:item/ruby_sword',
      max_stack_size: 1,
      components: {
        'msm:tool': { type: 'sword', tier: 'diamond' },
        'msm:durability': { max: 1561 },
      },
    });
    expect(bundle.elements.find((entry) => entry.id === 'demo:item/ruby_sword')?.data).toEqual({
      parent: 'minecraft:item/handheld',
      textures: { layer0: 'demo:item/ruby_sword' },
    });
    expect(bundle.elements.find((entry) => entry.id === 'demo:en_us')?.data).toEqual({
      'item.demo.ruby_sword': 'Ruby Sword',
    });
    expect(
      bundle.elements.find((entry) => entry.id === 'demo:ruby_sword_from_emerald')?.data,
    ).toMatchObject({
      type: 'minecraft:crafting_shaped',
      pattern: ['I', 'I', 'S'],
      key: { I: 'minecraft:emerald', S: 'minecraft:stick' },
      result: { id: 'demo:ruby_sword', count: 1 },
    });
    expect(bundle.assets.map((asset) => asset.path)).toEqual(['textures/item/ruby_sword.png']);
  });

  it('builds the Scripted ore starter: the Custom ore content plus three scripts', () => {
    const scripted = libraryStarters.find(
      (starter) => starter.id === 'scripted_ore',
    ) as ProjectStarter;
    const ore = libraryStarters.find((starter) => starter.id === 'custom_ore') as ProjectStarter;
    expect(scripted.category).toBe('content');
    expect(scripted.description).toMatch(/Fabric mod jar/);
    expect(scripted.description).toMatch(/Java project export/);
    expect(scripted.layers).toEqual(['resourcepack', 'datapack', 'msm']);
    const bundle = build(scripted);
    const base = build(ore);
    expect(bundle.elements.map((entry) => `${entry.kind} ${entry.id}`)).toEqual([
      ...base.elements.map((entry) => `${entry.kind} ${entry.id}`),
      'msm:script demo:ore_glow',
      'msm:script demo:ruby_block_guard',
      'msm:script demo:welcome',
    ]);
    expect(bundle.assets).toEqual(base.assets);
    // Only the pack, the mod and the block of ruby differ from the Custom ore starter.
    const changed = bundle.elements
      .filter((entry, index) => {
        const before = base.elements[index];
        return before !== undefined && JSON.stringify(before) !== JSON.stringify(entry);
      })
      .map((entry) => entry.id);
    expect(changed).toEqual(['demo:pack', 'demo:mod', 'demo:ruby_block']);
    const block = bundle.elements.find((entry) => entry.id === 'demo:ruby_block');
    expect(block?.data).toMatchObject({
      components: { 'msm:on_step': { event: 'demo:ruby_block_step', cooldown_ticks: 20 } },
      events: {
        'demo:ruby_block_step': { actions: [{ type: 'run_script', handler: 'demo:guard' }] },
      },
    });
    const text = (id: string): string =>
      (
        (bundle.elements.find((entry) => entry.id === id)?.data as { lines: string[] }) ?? {
          lines: [],
        }
      ).lines.join('\n');
    expect(text('demo:ore_glow')).toContain('msm.events.on("block.interact"');
    expect(text('demo:ore_glow')).toContain('e.player.isSneaking');
    expect(text('demo:ore_glow')).toContain('e.cancel();');
    expect(text('demo:ore_glow')).toContain('e.player.give("demo:ruby", 1);');
    expect(text('demo:ruby_block_guard')).toContain('msm.actions.define("demo:guard"');
    expect(text('demo:welcome')).toContain('msm.events.on("player.join"');
    for (const entry of bundle.elements.filter((element) => element.kind === 'msm:script')) {
      expect(entry.notes, entry.id).toMatch(/Fabric mod jar/);
      expect(entry.notes, entry.id).toMatch(/Java project export/);
    }
  });

  it('plays the vanilla cat record in the music disc starter, with no bundled sound', () => {
    const disc = libraryStarters.find((starter) => starter.id === 'music_disc');
    const bundle = build(disc as ProjectStarter);
    expect(bundle.assets.every((asset) => asset.path.startsWith('textures/'))).toBe(true);
    const sounds = bundle.elements.find((entry) => entry.kind === 'minecraft:sounds');
    expect(sounds?.id).toBe('demo:sounds');
    expect(JSON.stringify(sounds?.data)).toContain('"minecraft:records/cat"');
    const song = bundle.elements.find((entry) => entry.kind === 'minecraft:jukebox_song');
    expect(song?.data).toMatchObject({ sound_event: 'demo:music_disc.my_song' });
    const definition = bundle.elements.find((entry) => entry.kind === 'minecraft:item_definition');
    expect(definition?.id).toBe('minecraft:music_disc_13');
    expect(definition?.data).toMatchObject({
      model: {
        type: 'minecraft:select',
        property: 'minecraft:component',
        component: 'minecraft:jukebox_playable',
        cases: [{ when: 'demo:my_song' }],
      },
    });
  });
});

describe('examples', () => {
  it('has 61 per-kind examples, one per built-in kind, 6 behaviour examples and 4 starter projects', () => {
    expect(kindExamples).toHaveLength(61);
    expect(kindExamples.map((example) => example.kind)).toEqual(KIND_IDS);
    expect(starterExamples.map((example) => example.id)).toEqual(
      ['custom_ore', 'recipe_pack', 'music_disc', 'function_starter'].map((id) => `starter_${id}`),
    );
    expect(starterExamples.every((example) => example.category === STARTERS_CATEGORY)).toBe(true);
    expect(behaviourExamples.map((example) => example.id)).toEqual([
      'example_msm_tool',
      'example_msm_event_chain',
    ]);
    expect(entityBehaviourExamples.map((example) => example.id)).toEqual([
      'example_msm_hostile_mob',
      'example_msm_natural_spawn',
    ]);
    expect(scriptBehaviourExamples.map((example) => example.id)).toEqual([
      'example_msm_script_schedule',
      'example_msm_script_action',
    ]);
    expect(libraryExamples).toHaveLength(71);
  });

  it('reuses the starter builders for the starter projects', () => {
    for (const example of starterExamples) {
      const starter = libraryStarters.find((entry) => `starter_${entry.id}` === example.id);
      const fromStarter = build(starter as ProjectStarter);
      const fromExample = build(example);
      expect(fromExample.elements.map((entry) => entry.id)).toEqual(
        fromStarter.elements.map((entry) => entry.id),
      );
      expect(fromExample.elements.map((entry) => entry.data)).toEqual(
        fromStarter.elements.map((entry) => entry.data),
      );
    }
  });

  it('explains the main element of each per-kind example in three to six sentences', () => {
    for (const example of kindExamples) {
      const main = build(example).elements.find((entry) => entry.kind === example.kind);
      const notes = main?.notes ?? '';
      const sentences = notes.split(/[.!?](?:\s|$)/).filter((part) => part.trim() !== '');
      expect(sentences.length, `${example.id}: ${notes}`).toBeGreaterThanOrEqual(3);
      expect(sentences.length, `${example.id}: ${notes}`).toBeLessThanOrEqual(7);
    }
  });

  it('tags every element with example and the category', () => {
    for (const example of libraryExamples) {
      for (const entry of build(example).elements) {
        expect(entry.tags, `${example.id} ${entry.id}`).toEqual(
          expect.arrayContaining(['example', categoryTag(example.category)]),
        );
      }
    }
  });
});

describe('every starter and example', () => {
  it('has a unique id', () => {
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares exactly the kinds its bundle uses', () => {
    for (const entry of entries) {
      const used = new Set(build(entry).elements.map((element) => element.kind));
      // A choice that builds other content adds its kinds (`probeValues`).
      if (entry.id === 'music-disc-item') {
        for (const element of build(entry, 'demo', { disc_type: 'vanilla' }).elements) {
          used.add(element.kind);
        }
      }
      if (entry.id === 'consumable') {
        for (const element of build(entry, 'demo', { kind: 'charm' }).elements) {
          used.add(element.kind);
        }
      }
      expect(entry.requiresKinds, entry.id).toEqual([...used].sort());
      for (const kind of used) expect(KIND_IDS, entry.id).toContain(kind);
    }
  });

  it('builds the same bundle every time', () => {
    for (const entry of entries) expect(build(entry), entry.id).toEqual(build(entry));
  });

  it('puts content only in the given namespace or overrides in minecraft', () => {
    for (const entry of entries) {
      const bundle = build(entry, 'other_ns');
      const text = JSON.stringify(bundle.elements);
      expect(text, entry.id).not.toContain('demo');
      for (const element of bundle.elements) {
        expect(['other_ns', 'minecraft'], `${entry.id} ${element.id}`).toContain(
          element.id.slice(0, element.id.indexOf(':')),
        );
      }
      for (const asset of bundle.assets) expect(asset.namespace, entry.id).toBe('other_ns');
    }
  });

  it('has no duplicate element ids or asset paths', () => {
    for (const entry of entries) {
      const bundle = build(entry);
      const ids = bundle.elements.map((element) => element.id);
      expect(new Set(ids).size, entry.id).toBe(ids.length);
      const paths = bundle.assets.map((asset) => `${asset.namespace}/${asset.path}`);
      expect(new Set(paths).size, entry.id).toBe(paths.length);
    }
  });

  it('uses only generated placeholder textures with lower-case names inside a folder', () => {
    for (const entry of entries) {
      for (const asset of build(entry).assets) {
        expect(asset.path, entry.id).toMatch(/^textures\/[a-z0-9_/]+\/[a-z0-9_.-]+\.png$/);
        expect(PLACEHOLDERS.has(Buffer.from(asset.bytes).toString('hex')), asset.path).toBe(true);
      }
    }
  });

  it('gives every texture a model or painting that uses it', () => {
    for (const entry of entries) {
      const bundle = build(entry);
      const text = JSON.stringify(bundle.elements);
      for (const asset of bundle.assets) {
        const id = `${asset.namespace}:${asset.path.replace(/^textures\//, '').replace(/\.png$/, '')}`;
        const paintingId = id.replace(':painting/', ':');
        // Equipment layers name `<ns>:<name>` for textures/entity/equipment/<layer>/<name>.png.
        const equipmentId = id.replace(/:entity\/equipment\/[a-z_]+\//, ':');
        expect(
          [id, paintingId, equipmentId].some((candidate) => text.includes(`"${candidate}"`)),
          id,
        ).toBe(true);
      }
    }
  });
});

const WORLDGEN_KIND_IDS = KIND_IDS.slice(
  KIND_IDS.indexOf('minecraft:structure_template'),
  KIND_IDS.indexOf('minecraft:worldgen/material_rule') + 1,
);
const WORLDGEN_KINDS = new Set(WORLDGEN_KIND_IDS);

/** Every string in `value` with its object key, depth first. */
function strings(value: unknown, key = ''): { key: string; text: string }[] {
  if (typeof value === 'string') return [{ key, text: value }];
  if (Array.isArray(value)) return value.flatMap((item) => strings(item, key));
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([name, item]) => strings(item, name));
  }
  return [];
}

type Obj = Record<string, unknown>;
const asObj = (value: unknown): Obj =>
  typeof value === 'object' && value !== null ? (value as Obj) : {};
const asArr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** The jigsaw names the pieces of `poolId` and its fallbacks offer, within one bundle. */
function poolNames(bundle: ContentBundle, poolId: string, seen = new Set<string>()): Set<string> {
  const names = new Set<string>();
  if (seen.has(poolId)) return names;
  seen.add(poolId);
  const pool = bundle.elements.find(
    (entry) => entry.id === poolId && entry.kind === 'minecraft:worldgen/template_pool',
  );
  if (pool === undefined) return names;
  for (const item of asArr(asObj(pool.data).elements)) {
    const location = asObj(asObj(item).element).location;
    const template = bundle.elements.find(
      (entry) => entry.id === location && entry.kind === 'minecraft:structure_template',
    );
    for (const jigsaw of asArr(asObj(template?.data).jigsaws)) {
      names.add(String(asObj(jigsaw).name));
    }
  }
  const fallback = asObj(pool.data).fallback;
  if (typeof fallback === 'string') {
    for (const name of poolNames(bundle, fallback, seen)) names.add(name);
  }
  return names;
}

describe('structure and worldgen content', () => {
  const worldgenEntries = entries.filter((entry) =>
    entry.requiresKinds.some((kind) => WORLDGEN_KINDS.has(kind)),
  );

  it('covers the three worldgen starters and the 19 structure and worldgen examples', () => {
    expect(worldgenEntries.map((entry) => entry.id)).toEqual([
      'custom_biome',
      'jigsaw_structure',
      'worldgen_pack',
      ...WORLDGEN_KIND_IDS.map((kind) => {
        const example = kindExamples.find((entry) => entry.kind === kind);
        return example?.id;
      }),
    ]);
  });

  it('is self-contained: every project id it names is an element of the same bundle', () => {
    for (const entry of worldgenEntries) {
      const bundle = build(entry, 'other_ns');
      const ids = new Set<string>(bundle.elements.map((element) => element.id));
      for (const element of bundle.elements) {
        if (element.kind === 'minecraft:lang' || element.kind === 'minecraft:pack_mcmeta') continue;
        for (const { key, text } of strings(element.data)) {
          if (
            element.kind === 'minecraft:structure_template' &&
            (key === 'name' || key === 'target')
          )
            continue;
          if (!/^#?other_ns:/.test(text)) continue;
          expect(ids.has(text.replace(/^#/, '')), `${entry.id} ${element.id} ${key} ${text}`).toBe(
            true,
          );
        }
      }
    }
  });

  it('matches every jigsaw target with a jigsaw name in the target pool or its fallbacks', () => {
    let checked = 0;
    for (const entry of worldgenEntries) {
      const bundle = build(entry);
      for (const template of bundle.elements) {
        if (template.kind !== 'minecraft:structure_template') continue;
        for (const jigsaw of asArr(asObj(template.data).jigsaws)) {
          const { pool, target } = asObj(jigsaw) as { pool: string; target: string };
          if (pool === 'minecraft:empty') {
            expect(target, `${entry.id} ${template.id}`).toBe('minecraft:empty');
            continue;
          }
          checked += 1;
          expect(
            [...poolNames(bundle, pool)],
            `${entry.id} ${template.id} ${pool} -> ${target}`,
          ).toContain(target);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('keeps configured and placed features apart: element ids are unique across kinds', () => {
    for (const entry of worldgenEntries) {
      const ids = build(entry).elements.map((element) => element.id);
      expect(new Set(ids).size, entry.id).toBe(ids.length);
    }
  });

  it('wires the worldgen pack: preset in #minecraft:normal, hamlet biome tag with the biome', () => {
    const pack = libraryStarters.find((starter) => starter.id === 'worldgen_pack');
    const bundle = build(pack as ProjectStarter);
    const byId = (id: string, kind: string) =>
      bundle.elements.find((entry) => entry.id === id && entry.kind === kind)?.data;
    expect(byId('minecraft:normal', 'minecraft:tag/worldgen/world_preset')).toEqual({
      values: ['demo:amber_world'],
    });
    expect(byId('demo:has_structure/hamlet', 'minecraft:tag/worldgen/biome')).toEqual({
      values: ['demo:amber_woods', '#minecraft:is_forest'],
    });
    expect(byId('demo:hamlet', 'minecraft:worldgen/structure')).toMatchObject({
      type: 'minecraft:jigsaw',
      biomes: '#demo:has_structure/hamlet',
      start_pool: 'demo:hamlet/centre',
      step: 'surface_structures',
      project_start_to_heightmap: 'WORLD_SURFACE_WG',
      terrain_adaptation: 'beard_thin',
    });
    expect(byId('demo:hamlets', 'minecraft:worldgen/structure_set')).toMatchObject({
      structures: [{ structure: 'demo:hamlet', weight: 1 }],
      placement: { type: 'minecraft:random_spread' },
    });
    const ids = bundle.elements.map((entry) => entry.id);
    const biomeStarter = libraryStarters.find((starter) => starter.id === 'custom_biome');
    const structureStarter = libraryStarters.find((starter) => starter.id === 'jigsaw_structure');
    const parts = [biomeStarter, structureStarter].flatMap((starter) =>
      build(starter as ProjectStarter).elements.map((entry) => entry.id),
    );
    expect([...ids].sort()).toEqual([...new Set(parts)].sort());
  });
});
