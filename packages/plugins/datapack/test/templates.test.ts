import { readdir, readFile } from 'node:fs/promises';
import type {
  ElementTemplate,
  Json,
  ResourceLocation,
  TargetFacts,
  TemplateContext,
} from '@msm/plugin-api';
import {
  createMcfunctionService,
  defaultFunctionUri,
  type McfunctionService,
} from '@msm/schemas/mcfunction';
import { builtInTargets, readVendoredJson, type TargetBundle } from '@msm/targets';
import { beforeAll, describe, expect, it } from 'vitest';
import plugin, { dataPackKinds, dataPackTemplates } from '../src/index';
import { blockingProblems, indexesFor, PROJECT_IDS } from './support';

/** The first target's facts without its hooks: a template context is plain data. */
const {
  javaProject: _javaProject,
  migrateFrom: _migrateFrom,
  ...FIRST_TARGET
} = (builtInTargets[0] as TargetBundle).target;

/** The 60 template ids, in picker order (library plan section 2.1). */
const IDS = [
  'recipe_shaped',
  'recipe_shapeless',
  'recipe_smelting',
  'recipe_blasting',
  'recipe_smoking',
  'recipe_campfire_cooking',
  'recipe_stonecutting',
  'recipe_smithing_transform',
  'recipe_smithing_trim',
  'loot_table_block',
  'loot_table_chest',
  'loot_table_entity',
  'loot_table_fishing',
  'advancement',
  'advancement_inventory_changed',
  'advancement_recipe_crafted',
  'advancement_killed_entity',
  'advancement_location',
  'predicate',
  'predicate_sneaking',
  'predicate_raining',
  'predicate_night',
  'predicate_in_biome',
  'item_modifier',
  'item_modifier_set_name',
  'item_modifier_set_lore',
  'item_modifier_set_enchantments',
  'function',
  'function_load_body',
  'function_tick_body',
  'function_tick',
  'function_load',
  'tag_function',
  'tag_item',
  'tag_block',
  'tag_entity_type',
  'tag_fluid',
  'tag_game_event',
  'tag_damage_type',
  'tag_enchantment',
  'tag_painting_variant_placeable',
  'tag_worldgen_biome',
  'tag_worldgen_structure',
  'tag_worldgen_world_preset_normal',
  'enchantment_damage',
  'enchantment_protection',
  'damage_type',
  'dimension_type',
  'chat_type',
  'jukebox_song',
  'banner_pattern',
  'painting_variant',
  'trim_material',
  'trim_pattern',
  'dialog_notice',
  'dialog_confirmation',
  'trade_emeralds_for_item',
  'trade_item_for_emeralds',
  'trade_set',
  'tag_villager_trade_fletcher',
];

/** The ids the app offered before templates moved into the plugin (kept for the e2e specs). */
const KEPT = [
  'recipe_shaped',
  'recipe_shapeless',
  'recipe_smelting',
  'loot_table_block',
  'advancement',
  'predicate',
  'item_modifier',
  'function',
  'function_tick',
  'function_load',
  'tag_function',
  'tag_item',
  'tag_block',
];

/** The test project: namespace `demo`, plus `minecraft` for the tick and load tags. */
const NAMESPACES = ['demo', 'minecraft'] as const;

const kindOf = (template: ElementTemplate) => {
  const kind = dataPackKinds.find((entry) => entry.id === template.kind);
  if (kind === undefined) throw new Error(`no kind ${template.kind}`);
  return kind;
};

/** The id the host gives a new element: default namespace and name, then the prefix. */
function elementId(template: ElementTemplate): ResourceLocation {
  const namespace = template.defaultNamespace ?? 'demo';
  const name = template.defaultName ?? 'sample';
  const prefix = template.prefix ?? '';
  return `${namespace}:${name.startsWith(prefix) ? name : `${prefix}${name}`}`;
}

/** The context the host builds (`app/src/renderer/src/studios/templates.ts`). */
function contextFor(
  template: ElementTemplate,
  target: TargetFacts = FIRST_TARGET,
): TemplateContext {
  const id = elementId(template);
  const colon = id.indexOf(':');
  const namespace = id.slice(0, colon);
  const own = NAMESPACES.find((name) => name !== 'minecraft');
  const kindDefault = kindOf(template).defaultData;
  return {
    id,
    namespace,
    path: id.slice(colon + 1),
    projectNamespace: own ?? (namespace === 'minecraft' ? 'my_project' : namespace),
    namespaces: [...NAMESPACES],
    kindDefault: kindDefault === undefined ? undefined : structuredClone(kindDefault),
    target,
  };
}

const byId = (id: string): ElementTemplate => {
  const template = dataPackTemplates.find((entry) => entry.id === id);
  if (template === undefined) throw new Error(`no template ${id}`);
  return template;
};

describe('data pack templates', () => {
  it('has the 60 ids in picker order, unique, and contributed by the plugin', () => {
    expect(dataPackTemplates.map((template) => template.id)).toEqual(IDS);
    expect(new Set(IDS).size).toBe(60);
    expect(plugin.contributes.elementTemplates?.map((template) => template.id)).toEqual(IDS);
    for (const id of KEPT) expect(IDS).toContain(id);
  });

  it('creates only kinds this plugin registers, and covers every kind', () => {
    const kinds = new Set(dataPackKinds.map((kind) => kind.id));
    for (const template of dataPackTemplates)
      expect(kinds.has(template.kind), template.id).toBe(true);
    expect(new Set(dataPackTemplates.map((template) => template.kind))).toEqual(kinds);
  });

  it('has a title, description and category for every template', () => {
    for (const template of dataPackTemplates) {
      expect(template.title, template.id).not.toBe('');
      expect(template.description, template.id).not.toBe('');
      expect(template.category, template.id).not.toBe('');
    }
  });

  it('keeps the tick and load tags in the minecraft namespace, pointing at the project', () => {
    for (const name of ['tick', 'load'] as const) {
      const template = byId(`function_${name}`);
      expect(template).toMatchObject({
        kind: 'minecraft:tag/function',
        defaultName: name,
        defaultNamespace: 'minecraft',
      });
      const context = contextFor(template);
      expect(context.id).toBe(`minecraft:${name}`);
      expect(template.data(context)).toEqual({ values: [`demo:${name}`] });
      expect(template.data({ ...context, projectNamespace: 'zeta' })).toEqual({
        values: [`zeta:${name}`],
      });
    }
    expect(byId('function_load_body').defaultName).toBe('load');
    expect(byId('function_tick_body').defaultName).toBe('tick');
    expect(byId('advancement').defaultName).toBe('root');
  });

  it('starts the worldgen tags in the vanilla conventions', () => {
    expect(byId('tag_worldgen_biome')).toMatchObject({
      kind: 'minecraft:tag/worldgen/biome',
      title: 'Biome tag (has_structure)',
      prefix: 'has_structure/',
    });
    expect(byId('tag_worldgen_structure').kind).toBe('minecraft:tag/worldgen/structure');
    const preset = byId('tag_worldgen_world_preset_normal');
    expect(preset).toMatchObject({
      kind: 'minecraft:tag/worldgen/world_preset',
      title: 'World preset tag: normal',
      defaultNamespace: 'minecraft',
      defaultName: 'normal',
    });
    const context = contextFor(preset);
    expect(context.id).toBe('minecraft:normal');
    expect(preset.data(context)).toEqual({ replace: false, values: [] });
  });

  it('starts the painting variant tag as the vanilla placeable tag', () => {
    const placeable = byId('tag_painting_variant_placeable');
    expect(placeable).toMatchObject({
      kind: 'minecraft:tag/painting_variant',
      title: 'Painting variant tag: placeable',
      defaultNamespace: 'minecraft',
      defaultName: 'placeable',
    });
    const context = contextFor(placeable);
    expect(context.id).toBe('minecraft:placeable');
    expect(placeable.data(context)).toEqual({ replace: false, values: [] });
  });

  it('hangs child advancements from the project root advancement', () => {
    for (const template of dataPackTemplates) {
      if (template.kind !== 'minecraft:advancement' || template.id === 'advancement') continue;
      const data = template.data({ ...contextFor(template), projectNamespace: 'zeta' }) as {
        parent?: string;
      };
      expect(data.parent, template.id).toBe('zeta:root');
    }
    const crafted = byId('advancement_recipe_crafted').data(
      contextFor(byId('advancement_recipe_crafted')),
    ) as { criteria: Record<string, { conditions: Record<string, Json> }> };
    expect(Object.values(crafted.criteria)[0]?.conditions).toHaveProperty('recipes');
  });

  it('points the jukebox song at a vanilla sound event', () => {
    const song = byId('jukebox_song').data(contextFor(byId('jukebox_song'))) as {
      sound_event: string;
    };
    expect(song.sound_event).toMatch(/^minecraft:music_disc\./);
  });

  it('returns fresh data on every call and never mutates the context', () => {
    for (const template of dataPackTemplates) {
      const context = contextFor(template);
      const before = structuredClone(context);
      const first = template.data(context);
      const second = template.data(context);
      expect(second, template.id).toEqual(first);
      if (typeof first === 'object' && first !== null) expect(second).not.toBe(first);
      expect(context, template.id).toEqual(before);
    }
  });

  it('uses no user namespace literal except the context', () => {
    for (const template of dataPackTemplates) {
      const context = { ...contextFor(template), projectNamespace: 'zz' };
      // The element's own id is allowed (a function's comment names it).
      const text = JSON.stringify(template.data(context)).replaceAll(context.id, '');
      expect(text, template.id).not.toMatch(/\b(demo|example|my_project):/);
    }
  });

  it('keeps src free of @msm/targets and @msm/core imports', async () => {
    const root = new URL('../src/', import.meta.url);
    const files = (await readdir(root, { recursive: true })).filter((file) => file.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = await readFile(new URL(file, root), 'utf8');
      expect(text, file).not.toMatch(/from '@msm\/(targets|target-|core)/);
    }
  });
});

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'data pack templates for %s',
  (_targetId, bundle: TargetBundle) => {
    let mcfunction: McfunctionService;

    beforeAll(async () => {
      const [commands, blocks, registries, mcdocSymbols] = await Promise.all(
        (
          ['mcmetaCommands', 'mcmetaBlocks', 'mcmetaRegistries', 'vanillaMcdocSymbols'] as const
        ).map((key) => readVendoredJson(bundle, key, nodeReadFile)),
      );
      mcfunction = await createMcfunctionService(
        { commands, blocks, registries: registries as Record<string, string[]> },
        { mcVersion: bundle.target.mcVersion, mcdocSymbols },
      );
    }, 60_000);

    it.each(dataPackTemplates.map((template) => [template.id, template] as const))(
      '%s validates and lowers cleanly',
      async (_id, template) => {
        const indexes = await indexesFor(bundle);
        const kind = kindOf(template);
        const context = contextFor(template, bundle.target);
        const data = await template.data(context);
        expect(blockingProblems(indexes, kind.schema, data)).toEqual([]);

        const files = await kind.lower(
          {
            formatVersion: 1,
            id: context.id,
            kind: kind.id,
            data,
            meta: { createdAt: '2026-01-01T00:00:00.000Z' },
          },
          bundle.target,
        );
        expect(files).toHaveLength(1);
        const [file] = files;
        if (file === undefined) throw new Error('no output');
        expect(file.layer).toBe('datapack');
        if (file.language === undefined) {
          expect(blockingProblems(indexes, file.schema ?? '', file.contents as Json)).toEqual([]);
        } else {
          expect(file.language).toBe('mcfunction');
        }
      },
    );

    it.each(
      dataPackTemplates
        .filter((template) => template.kind === 'minecraft:function')
        .map((template) => [template.id, template] as const),
    )('%s passes the mcfunction checker', async (_id, template) => {
      const context = contextFor(template);
      const lines = (template.data(context) as { lines: string[] }).lines;
      const problems = await mcfunction.check(lines.join('\n'), {
        uri: defaultFunctionUri(
          context.namespace,
          context.path,
          bundle.target.folders.data.function,
        ),
        projectIds: PROJECT_IDS,
      });
      expect(problems).toEqual([]);
    });

    it.each(
      dataPackTemplates
        .filter((template) => template.kind === 'minecraft:tag/function')
        .map((template) => [template.id, template] as const),
    )('%s runs only functions the checker knows', async (_id, template) => {
      const context = contextFor(template);
      const { values } = template.data(context) as { values: (string | { id: string })[] };
      const lines = values.map(
        (value) => `function ${typeof value === 'string' ? value : value.id}`,
      );
      const problems = await mcfunction.check(lines.join('\n'), {
        uri: defaultFunctionUri('demo', 'check_tag', bundle.target.folders.data.function),
        projectIds: PROJECT_IDS,
      });
      expect(problems).toEqual([]);
    });
  },
);

describe('villager trade templates', () => {
  it('lowers the fletcher tag template to a mergeable vanilla trade tag on every target', async () => {
    const template = byId('tag_villager_trade_fletcher');
    const context = contextFor(template);
    expect(context.id).toBe('minecraft:fletcher/level_1');
    for (const bundle of builtInTargets) {
      const [file, ...rest] = (await kindOf(template).lower(
        {
          id: context.id,
          kind: template.kind,
          data: { replace: false, values: ['demo:sample'] },
        } as never,
        bundle.target as never,
      )) as unknown as Array<{ path: string; merge?: string; contents: { replace: boolean } }>;
      expect(rest).toHaveLength(0);
      expect(file?.path).toBe('data/minecraft/tags/villager_trade/fletcher/level_1.json');
      expect(file?.merge).toBe('tag');
      expect(file?.contents.replace).toBe(false);
    }
  });
});
