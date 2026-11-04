import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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

describe('createScopedFileSystem symlink containment', () => {
  let project: string;
  let outside: string;

  beforeEach(async () => {
    project = join(root, 'project');
    outside = join(root, 'outside');
    await mkdir(join(project, 'assets'), { recursive: true });
    await mkdir(outside);
    await writeFile(join(outside, 'secret.txt'), 'secret');
    await writeFile(join(project, 'assets', 'inside.txt'), 'inside');
    await symlink(outside, join(project, 'assets', 'escape'), 'dir');
    await symlink(join(outside, 'secret.txt'), join(project, 'assets', 'secret-link.txt'), 'file');
    await symlink(
      join(project, 'assets', 'inside.txt'),
      join(project, 'assets', 'inside-link.txt'),
      'file',
    );
    await symlink(join(outside, 'missing.txt'), join(project, 'assets', 'dangling.txt'), 'file');
  });

  it('refuses reads through a link to a folder outside the root', async () => {
    const fs = createScopedFileSystem(project);
    await expect(fs.readFile('assets/escape/secret.txt')).rejects.toThrow(/outside the project/);
    await expect(fs.readFile('assets/secret-link.txt')).rejects.toThrow(/outside the project/);
    await expect(fs.readDir('assets/escape')).rejects.toThrow(/outside the project/);
    await expect(fs.exists('assets/escape/secret.txt')).rejects.toThrow(/outside the project/);
  });

  it('refuses writes through links, including dangling ones', async () => {
    const fs = createScopedFileSystem(project);
    await expect(fs.writeFile('assets/escape/new.txt', encode('x'))).rejects.toThrow(
      /outside the project/,
    );
    await expect(fs.mkdirp('assets/escape/sub')).rejects.toThrow(/outside the project/);
    await expect(fs.writeFile('assets/dangling.txt', encode('x'))).rejects.toThrow(
      /outside the project/,
    );
    await expect(readFile(join(outside, 'missing.txt'))).rejects.toThrow();
    await expect(readFile(join(outside, 'new.txt'))).rejects.toThrow();
  });

  it('hides escaping links in readDir and keeps contained ones', async () => {
    const fs = createScopedFileSystem(project);
    expect(await fs.readDir('assets')).toEqual([
      { name: 'inside-link.txt', kind: 'file' },
      { name: 'inside.txt', kind: 'file' },
    ]);
    expect(text(await fs.readFile('assets/inside-link.txt'))).toBe('inside');
  });

  it('removes only the link, never its target', async () => {
    const fs = createScopedFileSystem(project);
    await fs.remove('assets/escape');
    await fs.remove('assets/secret-link.txt');
    await fs.remove('assets/dangling.txt');
    expect(await readFile(join(outside, 'secret.txt'), 'utf8')).toBe('secret');
    expect(await fs.exists('assets/escape')).toBe(false);
    expect(await fs.exists('assets/secret-link.txt')).toBe(false);
    await expect(fs.remove('assets/escape/secret.txt')).resolves.toBeUndefined();
  });

  it('refuses to remove entries below a link that escapes', async () => {
    const fs = createScopedFileSystem(project);
    await expect(fs.remove('assets/escape/secret.txt')).rejects.toThrow(/outside the project/);
    expect(await readFile(join(outside, 'secret.txt'), 'utf8')).toBe('secret');
  });

  it('accepts a root that is itself reached through a symlink', async () => {
    await symlink(project, join(root, 'project-link'), 'dir');
    const fs = createScopedFileSystem(join(root, 'project-link'));
    expect(text(await fs.readFile('assets/inside.txt'))).toBe('inside');
    await fs.writeFile('content/a.json', encode('{}'));
    expect(await readFile(join(project, 'content', 'a.json'), 'utf8')).toBe('{}');
  });

  it('stats contained files', async () => {
    const fs = createScopedFileSystem(project);
    expect(await fs.stat('assets/inside.txt')).toMatchObject({ kind: 'file', size: 6 });
    expect(await fs.stat('assets/none.txt')).toBeNull();
    await expect(fs.stat('assets/escape')).rejects.toThrow(/outside the project/);
  });
});

describe('createNodePlatform', () => {
  const platform = () =>
    createNodePlatform({
      info: async () => ({ version: '0', electron: '0', platform: 'test' }),
      dialogs: {
        pickDirectory: async () => null,
        confirmDiscard: async () => true,
        openFiles: async () => [],
        saveFilePath: async () => null,
      },
      showItemInFolder: () => {},
      resizePng: (png) => png,
      msmHome: join(root, 'msm-home'),
      installEnv: { platform: 'linux', home: join(root, 'home') },
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
