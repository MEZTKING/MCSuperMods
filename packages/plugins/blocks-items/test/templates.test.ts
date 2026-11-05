import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElementTemplate, Json, ResourceLocation, TemplateContext } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  blocksItemsKinds,
  blocksItemsTemplates,
  blocksItemsValidators,
  MOD_ID_PATTERN,
  modIdFromNamespace,
} from '../src/index';
import { blockingProblems, element, indexesFor, sortedJson } from './support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

const IDS = [
  'msm_block_simple',
  'msm_block_glowing_ore',
  'msm_block_interactive',
  'msm_item_food',
  'msm_item_tool',
  'msm_item_wand',
  'msm_mod',
];
const CATEGORIES = new Set(['Blocks', 'Items', 'Mod']);

const kindOf = (template: ElementTemplate) => {
  const kind = blocksItemsKinds.find((entry) => entry.id === template.kind);
  if (kind === undefined) throw new Error(`no kind ${template.kind}`);
  return kind;
};

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

describe('blocks-items templates', () => {
  it('has the ids in picker order, unique, and contributed by the plugin', () => {
    expect(blocksItemsTemplates.map((template) => template.id)).toEqual(IDS);
    expect(plugin.contributes.elementTemplates?.map((template) => template.id)).toEqual(IDS);
  });

  it('covers every kind with a title, description and category', () => {
    expect(new Set(blocksItemsTemplates.map((t) => t.kind))).toEqual(
      new Set(blocksItemsKinds.map((kind) => kind.id)),
    );
    for (const template of blocksItemsTemplates) {
      expect(template.title, template.id).not.toBe('');
      expect(template.description, template.id).not.toBe('');
      expect(CATEGORIES.has(template.category), template.id).toBe(true);
    }
  });

  it('returns fresh data on every call and never mutates the context', () => {
    for (const template of blocksItemsTemplates) {
      const context = contextFor(template);
      const before = structuredClone(context);
      const first = template.data(context);
      const second = template.data(context);
      expect(second, template.id).toEqual(first);
      expect(second).not.toBe(first);
      expect(context, template.id).toEqual(before);
    }
  });

  it('uses only vanilla ids or ids derived from the new element id', () => {
    for (const template of blocksItemsTemplates) {
      const context = { ...contextFor(template), id: 'zz:own' as const, projectNamespace: 'zz' };
      // Component keys (`"msm:breakable":`) are format names, not ids.
      const text = JSON.stringify(template.data(context))
        .replaceAll(/"msm:[a-z_]+":/g, '')
        .replaceAll(/"zz:own(_[a-z]+)?"/g, '');
      expect(text, template.id).not.toMatch(/"(?!minecraft:)[a-z0-9_.-]+:[a-z0-9_./-]+"/);
    }
  });

  it('derives a valid mod id from any namespace', () => {
    for (const namespace of ['demo', 'my.pack', '1st', 'x', 'a'.repeat(80)]) {
      expect(modIdFromNamespace(namespace), namespace).toMatch(MOD_ID_PATTERN);
    }
    expect(modIdFromNamespace('my.pack')).toBe('my_pack');
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'templates for %s',
  (targetId, bundle) => {
    it.each(IDS.map((id) => [id] as const))(
      '%s validates, passes the validators and lowers cleanly',
      async (id) => {
        const template = blocksItemsTemplates.find((entry) => entry.id === id) as ElementTemplate;
        const context = contextFor(template);
        const data = template.data(context);
        const kind = kindOf(template);
        const indexes = await indexesFor(bundle);
        expect(blockingProblems(indexes, kind.schema, data)).toEqual([]);
        const created = element(kind.id, context.id, data);
        const problems = blocksItemsValidators.flatMap((validator) =>
          validator.validate({
            elements: [created],
            target: bundle.target,
            registry: indexes.registries,
          }),
        );
        expect(problems).toEqual([]);
        const files = kind.lower(created, bundle.target);
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
