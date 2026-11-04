import { describe, expect, it } from 'vitest';
import {
  EventChannels,
  type InvokeChannel,
  InvokeChannels,
  ipcContract,
  isMenuCommand,
  isMinecraftProgress,
} from '../src/shared/ipc-contract';

const bytes = new Uint8Array([1, 2, 3]);

/** One valid and one invalid request and response per channel. */
const samples: Record<
  InvokeChannel,
  { request: [unknown, unknown]; response: [unknown, unknown] }
> = {
  [InvokeChannels.projectPickDirectory]: {
    request: [{ title: 'Pick', mustBeEmpty: true }, { title: 3 }],
    response: [null, 42],
  },
  [InvokeChannels.projectOpenRoot]: {
    request: [{ path: '/tmp/p' }, { path: '' }],
    response: [{ ok: false, reason: 'missing' }, { ok: false }],
  },
  [InvokeChannels.projectCreateRoot]: {
    request: [{ path: '/tmp/p' }, {}],
    response: [{ ok: true }, { ok: 'yes' }],
  },
  [InvokeChannels.projectCloseRoot]: {
    request: [undefined, { path: 'x' }],
    response: [undefined, null],
  },
  [InvokeChannels.projectCurrentRoot]: {
    request: [undefined, 'x'],
    response: ['/tmp/p', 1],
  },
  [InvokeChannels.fsReadFile]: {
    request: [{ path: 'msm.project.json' }, { path: 1 }],
    response: [bytes, 'text'],
  },
  [InvokeChannels.fsWriteFile]: {
    request: [
      { path: 'a.json', data: bytes },
      { path: 'a.json', data: [1, 2] },
    ],
    response: [undefined, true],
  },
  [InvokeChannels.fsReadDir]: {
    request: [{ path: 'content' }, null],
    response: [[{ name: 'a', kind: 'file' }], [{ name: 'a', kind: 'link' }]],
  },
  [InvokeChannels.fsExists]: {
    request: [{ path: 'content' }, { path: 'a', extra: 1 }],
    response: [false, 'no'],
  },
  [InvokeChannels.fsMkdirp]: {
    request: [{ path: 'assets/x' }, undefined],
    response: [undefined, 0],
  },
  [InvokeChannels.fsRemove]: {
    request: [{ path: 'content/x' }, 'content/x'],
    response: [undefined, {}],
  },
  [InvokeChannels.appInfo]: {
    request: [undefined, {}],
    response: [
      { version: '0.0.0', electron: '1', platform: 'linux' },
      { version: '0.0.0', electron: '1' },
    ],
  },
  [InvokeChannels.dialogConfirmDiscard]: {
    request: [{ message: 'Discard?' }, { text: 'Discard?' }],
    response: [true, 'true'],
  },
  [InvokeChannels.dialogPickFiles]: {
    request: [
      { title: 'Import textures', filters: [{ name: 'PNG', extensions: ['png'] }] },
      { title: 'Import', filters: [{ name: 'PNG' }] },
    ],
    response: [[{ path: '/tmp/a.png', name: 'a.png', data: bytes }], [{ path: '/tmp/a.png' }]],
  },
  [InvokeChannels.dialogSaveFile]: {
    request: [
      { title: 'Export', defaultName: 'pack.zip', data: bytes },
      { title: 'Export', defaultName: '../pack.zip', data: bytes },
    ],
    response: ['/tmp/pack.zip', ''],
  },
  [InvokeChannels.shellShowItemInFolder]: {
    request: [{ path: '/tmp/pack.zip' }, { path: '' }],
    response: [undefined, '/tmp'],
  },
  [InvokeChannels.targetsReadVendored]: {
    request: [
      { targetId: 'some-target', key: 'mcmetaRegistries' },
      { targetId: 'some-target', key: 'secrets' },
    ],
    response: [bytes, [1]],
  },
  [InvokeChannels.settingsGet]: {
    request: [undefined, {}],
    response: [
      { minecraftDir: null, detectedMinecraftDir: '/home/a/.minecraft' },
      { minecraftDir: null },
    ],
  },
  [InvokeChannels.settingsSet]: {
    request: [{ minecraftDir: '/games/minecraft' }, { minecraftDir: 3 }],
    response: [undefined, false],
  },
  [InvokeChannels.minecraftStatus]: {
    request: [{ mcVersion: '1.0-test' }, { mcVersion: '../x' }],
    response: [
      { minecraftDir: null, installed: [], chosen: null, cache: null },
      { minecraftDir: null, installed: [], chosen: null },
    ],
  },
  [InvokeChannels.minecraftExtract]: {
    request: [{ mcVersion: '1.0' }, { mcVersion: '..' }],
    response: [
      { version: '1.0', jarSha1: 'ab', fileCount: 3, extractedAt: 'now', schemaVersion: 1 },
      { version: '1.0', jarSha1: 'ab', fileCount: -1, extractedAt: 'now', schemaVersion: 1 },
    ],
  },
  [InvokeChannels.minecraftReadAsset]: {
    request: [
      { mcVersion: '1.0', path: 'assets/minecraft/models/block/stone.json' },
      { mcVersion: '1.0/x', path: 'assets/minecraft/models/block/stone.json' },
    ],
    response: [null, 'bytes'],
  },
  [InvokeChannels.minecraftListAssets]: {
    request: [
      { mcVersion: '1.0', prefix: 'assets/minecraft/textures/block/' },
      { mcVersion: '1.0' },
    ],
    response: [['assets/minecraft/textures/block/a.png'], [1]],
  },
  [InvokeChannels.minecraftInstallResourcePack]: {
    request: [
      { fileName: 'My Pack-1.0.zip', data: bytes },
      { fileName: '../evil.zip', data: bytes },
    ],
    response: [{ path: '/home/a/.minecraft/resourcepacks/My Pack-1.0.zip' }, {}],
  },
  [InvokeChannels.minecraftListWorlds]: {
    request: [undefined, { dir: 'x' }],
    response: [
      [{ dir: 'New World', name: 'New World', lastModified: '2026-01-01T00:00:00.000Z' }],
      [{ dir: 'New World' }],
    ],
  },
  [InvokeChannels.minecraftInstallDataPack]: {
    request: [
      { worldDir: 'New World', fileName: 'pack-data.zip', data: bytes },
      { worldDir: '../New World', fileName: 'pack-data.zip', data: bytes },
    ],
    response: [{ path: '/home/a/.minecraft/saves/New World/datapacks/pack-data.zip' }, {}],
  },
  [InvokeChannels.mcfunctionCheck]: {
    request: [
      {
        targetId: 'some-target',
        source: 'say hi',
        options: { uri: 'file:///msm/data/a/function/b.mcfunction', projectIds: { function: [] } },
      },
      { targetId: 'some-target', source: 'say hi', options: { uri: 'x' } },
    ],
    response: [
      [
        {
          severity: 'warning',
          code: 'mcfunction.lint.undeclaredSymbol',
          message: 'Cannot find item',
          line: 0,
          start: 8,
          end: 29,
          offset: { start: 8, end: 29 },
        },
      ],
      [{ severity: 'fatal', code: 'mcfunction.parse', message: '', line: 0, start: 0, end: 0 }],
    ],
  },
  [InvokeChannels.mcfunctionComplete]: {
    request: [
      {
        targetId: 'some-target',
        source: 'give @s ',
        offset: 8,
        options: { uri: 'file:///x.mcfunction', projectIds: {}, limit: 50 },
      },
      {
        targetId: 'some-target',
        source: 'give @s ',
        offset: 1.5,
        options: { uri: 'file:///x.mcfunction', projectIds: {} },
      },
    ],
    response: [
      [{ label: 'stone', insertText: 'minecraft:stone', kind: 'value' }],
      [{ label: 'stone', kind: 'value' }],
    ],
  },
  [InvokeChannels.exportsPickFolder]: {
    request: [{ title: 'Export' }, {}],
    response: ['/tmp/out', ''],
  },
  [InvokeChannels.exportsWriteFiles]: {
    request: [
      { folder: '/tmp/out', files: [{ name: 'pack-data.zip', data: bytes }] },
      { folder: '/tmp/out', files: [{ name: 'nested/pack.zip', data: bytes }] },
    ],
    response: [{ paths: ['/tmp/out/pack-data.zip'] }, { paths: [''] }],
  },
  [InvokeChannels.thumbnailsGet]: {
    request: [
      { assetPath: 'assets/demo/textures/block/ruby.png', size: 64 },
      { assetPath: 'assets/demo/textures/block/ruby.png', size: 4096 },
    ],
    response: [bytes, null],
  },
};

describe('IPC contract', () => {
  for (const channel of Object.values(InvokeChannels)) {
    it(`${channel} accepts valid and rejects invalid payloads`, () => {
      const schema = ipcContract[channel];
      const sample = samples[channel];
      expect(schema.request.safeParse(sample.request[0]).success).toBe(true);
      expect(schema.request.safeParse(sample.request[1]).success).toBe(false);
      expect(schema.response.safeParse(sample.response[0]).success).toBe(true);
      expect(schema.response.safeParse(sample.response[1]).success).toBe(false);
    });
  }

  it('has unique channel names prefixed msm:v1:', () => {
    const names = [...Object.values(InvokeChannels), ...Object.values(EventChannels)];
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name.startsWith('msm:v1:')).toBe(true);
  });

  it('has a schema for every invoke channel and nothing else', () => {
    expect(Object.keys(ipcContract).sort()).toEqual(Object.values(InvokeChannels).sort());
  });

  it('bounds mcfunction requests', () => {
    const { request } = ipcContract[InvokeChannels.mcfunctionCheck];
    const base = { targetId: 't', options: { uri: 'file:///a.mcfunction', projectIds: {} } };
    expect(request.safeParse({ ...base, source: 'x'.repeat(2 * 1024 * 1024) }).success).toBe(true);
    expect(request.safeParse({ ...base, source: 'x'.repeat(2 * 1024 * 1024 + 1) }).success).toBe(
      false,
    );
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `ns:f${i}`);
    const withIds = (projectIds: Record<string, string[]>) =>
      request.safeParse({ ...base, source: '', options: { ...base.options, projectIds } });
    expect(withIds({ function: ids(25_000), 'tag/item': ids(25_000) }).success).toBe(true);
    expect(withIds({ function: ids(25_000), 'tag/item': ids(25_001) }).success).toBe(false);
    expect(withIds({ 'Bad Category': [] }).success).toBe(false);
  });

  it('rejects unsafe world folders and pack names', () => {
    const { request } = ipcContract[InvokeChannels.minecraftInstallDataPack];
    for (const worldDir of ['..', '.', 'a/b', 'a\\b', 'C:x', '']) {
      expect(request.safeParse({ worldDir, fileName: 'p.zip', data: bytes }).success).toBe(false);
    }
    for (const fileName of ['p.txt', '../p.zip', 'p/q.zip']) {
      expect(request.safeParse({ worldDir: 'w', fileName, data: bytes }).success).toBe(false);
    }
  });

  it('validates extraction progress payloads', () => {
    expect(isMinecraftProgress({ mcVersion: '1.0', phase: 'writing', done: 3, total: 9 })).toBe(
      true,
    );
    expect(isMinecraftProgress({ mcVersion: '1.0', phase: 'melting', done: 3, total: 9 })).toBe(
      false,
    );
    expect(isMinecraftProgress(null)).toBe(false);
  });

  it('recognises menu commands', () => {
    expect(isMenuCommand('save')).toBe(true);
    expect(isMenuCommand('format-disk')).toBe(false);
    expect(isMenuCommand(1)).toBe(false);
  });
});
