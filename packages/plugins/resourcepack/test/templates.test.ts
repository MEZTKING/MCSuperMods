import type {
  Element,
  ElementTemplate,
  Json,
  ResourceLocation,
  TargetFacts,
  TemplateContext,
} from '@msm/plugin-api';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, { packMcmetaKind, resourcePackKinds, resourcePackTemplates } from '../src/index';
import { indexesFor, loadProblems } from './support';

/** The first target's facts without its hooks: a template context is plain data. */
const {
  javaProject: _javaProject,
  migrateFrom: _migrateFrom,
  ...FIRST_TARGET
} = (builtInTargets[0] as TargetBundle).target;

/** Picker order (ADR 0020, library plan section 2.1). */
const TEMPLATE_IDS = [
  'block_model',
  'model_block_column',
  'model_block_cross',
  'item_model',
  'model_item_handheld',
  'equipment-humanoid',
  'blockstate',
  'blockstate_facing',
  'blockstate_slab',
  'item_definition',
  'item_definition_condition',
  'item_definition_select',
  'lang',
  'sounds',
  'font_icons',
  'pack',
];

/** The context the host builds (mirrors the app's `templateContext`). */
function contextFor(
  id: ResourceLocation,
  namespaces: readonly string[],
  kindDefault: Json | undefined,
  target: TargetFacts = FIRST_TARGET,
): TemplateContext {
  const colon = id.indexOf(':');
  const namespace = id.slice(0, colon);
  const own = namespaces.find((name) => name !== 'minecraft');
  return {
    id,
    namespace,
    path: id.slice(colon + 1),
    projectNamespace: own ?? (namespace === 'minecraft' ? 'my_project' : namespace),
    namespaces: [...namespaces],
    kindDefault: kindDefault === undefined ? undefined : structuredClone(kindDefault),
    target,
  };
}

const kindOf = (template: ElementTemplate) => {
  const kind = resourcePackKinds.find((entry) => entry.id === template.kind);
  if (kind === undefined) throw new Error(`no kind ${template.kind}`);
  return kind;
};

/** `demo:<prefix>sample`, or `demo:<defaultName>` for templates with a default name. */
const sampleId = (template: ElementTemplate, namespace = 'demo'): ResourceLocation =>
  `${template.defaultNamespace ?? namespace}:${template.prefix ?? ''}${template.defaultName ?? 'sample'}`;

const element = (id: ResourceLocation, kind: string, data: Json): Element => ({
  formatVersion: 1,
  id,
  kind,
  data,
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
});

/** Every `namespace:` prefix of a resource location string in `value`. */
function namespacesIn(value: Json, out = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    const match = /^#?([a-z0-9_.-]+):[a-z0-9_./-]+$/.exec(value);
    if (match?.[1] !== undefined) out.add(match[1]);
  } else if (Array.isArray(value)) {
    for (const item of value) namespacesIn(item, out);
  } else if (typeof value === 'object' && value !== null) {
    for (const member of Object.values(value)) namespacesIn(member, out);
  }
  return out;
}

describe('resource pack templates', () => {
  it('contributes the sixteen templates in picker order', () => {
    expect(resourcePackTemplates.map((template) => template.id)).toEqual(TEMPLATE_IDS);
    expect(plugin.contributes.elementTemplates?.map((template) => template.id)).toEqual(
      TEMPLATE_IDS,
    );
  });

  it('only uses kinds the plugin registers and has a title, description and category', () => {
    const kindIds = new Set(resourcePackKinds.map((kind) => kind.id));
    for (const template of resourcePackTemplates) {
      expect(kindIds.has(template.kind), template.id).toBe(true);
      expect(template.title, template.id).not.toBe('');
      expect(template.description, template.id).not.toBe('');
      expect(template.category, template.id).not.toBe('');
    }
    // Every kind has a template except the atlas (ADR 0064 D7 names one font template only).
    const withoutTemplate = new Set(kindIds);
    for (const template of resourcePackTemplates) withoutTemplate.delete(template.kind);
    expect([...withoutTemplate]).toEqual(['minecraft:atlas']);
  });

  it('keeps the picker settings of the original templates', () => {
    const byId = new Map(resourcePackTemplates.map((template) => [template.id, template]));
    expect(byId.get('block_model')).toMatchObject({ prefix: 'block/' });
    expect(byId.get('item_model')).toMatchObject({ prefix: 'item/' });
    expect(byId.get('lang')).toMatchObject({ defaultName: 'en_us' });
    expect(byId.get('sounds')).toMatchObject({ defaultName: 'sounds', fixedName: true });
    expect(byId.get('pack')).toMatchObject({ defaultName: 'pack' });
  });

  it('derives references from the element id and the project namespace only', async () => {
    for (const template of resourcePackTemplates) {
      const id = sampleId(template, 'element_ns');
      const data = await template.data(
        contextFor(id, ['project_ns', 'element_ns'], kindOf(template).defaultData),
      );
      const allowed = new Set(['minecraft', 'element_ns', 'project_ns']);
      for (const namespace of namespacesIn(data)) {
        expect(allowed.has(namespace), `${template.id}: ${namespace}`).toBe(true);
      }
      expect(JSON.stringify(data), template.id).not.toContain('demo');
    }
  });

  it('accepts a name with or without the block/ or item/ folder', () => {
    const blockModel = resourcePackTemplates.find((template) => template.id === 'block_model');
    const blockstate = resourcePackTemplates.find((template) => template.id === 'blockstate');
    if (blockModel === undefined || blockstate === undefined) throw new Error('missing');
    expect(blockModel.data(contextFor('demo:block/ruby', ['demo'], undefined))).toEqual({
      parent: 'minecraft:block/cube_all',
      textures: { all: 'demo:block/ruby' },
    });
    expect(blockstate.data(contextFor('demo:ruby', ['demo'], undefined))).toEqual({
      variants: { '': { model: 'demo:block/ruby' } },
    });
  });

  it('builds the pack template from the kind default, with or without one', () => {
    const pack = resourcePackTemplates.find((template) => template.id === 'pack');
    if (pack === undefined) throw new Error('missing');
    const fromDefault = pack.data(
      contextFor('demo:pack', ['demo'], { pack: { description: 'x' } }),
    );
    expect(fromDefault).toEqual({ pack: { description: 'x' } });
    const fallback = pack.data(contextFor('demo:pack', ['demo'], undefined));
    expect(fallback).toEqual(packMcmetaKind.defaultData);
    expect(fallback).not.toBe(packMcmetaKind.defaultData);
  });

  describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
    'for %s',
    (_targetId, bundle) => {
      it.each(TEMPLATE_IDS.map((id) => [id] as const))(
        '%s validates and lowers cleanly',
        async (templateId) => {
          const template = resourcePackTemplates.find((entry) => entry.id === templateId);
          if (template === undefined) throw new Error(`missing ${templateId}`);
          const kind = kindOf(template);
          const id = sampleId(template);
          const data = await template.data(
            contextFor(id, ['demo'], kind.defaultData, bundle.target),
          );
          const indexes = await indexesFor(bundle);
          expect(loadProblems(indexes, kind.schema ?? '', data)).toEqual([]);

          const files = await kind.lower(element(id, kind.id, data), bundle.target);
          const layers =
            kind.id === packMcmetaKind.id ? ['resourcepack', 'datapack'] : ['resourcepack'];
          expect(files.map((file) => file.layer)).toEqual(layers);
          for (const file of files) {
            expect(file.schema).toBe(kind.schema);
            expect(loadProblems(indexes, file.schema ?? '', file.contents as Json)).toEqual([]);
          }
        },
      );
    },
  );
});
