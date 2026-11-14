import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Element,
  ElementTemplate,
  Json,
  OutputFile,
  ResourceLocation,
  TargetFacts,
  TemplateContext,
} from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  blockItemId,
  blocksItemsKinds,
  blocksItemsTemplates,
  blocksItemsValidators,
  MOD_ID_PATTERN,
  modIdFromNamespace,
} from '../src/index';
import { BLOCK_KIND } from '../src/kinds';
import {
  blockingProblems,
  element,
  indexesFor,
  PROJECT_IDS,
  sortedJson,
  type TargetIndexes,
} from './support';

/** The first target's facts without its hooks: a template context is plain data. */
const {
  javaProject: _javaProject,
  migrateFrom: _migrateFrom,
  ...FIRST_TARGET
} = (builtInTargets[0] as TargetBundle).target;

const UPDATE = process.env.UPDATE_GOLDENS === '1';

const IDS = [
  'msm_block_simple',
  'msm_block_glowing_ore',
  'msm_block_interactive',
  'msm_block_half',
  'msm_block_plant',
  'msm_block_glass_like',
  'msm_block_bounce_pad',
  'msm_block_log',
  'msm_block_facing',
  'msm_block_observer_like',
  'msm_block_slab',
  'msm_block_stairs',
  'msm_block_wall',
  'msm_block_fence',
  'msm_block_fence_gate',
  'msm_block_door',
  'msm_block_trapdoor',
  'msm_block_button',
  'msm_block_pressure_plate',
  'msm_block_weighted_pressure_plate',
  'msm_block_pane',
  'msm_block_crop',
  'msm_block_sapling',
  'msm_block_leaves',
  'msm_item_food',
  'msm_item_tool',
  'msm_item_tool_custom_material',
  'msm_item_armor_helmet',
  'msm_item_spear',
  'msm_item_bow',
  'msm_item_shield',
  'msm_item_drink',
  'msm_item_totem',
  'msm_item_wand',
  'msm_item_throwable',
  'msm_item_fuel',
  'msm_item_life_steal_sword',
  'msm_effect_status',
  'msm_effect_damage_over_time',
  'msm_effect_stat_boost',
  'msm_potion_custom_effect',
  'msm_potion_long_strong',
  'msm_mod',
  'msm_biome_addition_overworld_ore',
  'msm_loot_addition_mob_drop',
];
const CATEGORIES = new Set(['Blocks', 'Items', 'Effects', 'Mod', 'Additions']);

const kindOf = (template: ElementTemplate) => {
  const kind = blocksItemsKinds.find((entry) => entry.id === template.kind);
  if (kind === undefined) throw new Error(`no kind ${template.kind}`);
  return kind;
};

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
  const kindDefault = kindOf(template).defaultData;
  return {
    id,
    namespace: id.slice(0, colon),
    path: id.slice(colon + 1),
    projectNamespace: 'demo',
    namespaces: ['demo'],
    kindDefault: kindDefault === undefined ? undefined : structuredClone(kindDefault),
    target,
  };
}

/**
 * The test indexes plus the ids a new element brings into the project, as the app's registry
 * index counts them: its block item's own id (`blockItemId`, the Crop template's seeds) and the
 * block models its lowering generates from `textures` (ADR 0067 D7).
 */
function withOwnIds(indexes: TargetIndexes, created: Element, files: OutputFile[]): TargetIndexes {
  const itemId = created.kind === BLOCK_KIND ? blockItemId(created) : undefined;
  const modelIds = files
    .map((file) => /^assets\/([^/]+)\/models\/(.+)\.json$/.exec(file.path))
    .filter((match) => match !== null)
    .map((match) => `${match[1]}:${match[2]}`);
  if (itemId === undefined && modelIds.length === 0) return indexes;
  const project: Record<string, readonly string[]> = {
    ...PROJECT_IDS,
    item: [...(PROJECT_IDS.item ?? []), ...(itemId === undefined ? [] : [itemId])],
    model: [...(PROJECT_IDS.model ?? []), ...modelIds],
  };
  return { ...indexes, registries: createRegistryIndex({ vanilla: indexes.vanilla, project }) };
}

describe('blocks-items templates', () => {
  it('has the ids in picker order, unique, and contributed by the plugin', () => {
    expect(blocksItemsTemplates.map((template) => template.id)).toEqual(IDS);
    expect(plugin.contributes.elementTemplates?.map((template) => template.id)).toEqual(IDS);
  });

  it('covers every kind with a title, description and category', () => {
    expect(new Set(blocksItemsTemplates.map((t) => t.kind))).toEqual(
      new Set(blocksItemsKinds.map((kind) => kind.id)),
    );
    for (const template of blocksItemsTemplates) {
      expect(template.title, template.id).not.toBe('');
      expect(template.description, template.id).not.toBe('');
      expect(CATEGORIES.has(template.category), template.id).toBe(true);
    }
  });

  it('returns fresh data on every call and never mutates the context', async () => {
    for (const template of blocksItemsTemplates) {
      const context = contextFor(template);
      const before = structuredClone(context);
      const first = await template.data(context);
      const second = await template.data(context);
      expect(second, template.id).toEqual(first);
      expect(second).not.toBe(first);
      expect(context, template.id).toEqual(before);
    }
  });

  it('uses only vanilla ids or ids derived from the new element id', async () => {
    for (const template of blocksItemsTemplates) {
      const context = { ...contextFor(template), id: 'zz:own' as const, projectNamespace: 'zz' };
      // Component keys (`"msm:breakable":`) are format names, not ids.
      const text = JSON.stringify(await template.data(context))
        .replaceAll(/"msm:[a-z_]+":/g, '')
        .replaceAll(/"zz:own(_[a-z]+)?"/g, '');
      expect(text, template.id).not.toMatch(/"(?!minecraft:)[a-z0-9_.-]+:[a-z0-9_./-]+"/);
    }
  });

  it('derives a valid mod id from any namespace', () => {
    for (const namespace of ['demo', 'my.pack', '1st', 'x', 'a'.repeat(80)]) {
      expect(modIdFromNamespace(namespace), namespace).toMatch(MOD_ID_PATTERN);
    }
    expect(modIdFromNamespace('my.pack')).toBe('my_pack');
    expect(modIdFromNamespace('minecraft')).toBe('mod_minecraft');
    expect(modIdFromNamespace('java')).toBe('mod_java');
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'templates for %s',
  (targetId, bundle) => {
    it.each(IDS.map((id) => [id] as const))(
      '%s validates, passes the validators and lowers cleanly',
      async (id) => {
        const template = blocksItemsTemplates.find((entry) => entry.id === id) as ElementTemplate;
        const context = contextFor(template, bundle.target);
        const data = await template.data(context);
        const kind = kindOf(template);
        const created = element(kind.id, context.id, data);
        const files = await kind.lower(created, bundle.target);
        const indexes = withOwnIds(await indexesFor(bundle), created, files);
        expect(blockingProblems(indexes, kind.schema, data)).toEqual([]);
        const problems = await Promise.all(
          blocksItemsValidators.map((validator) =>
            validator.validate({
              elements: [created],
              target: bundle.target,
              registry: indexes.registries,
            }),
          ),
        );
        expect(problems.flat()).toEqual([]);
        for (const file of files) {
          if (file.schema === undefined) continue;
          expect(blockingProblems(indexes, file.schema, file.contents as Json), file.path).toEqual(
            [],
          );
        }
        const actual = sortedJson(
          files.map((file) => ({
            contents: file.contents,
            layer: file.layer,
            merge: file.merge,
            path: file.path,
          })),
        );
        const url = new URL(
          `./fixtures/${targetId}/expected/templates/${id}.json`,
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
