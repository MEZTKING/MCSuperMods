/**
 * The main-process plugin service (ADR 0035 D1, D2) over a temporary MSM home, and its IPC
 * handlers.
 */

import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPluginsService, PLUGINS_DIR } from '../src/main/platform/plugins';
import { PLUGIN_MAIN_MAX_BYTES } from '../src/shared/ipc-channels';

let home: string;
const opened: string[] = [];

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'msm-plugins-'));
  opened.length = 0;
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

const manifest = (overrides: Record<string, unknown> = {}) => ({
  manifestVersion: 1,
  id: 'sample.greetings',
  name: 'Greetings',
  version: '1.0.0',
  apiVersion: '^1.0.0',
  main: 'main.js',
  schemas: ['symbols.json'],
  capabilities: ['elementKinds'],
  ...overrides,
});

async function addPlugin(
  folder: string,
  files: Record<string, string | Uint8Array>,
): Promise<string> {
  const dir = join(home, PLUGINS_DIR, folder);
  await mkdir(dir, { recursive: true });
  for (const [name, contents] of Object.entries(files)) {
    await mkdir(join(dir, name, '..'), { recursive: true });
    await writeFile(join(dir, name), contents);
  }
  return dir;
}

const service = () =>
  createPluginsService({
    msmHome: home,
    openPath: async (path) => {
      opened.push(path);
      return '';
    },
  });

describe('createPluginsService', () => {
  it('lists nothing without a plugins folder', async () => {
    await expect(service().list()).resolves.toEqual([]);
  });

  it('lists folders in order with their manifests or problems', async () => {
    await addPlugin('b-greetings', {
      'msm-plugin.json': JSON.stringify(manifest()),
      'main.js': 'defineMsmPlugin({});',
      'symbols.json': '{}',
    });
    await addPlugin('a-empty', {});
    await addPlugin('c-json', { 'msm-plugin.json': '{ nope' });
    await addPlugin('d-invalid', {
      'msm-plugin.json': JSON.stringify(manifest({ id: 'msm.evil', main: '/etc/passwd' })),
    });
    await addPlugin('e-copy', { 'msm-plugin.json': JSON.stringify(manifest()) });
    await addPlugin('.hidden', { 'msm-plugin.json': JSON.stringify(manifest({ id: 'x.y' })) });
    await writeFile(join(home, PLUGINS_DIR, 'loose-file.json'), '{}');

    const entries = await service().list();
    expect(entries.map((entry) => [entry.folder, entry.id, entry.manifest !== null])).toEqual([
      ['a-empty', 'a-empty', false],
      ['b-greetings', 'sample.greetings', true],
      ['c-json', 'c-json', false],
      ['d-invalid', 'msm.evil', false],
      ['e-copy', 'sample.greetings', false],
    ]);
    expect(entries[0]?.problems[0]).toMatchObject({
      code: 'plugin.manifest-invalid',
      message: 'The folder has no readable msm-plugin.json.',
    });
    expect(entries[1]?.manifest).toMatchObject({
      id: 'sample.greetings',
      schemas: ['symbols.json'],
    });
    expect(entries[2]?.problems[0]?.message).toContain('is not valid JSON');
    expect(entries[3]?.problems.map((problem) => problem.path)).toEqual(['/id', '/main']);
    expect(entries[4]?.problems[0]).toMatchObject({
      code: 'plugin.refused',
      message: expect.stringContaining('b-greetings already holds the plugin sample.greetings'),
    });
  });

  it('reads the bundle and schema files', async () => {
    await addPlugin('greetings', {
      'msm-plugin.json': JSON.stringify(manifest({ main: 'dist/main.js' })),
      'dist/main.js': 'defineMsmPlugin({ id: "sample.greetings" });',
      'symbols.json': '{"ref":"x"}',
    });
    const bundle = await service().read('sample.greetings');
    expect(bundle.main).toBe('defineMsmPlugin({ id: "sample.greetings" });');
    expect(bundle.schemas).toEqual(['{"ref":"x"}']);
    expect(bundle.manifest.id).toBe('sample.greetings');
  });

  it('refuses unknown plugins, missing, oversized, non-UTF-8 and escaping files', async () => {
    await expect(service().read('none.here')).rejects.toThrow(/^plugin\.manifest-invalid: /);

    await addPlugin('missing', {
      'msm-plugin.json': JSON.stringify(manifest({ id: 'a.missing' })),
    });
    await expect(service().read('a.missing')).rejects.toThrow('main.js does not exist');

    await addPlugin('large', {
      'msm-plugin.json': JSON.stringify(manifest({ id: 'a.large', schemas: [] })),
      'main.js': new Uint8Array(PLUGIN_MAIN_MAX_BYTES + 1),
    });
    await expect(service().read('a.large')).rejects.toThrow(/^plugin\.too-large: /);

    await addPlugin('binary', {
      'msm-plugin.json': JSON.stringify(manifest({ id: 'a.binary', schemas: [] })),
      'main.js': new Uint8Array([0xff, 0xfe, 0xfd]),
    });
    await expect(service().read('a.binary')).rejects.toThrow('is not UTF-8 text');

    const outside = join(home, 'secret.js');
    await writeFile(outside, 'secret');
    const dir = await addPlugin('escape', {
      'msm-plugin.json': JSON.stringify(manifest({ id: 'a.escape', schemas: [] })),
    });
    await symlink(outside, join(dir, 'main.js'));
    await expect(service().read('a.escape')).rejects.toThrow('lies outside the plugin folder');
  });

  it('creates and opens the plugins folder', async () => {
    const plugins = service();
    await plugins.openFolder();
    expect(opened).toEqual([join(home, PLUGINS_DIR)]);
    await expect(plugins.list()).resolves.toEqual([]);
    const failing = createPluginsService({ msmHome: home, openPath: async () => 'no shell' });
    await expect(failing.openFolder()).rejects.toThrow('no shell');
  });
});
