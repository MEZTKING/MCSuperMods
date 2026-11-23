/**
 * The vanilla layer (B660; B656's notes): names from the jar read once per target and kept, a
 * failed read tried again, items taking their block's name, words made from the ids without a
 * jar, a block and its item as one entry, particles and sounds technical, and every id's words
 * protected.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { vanillaLayer } from '../../src/renderer/src/search/sources/vanilla';
import {
  clearVanillaNames,
  thingNameOf,
  vanillaNamesFor,
} from '../../src/renderer/src/search/vanilla-names';
import type { VanillaNames } from '../../src/shared/platform';
import { madeUpNames, registriesOf, TARGET_IDS } from './fixtures';

beforeEach(() => clearVanillaNames());

describe('the jar’s names', () => {
  it('are read once per target and kept', async () => {
    let reads = 0;
    const read = async (): Promise<VanillaNames> => {
      reads++;
      return madeUpNames();
    };
    await vanillaNamesFor('mc-a', read);
    await vanillaNamesFor('mc-a', read);
    await vanillaNamesFor('mc-b', read);
    expect(reads).toBe(2);
  });

  it('are null on an error or without the cache, and read again next time', async () => {
    let calls = 0;
    const failing = async (): Promise<VanillaNames | null> => {
      calls++;
      if (calls === 1) throw new Error('no cache');
      return calls === 2 ? null : madeUpNames();
    };
    expect(await vanillaNamesFor('mc-a', failing)).toBeNull();
    expect(await vanillaNamesFor('mc-a', failing)).toBeNull();
    expect((await vanillaNamesFor('mc-a', failing))?.version).toBe('test');
    expect(await vanillaNamesFor('mc-z', undefined)).toBeNull();
  });

  it('give an item its block’s name when it has none of its own', () => {
    const names = madeUpNames();
    expect(thingNameOf(names, 'minecraft:stone')).toBe('Plain Test Rock');
    expect(thingNameOf(names, 'minecraft:iron_ingot')).toBe('Test Metal Bar');
    expect(thingNameOf(null, 'minecraft:stone')).toBeUndefined();
  });
});

describe.each(TARGET_IDS)('the vanilla layer on %s', (targetId) => {
  it('names things from the jar, else from the ids, a block and its item as one', () => {
    const registries = registriesOf(targetId);
    const named = vanillaLayer(registries, madeUpNames());
    const plain = vanillaLayer(registries, null);
    const byId = new Map(named.entries.map((entry) => [entry.id, entry]));
    expect(byId.get('vanilla:thing:stone')?.title).toBe('Plain Test Rock');
    expect(byId.get('vanilla:thing:stone')?.words).toEqual(['block', 'item']);
    expect(byId.get('vanilla:mob:pig')?.title).toBe('Test Pig');
    expect(byId.get('vanilla:sound:entity.pig.ambient')?.title).toBe('Test pig grunts');
    expect(byId.get('vanilla:sound:entity.pig.ambient')?.technical).toBe(true);
    expect(plain.entries.find((entry) => entry.id === 'vanilla:thing:stone')?.title).toBe('Stone');
    expect(plain.entries.find((entry) => entry.id === 'vanilla:biome:plains')?.title).toBe(
      'Plains',
    );
    expect(new Set(named.entries.map((entry) => entry.id)).size).toBe(named.entries.length);
    const blocks = registries.block?.length ?? 0;
    expect(named.entries.length).toBeGreaterThan(4000);
    expect(named.things.length).toBeGreaterThan(blocks);
    expect(named.things.find((thing) => thing.id === 'minecraft:pig')).toEqual({
      id: 'minecraft:pig',
      name: 'Test Pig',
      sort: 'mob',
    });
    expect(named.protect).toContain('creeper');
    expect(named.entries.every((entry) => entry.ids?.[0]?.startsWith('minecraft:'))).toBe(true);
  });
});
