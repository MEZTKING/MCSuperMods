import type { Json } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  createSchemaIndex,
  type RawMcdocType,
  type VanillaMcdocSymbols,
  validateJson,
} from '../src/index';

const ref = (path: string) => ({ kind: 'reference', path });
const pair = (key: string, type: unknown) => ({ kind: 'pair', key, type });
const kindDispatch = {
  kind: 'dispatcher',
  registry: 't:value',
  parallelIndices: [{ kind: 'dynamic', accessor: ['kind'] }],
};

/**
 * Modelled on vanilla-mcdoc's item definition `select` on `minecraft:component`: the type
 * argument `t:value[[kind]]` is written in `Select`, so `kind` is read from the select object,
 * not from each case that uses the parameter.
 */
const mcdoc: Record<string, unknown> = {
  '::t::Cases': {
    kind: 'template',
    typeParams: [{ path: '::t::T' }],
    child: {
      kind: 'struct',
      fields: [
        pair('cases', {
          kind: 'list',
          item: { kind: 'concrete', child: ref('::t::Case'), typeArgs: [ref('::t::T')] },
        }),
      ],
    },
  },
  '::t::Case': {
    kind: 'template',
    typeParams: [{ path: '::t::T' }],
    child: {
      kind: 'struct',
      fields: [pair('when', ref('::t::T')), pair('label', { kind: 'string' })],
    },
  },
  '::t::Select': {
    kind: 'struct',
    fields: [
      pair('kind', { kind: 'string' }),
      {
        kind: 'spread',
        type: { kind: 'concrete', child: ref('::t::Cases'), typeArgs: [kindDispatch] },
      },
    ],
  },
  '::t::Direct': {
    kind: 'struct',
    fields: [pair('kind', { kind: 'string' }), pair('value', kindDispatch)],
  },
};

const symbols: VanillaMcdocSymbols = {
  ref: 'test',
  mcdoc: mcdoc as Record<string, RawMcdocType>,
  dispatchers: { 't:value': { number: { kind: 'int' }, text: { kind: 'string' } } } as Record<
    string,
    Record<string, RawMcdocType>
  >,
};
const index = createSchemaIndex(symbols, { mcVersion: '1.0' });
const check = (path: string, value: Json): string[] =>
  validateJson(value, index.resolve(path)).map((p) => `${p.path} ${p.code}`);

describe('dispatchers passed as template type arguments', () => {
  it('read their accessor from the object that instantiated the template', () => {
    expect(check('::t::Select', { kind: 'number', cases: [{ when: 3, label: 'a' }] })).toEqual([]);
    expect(check('::t::Select', { kind: 'text', cases: [{ when: 'x', label: 'a' }] })).toEqual([]);
  });

  it('still check the selected member', () => {
    expect(check('::t::Select', { kind: 'number', cases: [{ when: 'x', label: 'a' }] })).toEqual([
      '/cases/0/when schema.type-mismatch',
    ]);
  });

  it('still report a missing discriminator when no enclosing object has it', () => {
    expect(check('::t::Select', { cases: [{ when: 3, label: 'a' }] })).toEqual([
      '/cases/0/kind schema.missing-discriminator',
      '/kind schema.missing-field',
    ]);
  });

  it('leave ordinary dispatchers reading their own struct only', () => {
    expect(check('::t::Direct', { kind: 'number', value: 3 })).toEqual([]);
    const node = index.resolve('::t::Direct');
    expect(
      node.kind === 'struct' &&
        node.fields[1]?.type.kind === 'dispatcher' &&
        node.fields[1].type.typeArgument,
    ).toBeFalsy();
  });
});
