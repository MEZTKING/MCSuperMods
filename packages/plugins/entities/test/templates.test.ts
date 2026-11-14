import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  displayName,
  entitiesMobValidators,
  entitiesTemplates,
  entitiesValidators,
  entityKind,
} from '../src/index';
import { blockingProblems, element, indexesFor, sortedJson } from './support';

/** The first target's facts without its hooks: a template context is plain data. */
const {
  javaProject: _javaProject,
  migrateFrom: _migrateFrom,
  ...FIRST_TARGET
} = (builtInTargets[0] as TargetBundle).target;

const UPDATE = process.env.UPDATE_GOLDENS === '1';

const IDS = [
  'msm_entity_creature',
  'msm_entity_monster',
  'msm_entity_ambient',
  'msm_entity_pet',
  'msm_entity_farm_animal',
  'msm_entity_mount',
  'msm_entity_flying',
  'msm_entity_fish',
  'msm_entity_archer',
  'msm_entity_boss',
];

/** The mob templates of ADR 0073 D3, which draw with renderer `auto`. */
const MOB_IDS = IDS.slice(3);

/** Every validator the plugin contributes: the older checks and the mob checks. */
const VALIDATORS = [...entitiesValidators, ...entitiesMobValidators];

/**
 * What the validators report for a fresh template: the model, the animation set and the
 * entity texture are named after the entity and do not exist yet (the descriptions say so).
 * The egg texture is a project texture in the test registry.
 */
const EXPECTED_CODES = [
  'entities.unknown-model',
  'entities.unknown-animations',
  'entities.missing-texture',
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
    kindDefault: structuredClone(entityKind.defaultData),
    target,
  };
}

describe('entities templates', () => {
  it('has the ids in picker order, unique, and contributed by the plugin', () => {
    expect(entitiesTemplates.map((template) => template.id)).toEqual(IDS);
    expect(plugin.contributes.elementTemplates?.map((template) => template.id)).toEqual(IDS);
  });

  it('are msm:entity templates with a title, a description naming the model gap, and a category', () => {
    for (const template of entitiesTemplates) {
      expect(template.kind, template.id).toBe('msm:entity');
      expect(template.title, template.id).not.toBe('');
      expect(template.description, template.id).toContain('reported missing');
      expect(template.category, template.id).toBe('Entities');
    }
    expect(entitiesTemplates.map((t) => t.title)).toEqual([
      'Creature',
      'Monster',
      'Ambient critter',
      'Pet',
      'Farm animal',
      'Mount',
      'Flying creature',
      'Fish',
      'Archer',
      'Boss',
    ]);
    expect(entitiesTemplates).toHaveLength(10);
  });

  it('returns fresh data on every call and never mutates the context', async () => {
    for (const template of entitiesTemplates) {
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
    for (const template of entitiesTemplates) {
      const context = {
        ...contextFor(template),
        id: 'zz:own' as const,
        namespace: 'zz',
        path: 'own',
        projectNamespace: 'zz',
      };
      const text = JSON.stringify(await template.data(context))
        .replaceAll(/"msm:[a-z_]+":/g, '')
        .replaceAll(/"zz:(entity|item)\/own(_[a-z_]+)?"/g, '');
      expect(text, template.id).not.toMatch(
        /"(?!minecraft:|#minecraft:)[a-z0-9_.-]+:[a-z0-9_./-]+"/,
      );
    }
  });

  it('points the animated model at ids derived from the template id', () => {
    const monster = entitiesTemplates[1] as ElementTemplate;
    const data = monster.data({
      ...contextFor(monster),
      id: 'mod:mobs/ghoul',
      namespace: 'mod',
      path: 'mobs/ghoul',
    }) as {
      components: Record<string, unknown>;
      spawn_egg: unknown;
    };
    expect(data.components['msm:animated_model']).toMatchObject({
      model: 'mod:entity/mobs/ghoul',
      animations: 'mod:entity/mobs/ghoul_animations',
      texture: 'mod:entity/mobs/ghoul',
    });
    expect(data.spawn_egg).toEqual({ texture: 'mod:item/mobs/ghoul_spawn_egg' });
    expect(displayName('mobs/ghoul')).toBe('Ghoul');
  });

  it('draws the mob templates with renderer auto and ids derived from the template id', async () => {
    for (const id of MOB_IDS) {
      const template = entitiesTemplates.find((entry) => entry.id === id) as ElementTemplate;
      const data = (await template.data({
        ...contextFor(template),
        id: 'mod:mobs/thing',
        namespace: 'mod',
        path: 'mobs/thing',
      })) as { components: Record<string, unknown> };
      expect(data.components['msm:animated_model'], id).toMatchObject({
        model: 'mod:entity/mobs/thing',
        animations: 'mod:entity/mobs/thing_animations',
        texture: 'mod:entity/mobs/thing',
        renderer: 'auto',
      });
    }
  });

  it('gives swimmers a speed near 1 (B290) and keeps them in a water category', async () => {
    for (const template of entitiesTemplates) {
      const data = (await template.data(contextFor(template))) as {
        category: string;
        components: Record<string, { mode?: string; speed?: number } | undefined>;
      };
      const movement = data.components['msm:movement'];
      if (movement?.mode !== 'swim') continue;
      expect(movement.speed, template.id).toBeGreaterThanOrEqual(0.8);
      expect(movement.speed, template.id).toBeLessThanOrEqual(1.2);
      expect(['water_creature', 'water_ambient'], template.id).toContain(data.category);
    }
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'templates for %s',
  (targetId, bundle) => {
    it.each(IDS.map((id) => [id] as const))(
      '%s validates, lowers to a valid definition and reports only the missing model files',
      async (id) => {
        const template = entitiesTemplates.find((entry) => entry.id === id) as ElementTemplate;
        const context = contextFor(template, bundle.target);
        const data = await template.data(context);
        const indexes = await indexesFor(bundle);
        expect(blockingProblems(indexes, entityKind.schema, data)).toEqual([]);
        const created = element(entityKind.id, context.id, data);
        const problems = (
          await Promise.all(
            VALIDATORS.map((validator) =>
              validator.validate({
                elements: [created],
                target: bundle.target,
                registry: indexes.registries,
              }),
            ),
          )
        ).flat();
        expect(problems.map((problem) => problem.code)).toEqual(EXPECTED_CODES);
        const files = await entityKind.lower(created, bundle.target);
        const definition = files[0];
        expect(definition?.schema).toBe(MSM_SCHEMA_REFS.entityDefinition);
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
