import { describe, expect, it } from 'vitest';
import {
  CHECKS,
  checkDatapackRun,
  parseDatapackArgs,
  serverDownload,
  setupCommands,
  testCount,
  VERSION_MANIFEST_URL,
  versionEntry,
} from './vanilla-datapack.ts';

const ZIP = 'msm-sample-data-pack-x.zip';
const ENABLED = `[01:30:22] [Server thread/INFO]: System chat: There are 2 data pack(s) enabled: [vanilla (built-in)], [file/${ZIP} (world)]`;
const ALL = { 'in all': 40, 'with the new trade': 24, 'with the vanilla arrow trade': 16 };

describe('parseDatapackArgs', () => {
  it('takes the version and the zip beside the facts file, flags over them', () => {
    const options = parseDatapackArgs(
      ['--facts', '/out/server-facts.json'],
      { minecraft: '1.0', zip: ZIP },
      '/out/server-facts.json',
      { JAVA_HOME: '/jdk' },
    );
    expect(options).toMatchObject({ minecraft: '1.0', villagers: 40, timeoutSeconds: 600 });
    expect(options.zip.replaceAll('\\', '/')).toBe(`/out/${ZIP}`);
    expect(options.java.replaceAll('\\', '/')).toBe('/jdk/bin/java');
    expect(
      parseDatapackArgs(
        ['--zip', 'other.zip', '--minecraft', '2.0', '--villagers', '8'],
        { minecraft: '1.0', zip: ZIP },
        '/out/server-facts.json',
      ),
    ).toMatchObject({ zip: 'other.zip', minecraft: '2.0', villagers: 8, java: 'java' });
  });

  it('rejects missing, unknown and bad options', () => {
    expect(() => parseDatapackArgs([], { zip: ZIP }, '/f.json')).toThrow(/--minecraft/);
    expect(() => parseDatapackArgs([], { minecraft: '1.0' }, '/f.json')).toThrow(/--zip/);
    expect(() => parseDatapackArgs(['--jar', 'a'], { minecraft: '1.0', zip: ZIP })).toThrow(
      /Unknown option --jar/,
    );
    expect(() =>
      parseDatapackArgs(['--villagers', '0'], { minecraft: '1.0', zip: ZIP }, '/f.json'),
    ).toThrow(/1 or more/);
  });
});

describe("Mojang's metadata", () => {
  it('finds the version and its server download', () => {
    const manifest = {
      versions: [
        { id: '2.0', url: 'https://example.invalid/2.json', sha1: 'b' },
        { id: '1.0', url: 'https://example.invalid/1.json', sha1: 'a' },
      ],
    };
    expect(versionEntry(manifest, '1.0')).toEqual({
      url: 'https://example.invalid/1.json',
      sha1: 'a',
    });
    expect(() => versionEntry(manifest, '3.0')).toThrow(/lists no 3\.0/);
    expect(
      serverDownload(
        { downloads: { server: { url: 'https://example.invalid/s.jar', sha1: 'c' } } },
        '1.0',
      ),
    ).toEqual({ url: 'https://example.invalid/s.jar', sha1: 'c' });
    expect(() => serverDownload({ downloads: {} }, '1.0')).toThrow(/no dedicated server/);
    expect(VERSION_MANIFEST_URL).toMatch(/^https:\/\/piston-meta\.mojang\.com\//);
  });
});

describe('the console script', () => {
  it('summons the villagers and has the zombie kill them on hard', () => {
    const commands = setupCommands(3);
    expect(commands[0]).toBe('difficulty hard');
    expect(
      commands.filter((command) => command.startsWith('summon minecraft:villager')),
    ).toHaveLength(3);
    expect(commands.at(-1)).toMatch(/^execute as @e\[type=minecraft:villager\] run damage/);
    expect(CHECKS.map(([name]) => name)).toEqual(Object.keys(ALL));
    expect(CHECKS[1]?.[1]).toContain('minecraft:spectral_arrow');
  });

  it('reads the counts of both message forms', () => {
    expect(testCount('[x] [Server thread/INFO]: System chat: Test passed. Count: 24')).toBe(24);
    expect(testCount('[x] [Server thread/INFO]: Test passed, count: 3')).toBe(3);
    expect(testCount('[x] [Server thread/INFO]: System chat: Test failed')).toBe(0);
    expect(testCount('[x] [Server thread/INFO]: Summoned new Villager')).toBe(undefined);
  });
});

describe('checkDatapackRun', () => {
  it('passes with the pack enabled, every count above zero and a clean log', () => {
    expect(checkDatapackRun([ENABLED], ZIP, ALL)).toEqual({ ok: true, failures: [], counts: ALL });
  });

  it('fails on a missing pack, a zero or missing count and load errors', () => {
    const outcome = checkDatapackRun(
      [
        ENABLED.replace(`file/${ZIP}`, 'file/other.zip'),
        "[x] [Server thread/ERROR]: Couldn't load tag minecraft:x",
      ],
      ZIP,
      { 'in all': 40, 'with the new trade': 0 },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.failures).toEqual([
      `the data pack file/${ZIP} is not listed as enabled`,
      "log: [x] [Server thread/ERROR]: Couldn't load tag minecraft:x",
      'no zombie villager with the new trade (count 0)',
      'no answer to the check of zombie villagers with the vanilla arrow trade',
    ]);
  });
});
