import { readdir, readFile } from 'node:fs/promises';
import type {
  ElementTemplate,
  Json,
  ResourceLocation,
  TargetFacts,
  TemplateContext,
} from '@msm/plugin-api';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  readNbt,
  structureKinds,
  structureTemplateFromNbt,
  structureTemplates,
  structureValidators,
} from '../src/index';
import { blockingProblems, indexesFor } from './support';

/** The first target's facts without its hooks: a template context is plain data. */
const {
  javaProject: _javaProject,
  migrateFrom: _migrateFrom,
  ...FIRST_TARGET
} = (builtInTargets[0] as TargetBundle).target;

/** The nine template ids, in picker order (plan D9). */
const IDS = [
  'structure_template_platform',
  'structure_template_jigsaw_hut',
  'structure_template_path',
  'template_pool',
  'template_pool_terminators',
  'structure_jigsaw',
  'structure_set_random_spread',
  'processor_list_mossify_rot',
  'processor_list_block_ignore',
];

const NAMESPACES = ['demo'] as const;

const kindOf = (template: ElementTemplate) => {
  const kind = structureKinds.find((entry) => entry.id === template.kind);
  if (kind === undefined) throw new Error(`no kind ${template.kind}`);
  return kind;
};

/** The context the host builds for a new element `demo:sample`. */
function contextFor(
  template: ElementTemplate,
  projectNamespace = 'demo',
  target: TargetFacts = FIRST_TARGET,
): TemplateContext {
  const id: ResourceLocation = `${template.defaultNamespace ?? 'demo'}:${template.prefix ?? ''}${template.defaultName ?? 'sample'}`;
  const colon = id.indexOf(':');
  const kindDefault = kindOf(template).defaultData;
  return {
    id,
    namespace: id.slice(0, colon),
    path: id.slice(colon + 1),
    projectNamespace,
    namespaces: [...NAMESPACES],
    kindDefault: kindDefault === undefined ? undefined : structuredClone(kindDefault),
    target,
  };
}

describe('structures templates', () => {
  it('has the nine ids in picker order, unique, and contributed by the plugin', () => {
    expect(structureTemplates.map((template) => template.id)).toEqual(IDS);
    expect(new Set(IDS).size).toBe(IDS.length);
    expect(plugin.contributes.elementTemplates?.map((template) => template.id)).toEqual(IDS);
  });

  it('creates only kinds this plugin registers, and covers every kind', () => {
    const kinds = new Set(structureKinds.map((kind) => kind.id));
    expect(new Set(structureTemplates.map((template) => template.kind))).toEqual(kinds);
    for (const template of structureTemplates) {
      expect(template.category, template.id).toBe('Structures');
      expect(template.title, template.id).not.toBe('');
      expect(template.description, template.id).not.toBe('');
    }
  });

  it('returns fresh data on every call and never mutates the context', async () => {
    for (const template of structureTemplates) {
      const context = contextFor(template);
      const before = structuredClone(context);
      const first = await template.data(context);
      const second = await template.data(context);
      expect(second, template.id).toEqual(first);
      expect(second).not.toBe(first);
      expect(context, template.id).toEqual(before);
    }
  });

  it('uses no namespace literal except vanilla and the element id', () => {
    for (const template of structureTemplates) {
      const context = contextFor(template, 'zz');
      const text = JSON.stringify(template.data(context)).replaceAll(context.id, '');
      expect(text, template.id).not.toMatch(/\b(demo|example|my_project|zz):/);
    }
  });

  it('chains by name: a template, pool, structure and set made under one id pass the validators', async () => {
    const kinds: Record<string, string> = {
      structure_template_path: 'minecraft:structure_template',
      template_pool: 'minecraft:worldgen/template_pool',
      structure_jigsaw: 'minecraft:worldgen/structure',
      structure_set_random_spread: 'minecraft:worldgen/structure_set',
    };
    const elements = await Promise.all(
      Object.entries(kinds).map(async ([templateId, kind]) => {
        const template = structureTemplates.find((entry) => entry.id === templateId);
        if (template === undefined) throw new Error(templateId);
        return {
          formatVersion: 1,
          id: 'demo:sample' as const,
          kind,
          data: await template.data(contextFor(template)),
          meta: { createdAt: '2026-01-01T00:00:00.000Z' },
        };
      }),
    );
    const target = (builtInTargets[0] as TargetBundle).target;
    const registry = { has: () => true, ids: () => [] };
    const problems = (
      await Promise.all(
        structureValidators.map((validator) => validator.validate({ elements, target, registry })),
      )
    ).flat();
    expect(problems).toEqual([]);
  });

  it('keeps src free of @msm/targets and @msm/core imports', async () => {
    const root = new URL('../src/', import.meta.url);
    const files = (await readdir(root, { recursive: true })).filter((file) => file.endsWith('.ts'));
    for (const file of files) {
      const text = await readFile(new URL(file, root), 'utf8');
      expect(text, file).not.toMatch(/from '@msm\/(targets|target-|core)/);
    }
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'structures templates for %s',
  (_targetId, bundle: TargetBundle) => {
    it.each(structureTemplates.map((template) => [template.id, template] as const))(
      '%s validates and lowers cleanly',
      async (_id, template) => {
        const indexes = await indexesFor(bundle);
        const kind = kindOf(template);
        const context = contextFor(template, 'demo', bundle.target);
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
        if (file.contents instanceof Uint8Array) {
          const back = structureTemplateFromNbt(readNbt(file.contents).root);
          expect(back.data).toEqual(data);
          expect(back.problems).toEqual([]);
        } else {
          expect(blockingProblems(indexes, file.schema ?? '', file.contents as Json)).toEqual([]);
        }
      },
    );
  },
);
