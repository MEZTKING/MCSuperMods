/**
 * The "Controls and HUD" templates (ADR 0091 D3): each validates against its schema, lowers to
 * outputs that validate, and passes the validators with no problems on every built-in target in
 * a project with nothing else. The one exception is the Score counter's info that no project
 * file creates its objective, which goes once the objective is created.
 */
import type {
  ElementTemplate,
  Json,
  ResourceLocation,
  TargetFacts,
  TemplateContext,
} from '@msm/plugin-api';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, { controlsKinds, controlsTemplates, controlsValidators } from '../src/index';
import { blockingProblems, element, indexesFor, registryOf } from './support';

const IDS = [
  'msm_key_bind_dash',
  'msm_key_bind_ability',
  'msm_hud_mana_bar',
  'msm_hud_stamina_bar',
  'msm_hud_coordinates',
  'msm_hud_score_counter',
];

const TITLES = [
  'Dash key',
  'Ability key with cooldown',
  'Mana bar',
  'Stamina bar',
  'Coordinates text',
  'Score counter',
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

const kindOf = (template: ElementTemplate) => {
  const kind = controlsKinds.find((entry) => entry.id === template.kind);
  if (kind === undefined) throw new Error(`no kind ${template.kind}`);
  return kind;
};

/** The context the host builds (`app/src/renderer/src/studios/templates.ts`). */
function contextFor(template: ElementTemplate, target: TargetFacts): TemplateContext {
  const path = template.defaultName ?? 'sample';
  return {
    id: `demo:${path}` as ResourceLocation,
    namespace: 'demo',
    path,
    projectNamespace: 'demo',
    namespaces: ['demo'],
    kindDefault: structuredClone(kindOf(template).defaultData),
    target,
  };
}

describe('controls templates', () => {
  it('has the ids and titles in picker order, contributed by the plugin', () => {
    expect(controlsTemplates.map((template) => template.id)).toEqual(IDS);
    expect(controlsTemplates.map((template) => template.title)).toEqual(TITLES);
    expect(plugin.contributes.elementTemplates?.map((template) => template.id)).toEqual(IDS);
    for (const template of controlsTemplates) {
      expect(template.category, template.id).toBe('Controls and HUD');
      expect(template.description, template.id).not.toBe('');
      expect(template.supports, template.id).toBeUndefined();
    }
  });

  it('creates all six in one project without problems once the objective exists', async () => {
    const bundle = builtInTargets[0] as TargetBundle;
    const target = factsOf(bundle);
    const elements = await Promise.all(
      controlsTemplates.map(async (template) => {
        const context = contextFor(template, target);
        return element(template.kind, context.id, await template.data(context));
      }),
    );
    elements.push(
      element('minecraft:function', 'demo:load', {
        lines: ['scoreboard objectives add points dummy'],
      }),
    );
    const registry = registryOf(await indexesFor(bundle));
    for (const validator of controlsValidators) {
      expect(await validator.validate({ elements, target, registry }), validator.id).toEqual([]);
    }
  });

  for (const bundle of builtInTargets) {
    const target = factsOf(bundle);
    describe(target.id, () => {
      for (const template of controlsTemplates) {
        it(`${template.id} validates, passes the validators and lowers cleanly alone`, async () => {
          const context = contextFor(template, target);
          const data = await template.data(context);
          const kind = kindOf(template);
          const indexes = await indexesFor(bundle);
          expect(blockingProblems(indexes, kind.schema, data)).toEqual([]);
          const created = element(kind.id, context.id, data);
          const problems = (
            await Promise.all(
              controlsValidators.map((validator) =>
                validator.validate({ elements: [created], target, registry: registryOf(indexes) }),
              ),
            )
          ).flat();
          const expected =
            template.id === 'msm_hud_score_counter' ? ['controls.unknown-objective'] : [];
          expect(problems.map((problem) => problem.code)).toEqual(expected);
          expect(problems.every((problem) => problem.severity === 'info')).toBe(true);
          for (const file of await kind.lower(created, bundle.target)) {
            if (file.schema === undefined) continue;
            expect(
              blockingProblems(indexes, file.schema, file.contents as Json),
              file.path,
            ).toEqual([]);
          }
        });
      }
    });
  }
});
