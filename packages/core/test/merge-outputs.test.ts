import type { ElementKind, Json, OutputFile, Target } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  createElement,
  createEmptyProject,
  ElementKindRegistry,
  lowerProject,
  type MergeEntry,
  mergeOutputFiles,
  type Project,
  type ResourceLocation,
  stableStringify,
  utf8,
} from '../src/index';
import { fixedNow } from './helpers/kinds';

const TAG = 'data/minecraft/tags/block/mineable/pickaxe.json';
const LANG = 'assets/ruby/lang/en_us.json';

type Extra = { [K in keyof OutputFile]?: OutputFile[K] | undefined };

function entry(source: ResourceLocation, base: OutputFile, extra: Extra): MergeEntry {
  const file: Record<string, unknown> = { ...base, ...extra };
  for (const key of Object.keys(file)) if (file[key] === undefined) delete file[key];
  return { file: file as unknown as OutputFile, source, elementId: source };
}

function tag(source: ResourceLocation, contents: Json, extra: Extra = {}): MergeEntry {
  const base: OutputFile = {
    path: TAG,
    layer: 'datapack',
    contents,
    schema: 'tag:block',
    merge: 'tag',
  };
  return entry(source, base, extra);
}

function lang(source: ResourceLocation, contents: Json, extra: Extra = {}): MergeEntry {
  const base: OutputFile = {
    path: LANG,
    layer: 'resourcepack',
    contents,
    schema: '::java::assets::lang::Lang',
    merge: 'object',
  };
  return entry(source, base, extra);
}

describe('mergeOutputFiles', () => {
  it('passes a file alone at its path through unchanged', () => {
    const entry = tag('a:one', { values: ['b', 'a'], replace: false });
    const result = mergeOutputFiles([entry]);
    expect(result.problems).toEqual([]);
    expect(result.files).toEqual([entry.file]);
    expect(result.files[0]).toBe(entry.file);
  });

  describe('tag', () => {
    it('unions values in first-seen order and drops duplicates', () => {
      const result = mergeOutputFiles([
        tag('a:one', { values: ['minecraft:stone', '#minecraft:logs'] }),
        tag('a:two', { values: ['ruby:ore', 'minecraft:stone'] }),
      ]);
      expect(result.problems).toEqual([]);
      expect(result.files).toEqual([
        {
          path: TAG,
          layer: 'datapack',
          schema: 'tag:block',
          merge: 'tag',
          contents: { values: ['minecraft:stone', '#minecraft:logs', 'ruby:ore'] },
        },
      ]);
    });

    it('counts a string and an { id } entry with the same id once, keeping the first form', () => {
      const result = mergeOutputFiles([
        tag('a:one', { values: [{ id: 'ruby:ore', required: false }] }),
        tag('a:two', { values: ['ruby:ore', { id: 'ruby:ore' }, 'ruby:deep_ore'] }),
        tag('a:three', { values: [{ id: 'ruby:deep_ore', required: false }] }),
      ]);
      expect(result.problems).toEqual([]);
      expect(result.files[0]?.contents).toEqual({
        values: [{ id: 'ruby:ore', required: false }, 'ruby:deep_ore'],
      });
    });

    it('sets replace to true when any input says so', () => {
      const result = mergeOutputFiles([
        tag('a:one', { replace: false, values: ['x:a'] }),
        tag('a:two', { replace: true, values: ['x:b'] }),
        tag('a:three', { values: ['x:c'] }),
      ]);
      expect(result.files[0]?.contents).toEqual({ replace: true, values: ['x:a', 'x:b', 'x:c'] });
    });

    it('keeps replace false when only false was written and omits it when never written', () => {
      const withFalse = mergeOutputFiles([
        tag('a:one', { values: ['x:a'] }),
        tag('a:two', { replace: false, values: ['x:b'] }),
      ]);
      expect(withFalse.files[0]?.contents).toEqual({ replace: false, values: ['x:a', 'x:b'] });
      const without = mergeOutputFiles([
        tag('a:one', { values: ['x:a'] }),
        tag('a:two', { values: ['x:b'] }),
      ]);
      expect(without.files[0]?.contents).toEqual({ values: ['x:a', 'x:b'] });
    });

    it('accepts UTF-8 JSON bytes', () => {
      const result = mergeOutputFiles([
        tag('a:one', null, { contents: utf8.encode('{"values":["x:a"]}') }),
        tag('a:two', { values: ['x:b'] }),
      ]);
      expect(result.problems).toEqual([]);
      expect(result.files[0]?.contents).toEqual({ values: ['x:a', 'x:b'] });
    });

    it('reports a merge conflict for contents that are not a tag file', () => {
      const result = mergeOutputFiles([
        tag('a:one', { values: ['x:a'] }),
        tag('a:two', { values: 'x:b' }),
        tag('a:three', ['x:c']),
      ]);
      expect(result.problems.map((p) => [p.code, p.elementId, p.file])).toEqual([
        ['lowering.merge-conflict', 'a:two', TAG],
        ['lowering.merge-conflict', 'a:three', TAG],
      ]);
      expect(result.files[0]?.contents).toEqual({ values: ['x:a'] });
    });
  });

  describe('object', () => {
    it('merges keys and writes them sorted', () => {
      const result = mergeOutputFiles([
        lang('a:one', { 'item.ruby.ruby': 'Ruby', 'block.ruby.ore': 'Ruby Ore' }),
        lang('a:two', { 'block.ruby.block': 'Block of Ruby', 'item.ruby.ruby': 'Ruby' }),
      ]);
      expect(result.problems).toEqual([]);
      const contents = result.files[0]?.contents as Json;
      expect(Object.keys(contents as object)).toEqual([
        'block.ruby.block',
        'block.ruby.ore',
        'item.ruby.ruby',
      ]);
      expect(result.files[0]?.merge).toBe('object');
      expect(result.files[0]?.schema).toBe('::java::assets::lang::Lang');
    });

    it('reports the same key with different values naming both elements and keeps the first', () => {
      const result = mergeOutputFiles([
        lang('a:one', { 'item.ruby.ruby': 'Ruby' }),
        lang('b:two', { 'item.ruby.ruby': 'Red Gem', 'item.ruby/x': 'X' }),
      ]);
      expect(result.files[0]?.contents).toEqual({ 'item.ruby.ruby': 'Ruby', 'item.ruby/x': 'X' });
      expect(result.problems).toHaveLength(1);
      const [problem] = result.problems;
      expect(problem).toMatchObject({
        severity: 'error',
        code: 'lowering.merge-conflict',
        elementId: 'b:two',
        file: LANG,
        path: '/item.ruby.ruby',
      });
      expect(problem?.message).toContain('a:one');
      expect(problem?.message).toContain('b:two');
    });

    it('compares values structurally, regardless of key order', () => {
      const result = mergeOutputFiles([
        lang('a:one', { k: { a: 1, b: 2 } }),
        lang('a:two', { k: { b: 2, a: 1 } }),
      ]);
      expect(result.problems).toEqual([]);
    });

    it('reports a merge conflict for contents that are not an object', () => {
      const result = mergeOutputFiles([lang('a:one', { k: 'v' }), lang('a:two', 'text')]);
      expect(result.problems.map((p) => p.code)).toEqual(['lowering.merge-conflict']);
      expect(result.files[0]?.contents).toEqual({ k: 'v' });
    });
  });

  describe('conflicts', () => {
    const expectConflict = (entries: MergeEntry[], reason: string): void => {
      const result = mergeOutputFiles(entries);
      expect(result.files).toEqual([entries[0]?.file]);
      expect(result.problems.map((p) => [p.code, p.elementId])).toEqual(
        entries.slice(1).map((entry) => ['lowering.conflict', entry.elementId]),
      );
      expect(result.problems[0]?.message).toContain(reason);
      expect(result.problems[0]?.message).toContain(entries[0]?.source as string);
    };

    it('keeps a file without merge in conflict with a mergeable one', () => {
      expectConflict(
        [
          tag('a:one', { values: ['x:a'] }),
          tag('a:two', { values: ['x:b'] }, { merge: undefined }),
        ],
        'a:two does not declare a merge mode',
      );
      expectConflict(
        [
          tag('a:one', { values: ['x:a'] }, { merge: undefined }),
          tag('a:two', { values: ['x:b'] }),
        ],
        'a:one does not declare a merge mode',
      );
    });

    it('keeps two files without merge in conflict', () => {
      expectConflict(
        [
          tag('a:one', { values: [] }, { merge: undefined }),
          tag('a:two', { values: [] }, { merge: undefined }),
        ],
        'does not declare a merge mode',
      );
    });

    it('treats mixed merge modes as a conflict', () => {
      expectConflict(
        [tag('a:one', { values: [] }), tag('a:two', { values: [] }, { merge: 'object' })],
        'different merge modes',
      );
    });

    it('treats differing schemas as a conflict', () => {
      expectConflict(
        [tag('a:one', { values: [] }), tag('a:two', { values: [] }, { schema: 'tag:item' })],
        'different schemas',
      );
      expectConflict(
        [tag('a:one', { values: [] }), tag('a:two', { values: [] }, { schema: undefined })],
        'different schemas',
      );
    });

    it('uses the given conflict code and omits elementId for non-element sources', () => {
      const result = mergeOutputFiles(
        [
          lang('a:one', {}),
          { file: { path: LANG, layer: 'resourcepack', contents: new Uint8Array() }, source: 'x' },
        ],
        { conflictCode: 'export.conflict' },
      );
      expect(result.problems).toHaveLength(1);
      expect(result.problems[0]?.code).toBe('export.conflict');
      expect(result.problems[0]?.elementId).toBeUndefined();
    });

    it('does not merge the same path in different layers', () => {
      const result = mergeOutputFiles([
        tag('a:one', { values: ['x:a'] }),
        tag('a:two', { values: ['x:b'] }, { layer: 'resourcepack' }),
      ]);
      expect(result.problems).toEqual([]);
      expect(result.files.map((file) => file.layer)).toEqual(['datapack', 'resourcepack']);
    });
  });

  it('is deterministic and sorts files by layer and path', () => {
    const entries = (): MergeEntry[] => [
      lang('a:one', { b: '1', a: '2' }),
      tag('a:one', { values: ['x:a'] }),
      tag('a:two', { values: ['x:b'] }, { path: 'data/a.json' }),
      tag('a:three', { values: ['x:c'] }),
      lang('a:two', { c: '3' }),
    ];
    const first = mergeOutputFiles(entries());
    const second = mergeOutputFiles(entries());
    expect(first.files.map((file) => file.path)).toEqual(['data/a.json', TAG, LANG]);
    expect(first.files.map((file) => stableStringify(file.contents as Json))).toEqual(
      second.files.map((file) => stableStringify(file.contents as Json)),
    );
    expect(stableStringify(first.files[2]?.contents as Json)).toBe(
      stableStringify({ a: '2', b: '1', c: '3' }),
    );
  });
});

describe('lowerProject with mergeable outputs', () => {
  const target = { id: 'mc-test' } as Target;

  function project(elements: { id: ResourceLocation; data: Json }[]): Project {
    const base = createEmptyProject('P');
    base.namespaces.push({
      name: 'a',
      assets: [],
      elements: elements.map(({ id, data }) =>
        createElement({ id, kind: 'test:lang', data, now: fixedNow }),
      ),
    });
    return base;
  }

  const kinds = new ElementKindRegistry();
  const kind: ElementKind = {
    id: 'test:lang',
    schema: '::test::Lang',
    folder: 'lang',
    lower: (element) => [
      {
        path: LANG,
        layer: 'resourcepack',
        contents: element.data,
        schema: '::test::Lang',
        merge: 'object',
      },
    ],
  };
  kinds.register(kind);

  it('merges outputs of several elements into one file', () => {
    const result = lowerProject(
      project([
        { id: 'a:two', data: { b: 'B' } },
        { id: 'a:one', data: { a: 'A' } },
      ]),
      kinds,
      target,
    );
    expect(result.problems).toEqual([]);
    expect(result.files).toEqual([
      {
        path: LANG,
        layer: 'resourcepack',
        contents: { a: 'A', b: 'B' },
        schema: '::test::Lang',
        merge: 'object',
      },
    ]);
  });

  it('reports a merge conflict naming both elements', () => {
    const result = lowerProject(
      project([
        { id: 'a:two', data: { k: 'two' } },
        { id: 'a:one', data: { k: 'one' } },
      ]),
      kinds,
      target,
    );
    expect(result.files[0]?.contents).toEqual({ k: 'one' });
    expect(result.problems.map((p) => [p.code, p.elementId])).toEqual([
      ['lowering.merge-conflict', 'a:two'],
    ]);
    expect(result.problems[0]?.message).toContain('a:one');
  });
});
