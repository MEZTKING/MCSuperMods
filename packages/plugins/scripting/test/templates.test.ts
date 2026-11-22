import type {
  ElementTemplate,
  Json,
  ResourceLocation,
  TargetFacts,
  TemplateContext,
} from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  commandKind,
  commandTemplates,
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
  'msm_script_full_set_bonus',
  'msm_script_boss_bar_countdown',
];

const COMMAND_IDS = [
  'msm_command_help',
  'msm_command_hop',
  'msm_creative_tab',
  'msm_creative_tab_by_hand',
];

const GAME_RULE_IDS = [
  'msm_game_rule_switch',
  'msm_game_rule_number',
  'msm_stat_counter',
  'msm_stat_time',
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
    expect(plugin.contributes.elementTemplates?.map((template) => template.id)).toEqual([
      ...IDS,
      ...COMMAND_IDS,
      ...GAME_RULE_IDS,
    ]);
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
      'Full set bonus',
      'Boss bar countdown',
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

describe('command and creative tab templates', () => {
  it('are msm:command and msm:creative_tab templates with a title, a description and a category', () => {
    expect(commandTemplates.map((template) => template.id)).toEqual(COMMAND_IDS);
    expect(commandTemplates.map((template) => [template.kind, template.category])).toEqual([
      ['msm:command', 'Commands'],
      ['msm:command', 'Commands'],
      ['msm:creative_tab', 'Creative tabs'],
      ['msm:creative_tab', 'Creative tabs'],
    ]);
    for (const template of commandTemplates) {
      expect(template.title, template.id).not.toBe('');
      expect(template.description, template.id).not.toBe('');
    }
  });

  it('return fresh data, never mutate the context and name only vanilla ids', async () => {
    for (const template of commandTemplates) {
      const context = { ...contextFor(template), id: 'zz:own' as const, path: 'own' };
      const before = structuredClone(context);
      const first = await template.data(context);
      const second = await template.data(context);
      expect(second, template.id).toEqual(first);
      expect(second).not.toBe(first);
      expect(context, template.id).toEqual(before);
      expect(JSON.stringify(first), template.id).not.toMatch(
        /"(?!minecraft:)[a-z0-9_.-]+:[a-z0-9_./-]+"/,
      );
    }
  });

  it('derives the command word from the element path', async () => {
    const help = commandTemplates[0] as ElementTemplate;
    const data = (await help.data({
      ...contextFor(help),
      id: 'mod:Tools/My-Help',
      path: 'Tools/My-Help',
    })) as {
      name: string;
    };
    expect(data.name).toBe('my_help');
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'command templates for %s',
  (_targetId, bundle) => {
    it.each(COMMAND_IDS.slice(0, 2).map((id) => [id] as const))(
      '%s validates, passes the validators and lowers',
      async (id) => {
        const template = commandTemplates.find((entry) => entry.id === id) as ElementTemplate;
        const context = {
          ...contextFor(template, bundle.target),
          kindDefault: structuredClone(commandKind.defaultData),
        };
        const data = await template.data(context);
        const indexes = await indexesFor(bundle);
        expect(blockingProblems(indexes, commandKind.schema, data)).toEqual([]);
        const created = element(commandKind.id, context.id, data);
        const problems = (
          await Promise.all(
            (plugin.contributes.validators ?? []).map((validator) =>
              validator.validate({
                elements: [created],
                target: bundle.target,
                registry: indexes.registries,
              }),
            ),
          )
        ).flat();
        expect(problems).toEqual([]);
        const files = await commandKind.lower(created, bundle.target);
        expect(files.map((file) => file.path)).toEqual([
          `msm/demo/command/${context.path}.json`,
          'assets/demo/lang/en_us.json',
        ]);
      },
    );

    it.each(COMMAND_IDS.slice(2).map((id) => [id] as const))(
      '%s fits the tab schema',
      async (id) => {
        const template = commandTemplates.find((entry) => entry.id === id) as ElementTemplate;
        const data = await template.data(contextFor(template, bundle.target));
        const indexes = await indexesFor(bundle);
        expect(blockingProblems(indexes, MSM_SCHEMA_REFS.creativeTab, data)).toEqual([]);
      },
    );
  },
);
