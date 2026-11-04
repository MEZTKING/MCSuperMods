import type { Json } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  type CollectedReference,
  collectReferences,
  type SchemaField,
  type SchemaNode,
} from '../src/index';

const str: SchemaNode = { kind: 'string' };
const id = (idRegistry: string): SchemaNode => ({ kind: 'string', idRegistry });
const field = (key: string, type: SchemaNode, optional = false): SchemaField => ({
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

/** A loot-table-like shape: entries dispatch on `type`, nested functions dispatch on `function`. */
const lootFunction = struct(
  [field('function', id('minecraft:loot_function_type'))],
  [
    dispatcher('minecraft:loot_function', ['function'], {
      set_item: struct([field('item', id('item'))]),
      copy: struct([field('source', str)]),
    }),
  ],
);
const entry = struct(
  [field('type', id('loot_pool_entry_type'))],
  [
    dispatcher('minecraft:loot_pool_entry', ['type'], {
      item: struct([field('name', id('item')), field('functions', list(lootFunction), true)]),
      tag: struct([field('name', id('tag/item'))]),
    }),
  ],
);
const table = struct([field('pools', list(struct([field('entries', list(entry))])))]);

const short = (refs: CollectedReference[]): string[] =>
  refs.map((r) => `${r.path} ${r.registry} ${r.id}${r.key ? ' key' : ''}`);

describe('collectReferences', () => {
  it('records the #[id(path=...)] registry id and keeps the written value', () => {
    const node = struct([
      field('asset_id', { kind: 'string', idRegistry: 'texture', idPath: 'painting/' }),
    ]);
    expect(collectReferences({ asset_id: 'minecraft:kebab' }, node)).toEqual([
      {
        path: '/asset_id',
        registry: 'texture',
        id: 'minecraft:painting/kebab',
        written: 'minecraft:kebab',
      },
    ]);
  });

  it('collects through lists and nested dispatchers, sorted by path', () => {
    const value: Json = {
      pools: [
        {
          entries: [
            {
              type: 'minecraft:item',
              name: 'minecraft:diamond',
              functions: [
                { function: 'set_item', item: 'demo:gem' },
                { function: 'copy', source: 'not an id' },
              ],
            },
            { type: 'tag', name: 'minecraft:logs' },
          ],
        },
      ],
    };
    expect(short(collectReferences(value, table))).toEqual([
      '/pools/0/entries/0/functions/0/function loot_function_type set_item',
      '/pools/0/entries/0/functions/0/item item demo:gem',
      '/pools/0/entries/0/functions/1/function loot_function_type copy',
      '/pools/0/entries/0/name item minecraft:diamond',
      '/pools/0/entries/0/type loot_pool_entry_type minecraft:item',
      '/pools/0/entries/1/name tag/item minecraft:logs',
      '/pools/0/entries/1/type loot_pool_entry_type tag',
    ]);
  });

  it('keeps the # of tag references', () => {
    const node = struct([field('values', list(id('item')))]);
    expect(collectReferences({ values: ['stone', '#minecraft:logs'] }, node)).toEqual([
      { path: '/values/0', registry: 'item', id: 'stone' },
      { path: '/values/1', registry: 'item', id: '#minecraft:logs' },
    ]);
  });

  it('collects map keys, marked as keys, and their values', () => {
    const node = struct([{ key: '*', type: id('block'), keyType: id('item'), optional: true }]);
    expect(collectReferences({ 'demo:a/b': 'minecraft:stone' }, node)).toEqual([
      { path: '/demo:a~1b', registry: 'item', id: 'demo:a/b', key: true },
      { path: '/demo:a~1b', registry: 'block', id: 'minecraft:stone' },
    ]);
  });

  it('only keeps references from the union member that matched', () => {
    const node: SchemaNode = {
      kind: 'union',
      members: [
        struct([field('a', id('item')), field('n', { kind: 'number', numberKind: 'int' })]),
        struct([field('a', id('block'))]),
      ],
    };
    expect(short(collectReferences({ a: 'x' }, node))).toEqual(['/a block x']);
    expect(short(collectReferences({ a: 'x', n: 1 }, node))).toEqual(['/a item x']);
  });

  it('keeps references of the first wildcard whose key type accepts the key', () => {
    const node = struct([
      { key: '*', type: str, keyType: { kind: 'literal', value: 'only' }, optional: true },
      { key: '*', type: str, keyType: id('item'), optional: true },
    ]);
    expect(short(collectReferences({ only: 'v', other: 'v' }, node))).toEqual([
      '/other item other key',
    ]);
  });

  it('does not collect a discriminator twice and ignores non-string values', () => {
    const closed = struct(
      [field('type', { kind: 'enum', values: [{ identifier: 'A', value: 'a' }] })],
      [dispatcher('minecraft:thing', ['type'], { a: struct([field('item', id('item'))]) })],
    );
    expect(short(collectReferences({ type: 'a', item: 'stone' }, closed))).toEqual([
      '/item item stone',
    ]);
    const typed = struct(
      [field('type', id('thing'))],
      [dispatcher('minecraft:thing', ['type'], { a: struct([field('type', id('thing'))]) })],
    );
    expect(short(collectReferences({ type: 'a' }, typed))).toEqual(['/type thing a']);
    expect(
      collectReferences({ values: [1, null] }, struct([field('values', list(id('item')))])),
    ).toEqual([]);
  });

  it('strips a minecraft: prefix from the registry and honours maxDepth', () => {
    const node = list(list(id('minecraft:item')));
    expect(short(collectReferences([['a']], node))).toEqual(['/0/0 item a']);
    expect(collectReferences([['a']], node, { maxDepth: 1 })).toEqual([]);
  });
});
