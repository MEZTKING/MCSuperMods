import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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
