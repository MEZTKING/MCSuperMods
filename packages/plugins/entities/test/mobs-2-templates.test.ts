/**
 * The templates of ADR 0109 and ADR 0107 D5 (`templates/mobs-2`): on every built-in target each
 * one validates against its kind's schema, reports no problem from any of the plugin's
 * validators once the files it names exist (the model, animation set and pictures derived from
 * its id), and lowers to schema-valid files compared with
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
  bucketTextureId,
  entityKind,
  MOB2_TEMPLATE_CATEGORY,
  mob2Templates,
  VILLAGER_TEMPLATE_CATEGORY,
  villagerTypeKind,
  villagerTypeTextureId,
} from '../src/index';
import { blockingProblems, element, indexesFor, PROJECT_IDS, sortedJson } from './support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

const IDS = [
  'msm_entity_bucket_fish',
  'msm_entity_hovering',
  'msm_entity_swooping',
  'msm_entity_phasing',
  'msm_entity_roosting',
  'msm_entity_collector',
  'msm_entity_digger',
  'msm_entity_barterer',
  'msm_entity_dash_mount',
  'msm_villager_type',
];

const kindOf = (template: ElementTemplate) =>
  template.kind === villagerTypeKind.id ? villagerTypeKind : entityKind;

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

/** The model and animation set a mob template names, as the user adds them. */
function companions(context: TemplateContext): Element[] {
  const own = `${context.namespace}:entity/${context.path}` as ResourceLocation;
  const animations = Object.fromEntries(
    ['idle', 'walk', 'fly', 'swim', 'attack'].map((name) => [name, { loop: true, bones: {} }]),
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
  ];
}

describe('ADR 0109 and villager look templates', () => {
  it('has the ids in picker order, contributed last', () => {
    expect(mob2Templates.map((template) => template.id)).toEqual(IDS);
    expect(plugin.contributes.elementTemplates?.slice(-IDS.length).map((t) => t.id)).toEqual(IDS);
    for (const template of mob2Templates) {
      expect(template.category, template.id).toBe(
        template.kind === villagerTypeKind.id ? VILLAGER_TEMPLATE_CATEGORY : MOB2_TEMPLATE_CATEGORY,
      );
      expect(template.title, template.id).not.toBe('');
      expect(template.description, template.id).not.toBe('');
    }
    expect(MOB2_TEMPLATE_CATEGORY).toBe('Entities');
  });

  it('returns fresh data and uses only vanilla ids or ids derived from its own', async () => {
    const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;
    for (const template of mob2Templates) {
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
        .replaceAll(/"zz:entity\/(zombie_)?villager\/type\/own"/g, '');
      expect(text, template.id).not.toMatch(
        /"(?!minecraft:|#minecraft:)[a-z0-9_.-]+:[a-z0-9_./-]+"/,
      );
    }
    expect(bucketTextureId({ namespace: 'a', path: 'b/c' })).toBe('a:item/b/c_bucket');
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'ADR 0109 and villager look templates for %s',
  (targetId, bundle) => {
    it.each(IDS.map((id) => [id] as const))(
      '%s validates, reports no problems and lowers to valid files',
      async (id) => {
        const template = mob2Templates.find((entry) => entry.id === id) as ElementTemplate;
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
            villager_type: [context.id],
            item: [
              ...(PROJECT_IDS.item ?? []),
              `${context.id}_spawn_egg`,
              // The bucket item the runtime registers, as the host's index should count it.
              `${context.id}_bucket`,
            ],
            texture: [
              ...(PROJECT_IDS.texture ?? []),
              own,
              `${context.namespace}:item/${context.path}_spawn_egg`,
              bucketTextureId(context),
              villagerTypeTextureId('villager', context.namespace, context.path),
              villagerTypeTextureId('zombie_villager', context.namespace, context.path),
            ],
            model: [
              ...(PROJECT_IDS.model ?? []),
              `${context.namespace}:item/${context.path}_spawn_egg`,
              `${context.namespace}:item/${context.path}_bucket`,
            ],
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
