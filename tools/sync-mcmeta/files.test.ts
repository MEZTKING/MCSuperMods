/**
 * The vanilla file index (B823): built from fake file trees (paths and blob hashes only),
 * checked, written beside the summary files, and skipped when a run has no tree reader.
 */
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildFileIndex,
  FILE_INDEX_NAME,
  fileIndexRef,
  isLeftOut,
  MIN_FILES_PER_SIDE,
  parseLsTree,
  type ReadTree,
  type TreeEntry,
  type VanillaFileIndex,
} from './files.ts';
import { type FetchFile, REPOSITORY, syncFileIndex, syncMcmeta } from './index.ts';

const VERSION = '1.0';
const hash = (n: number): string => n.toString(16).padStart(40, '0');

/** A side's tree: `count` plain files, the root files every tag has, and a structure. */
function tree(side: 'assets' | 'data', count = MIN_FILES_PER_SIDE, salt = 0): TreeEntry[] {
  const entries: TreeEntry[] = [
    { path: '.gitattributes', hash: hash(1) },
    { path: 'pack.mcmeta', hash: hash(2) },
    { path: 'version.json', hash: hash(3) },
  ];
  for (let i = 0; i < count; i++) {
    entries.push({ path: `${side}/minecraft/thing/f${i}.json`, hash: hash(1000 + i + salt) });
  }
  if (side === 'data') {
    entries.push({ path: 'data/minecraft/structure/village/house.nbt', hash: hash(9) });
  }
  return entries;
}

function fakeReadTree(trees: Record<string, TreeEntry[]>, requests: string[]): ReadTree {
  return async (repository, tag) => {
    requests.push(`${repository}@${tag}`);
    const entries = trees[tag];
    if (entries === undefined) throw new Error(`unexpected tag ${tag}`);
    return entries;
  };
}

describe('buildFileIndex', () => {
  it('keeps each side’s own files with short hashes, and leaves out structures', () => {
    const { index, problems } = buildFileIndex(VERSION, {
      assets: tree('assets'),
      data: tree('data'),
    });
    expect(problems).toEqual([]);
    expect(index.version).toBe(VERSION);
    expect(index.refs).toEqual({ assets: '1.0-assets', data: '1.0-data' });
    expect(index.leftOut).toEqual(['data/<namespace>/structure/<path>.nbt']);
    expect(Object.keys(index.files)).toHaveLength(2 * MIN_FILES_PER_SIDE);
    expect(index.files['data/minecraft/thing/f0.json']).toBe('000000000000');
    expect(index.files['data/minecraft/structure/village/house.nbt']).toBeUndefined();
    expect(index.files['pack.mcmeta']).toBeUndefined();
    expect(isLeftOut('data/minecraft/structure/village/house.nbt')).toBe(true);
    expect(isLeftOut('data/minecraft/worldgen/structure/village.json')).toBe(false);
  });

  it('refuses unexpected paths, hashes and too few files', () => {
    const assets = tree('assets', 3);
    assets.push({ path: 'assets/minecraft/../../etc/x', hash: hash(5) });
    assets.push({ path: 'assets/minecraft/Upper.png', hash: hash(6) });
    assets.push({ path: 'assets/minecraft/ok.png', hash: 'nothex' });
    const { problems } = buildFileIndex(VERSION, { assets, data: tree('data') });
    expect(problems).toEqual([
      'files.json: unexpected path "assets/minecraft/../../etc/x"',
      'files.json: unexpected path "assets/minecraft/Upper.png"',
      'files.json: unexpected hash for assets/minecraft/ok.png',
      `files.json: 3 files in 1.0-assets, expected at least ${MIN_FILES_PER_SIDE}`,
    ]);
  });
});

describe('parseLsTree', () => {
  it('reads blobs from git ls-tree -r -z output and skips the rest', () => {
    const output = [
      `100644 blob ${hash(7)}\tdata/minecraft/recipe/stone.json`,
      `160000 commit ${hash(8)}\tsub`,
      `100644 blob ${hash(9)}\tassets/minecraft/lang/en_us.json`,
      '',
    ].join('\0');
    expect(parseLsTree(output)).toEqual([
      { path: 'data/minecraft/recipe/stone.json', hash: hash(7) },
      { path: 'assets/minecraft/lang/en_us.json', hash: hash(9) },
    ]);
  });
});

describe('the index in a sync', () => {
  let out: string | undefined;
  afterEach(async () => {
    if (out !== undefined) await rm(out, { recursive: true, force: true });
    out = undefined;
  });

  const trees = (): Record<string, TreeEntry[]> => ({
    [fileIndexRef(VERSION, 'assets')]: tree('assets'),
    [fileIndexRef(VERSION, 'data')]: tree('data'),
  });

  it('syncFileIndex writes files.json alone, sorted, from both tags', async () => {
    out = await mkdtemp(join(tmpdir(), 'msm-sync-files-'));
    const requests: string[] = [];
    const index = await syncFileIndex({
      version: VERSION,
      out,
      readTree: fakeReadTree(trees(), requests),
    });
    expect(requests).toEqual([`${REPOSITORY}@1.0-assets`, `${REPOSITORY}@1.0-data`]);
    expect(await readdir(out)).toEqual([FILE_INDEX_NAME]);
    const text = await readFile(join(out, FILE_INDEX_NAME), 'utf8');
    expect(JSON.parse(text)).toEqual(index);
    expect(text.startsWith('{\n  "files": {\n    "assets/minecraft/thing/f0.json"')).toBe(true);
  });

  it('writes nothing when a tree is wrong', async () => {
    out = await mkdtemp(join(tmpdir(), 'msm-sync-files-'));
    const bad = trees();
    bad[fileIndexRef(VERSION, 'data')] = tree('data', 2);
    await expect(
      syncFileIndex({ version: VERSION, out, readTree: fakeReadTree(bad, []) }),
    ).rejects.toThrow(/3 files in 1\.0-data, expected at least/);
    expect(await readdir(out)).toEqual([]);
  });

  it('syncMcmeta writes the index with the summary files when given a tree reader', async () => {
    out = await mkdtemp(join(tmpdir(), 'msm-sync-files-'));
    const fetchFile: FetchFile = async (_repository, _ref, path) => {
      const files: Record<string, unknown> = {
        'version.json': { id: VERSION },
        'registries/data.min.json': Object.fromEntries(
          [
            ...['item', 'block', 'recipe_serializer'],
            ...Array.from({ length: 120 }, (_, i) => `r${i}`),
          ].map((name) => [name, []]),
        ),
        'commands/data.min.json': {
          type: 'root',
          children: Object.fromEntries(
            ['execute', 'function', 'give', ...Array.from({ length: 60 }, (_, i) => `c${i}`)].map(
              (name) => [name, { type: 'literal' }],
            ),
          ),
        },
        'blocks/data.min.json': Object.fromEntries(
          ['stone', 'oak_stairs', ...Array.from({ length: 600 }, (_, i) => `b${i}`)].map((name) => [
            name,
            [{}, {}],
          ]),
        ),
      };
      return { text: JSON.stringify(files[path]), url: `mock://${path}` };
    };
    await syncMcmeta({ version: VERSION, out, fetchFile, readTree: fakeReadTree(trees(), []) });
    expect((await readdir(out)).sort()).toContain(FILE_INDEX_NAME);
    const index = JSON.parse(
      await readFile(join(out, FILE_INDEX_NAME), 'utf8'),
    ) as VanillaFileIndex;
    expect(index.version).toBe(VERSION);

    // A fixture upstream (fetchFile only, as tools/new-target's tests give) reads no tree.
    const other = await mkdtemp(join(tmpdir(), 'msm-sync-files-'));
    try {
      const lines: string[] = [];
      await syncMcmeta({ version: VERSION, out: other, fetchFile, log: (l) => lines.push(l) });
      expect(await readdir(other)).not.toContain(FILE_INDEX_NAME);
      expect(lines).toContain('files.json not read (no tree reader)');
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });
});
