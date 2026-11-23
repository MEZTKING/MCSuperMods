/**
 * The "Villagers and traders" templates of ADR 0098 (`templates/villagers`): on every built-in
 * target each one validates against its kind's schema, reports no problem from any of the
 * plugin's validators once the files it names exist (the model, animation set and pictures
 * derived from its id, and a job's site block), and lowers to schema-valid files compared with
 * `fixtures/<target id>/expected/templates/<id>.json` (`UPDATE_GOLDENS=1` rewrites them).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Element,
  ElementTemplate,
  Json,
  ResourceLocation,
  TargetFacts,
  TemplateContext,
} from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  defaultTradeSets,
  entityKind,
  jobSiteId,
  professionKind,
  professionTextureId,
  VILLAGER_TEMPLATE_CATEGORY,
  villagerTemplates,
} from '../src/index';
import { blockingProblems, element, indexesFor, PROJECT_IDS, sortedJson } from './support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

const IDS = [
  'msm_entity_wandering_merchant',
  'msm_entity_fair_trader',
  'msm_entity_pack_mule',
  'msm_entity_shoulder_pet',
  'msm_villager_profession',
];

const kindOf = (template: ElementTemplate) =>
  template.kind === professionKind.id ? professionKind : entityKind;

function contextFor(template: ElementTemplate, target: TargetFacts): TemplateContext {
  const {
    javaProject: _javaProject,
    loadJavaProject: _loadJavaProject,
    migrateFrom: _migrateFrom,
    ...facts
  } = target as TargetFacts & {
    javaProject?: unknown;
    loadJavaProject?: unknown;
    migrateFrom?: unknown;
  };
  const path = template.defaultName ?? 'sample';
  return {
    id: `demo:${path}`,
    namespace: 'demo',
    path,
    projectNamespace: 'demo',
    namespaces: ['demo'],
    kindDefault: structuredClone(kindOf(template).defaultData),
    target: facts,
  };
}

/** The elements a template's data names, as the user adds them: model, animations, job site. */
function companions(context: TemplateContext): Element[] {
  const own = `${context.namespace}:entity/${context.path}` as ResourceLocation;
  const animations = Object.fromEntries(
    ['idle', 'walk', 'sit'].map((name) => [name, { loop: true, bones: {} }]),
  );
  return [
    element('msm:geo_model', own, {
      format_version: '1.12.0',
      'minecraft:geometry': [
        {
          description: { identifier: 'geometry.x', texture_width: 64, texture_height: 64 },
          bones: [{ name: 'body' }],
        },
      ],
    }),
    element('msm:animation', `${own}_animations` as ResourceLocation, {
      format_version: '1.8.0',
      animations,
    }),
    element('msm:block', jobSiteId(context) as ResourceLocation, { format: 1 }),
  ];
}

describe('villager templates', () => {
  it('has the ids in picker order, contributed after the vehicle templates', () => {
    expect(villagerTemplates.map((template) => template.id)).toEqual(IDS);
    const all = plugin.contributes.elementTemplates?.map((t) => t.id) ?? [];
    const start = all.indexOf(IDS[0] as string);
    expect(all.slice(start, start + IDS.length)).toEqual(IDS);
    for (const template of villagerTemplates) {
      expect(template.category, template.id).toBe(VILLAGER_TEMPLATE_CATEGORY);
      expect(template.title, template.id).not.toBe('');
      expect(template.description, template.id).not.toBe('');
    }
    expect(VILLAGER_TEMPLATE_CATEGORY).toBe('Villagers and traders');
  });

  it('returns fresh data and uses only vanilla ids or ids derived from its own', async () => {
    const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;
    for (const template of villagerTemplates) {
      const context = {
        ...contextFor(template, target),
        id: 'zz:own' as const,
        namespace: 'zz',
        path: 'own',
      };
      const first = await template.data(context);
      const second = await template.data(context);
      expect(second, template.id).toEqual(first);
      expect(second).not.toBe(first);
      const text = JSON.stringify(first)
        .replaceAll(/"msm:[a-z_]+":/g, '')
        .replaceAll(/"zz:(entity|item)\/own(_[a-z_]+)?"/g, '')
        .replaceAll('"zz:own_job_site"', '')
        .replaceAll('"zz:entity/villager/profession/own"', '');
      expect(text, template.id).not.toMatch(
        /"(?!minecraft:|#minecraft:)[a-z0-9_.-]+:[a-z0-9_./-]+"/,
      );
    }
    expect(jobSiteId({ namespace: 'a', path: 'b/c' })).toBe('a:b/c_job_site');
    expect(professionTextureId({ namespace: 'a', path: 'b' })).toBe(
      'a:entity/villager/profession/b',
    );
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'villager templates for %s',
  (targetId, bundle) => {
    it.each(IDS.map((id) => [id] as const))(
      '%s validates, reports no problems and lowers to valid files',
      async (id) => {
        const template = villagerTemplates.find((entry) => entry.id === id) as ElementTemplate;
        const context = contextFor(template, bundle.target);
        const data = await template.data(context);
        const kind = kindOf(template);
        const indexes = await indexesFor(bundle);
        const own = `${context.namespace}:entity/${context.path}`;
        const registry = createRegistryIndex({
          vanilla: indexes.vanilla,
          project: {
            ...PROJECT_IDS,
            entity_type: [...(PROJECT_IDS.entity_type ?? []), context.id],
            item: [...(PROJECT_IDS.item ?? []), `${context.id}_spawn_egg`],
            block: [jobSiteId(context)],
            villager_profession: [context.id],
            // The runtime registers the job site's point of interest under the profession's id.
            point_of_interest_type: [context.id],
            texture: [
              ...(PROJECT_IDS.texture ?? []),
              own,
              `${context.namespace}:item/${context.path}_spawn_egg`,
              professionTextureId(context),
            ],
            model: [
              ...(PROJECT_IDS.model ?? []),
              `${context.namespace}:item/${context.path}_spawn_egg`,
            ],
            // The trade sets and trade tags a profession's lowering creates, as the host's
            // registry index should count them (like spawn eggs).
            trade_set: defaultTradeSets(context.id),
            'tag/villager_trade': defaultTradeSets(context.id),
          },
        });
        const withRegistry = { ...indexes, registries: registry };
        expect(blockingProblems(withRegistry, kind.schema, data)).toEqual([]);
        const created = element(kind.id, context.id, data);
        const problems = (
          await Promise.all(
            (plugin.contributes.validators ?? []).map((validator) =>
              validator.validate({
                elements: [created, ...companions(context)],
                target: bundle.target,
                registry,
              }),
            ),
          )
        ).flat();
        expect(problems).toEqual([]);
        const files = await kind.lower(created, bundle.target);
        for (const file of files) {
          if (file.schema === undefined) continue;
          expect(
            blockingProblems(withRegistry, file.schema, file.contents as Json),
            file.path,
          ).toEqual([]);
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
