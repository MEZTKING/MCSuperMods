import type { SchemaField, SchemaNode } from '@msm/schemas';
import { describe, expect, it } from 'vitest';
import {
  buildReferenceIndex,
  CommandStack,
  collectTextReferences,
  commands,
  createElement,
  createEmptyProject,
  createMemoryFileSystem,
  DuplicateElementError,
  type Element,
  ElementNotFoundError,
  type Json,
  loadProject,
  ProblemCodes,
  type Project,
  type Reference,
  type ResourceLocation,
  saveProject,
  stableStringify,
} from '../src/index';
import { fixedNow, testRegistry } from './helpers/kinds';

const str: SchemaNode = { kind: 'string' };
const id = (idRegistry: string): SchemaNode => ({ kind: 'string', idRegistry });
const field = (key: string, type: SchemaNode, optional = true): SchemaField => ({
  key,
  type,
  optional,
});
const struct = (fields: SchemaField[], spreads: SchemaNode[] = []): SchemaNode => ({
  kind: 'struct',
  fields,
  spreads,
});
const list = (item: SchemaNode): SchemaNode => ({ kind: 'list', item });
const dispatcher = (
  registry: string,
  discriminator: string[],
  members: Record<string, SchemaNode>,
): SchemaNode => ({
  kind: 'dispatcher',
  registry,
  discriminator,
  keys: () => Object.keys(members).sort(),
  dispatch: (key) => members[key.startsWith('minecraft:') ? key.slice(10) : key],
});
/** An item id that also accepts `#tag` references, as `tag:<registry>` schemas do. */
const itemOrTag: SchemaNode = { kind: 'string', idRegistry: 'minecraft:item', tags: ['id'] };

/** A recipe-like kind: result, ingredient list, a map keyed by item ids, a dispatched part. */
const recipeSchema = struct(
  [
    field('type', str, false),
    field('result', id('minecraft:item')),
    field('ingredients', list(itemOrTag)),
    field('key', struct([{ key: '*', type: itemOrTag, keyType: id('item'), optional: true }])),
    field('note', str),
  ],
  [
    dispatcher('test:recipe', ['type'], {
      smelting: struct([field('fuel', id('item'))]),
      special: struct([field('function', id('function'))]),
    }),
  ],
);
const functionSchema = struct([field('lines', list(str), false)]);
const tagSchema = struct([field('values', list(itemOrTag), false)]);

const schemas: Record<string, SchemaNode> = {
  'test:recipe': recipeSchema,
  'test:function': functionSchema,
  'test:tag/item': tagSchema,
};
const resolveSchema = (kind: string): SchemaNode | undefined => schemas[kind];

const element = (elementId: ResourceLocation, kind: string, data: Json): Element =>
  createElement({ id: elementId, kind, data, now: fixedNow });

function sampleProject(): Project {
  const project = createEmptyProject('Refs');
  project.namespaces = [
    {
      name: 'minecraft',
      elements: [element('minecraft:special_gem', 'test:recipe', { type: 'smelting' })],
      assets: [],
    },
    {
      name: 'ns',
      elements: [
        element('ns:gems', 'test:tag/item', { values: ['ns:ruby', '#ns:shiny', 'stone'] }),
        element('ns:init', 'test:function', {
          lines: [
            '# give ns:ruby to everyone',
            'give @a ns:ruby 1',
            'function ns:init',
            'say ns:ruby/old ns:rubyx xns:ruby ns:ruby',
            'execute if items entity @s weapon #ns:ruby run say minecraft:stone',
          ],
        }),
        element('ns:ruby', 'test:recipe', {
          type: 'smelting',
          result: 'ns:ruby',
          ingredients: ['ns:ruby', '#ns:ruby', 'stone', '#minecraft:logs'],
          key: { 'ns:ruby': 'ns:ruby', stone: '#ns:ruby' },
          note: 'ns:ruby',
          fuel: 'ns:ruby',
        }),
        element('ns:use_function', 'test:recipe', { type: 'special', function: 'ns:init' }),
      ],
      assets: [],
    },
    { name: 'other', elements: [], assets: [] },
  ];
  return project;
}

function knownIds(project: Project): Set<string> {
  const ids = new Set<string>();
  for (const namespace of project.namespaces) {
    for (const item of namespace.elements) ids.add(item.id);
  }
  ids.add('minecraft:stone');
  return ids;
}

function textReferencesOf(project: Project): (item: Element) => Reference[] {
  const ids = knownIds(project);
  return (item) => {
    if (item.kind !== 'test:function') return [];
    const lines = (item.data as { lines: string[] }).lines;
    return collectTextReferences(item, lines, ids);
  };
}

const indexOf = (project: Project) =>
  buildReferenceIndex(project, resolveSchema, textReferencesOf(project));

const short = (references: Reference[]): string[] =>
  references.map(
    (r) =>
      `${r.from} ${r.path} ${r.registry || '-'} ${r.to}${r.key ? ' key' : ''}${
        r.range ? ` ${r.range.start}-${r.range.end}` : ''
      }`,
  );

describe('buildReferenceIndex', () => {
  it('indexes schema references through structs, lists, dispatchers and map keys', () => {
    const index = buildReferenceIndex(sampleProject(), resolveSchema);
    expect(short(index.referencesFrom('ns:ruby'))).toEqual([
      'ns:ruby /fuel item ns:ruby',
      'ns:ruby /ingredients/0 item ns:ruby',
      'ns:ruby /ingredients/1 tag/item ns:ruby',
      'ns:ruby /ingredients/2 item minecraft:stone',
      'ns:ruby /ingredients/3 tag/item minecraft:logs',
      'ns:ruby /key/ns:ruby item ns:ruby',
      'ns:ruby /key/ns:ruby item ns:ruby key',
      'ns:ruby /key/stone tag/item ns:ruby',
      'ns:ruby /key/stone item minecraft:stone key',
      'ns:ruby /result item ns:ruby',
    ]);
    expect(short(index.referencesFrom('ns:use_function'))).toEqual([
      'ns:use_function /function function ns:init',
    ]);
  });

  it('answers referencesTo with an optional registry filter, normalising the query', () => {
    const index = buildReferenceIndex(sampleProject(), resolveSchema);
    expect(index.referencesTo('ns:ruby')).toHaveLength(8);
    expect(short(index.referencesTo('#ns:ruby', 'tag/item'))).toEqual([
      'ns:ruby /ingredients/1 tag/item ns:ruby',
      'ns:ruby /key/stone tag/item ns:ruby',
    ]);
    expect(short(index.referencesTo('stone'))).toEqual([
      'ns:gems /values/2 item minecraft:stone',
      'ns:ruby /ingredients/2 item minecraft:stone',
      'ns:ruby /key/stone item minecraft:stone key',
    ]);
    expect(index.referencesTo('ns:nothing')).toEqual([]);
    expect(index.referencesFrom('ns:nothing')).toEqual([]);
  });

  it('includes text references and returns copies sorted by element and path', () => {
    const index = indexOf(sampleProject());
    const all = index.all();
    expect(all.map((r) => r.from)).toEqual([...all.map((r) => r.from)].sort());
    expect(short(index.referencesFrom('ns:init'))).toEqual([
      'ns:init /lines/0 - ns:ruby 7-14',
      'ns:init /lines/1 - ns:ruby 8-15',
      'ns:init /lines/2 - ns:init 9-16',
      'ns:init /lines/3 - ns:ruby 34-41',
      'ns:init /lines/4 - ns:ruby 35-42',
      'ns:init /lines/4 - minecraft:stone 51-66',
    ]);
    const first = all[0] as Reference;
    first.to = 'changed';
    expect(index.all()[0]?.to).not.toBe('changed');
  });

  it('skips elements whose kind has no schema or whose schema cannot be resolved', () => {
    const project = sampleProject();
    const index = buildReferenceIndex(project, (kind) => {
      if (kind === 'test:recipe') throw new Error('unresolvable');
      return undefined;
    });
    expect(index.all()).toEqual([]);
  });
});

describe('collectTextReferences', () => {
  const fn = element('ns:f', 'test:function', { lines: [] });

  it('matches whole tokens only, with any non-id character as a boundary', () => {
    const ids = new Set(['ns:a', 'stone']);
    const lines = [
      'function ns:a',
      'function ns:a/b',
      'function xns:a',
      'function ns:ab',
      'tag @s add "ns:a",#ns:a[ns:a=1]',
      'give @s stone',
      'give @s minecraft:stone',
      'say Ns:a',
    ];
    expect(short(collectTextReferences(fn, lines, ids))).toEqual([
      'ns:f /lines/0 - ns:a 9-13',
      'ns:f /lines/4 - ns:a 12-16',
      'ns:f /lines/4 - ns:a 19-23',
      'ns:f /lines/4 - ns:a 24-28',
      'ns:f /lines/6 - minecraft:stone 8-23',
    ]);
  });

  it('finds nothing without known ids or in empty lines', () => {
    expect(collectTextReferences(fn, ['function ns:a', ''], new Set())).toEqual([]);
    expect(collectTextReferences(fn, [], new Set(['ns:a']))).toEqual([]);
  });
});

describe('commands.renameElement', () => {
  const dataOf = (project: Project, elementId: string): Json | undefined => {
    for (const namespace of project.namespaces) {
      const found = namespace.elements.find((item) => item.id === elementId);
      if (found !== undefined) return found.data;
    }
    return undefined;
  };

  it('renames the element and rewrites JSON references, keys and function lines', () => {
    const project = sampleProject();
    const stack = new CommandStack(project);
    const references = indexOf(project).referencesTo('ns:ruby');
    stack.execute(commands.renameElement('ns:ruby', 'ns:gem/ruby', references));
    const state = stack.state;
    const ns = state.namespaces.find((namespace) => namespace.name === 'ns');
    expect(ns?.elements.map((item) => item.id)).toEqual([
      'ns:gem/ruby',
      'ns:gems',
      'ns:init',
      'ns:use_function',
    ]);
    expect(dataOf(state, 'ns:gem/ruby')).toEqual({
      type: 'smelting',
      result: 'ns:gem/ruby',
      ingredients: ['ns:gem/ruby', '#ns:gem/ruby', 'stone', '#minecraft:logs'],
      key: { 'ns:gem/ruby': 'ns:gem/ruby', stone: '#ns:gem/ruby' },
      note: 'ns:ruby',
      fuel: 'ns:gem/ruby',
    });
    expect(dataOf(state, 'ns:gems')).toEqual({
      values: ['ns:gem/ruby', '#ns:shiny', 'stone'],
    });
    expect(dataOf(state, 'ns:init')).toEqual({
      lines: [
        '# give ns:gem/ruby to everyone',
        'give @a ns:gem/ruby 1',
        'function ns:init',
        'say ns:ruby/old ns:rubyx xns:ruby ns:gem/ruby',
        'execute if items entity @s weapon #ns:gem/ruby run say minecraft:stone',
      ],
    });
  });

  it('is one undo step that restores the project byte for byte, and keeps meta', () => {
    const project = sampleProject();
    const ruby = project.namespaces[1]?.elements[2] as Element;
    ruby.meta.notes = 'Keep me.';
    const before = stableStringify(project as unknown as Json);
    const stack = new CommandStack(project);
    const references = indexOf(project).referencesTo('ns:ruby');
    stack.execute(commands.renameElement('ns:ruby', 'other:ruby', references));
    const moved = stack.state.namespaces.find((namespace) => namespace.name === 'other');
    expect(moved?.elements.map((item) => [item.id, item.meta])).toEqual([
      ['other:ruby', { createdAt: fixedNow(), notes: 'Keep me.' }],
    ]);
    expect(stack.undoLabel()).toBe('Rename ns:ruby to other:ruby');
    expect(stack.undo()).toBe(true);
    expect(stack.canUndo).toBe(false);
    expect(stableStringify(stack.state as unknown as Json)).toBe(before);
    expect(stack.redo()).toBe(true);
    expect(dataOf(stack.state, 'other:ruby')).toMatchObject({ result: 'other:ruby' });
  });

  it('keeps an omitted namespace only when the new id is in minecraft', () => {
    const run = (newId: ResourceLocation): Json | undefined => {
      const project = sampleProject();
      project.namespaces[0]?.elements.push(element('minecraft:stone', 'test:recipe', {}));
      const stack = new CommandStack(project);
      const references = indexOf(project).referencesTo('minecraft:stone');
      stack.execute(commands.renameElement('minecraft:stone', newId, references));
      return dataOf(stack.state, 'ns:ruby');
    };
    expect(run('minecraft:granite')).toMatchObject({
      ingredients: ['ns:ruby', '#ns:ruby', 'granite', '#minecraft:logs'],
      key: { 'ns:ruby': 'ns:ruby', granite: '#ns:ruby' },
    });
    expect(run('ns:granite')).toMatchObject({
      ingredients: ['ns:ruby', '#ns:ruby', 'ns:granite', '#minecraft:logs'],
      key: { 'ns:ruby': 'ns:ruby', 'ns:granite': '#ns:ruby' },
    });
  });

  it('rewrites a function line that references its own element', () => {
    const project = sampleProject();
    const stack = new CommandStack(project);
    const references = indexOf(project).referencesTo('ns:init');
    stack.execute(commands.renameElement('ns:init', 'ns:setup', references));
    expect(dataOf(stack.state, 'ns:setup')).toMatchObject({
      lines: expect.arrayContaining(['function ns:setup']),
    });
    expect(dataOf(stack.state, 'ns:use_function')).toEqual({
      type: 'special',
      function: 'ns:setup',
    });
  });

  it('skips stale references and references to other ids', () => {
    const project = sampleProject();
    const stack = new CommandStack(project);
    const references = indexOf(project).referencesTo('ns:ruby');
    stack.execute(commands.setElementValue('ns:ruby', '/result', 'ns:emerald'));
    stack.execute(commands.setElementValue('ns:init', '/lines/1', 'say hi'));
    const extra: Reference = { from: 'ns:ruby', path: '/note', registry: 'item', to: 'ns:other' };
    stack.execute(commands.renameElement('ns:ruby', 'ns:gem', [...references, extra]));
    expect(dataOf(stack.state, 'ns:gem')).toMatchObject({ result: 'ns:emerald', note: 'ns:ruby' });
    expect(dataOf(stack.state, 'ns:init')).toMatchObject({
      lines: expect.arrayContaining(['say hi']),
    });
  });

  it('fails on a conflict, a missing element or a missing namespace without changes', () => {
    const project = sampleProject();
    const stack = new CommandStack(project);
    expect(() => stack.execute(commands.renameElement('ns:ruby', 'ns:gems', []))).toThrow(
      DuplicateElementError,
    );
    expect(() => stack.execute(commands.renameElement('ns:nope', 'ns:new', []))).toThrow(
      ElementNotFoundError,
    );
    expect(() => stack.execute(commands.renameElement('ns:ruby', 'nope:ruby', []))).toThrow(
      /Namespace "nope" does not exist/,
    );
    expect(() => commands.renameElement('ns:ruby', 'Bad Id' as ResourceLocation, [])).toThrow();
    expect(stack.canUndo).toBe(false);
    expect(stack.state).toBe(project);
    expect(ProblemCodes.refsRenameConflict).toBe('refs.rename-conflict');
  });

  it('moves the element file on save through the manifest', async () => {
    const projectFile = stableStringify({
      formatVersion: 1,
      name: 'P',
      namespaces: ['ns'],
      plugins: [],
      settings: {},
      targets: [],
    });
    const elementFile = (elementId: string): string =>
      stableStringify({
        data: { id: elementId },
        formatVersion: 1,
        id: elementId,
        kind: 'test:thing',
        meta: { createdAt: fixedNow() },
      });
    const fs = createMemoryFileSystem({
      'msm.project.json': projectFile,
      'content/ns/thing/a.json': elementFile('ns:a'),
      'content/ns/thing/b.json': elementFile('ns:b'),
    });
    const registry = testRegistry();
    const loaded = await loadProject(fs, registry);
    const stack = new CommandStack(loaded.project);
    const schema = struct([field('id', id('test:thing'))]);
    const references = buildReferenceIndex(loaded.project, () => schema).referencesTo('ns:a');
    stack.execute(commands.renameElement('ns:a', 'ns:deep/c', references));
    const result = await saveProject(fs, stack.state, registry, { manifest: loaded.manifest });
    expect(result.removed).toEqual(['content/ns/thing/a.json']);
    expect(result.manifest.elementFiles).toEqual([
      'content/ns/thing/b.json',
      'content/ns/thing/deep/c.json',
    ]);
    expect(fs.list()).toEqual([
      'content/ns/thing/b.json',
      'content/ns/thing/deep/c.json',
      'msm.project.json',
    ]);
    const moved = await loadProject(fs, registry);
    expect(moved.project.namespaces[0]?.elements.map((item) => [item.id, item.data])).toEqual([
      ['ns:b', { id: 'ns:b' }],
      ['ns:deep/c', { id: 'ns:deep/c' }],
    ]);
  });
});
