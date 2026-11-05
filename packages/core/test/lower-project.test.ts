import type { ElementKind, Target } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  createElement,
  createEmptyProject,
  ElementKindRegistry,
  lowerProject,
  type Project,
  type ResourceLocation,
} from '../src/index';
import { fixedNow } from './helpers/kinds';

const target: Target = {
  id: 'mc-test',
  mcVersion: 'test',
  channel: 'release',
  java: 25,
  packFormats: { resource: { major: 1, minor: 0 }, data: { major: 1, minor: 0 } },
  mcdocRef: '0'.repeat(40),
  mcmetaRef: 'test',
  folders: {
    resource: {
      model: 'models',
      block_definition: 'blockstates',
      item_definition: 'items',
      lang: 'lang',
      sounds_file: 'sounds.json',
      textures: 'textures',
      atlases: 'atlases',
      font: 'font',
    },
    data: {
      recipe: 'recipe',
      loot_table: 'loot_table',
      advancement: 'advancement',
      predicate: 'predicate',
      item_modifier: 'item_modifier',
      function: 'function',
      tags: 'tags',
      enchantment: 'enchantment',
      damage_type: 'damage_type',
      dimension_type: 'dimension_type',
      chat_type: 'chat_type',
      jukebox_song: 'jukebox_song',
      banner_pattern: 'banner_pattern',
      painting_variant: 'painting_variant',
      trim_material: 'trim_material',
      trim_pattern: 'trim_pattern',
      dialog: 'dialog',
      structure: 'structure',
      dimension: 'dimension',
      worldgen: 'worldgen',
    },
  },
  dataVersion: 1,
  worldgen: { featureSteps: ['raw_generation'] },
};

const modelKind: ElementKind = {
  id: 'test:model',
  schema: '::test::Model',
  folder: 'model',
  lower: (element, t) => {
    const [namespace, path] = element.id.split(':') as [string, string];
    return [
      {
        path: `assets/${namespace}/${t.folders.resource.model}/${path}.json`,
        contents: element.data,
        layer: 'resourcepack',
        schema: 'resource:model',
      },
    ];
  },
};

const fixedPathKind: ElementKind = {
  id: 'test:fixed',
  schema: '::test::Fixed',
  folder: 'fixed',
  lower: (element) => [
    { path: 'pack.mcmeta', contents: { from: element.id }, layer: 'resourcepack' },
    { path: 'data/x.json', contents: {}, layer: 'datapack' },
  ],
};

const throwingKind: ElementKind = {
  id: 'test:throws',
  schema: '::test::Throws',
  folder: 'throws',
  lower: () => {
    throw new Error('boom');
  },
};

function registry(): ElementKindRegistry {
  const result = new ElementKindRegistry();
  for (const kind of [modelKind, fixedPathKind, throwingKind]) result.register(kind);
  return result;
}

function project(elements: { id: ResourceLocation; kind: string }[]): Project {
  const result = createEmptyProject('P');
  const names = [...new Set(elements.map((element) => element.id.split(':')[0] as string))];
  // Deliberately unsorted, to check that lowering orders namespaces and elements itself.
  for (const name of names.reverse()) {
    result.namespaces.push({
      name,
      assets: [],
      elements: elements
        .filter((element) => element.id.startsWith(`${name}:`))
        .reverse()
        .map((element) =>
          createElement({
            id: element.id,
            kind: element.kind,
            data: { v: element.id },
            now: fixedNow,
          }),
        ),
    });
  }
  return result;
}

describe('lowerProject', () => {
  it('lowers every element and sorts files by layer then path, keeping schema', () => {
    const result = lowerProject(
      project([
        { id: 'b:z', kind: 'test:model' },
        { id: 'a:y', kind: 'test:model' },
        { id: 'a:pack', kind: 'test:fixed' },
      ]),
      registry(),
      target,
    );
    expect(result.problems).toEqual([]);
    expect(result.files.map((file) => [file.layer, file.path])).toEqual([
      ['datapack', 'data/x.json'],
      ['resourcepack', 'assets/a/models/y.json'],
      ['resourcepack', 'assets/b/models/z.json'],
      ['resourcepack', 'pack.mcmeta'],
    ]);
    expect(result.files[1]).toEqual({
      path: 'assets/a/models/y.json',
      contents: { v: 'a:y' },
      layer: 'resourcepack',
      schema: 'resource:model',
    });
    expect(result.files[3]?.schema).toBeUndefined();
  });

  it('reports unknown kinds', () => {
    const result = lowerProject(project([{ id: 'a:q', kind: 'other:kind' }]), registry(), target);
    expect(result.files).toEqual([]);
    expect(result.problems).toMatchObject([
      { severity: 'error', code: 'lowering.unknown-kind', elementId: 'a:q' },
    ]);
  });

  it('reports a throwing lower function with its message', () => {
    const result = lowerProject(
      project([
        { id: 'a:bad', kind: 'test:throws' },
        { id: 'a:ok', kind: 'test:model' },
      ]),
      registry(),
      target,
    );
    expect(result.files.map((file) => file.path)).toEqual(['assets/a/models/ok.json']);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatchObject({
      severity: 'error',
      code: 'lowering.failed',
      elementId: 'a:bad',
    });
    expect(result.problems[0]?.message).toContain('boom');
  });

  it('reports same-path conflicts naming both elements and keeps the first', () => {
    const result = lowerProject(
      project([
        { id: 'b:second', kind: 'test:fixed' },
        { id: 'a:first', kind: 'test:fixed' },
      ]),
      registry(),
      target,
    );
    const pack = result.files.find((file) => file.path === 'pack.mcmeta');
    expect(pack?.contents).toEqual({ from: 'a:first' });
    expect(
      result.problems.map((problem) => [problem.code, problem.elementId, problem.file]),
    ).toEqual([
      ['lowering.conflict', 'b:second', 'pack.mcmeta'],
      ['lowering.conflict', 'b:second', 'data/x.json'],
    ]);
    for (const problem of result.problems) {
      expect(problem.message).toContain('a:first');
      expect(problem.message).toContain('b:second');
    }
  });

  it('does not treat the same path in different layers as a conflict', () => {
    const kind: ElementKind = {
      id: 'test:both',
      schema: '::test::Both',
      folder: 'both',
      lower: () => [
        { path: 'same.json', contents: 1, layer: 'resourcepack' },
        { path: 'same.json', contents: 2, layer: 'datapack' },
      ],
    };
    const kinds = new ElementKindRegistry();
    kinds.register(kind);
    const result = lowerProject(project([{ id: 'a:x', kind: 'test:both' }]), kinds, target);
    expect(result.problems).toEqual([]);
    expect(result.files.map((file) => file.layer)).toEqual(['datapack', 'resourcepack']);
  });
});
