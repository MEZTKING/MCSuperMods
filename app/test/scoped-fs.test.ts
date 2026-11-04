import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodePlatform } from '../src/main/platform/node-platform';
import { createScopedFileSystem } from '../src/main/platform/scoped-fs';

const text = (data: Uint8Array): string => new TextDecoder().decode(data);
const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'msm-scoped-fs-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('createScopedFileSystem', () => {
  it('writes, reads, lists, checks and removes', async () => {
    const fs = createScopedFileSystem(root);
    await fs.writeFile('content/demo/recipe/a.json', encode('{}\n'));
    expect(text(await fs.readFile('content/demo/recipe/a.json'))).toBe('{}\n');
    expect(await readFile(join(root, 'content', 'demo', 'recipe', 'a.json'), 'utf8')).toBe('{}\n');

    await fs.mkdirp('assets/demo');
    await fs.writeFile('content/demo/b.json', encode('1'));
    expect(await fs.readDir('content/demo')).toEqual([
      { name: 'b.json', kind: 'file' },
      { name: 'recipe', kind: 'directory' },
    ]);
    expect(await fs.exists('assets/demo')).toBe(true);
    expect(await fs.exists('assets/other')).toBe(false);
    expect(await fs.exists('content/demo/b.json/x')).toBe(false);

    await fs.remove('content/demo/recipe');
    expect(await fs.exists('content/demo/recipe')).toBe(false);
    await fs.remove('content/missing');
  });

  it('rejects paths outside the project', async () => {
    const fs = createScopedFileSystem(join(root, 'project'));
    await writeFile(join(root, 'secret.txt'), 'secret');
    await expect(fs.readFile('../secret.txt')).rejects.toThrow(/segments/);
    await expect(fs.readFile('../x')).rejects.toThrow();
    await expect(fs.readFile('/abs')).rejects.toThrow(/absolute/);
    await expect(fs.writeFile('a\\b', encode('x'))).rejects.toThrow(/separators/);
    await expect(fs.exists('a/./b')).rejects.toThrow();
    await expect(fs.remove('')).rejects.toThrow(/empty/);
  });
});

describe('createNodePlatform', () => {
  const platform = () =>
    createNodePlatform({
      info: async () => ({ version: '0', electron: '0', platform: 'test' }),
      dialogs: { pickDirectory: async () => null, confirmDiscard: async () => true },
    });

  it('rejects file access when no root is open', async () => {
    await expect(platform().fs.exists('msm.project.json')).rejects.toThrow(/No project/);
  });

  it('creates only in empty directories and opens only project directories', async () => {
    const p = platform();
    const target = join(root, 'new-project');
    expect(await p.project.createRoot(target)).toEqual({ ok: true });
    expect(await p.project.currentRoot()).toBe(target);
    await p.fs.writeFile('msm.project.json', encode('{}'));
    expect((await p.project.createRoot(target)).ok).toBe(false);
    expect(await p.project.openRoot(target)).toEqual({ ok: true });
    expect((await p.project.openRoot(root)).ok).toBe(false);
    expect((await p.project.openRoot('relative')).ok).toBe(false);
    await p.project.closeRoot();
    expect(await p.project.currentRoot()).toBeNull();
    await expect(p.fs.readFile('msm.project.json')).rejects.toThrow(/No project/);
  });
});
