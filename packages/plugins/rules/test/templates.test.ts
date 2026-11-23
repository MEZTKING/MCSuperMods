/**
 * The "Rules" templates (ADR 0082 D11): each is a rule book that validates against the schema,
 * passes the validators and compiles with no problems on every built-in target in a project with
 * nothing else, and its generated script type-checks and transpiles to ES5.
 */
import type {
  ElementTemplate,
  ResourceLocation,
  TargetFacts,
  TemplateContext,
  ValidationRegistry,
} from '@msm/plugin-api';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, { compileRuleBook, rulesKind, rulesTemplates, rulesValidators } from '../src/index';
import { blockingProblems, element, indexesFor } from './support';
import { check, ES2015_SYNTAX, transpile, withoutComments } from './ts-check';

const IDS = [
  'msm_rules_welcome_message',
  'msm_rules_jump_pad',
  'msm_rules_lucky_block',
  'msm_rules_healing_spring',
  'msm_rules_click_counter',
  'msm_rules_mob_reward',
];

const TITLES = [
  'Welcome message',
  'Jump pad',
  'Lucky block',
  'Healing spring',
  'Click counter',
  'Mob drops a reward',
];

/** A target's facts without its hooks: a template context is plain data. */
function factsOf(bundle: TargetBundle): TargetFacts {
  const {
    javaProject: _javaProject,
    loadJavaProject: _loadJavaProject,
    migrateFrom: _migrateFrom,
    ...facts
  } = bundle.target;
  return facts;
}

/** The context the host builds (`app/src/renderer/src/studios/templates.ts`). */
function contextFor(target: TargetFacts): TemplateContext {
  return {
    id: 'demo:rules' as ResourceLocation,
    namespace: 'demo',
    path: 'rules',
    projectNamespace: 'demo',
    namespaces: ['demo'],
    kindDefault: structuredClone(rulesKind.defaultData),
    target,
  };
}

const dataOf = (template: ElementTemplate, target: TargetFacts) =>
  template.data(contextFor(target));

describe('rules templates', () => {
  it('has the ids and titles in picker order, contributed by the plugin', () => {
    expect(rulesTemplates.map((template) => template.id)).toEqual(IDS);
    expect(rulesTemplates.map((template) => template.title)).toEqual(TITLES);
    expect(plugin.contributes.elementTemplates?.map((template) => template.id)).toEqual(IDS);
    for (const template of rulesTemplates) {
      expect(template.kind, template.id).toBe('msm:rules');
      expect(template.category, template.id).toBe('Rules');
      expect(template.description, template.id).not.toBe('');
      expect(template.supports, template.id).toBeUndefined();
    }
  });

  for (const bundle of builtInTargets) {
    const target = factsOf(bundle);
    describe(target.id, () => {
      for (const template of rulesTemplates) {
        it(`${template.id} validates and compiles alone`, async () => {
          const data = await dataOf(template, target);
          const indexes = await indexesFor(bundle);
          expect(blockingProblems(indexes, 'msm:rules', data)).toEqual([]);
          const book = element('msm:rules', 'demo:rules', data);
          const registry: ValidationRegistry = {
            has: (name, id) => indexes.registries.has(name, id),
            ids: (name) => indexes.registries.ids(name),
          };
          for (const validator of rulesValidators) {
            expect(await validator.validate({ elements: [book], target, registry })).toEqual([]);
          }
          const compiled = compileRuleBook(book, [], target);
          expect(compiled.problems).toEqual([]);
          expect(compiled.patches).toEqual([]);
          expect(compiled.script).not.toBeNull();
          const source = (compiled.script ?? []).join('\n');
          expect(check(source)).toEqual([]);
          const { js, errors } = transpile(source);
          expect(errors).toEqual([]);
          expect(withoutComments(js)).not.toMatch(ES2015_SYNTAX);
        });
      }
    });
  }
});
