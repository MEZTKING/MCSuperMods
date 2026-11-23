/**
 * Made-up hosts, flows, a mod and hits for the search preview's tests (B665).
 */

import {
  createElement,
  createEmptyProject,
  type Element,
  type Json,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import type {
  ContentBundle,
  ElementTemplate,
  ExampleProject,
  ProjectStarter,
  Target,
} from '@msm/plugin-api';
import type { SearchHit } from '@msm/search';
import { defaultTargetId, targetById } from '@msm/targets';
import type { ResultPreviewHost } from '../../../src/renderer/src/search/ResultPreview';
import { entry, hit } from './panel-fixtures';

export const TARGET = targetById(defaultTargetId)?.target as Target;

export const FOLDERS = TARGET.folders.resource;

/** A one-by-one transparent PNG. */
export const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (char) => char.charCodeAt(0),
);

/** A bundle of one item named `name`, with its picture. */
export function itemBundle(namespace: string, name: string): ContentBundle {
  const path = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return {
    elements: [
      {
        id: `${namespace}:${path}` as ResourceLocation,
        kind: 'msm:item',
        data: { format: 1, display_name: name, texture: `${namespace}:item/${path}` } as Json,
      },
    ],
    assets: [{ namespace, path: `textures/item/${path}.png`, bytes: PNG }],
  };
}

/** A made-up flow whose build is `build` (by default one item named by `sword_name`). */
export function fakeFlow(
  id: string,
  build?: ProjectStarter['build'],
  extra: Partial<ProjectStarter> = {},
): ProjectStarter {
  return {
    id,
    title: `Flow ${id}`,
    description: 'A made-up flow.',
    requiresKinds: [],
    parameters: [
      { id: 'sword_name', label: 'Name', type: 'string', default: 'Ruby Sword' },
      { id: 'power', label: 'Power', type: 'number', default: 2, min: 1, max: 10 },
    ],
    creator: { group: 'items' },
    build:
      build ??
      ((context) => itemBundle(context.namespace, String(context.values.sword_name ?? 'Sword'))),
    ...extra,
  } as ProjectStarter;
}

export function fakeExample(id: string): ExampleProject {
  return {
    id,
    title: `Example ${id}`,
    description: 'A made-up example.',
    kind: 'msm:item',
    category: 'Items',
    requiresKinds: [],
    build: (context) => itemBundle(context.namespace, 'Example Gem'),
  } as ExampleProject;
}

export const TEMPLATE_ITEM: ElementTemplate = {
  id: 'blocks-items.item',
  kind: 'msm:item',
  title: 'Item',
  description: 'An item.',
  category: 'Items',
  defaultName: 'ruby',
  data: (context) => ({
    format: 1,
    display_name: 'Ruby',
    texture: `${context.namespace}:item/ruby`,
  }),
};

function element(id: string, kind: string, data: Json): Element {
  return createElement({
    id: id as ResourceLocation,
    kind,
    data,
    now: () => '2026-11-23T00:00:00.000Z',
  });
}

/** A small mod: an item with a model, a recipe-less thing, a rule book and a picture. */
export function smallMod(): Project {
  const project = createEmptyProject('Demo', { targets: [defaultTargetId] });
  return {
    ...project,
    namespaces: [
      {
        name: 'demo',
        elements: [
          element('demo:ruby', 'msm:item', {
            format: 1,
            display_name: 'Ruby',
            model: 'minecraft:item/emerald',
          }),
          element('demo:notes', 'minecraft:lang', { 'item.demo.ruby': 'Ruby' }),
          element('demo:ruby_rules', 'msm:rules', {
            counters: [],
            format: 1,
            rules: [
              {
                name: 'Ruby boom',
                when: { trigger: 'block_broken', subject: 'demo:ruby' },
                only_if: { conditions: [{ condition: 'is_raining' }] },
                do: [{ step: 'explode', power: 3 }],
              },
            ],
          }),
        ],
        assets: [{ path: 'textures/item/ruby.png' }],
      },
    ],
  } as unknown as Project;
}

export function host(extra: Partial<ResultPreviewHost> = {}): ResultPreviewHost {
  return {
    mode: 'easy',
    target: TARGET,
    library: { starters: [], templates: [TEMPLATE_ITEM], examples: [] },
    isKnownKind: () => true,
    previewKindOf: () => undefined,
    project: null,
    folders: FOLDERS,
    readProjectAsset: async () => null,
    vanilla: null,
    ...extra,
  };
}

/** A hit of `entryId` with the preview `preview`. */
export function previewHit(
  entryId: string,
  source: Parameters<typeof entry>[1],
  title: string,
  preview: Record<string, Json>,
  extra: Partial<SearchHit> & { sentence?: string; available?: boolean; reason?: string } = {},
): SearchHit {
  const { sentence, available, reason, ...rest } = extra;
  return hit(
    entry(entryId, source, title, {
      preview: preview as never,
      action: preview as never,
      ...(sentence === undefined ? {} : { sentence }),
      ...(available === false
        ? { available: false, ...(reason === undefined ? {} : { unavailableReason: reason }) }
        : {}),
    }),
    rest,
  );
}

/** A promise with its resolve and reject in hand. */
export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
