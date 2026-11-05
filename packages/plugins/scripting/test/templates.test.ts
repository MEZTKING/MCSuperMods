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
  findHandlerDefinitions,
  scriptingTemplates,
  scriptingValidators,
  scriptKind,
} from '../src/index';
import { blockingProblems, element, indexesFor, syntaxErrors, typeCheck } from './support';

/** The first target's facts without its hooks: a template context is plain data. */
const {
  javaProject: _javaProject,
  migrateFrom: _migrateFrom,
  ...FIRST_TARGET
} = (builtInTargets[0] as TargetBundle).target;

const IDS = [
  'msm_script_block_interaction',
  'msm_script_entity_hurt',
  'msm_script_scheduled_effect',
  'msm_script_action_handler',
];

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
  return {
    id,
    namespace: id.slice(0, colon),
    path: id.slice(colon + 1),
    projectNamespace: 'demo',
    namespaces: ['demo'],
    kindDefault: structuredClone(scriptKind.defaultData),
    target,
  };
}

const textOf = (data: Json): string => `${(data as { lines: string[] }).lines.join('\n')}\n`;

describe('scripting templates', () => {
  it('has the ids in picker order, unique, and contributed by the plugin', () => {
    expect(scriptingTemplates.map((template) => template.id)).toEqual(IDS);
    expect(plugin.contributes.elementTemplates?.map((template) => template.id)).toEqual(IDS);
  });

  it('are msm:script templates with a title, a description and a category', () => {
    for (const template of scriptingTemplates) {
      expect(template.kind, template.id).toBe('msm:script');
      expect(template.description, template.id).not.toBe('');
      expect(template.category, template.id).toBe('Scripts');
    }
    expect(scriptingTemplates.map((t) => t.title)).toEqual([
      'Block interaction script',
      'Entity hurt script',
      'Scheduled effect script',
      'Action handler script',
    ]);
    expect(scriptingTemplates[3]?.description).toContain('run_script');
  });

  it('returns fresh data on every call and never mutates the context', async () => {
    for (const template of scriptingTemplates) {
      const context = contextFor(template);
      const before = structuredClone(context);
      const first = await template.data(context);
      const second = await template.data(context);
      expect(second, template.id).toEqual(first);
      expect(second).not.toBe(first);
      expect(context, template.id).toEqual(before);
    }
  });

  it('uses only vanilla ids or the new element id', async () => {
    for (const template of scriptingTemplates) {
      const context = {
        ...contextFor(template),
        id: 'zz:own' as const,
        namespace: 'zz',
        path: 'own',
        projectNamespace: 'zz',
      };
      const text = textOf(await template.data(context))
        .replaceAll('"msm:runtime"', '')
        .replaceAll('"zz:own"', '');
      expect(text, template.id).not.toMatch(/"(?!minecraft:)[a-z0-9_.-]+:[a-z0-9_./-]+"/);
    }
  });

  it('defines the new element id as the action handler', () => {
    const handler = scriptingTemplates[3] as ElementTemplate;
    const data = handler.data({ ...contextFor(handler), id: 'mod:fx/sparkle' }) as {
      lines: string[];
    };
    expect(findHandlerDefinitions(data.lines).map((d) => d.handler)).toEqual(['mod:fx/sparkle']);
  });

  it.each(IDS.map((id) => [id] as const))(
    '%s parses and type-checks against the typings',
    async (id) => {
      const template = scriptingTemplates.find((entry) => entry.id === id) as ElementTemplate;
      const created = element(
        scriptKind.id,
        'demo:sample',
        await template.data(contextFor(template)),
      );
      const [file] = await scriptKind.lower(created, builtInTargets[0]?.target as never);
      const text = new TextDecoder().decode(file?.contents as Uint8Array);
      expect(text).toBe(textOf(created.data));
      expect(syntaxErrors(text)).toEqual([]);
      expect(typeCheck(text)).toEqual([]);
    },
  );
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'templates for %s',
  (_targetId, bundle) => {
    it.each(IDS.map((id) => [id] as const))(
      '%s validates and the validators report nothing',
      async (id) => {
        const template = scriptingTemplates.find((entry) => entry.id === id) as ElementTemplate;
        const context = contextFor(template, bundle.target);
        const data = await template.data(context);
        const indexes = await indexesFor(bundle);
        expect(blockingProblems(indexes, scriptKind.schema, data)).toEqual([]);
        const created = element(scriptKind.id, context.id, data);
        const problems = (
          await Promise.all(
            scriptingValidators.map((validator) =>
              validator.validate({
                elements: [created],
                target: bundle.target,
                registry: indexes.registries,
              }),
            ),
          )
        ).flat();
        expect(problems).toEqual([]);
        const files = await scriptKind.lower(created, bundle.target);
        expect(files.map((file) => [file.path, file.layer, file.language])).toEqual([
          ['msm/demo/script/sample.ts', 'msm', 'typescript'],
        ]);
      },
    );
  },
);
