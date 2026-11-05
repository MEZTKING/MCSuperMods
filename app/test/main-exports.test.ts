import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createExportsService } from '../src/main/platform/exports';

let temp: string;
let pickResult: string | null;
let written: string[];

const service = () =>
  createExportsService({
    pickFolder: async () => pickResult,
    onWritten: (path) => written.push(path),
  });

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-main-exports-'));
  pickResult = join(temp, 'out');
  written = [];
  await mkdir(pickResult);
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('export folder writes', () => {
  it('writes into a picked folder and replaces existing files', async () => {
    const s = service();
    const folder = await s.pickFolder('Export');
    expect(folder).toBe(join(temp, 'out'));
    if (folder === null) throw new Error('unreachable');
    await writeFile(join(folder, 'demo-resources.zip'), 'old');
    const { paths } = await s.writeFiles(folder, [
      { name: 'demo-resources.zip', data: new Uint8Array([1]) },
      { name: 'demo-data.zip', data: new Uint8Array([2]) },
    ]);
    expect(paths).toEqual([join(folder, 'demo-resources.zip'), join(folder, 'demo-data.zip')]);
    expect(written).toEqual(paths);
    expect(new Uint8Array(await readFile(paths[0] as string))).toEqual(new Uint8Array([1]));
    expect(new Uint8Array(await readFile(paths[1] as string))).toEqual(new Uint8Array([2]));
    // No temporary files are left behind.
    expect((await readdir(folder)).sort()).toEqual(['demo-data.zip', 'demo-resources.zip']);
  });

  it('returns null when cancelled', async () => {
    pickResult = null;
    expect(await service().pickFolder('Export')).toBeNull();
  });

  it('refuses folders that were not picked', async () => {
    const s = service();
    await expect(
      s.writeFiles(join(temp, 'out'), [{ name: 'a.zip', data: new Uint8Array() }]),
    ).rejects.toThrow(/Choose the export folder/);
    await s.pickFolder('Export');
    await expect(
      s.writeFiles(join(temp, 'elsewhere'), [{ name: 'a.zip', data: new Uint8Array() }]),
    ).rejects.toThrow(/Choose the export folder/);
    await expect(s.writeFiles('out', [{ name: 'a.zip', data: new Uint8Array() }])).rejects.toThrow(
      /Choose the export folder/,
    );
  });

  it('refuses bad and duplicate names before writing anything', async () => {
    const s = service();
    const folder = (await s.pickFolder('Export')) as string;
    for (const name of ['../a.zip', 'a/b.zip', 'a.txt', '.zip/../x.zip']) {
      await expect(
        s.writeFiles(folder, [
          { name: 'ok.zip', data: new Uint8Array() },
          { name, data: new Uint8Array() },
        ]),
      ).rejects.toThrow(/file name/);
    }
    await expect(
      s.writeFiles(folder, [
        { name: 'a.zip', data: new Uint8Array() },
        { name: 'a.zip', data: new Uint8Array() },
      ]),
    ).rejects.toThrow(/twice/);
    expect(await readdir(folder)).toEqual([]);
  });

  it('fails when the picked folder has gone', async () => {
    const s = service();
    const folder = (await s.pickFolder('Export')) as string;
    await rm(folder, { recursive: true });
    await expect(s.writeFiles(folder, [{ name: 'a.zip', data: new Uint8Array() }])).rejects.toThrow(
      /not a folder/,
    );
  });

  it('writes structure files into namespace subfolders', async () => {
    const s = service();
    const folder = (await s.pickFolder('Export')) as string;
    const { paths } = await s.writeFiles(folder, [
      { name: 'demo/hut.nbt', data: new Uint8Array([1]) },
      { name: 'demo/village/house_1.schem', data: new Uint8Array([2]) },
    ]);
    expect(paths).toEqual([
      join(folder, 'demo', 'hut.nbt'),
      join(folder, 'demo', 'village', 'house_1.schem'),
    ]);
    expect(new Uint8Array(await readFile(paths[1] as string))).toEqual(new Uint8Array([2]));
    expect(await readdir(join(folder, 'demo'))).toEqual(['hut.nbt', 'village']);
  });

  it('refuses structure paths that are not namespaced, safe and lower-case', async () => {
    const s = service();
    const folder = (await s.pickFolder('Export')) as string;
    for (const name of [
      'hut.nbt',
      '../demo/hut.nbt',
      'demo/../hut.nbt',
      'Demo/hut.nbt',
      'demo/hut.json',
      'demo//hut.nbt',
    ]) {
      await expect(s.writeFiles(folder, [{ name, data: new Uint8Array() }])).rejects.toThrow(
        /file name/,
      );
    }
    expect(await readdir(folder)).toEqual([]);
  });

  it('refuses a subfolder that links outside the picked folder', async () => {
    const s = service();
    const folder = (await s.pickFolder('Export')) as string;
    const outside = join(temp, 'outside');
    await mkdir(outside);
    await symlink(outside, join(folder, 'demo'), 'dir');
    await expect(
      s.writeFiles(folder, [{ name: 'demo/hut.nbt', data: new Uint8Array([1]) }]),
    ).rejects.toThrow(/outside the export folder/);
    expect(await readdir(outside)).toEqual([]);
  });
});

describe('export tree writes (ADR 0033 D4)', () => {
  const file = (path: string, text = path) => ({ path, data: new TextEncoder().encode(text) });

  async function picked() {
    const s = service();
    const folder = await s.pickFolder('Export Java project: choose a folder');
    if (folder === null) throw new Error('unreachable');
    return { s, folder };
  }

  /** Every file under `dir`, relative and `/`-separated, sorted. */
  async function listTree(dir: string, prefix = ''): Promise<string[]> {
    const out: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = `${prefix}${entry.name}`;
      if (entry.isDirectory()) out.push(...(await listTree(join(dir, entry.name), `${rel}/`)));
      else out.push(rel);
    }
    return out.sort();
  }

  it('writes the tree under its root folder, makes gradlew executable and reports the root', async () => {
    const { s, folder } = await picked();
    const result = await s.writeTree(folder, [
      file('demo_mod/src/main/java/demo_mod/DemoMod.java', 'class DemoMod {}'),
      file('demo_mod/build.gradle.kts'),
      file('demo_mod/gradlew', '#!/bin/sh'),
      file('demo_mod/gradle/wrapper/gradle-wrapper.jar'),
    ]);
    const root = join(folder, 'demo_mod');
    expect(result).toEqual({ ok: true, root, count: 4 });
    expect(written).toEqual([root]);
    expect(await listTree(root)).toEqual([
      'build.gradle.kts',
      'gradle/wrapper/gradle-wrapper.jar',
      'gradlew',
      'src/main/java/demo_mod/DemoMod.java',
    ]);
    expect(await readFile(join(root, 'src/main/java/demo_mod/DemoMod.java'), 'utf8')).toBe(
      'class DemoMod {}',
    );
    if (process.platform !== 'win32') {
      expect((await stat(join(root, 'gradlew'))).mode & 0o777).toBe(0o755);
      expect((await stat(join(root, 'build.gradle.kts'))).mode & 0o111).toBe(0);
    }
  });

  it('writes into an existing empty root folder', async () => {
    const { s, folder } = await picked();
    await mkdir(join(folder, 'demo_mod'));
    const result = await s.writeTree(folder, [file('demo_mod/README.md')]);
    expect(result.ok).toBe(true);
  });

  it('refuses a root folder that already holds files, writing nothing', async () => {
    const { s, folder } = await picked();
    await mkdir(join(folder, 'demo_mod'));
    await writeFile(join(folder, 'demo_mod', 'keep.txt'), 'mine');
    const result = await s.writeTree(folder, [file('demo_mod/README.md')]);
    expect(result).toEqual({
      ok: false,
      reason: 'folder-not-empty',
      root: join(folder, 'demo_mod'),
    });
    expect(await readdir(join(folder, 'demo_mod'))).toEqual(['keep.txt']);
    expect(written).toEqual([]);
    // A file in the root's place counts as not empty too.
    await writeFile(join(folder, 'other_mod'), 'file');
    expect((await s.writeTree(folder, [file('other_mod/README.md')])).ok).toBe(false);
  });

  it('refuses folders that were not picked', async () => {
    await expect(service().writeTree(join(temp, 'out'), [file('demo_mod/a.txt')])).rejects.toThrow(
      /Choose the export folder/,
    );
  });

  it('refuses unsafe, absolute, deep, duplicate and mixed-root paths before writing anything', async () => {
    const { s, folder } = await picked();
    const bad: string[][] = [
      ['demo_mod/../escape.txt'],
      ['../escape.txt'],
      ['/etc/passwd'],
      ['demo_mod/./a.txt'],
      ['demo_mod\\a.txt'],
      ['top.txt'],
      [Array.from({ length: 17 }, (_, index) => `d${index}`).join('/')],
      ['demo_mod/a.txt', 'demo_mod/a.txt'],
      ['demo_mod/a.txt', 'other_mod/b.txt'],
      ['demo_mod/a', 'demo_mod/a/b.txt'],
    ];
    for (const paths of bad) {
      await expect(
        s.writeTree(
          folder,
          paths.map((path) => file(path)),
        ),
      ).rejects.toThrow();
    }
    await expect(s.writeTree(folder, [])).rejects.toThrow(/empty/);
    expect(await readdir(folder)).toEqual([]);
  });

  it('refuses more than 4096 files', async () => {
    const { s, folder } = await picked();
    const files = Array.from({ length: 4097 }, (_, index) => file(`demo_mod/f${index}.txt`));
    await expect(s.writeTree(folder, files)).rejects.toThrow(/4096/);
    expect(await readdir(folder)).toEqual([]);
  });

  it('leaves no temporary files behind', async () => {
    const { s, folder } = await picked();
    await s.writeTree(folder, [file('demo_mod/a.txt'), file('demo_mod/sub/b.txt')]);
    expect(await listTree(folder)).toEqual(['demo_mod/a.txt', 'demo_mod/sub/b.txt']);
  });
});
