import { readFile } from 'node:fs/promises';
import type { Json } from '@msm/plugin-api';
import {
  createRegistryIndex,
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type SchemaProblem,
  validateJson,
} from '@msm/schemas';
import { describe, expect, it } from 'vitest';
import { target, vendored } from '../src/index';

async function readJson(url: URL): Promise<unknown> {
  return JSON.parse(await readFile(url, 'utf8')) as unknown;
}

const symbols = parseVanillaMcdocSymbols(await readJson(vendored.vanillaMcdocSymbols));
const index = createSchemaIndex(symbols, { mcVersion: target.mcVersion });
const registries = createRegistryIndex({
  vanilla: (await readJson(vendored.mcmetaRegistries)) as Record<string, string[]>,
});
const lootTable = index.dispatch('minecraft:resource', 'loot_table');
const errors = (value: Json): [string, string][] => {
  if (lootTable === undefined) throw new Error('no loot_table resource schema');
  return validateJson(value, lootTable, { registries })
    .filter((problem: SchemaProblem) => problem.severity === 'error')
    .map((problem) => [problem.path, problem.code]);
};

/** A block loot table in the shape vanilla data files use. */
const table = (type: string, condition: Json): Json => ({
  type,
  pools: [
    {
      rolls: 1,
      entries: [{ type: 'minecraft:item', name: 'minecraft:stone' }],
      condition,
    },
  ],
});

describe('26.3 loot table validation (real export)', () => {
  it('accepts namespaced #[id] enum values and fieldless registered conditions', () => {
    expect(errors(table('minecraft:block', { type: 'minecraft:survives_explosion' }))).toEqual([]);
    expect(errors(table('block', { type: 'minecraft:survives_explosion' }))).toEqual([]);
    expect(
      errors(table('minecraft:block', { type: 'minecraft:random_chance', chance: 0.5 })),
    ).toEqual([]);
  });

  it('still reports unknown param sets and unknown condition types', () => {
    expect(errors(table('minecraft:nope', { type: 'minecraft:survives_explosion' }))).toEqual([
      ['/type', 'schema.invalid-enum'],
    ]);
    const unknown = errors(table('minecraft:block', { type: 'minecraft:made_up' }));
    expect(unknown).toContainEqual(['/pools/0/condition/type', 'schema.unknown-dispatch-key']);
  });
});
