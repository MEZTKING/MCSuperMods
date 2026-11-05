import { describe, expect, it } from 'vitest';
import {
  EventChannels,
  type InvokeChannel,
  InvokeChannels,
  ipcContract,
  isExportFileName,
  isMenuCommand,
  isMenuOpenRecent,
  isMinecraftProgress,
  isUpdateStatus,
  type UpdateStatus,
  updateStatusSchema,
} from '../src/shared/ipc-contract';

const bytes = new Uint8Array([1, 2, 3]);

const prismRef = {
  launcher: 'prism',
  root: '/home/a/.local/share/PrismLauncher',
  instance: 'My Pack',
};
const prismLocation = {
  ref: prismRef,
  id: 'prism:My_Pack',
  displayName: 'My Pack',
  mcVersion: '1.0-test',
  loader: { kind: 'fabric', version: '0.1' },
  gameDir: '/home/a/.local/share/PrismLauncher/instances/My Pack/minecraft',
  modsDir: '/home/a/.local/share/PrismLauncher/instances/My Pack/minecraft/mods',
  problems: [],
  warnings: [
    {
      code: 'location.version-mismatch',
      message: 'This instance runs Minecraft 1.0-test; the project targets 2.0-test.',
    },
  ],
};
const officialLocation = {
  ref: { launcher: 'official', root: 'C:\\Users\\a\\AppData\\Roaming\\.minecraft' },
  id: 'official:default',
  displayName: 'Official launcher',
  mcVersion: null,
  loader: null,
  gameDir: 'C:\\Users\\a\\AppData\\Roaming\\.minecraft',
  modsDir: null,
  problems: [{ code: 'location.game-dir-missing', message: 'Start the game once.' }],
  warnings: [],
};
const launchers = {
  prismDataDirs: ['/home/a/.local/share/PrismLauncher'],
  multimcRoots: [],
  curseForgeRoots: ['C:\\Users\\a\\curseforge\\minecraft'],
};

const testStatus = {
  mcVersion: '26.3',
  loader: '0.20.1',
  api: '0.165.2+26.3',
  location: null,
  mode: 'blocked',
  reason: 'No game location was found.',
  launcherProgram: null,
  managedInstanceName: 'MCSuperMods Test (26.3)',
  managedInstanceSelected: false,
  canCreateInstance: true,
};

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
  [InvokeChannels.projectRecent]: {
    request: [undefined, { all: true }],
    response: [
      [{ root: '/tmp/p', name: 'p', openedAt: '2026-01-01T00:00:00.000Z', exists: false }],
      [{ root: '/tmp/p', name: 'p', openedAt: '2026-01-01T00:00:00.000Z' }],
    ],
  },
  [InvokeChannels.projectOpenRecent]: {
    request: [{ root: 'C:\\Users\\a\\Projects\\ruby' }, { root: 'relative/p' }],
    response: [{ ok: true }, { ok: 'yes' }],
  },
  [InvokeChannels.projectRemoveRecent]: {
    request: [{ root: '/tmp/p' }, { path: '/tmp/p' }],
    response: [undefined, true],
  },
  [InvokeChannels.projectClearRecent]: {
    request: [undefined, { root: '/tmp/p' }],
    response: [undefined, 0],
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
      {
        minecraftDir: null,
        updates: { autoCheck: true },
        launchers,
        installTarget: prismRef,
        detectedMinecraftDir: '/home/a/.minecraft',
      },
      { minecraftDir: null, detectedMinecraftDir: null },
    ],
  },
  [InvokeChannels.settingsSet]: {
    request: [
      { minecraftDir: '/games/minecraft', launchers, installTarget: prismRef },
      { minecraftDir: 3 },
    ],
    response: [undefined, false],
  },
  [InvokeChannels.minecraftStatus]: {
    request: [{ mcVersion: '1.0-test' }, { mcVersion: '../x' }],
    response: [
      {
        minecraftDir: null,
        installed: [{ id: '1.0-test' }],
        chosen: { id: '1.0-test' },
        cache: null,
        target: prismLocation,
        targetMissing: false,
        jar: { versionId: '1.0-test', launcher: 'prism' },
        warnings: prismLocation.warnings,
      },
      { minecraftDir: null, installed: [], chosen: null },
    ],
  },
  [InvokeChannels.minecraftListLocations]: {
    request: [{ mcVersion: '1.0-test' }, { mcVersion: '1.0-test', root: '/x' }],
    response: [
      { locations: [officialLocation, prismLocation], selected: 'prism:My_Pack' },
      { locations: [{ ...prismLocation, extra: true }], selected: null },
    ],
  },
  [InvokeChannels.minecraftExtract]: {
    request: [{ mcVersion: '1.0' }, { mcVersion: '..' }],
    response: [
      { version: '1.0', jarSha1: 'ab', fileCount: 3, extractedAt: 'now', schemaVersion: 2 },
      { version: '1.0', jarSha1: 'ab', fileCount: 3, extractedAt: 'now', schemaVersion: 1 },
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
  [InvokeChannels.exportsRuntimeJar]: {
    request: [undefined, { path: '/tmp/msm_runtime.jar' }],
    response: [null, '/tmp/msm_runtime.jar'],
  },
  [InvokeChannels.exportsGeckolibJar]: {
    request: [{ targetId: 'mc-26.3' }, { targetId: '' }],
    response: [bytes, '/tmp/geckolib.jar'],
  },
  [InvokeChannels.testInMinecraftStatus]: {
    request: [{ targetId: 'mc-26.3' }, { targetId: '' }],
    response: [testStatus, { ...testStatus, mode: 'maybe' }],
  },
  [InvokeChannels.testInMinecraftCreateInstance]: {
    request: [{ targetId: 'mc-26.3' }, {}],
    response: [{ ...testStatus, location: prismLocation, mode: 'launch' }, null],
  },
  [InvokeChannels.testInMinecraftRun]: {
    request: [
      { targetId: 'mc-26.3', modId: 'ruby_mod', data: bytes },
      { targetId: 'mc-26.3', modId: '../evil', data: bytes },
    ],
    response: [
      {
        jarPath: '/p/instances/T/minecraft/mods/ruby_mod.jar',
        replaced: false,
        fabricApi: 'installed',
        fabricApiFile: 'fabric-api-0.165.2+26.3.jar',
        launched: true,
        note: null,
      },
      {
        jarPath: '/p/mods/ruby_mod.jar',
        replaced: false,
        fabricApi: 'downloaded',
        fabricApiFile: 'fabric-api.jar',
        launched: false,
        note: null,
      },
    ],
  },
  [InvokeChannels.testInMinecraftPickLauncherProgram]: {
    request: [{ launcher: 'prism' }, { launcher: 'official' }],
    response: ['/usr/bin/prismlauncher', 3],
  },
  [InvokeChannels.thumbnailsGet]: {
    request: [
      { assetPath: 'assets/demo/textures/block/ruby.png', size: 64 },
      { assetPath: 'assets/demo/textures/block/ruby.png', size: 4096 },
    ],
    response: [bytes, null],
  },
  [InvokeChannels.updatesCheck]: {
    request: [undefined, { force: true }],
    response: [
      { state: 'downloaded', version: '0.2.0' },
      { state: 'downloading', percent: 140 },
    ],
  },
  [InvokeChannels.updatesInstall]: {
    request: [undefined, {}],
    response: [undefined, 'yes'],
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

  it('validates settings patches', () => {
    const { request } = ipcContract[InvokeChannels.settingsSet];
    expect(request.safeParse({}).success).toBe(true);
    expect(request.safeParse({ updates: { autoCheck: false } }).success).toBe(true);
    expect(request.safeParse({ minecraftDir: null, updates: { autoCheck: true } }).success).toBe(
      true,
    );
    expect(request.safeParse({ updates: { autoCheck: 'no' } }).success).toBe(false);
    expect(request.safeParse({ updates: { autoCheck: true, channel: 'beta' } }).success).toBe(
      false,
    );
  });

  it('validates launcher settings and install targets', () => {
    const { request } = ipcContract[InvokeChannels.settingsSet];
    const ok = (patch: unknown) => request.safeParse(patch).success;
    expect(ok({ installTarget: null })).toBe(true);
    expect(ok({ installTarget: { launcher: 'official', root: '/home/a/.minecraft' } })).toBe(true);
    expect(
      ok({ installTarget: { launcher: 'curseforge', root: 'D:/cf/minecraft', instance: 'A' } }),
    ).toBe(true);
    expect(
      ok({ installTarget: { launcher: 'prism', root: '\\\\server\\prism', instance: 'x' } }),
    ).toBe(true);
    // Strict objects, absolute roots, safe instance folders.
    expect(ok({ installTarget: { ...prismRef, extra: 1 } })).toBe(false);
    expect(ok({ installTarget: { ...prismRef, root: 'relative/prism' } })).toBe(false);
    expect(ok({ installTarget: { ...prismRef, root: '' } })).toBe(false);
    for (const instance of ['..', '.', 'a/b', 'a\\b', 'C:x', '']) {
      expect(ok({ installTarget: { ...prismRef, instance } })).toBe(false);
    }
    expect(ok({ installTarget: { ...prismRef, launcher: 'tlauncher' } })).toBe(false);
    // The official launcher has no instance; launcher instances need one.
    expect(ok({ installTarget: { launcher: 'official', root: '/m', instance: 'x' } })).toBe(false);
    expect(ok({ installTarget: { launcher: 'prism', root: '/p' } })).toBe(false);
    // Launcher lists: all three keys, absolute paths, at most 16 each.
    const roots = (n: number) => Array.from({ length: n }, (_, i) => `/roots/${i}`);
    expect(ok({ launchers: { ...launchers, multimcRoots: roots(16) } })).toBe(true);
    expect(ok({ launchers: { ...launchers, multimcRoots: roots(17) } })).toBe(false);
    expect(ok({ launchers: { ...launchers, prismDataDirs: ['PrismLauncher'] } })).toBe(false);
    expect(ok({ launchers: { prismDataDirs: [], multimcRoots: [] } })).toBe(false);
    expect(ok({ launchers: { ...launchers, polymcRoots: [] } })).toBe(false);
  });

  it('validates game location views and launcher status fields', () => {
    const { response } = ipcContract[InvokeChannels.minecraftListLocations];
    const ok = (location: unknown) =>
      response.safeParse({ locations: [location], selected: null }).success;
    expect(ok(prismLocation)).toBe(true);
    expect(ok({ ...prismLocation, id: 'prism:My Pack' })).toBe(false);
    expect(ok({ ...prismLocation, loader: { kind: 'rift', version: null } })).toBe(false);
    expect(ok({ ...prismLocation, problems: [{ code: 'location.on-fire', message: '' }] })).toBe(
      false,
    );
    expect(ok({ ...prismLocation, ref: { ...prismRef, instance: '..' } })).toBe(false);
    const { response: status } = ipcContract[InvokeChannels.minecraftStatus];
    const base = { minecraftDir: null, installed: [], chosen: null, cache: null };
    expect(status.safeParse(base).success).toBe(true);
    expect(
      status.safeParse({ ...base, target: null, targetMissing: true, jar: null, warnings: [] })
        .success,
    ).toBe(true);
    expect(
      status.safeParse({ ...base, jar: { versionId: '1.0', launcher: 'steam' } }).success,
    ).toBe(false);
    expect(status.safeParse({ ...base, targetMissing: 'yes' }).success).toBe(false);
  });

  it('validates update status payloads', () => {
    const valid: UpdateStatus[] = [
      { state: 'idle' },
      { state: 'checking' },
      { state: 'available', version: '1.2.3' },
      { state: 'not-available' },
      { state: 'not-available', reason: 'no-published-release' },
      { state: 'downloading', percent: 42 },
      { state: 'downloaded', version: '1.2.3' },
      { state: 'error', message: 'offline' },
      { state: 'disabled', reason: 'unsupported-platform' },
    ];
    for (const status of valid) {
      expect(isUpdateStatus(status)).toBe(true);
      expect(updateStatusSchema.safeParse(status).success).toBe(true);
    }
    const invalid: unknown[] = [
      null,
      { state: 'installing' },
      { state: 'available' },
      { state: 'downloading', percent: Number.NaN },
      { state: 'disabled', reason: 'tuesday' },
      { state: 'not-available', reason: 'tuesday' },
    ];
    for (const status of invalid) {
      expect(isUpdateStatus(status)).toBe(false);
      expect(updateStatusSchema.safeParse(status).success).toBe(false);
    }
  });

  it('recognises menu commands', () => {
    expect(isMenuCommand('checkForUpdates')).toBe(true);
    expect(isMenuCommand('save')).toBe(true);
    expect(isMenuCommand('newProjectFromStarter')).toBe(true);
    expect(isMenuCommand('examples')).toBe(true);
    expect(isMenuCommand('format-disk')).toBe(false);
    expect(isMenuCommand(1)).toBe(false);
    expect(isMenuCommand('clearRecentProjects')).toBe(true);
    for (const command of ['importStructure', 'exportStructures', 'exportSchematics']) {
      expect(isMenuCommand(command)).toBe(true);
    }
  });

  it('accepts pack zips and namespaced structure paths as export file names', () => {
    for (const name of ['demo-data.zip', 'demo/hut.nbt', 'demo/a/b.c_d-1.schem']) {
      expect(isExportFileName(name)).toBe(true);
    }
    for (const name of [
      'hut.nbt',
      'nested/pack.zip',
      '../demo/hut.nbt',
      'demo/../hut.nbt',
      'demo/./hut.nbt',
      'Demo/hut.nbt',
      'demo/hut.json',
      '/demo/hut.nbt',
      `demo/${'a'.repeat(260)}.nbt`,
    ]) {
      expect(isExportFileName(name)).toBe(false);
    }
    const write = ipcContract[InvokeChannels.exportsWriteFiles].request;
    expect(
      write.safeParse({ folder: '/tmp/out', files: [{ name: 'demo/hut.nbt', data: bytes }] })
        .success,
    ).toBe(true);
  });

  it('validates recent-project requests and menu payloads', () => {
    const open = ipcContract[InvokeChannels.projectOpenRecent].request;
    expect(open.safeParse({ root: '/home/a/ruby' }).success).toBe(true);
    expect(open.safeParse({ root: '\\\\server\\share\\ruby' }).success).toBe(true);
    for (const root of ['', 'ruby', '../ruby', '/a\0b', 1, null]) {
      expect(open.safeParse({ root }).success).toBe(false);
    }
    expect(open.safeParse({ root: '/a', path: '/b' }).success).toBe(false);
    const list = ipcContract[InvokeChannels.projectRecent].response;
    const entry = { root: '/p', name: 'p', openedAt: 'now', exists: true };
    expect(list.safeParse(Array.from({ length: 10 }, () => entry)).success).toBe(true);
    expect(list.safeParse(Array.from({ length: 11 }, () => entry)).success).toBe(false);
    expect(isMenuOpenRecent({ root: '/p' })).toBe(true);
    expect(isMenuOpenRecent({ root: '' })).toBe(false);
    expect(isMenuOpenRecent('/p')).toBe(false);
  });
});
