import type { Json } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  createRegistryIndex,
  type SchemaField,
  type SchemaNode,
  type SchemaProblem,
  validateJson,
} from '../src/index';

// Hand-built nodes -------------------------------------------------------------------

const str = (extra: Partial<SchemaNode & { kind: 'string' }> = {}): SchemaNode => ({
  kind: 'string',
  ...extra,
});
const int = (extra: Partial<SchemaNode & { kind: 'number' }> = {}): SchemaNode => ({
  kind: 'number',
  numberKind: 'int',
  ...extra,
});
const float = (extra: Partial<SchemaNode & { kind: 'number' }> = {}): SchemaNode => ({
  kind: 'number',
  numberKind: 'float',
  ...extra,
});
const bool: SchemaNode = { kind: 'boolean' };
const lit = (value: string | number | boolean): SchemaNode => ({ kind: 'literal', value });
const list = (
  item: SchemaNode,
  extra: Partial<SchemaNode & { kind: 'list' }> = {},
): SchemaNode => ({
  kind: 'list',
  item,
  ...extra,
});
const union = (...members: SchemaNode[]): SchemaNode => ({ kind: 'union', members });
const field = (key: string, type: SchemaNode, extra: Partial<SchemaField> = {}): SchemaField => ({
  key,
  type,
  optional: false,
  ...extra,
});
const opt = (key: string, type: SchemaNode): SchemaField => field(key, type, { optional: true });
const struct = (fields: SchemaField[], spreads: SchemaNode[] = []): SchemaNode => ({
  kind: 'struct',
  fields,
  spreads,
});
const ref = (path: string, target: () => SchemaNode): SchemaNode => ({
  kind: 'reference',
  path,
  resolve: target,
});
const dispatcher = (
  registry: string,
  discriminator: string[],
  members: Record<string, SchemaNode>,
): SchemaNode => ({
  kind: 'dispatcher',
  registry,
  discriminator,
  keys: () => Object.keys(members).sort(),
  dispatch: (key) => {
    const bare = key.startsWith('minecraft:') ? key.slice('minecraft:'.length) : key;
    return Object.hasOwn(members, bare) ? members[bare] : undefined;
  },
});

const codes = (problems: SchemaProblem[]): [string, string][] =>
  problems.map((problem) => [problem.path, problem.code]);
const ok = (value: Json, node: SchemaNode): void => {
  expect(validateJson(value, node)).toEqual([]);
};

// Tests --------------------------------------------------------------------------------

describe('validateJson: scalars', () => {
  it('checks primitive types', () => {
    ok('a', str());
    ok(true, bool);
    ok(1.5, float());
    expect(validateJson(1, str())).toEqual([
      {
        severity: 'error',
        code: 'schema.type-mismatch',
        path: '',
        message: 'Expected string, found a number.',
        expected: 'string',
      },
    ]);
    expect(codes(validateJson(null, bool))).toEqual([['', 'schema.type-mismatch']]);
    expect(codes(validateJson('1', int()))).toEqual([['', 'schema.type-mismatch']]);
  });

  it('requires integers for integral number kinds', () => {
    ok(3, int());
    expect(codes(validateJson(1.5, int()))).toEqual([['', 'schema.not-integer']]);
    for (const numberKind of ['byte', 'short', 'long'] as const) {
      expect(codes(validateJson(0.5, { kind: 'number', numberKind }))).toEqual([
        ['', 'schema.not-integer'],
      ]);
    }
    ok(0.5, { kind: 'number', numberKind: 'double' });
  });

  it('checks numeric ranges with exclusivity', () => {
    const node = int({ range: { min: 0, max: 15 } });
    ok(0, node);
    ok(15, node);
    expect(codes(validateJson(16, node))).toEqual([['', 'schema.out-of-range']]);
    expect(validateJson(-1, node)[0]?.message).toBe('Expected int in range 0..15, found -1.');
    const exclusive = float({ range: { min: 0, minExclusive: true, max: 1, maxExclusive: true } });
    ok(0.5, exclusive);
    expect(codes(validateJson(0, exclusive))).toEqual([['', 'schema.out-of-range']]);
    expect(codes(validateJson(1, exclusive))).toEqual([['', 'schema.out-of-range']]);
    ok(1e9, float({ range: { min: 0 } }));
  });

  it('checks string length', () => {
    const node = str({ lengthRange: { min: 1, max: 3 } });
    ok('abc', node);
    expect(codes(validateJson('', node))).toEqual([['', 'schema.invalid-length']]);
    expect(codes(validateJson('abcd', node))).toEqual([['', 'schema.invalid-length']]);
  });

  it('checks enums by value', () => {
    const node: SchemaNode = {
      kind: 'enum',
      values: [
        { identifier: 'North', value: 'north' },
        { identifier: 'South', value: 'south' },
      ],
    };
    ok('north', node);
    expect(validateJson('up', node)).toEqual([
      {
        severity: 'error',
        code: 'schema.invalid-enum',
        path: '',
        message: 'Expected one of "north", "south", found "up".',
        expected: 'one of "north", "south"',
      },
    ]);
    expect(codes(validateJson(1, node))).toEqual([['', 'schema.type-mismatch']]);
    const numeric: SchemaNode = { kind: 'enum', values: [{ identifier: 'A', value: 1 }] };
    ok(1, numeric);
    expect(codes(validateJson(2, numeric))).toEqual([['', 'schema.invalid-enum']]);
  });

  it('checks literals', () => {
    ok('front', lit('front'));
    ok(90, lit(90));
    expect(codes(validateJson('side', lit('front')))).toEqual([['', 'schema.invalid-literal']]);
    expect(codes(validateJson(1, lit('front')))).toEqual([['', 'schema.type-mismatch']]);
  });

  it('accepts anything for any and unsupported', () => {
    ok({ x: [1, 'a'] }, { kind: 'any' });
    ok(42, { kind: 'unsupported', reason: 'indexed', rawKind: 'indexed' });
    // No errors from inside an unsupported node.
    ok({ a: 1 }, struct([field('a', { kind: 'unsupported', reason: 'x', rawKind: 'indexed' })]));
  });
});

describe('validateJson: structs', () => {
  const node = struct([field('name', str()), opt('count', int())]);

  it('reports missing required fields at the field path', () => {
    ok({ name: 'x' }, node);
    expect(validateJson({}, node)).toEqual([
      {
        severity: 'error',
        code: 'schema.missing-field',
        path: '/name',
        message: 'Missing required field "name" (string).',
        expected: 'string',
      },
    ]);
  });

  it('reports unknown fields', () => {
    expect(codes(validateJson({ name: 'x', extra: 1 }, node))).toEqual([
      ['/extra', 'schema.unknown-field'],
    ]);
    expect(codes(validateJson([], node))).toEqual([['', 'schema.type-mismatch']]);
  });

  it('validates map keys with keyType and values with the field type', () => {
    const map = struct([
      field('*', int(), {
        optional: true,
        keyType: { kind: 'enum', values: [{ identifier: 'Up', value: 'up' }] },
      }),
    ]);
    ok({ up: 1 }, map);
    const problems = validateJson({ down: 'x' }, map);
    expect(codes(problems)).toEqual([
      ['/down', 'schema.invalid-enum'],
      ['/down', 'schema.type-mismatch'],
    ]);
    expect(problems[0]?.message).toMatch(/^Invalid key "down": /);
  });

  it('allows unknown keys when spreads remain', () => {
    const open = struct([field('a', int())], [{ kind: 'any' }]);
    ok({ a: 1, b: 2 }, open);
    expect(codes(validateJson({ a: 'x', b: 2 }, open))).toEqual([['/a', 'schema.type-mismatch']]);
  });

  it('escapes pointer tokens', () => {
    const map = struct([field('*', int(), { optional: true })]);
    expect(codes(validateJson({ 'a/b~c': 'x' }, map))).toEqual([
      ['/a~1b~0c', 'schema.type-mismatch'],
    ]);
  });
});

describe('validateJson: lists, tuples and arrays', () => {
  it('validates items and length', () => {
    const node = list(float({ range: { min: -16, max: 32 } }), {
      lengthRange: { min: 3, max: 3 },
    });
    ok([0, 0, 0], node);
    expect(codes(validateJson([0, 0], node))).toEqual([['', 'schema.invalid-length']]);
    expect(codes(validateJson([0, 40, 'x'], node))).toEqual([
      ['/1', 'schema.out-of-range'],
      ['/2', 'schema.type-mismatch'],
    ]);
    expect(codes(validateJson({}, node))).toEqual([['', 'schema.type-mismatch']]);
  });

  it('validates tuples positionally with fixed arity', () => {
    const node: SchemaNode = { kind: 'tuple', items: [str(), int()] };
    ok(['a', 1], node);
    expect(codes(validateJson([1, 'a'], node))).toEqual([
      ['/0', 'schema.type-mismatch'],
      ['/1', 'schema.type-mismatch'],
    ]);
    expect(codes(validateJson(['a'], node))).toEqual([['', 'schema.invalid-length']]);
    expect(codes(validateJson(['a', 1, 2], node))).toEqual([['', 'schema.invalid-length']]);
  });

  it('validates primitive arrays as lists of numbers', () => {
    const node = list(
      { kind: 'number', numberKind: 'byte', range: { min: -128, max: 127 } },
      { primitiveArray: 'byte', lengthRange: { min: 2 } },
    );
    ok([1, -2], node);
    expect(codes(validateJson([1, 300, 0.5], node))).toEqual([
      ['/1', 'schema.out-of-range'],
      ['/2', 'schema.not-integer'],
    ]);
    expect(validateJson([1], node)[0]?.expected).toBe('byte array');
  });
});

describe('validateJson: unions', () => {
  it('succeeds on the first member without errors', () => {
    const node = union(str(), list(int()));
    ok('a', node);
    ok([1, 2], node);
  });

  it('reports one no-union-match when no member fits the shape', () => {
    expect(validateJson(true, union(lit('front'), lit('side')))).toEqual([
      {
        severity: 'error',
        code: 'schema.no-union-match',
        path: '',
        message: 'No union member matched: expected "front" | "side", found a boolean.',
        expected: '"front" | "side"',
      },
    ]);
    expect(codes(validateJson('top', union(lit('front'), lit('side'))))).toEqual([
      ['', 'schema.no-union-match'],
    ]);
  });

  it('reports the best-matching member with a prefix', () => {
    const node = union(
      str(),
      struct([field('a', int()), field('b', int())]),
      struct([field('a', int()), field('c', int())]),
    );
    const problems = validateJson({ a: 1, b: 'x' }, node);
    expect(codes(problems)).toEqual([['/b', 'schema.type-mismatch']]);
    expect(problems[0]?.message).toBe(
      'No union member matched; closest: Expected int, found a string.',
    );
  });

  it('breaks ties with the first member', () => {
    const node = union(struct([field('a', int())]), struct([field('b', int())]));
    expect(codes(validateJson({}, node))).toEqual([['/a', 'schema.missing-field']]);
  });

  it('keeps warnings from the matching member', () => {
    const registries = createRegistryIndex({ vanilla: { item: ['stone'] } });
    const node = union(int(), str({ idRegistry: 'item' }));
    expect(codes(validateJson('dirt', node, { registries }))).toEqual([['', 'schema.unknown-id']]);
  });
});

describe('validateJson: references', () => {
  it('follows references through resolve()', () => {
    const node = ref('::t::Name', () => str());
    ok('a', node);
    expect(codes(validateJson(1, node))).toEqual([['', 'schema.type-mismatch']]);
  });

  it('is cycle-safe', () => {
    // A recursive list type: `type Tree = [Tree] | string`.
    const tree: SchemaNode = union(str(), list(ref('::t::Tree', () => tree)));
    ok(['a', ['b', [['c']]]], tree);
    expect(codes(validateJson(['a', [1]], tree))).toHaveLength(1);
    // A reference to itself with no value consumed terminates.
    const loop: SchemaNode = ref('::t::Loop', () => loop);
    ok('anything', loop);
    const selfUnion: SchemaNode = union(
      ref('::t::U', () => selfUnion),
      int(),
    );
    expect(validateJson(1, selfUnion)).toEqual([]);
  });

  it('accepts a dangling reference', () => {
    const node = ref('::t::Missing', () => {
      throw new Error('missing');
    });
    ok(1, node);
  });

  it('stops at maxDepth', () => {
    const nested = { a: { a: { a: { a: 'x' } } } };
    const node: SchemaNode = struct([
      field(
        'a',
        union(
          str(),
          ref('::t::N', () => node),
        ),
      ),
    ]);
    expect(validateJson(nested, node)).toEqual([]);
    expect(validateJson({ a: { a: { a: { a: 1 } } } }, node).length).toBeGreaterThan(0);
    expect(validateJson({ a: { a: { a: { a: 1 } } } }, node, { maxDepth: 2 })).toEqual([]);
  });
});

describe('validateJson: dispatchers', () => {
  const shapes = dispatcher('test:shape', ['type'], {
    circle: struct([field('radius', float())]),
    square: struct([field('side', float()), opt('rounded', bool)]),
  });
  const shape = struct([field('type', str())], [shapes]);

  it('selects a spread member by a field of the object', () => {
    ok({ type: 'circle', radius: 1 }, shape);
    ok({ type: 'minecraft:square', side: 2 }, shape);
    expect(codes(validateJson({ type: 'circle' }, shape))).toEqual([
      ['/radius', 'schema.missing-field'],
    ]);
    expect(codes(validateJson({ type: 'square', side: 'x' }, shape))).toEqual([
      ['/side', 'schema.type-mismatch'],
    ]);
  });

  it('reports a missing discriminator', () => {
    const optionalType = struct([opt('type', str())], [shapes]);
    expect(validateJson({ radius: 1 }, optionalType)).toEqual([
      {
        severity: 'error',
        code: 'schema.missing-discriminator',
        path: '/type',
        message: 'Missing "type", which selects the test:shape member.',
        expected: 'test:shape key',
      },
    ]);
  });

  it('reports an unknown key and lists up to ten valid keys', () => {
    const problems = validateJson({ type: 'hexagon' }, shape);
    expect(problems).toEqual([
      {
        severity: 'error',
        code: 'schema.unknown-dispatch-key',
        path: '/type',
        message: 'Unknown test:shape key "hexagon"; expected one of circle, square.',
        expected: 'test:shape key',
      },
    ]);
    const many: Record<string, SchemaNode> = {};
    for (let i = 0; i < 12; i += 1) many[`k${String(i).padStart(2, '0')}`] = { kind: 'any' };
    const wide = struct([field('type', str())], [dispatcher('test:wide', ['type'], many)]);
    const message = validateJson({ type: 'zz' }, wide)[0]?.message ?? '';
    expect(message).toContain('k09, ...');
    expect(message).not.toContain('k10');
  });

  it('uses %unknown and %none members when present', () => {
    const lenient = struct(
      [opt('type', str())],
      [dispatcher('test:lenient', ['type'], { a: { kind: 'any' }, '%unknown': { kind: 'any' } })],
    );
    ok({ type: 'zzz' }, lenient);
    const none = struct(
      [opt('type', str())],
      [dispatcher('test:none', ['type'], { a: { kind: 'any' }, '%none': struct([]) })],
    );
    ok({}, none);
  });

  it('reports keys that neither the struct nor its spread member declares', () => {
    expect(validateJson({ type: 'circle', radius: 1, bogus: 1 }, shape)).toEqual([
      {
        severity: 'error',
        code: 'schema.unknown-field',
        path: '/bogus',
        message: 'Unknown field "bogus"; expected one of radius, type.',
      },
    ]);
    // Nested spreads share the owner's keys.
    const nested = struct(
      [field('kind', str())],
      [dispatcher('test:outer', ['kind'], { a: struct([field('type', str())], [shapes]) })],
    );
    ok({ kind: 'a', type: 'circle', radius: 1 }, nested);
    expect(codes(validateJson({ kind: 'a', type: 'circle', radius: 1, y: 2 }, nested))).toEqual([
      ['/y', 'schema.unknown-field'],
    ]);
  });

  it('allows every key when a spread cannot be resolved to fields', () => {
    const lenient = struct(
      [field('type', str())],
      [dispatcher('test:lenient', ['type'], { a: { kind: 'any' } })],
    );
    ok({ type: 'a', anything: 1 }, lenient);
    // An unknown key is reported once, not followed by every other field.
    expect(codes(validateJson({ type: 'hexagon', radius: 1 }, shape))).toEqual([
      ['/type', 'schema.unknown-dispatch-key'],
    ]);
    const open = struct(
      [field('type', str())],
      [{ kind: 'unsupported', reason: 'x' } as SchemaNode],
    );
    ok({ type: 'a', extra: true }, open);
  });

  it('reads a sibling field for a dispatcher-typed field', () => {
    const node = struct([
      field('type', str()),
      field('value', dispatcher('test:value', ['type'], { int: int(), text: str() })),
    ]);
    ok({ type: 'int', value: 1 }, node);
    expect(codes(validateJson({ type: 'text', value: 1 }, node))).toEqual([
      ['/value', 'schema.type-mismatch'],
    ]);
  });

  it('uses the parent key for %key', () => {
    const node = struct([
      field('*', dispatcher('test:keyed', ['%key'], { size: int(), name: str() }), {
        optional: true,
      }),
    ]);
    ok({ size: 1, name: 'a' }, node);
    expect(codes(validateJson({ size: 'a' }, node))).toEqual([['/size', 'schema.type-mismatch']]);
    expect(codes(validateJson({ other: 1 }, node))).toEqual([
      ['/other', 'schema.unknown-dispatch-key'],
    ]);
  });

  it('accepts an enum discriminator with or without the minecraft: prefix', () => {
    const typeEnum: SchemaNode = {
      kind: 'enum',
      values: [
        { identifier: 'Circle', value: 'circle' },
        { identifier: 'Square', value: 'square' },
      ],
    };
    const node = struct([field('type', typeEnum)], [shapes]);
    ok({ type: 'circle', radius: 1 }, node);
    ok({ type: 'minecraft:circle', radius: 1 }, node);
    ok({ type: 'minecraft:square', side: 2 }, node);
    expect(codes(validateJson({ type: 'minecraft:hexagon' }, node))).toEqual([
      ['/type', 'schema.invalid-enum'],
      ['/type', 'schema.unknown-dispatch-key'],
    ]);
    expect(codes(validateJson({ type: 'other:circle', radius: 1 }, node))).toEqual([
      ['/type', 'schema.invalid-enum'],
      ['/type', 'schema.unknown-dispatch-key'],
    ]);
  });

  it('accepts an enum discriminator value that has no dispatcher member', () => {
    // Like `minecraft:item_model`: the `type` enum lists `empty`, the dispatcher does not.
    const typeEnum: SchemaNode = {
      kind: 'enum',
      values: [
        { identifier: 'Circle', value: 'circle' },
        { identifier: 'Empty', value: 'empty' },
        { identifier: 'Square', value: 'square' },
      ],
    };
    const node = struct(
      [
        field(
          'type',
          ref('test:Type', () => typeEnum),
        ),
      ],
      [shapes],
    );
    ok({ type: 'empty' }, node);
    ok({ type: 'minecraft:empty' }, node);
    // A member that adds no fields declares nothing, so extra fields are unknown.
    expect(codes(validateJson({ type: 'empty', note: 1 }, node))).toEqual([
      ['/note', 'schema.unknown-field'],
    ]);
    // Known members are still checked.
    expect(codes(validateJson({ type: 'minecraft:circle' }, node))).toEqual([
      ['/radius', 'schema.missing-field'],
    ]);
    // Keys outside the enum are still reported by both checks.
    expect(codes(validateJson({ type: 'minecraft:hexagon' }, node))).toEqual([
      ['/type', 'schema.invalid-enum'],
      ['/type', 'schema.unknown-dispatch-key'],
    ]);
    expect(codes(validateJson({ type: 'other:empty' }, node))).toEqual([
      ['/type', 'schema.invalid-enum'],
      ['/type', 'schema.unknown-dispatch-key'],
    ]);
  });

  it('accepts a literal discriminator that has no dispatcher member', () => {
    const node = struct([field('type', union(lit('empty'), lit('circle')))], [shapes]);
    ok({ type: 'empty' }, node);
    expect(codes(validateJson({ type: 'hexagon' }, node))).toEqual([
      ['/type', 'schema.no-union-match'],
      ['/type', 'schema.unknown-dispatch-key'],
    ]);
  });

  it('keeps reporting unknown keys when the discriminator field is an open string', () => {
    expect(codes(validateJson({ type: 'empty' }, shape))).toEqual([
      ['/type', 'schema.unknown-dispatch-key'],
    ]);
    expect(codes(validateJson({ type: 'minecraft:empty' }, shape))).toEqual([
      ['/type', 'schema.unknown-dispatch-key'],
    ]);
  });

  it('keeps rejecting a minecraft: prefix on enums that are not discriminators', () => {
    const facing: SchemaNode = {
      kind: 'enum',
      values: [
        { identifier: 'North', value: 'north' },
        { identifier: 'South', value: 'south' },
      ],
    };
    const node = struct([field('type', str()), opt('facing', facing)], [shapes]);
    ok({ type: 'circle', radius: 1, facing: 'north' }, node);
    expect(
      codes(validateJson({ type: 'circle', radius: 1, facing: 'minecraft:north' }, node)),
    ).toEqual([['/facing', 'schema.invalid-enum']]);
    expect(codes(validateJson('minecraft:north', facing))).toEqual([['', 'schema.invalid-enum']]);
  });

  it('accepts %parent accessors, static indices and empty registries', () => {
    ok(1, dispatcher('test:p', ['%parent', 'type'], { a: str() }));
    ok('x', dispatcher('test:empty', ['type'], {}));
    const staticNode: SchemaNode = {
      kind: 'dispatcher',
      registry: 'test:static',
      discriminator: [],
      keys: () => ['%fallback'],
      dispatch: () => int(),
    };
    ok(1, staticNode);
    expect(codes(validateJson('a', staticNode))).toEqual([['', 'schema.type-mismatch']]);
  });
});

describe('validateJson: registry ids', () => {
  const registries = createRegistryIndex({
    vanilla: { item: ['stone', 'dirt'] },
    project: { item: ['demo:gem'] },
  });
  const node = str({ idRegistry: 'item' });

  it('warns about unknown ids only when registries are given', () => {
    ok('nothing', node);
    expect(validateJson('stone', node, { registries })).toEqual([]);
    expect(validateJson('minecraft:dirt', node, { registries })).toEqual([]);
    expect(validateJson('demo:gem', node, { registries })).toEqual([]);
    expect(validateJson('#minecraft:logs', node, { registries })).toEqual([]);
    expect(validateJson('demo:nothing', node, { registries })).toEqual([
      {
        severity: 'warning',
        code: 'schema.unknown-id',
        path: '',
        message: 'Unknown item id "demo:nothing".',
        expected: 'item id',
      },
    ]);
  });

  it('applies an #[id(path=...)] prefix to the lookup, not the written value', () => {
    const textures = createRegistryIndex({
      vanilla: { texture: ['entity/banner/creeper', 'palettes/trim/quartz'] },
    });
    const banner = str({ idRegistry: 'texture', idPath: 'entity/banner/' });
    expect(validateJson('minecraft:creeper', banner, { registries: textures })).toEqual([]);
    expect(validateJson('creeper', banner, { registries: textures })).toEqual([]);
    const palette = str({ idRegistry: 'texture', idPath: 'palettes/' });
    expect(validateJson('minecraft:trim/quartz', palette, { registries: textures })).toEqual([]);
    expect(
      validateJson('minecraft:entity/banner/creeper', banner, { registries: textures }),
    ).toEqual([
      {
        severity: 'warning',
        code: 'schema.unknown-id',
        path: '',
        message:
          'Unknown texture id "minecraft:entity/banner/creeper" ("minecraft:entity/banner/entity/banner/creeper").',
        expected: 'texture id',
      },
    ]);
  });

  it('skips registries the index does not know', () => {
    expect(validateJson('x', str({ idRegistry: 'model' }), { registries })).toEqual([]);
  });
});

describe('validateJson: output', () => {
  it('sorts by path then code', () => {
    const node = struct([field('b', int()), field('a', int({ range: { max: 0 } }))]);
    expect(codes(validateJson({ b: 'x', a: 1.5, z: 1 }, node))).toEqual([
      ['/a', 'schema.not-integer'],
      ['/a', 'schema.out-of-range'],
      ['/b', 'schema.type-mismatch'],
      ['/z', 'schema.unknown-field'],
    ]);
  });

  it('validates 10 000 objects of 50 fields in under 10 s (catches pathological slowdowns; CI runners are slow)', () => {
    const fields: SchemaField[] = [];
    const value: Record<string, Json> = {};
    for (let i = 0; i < 50; i += 1) {
      const kind = i % 5;
      const key = `field_${i}`;
      if (kind === 0) {
        fields.push(field(key, str()));
        value[key] = 'text';
      } else if (kind === 1) {
        fields.push(field(key, int({ range: { min: 0, max: 100 } })));
        value[key] = i;
      } else if (kind === 2) {
        fields.push(opt(key, bool));
        value[key] = true;
      } else if (kind === 3) {
        fields.push(field(key, list(float(), { lengthRange: { min: 3, max: 3 } })));
        value[key] = [1, 2, 3];
      } else {
        fields.push(opt(key, union(lit('a'), lit('b'))));
        value[key] = 'b';
      }
    }
    const node = struct(fields);
    expect(validateJson(value, node)).toEqual([]);
    const start = performance.now();
    for (let i = 0; i < 10_000; i += 1) validateJson(value, node);
    expect(performance.now() - start).toBeLessThan(10_000);
  });
});
