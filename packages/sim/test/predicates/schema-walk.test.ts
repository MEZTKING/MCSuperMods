/**
 * Coverage of each target's type lists (ADR 0085 D5, say it out loud; B604 exit criteria): every
 * condition, number and level-based value type a target's vendored registries list is handled
 * or named as only in the game with plain words. A new type in a target fails this test until it
 * is one or the other. The registries are read by file path, as `@msm/sim` may not depend on the
 * targets.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONDITIONS,
  CONDITIONS_ONLY_IN_THE_GAME,
  FLOAT_NUMBER_TYPES,
  INT_NUMBER_TYPES,
  LEVEL_VALUE_TYPES,
  NUMBERS_ONLY_IN_THE_GAME,
} from '../../src/index.js';
import { REPO_ROOT } from '../lower-fixture.js';

const targetFolders = readdirSync(join(REPO_ROOT, 'packages/targets')).filter((name) =>
  name.startsWith('mc-'),
);

const registries = (folder: string): Record<string, string[]> =>
  JSON.parse(
    readFileSync(
      join(REPO_ROOT, 'packages/targets', folder, 'vendor/mcmeta/registries.json'),
      'utf8',
    ),
  ) as Record<string, string[]>;

describe.each(targetFolders)('the type lists of %s', (folder) => {
  const lists = registries(folder);
  const neither = (
    types: readonly string[] | undefined,
    handled: readonly string[],
    said: object,
  ) => (types ?? []).filter((type) => !handled.includes(type) && !Object.hasOwn(said, type));

  it('has every condition type handled or said', () => {
    const types = lists.loot_condition_type;
    expect(types?.length).toBeGreaterThanOrEqual(20);
    expect(neither(types, Object.keys(CONDITIONS), CONDITIONS_ONLY_IN_THE_GAME)).toEqual([]);
  });

  it('has every whole and decimal number type handled or said', () => {
    expect(lists.context_int_provider_type?.length).toBeGreaterThan(0);
    expect(lists.context_float_provider_type?.length).toBeGreaterThan(0);
    expect(
      neither(lists.context_int_provider_type, INT_NUMBER_TYPES, NUMBERS_ONLY_IN_THE_GAME),
    ).toEqual([]);
    expect(
      neither(lists.context_float_provider_type, FLOAT_NUMBER_TYPES, NUMBERS_ONLY_IN_THE_GAME),
    ).toEqual([]);
  });

  it('has every level-based value type handled', () => {
    expect(neither(lists.enchantment_level_based_value_type, LEVEL_VALUE_TYPES, {})).toEqual([]);
  });

  it('handles no condition type the target does not list', () => {
    const types = new Set(lists.loot_condition_type);
    expect(Object.keys(CONDITIONS).filter((type) => !types.has(type))).toEqual([]);
  });
});

describe('plain words', () => {
  it('say each type only in the game in a full sentence', () => {
    for (const words of [
      ...Object.values(CONDITIONS_ONLY_IN_THE_GAME),
      ...Object.values(NUMBERS_ONLY_IN_THE_GAME),
    ]) {
      expect(words).toMatch(/^[A-Z].*\.$/);
    }
  });
});
