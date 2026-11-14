import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  analyseRun,
  blame,
  culprits,
  groupWorlds,
  mergingPath,
  normalise,
  parsePacksArgs,
  runFailures,
  zipEntries,
} from './vanilla-packs.ts';

/** A minimal zip writer: `deflate` entries are compressed, the rest stored. */
function zip(entries: readonly [string, string, boolean][]): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text, deflate] of entries) {
    const nameBytes = Buffer.from(encoder.encode(name));
    const raw = Buffer.from(encoder.encode(text));
    const data = deflate ? deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

const T = '[03:42:38] [Worker-Main-2/ERROR]: ';

/** A start that failed on a recipe naming an unknown item (26.3 wording). */
const REGISTRY_FAILURE = [
  '[03:42:30] [ServerMain/INFO]: Loading 1234 recipes',
  `${T}Registry loading errors:`,
  '> Errors in registry minecraft:recipe:',
  '>> Errors in element zz:bad:',
  'java.lang.IllegalStateException: Failed to parse zz:bad from pack file/s_demo.zip',
  '\tat net.minecraft.resources.RegistryDataLoader.loadElementFromResource(RegistryDataLoader.java:1)',
  'Caused by: java.lang.IllegalStateException: Failed to parse either. First: Unknown registry key in ResourceKey[minecraft:root / minecraft:item]: demo:ruby',
  "[03:42:38] [ServerMain/WARN]: Failed to load datapacks, can't proceed with server load. You can either fix your datapacks or reset to vanilla with --safeMode",
  'java.util.concurrent.ExecutionException: net.minecraft.ReportedException: Registry Loading',
];

const STARTED = [
  "[03:07:04] [Worker-Main-1/ERROR]: Couldn't load tag e_tags:gems as it is missing following references: demo:ruby (from file/e_tags.zip)",
  '[03:07:04] [ServerMain/ERROR]: Failed to load function f_ns:bad',
  "java.util.concurrent.CompletionException: java.lang.IllegalArgumentException: Whilst parsing command on line 1: Unknown item 'demo:ruby' at position 8: give @a <--[HERE]",
  '\tat java.base/java.util.concurrent.CompletableFuture.wrapInCompletionException(CompletableFuture.java:323)',
  '[03:07:15] [Server thread/INFO]: Done (7.611s)! For help, type "help"',
  '[03:07:16] [Server thread/INFO]: System chat: There are 3 data pack(s) enabled: [vanilla (built-in)], [file/e_tags.zip (world)], [file/f_ns (world)]',
];

describe('parsePacksArgs', () => {
  it('needs --packs and fills the defaults', () => {
    expect(() => parsePacksArgs([])).toThrow(/--packs is required/);
    const options = parsePacksArgs(['--packs', '/out/packs.json'], { JAVA_HOME: '/jdk' });
    expect(options.packs).toBe('/out/packs.json');
    expect(options.minecraft).toBeUndefined();
    expect(options.java).toBe('/jdk/bin/java');
    expect(options.timeoutSeconds).toBe(300);
    expect(options.maxRuns).toBe(60);
  });

  it('takes the flags and refuses unknown ones', () => {
    const options = parsePacksArgs([
      '--packs',
      'p.json',
      '--minecraft',
      '1.0',
      '--max-runs',
      '5',
      '--timeout',
      '90',
    ]);
    expect(options.minecraft).toBe('1.0');
    expect(options.maxRuns).toBe(5);
    expect(options.timeoutSeconds).toBe(90);
    expect(() => parsePacksArgs(['--packs', 'p.json', '--villagers', '3'])).toThrow(/Unknown/);
    expect(() => parsePacksArgs(['--packs', 'p.json', '--max-runs', '0'])).toThrow(/whole/);
  });
});

describe('zipEntries', () => {
  it('reads stored and deflated files and leaves folders out', () => {
    const files = zipEntries(
      zip([
        ['data/', '', false],
        ['pack.mcmeta', '{"pack":{}}', false],
        ['data/a/function/hello.mcfunction', 'say hello\n'.repeat(20), true],
      ]),
    );
    expect([...files.keys()]).toEqual(['pack.mcmeta', 'data/a/function/hello.mcfunction']);
    expect(new TextDecoder().decode(files.get('data/a/function/hello.mcfunction'))).toBe(
      'say hello\n'.repeat(20),
    );
  });

  it('refuses what is not a zip', () => {
    expect(() => zipEntries(new Uint8Array(40))).toThrow(/not a zip/);
  });
});

describe('groupWorlds', () => {
  it('shares tags and root files but splits packs writing the same file', () => {
    expect(mergingPath('pack.mcmeta')).toBe(true);
    expect(mergingPath('data/minecraft/tags/item/swords.json')).toBe(true);
    expect(mergingPath('data/minecraft/loot_table/blocks/dirt.json')).toBe(false);
    const worlds = groupWorlds([
      {
        name: 'a',
        paths: ['pack.mcmeta', 'data/minecraft/tags/function/load.json', 'data/a/x.json'],
      },
      {
        name: 'b',
        paths: ['pack.mcmeta', 'data/minecraft/tags/function/load.json', 'data/b/x.json'],
      },
      { name: 'c', paths: ['data/minecraft/loot_table/blocks/dirt.json'] },
      { name: 'd', paths: ['data/minecraft/loot_table/blocks/dirt.json', 'data/d/x.json'] },
      { name: 'e', paths: ['data/e/x.json'] },
    ]);
    expect(worlds).toEqual([['a', 'b', 'c', 'e'], ['d']]);
  });
});

describe('analyseRun', () => {
  it('reads a start stopped by a registry error', () => {
    const analysis = analyseRun(REGISTRY_FAILURE);
    expect(analysis.done).toBe(false);
    expect(analysis.problems).toEqual([
      `${T}Registry loading errors:`,
      '> Errors in registry minecraft:recipe:',
      "[03:42:38] [ServerMain/WARN]: Failed to load datapacks, can't proceed with server load. You can either fix your datapacks or reset to vanilla with --safeMode",
    ]);
    expect(analysis.details).toContain(
      'java.lang.IllegalStateException: Failed to parse zz:bad from pack file/s_demo.zip',
    );
    expect(analysis.details.some((line) => line.startsWith('\tat') || line.startsWith('at '))).toBe(
      false,
    );
    expect(analysis.signatures).toEqual([
      '>> Errors in element zz:bad:',
      'java.lang.IllegalStateException: Failed to parse zz:bad from pack file/s_demo',
    ]);
    expect(runFailures(analysis, ['s_demo.zip'])).toEqual([
      'the server never logged "Done (" (it did not finish starting)',
      ...analysis.problems.map((line) => `log: ${line}`),
    ]);
  });

  it('reads dropped tags and functions, and the enabled packs', () => {
    const analysis = analyseRun(STARTED);
    expect(analysis.done).toBe(true);
    expect(analysis.enabled).toEqual(['e_tags.zip', 'f_ns']);
    expect(analysis.signatures).toEqual([
      "Couldn't load tag e_tags:gems as it is missing following references: demo:ruby (from file/e_tags)",
      'Failed to load function f_ns:bad',
    ]);
    expect(analysis.details).toContain(
      "java.util.concurrent.CompletionException: java.lang.IllegalArgumentException: Whilst parsing command on line 1: Unknown item 'demo:ruby' at position 8: give @a <--[HERE]",
    );
    expect(runFailures(analysis, ['e_tags.zip', 'f_ns', 'g.zip'])).toEqual([
      `log: ${STARTED[0]}`,
      `log: ${STARTED[1]}`,
      'file/g.zip is not listed as enabled',
    ]);
  });

  it('accepts the functions the packs expect to fail to load (ADR 0066 D5)', () => {
    const analysis = analyseRun(STARTED, new Set(['f_ns:bad']));
    expect(analysis.signatures).toEqual([
      "Couldn't load tag e_tags:gems as it is missing following references: demo:ruby (from file/e_tags)",
    ]);
    expect(analysis.details.some((line) => line.includes('Whilst parsing'))).toBe(false);
    expect(runFailures(analysis, ['e_tags.zip', 'f_ns'])).toEqual([`log: ${STARTED[0]}`]);
    // Another function failing still counts.
    expect(analyseRun(STARTED, new Set(['f_ns:other'])).problems).toContain(STARTED[1]);
  });

  it('passes a clean start with every pack enabled', () => {
    const clean = [STARTED[4] as string, STARTED[5] as string];
    expect(runFailures(analyseRun(clean), ['e_tags.zip', 'f_ns'])).toEqual([]);
  });

  it("fails on Couldn't parse and Errors in registry lines alone", () => {
    for (const line of [
      "[01:00:00] [Worker-Main-1/WARN]: Couldn't parse element x:y",
      '> Errors in registry minecraft:loot_table:',
    ]) {
      expect(analyseRun([line]).problems).toEqual([line]);
    }
  });

  it('drops the time, thread and .zip from a line', () => {
    expect(normalise(`${T}Couldn't load tag a:b (from file/x.zip), c (from file/y.zip)`)).toBe(
      "Couldn't load tag a:b (from file/x), c (from file/y)",
    );
  });
});

describe('blame', () => {
  const packs = [
    { name: 's_demo', paths: ['data/zz/recipe/bad.json'] },
    { name: 'e_tags', paths: ['data/e_tags/tags/item/gems.json'] },
    { name: 'f_ns', paths: ['data/f_ns/function/bad.mcfunction'] },
  ];

  it('names the packs the lines name, functions by their file', () => {
    expect(blame(analyseRun(REGISTRY_FAILURE).signatures, packs)).toEqual({
      names: ['s_demo'],
      complete: true,
    });
    expect(blame(analyseRun(STARTED).signatures, packs)).toEqual({
      names: ['e_tags', 'f_ns'],
      complete: true,
    });
  });

  it('is incomplete when a line names no pack of the run', () => {
    expect(blame(['Failed to load function other:bad'], packs)).toEqual({
      names: [],
      complete: false,
    });
    expect(blame([], packs).complete).toBe(false);
  });
});

describe('culprits', () => {
  it('halves down to the failing items', async () => {
    const tried: number[][] = [];
    const found = await culprits([1, 2, 3, 4, 5, 6, 7, 8], async (subset) => {
      tried.push([...subset]);
      return subset.includes(6) || subset.includes(2);
    });
    expect(found).toEqual([2, 6]);
    expect(tried.length).toBeLessThanOrEqual(12);
  });

  it('keeps items that fail only together', async () => {
    const found = await culprits(
      [1, 2, 3, 4],
      async (subset) => subset.includes(1) && subset.includes(4),
    );
    expect(found).toEqual([1, 2, 3, 4]);
  });

  it('returns a single item as it is', async () => {
    expect(await culprits(['a'], async () => true)).toEqual(['a']);
  });
});
