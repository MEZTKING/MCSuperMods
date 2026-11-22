import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryFileSystem } from '@msm/core';
import { unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BIOME_LISTS_FILE,
  BIOME_LISTS_FOLDER,
  BIOME_LISTS_MAX_BYTES,
  parseResolvedBiomeLists,
  readResolvedBiomeLists,
} from '../src/main/platform/worldgen-biome-lists';
import type { VanillaWorldgenFiles } from '../src/shared/platform';
import { newSession } from './session-fixture';

/**
 * B592: the resolved biome lists the runtime's dev mode writes into the managed Play instance
 * (`<gameDir>/msm-dev/biome-lists.json`). Made-up lists and a made-up version only: no Mojang
 * data. The lists are read like a save (read only, inside the game folder, size-limited, every
 * value checked) and go nowhere but the preview's answer.
 */
const VERSION = '9.9-msm-test';
const MARKER = 'msm_marker:biome_lists_marker';

const LISTS = {
  'minecraft:made_up': {
    biomes: [MARKER, 'msm_test:dunes'],
    points: [
      [0, -10000, 0, 0, 10000, -10000, 10000, -10000, 10000, 0, 0, -10000, 10000, 0],
      [1, 0, 10000, 0, 10000, -10000, 10000, -10000, 10000, 0, 0, -10000, 10000, 3750],
    ],
  },
};

function fileText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ format: 1, minecraftVersion: VERSION, presets: LISTS, ...overrides });
}

let temp: string;
let gameDir: string;

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-biome-lists-'));
  gameDir = join(temp, 'instance', 'minecraft');
  await mkdir(join(gameDir, BIOME_LISTS_FOLDER), { recursive: true });
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

async function writeLists(text: string): Promise<string> {
  const path = join(gameDir, BIOME_LISTS_FOLDER, BIOME_LISTS_FILE);
  await writeFile(path, text);
  return path;
}

describe('the resolved biome lists (B592)', () => {
  it('reads the file the runtime writes into the Play instance, without writing anything', async () => {
    const path = await writeLists(fileText());
    const before = (await stat(path)).mtimeMs;
    expect(await readResolvedBiomeLists({ mcVersion: VERSION, managedGameDir: gameDir })).toEqual(
      LISTS,
    );
    expect(await readdir(join(gameDir, BIOME_LISTS_FOLDER))).toEqual([BIOME_LISTS_FILE]);
    expect((await stat(path)).mtimeMs).toBe(before);
  });

  it('is null without a Play, for another version, or for a file outside the game folder', async () => {
    expect(await readResolvedBiomeLists({ mcVersion: VERSION, managedGameDir: null })).toBeNull();
    expect(
      await readResolvedBiomeLists({ mcVersion: VERSION, managedGameDir: gameDir }),
    ).toBeNull();
    await writeLists(fileText());
    expect(
      await readResolvedBiomeLists({ mcVersion: '9.8-other', managedGameDir: gameDir }),
    ).toBeNull();
    // A link out of the game folder is not followed.
    const outside = join(temp, 'outside.json');
    await writeFile(outside, fileText());
    await rm(join(gameDir, BIOME_LISTS_FOLDER, BIOME_LISTS_FILE));
    await symlink(outside, join(gameDir, BIOME_LISTS_FOLDER, BIOME_LISTS_FILE));
    expect(
      await readResolvedBiomeLists({ mcVersion: VERSION, managedGameDir: gameDir }),
    ).toBeNull();
  });

  it('refuses a file that is too large', async () => {
    await writeLists(fileText({ padding: 'x'.repeat(BIOME_LISTS_MAX_BYTES) }));
    expect(
      await readResolvedBiomeLists({ mcVersion: VERSION, managedGameDir: gameDir }),
    ).toBeNull();
  });

  it('checks every value', () => {
    const point = LISTS['minecraft:made_up'].points[0] as number[];
    const broken = (presets: unknown) => fileText({ presets });
    const list = (patch: Record<string, unknown>) => ({
      'minecraft:made_up': { ...LISTS['minecraft:made_up'], ...patch },
    });
    expect(parseResolvedBiomeLists(fileText(), VERSION)).toEqual(LISTS);
    for (const text of [
      'not json',
      '[]',
      fileText({ format: 2 }),
      fileText({ minecraftVersion: 'other' }),
      broken({}),
      broken([]),
      broken({ 'Not An Id': LISTS['minecraft:made_up'] }),
      broken(list({ biomes: [] })),
      broken(list({ biomes: ['Bad Id'] })),
      broken(list({ points: [] })),
      broken(list({ points: [point.slice(1)] })),
      broken(list({ points: [[2, ...point.slice(1)]] })),
      broken(list({ points: [[-1, ...point.slice(1)]] })),
      broken(list({ points: [[0, 0.5, ...point.slice(2)]] })),
      broken(list({ points: [[0, '1', ...point.slice(2)]] })),
      broken(list({ points: [[0, 1e12, ...point.slice(2)]] })),
    ]) {
      expect(parseResolvedBiomeLists(text, VERSION), text.slice(0, 120)).toBeNull();
    }
  });
});

describe('the resolved biome lists stay on the machine (ADR 0119 D4)', () => {
  it('are read by no export and written into no project file', async () => {
    const fs = createMemoryFileSystem();
    const { session, platform, calls } = newSession(fs);
    let reads = 0;
    const answer: VanillaWorldgenFiles = {
      version: VERSION,
      files: { 'worldgen/noise_settings': { 'minecraft:overworld': { sea_level: 63 } } },
      fileCount: 1,
      resolvedBiomeLists: LISTS,
    };
    platform.minecraft = {
      ...platform.minecraft,
      readWorldgenFiles: async () => {
        reads += 1;
        return structuredClone(answer);
      },
    };
    platform.exports = {
      ...platform.exports,
      runtimeJar: async () => new Uint8Array([0x50, 0x4b, 0x05, 0x06, 1, 2, 3]),
    };
    await session.newProject();
    session.addElement({ id: 'demo:hills', kind: 'minecraft:worldgen/noise_settings' });
    await session.save();
    const data = await session.exportPack('data', 'zip');
    expect(data.ok).toBe(true);
    const jar = await session.buildContentJar();
    expect(jar.data).toBeDefined();
    expect(reads).toBe(0);
    const decoder = new TextDecoder();
    const marked = (zip: Uint8Array) =>
      Object.entries(unzipSync(zip))
        .filter(([, bytes]) => decoder.decode(bytes).includes(MARKER))
        .map(([name]) => name);
    for (const saved of calls.saved) expect(marked(saved.data)).toEqual([]);
    expect(marked(jar.data as Uint8Array)).toEqual([]);
    for (const path of fs.list()) {
      expect(decoder.decode(await fs.readFile(path)), path).not.toContain(MARKER);
    }
  });

  it('are never named by the AI helper, the exporters or the project code', async () => {
    const root = fileURLToPath(new URL('../..', import.meta.url));
    const folders = [
      'app/src/renderer/src/ai',
      'app/src/main/ai',
      'packages/ai/src',
      'packages/exporters/src',
      'packages/core/src',
    ];
    const offenders: string[] = [];
    for (const folder of folders) {
      for (const file of await sourceFiles(join(root, folder))) {
        const text = await readFile(file, 'utf8');
        if (
          /resolvedBiomeLists|readResolvedBiomeLists|biome-lists\.json|resolved_biome_list/.test(
            text,
          )
        ) {
          offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('are not in the repository: no committed file holds a resolved list', async () => {
    // The runtime writes them only into the user's Play instance; the GameTest's copy stays in
    // the build's run folder. A committed `biome-lists.json` would ship Mojang's numbers.
    const root = fileURLToPath(new URL('../..', import.meta.url));
    const found: string[] = [];
    for (const folder of [
      'fixtures',
      'examples',
      'docs',
      'packages',
      'app/src',
      'engine-mod/src',
    ]) {
      found.push(...(await namedFiles(join(root, folder), BIOME_LISTS_FILE)));
    }
    expect(found).toEqual([]);
  });
});

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(path)));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(path);
  }
  return out;
}

async function namedFiles(dir: string, name: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await namedFiles(path, name)));
    else if (entry.name === name) out.push(path);
  }
  return out;
}
