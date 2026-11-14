import {
  definePlugin,
  type ElementKind,
  type ElementPatch,
  type ExpansionResult,
  type Json,
  type OutputFile,
  type Plugin,
  type ProjectExpander,
} from '@msm/plugin-api';
import { type SchemaNode, validateJson } from '@msm/schemas';
import { describe, expect, it } from 'vitest';
import {
  createElement,
  createEmptyProject,
  ElementKindRegistry,
  expandProject,
  expandProjectSync,
  expansionOriginKey,
  lowerProject,
  lowerProjectAsync,
  mapProblemsToOrigins,
  originForProblem,
  type Problem,
  ProblemCodes,
  type Project,
  projectExpanders,
  type ResourceLocation,
  stableStringify,
} from '../src/index';
import { fixedNow } from './helpers/kinds';
import { testTarget as target } from './helpers/target';

/** A block whose data is lowered as it is, so tests can read the patched data in the output. */
const blockKind: ElementKind = {
  id: 'test:block',
  schema: '::test::Block',
  folder: 'block',
  lower: (element) => [
    {
      path: `data/${element.id.replace(':', '/')}.json`,
      contents: element.data,
      layer: 'msm',
    },
  ],
};

/** A rule book: lowers to nothing, drives the fake expander. */
const bookKind: ElementKind = {
  id: 'test:book',
  schema: '::test::Book',
  folder: 'book',
  lower: () => [],
};

const blockSchema: SchemaNode = {
  kind: 'struct',
  spreads: [],
  fields: [
    { key: 'hardness', optional: true, type: { kind: 'number', numberKind: 'float' } },
    {
      key: 'events',
      optional: true,
      type: {
        kind: 'struct',
        spreads: [],
        fields: [
          {
            key: '*',
            optional: true,
            type: {
              kind: 'struct',
              spreads: [],
              fields: [
                {
                  key: 'actions',
                  optional: false,
                  type: { kind: 'list', item: { kind: 'string' } },
                },
              ],
            },
          },
        ],
      },
    },
    {
      key: 'components',
      optional: true,
      type: {
        kind: 'struct',
        spreads: [],
        fields: [{ key: 'on_use', optional: true, type: { kind: 'string' } }],
      },
    },
  ],
};

interface Book {
  /** Each rule adds `actions` to the block it names, under `<block>_rules_on_use`. */
  rules: { block: string; actions: Json }[];
}

/** A fake rules expander: for each rule, an event on its block and the trigger component. */
function rulesExpander(id = 'test.rules.expand'): ProjectExpander {
  return {
    id,
    kinds: ['test:book'],
    expand: ({ elements }) => {
      const patches: ElementPatch[] = [];
      for (const element of elements) {
        if (element.kind !== 'test:book') continue;
        (element.data as unknown as Book).rules.forEach((rule, index) => {
          const event = `${rule.block}_rules_on_use`;
          const origin = { elementId: element.id, pointer: `/rules/${index}` };
          patches.push(
            {
              elementId: rule.block,
              path: ['events', event],
              value: { actions: rule.actions },
              origin,
            },
            { elementId: rule.block, path: ['components', 'on_use'], value: event, origin },
          );
        });
      }
      return { patches, problems: [] };
    },
  };
}

function plugin(id: string, ...expanders: ProjectExpander[]): Plugin {
  return definePlugin({
    id,
    apiVersion: '^1.15.0',
    contributes: { projectExpanders: expanders },
  });
}

function registry(): ElementKindRegistry {
  const result = new ElementKindRegistry();
  result.register(blockKind);
  result.register(bookKind);
  return result;
}

function project(elements: { id: string; kind: string; data: Json }[]): Project {
  const result = createEmptyProject('P');
  result.namespaces.push({
    name: 'demo',
    assets: [],
    elements: elements.map((element) =>
      createElement({
        id: element.id as ResourceLocation,
        kind: element.kind,
        data: element.data,
        now: fixedNow,
      }),
    ),
  });
  return result;
}

const ruby = { id: 'demo:ruby', kind: 'test:block', data: { hardness: 3 } };

function book(rules: Book['rules'], id = 'demo:rules'): { id: string; kind: string; data: Json } {
  return { id, kind: 'test:book', data: { rules } as unknown as Json };
}

function fileData(files: OutputFile[], path: string): Json | undefined {
  return files.find((file) => file.path === path)?.contents as Json | undefined;
}

describe('expandProject', () => {
  it('lowers the patched data and leaves the saved project untouched', async () => {
    const saved = project([ruby, book([{ block: 'demo:ruby', actions: ['say hi'] }])]);
    const before = stableStringify(saved as unknown as Json);
    const plugins = [plugin('test.rules', rulesExpander())];

    const result = await lowerProjectAsync(saved, registry(), target, { plugins });

    expect(result.problems).toEqual([]);
    expect(fileData(result.files, 'data/demo/ruby.json')).toEqual({
      components: { on_use: 'demo:ruby_rules_on_use' },
      events: { 'demo:ruby_rules_on_use': { actions: ['say hi'] } },
      hardness: 3,
    });
    expect(stableStringify(saved as unknown as Json)).toBe(before);
    expect(lowerProject(saved, registry(), target, { plugins })).toEqual(result);
    // Without plugins nothing is expanded.
    expect(
      fileData((await lowerProjectAsync(saved, registry(), target)).files, 'data/demo/ruby.json'),
    ).toEqual({
      hardness: 3,
    });
  });

  it('copies structurally and records the origin of every patch', async () => {
    const saved = project([ruby, book([{ block: 'demo:ruby', actions: ['a'] }])]);
    const expanded = await expandProject(saved, [plugin('test.rules', rulesExpander())], target);
    const [savedNamespace] = saved.namespaces;
    const [namespace] = expanded.project.namespaces;
    expect(expanded.project).not.toBe(saved);
    expect(namespace).not.toBe(savedNamespace);
    // The book is unpatched and shared; the block is a new object.
    expect(namespace?.elements.find((e) => e.id === 'demo:rules')).toBe(
      savedNamespace?.elements.find((e) => e.id === 'demo:rules'),
    );
    expect(namespace?.elements.find((e) => e.id === 'demo:ruby')).not.toBe(
      savedNamespace?.elements.find((e) => e.id === 'demo:ruby'),
    );
    expect([...expanded.origins]).toEqual([
      [
        expansionOriginKey('demo:ruby', '/events/demo:ruby_rules_on_use'),
        { elementId: 'demo:rules', pointer: '/rules/0' },
      ],
      [
        expansionOriginKey('demo:ruby', '/components/on_use'),
        { elementId: 'demo:rules', pointer: '/rules/0' },
      ],
    ]);
  });

  it('reports a schema problem on a patched field on the origin', async () => {
    const saved = project([
      ruby,
      book([
        { block: 'demo:ruby', actions: ['fine'] },
        { block: 'demo:emerald', actions: [7] },
      ]),
      { id: 'demo:emerald', kind: 'test:block', data: { hardness: 'soft' } },
    ]);
    const expanded = await expandProject(saved, [plugin('test.rules', rulesExpander())], target);
    const problems: Problem[] = expanded.project.namespaces
      .flatMap((namespace) => namespace.elements)
      .filter((element) => element.kind === 'test:block')
      .flatMap((element) =>
        validateJson(element.data, blockSchema).map((problem) => ({
          severity: problem.severity,
          code: `schema.${problem.code}`,
          message: problem.message,
          elementId: element.id,
          path: problem.path,
        })),
      );
    const mapped = mapProblemsToOrigins(problems, expanded.origins);
    expect(mapped.map((problem) => [problem.elementId, problem.path])).toEqual([
      // The patched event's bad action is reported on the rule that made it.
      ['demo:rules', '/rules/1'],
      // The saved, unpatched field stays on its own element.
      ['demo:emerald', '/hardness'],
    ]);
    expect(problems[0]?.path).toBe('/events/demo:emerald_rules_on_use/actions/0');
    expect(mapped[0]?.code).toBe(problems[0]?.code);
    expect(mapped[0]?.message).toBe(problems[0]?.message);
  });

  it('applies patches in plugin order and reports the same path twice as a conflict', async () => {
    const second: ProjectExpander = {
      id: 'test.second',
      kinds: ['test:book'],
      expand: () => ({
        patches: [
          {
            elementId: 'demo:ruby',
            path: ['components', 'on_use'],
            value: 'other',
            origin: { elementId: 'demo:other', pointer: '' },
          },
          {
            elementId: 'demo:ruby',
            path: ['tooltip', 'lines', 'first'],
            value: 'made',
            origin: { elementId: 'demo:other', pointer: '/x' },
          },
        ],
        problems: [{ severity: 'warning', code: 'test.note', message: 'note' }],
      }),
    };
    const saved = project([ruby, book([{ block: 'demo:ruby', actions: ['a'] }])]);
    const plugins = [plugin('test.rules', rulesExpander()), plugin('test.second', second)];
    const expanded = await expandProject(saved, plugins, target);
    expect(expanded.problems).toEqual([
      { severity: 'warning', code: 'test.note', message: 'note' },
      expect.objectContaining({
        code: ProblemCodes.expansionConflict,
        severity: 'error',
        elementId: 'demo:other',
      }),
    ]);
    const block = expanded.project.namespaces[0]?.elements.find((e) => e.id === 'demo:ruby');
    expect(block?.data).toEqual({
      components: { on_use: 'demo:ruby_rules_on_use' },
      events: { 'demo:ruby_rules_on_use': { actions: ['a'] } },
      hardness: 3,
      tooltip: { lines: { first: 'made' } },
    });
    expect(expanded.problems[1]?.message).toContain('demo:ruby at "/components/on_use"');
  });

  it('gives every expander the saved elements, not earlier patches', async () => {
    const seen: Json[] = [];
    const watcher: ProjectExpander = {
      id: 'test.watch',
      kinds: [],
      expand: ({ elements }) => {
        seen.push(elements.find((e) => e.id === 'demo:ruby')?.data ?? null);
        return { patches: [], problems: [] };
      },
    };
    const saved = project([ruby, book([{ block: 'demo:ruby', actions: ['a'] }])]);
    await expandProject(saved, [plugin('a', rulesExpander()), plugin('b', watcher)], target);
    expect(seen).toEqual([{ hardness: 3 }]);
  });

  it('reports a throwing or rejecting expander on its kinds and ignores its patches', async () => {
    const throwing: ProjectExpander = {
      id: 'test.throws',
      kinds: ['test:book'],
      expand: () => {
        throw new Error('boom');
      },
    };
    const rejecting: ProjectExpander = {
      id: 'test.rejects',
      kinds: ['test:none'],
      expand: () => Promise.reject(new Error('worker crashed')),
    };
    const saved = project([ruby, book([], 'demo:a'), book([], 'demo:b')]);
    const expanded = await expandProject(
      saved,
      [plugin('t', throwing), plugin('r', rejecting), plugin('ok', rulesExpander())],
      target,
    );
    expect(expanded.problems.map((p) => [p.code, p.elementId ?? null, p.message])).toEqual([
      [
        ProblemCodes.expansionFailed,
        'demo:a',
        'demo:a: project expander "test.throws" failed: boom',
      ],
      [
        ProblemCodes.expansionFailed,
        'demo:b',
        'demo:b: project expander "test.throws" failed: boom',
      ],
      [
        ProblemCodes.expansionFailed,
        null,
        'Project expander "test.rejects" failed: worker crashed',
      ],
    ]);
    const malformed: ProjectExpander = {
      id: 'test.malformed',
      kinds: ['test:book'],
      expand: () => ({ patches: 'nope' }) as unknown as ExpansionResult,
    };
    const result = await expandProject(saved, [plugin('m', malformed)], target);
    expect(result.problems.map((p) => p.code)).toEqual([
      ProblemCodes.expansionFailed,
      ProblemCodes.expansionFailed,
    ]);
  });

  it('awaits asynchronous expanders; the synchronous variant refuses them', async () => {
    const asyncExpander: ProjectExpander = {
      ...rulesExpander(),
      expand: async (input) => rulesExpander().expand(input),
    };
    const saved = project([ruby, book([{ block: 'demo:ruby', actions: ['a'] }])]);
    const plugins = [plugin('async', asyncExpander)];
    const expanded = await expandProject(saved, plugins, target);
    expect(expanded.problems).toEqual([]);
    expect(expanded.origins.size).toBe(2);

    const sync = expandProjectSync(saved, plugins, target);
    expect(sync.origins.size).toBe(0);
    expect(sync.problems.map((p) => [p.code, p.elementId])).toEqual([
      [ProblemCodes.expansionFailed, 'demo:rules'],
    ]);
    const lowered = lowerProject(saved, registry(), target, { plugins });
    expect(lowered.problems.map((p) => p.code)).toEqual([ProblemCodes.expansionFailed]);
    expect(fileData(lowered.files, 'data/demo/ruby.json')).toEqual({ hardness: 3 });
  });

  it('creates missing parents, replaces data on an empty path and refuses bad patches', async () => {
    const origin = { elementId: 'demo:rules', pointer: '/rules/0' };
    const patches: ElementPatch[] = [
      { elementId: 'demo:list', path: ['items', 1], value: 'b', origin },
      { elementId: 'demo:list', path: ['items', 5], value: 'x', origin },
      { elementId: 'demo:list', path: ['name', 'deep'], value: 'x', origin },
      { elementId: 'demo:list', path: ['items', 'key'], value: 'x', origin },
      { elementId: 'demo:whole', path: [], value: { replaced: true }, origin },
      { elementId: 'demo:whole', path: ['__proto__'], value: { polluted: true }, origin },
      { elementId: 'demo:missing', path: ['a'], value: 1, origin },
      { elementId: 'demo:list', path: ['a'], value: 1, origin: undefined as never },
    ];
    const expander: ProjectExpander = {
      id: 'test.paths',
      kinds: ['test:book'],
      expand: () => ({ patches, problems: [] }),
    };
    const saved = project([
      { id: 'demo:list', kind: 'test:block', data: { items: ['a'], name: 'n' } },
      { id: 'demo:whole', kind: 'test:block', data: { old: 1 } },
      book([]),
    ]);
    const expanded = await expandProject(saved, [plugin('p', expander)], target);
    const data = (id: string): Json | undefined =>
      expanded.project.namespaces[0]?.elements.find((e) => e.id === id)?.data;
    expect(data('demo:list')).toEqual({ items: ['a', 'b'], name: 'n' });
    expect(data('demo:whole')).toEqual({ replaced: true, ['__proto__']: { polluted: true } });
    expect(Object.getPrototypeOf(data('demo:whole'))).toBe(Object.prototype);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(expanded.problems.map((p) => [p.code, p.elementId ?? null, p.path ?? null])).toEqual([
      [ProblemCodes.expansionInvalidPatch, 'demo:rules', '/rules/0'],
      [ProblemCodes.expansionInvalidPatch, 'demo:rules', '/rules/0'],
      [ProblemCodes.expansionInvalidPatch, 'demo:rules', '/rules/0'],
      [ProblemCodes.expansionInvalidPatch, 'demo:rules', '/rules/0'],
      [ProblemCodes.expansionInvalidPatch, null, null],
    ]);
    // The empty path holds every place of its element, including problems without a path.
    expect(
      originForProblem(expanded.origins, {
        severity: 'error',
        code: 'x',
        message: 'x',
        elementId: 'demo:whole',
      }),
    ).toEqual(origin);
    expect(
      originForProblem(expanded.origins, {
        severity: 'error',
        code: 'x',
        message: 'x',
        elementId: 'demo:list',
      }),
    ).toBeUndefined();
    expect(
      originForProblem(expanded.origins, {
        severity: 'error',
        code: 'x',
        message: 'x',
        elementId: 'demo:list',
        path: '/items/10',
      }),
    ).toBeUndefined();
    expect(
      originForProblem(expanded.origins, {
        severity: 'error',
        code: 'x',
        message: 'x',
        elementId: 'demo:list',
        path: '/items/1',
      }),
    ).toEqual(origin);
  });

  it('lists expanders in plugin order and returns an unchanged copy without any', async () => {
    const a = rulesExpander('a');
    const b = rulesExpander('b');
    const c = rulesExpander('c');
    expect(projectExpanders([plugin('x', a, b), plugin('y'), plugin('z', c)])).toEqual([a, b, c]);
    const saved = project([ruby]);
    const expanded = await expandProject(saved, [], target);
    expect(expanded.project).toEqual(saved);
    expect(expanded.project).not.toBe(saved);
    expect(expanded.problems).toEqual([]);
    expect(expanded.origins.size).toBe(0);
  });
});
