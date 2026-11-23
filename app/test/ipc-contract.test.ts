import { DEFAULT_AI_SETTINGS } from '@msm/ai';
import { describe, expect, it } from 'vitest';
import {
  AI_CONTEXT_BLOCK_MAX,
  AI_KEY_MAX,
  AI_TEXT_MAX,
  AI_TOOL_RESULT_MAX,
  ASSET_OBJECT_MAX_BYTES,
  DATA_FILES_MAX,
  EventChannels,
  EXPORT_TREE_MAX_FILES,
  GUIDE_INDEX_SECTIONS_MAX,
  GUIDE_PAGE_MAX_CHARS,
  type InvokeChannel,
  InvokeChannels,
  ipcContract,
  isAiEventPayload,
  isExportFileName,
  isExportTreePath,
  isMenuCommand,
  isMenuOpenRecent,
  isMinecraftProgress,
  isUpdateStatus,
  SCRIPT_MAX_SOURCE_LENGTH,
  SCRIPT_MAX_TYPINGS_LENGTH,
  STRUCTURE_TEMPLATE_IDS_MAX,
  STRUCTURE_TEMPLATE_MAX_BYTES,
  STRUCTURE_TEMPLATES_MAX_TOTAL_BYTES,
  UPDATE_NOTES_MAX,
  type UpdateStatus,
  updateStatusSchema,
  VANILLA_NAME_MAX,
  VANILLA_NAMES_MAX,
  WORLDGEN_FILES_MAX,
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

const tryItWorld = {
  id: 'official:default/New World',
  name: 'Castle Build',
  folder: 'New World',
  gameFolder: { id: 'official:default', name: 'Official launcher', selected: true },
  lastPlayed: '2026-11-14T10:00:00.000Z',
  versionName: '26.3',
  dataVersion: 4440,
  readable: true,
  icon: bytes,
  seed: '-7046235981325167892',
};
const tryItArea = {
  format: 1,
  world: 'Castle Build',
  dataVersion: 4440,
  origin: { x: -24, y: 52, z: -24 },
  size: { x: 48, y: 32, z: 48 },
  palette: ['minecraft:air', 'minecraft:stone'],
  blocks: new Uint16Array(48 * 32 * 48),
  skipped: { blockEntities: 0, entities: 0, missingChunks: 0 },
  warnings: [],
};

const pluginManifest = {
  manifestVersion: 1,
  id: 'sample.greetings',
  name: 'Greetings',
  version: '1.0.0',
  apiVersion: '^1.0.0',
  main: 'main.js',
  schemas: ['symbols.json'],
  capabilities: ['elementKinds', 'validators'],
};

const aiStart = {
  runId: 'run-1',
  conversationId: 'conv-1',
  mode: 'build',
  text: 'Make a ruby tools mod.',
  contextBlocks: ['Problem: schema.missing at demo:ruby'],
  limits: { maxToolTurns: 10, maxOutputTokens: 50_000, taskBudget: true },
};

const sampleMod = {
  projectId: 'AANobbMI',
  versionId: 'VERSION1',
  title: 'Sodium',
  fileName: 'sodium.jar',
  url: 'https://cdn.modrinth.com/data/AANobbMI/versions/VERSION1/sodium.jar',
  sha1: 'a'.repeat(40),
  sha512: 'b'.repeat(128),
  size: 42,
};
const sampleView = {
  root: '/m/pack',
  modpack: {
    formatVersion: 1,
    name: 'Pack',
    version: '1.0.0',
    targetId: 'mc-26.3',
    projects: [{ path: '../ruby' }],
    mods: [sampleMod],
  },
  members: [{ path: '../ruby', root: '/m/ruby', found: true, name: 'Ruby', targetId: 'mc-26.3' }],
};

const playStatus = {
  targetId: 'mc-26.3',
  mcVersion: '26.3',
  instanceName: 'MCSuperMods Test (26.3)',
  instance: 'ready',
  gameDir: '/p/instances/MCSuperMods Test (26.3)/minecraft',
  state: 'test-world',
  testWorld: 'msm-test-ruby',
  world: 'msm-test-ruby',
  seed: null,
  handled: { seq: 3, ok: true },
  canReload: true,
  restartNeeded: [],
  label: 'In the test world',
  busy: null,
  progress: null,
};
const playInput = {
  targetId: 'mc-26.3',
  modId: 'ruby',
  jar: bytes,
  outputs: [
    { path: 'data/ruby/recipe/ruby.json', contents: { type: 'x' }, elementId: 'ruby:ruby' },
    { path: 'assets/ruby/textures/item/ruby.png', contents: bytes },
  ],
  namespaces: ['ruby'],
  items: [{ id: 'ruby:ruby', count: 16 }, { id: 'ruby:ruby_lamp' }],
};
const playResult = {
  ok: true,
  instanceName: 'MCSuperMods Test (26.3)',
  instanceCreated: false,
  gameDir: '/p/instances/MCSuperMods Test (26.3)/minecraft',
  world: 'msm-test-ruby',
  restarted: true,
  launched: true,
  note: null,
  fabricApi: 'present',
  itemsLeftOut: 0,
  seq: 4,
};
const reloadResult = {
  ok: true,
  action: 'reload',
  seq: 5,
  changes: 2,
  assets: false,
  counts: { data: 1, scripts: 0, events: 0, assets: 0, worldData: 0, removed: 0 },
  restart: [
    {
      reason: 'new-definition',
      path: 'msm/ruby/block/ruby_lamp.json',
      kind: 'block',
      elementId: 'ruby:ruby_lamp',
      text: 'You added a new block: Ruby Lamp. New blocks are only read when Minecraft starts.',
    },
  ],
  message: 'Reloading 2 changes in Minecraft.',
};

/** One valid and one invalid request and response per channel. */
const samples: Record<
  InvokeChannel,
  { request: [unknown, unknown]; response: [unknown, unknown] }
> = {
  [InvokeChannels.projectPickDirectory]: {
    request: [{ title: 'Pick', mustBeEmpty: true, purpose: 'project' }, { title: 3 }],
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
  [InvokeChannels.projectDefaultParent]: {
    request: [undefined, 'x'],
    response: ['/home/a/Documents/MCSuperMods', 1],
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
  [InvokeChannels.projectRecentSummary]: {
    request: [{ root: '/tmp/p' }, { root: 'relative' }],
    response: [
      { things: 3, picture: new Uint8Array([1]), pictureFrom: 'pack' },
      { things: -1, picture: null, pictureFrom: null },
    ],
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
        cacheOutdated: true,
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
      {
        version: '1.0',
        jarSha1: 'ab',
        jarPath: '/home/a/.minecraft/versions/1.0/1.0.jar',
        dataFolders: ['loot_table', 'worldgen/noise'],
        fileCount: 3,
        byteCount: 1024,
        extractedAt: 'now',
        schemaVersion: 7,
      },
      {
        version: '1.0',
        jarSha1: 'ab',
        jarPath: '/j.jar',
        dataFolders: [],
        fileCount: 3,
        byteCount: 1024,
        extractedAt: 'now',
        schemaVersion: 6,
      },
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
  [InvokeChannels.minecraftWorldgenFiles]: {
    request: [{ mcVersion: '1.0' }, { mcVersion: '1.0', path: 'data/' }],
    response: [
      {
        version: '1.0',
        files: { 'worldgen/noise': { 'minecraft:ridge': { firstOctave: -7, amplitudes: [1] } } },
        fileCount: 1,
        resolvedBiomeLists: null,
      },
      { version: '1.0', files: {}, fileCount: 0 },
    ],
  },
  [InvokeChannels.minecraftDataFiles]: {
    request: [
      { mcVersion: '1.0', folders: ['loot_table', 'tags/item'] },
      { mcVersion: '1.0', folders: ['../escape'] },
    ],
    response: [
      {
        version: '1.0',
        folders: { loot_table: { 'minecraft:blocks/made_up': { pools: [] } } },
        fileCount: 1,
      },
      { version: '1.0', folders: {}, fileCount: 0, resolvedBiomeLists: null },
    ],
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
    response: [
      {
        path: '/home/a/.minecraft/saves/New World/datapacks/pack-data.zip',
        backup: {
          path: '/home/a/.msm/backups/official-default-0a1b2c3d/New World/2026-11-21_10-00-00.zip',
          fileName: '2026-11-21_10-00-00.zip',
          location: 'official-default-0a1b2c3d',
          worldDir: 'New World',
        },
      },
      {
        path: '/x/p.zip',
        backup: { path: '/x/b.zip', fileName: 'b.zip', location: '..', worldDir: 'w' },
      },
    ],
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
      { folder: '/tmp/out', files: [{ name: '../pack.zip', data: bytes }] },
    ],
    response: [{ paths: ['/tmp/out/pack-data.zip'] }, { paths: [''] }],
  },
  [InvokeChannels.exportsRuntimeJar]: {
    request: [{ targetId: 'mc-26.3' }, { targetId: '' }],
    response: [null, '/tmp/msm_runtime.jar'],
  },
  [InvokeChannels.exportsGeckolibJar]: {
    request: [{ targetId: 'mc-26.3' }, { targetId: '' }],
    response: [bytes, '/tmp/geckolib.jar'],
  },
  [InvokeChannels.exportsWriteTree]: {
    request: [
      { folder: '/exports', files: [{ path: 'demo_mod/build.gradle.kts', data: bytes }] },
      { folder: '/exports', files: [{ path: 'demo_mod/../escape.txt', data: bytes }] },
    ],
    response: [
      { ok: false, reason: 'folder-not-empty', root: '/exports/demo_mod' },
      { ok: true, root: '/exports/demo_mod' },
    ],
  },
  [InvokeChannels.exportsGradleWrapper]: {
    request: [undefined, {}],
    response: [{ jar: bytes, gradlew: '#!/bin/sh', gradlewBat: '@echo off' }, { jar: bytes }],
  },
  [InvokeChannels.scriptingTranspile]: {
    request: [
      { source: 'let a = 1;', name: 'msm/demo/script/glow.ts' },
      { source: 'let a = 1;', name: '' },
    ],
    response: [
      {
        problems: [
          {
            severity: 'error',
            code: 'typescript.syntax',
            tsCode: 1005,
            message: "';' expected.",
            line: 0,
            start: 4,
            end: 5,
            offset: { start: 4, end: 5 },
          },
        ],
      },
      { js: 1 },
    ],
  },
  [InvokeChannels.scriptingCheck]: {
    request: [
      {
        source: 'msm.log.info("x");',
        name: 'msm/demo/script/glow.ts',
        typings: 'declare const msm: unknown;',
      },
      { source: 'msm.log.info("x");', name: 'msm/demo/script/glow.ts' },
    ],
    response: [[], [{ severity: 'info', code: 'typescript.semantic' }]],
  },
  [InvokeChannels.testInMinecraftStatus]: {
    request: [{ targetId: 'mc-26.3' }, { targetId: '' }],
    response: [testStatus, { ...testStatus, mode: 'maybe' }],
  },
  [InvokeChannels.testInMinecraftCreateInstance]: {
    request: [{ targetId: 'mc-26.3' }, {}],
    response: [{ ...testStatus, location: prismLocation, mode: 'launch' }, null],
  },
  [InvokeChannels.testInMinecraftRunModpack]: {
    request: [
      { targetId: 'mc-26.3', jars: [{ modId: 'ruby_mod', data: bytes }], mods: [sampleMod] },
      { targetId: 'mc-26.3', jars: [{ modId: '../evil', data: bytes }], mods: [] },
    ],
    response: [
      {
        modsDir: '/p/mods',
        installed: ['ruby_mod.jar', 'sodium.jar'],
        removed: [],
        fabricApi: 'present',
        fabricApiFile: 'fabric-api-0.165.2+26.3.jar',
        launched: false,
        note: null,
      },
      { modsDir: '/p/mods', installed: ['../x.jar'] },
    ],
  },
  [InvokeChannels.modpacksList]: {
    request: [undefined, { all: true }],
    response: [[{ root: '/m/pack', name: 'Pack', found: true }], [{ root: '' }]],
  },
  [InvokeChannels.modpacksCreate]: {
    request: [{ name: 'Pack', targetId: 'mc-26.3' }, { name: 'Pack' }],
    response: [sampleView, { root: '/m/pack' }],
  },
  [InvokeChannels.modpacksAddExisting]: {
    request: [undefined, { root: '/m' }],
    response: [null, { root: 3 }],
  },
  [InvokeChannels.modpacksForget]: {
    request: [{ root: '/m/pack' }, { root: '' }],
    response: [undefined, 'gone'],
  },
  [InvokeChannels.modpacksRead]: {
    request: [{ root: '/m/pack' }, {}],
    response: [sampleView, { ...sampleView, modpack: { ...sampleView.modpack, formatVersion: 2 } }],
  },
  [InvokeChannels.modpacksWrite]: {
    request: [
      { root: '/m/pack', modpack: sampleView.modpack },
      { root: '/m/pack', modpack: { ...sampleView.modpack, extra: true } },
    ],
    response: [sampleView, null],
  },
  [InvokeChannels.modpacksAddProject]: {
    request: [{ root: '/m/pack', projectRoot: null }, { root: '/m/pack' }],
    response: [null, { members: [] }],
  },
  [InvokeChannels.modpacksReadProject]: {
    request: [
      { root: '/m/pack', path: '../ruby' },
      { root: '/m/pack', path: '' },
    ],
    response: [[{ path: 'msm.project.json', data: bytes }], [{ path: 'x', data: 'text' }]],
  },
  [InvokeChannels.modpacksLookupMod]: {
    request: [
      { input: 'sodium', gameVersion: '26.3' },
      { input: '', gameVersion: '26.3' },
    ],
    response: [
      { file: sampleMod, versionNumber: '0.6.2', requiredProjects: ['P7dR8mSH'] },
      { file: { ...sampleMod, sha512: 'x' }, versionNumber: '0.6.2', requiredProjects: [] },
    ],
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
        removed: ['msm_old_mod.jar'],
        fabricApi: 'installed',
        fabricApiFile: 'fabric-api-0.165.2+26.3.jar',
        launched: true,
        note: null,
      },
      {
        jarPath: '/p/mods/ruby_mod.jar',
        replaced: false,
        removed: [],
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
  [InvokeChannels.updatesCurrent]: {
    request: [undefined, {}],
    response: [
      { state: 'downloaded', version: '0.7.0', notes: '### Added\n\n- Things' },
      { state: 'downloaded', version: '0.7.0', notes: 'x'.repeat(UPDATE_NOTES_MAX + 1) },
    ],
  },
  [InvokeChannels.appLaunchNotice]: {
    request: [undefined, { force: true }],
    response: ['welcome', 'yes'],
  },
  [InvokeChannels.pluginsList]: {
    request: [undefined, { folder: 'x' }],
    response: [
      [
        { id: 'sample.greetings', folder: 'greetings', manifest: pluginManifest, problems: [] },
        {
          id: 'broken',
          folder: 'broken',
          manifest: null,
          problems: [
            { severity: 'error', code: 'plugin.manifest-invalid', message: 'bad', path: '/id' },
          ],
        },
      ],
      [{ id: 'x', folder: 'x', manifest: { ...pluginManifest, main: '/abs.js' }, problems: [] }],
    ],
  },
  [InvokeChannels.pluginsRead]: {
    request: [{ id: 'sample.greetings' }, { id: 'msm.core' }],
    response: [
      { manifest: pluginManifest, main: 'defineMsmPlugin({});', schemas: ['{}'] },
      { manifest: pluginManifest, main: 3, schemas: [] },
    ],
  },
  [InvokeChannels.pluginsOpenFolder]: {
    request: [undefined, 'path'],
    response: [undefined, 'opened'],
  },
  [InvokeChannels.aiKeyStatus]: {
    request: [undefined, { reveal: true }],
    response: [
      { set: true, tail: 'abcd', encryptionAvailable: true },
      { set: true, tail: 'sk-ant-api03-whole-key', encryptionAvailable: true },
    ],
  },
  [InvokeChannels.aiSetKey]: {
    request: [{ key: 'sk-ant-test-1234' }, { key: '   ' }],
    response: [undefined, true],
  },
  [InvokeChannels.aiClearKey]: {
    request: [undefined, { key: 'x' }],
    response: [undefined, 'cleared'],
  },
  [InvokeChannels.aiTestKey]: {
    request: [undefined, { model: 'claude-haiku-5-5' }],
    response: [
      { ok: false, error: 'The API key was rejected', errorClass: 'AuthenticationError' },
      { ok: true },
    ],
  },
  [InvokeChannels.aiPicturesStatus]: {
    request: [undefined, { reveal: true }],
    response: [
      {
        service: 'retro-diffusion',
        keys: {
          'retro-diffusion': { set: true, tail: 'abcd' },
          openai: { set: false, tail: null },
        },
        encryptionAvailable: true,
      },
      // A whole key never fits: tails are four characters at most, and no `key` field exists.
      {
        service: 'openai',
        keys: {
          'retro-diffusion': { set: true, tail: 'rdpk-whole-key' },
          openai: { set: false, tail: null },
        },
        encryptionAvailable: true,
      },
    ],
  },
  [InvokeChannels.aiPicturesSetService]: {
    request: [{ service: 'openai' }, { service: 'midjourney' }],
    response: [undefined, 'set'],
  },
  [InvokeChannels.aiPicturesSetKey]: {
    request: [
      { service: 'openai', key: 'sk-test-1234' },
      { service: 'openai', key: '  ' },
    ],
    response: [undefined, true],
  },
  [InvokeChannels.aiPicturesClearKey]: {
    request: [{ service: 'retro-diffusion' }, {}],
    response: [undefined, 'cleared'],
  },
  [InvokeChannels.aiPicturesTestKey]: {
    request: [{ service: 'retro-diffusion' }, { service: 'retro-diffusion', key: 'x' }],
    response: [
      { ok: false, error: 'bad key', errorClass: 'bad_key' },
      { ok: true, key: 'rdpk-1234' },
    ],
  },
  [InvokeChannels.aiPicturesGenerate]: {
    request: [
      { requestId: 'r1', prompt: 'a ruby', style: 'item', size: 16, count: 4, transparent: true },
      { requestId: 'r1', prompt: 'a ruby', style: 'item', size: 16, count: 5, transparent: true },
    ],
    response: [
      { ok: true, images: [bytes, bytes] },
      { ok: true, images: ['iVBOR'] },
    ],
  },
  [InvokeChannels.aiPicturesCancel]: {
    request: [{ requestId: 'r1' }, { requestId: '' }],
    response: [undefined, 'cancelled'],
  },
  [InvokeChannels.aiPicturesCost]: {
    request: [
      {
        prompt: 'a ruby',
        style: 'painting',
        size: 32,
        width: 32,
        height: 16,
        count: 4,
        transparent: false,
        reference: { width: 2, height: 1, rgb: new Uint8Array(6) },
        strength: 0.5,
        seed: 7,
      },
      {
        prompt: 'a ruby',
        style: 'item',
        size: 16,
        count: 4,
        transparent: true,
        reference: { width: 2, height: 1, rgb: new Uint8Array(5) },
      },
    ],
    response: [
      { ok: true, usd: 0.24, balanceUsd: 9.76 },
      { ok: true, usd: '0.24', balanceUsd: null },
    ],
  },
  [InvokeChannels.aiStart]: {
    request: [aiStart, { ...aiStart, mode: 'agent' }],
    response: [undefined, 'started'],
  },
  [InvokeChannels.aiCancel]: {
    request: [{ runId: 'run-1' }, { runId: '' }],
    response: [undefined, false],
  },
  [InvokeChannels.aiToolResult]: {
    request: [
      { runId: 'run-1', requestId: 'run-1:1', content: '{"items":[]}', isError: false },
      { runId: 'run-1', requestId: 'run-1:1', content: '{}' },
    ],
    response: [undefined, 1],
  },
  [InvokeChannels.aiNewConversation]: {
    request: [{ conversationId: 'conv-2' }, { id: 'conv-2' }],
    response: [undefined, null],
  },
  [InvokeChannels.aiDropConversation]: {
    request: [{ conversationId: 'conv-2' }, { conversationId: 'x'.repeat(201) }],
    response: [undefined, {}],
  },
  [InvokeChannels.playStatus]: {
    request: [{ targetId: 'mc-26.3' }, { targetId: '' }],
    response: [playStatus, { ...playStatus, state: 'flying' }],
  },
  [InvokeChannels.playPlay]: {
    request: [playInput, { ...playInput, outputs: [{ path: '../x', contents: 1 }] }],
    response: [playResult, { ...playResult, fabricApi: 'maybe' }],
  },
  [InvokeChannels.playReload]: {
    request: [
      {
        targetId: 'mc-26.3',
        modId: 'ruby',
        outputs: playInput.outputs,
        names: { 'ruby:ruby_lamp': 'Ruby Lamp' },
      },
      { targetId: 'mc-26.3', modId: 'Ruby!', outputs: [] },
    ],
    response: [reloadResult, { ...reloadResult, action: 'jump' }],
  },
  [InvokeChannels.playRestart]: {
    request: [playInput, { ...playInput, namespaces: [] }],
    response: [
      { ok: false, code: 'game-not-closing', message: 'Close Minecraft, then press Play again.' },
      { ok: false, code: 'oops', message: 'x' },
    ],
  },
  [InvokeChannels.playNewWorld]: {
    request: [
      { targetId: 'mc-26.3', namespace: 'ruby' },
      { targetId: 'mc-26.3', namespace: 'Ruby/..' },
    ],
    response: [
      { ok: true, renamedTo: 'msm-test-ruby-old-1' },
      { ok: true, renamedTo: '../x' },
    ],
  },
  [InvokeChannels.tryItListWorlds]: {
    request: [undefined, { all: true }],
    response: [
      [tryItWorld, { ...tryItWorld, id: 'prism:My_Pack/w', icon: null }],
      [{ ...tryItWorld, folder: '..' }],
    ],
  },
  [InvokeChannels.tryItReadArea]: {
    request: [
      { worldId: 'prism:My_Pack/New World', centre: { x: -120, z: 64 } },
      { worldId: 'prism:My_Pack/..', centre: 'spawn' },
    ],
    response: [tryItArea, { ...tryItArea, blocks: new Uint16Array(10) }],
  },
  [InvokeChannels.worldBackupsList]: {
    request: [undefined, { all: true }],
    response: [
      {
        folder: '/home/a/.msm/backups',
        groups: [
          {
            location: 'official-default-0a1b2c3d',
            locationName: 'Official launcher',
            available: true,
            worldDir: 'New World',
            backups: [
              {
                fileName: '2026-11-21_10-00-00.zip',
                path: '/home/a/.msm/backups/official-default-0a1b2c3d/New World/2026-11-21_10-00-00.zip',
                size: 1024,
                createdAt: '2026-11-21T10:00:00.000Z',
              },
            ],
          },
        ],
      },
      { folder: '/home/a/.msm/backups', groups: [{ location: '..' }] },
    ],
  },
  [InvokeChannels.worldBackupsRestore]: {
    request: [
      { location: 'official-default-0a1b2c3d', worldDir: 'New World', fileName: 'a.zip' },
      { location: 'official-default-0a1b2c3d', worldDir: '../New World', fileName: 'a.zip' },
    ],
    response: [
      { dir: 'New World-restored-2026-11-21_10-00-00', path: '/home/a/.minecraft/saves/x' },
      { dir: 'a/b', path: '/x' },
    ],
  },
  [InvokeChannels.worldBackupsOpenFolder]: {
    request: [undefined, { path: '/etc' }],
    response: [undefined, 'done'],
  },
  [InvokeChannels.minecraftStructureTemplates]: {
    request: [
      { mcVersion: '1.0', ids: ['minecraft:made_up/hut', 'minecraft:made_up/houses/hut_2'] },
      { mcVersion: '1.0', ids: ['minecraft:../escape'] },
    ],
    response: [
      {
        version: '1.0',
        templates: { 'minecraft:made_up/hut': new Uint8Array([0x1f, 0x8b, 8]) },
        missing: ['minecraft:made_up/none'],
        refused: [],
      },
      { version: '1.0', templates: { 'minecraft:made_up/hut': 'bytes' }, missing: [], refused: [] },
    ],
  },
  [InvokeChannels.minecraftAssetObject]: {
    request: [
      { mcVersion: '1.0', key: 'minecraft/sounds/mob/made_up/hum1.ogg' },
      { mcVersion: '1.0', key: 'minecraft/sounds/../lang/de_de.json' },
    ],
    response: [
      { ok: true, bytes: new Uint8Array([1, 2, 3]) },
      { ok: false, reason: 'outside' },
    ],
  },
  [InvokeChannels.minecraftNames]: {
    request: [{ targetId: 'mc-26.3' }, { targetId: '../mc-26.3' }],
    response: [
      {
        version: '1.0',
        blocks: { 'minecraft:made_up_rock': 'Made-up Rock' },
        items: {},
        entityTypes: {},
        biomes: {},
        effects: {},
        enchantments: {},
        potions: {},
        subtitles: { 'entity.made_up.ambient': 'Made-up hums' },
      },
      { version: '1.0', blocks: { 'minecraft:made_up_rock': 'Made-up Rock' } },
    ],
  },
  [InvokeChannels.mapsListWorlds]: {
    request: [{ targetId: 'mc-26.3' }, { targetId: '' }],
    response: [
      [
        {
          id: 'msm-play',
          name: 'MCSuperMods Test (26.3)',
          managed: true,
          worlds: [{ dir: 'msm-game-ruby', name: 'MCSuperMods game (ruby)', lastModified: 'x' }],
        },
      ],
      [{ id: 'msm-play', name: 'x', managed: 'yes', worlds: [] }],
    ],
  },
  [InvokeChannels.mapsExport]: {
    request: [
      {
        targetId: 'mc-26.3',
        sourceId: 'msm-play',
        worldDir: 'msm-game-ruby',
        keepPlayerData: false,
        mapName: 'Ruby Sky',
        dataPack: { fileName: 'ruby-data.zip', data: bytes },
        resourcePack: bytes,
      },
      {
        targetId: 'mc-26.3',
        sourceId: 'msm-play',
        worldDir: 'msm-game-ruby',
        keepPlayerData: false,
        mapName: '../Ruby',
      },
    ],
    response: [
      {
        path: '/home/a/Ruby Sky.zip',
        kind: 'world-zip',
        entries: 12,
        leftOut: [{ path: 'players', reason: 'player-data' }],
      },
      { path: '/home/a/Ruby Sky.zip', kind: 'tar', entries: 12, leftOut: [] },
    ],
  },
  [InvokeChannels.mapsListStructureSaves]: {
    request: [{ targetId: 'mc-26.3' }, {}],
    response: [
      [{ world: 'msm-test-ruby', id: 'ruby:houses/hut', size: 10, lastModified: 'x' }],
      [{ world: 'msm-test-ruby', id: 'ruby:../hut', size: 10, lastModified: 'x' }],
    ],
  },
  [InvokeChannels.mapsReadStructureSave]: {
    request: [
      { targetId: 'mc-26.3', world: 'msm-test-ruby', id: 'ruby:hut' },
      { targetId: 'mc-26.3', world: '../x', id: 'ruby:hut' },
    ],
    response: [bytes, [1, 2]],
  },
  [InvokeChannels.guideIndex]: {
    request: [undefined, { page: 'x' }],
    response: [
      {
        pages: [{ page: 'made-up', title: 'Made-up' }],
        sections: [
          { page: 'made-up', level: 2, heading: 'A', anchor: 'a', sentence: 'A.' },
          {
            page: 'made-up',
            level: 3,
            heading: 'B 1.6',
            anchor: 'b-1-6',
            alias: 'b-16',
            sentence: '',
          },
        ],
      },
      { pages: [{ page: '../x', title: 'X' }], sections: [] },
    ],
  },
  [InvokeChannels.guidePage]: {
    request: [{ page: 'vehicles' }, { page: '../secret' }],
    response: [
      { page: 'vehicles', markdown: '# Vehicles\n' },
      { page: 'vehicles', markdown: '# Vehicles\n', path: '/etc' },
    ],
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

  it('carries Play my game (ADR 0116 D1): the game settings, the seed and Start over', () => {
    const play = ipcContract[InvokeChannels.playPlay].request;
    const game = { preset: 'ruby:sky_block', gameMode: 'adventure', difficulty: 'hard' };
    expect(play.safeParse({ ...playInput, game }).success).toBe(true);
    expect(play.safeParse({ ...playInput, game: { ...game, preset: 'sky' } }).success).toBe(false);
    expect(play.safeParse({ ...playInput, game: { ...game, preset: 'a:b/' } }).success).toBe(false);
    expect(play.safeParse({ ...playInput, game: { ...game, gameMode: 'hardcore' } }).success).toBe(
      false,
    );
    expect(play.safeParse({ ...playInput, game: { ...game, extra: 1 } }).success).toBe(false);
    const status = ipcContract[InvokeChannels.playStatus].response;
    const inGame = {
      ...playStatus,
      state: 'game-world',
      testWorld: 'msm-game-ruby',
      world: 'msm-game-ruby',
      seed: '-4172144997902289642',
      label: 'In my game',
    };
    expect(status.safeParse(inGame).success).toBe(true);
    expect(status.safeParse({ ...inGame, seed: '12a' }).success).toBe(false);
    const newWorld = ipcContract[InvokeChannels.playNewWorld].request;
    expect(
      newWorld.safeParse({ targetId: 'mc-26.3', namespace: 'ruby', kind: 'game' }).success,
    ).toBe(true);
    expect(
      newWorld.safeParse({ targetId: 'mc-26.3', namespace: 'ruby', kind: 'map' }).success,
    ).toBe(false);
  });

  it('carries map exports (ADR 0116 D2): packs or a .mrpack, never both', () => {
    const { request } = ipcContract[InvokeChannels.mapsExport];
    const base = {
      targetId: 'mc-26.3',
      sourceId: 'prism:My_Pack',
      worldDir: 'My World',
      keepPlayerData: true,
      mapName: 'Ruby Sky',
    };
    const mrpack = { index: '{"formatVersion":1}', jars: [{ fileName: 'ruby.jar', data: bytes }] };
    expect(request.safeParse(base).success).toBe(true);
    expect(request.safeParse({ ...base, mrpack }).success).toBe(true);
    expect(request.safeParse({ ...base, mrpack, resourcePack: bytes }).success).toBe(false);
    expect(
      request.safeParse({
        ...base,
        mrpack: { ...mrpack, jars: [{ fileName: '../x.jar', data: bytes }] },
      }).success,
    ).toBe(false);
    expect(request.safeParse({ ...base, mapName: 'Ruby Sky.' }).success).toBe(false);
    expect(
      request.safeParse({ ...base, dataPack: { fileName: 'a/b.zip', data: bytes } }).success,
    ).toBe(false);
  });

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

  it('carries world seeds as decimal strings or null (ADR 0119)', () => {
    const { response } = ipcContract[InvokeChannels.tryItListWorlds];
    const seed = (value: unknown) => response.safeParse([{ ...tryItWorld, seed: value }]).success;
    expect(seed('0')).toBe(true);
    expect(seed('9223372036854775807')).toBe(true);
    expect(seed(null)).toBe(true);
    expect(seed(42)).toBe(false);
    expect(seed('12a')).toBe(false);
    expect(seed('99999999999999999999')).toBe(false);
    const { seed: _seed, ...withoutSeed } = tryItWorld;
    expect(response.safeParse([withoutSeed]).success).toBe(false);
  });

  it('bounds the vanilla worldgen answer (ADR 0119 D4)', () => {
    const { response } = ipcContract[InvokeChannels.minecraftWorldgenFiles];
    expect(response.safeParse(null).success).toBe(true);
    const many = Object.fromEntries(
      Array.from({ length: WORLDGEN_FILES_MAX + 1 }, (_, i) => [`minecraft:n${i}`, {}]),
    );
    const answer = (files: unknown) =>
      response.safeParse({ version: '1.0', files, fileCount: 0, resolvedBiomeLists: null }).success;
    expect(answer({ 'worldgen/noise': {} })).toBe(true);
    expect(answer({ 'worldgen/noise': many })).toBe(false);
    expect(answer({ '': {} })).toBe(false);
  });

  it('bounds the asset store read: its keys, answers and size (ADR 0121 D3, B621)', () => {
    const { request, response } = ipcContract[InvokeChannels.minecraftAssetObject];
    const asks = (key: unknown) => request.safeParse({ mcVersion: '1.0', key }).success;
    for (const key of [
      'minecraft/sounds.json',
      'minecraft/sounds/mob/wolf/bark1.ogg',
      'minecraft/font/unifont_jp.zip',
    ]) {
      expect(asks(key), key).toBe(true);
    }
    for (const key of [
      '',
      '/minecraft/sounds.json',
      'minecraft/sounds/../x.ogg',
      'minecraft//x.ogg',
      'minecraft/sounds/./x.ogg',
      'realms/sounds.json',
      'minecraft\\sounds.json',
      'minecraft/Sounds.json',
      `minecraft/${'a'.repeat(600)}`,
    ]) {
      expect(asks(key), key).toBe(false);
    }
    expect(request.safeParse({ mcVersion: '..', key: 'minecraft/sounds.json' }).success).toBe(
      false,
    );
    expect(response.safeParse({ ok: true, bytes: new Uint8Array(4) }).success).toBe(true);
    expect(
      response.safeParse({ ok: true, bytes: new Uint8Array(ASSET_OBJECT_MAX_BYTES + 1) }).success,
    ).toBe(false);
    for (const reason of [
      'not_set_up',
      'no_index',
      'not_listed',
      'not_allowed',
      'too_large',
      'missing',
    ]) {
      expect(response.safeParse({ ok: false, reason }).success, reason).toBe(true);
    }
    expect(response.safeParse({ ok: false, reason: 'nope' }).success).toBe(false);
    expect(response.safeParse({ ok: true, bytes: 'x' }).success).toBe(false);
  });

  it('bounds the structure templates read: its ids, answer and sizes (ADR 0122, B636)', () => {
    const { request, response } = ipcContract[InvokeChannels.minecraftStructureTemplates];
    const asks = (ids: unknown) => request.safeParse({ mcVersion: '1.0', ids }).success;
    expect(
      asks(['minecraft:igloo/top', 'minecraft:village/plains/houses/plains_small_house_1']),
    ).toBe(true);
    for (const id of [
      '',
      'igloo/top',
      'other:igloo/top',
      'minecraft:',
      'minecraft:../x',
      'minecraft:a/../b',
      'minecraft:a/./b',
      'minecraft:a//b',
      'minecraft:/a',
      'minecraft:a/',
      'minecraft:A',
      'minecraft:a\\b',
      `minecraft:${'a'.repeat(257)}`,
    ]) {
      expect(asks([id]), id).toBe(false);
    }
    expect(asks([])).toBe(false);
    const many = Array.from(
      { length: STRUCTURE_TEMPLATE_IDS_MAX + 1 },
      (_, i) => `minecraft:t${i}`,
    );
    expect(asks(many)).toBe(false);
    expect(asks(many.slice(1))).toBe(true);
    expect(request.safeParse({ mcVersion: '..', ids: ['minecraft:a'] }).success).toBe(false);

    const answer = (templates: unknown, extra: object = {}) =>
      response.safeParse({ version: '1.0', templates, missing: [], refused: [], ...extra }).success;
    expect(response.safeParse(null).success).toBe(true);
    expect(answer({ 'minecraft:a': new Uint8Array(4) })).toBe(true);
    expect(answer({ 'minecraft:a': new Uint8Array(STRUCTURE_TEMPLATE_MAX_BYTES + 1) })).toBe(false);
    expect(answer({ '../a': new Uint8Array(4) })).toBe(false);
    const heavy = Object.fromEntries(
      Array.from({ length: 17 }, (_, i) => [
        `minecraft:t${i}`,
        new Uint8Array(STRUCTURE_TEMPLATES_MAX_TOTAL_BYTES / 16),
      ]),
    );
    expect(answer(heavy)).toBe(false);
    expect(answer({}, { missing: ['minecraft:../x'] })).toBe(false);
    expect(answer({}, { refused: ['minecraft:a'] })).toBe(true);
    expect(answer({}, { path: '/etc' })).toBe(false);
  });

  it('bounds the live views data answer and its folder keys (ADR 0120 D11)', () => {
    const { request, response } = ipcContract[InvokeChannels.minecraftDataFiles];
    const asks = (folders: unknown) => request.safeParse({ mcVersion: '1.0', folders }).success;
    expect(asks(['advancement', 'tags/item'])).toBe(true);
    for (const folder of ['', '/abs', 'a/../b', 'Upper', 'a//b', 'a/', 'a\\b']) {
      expect(asks([folder]), folder).toBe(false);
    }
    expect(asks([])).toBe(false);
    expect(response.safeParse(null).success).toBe(true);
    const many = Object.fromEntries(
      Array.from({ length: DATA_FILES_MAX + 1 }, (_, i) => [`minecraft:n${i}`, {}]),
    );
    const answer = (folders: unknown) =>
      response.safeParse({ version: '1.0', folders, fileCount: 0 }).success;
    expect(answer({ loot_table: {} })).toBe(true);
    expect(answer({ loot_table: many })).toBe(false);
    expect(answer({ '../x': {} })).toBe(false);
  });

  it('bounds the vanilla names answer (ADR 0124 D3, B656)', () => {
    const { response } = ipcContract[InvokeChannels.minecraftNames];
    const empty = {
      version: '1.0',
      blocks: {},
      items: {},
      entityTypes: {},
      biomes: {},
      effects: {},
      enchantments: {},
      potions: {},
      subtitles: {},
    };
    expect(response.safeParse(null).success).toBe(true);
    expect(response.safeParse(empty).success).toBe(true);
    const names = (blocks: unknown) => response.safeParse({ ...empty, blocks }).success;
    expect(names({ 'minecraft:a': 'x'.repeat(VANILLA_NAME_MAX) })).toBe(true);
    expect(names({ 'minecraft:a': 'x'.repeat(VANILLA_NAME_MAX + 1) })).toBe(false);
    expect(names({ 'minecraft:a': '' })).toBe(false);
    expect(names({ 'minecraft:a': 1 })).toBe(false);
    for (const id of ['stone', 'minecraft:a/b', 'minecraft:a.b', 'other:a', 'minecraft:A']) {
      expect(names({ [id]: 'A' }), id).toBe(false);
    }
    const many = Object.fromEntries(
      Array.from({ length: VANILLA_NAMES_MAX + 1 }, (_, i) => [`minecraft:n${i}`, 'N']),
    );
    expect(names(many)).toBe(false);
    expect(response.safeParse({ ...empty, subtitles: { '../x': 'A' } }).success).toBe(false);
  });

  it('bounds the guide index and pages (ADR 0124 D14, B656)', () => {
    const index = ipcContract[InvokeChannels.guideIndex].response;
    const section = { page: 'p', level: 2, heading: 'H', anchor: 'h', sentence: '' };
    const ok = (sections: unknown[]) => index.safeParse({ pages: [], sections }).success;
    expect(ok([section])).toBe(true);
    expect(ok([{ ...section, level: 5 }])).toBe(false);
    expect(ok([{ ...section, heading: '' }])).toBe(false);
    expect(ok([{ ...section, sentence: 'x'.repeat(301) }])).toBe(false);
    expect(ok(Array.from({ length: GUIDE_INDEX_SECTIONS_MAX + 1 }, () => section))).toBe(false);
    const page = ipcContract[InvokeChannels.guidePage];
    for (const name of ['README', 'live-world', 'a_b']) {
      expect(page.request.safeParse({ page: name }).success, name).toBe(true);
    }
    for (const name of ['', '.', '..', 'a/b', 'a\\b', '-x', 'a.md', 'x'.repeat(65)]) {
      expect(page.request.safeParse({ page: name }).success, name).toBe(false);
    }
    const big = 'x'.repeat(GUIDE_PAGE_MAX_CHARS + 1);
    expect(page.response.safeParse({ page: 'p', markdown: big }).success).toBe(false);
  });

  it('bounds Try it world ids, centres and areas', () => {
    const { request, response } = ipcContract[InvokeChannels.tryItReadArea];
    const ok = (worldId: string, centre: unknown = 'spawn') =>
      request.safeParse({ worldId, centre }).success;
    expect(ok('official:default/New World')).toBe(true);
    expect(ok('prism:My_Pack-2/w', { x: 30_000_000, z: -30_000_000 })).toBe(true);
    for (const worldId of ['/abs', 'a/b/c', 'a/.', 'a/..', 'a\\b/c', 'a/b\\c', 'a/']) {
      expect(ok(worldId)).toBe(false);
    }
    expect(ok('a/w', { x: 1.5, z: 0 })).toBe(false);
    expect(ok('a/w', { x: 30_000_001, z: 0 })).toBe(false);
    expect(ok('a/w', 'origin')).toBe(false);
    expect(response.safeParse({ ...tryItArea, palette: ['minecraft:stone'] }).success).toBe(false);
    expect(response.safeParse({ ...tryItArea, size: { x: 16, y: 32, z: 48 } }).success).toBe(false);
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
      { state: 'downloading', percent: 42, version: '1.2.3' },
      { state: 'downloaded', version: '1.2.3' },
      { state: 'available', version: '1.2.3', notes: '- New' },
      { state: 'downloaded', version: '1.2.3', notes: '- New' },
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
      { state: 'available', version: '1.2.3', notes: 7 },
      { state: 'downloaded', version: '1.2.3', notes: 'x'.repeat(UPDATE_NOTES_MAX + 1) },
      { state: 'downloading', percent: 1, version: 2 },
    ];
    for (const status of invalid) {
      expect(isUpdateStatus(status)).toBe(false);
      expect(updateStatusSchema.safeParse(status).success).toBe(false);
    }
  });

  it('bounds AI helper payloads', () => {
    const start = ipcContract[InvokeChannels.aiStart].request;
    const ok = (patch: object) => start.safeParse({ ...aiStart, ...patch }).success;
    expect(ok({ text: 'x'.repeat(AI_TEXT_MAX) })).toBe(true);
    expect(ok({ text: 'x'.repeat(AI_TEXT_MAX + 1) })).toBe(false);
    const block = 'b'.repeat(AI_CONTEXT_BLOCK_MAX);
    expect(ok({ contextBlocks: Array(8).fill(block) })).toBe(true);
    expect(ok({ contextBlocks: Array(9).fill('b') })).toBe(false);
    expect(ok({ contextBlocks: [`${block}b`] })).toBe(false);
    expect(ok({ limits: { maxToolTurns: 0, maxOutputTokens: 50_000, taskBudget: true } })).toBe(
      false,
    );
    expect(ok({ extra: true })).toBe(false);
    const { limits: _limits, ...withoutLimits } = aiStart;
    expect(start.safeParse(withoutLimits).success).toBe(true);

    const key = ipcContract[InvokeChannels.aiSetKey].request;
    expect(key.safeParse({ key: 'k'.repeat(AI_KEY_MAX) }).success).toBe(true);
    expect(key.safeParse({ key: 'k'.repeat(AI_KEY_MAX + 1) }).success).toBe(false);

    const result = ipcContract[InvokeChannels.aiToolResult].request;
    const answer = { runId: 'r', requestId: 'r:1', isError: false };
    expect(result.safeParse({ ...answer, content: 'c'.repeat(AI_TOOL_RESULT_MAX) }).success).toBe(
      true,
    );
    expect(
      result.safeParse({ ...answer, content: 'c'.repeat(AI_TOOL_RESULT_MAX + 1) }).success,
    ).toBe(false);
  });

  it('takes AI helper settings in settings patches and views', () => {
    const set = ipcContract[InvokeChannels.settingsSet].request;
    expect(set.safeParse({ ai: DEFAULT_AI_SETTINGS }).success).toBe(true);
    expect(set.safeParse({ ai: { ...DEFAULT_AI_SETTINGS, model: 'gpt' } }).success).toBe(false);
    expect(set.safeParse({ ai: { ...DEFAULT_AI_SETTINGS, apiKey: 'sk' } }).success).toBe(false);
    const view = ipcContract[InvokeChannels.settingsGet].response;
    const base = { minecraftDir: null, updates: { autoCheck: true }, detectedMinecraftDir: null };
    expect(view.safeParse({ ...base, ai: DEFAULT_AI_SETTINGS }).success).toBe(true);
  });

  it('checks AI event payloads without zod', () => {
    expect(isAiEventPayload({ runId: 'r', event: { type: 'text_delta', text: 'Hi' } })).toBe(true);
    expect(isAiEventPayload({ runId: 'r', event: { type: 'done', reason: 'end_turn' } })).toBe(
      true,
    );
    expect(isAiEventPayload({ runId: '', event: { type: 'done' } })).toBe(false);
    expect(isAiEventPayload({ runId: 'r', event: { type: 'shell' } })).toBe(false);
    expect(isAiEventPayload({ runId: 'r' })).toBe(false);
    expect(isAiEventPayload(null)).toBe(false);
  });

  it('recognises menu commands', () => {
    expect(isMenuCommand('toggleAiHelper')).toBe(true);
    expect(isMenuCommand('creator')).toBe(true);
    expect(isMenuCommand('checkForUpdates')).toBe(true);
    expect(isMenuCommand('save')).toBe(true);
    expect(isMenuCommand('newProjectFromStarter')).toBe(true);
    expect(isMenuCommand('examples')).toBe(true);
    expect(isMenuCommand('whatsNew')).toBe(true);
    expect(isMenuCommand('format-disk')).toBe(false);
    expect(isMenuCommand(1)).toBe(false);
    expect(isMenuCommand('clearRecentProjects')).toBe(true);
    for (const command of [
      'importStructure',
      'exportStructures',
      'exportSchematics',
      'exportJavaProject',
    ]) {
      expect(isMenuCommand(command)).toBe(true);
    }
  });

  it('accepts only checked export tree paths', () => {
    expect(isExportTreePath('demo_mod/src/main/java/demo_mod/DemoMod.java')).toBe(true);
    expect(isExportTreePath('demo_mod/gradlew')).toBe(true);
    expect(isExportTreePath('gradlew')).toBe(false);
    expect(isExportTreePath('/demo_mod/gradlew')).toBe(false);
    expect(isExportTreePath('demo_mod/./gradlew')).toBe(false);
    expect(isExportTreePath('demo_mod/../gradlew')).toBe(false);
    expect(isExportTreePath('demo_mod\\gradlew')).toBe(false);
    expect(isExportTreePath('demo mod/gradlew')).toBe(false);
    expect(isExportTreePath(Array.from({ length: 17 }, () => 'a').join('/'))).toBe(false);
    expect(isExportTreePath(Array.from({ length: 16 }, () => 'a').join('/'))).toBe(true);
  });

  it('bounds script sources, names and typings', () => {
    const { request } = ipcContract[InvokeChannels.scriptingCheck];
    const ok = { source: '', name: 'msm/demo/script/a.ts', typings: '' };
    expect(request.safeParse(ok).success).toBe(true);
    expect(
      request.safeParse({ ...ok, source: 'x'.repeat(SCRIPT_MAX_SOURCE_LENGTH + 1) }).success,
    ).toBe(false);
    expect(
      request.safeParse({ ...ok, typings: 'x'.repeat(SCRIPT_MAX_TYPINGS_LENGTH + 1) }).success,
    ).toBe(false);
    expect(request.safeParse({ ...ok, name: 'msm/demo/script/a b.ts' }).success).toBe(false);
  });

  it('bounds export trees', () => {
    const { request } = ipcContract[InvokeChannels.exportsWriteTree];
    const files = Array.from({ length: EXPORT_TREE_MAX_FILES + 1 }, (_, index) => ({
      path: `demo_mod/f${index}.txt`,
      data: bytes,
    }));
    expect(request.safeParse({ folder: '/exports', files: files.slice(1) }).success).toBe(true);
    expect(request.safeParse({ folder: '/exports', files }).success).toBe(false);
    expect(request.safeParse({ folder: '/exports', files: [] }).success).toBe(false);
  });

  it('accepts pack zips and safe relative paths as export file names', () => {
    for (const name of [
      'demo-data.zip',
      'demo/hut.nbt',
      'demo/a/b.c_d-1.schem',
      'greetings.txt',
      'Demo/report.json',
    ]) {
      expect(isExportFileName(name)).toBe(true);
    }
    for (const name of [
      '../demo/hut.nbt',
      'demo/../hut.nbt',
      'demo/./hut.nbt',
      'demo/.hidden',
      '/demo/hut.nbt',
      'demo//hut.nbt',
      'demo\\hut.nbt',
      'demo/hut nbt',
      `${'a/'.repeat(16)}b.txt`,
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
