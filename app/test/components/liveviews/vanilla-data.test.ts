import { describe, expect, it } from 'vitest';
import {
  createVanillaDataReader,
  NOT_SET_UP_VANILLA_DATA,
  type ReadVanillaDataFiles,
  vanillaFileId,
} from '../../../src/renderer/src/liveviews/vanilla-data';
import type { VanillaDataFiles } from '../../../src/shared/platform';

/** Made-up cached files (no Mojang file): what main would answer for the folders asked. */
const CACHE: Record<string, Record<string, unknown>> = {
  loot_table: { 'minecraft:blocks/made_up': { pools: [] } },
  'tags/item': { 'minecraft:made_up_logs': { values: ['minecraft:a'] } },
  advancement: {},
};

function fakeRead(ready: { value: boolean }) {
  const calls: string[][] = [];
  const read: ReadVanillaDataFiles = async (version, folders) => {
    calls.push([...folders]);
    if (!ready.value) return null;
    const answer: VanillaDataFiles = {
      version,
      folders: Object.fromEntries(folders.map((folder) => [folder, CACHE[folder] ?? {}])),
      fileCount: 0,
    };
    return answer;
  };
  return { read, calls };
}

describe('the live views vanilla data reader (ADR 0120 D11)', () => {
  it('answers "not set up" for every call without a cache, and asks again', async () => {
    const ready = { value: false };
    const { read, calls } = fakeRead(ready);
    const reader = createVanillaDataReader({ mcVersion: '9.9', read });
    expect(await reader.folder('loot_table')).toEqual({ status: 'not_set_up' });
    expect(await reader.folders(['loot_table', 'tags/item'])).toEqual({ status: 'not_set_up' });
    expect(await reader.file('loot_table', 'blocks/made_up')).toEqual({ status: 'not_set_up' });
    expect(await reader.lookup(['loot_table'])).toEqual({ status: 'not_set_up' });
    expect(calls.length).toBe(4);
    // A cache made meanwhile is seen on the next call.
    ready.value = true;
    expect((await reader.folder('loot_table')).status).toBe('ready');
  });

  it('never asks anything with the reader that is not set up', async () => {
    const reader = NOT_SET_UP_VANILLA_DATA;
    expect(reader.mcVersion).toBeNull();
    expect(await reader.folder('loot_table')).toEqual({ status: 'not_set_up' });
    expect(await reader.folders(['advancement'])).toEqual({ status: 'not_set_up' });
    expect(await reader.file('tags/item', 'logs')).toEqual({ status: 'not_set_up' });
    expect(await reader.lookup(['tags/item'])).toEqual({ status: 'not_set_up' });
  });

  it('reads folders in one call, keeps them, and finds files by id', async () => {
    const { read, calls } = fakeRead({ value: true });
    const reader = createVanillaDataReader({ mcVersion: '9.9', read });
    const both = await reader.folders(['loot_table', 'tags/item', 'loot_table']);
    expect(both).toEqual({
      status: 'ready',
      version: '9.9',
      folders: { loot_table: CACHE.loot_table, 'tags/item': CACHE['tags/item'] },
    });
    expect(calls).toEqual([['loot_table', 'tags/item']]);
    // Kept: only a new folder is asked.
    await reader.folders(['loot_table', 'advancement']);
    expect(calls).toEqual([['loot_table', 'tags/item'], ['advancement']]);
    expect(await reader.file('loot_table', 'blocks/made_up')).toEqual({
      status: 'ready',
      id: 'minecraft:blocks/made_up',
      json: { pools: [] },
    });
    expect(await reader.file('tags/item', '#minecraft:made_up_logs')).toMatchObject({
      status: 'ready',
    });
    expect(await reader.file('loot_table', 'blocks/none')).toEqual({
      status: 'missing',
      id: 'minecraft:blocks/none',
    });
    expect(calls.length).toBe(2);
    reader.forget();
    await reader.folder('loot_table');
    expect(calls.length).toBe(3);
  });

  it('shares one call between readers asking at once', async () => {
    const { read, calls } = fakeRead({ value: true });
    const reader = createVanillaDataReader({ mcVersion: '9.9', read });
    await Promise.all([reader.folder('loot_table'), reader.file('loot_table', 'x')]);
    expect(calls).toEqual([['loot_table']]);
  });

  it('gives a synchronous lookup over loaded folders', async () => {
    const { read } = fakeRead({ value: true });
    const reader = createVanillaDataReader({ mcVersion: '9.9', read });
    const answer = await reader.lookup(['loot_table', 'tags/item']);
    if (answer.status !== 'ready') throw new Error('expected ready');
    expect(answer.lookup('loot_table', 'minecraft:blocks/made_up')).toEqual({ pools: [] });
    expect(answer.lookup('tags/item', 'made_up_logs')).toEqual({ values: ['minecraft:a'] });
    expect(answer.lookup('loot_table', 'none')).toBeUndefined();
    expect(answer.lookup('advancement', 'x')).toBeUndefined();
  });

  it('refuses folder names that are not folder keys, and asks again after a failure', async () => {
    let fail = true;
    const read: ReadVanillaDataFiles = async (version, folders) => {
      if (fail) throw new Error('main went away');
      return { version, folders: Object.fromEntries(folders.map((f) => [f, {}])), fileCount: 0 };
    };
    const reader = createVanillaDataReader({ mcVersion: '9.9', read });
    await expect(reader.folder('../x')).rejects.toThrow();
    await expect(reader.folder('Upper')).rejects.toThrow();
    await expect(reader.folder('loot_table')).rejects.toThrow('main went away');
    fail = false;
    expect((await reader.folder('loot_table')).status).toBe('ready');
  });

  it('keys ids in the minecraft namespace by default', () => {
    expect(vanillaFileId('stone')).toBe('minecraft:stone');
    expect(vanillaFileId('#minecraft:logs')).toBe('minecraft:logs');
    expect(vanillaFileId('demo:x')).toBe('demo:x');
  });
});
