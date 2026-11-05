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
 * The MSM conformance corpus (ADR 0025 D7, ADR 0028 D7), shared with the runtime's JUnit tests:
 * `conformance/definition/` holds runtime definitions, `conformance/element/` element data,
 * `conformance/geometry/` and `conformance/animation/` the GeckoLib JSON of the
 * `msm:geo_model` and `msm:animation` elements. `conformance/definition-script/` holds runtime
 * definitions with the `run_script` action (ADR 0032 D4), kept apart until the runtime's
 * Codecs learn the action (its JUnit test reads `definition/` only). The file name prefix selects the schema;
 * `expected-errors.json` maps each invalid file to one error (pointer and code) that
 * `validateJson` must report.
 */
const CORPUS = new URL('../mcdoc/msm/conformance/', import.meta.url);

type Group = 'definition' | 'definition-script' | 'element' | 'geometry' | 'animation';

const SCHEMAS: Record<Group, Record<string, string>> = {
  definition: {
    block: MSM_SCHEMA_REFS.blockDefinition,
    item: MSM_SCHEMA_REFS.itemDefinition,
    entity: MSM_SCHEMA_REFS.entityDefinition,
  },
  'definition-script': {
    block: MSM_SCHEMA_REFS.blockDefinition,
    item: MSM_SCHEMA_REFS.itemDefinition,
    entity: MSM_SCHEMA_REFS.entityDefinition,
  },
  element: {
    block: MSM_SCHEMA_REFS.block,
    item: MSM_SCHEMA_REFS.item,
    mod: MSM_SCHEMA_REFS.mod,
    entity: MSM_SCHEMA_REFS.entity,
  },
  geometry: { geometry: MSM_SCHEMA_REFS.geoModel },
  animation: { animation: MSM_SCHEMA_REFS.animation },
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

const GROUPS: Group[] = ['definition', 'definition-script', 'element', 'geometry', 'animation'];

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
      'play_animation',
      'play_sound',
      'run_function',
      'run_script',
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

  /**
   * Every key path (`/a/b`, list indices dropped; keys of the map-like objects at `maps` as
   * `*`) and every action `type` in a value.
   */
  const collect = (
    value: Json,
    path: string,
    maps: ReadonlySet<string>,
    keys: Set<string>,
    actions: Set<string>,
  ): void => {
    if (Array.isArray(value)) {
      for (const entry of value) collect(entry, path, maps, keys, actions);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    for (const [key, entry] of Object.entries(value)) {
      const next = maps.has(path) ? `${path}/*` : `${path}/${key}`;
      keys.add(next);
      if (key === 'actions' && Array.isArray(entry)) {
        for (const action of entry) {
          if (typeof action === 'object' && action !== null && !Array.isArray(action)) {
            if (typeof action.type === 'string') actions.add(action.type);
          }
        }
      }
      collect(entry, next, maps, keys, actions);
    }
  };

  /** Paths of the map-like structs (`[string]: T`) of a schema, and always `/events`. */
  const mapPaths = (ref: string | undefined): Set<string> => {
    const maps = new Set(['/events']);
    if (ref === undefined) return maps;
    const declared = new Set<string>();
    fieldPaths(index.resolveSchemaRef(ref), '', declared);
    for (const path of declared) if (path.endsWith('/*')) maps.add(path.slice(0, -2));
    return maps;
  };

  const covered = (group: Group, prefix: string) => {
    const keys = new Set<string>();
    const actions = new Set<string>();
    const maps = mapPaths(SCHEMAS[group][prefix]);
    for (const name of files(group, 'valid').filter((n) => n.startsWith(`${prefix}-`))) {
      collect(read(group, 'valid', name), '', maps, keys, actions);
    }
    return { keys, actions };
  };

  it('uses every action type in a valid entity definition, and every other one in a valid block and item definition', () => {
    const all = index.dispatcherKeys('msm:action');
    // Runtime definitions span `definition/` and `definition-script/` (`run_script`).
    const definitionActions = (prefix: string): string[] =>
      [
        ...new Set([
          ...covered('definition', prefix).actions,
          ...covered('definition-script', prefix).actions,
        ]),
      ].sort();
    expect(definitionActions('entity')).toEqual(all);
    // `play_animation` is dropped with a warning outside entity definitions (ADR 0028 D4).
    const blockAndItem = all.filter((type) => type !== 'play_animation');
    expect(definitionActions('block')).toEqual(blockAndItem);
    expect(definitionActions('item')).toEqual(blockAndItem);
  });

  it('uses every goal type in a valid entity definition and element', () => {
    const goals = (group: Group): string[] => {
      const types = new Set<string>();
      for (const name of files(group, 'valid').filter((n) => n.startsWith('entity-'))) {
        const value = read(group, 'valid', name);
        if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
        const list = (value.components as { 'msm:ai_goals'?: { goals?: { type?: unknown }[] } })?.[
          'msm:ai_goals'
        ]?.goals;
        for (const goal of list ?? []) if (typeof goal.type === 'string') types.add(goal.type);
      }
      return [...types].sort();
    };
    expect(goals('definition')).toEqual(index.dispatcherKeys('msm:ai_goal'));
    expect(goals('element')).toEqual(index.dispatcherKeys('msm:ai_goal'));
  });

  it.each([
    ['definition', 'block', MSM_SCHEMA_REFS.blockDefinition],
    ['definition', 'item', MSM_SCHEMA_REFS.itemDefinition],
    ['element', 'block', MSM_SCHEMA_REFS.block],
    ['element', 'item', MSM_SCHEMA_REFS.item],
    ['element', 'mod', MSM_SCHEMA_REFS.mod],
    ['definition', 'entity', MSM_SCHEMA_REFS.entityDefinition],
    ['element', 'entity', MSM_SCHEMA_REFS.entity],
    ['geometry', 'geometry', MSM_SCHEMA_REFS.geoModel],
    ['animation', 'animation', MSM_SCHEMA_REFS.animation],
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
