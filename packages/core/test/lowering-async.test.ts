import type { ElementKind, OutputFile } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  AsyncResultError,
  createElement,
  createEmptyProject,
  ElementKindRegistry,
  lowerProject,
  lowerProjectAsync,
  type Project,
  ProblemCodes,
  type ResourceLocation,
  requireSyncResult,
} from '../src/index';
import { fixedNow } from './helpers/kinds';
import { testTarget as target } from './helpers/target';

function modelFile(id: string, folder: string, contents: OutputFile['contents']): OutputFile {
  const [namespace, path] = id.split(':') as [string, string];
  return {
    path: `assets/${namespace}/${folder}/${path}.json`,
    contents,
    layer: 'resourcepack',
    schema: 'resource:model',
  };
}

const syncKind: ElementKind = {
  id: 'test:sync',
  schema: '::test::Sync',
  folder: 'sync',
  lower: (element, t) => [modelFile(element.id, t.folders.resource.model, element.data)],
};

/** Resolves after a delay that shrinks with the id, so late elements finish first. */
const asyncKind: ElementKind = {
  id: 'test:async',
  schema: '::test::Async',
  folder: 'async',
  lower: (element, t) =>
    new Promise((resolve) => {
      const delay = element.id.endsWith('a') ? 15 : 1;
      setTimeout(
        () => resolve([modelFile(element.id, t.folders.resource.model, element.data)]),
        delay,
      );
    }),
};

const rejectingKind: ElementKind = {
  id: 'test:rejects',
  schema: '::test::Rejects',
  folder: 'rejects',
  lower: () => Promise.reject(new Error('worker crashed')),
};

const throwingKind: ElementKind = {
  id: 'test:throws',
  schema: '::test::Throws',
  folder: 'throws',
  lower: () => {
    throw new Error('boom');
  },
};

const mergingKind: ElementKind = {
  id: 'test:lang',
  schema: '::test::Lang',
  folder: 'lang',
  lower: async (element) => [
    {
      path: 'assets/x/lang/en_us.json',
      contents: element.data,
      layer: 'resourcepack',
      merge: 'object',
    },
  ],
};

function registry(): ElementKindRegistry {
  const result = new ElementKindRegistry();
  for (const kind of [syncKind, asyncKind, rejectingKind, throwingKind, mergingKind]) {
    result.register(kind);
  }
  return result;
}

function project(
  elements: { id: ResourceLocation; kind: string; data?: OutputFile['contents'] }[],
): Project {
  const result = createEmptyProject('P');
  const names = [...new Set(elements.map((element) => element.id.split(':')[0] as string))];
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
            data: (element.data as never) ?? { v: element.id },
            now: fixedNow,
          }),
        ),
    });
  }
  return result;
}

describe('lowerProjectAsync', () => {
  it('awaits asynchronous kinds and keeps the synchronous result shape and order', async () => {
    const input = project([
      { id: 'b:z', kind: 'test:sync' },
      { id: 'a:a', kind: 'test:async' },
      { id: 'a:b', kind: 'test:async' },
    ]);
    const result = await lowerProjectAsync(input, registry(), target);
    expect(result.problems).toEqual([]);
    expect(result.files.map((file) => file.path)).toEqual([
      'assets/a/models/a.json',
      'assets/a/models/b.json',
      'assets/b/models/z.json',
    ]);
    expect(result.files[0]).toEqual(modelFile('a:a', 'models', { v: 'a:a' }));
  });

  it('matches lowerProject for synchronous kinds', async () => {
    const input = project([
      { id: 'b:z', kind: 'test:sync' },
      { id: 'a:bad', kind: 'test:throws' },
      { id: 'a:q', kind: 'other:kind' },
      { id: 'a:y', kind: 'test:sync' },
    ]);
    const asyncResult = await lowerProjectAsync(input, registry(), target);
    expect(asyncResult).toEqual(lowerProject(input, registry(), target));
    expect(asyncResult.problems.map((problem) => [problem.code, problem.elementId])).toEqual([
      ['lowering.failed', 'a:bad'],
      ['lowering.unknown-kind', 'a:q'],
    ]);
  });

  it('reports a rejected lower as lowering.failed with its message', async () => {
    const result = await lowerProjectAsync(
      project([
        { id: 'a:bad', kind: 'test:rejects' },
        { id: 'a:ok', kind: 'test:sync' },
      ]),
      registry(),
      target,
    );
    expect(result.files.map((file) => file.path)).toEqual(['assets/a/models/ok.json']);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatchObject({
      severity: 'error',
      code: ProblemCodes.loweringFailed,
      elementId: 'a:bad',
    });
    expect(result.problems[0]?.message).toContain('worker crashed');
  });

  it('merges asynchronous outputs that declare a merge mode', async () => {
    const result = await lowerProjectAsync(
      project([
        { id: 'x:one', kind: 'test:lang', data: { 'a.b': 'A' } },
        { id: 'x:two', kind: 'test:lang', data: { 'c.d': 'C' } },
      ]),
      registry(),
      target,
    );
    expect(result.problems).toEqual([]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.contents).toEqual({ 'a.b': 'A', 'c.d': 'C' });
  });
});

describe('lowerProject with asynchronous kinds', () => {
  it('reports lowering.async-not-supported naming the element instead of crashing', () => {
    const result = lowerProject(
      project([
        { id: 'a:later', kind: 'test:async' },
        { id: 'a:rejected', kind: 'test:rejects' },
        { id: 'a:now', kind: 'test:sync' },
      ]),
      registry(),
      target,
    );
    expect(result.files.map((file) => file.path)).toEqual(['assets/a/models/now.json']);
    expect(result.problems.map((problem) => [problem.severity, problem.code])).toEqual([
      ['error', 'lowering.async-not-supported'],
      ['error', 'lowering.async-not-supported'],
    ]);
    expect(result.problems.map((problem) => problem.elementId)).toEqual([
      'a:later',
      'a:rejected',
    ]);
    expect(result.problems[0]?.message).toContain('a:later');
    expect(result.problems[0]?.message).toContain('test:async');
  });
});

describe('requireSyncResult', () => {
  it('returns values and refuses Promises', async () => {
    expect(requireSyncResult([1], 'test')).toEqual([1]);
    expect(() => requireSyncResult(Promise.resolve([1]), 'kind "x" lower')).toThrow(
      AsyncResultError,
    );
    expect(() => requireSyncResult(Promise.reject(new Error('no')), 'kind "x" lower')).toThrow(
      /kind "x" lower returned a Promise/,
    );
  });
});
