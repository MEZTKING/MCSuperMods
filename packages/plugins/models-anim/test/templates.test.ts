import type {
  Element,
  ElementTemplate,
  Json,
  ResourceLocation,
  TemplateContext,
} from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  ANIMATION_KIND,
  GEO_MODEL_KIND,
  modelsAnimKinds,
  modelsAnimTemplates,
  modelsAnimValidators,
} from '../src/index';
import { blockingProblems, element, indexesFor } from './support';

const IDS = ['msm_geo_model_cube_creature', 'msm_geo_model_biped', 'msm_animation_idle_walk'];
const CATEGORIES = new Set(['Entity models', 'Entity animations']);

const kindOf = (template: ElementTemplate) => {
  const kind = modelsAnimKinds.find((entry) => entry.id === template.kind);
  if (kind === undefined) throw new Error(`no kind ${template.kind}`);
  return kind;
};

const templateById = (id: string): ElementTemplate =>
  modelsAnimTemplates.find((entry) => entry.id === id) as ElementTemplate;

function elementId(template: ElementTemplate): ResourceLocation {
  const namespace = template.defaultNamespace ?? 'demo';
  const name = template.defaultName ?? 'sample';
  const prefix = template.prefix ?? '';
  return `${namespace}:${name.startsWith(prefix) ? name : `${prefix}${name}`}`;
}

/** The context the host builds (`app/src/renderer/src/studios/templates.ts`). */
function contextFor(template: ElementTemplate): TemplateContext {
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
  };
}

const created = (template: ElementTemplate): Element => {
  const context = contextFor(template);
  return element(template.kind, context.id, template.data(context));
};

/** The bone names of a geo model template's first geometry. */
function boneNames(template: ElementTemplate): string[] {
  const data = template.data(contextFor(template)) as {
    'minecraft:geometry': { bones: { name: string }[] }[];
  };
  return (data['minecraft:geometry'][0]?.bones ?? []).map((bone) => bone.name);
}

describe('models-anim templates', () => {
  it('has the ids in picker order, unique, and contributed by the plugin', () => {
    expect(modelsAnimTemplates.map((template) => template.id)).toEqual(IDS);
    expect(plugin.contributes.elementTemplates?.map((template) => template.id)).toEqual(IDS);
  });

  it('covers every kind with a title, description, category and the entity/ prefix', () => {
    expect(new Set(modelsAnimTemplates.map((t) => t.kind))).toEqual(
      new Set(modelsAnimKinds.map((kind) => kind.id)),
    );
    for (const template of modelsAnimTemplates) {
      expect(template.title, template.id).not.toBe('');
      expect(template.description, template.id).not.toBe('');
      expect(CATEGORIES.has(template.category), template.id).toBe(true);
      expect(template.prefix, template.id).toBe('entity/');
    }
  });

  it('returns fresh data on every call and never mutates the context', () => {
    for (const template of modelsAnimTemplates) {
      const context = contextFor(template);
      const before = structuredClone(context);
      const first = template.data(context);
      const second = template.data(context);
      expect(second, template.id).toEqual(first);
      expect(second).not.toBe(first);
      expect(context, template.id).toEqual(before);
    }
  });

  it('names its geometry after the element id and uses no resource ids', () => {
    const model = templateById('msm_geo_model_biped');
    const context = { ...contextFor(model), id: 'zz:entity/own' as const, path: 'entity/own' };
    expect(JSON.stringify(model.data(context))).toContain('"identifier":"geometry.own"');
    for (const template of modelsAnimTemplates) {
      const text = JSON.stringify(template.data(contextFor(template))).replaceAll(
        '"minecraft:geometry":',
        '',
      );
      expect(text, template.id).not.toMatch(/"[a-z0-9_.-]+:[a-z0-9_./-]+"/);
    }
  });

  it('has the bones the brief asks for, and animations on the biped bones', () => {
    expect(boneNames(templateById('msm_geo_model_cube_creature'))).toEqual(['body', 'head']);
    const biped = boneNames(templateById('msm_geo_model_biped'));
    expect(biped).toEqual(['body', 'head', 'right_arm', 'left_arm', 'right_leg', 'left_leg']);
    const animations = templateById('msm_animation_idle_walk').data(
      contextFor(templateById('msm_animation_idle_walk')),
    ) as { animations: Record<string, { loop: Json; bones: Record<string, Json> }> };
    expect(Object.keys(animations.animations)).toEqual(['idle', 'walk']);
    for (const animation of Object.values(animations.animations)) {
      expect(animation.loop).toBe(true);
      for (const bone of Object.keys(animation.bones)) expect(biped).toContain(bone);
    }
    expect(Object.keys(animations.animations.walk?.bones ?? {})).toEqual(
      expect.arrayContaining(['right_leg', 'left_leg']),
    );
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'templates for %s',
  (_targetId, bundle) => {
    it.each(IDS.map((id) => [id] as const))(
      '%s validates, passes the validators and lowers cleanly',
      async (id) => {
        const template = templateById(id);
        const kind = kindOf(template);
        const subject = created(template);
        const indexes = await indexesFor(bundle);
        expect(blockingProblems(indexes, kind.schema, subject.data)).toEqual([]);
        // Animations are checked next to the biped model whose bones they move.
        const elements =
          template.kind === ANIMATION_KIND
            ? [
                element(
                  GEO_MODEL_KIND,
                  'demo:entity/biped',
                  templateById('msm_geo_model_biped').data(
                    contextFor(templateById('msm_geo_model_biped')),
                  ),
                ),
                subject,
              ]
            : [subject];
        const problems = modelsAnimValidators.flatMap((validator) =>
          validator.validate({ elements, target: bundle.target, registry: indexes.registries }),
        );
        expect(problems).toEqual([]);
        const files = kind.lower(subject, bundle.target);
        expect(files).toHaveLength(1);
        for (const file of files) {
          expect(file.schema).toBe(kind.schema);
          expect(file.path).toMatch(
            template.kind === ANIMATION_KIND
              ? /^assets\/demo\/geckolib\/animations\/entity\/sample\.animation\.json$/
              : /^assets\/demo\/geckolib\/models\/entity\/sample\.geo\.json$/,
          );
          expect(blockingProblems(indexes, file.schema as string, file.contents as Json)).toEqual(
            [],
          );
        }
      },
    );
  },
);
