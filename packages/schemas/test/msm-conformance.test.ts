import { readdirSync, readFileSync } from 'node:fs';
import type { Json } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  createSchemaIndex,
  MSM_SCHEMA_REFS,
  MSM_TYPE_PATHS,
  msmMcdocSymbols,
  type SchemaNode,
  validateJson,
} from '../src/index';

/**
 * The MSM conformance corpus (ADR 0025 D7), shared with the runtime's JUnit tests:
 * `conformance/definition/` holds runtime definitions, `conformance/element/` element data.
 * The file name prefix selects the schema; `expected-errors.json` maps each invalid file to
 * one error (pointer and code) that `validateJson` must report.
 */
const CORPUS = new URL('../mcdoc/msm/conformance/', import.meta.url);

type Group = 'definition' | 'element';

const SCHEMAS: Record<Group, Record<string, string>> = {
  definition: {
    block: MSM_SCHEMA_REFS.blockDefinition,
    item: MSM_SCHEMA_REFS.itemDefinition,
  },
  element: { block: MSM_SCHEMA_REFS.block, item: MSM_SCHEMA_REFS.item, mod: MSM_SCHEMA_REFS.mod },
};

interface Expected {
  path: string;
  code: string;
}

const index = createSchemaIndex({ ref: 'empty', mcdoc: {}, dispatchers: {} }, { mcVersion: '1.0' });

const files = (group: Group, kind: 'valid' | 'invalid'): string[] =>
  readdirSync(new URL(`${group}/${kind}/`, CORPUS))
    .filter((name) => name.endsWith('.json'))
    .sort();

const read = (group: Group, kind: 'valid' | 'invalid', name: string): Json =>
  JSON.parse(readFileSync(new URL(`${group}/${kind}/${name}`, CORPUS), 'utf8')) as Json;

const expectations = (group: Group): Record<string, Expected> =>
  JSON.parse(readFileSync(new URL(`${group}/expected-errors.json`, CORPUS), 'utf8')) as Record<
    string,
    Expected
  >;

const schemaFor = (group: Group, name: string): SchemaNode => {
  const prefix = name.split('-')[0] ?? '';
  const ref = SCHEMAS[group][prefix];
  if (ref === undefined) throw new Error(`${group}/${name}: unknown file name prefix "${prefix}"`);
  return index.resolveSchemaRef(ref);
};

const GROUPS: Group[] = ['definition', 'element'];

describe('MSM mcdoc symbols', () => {
  it('load and resolve through every schema reference and type path', () => {
    const symbols = msmMcdocSymbols();
    expect(symbols.ref).toMatch(/^msm-mcdoc:sha256:[0-9a-f]{64}$/);
    for (const ref of Object.values(MSM_SCHEMA_REFS)) {
      expect(index.resolveSchemaRef(ref).kind).toBe('struct');
    }
    for (const path of Object.values(MSM_TYPE_PATHS)) {
      expect(index.has(path)).toBe(true);
      expect(index.resolveSchemaRef(path).kind).toBe('struct');
    }
    expect(index.resolveSchemaRef(MSM_SCHEMA_REFS.block)).toBe(index.resolve(MSM_TYPE_PATHS.block));
    expect(index.dispatcherKeys('msm:action')).toEqual([
      'give_item',
      'play_sound',
      'run_function',
      'set_block_state',
      'spawn_particle',
      'trigger_event',
    ]);
  });

  it('keep the vanilla ref and paths of the target symbols', () => {
    const vanilla = createSchemaIndex(
      { ref: 'vanilla-ref', mcdoc: { '::t::X': { kind: 'boolean' } }, dispatchers: {} },
      { mcVersion: '1.0' },
    );
    expect(vanilla.ref).toBe('vanilla-ref');
    expect(vanilla.has('::t::X')).toBe(true);
    expect(vanilla.has(MSM_TYPE_PATHS.itemDefinition)).toBe(true);
  });
});

describe.each(GROUPS)('MSM conformance corpus: %s', (group) => {
  const valid = files(group, 'valid');
  const invalid = files(group, 'invalid');
  const expected = expectations(group);

  it('has valid and invalid cases, each invalid one with an expected error', () => {
    expect(valid.length).toBeGreaterThan(0);
    expect(invalid.length).toBeGreaterThan(0);
    expect(Object.keys(expected).sort()).toEqual(invalid);
  });

  it.each(valid)('valid/%s has no problems', (name) => {
    expect(validateJson(read(group, 'valid', name), schemaFor(group, name))).toEqual([]);
  });

  it.each(invalid)('invalid/%s reports its expected error', (name) => {
    const problems = validateJson(read(group, 'invalid', name), schemaFor(group, name));
    expect(problems.some((p) => p.severity === 'error')).toBe(true);
    const want = expected[name];
    expect(problems.map((p) => `${p.path} ${p.code}`)).toContain(`${want?.path} ${want?.code}`);
  });
});

describe('MSM conformance corpus coverage', () => {
  /** Every key path (`/a/b`, list indices dropped) and every action `type` in a value. */
  const collect = (value: Json, path: string, keys: Set<string>, actions: Set<string>): void => {
    if (Array.isArray(value)) {
      for (const entry of value) collect(entry, path, keys, actions);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    for (const [key, entry] of Object.entries(value)) {
      const next = path.endsWith('/events') ? `${path}/*` : `${path}/${key}`;
      keys.add(next);
      if (key === 'actions' && Array.isArray(entry)) {
        for (const action of entry) {
          if (typeof action === 'object' && action !== null && !Array.isArray(action)) {
            if (typeof action.type === 'string') actions.add(action.type);
          }
        }
      }
      collect(entry, next, keys, actions);
    }
  };

  const covered = (group: Group, prefix: string) => {
    const keys = new Set<string>();
    const actions = new Set<string>();
    for (const name of files(group, 'valid').filter((n) => n.startsWith(`${prefix}-`))) {
      collect(read(group, 'valid', name), '', keys, actions);
    }
    return { keys, actions };
  };

  /** Field paths of a struct schema (map fields as `*`), depth-first. */
  const fieldPaths = (node: SchemaNode, path: string, out: Set<string>, depth = 0): void => {
    if (depth > 6) return;
    const target = node.kind === 'reference' ? node.resolve() : node;
    if (target.kind === 'list') {
      fieldPaths(target.item, path, out, depth + 1);
      return;
    }
    if (target.kind !== 'struct') return;
    for (const field of target.fields) {
      const next = `${path}/${field.key}`;
      out.add(next);
      fieldPaths(field.type, next, out, depth + 1);
    }
  };

  it('uses every action type in a valid block and item definition', () => {
    const all = index.dispatcherKeys('msm:action');
    expect([...covered('definition', 'block').actions].sort()).toEqual(all);
    expect([...covered('definition', 'item').actions].sort()).toEqual(all);
  });

  it.each([
    ['definition', 'block', MSM_SCHEMA_REFS.blockDefinition],
    ['definition', 'item', MSM_SCHEMA_REFS.itemDefinition],
    ['element', 'block', MSM_SCHEMA_REFS.block],
    ['element', 'item', MSM_SCHEMA_REFS.item],
    ['element', 'mod', MSM_SCHEMA_REFS.mod],
  ] as const)('sets every %s %s field in some valid file', (group, prefix, ref) => {
    const declared = new Set<string>();
    fieldPaths(index.resolveSchemaRef(ref), '', declared);
    // Action fields are reached through the `msm:action` dispatcher, checked above.
    const missing = [...declared]
      .filter((path) => !path.includes('/actions/'))
      .filter((path) => !covered(group, prefix).keys.has(path));
    expect(missing).toEqual([]);
  });
});
