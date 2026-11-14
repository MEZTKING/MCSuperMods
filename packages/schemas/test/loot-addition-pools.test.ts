import { readdirSync, readFileSync } from 'node:fs';
import type { Json } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  createSchemaIndex,
  MSM_SCHEMA_REFS,
  MSM_TYPE_PATHS,
  parseVanillaMcdocSymbols,
  type SchemaIndex,
  type SchemaNode,
  type VanillaMcdocSymbols,
  validateJson,
} from '../src/index';

/**
 * ADR 0060 D3: MSM mcdoc types a loot addition's `pools` as `[any]`, and `resolveSchemaRef`
 * substitutes the export's `::java::data::loot::LootPool` for the item type, so the element
 * check, the export gate and the forms all check pools against the target's pool format.
 */

const LOOT_REFS = [MSM_SCHEMA_REFS.lootAddition, MSM_SCHEMA_REFS.lootAdditionDefinition] as const;

const poolsItem = (node: SchemaNode): SchemaNode | undefined => {
  let root = node;
  while (root.kind === 'reference') root = root.resolve();
  if (root.kind !== 'struct') return undefined;
  const pools = root.fields.find((field) => field.key === 'pools')?.type;
  return pools?.kind === 'list' ? pools.item : undefined;
};

describe('loot addition pools (synthetic export)', () => {
  const pool = {
    kind: 'struct',
    fields: [{ kind: 'pair', key: 'rolls', type: { kind: 'int' } }],
  };

  it('keeps any when the export has no LootPool', () => {
    const index = createSchemaIndex({ ref: 'x', mcdoc: {}, dispatchers: {} }, { mcVersion: '1.0' });
    for (const ref of LOOT_REFS) expect(poolsItem(index.resolveSchemaRef(ref))?.kind).toBe('any');
  });

  it('substitutes LootPool for the pool items and memoises the result', () => {
    const symbols = {
      ref: 'x',
      mcdoc: { '::java::data::loot::LootPool': pool },
      dispatchers: {},
    } as unknown as VanillaMcdocSymbols;
    const index = createSchemaIndex(symbols, { mcVersion: '1.0' });
    const lootPool = index.resolve('::java::data::loot::LootPool');
    for (const ref of LOOT_REFS) {
      const node = index.resolveSchemaRef(ref);
      expect(poolsItem(node)).toBe(lootPool);
      expect(index.resolveSchemaRef(ref)).toBe(node);
      const data = { format: 1, tables: ['minecraft:entities/zombie'], pools: [{ rolls: 'x' }] };
      expect(validateJson(data, node).map((p) => p.path)).toEqual(['/pools/0/rolls']);
    }
    // The plain type paths keep the MSM mcdoc type.
    expect(poolsItem(index.resolve(MSM_TYPE_PATHS.lootAddition))?.kind).toBe('any');
    expect(poolsItem(index.resolveSchemaRef(MSM_SCHEMA_REFS.block))).toBeUndefined();
  });
});

/**
 * The vendored exports of every built-in target (`packages/targets/mc-<version>/`), read by
 * path: this package cannot depend on `@msm/targets`, and the check is about the substitution,
 * not the target data.
 */
const TARGETS_DIR = new URL('../../targets/', import.meta.url);
const TARGETS: (readonly [string, string])[] = readdirSync(TARGETS_DIR)
  .filter((name) => name.startsWith('mc-'))
  .sort()
  .map((name) => [name.slice('mc-'.length), `${name}/vendor/vanilla-mcdoc/symbols.json`] as const);

it('finds the built-in targets', () => {
  expect(TARGETS.length).toBeGreaterThanOrEqual(2);
});

const indexFor = (mcVersion: string, path: string): SchemaIndex =>
  createSchemaIndex(
    parseVanillaMcdocSymbols(JSON.parse(readFileSync(new URL(path, TARGETS_DIR), 'utf8'))),
    { mcVersion },
  );

const errors = (data: Json, node: SchemaNode) =>
  validateJson(data, node).filter((problem) => problem.severity === 'error');

describe.each(TARGETS)('loot addition pools on %s', (mcVersion, path) => {
  const index = indexFor(mcVersion, path);

  const current: Json = {
    format: 1,
    tables: ['minecraft:entities/zombie'],
    pools: [
      {
        rolls: 1,
        entries: [{ type: 'minecraft:item', name: 'minecraft:emerald' }],
        condition: { type: 'minecraft:random_chance', chance: 0.5 },
        modifier: { type: 'minecraft:set_count', count: 2 },
      },
    ],
  };

  const old: Json = {
    format: 1,
    tables: ['minecraft:entities/zombie'],
    pools: [
      {
        rolls: 1,
        entries: [{ type: 'minecraft:item', name: 'minecraft:emerald' }],
        conditions: [{ condition: 'minecraft:random_chance', chance: 0.5 }],
        functions: [{ function: 'minecraft:set_count', count: 2 }],
      },
    ],
  };

  it.each(LOOT_REFS)('%s accepts the current pool format', (ref) => {
    expect(errors(current, index.resolveSchemaRef(ref))).toEqual([]);
  });

  it.each(LOOT_REFS)('%s rejects conditions and functions', (ref) => {
    const paths = errors(old, index.resolveSchemaRef(ref)).map((problem) => problem.path);
    expect(paths.some((p) => p.startsWith('/pools/0/conditions'))).toBe(true);
    expect(paths.some((p) => p.startsWith('/pools/0/functions'))).toBe(true);
  });

  it.each(LOOT_REFS)('%s checks pool entries', (ref) => {
    const bad: Json = { ...(current as object), pools: [{ rolls: 1, entries: 'x' }] } as Json;
    expect(errors(bad, index.resolveSchemaRef(ref)).map((p) => p.path)).toContain(
      '/pools/0/entries',
    );
  });
});
