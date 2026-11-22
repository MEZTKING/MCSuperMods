/**
 * Coverage of each target's loot type lists (ADR 0085 D5 and ADR 0120 D9, say it out loud; B605
 * exit criteria): every pool entry, loot function, enchantment provider and number type a
 * target's vendored registries list has a fidelity in the loot code, and running each one either
 * works or names it in `unsupported`. A new type in a target fails this test until it is one or
 * the other. The registries are read by file path, as `@msm/sim` may not depend on the targets.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Target } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  applyItemModifier,
  ENCHANTMENT_PROVIDER_SUPPORT,
  FLOAT_NUMBER_SUPPORT,
  INT_NUMBER_SUPPORT,
  INT_PROVIDER_SUPPORT,
  LEVEL_VALUE_SUPPORT,
  LOOT_ENTRY_SUPPORT,
  LOOT_FUNCTION_SUPPORT,
  rollEnchantmentProvider,
  rollLoot,
} from '../../src/index.js';
import { builtInTargets, REPO_ROOT } from '../lower-fixture.js';
import { fakeContext } from './helpers.js';

const targetFolders = readdirSync(join(REPO_ROOT, 'packages/targets')).filter((name) =>
  name.startsWith('mc-'),
);
const TARGET = (await builtInTargets())[0] as Target;
const CHEST = { context: 'minecraft:chest' };

const registries = (folder: string): Record<string, string[]> =>
  JSON.parse(
    readFileSync(
      join(REPO_ROOT, 'packages/targets', folder, 'vendor/mcmeta/registries.json'),
      'utf8',
    ),
  ) as Record<string, string[]>;

const sorted = (list: readonly string[] | undefined): string[] => [...(list ?? [])].sort();

describe.each(targetFolders)('the loot type lists of %s', (folder) => {
  const lists = registries(folder);

  it('has a fidelity for every pool entry type, and no other', () => {
    expect(lists.loot_pool_entry_type?.length).toBeGreaterThanOrEqual(9);
    expect(sorted(Object.keys(LOOT_ENTRY_SUPPORT))).toEqual(sorted(lists.loot_pool_entry_type));
  });

  it('has a fidelity for every loot function type, and no other', () => {
    expect(lists.loot_function_type?.length).toBeGreaterThanOrEqual(40);
    expect(sorted(Object.keys(LOOT_FUNCTION_SUPPORT))).toEqual(sorted(lists.loot_function_type));
  });

  it('has a fidelity for every enchantment provider and number type', () => {
    expect(sorted(Object.keys(ENCHANTMENT_PROVIDER_SUPPORT))).toEqual(
      sorted(lists.enchantment_provider_type),
    );
    expect(sorted(Object.keys(INT_NUMBER_SUPPORT))).toEqual(
      sorted(lists.context_int_provider_type),
    );
    expect(sorted(Object.keys(FLOAT_NUMBER_SUPPORT))).toEqual(
      sorted(lists.context_float_provider_type),
    );
    expect(sorted(Object.keys(LEVEL_VALUE_SUPPORT))).toEqual(
      sorted(lists.enchantment_level_based_value_type),
    );
  });

  it('runs every function type, or names it', () => {
    const ctx = fakeContext({}, TARGET);
    for (const type of lists.loot_function_type ?? []) {
      const result = applyItemModifier(
        { type: `minecraft:${type}` },
        { id: 'minecraft:stone', count: 1 },
        CHEST,
        ctx,
      );
      const named = result.unsupported.some((u) => u.type.startsWith(type));
      if (LOOT_FUNCTION_SUPPORT[type] === 'only_in_game') expect(named, type).toBe(true);
      expect(
        result.parts.map((p) => p.type),
        type,
      ).toContain(type);
    }
  });

  it('runs every pool entry type, or names it', () => {
    const ctx = fakeContext({}, TARGET);
    for (const type of lists.loot_pool_entry_type ?? []) {
      const result = rollLoot(
        { pools: [{ rolls: 1, entries: [{ type: `minecraft:${type}` }] }] },
        CHEST,
        ctx,
      );
      expect(
        result.parts?.map((p) => p.type),
        type,
      ).toContain(type);
      if (LOOT_ENTRY_SUPPORT[type] === 'only_in_game') {
        expect(
          result.unsupported.map((u) => u.type),
          type,
        ).toContain(type);
      }
    }
  });

  it('handles every enchantment provider and world generation int provider, or names it', () => {
    const ctx = fakeContext({}, TARGET);
    for (const type of lists.enchantment_provider_type ?? []) {
      const result = rollEnchantmentProvider(
        { type },
        { id: 'minecraft:book', count: 1 },
        CHEST,
        ctx,
      );
      if (ENCHANTMENT_PROVIDER_SUPPORT[type] === 'only_in_game') {
        expect(
          result.unsupported.map((u) => u.type),
          type,
        ).toContain(type);
      }
    }
    for (const type of lists.int_provider_type ?? []) {
      const level = {
        type,
        min_inclusive: 1,
        max_inclusive: 1,
        value: 1,
        source: 1,
        distribution: [{ data: 1, weight: 1 }],
      };
      const result = rollEnchantmentProvider(
        { type: 'single', enchantment: 'minecraft:sharpness', level },
        { id: 'minecraft:stone', count: 1 },
        CHEST,
        ctx,
      );
      if (INT_PROVIDER_SUPPORT[type]) expect(result.unsupported, type).toEqual([]);
      else
        expect(
          result.unsupported.map((u) => u.type),
          type,
        ).toContain(type);
    }
  });
});

describe('an unknown type', () => {
  it('is named, never skipped', () => {
    const ctx = fakeContext({}, TARGET);
    const fn = applyItemModifier(
      { type: 'minecraft:made_up' },
      { id: 'minecraft:stone', count: 1 },
      CHEST,
      ctx,
    );
    expect(fn.unsupported).toEqual([
      { kind: 'function', type: 'made_up', path: '', reason: 'not_supported' },
    ]);
  });
});
