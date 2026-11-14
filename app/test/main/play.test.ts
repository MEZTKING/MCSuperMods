import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, normalize, sep } from 'node:path';
import {
  type Downloader,
  type InstallFileSystem,
  parseDevRequest,
  parseInstalledDevRecord,
  parsePlayRequest,
} from '@msm/interop';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CLOSE_MINECRAFT_MESSAGE,
  createPlayService,
  type PlayService,
  restartReasonText,
  type TargetDevFacts,
} from '../../src/main/platform/play';
import { createSettingsStore, type SettingsStore } from '../../src/main/platform/settings';
import { isPlayStatusPayload } from '../../src/shared/ipc-channels';
import { InvokeChannels, ipcContract, playStatusSchema } from '../../src/shared/ipc-contract';
import type { PlayInput, PlayOutputFile } from '../../src/shared/platform';
import { type FakeMmcRoot, makeMmcRoot } from '../helpers/fake-launchers';

/** Made-up versions; tests never name a real Minecraft version. */
const VERSION = '9.9-msm-test';
const FACTS = { mcVersion: VERSION, loader: '0.20.1', api: '0.1.0+9.9' };
const INSTANCE = `MCSuperMods Test (${VERSION})`;
const DEV_FACTS: TargetDevFacts = {
  dev: {
    gameRules: {
      advanceTime: 'advance_time',
      advanceWeather: 'advance_weather',
      spawnMobs: 'spawn_mobs',
      keepInventory: 'keep_inventory',
    },
    worldDataFolders: ['enchantment', 'worldgen/biome'],
  },
  packFormats: { resource: { major: 97, minor: 1 }, data: { major: 121, minor: 0 } },
};
const API_JAR = new TextEncoder().encode('fake fabric api');
const WORLD = 'msm-test-ruby';
const playSchema = ipcContract[InvokeChannels.playPlay].response;
const reloadSchema = ipcContract[InvokeChannels.playReload].response;

function jar(modJson = '{"id":"ruby"}', runtime = '1.8.0'): Uint8Array {
  return zipSync({
    'fabric.mod.json': strToU8(modJson),
    [`META-INF/jars/msm_runtime-${runtime}.jar`]: new Uint8Array([1, 2, 3]),
    'msm/ruby/block/ruby_block.json': strToU8('{}'),
  });
}

function baseOutputs(): PlayOutputFile[] {
  return [
    { path: 'data/ruby/recipe/ruby.json', contents: { type: 'shaped' }, elementId: 'ruby:ruby' },
    {
      path: 'data/ruby/worldgen/biome/ruby_land.json',
      contents: { temperature: 0.5 },
      elementId: 'ruby:ruby_land',
    },
    {
      path: 'msm/ruby/block/ruby_block.json',
      contents: {
        events: { on_use: [{ action: 'play_sound', sound: 'ruby:chime' }] },
        hardness: 1,
      },
      elementId: 'ruby:ruby_block',
    },
    {
      path: 'msm/ruby/potion/ruby_potion.json',
      contents: { effects: [{ id: 'minecraft:speed' }] },
      elementId: 'ruby:ruby_potion',
    },
    {
      path: 'msm/ruby/script/main.ts',
      contents: new TextEncoder().encode('export const a: number = 1;\n'),
      elementId: 'ruby:main',
    },
    { path: 'assets/ruby/textures/item/ruby.png', contents: new Uint8Array([137, 80, 78, 71]) },
    { path: 'assets/ruby/sounds.json', contents: { chime: { sounds: ['ruby:chime'] } } },
  ];
}

function replace(outputs: PlayOutputFile[], path: string, contents: PlayOutputFile['contents']) {
  return outputs.map((file) => (file.path === path ? { ...file, contents } : file));
}

let temp: string;
let prism: FakeMmcRoot;
let cacheDir: string;
let settings: SettingsStore;
let service: PlayService;
let clock: number;
let spawned: { program: string; args: readonly string[] }[];
let writes: string[];
let removes: string[];
let mkdirs: string[];
let renames: [string, string][];
let lockedJar: boolean;
let onSleep: (() => Promise<void>) | null;
let intervals: (() => void)[];

const download: Downloader = async (url) => {
  if (url.endsWith('.sha512')) {
    return new TextEncoder().encode(createHash('sha512').update(API_JAR).digest('hex'));
  }
  return API_JAR;
};

/** The node file system, recording every change; the content jar can be "locked". */
function recordingFs(): InstallFileSystem {
  const inner = createNodeInstallFileSystem();
  return {
    ...inner,
    async writeFile(path, data) {
      if (lockedJar && normalize(path).endsWith(join('mods', 'ruby.jar'))) {
        throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
      }
      writes.push(normalize(path));
      return inner.writeFile(path, data);
    },
    async remove(path) {
      if (await inner.exists(path)) removes.push(normalize(path));
      return inner.remove(path);
    },
    async mkdirp(path) {
      mkdirs.push(normalize(path));
      return inner.mkdirp(path);
    },
  };
}

function gameDir(): string {
  return join(prism.instanceDir(INSTANCE), 'minecraft');
}

function devFile(name: string): string {
  return join(gameDir(), 'msm-dev', name);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

/** Plays the runtime's part: writes `status.json`. */
async function writeStatus(
  state: 'title' | 'loading' | 'world',
  world: string | null,
  handled: { seq: number; ok: boolean } | null = null,
  time = clock,
): Promise<void> {
  await mkdir(join(gameDir(), 'msm-dev'), { recursive: true });
  await writeFile(
    devFile('status.json'),
    `${JSON.stringify({ format: 1, handled, runtime: '1.8.0', state, time, world })}\n`,
  );
}

function input(overrides: Partial<PlayInput> = {}): PlayInput {
  return {
    targetId: 't',
    modId: 'ruby',
    jar: jar(),
    outputs: baseOutputs(),
    namespaces: ['ruby'],
    items: [{ id: 'ruby:ruby', count: 16 }, { id: 'ruby:ruby_block' }],
    ...overrides,
  };
}

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-main-play-'));
  clock = 1_000_000;
  spawned = [];
  writes = [];
  removes = [];
  mkdirs = [];
  renames = [];
  lockedJar = false;
  onSleep = null;
  intervals = [];
  prism = await makeMmcRoot(join(temp, 'prism'), { instances: [] });
  await writeFile(join(prism.root, 'prismlauncher'), '#!/bin/sh\n');
  const env = { platform: 'linux', home: join(temp, 'home') };
  settings = createSettingsStore({ msmHome: join(temp, 'msm-home'), installEnv: env });
  await settings.set({
    launchers: { prismDataDirs: [prism.root], multimcRoots: [], curseForgeRoots: [] },
  });
  cacheDir = join(temp, 'user-data', 'downloads');
  service = createPlayService({
    fs: recordingFs(),
    env,
    settings,
    cacheDir,
    appVersion: async () => '1.4.0-test',
    transpile: async (source) =>
      source.includes('BROKEN')
        ? {
            problems: [
              {
                severity: 'error',
                code: 'typescript.syntax',
                tsCode: 1005,
                message: 'Unexpected token.',
                line: 1,
                start: 0,
                end: 6,
                offset: { start: 0, end: 6 },
              },
            ],
          }
        : { js: `"use strict";\n// ${source.trim()}\n` },
    download,
    facts: () => FACTS,
    devFacts: () => DEV_FACTS,
    spawnLauncher: async (program, args) => {
      spawned.push({ program, args });
    },
    rename: async (from, to) => {
      renames.push([normalize(from), normalize(to)]);
      const { rename } = await import('node:fs/promises');
      await rename(from, to);
    },
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
      if (onSleep !== null) await onSleep();
    },
    setInterval: (fn) => {
      intervals.push(fn);
      return intervals.length;
    },
    clearInterval: () => {
      intervals = [];
    },
  });
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

/** Plays once and puts the game in the test world. */
async function playIntoWorld(): Promise<void> {
  const result = await service.play(input());
  expect(result.ok ? 'ok' : result.message).toBe('ok');
  clock += 20_000;
  await writeStatus('world', WORLD, { seq: 1, ok: true });
}

describe('Play service', () => {
  it('says when Prism Launcher is missing, and that the instance is made on the first Play', async () => {
    expect(await service.status('t')).toMatchObject({
      instance: 'missing',
      state: 'not-running',
      label: 'Game not running',
      canReload: false,
      instanceName: INSTANCE,
    });
    await settings.set({ launchers: { prismDataDirs: [], multimcRoots: [], curseForgeRoots: [] } });
    const status = await service.status('t');
    expect(playStatusSchema.parse(status)).toEqual(status);
    expect(status).toMatchObject({ instance: 'no-prism', state: 'no-prism' });
    const result = await service.play(input());
    expect(result).toMatchObject({ ok: false, code: 'no-prism' });
    expect(writes).toEqual([]);
  });

  it('creates the instance on the first Play and writes every file', async () => {
    const before = await settings.get();
    const result = await service.play(input());
    expect(playSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({
      ok: true,
      instanceName: INSTANCE,
      instanceCreated: true,
      gameDir: gameDir(),
      world: WORLD,
      restarted: false,
      launched: true,
      note: null,
      fabricApi: 'installed',
      itemsLeftOut: 0,
    });
    expect(spawned).toEqual([
      {
        program: join(prism.root, 'prismlauncher'),
        args: ['--dir', prism.root, '--launch', INSTANCE],
      },
    ]);
    // Play never changes the user's install target.
    expect((await settings.get()).installTarget).toEqual(before.installTarget);

    const mods = join(gameDir(), 'mods');
    expect((await readdir(mods)).sort()).toEqual([
      '.msm-installed.json',
      'fabric-api-0.1.0+9.9.jar',
      'ruby.jar',
    ]);
    expect((await readdir(join(gameDir(), 'msm-dev'))).sort()).toEqual([
      'dev.json',
      'installed.json',
      'play.json',
      'setup.mcfunction',
    ]);
    expect(await readJson(devFile('dev.json'))).toEqual({
      appVersion: '1.4.0-test',
      format: 1,
      namespaces: ['ruby'],
      target: 't',
      world: WORLD,
    });
    expect(parsePlayRequest(await readFile(devFile('play.json'), 'utf8'))).toEqual({
      format: 1,
      seq: 1,
      world: WORLD,
    });
    const installed = parseInstalledDevRecord(await readFile(devFile('installed.json'), 'utf8'));
    expect(installed?.jar).toMatchObject({ modId: 'ruby', runtime: '1.8.0', fabricApi: FACTS.api });
    expect(installed?.overlay).toEqual({});
    expect(Object.keys(installed?.files ?? {}).sort()).toEqual(
      baseOutputs()
        .map((file) => file.path)
        .sort(),
    );
    expect(installed?.files['msm/ruby/block/ruby_block.json']?.element).toBe('ruby:ruby_block');
    const setup = await readFile(devFile('setup.mcfunction'), 'utf8');
    expect(setup).toContain('# msm:setup');
    expect(setup).toContain('# msm:refill');
    expect(setup).toContain('ruby:ruby_block');
    expect(await readFile(join(gameDir(), 'options.txt'), 'utf8')).toBe(
      'resourcePacks:["vanilla","fabric","file/msm-dev"]\nonboardAccessibility:false\n',
    );
    expect(await readJson(join(gameDir(), 'resourcepacks', 'msm-dev', 'pack.mcmeta'))).toEqual({
      pack: {
        description: 'MCSuperMods test changes',
        max_format: [97, 1],
        min_format: [97, 1],
        pack_format: 97,
      },
    });

    // The game has not answered yet: "Starting…".
    expect(await service.status('t')).toMatchObject({ state: 'starting', label: 'Starting…' });
    clock += 200_000;
    expect((await service.status('t')).state).toBe('not-running');
  });

  it('writes nothing outside the managed instance and the download cache', async () => {
    await playIntoWorld();
    const changed = replace(baseOutputs(), 'data/ruby/recipe/ruby.json', { type: 'shapeless' });
    expect((await service.reload({ targetId: 't', modId: 'ruby', outputs: changed })).ok).toBe(
      true,
    );
    clock += 60_000;
    // A second Play clears the overlays and the world's dev data pack.
    expect((await service.play(input())).ok).toBe(true);
    expect(removes).toContain(join(gameDir(), 'saves', WORLD, 'datapacks', 'msm-dev'));
    // The reload wrote into the world's folder, so New test world renames it.
    expect(await service.newTestWorld('t', 'ruby')).toEqual({
      ok: true,
      renamedTo: `${WORLD}-old-1`,
    });
    expect(renames).toHaveLength(1);

    const instanceDir = prism.instanceDir(INSTANCE);
    const instanceFiles = ['instance.cfg', 'mmc-pack.json', '.msm-managed.json'].map((name) =>
      join(instanceDir, name),
    );
    const inside = (root: string, path: string) => path.startsWith(`${root}${sep}`);
    const allowed = (path: string) =>
      inside(gameDir(), path) || inside(cacheDir, path) || instanceFiles.includes(path);
    expect(writes.length).toBeGreaterThan(10);
    expect(writes.filter((path) => !allowed(path))).toEqual([]);
    expect(removes.filter((path) => !inside(gameDir(), path))).toEqual([]);
    expect(renames.flat().filter((path) => !inside(gameDir(), path))).toEqual([]);
    // Folders made outside the game folder: only the instances folder and the instance itself.
    const folders = [gameDir(), instanceDir, normalize(prism.instancesDir)];
    expect(mkdirs.filter((path) => !allowed(path) && !folders.includes(path))).toEqual([]);
  });

  it('asks a running game to quit, waits, installs and starts it again', async () => {
    await playIntoWorld();
    spawned = [];
    let quitSeq = 0;
    onSleep = async () => {
      const request = parseDevRequest(
        await readFile(devFile('request.json'), 'utf8').catch(() => null),
      );
      if (request?.action === 'quit' && quitSeq === 0) {
        quitSeq = request.seq;
        // The runtime saves, says it handled the quit, then stops writing.
        await writeStatus('loading', null, { seq: request.seq, ok: true });
      }
    };
    const started = clock;
    const result = await service.restart(input({ jar: jar('{"id":"ruby","version":"2"}') }));
    expect(result).toMatchObject({
      ok: true,
      restarted: true,
      launched: true,
      instanceCreated: false,
    });
    expect(quitSeq).toBe(2);
    expect(clock - started).toBeGreaterThanOrEqual(5_000);
    expect(clock - started).toBeLessThan(30_000);
    expect(parsePlayRequest(await readFile(devFile('play.json'), 'utf8'))?.seq).toBe(3);
    expect(spawned).toHaveLength(1);
  });

  it('gives up after 30 seconds when the jar stays locked, with the plain message', async () => {
    await playIntoWorld();
    spawned = [];
    lockedJar = true;
    onSleep = async () => {
      // The game keeps running and never answers.
      await writeStatus('world', WORLD, { seq: 1, ok: true });
    };
    const started = clock;
    const result = await service.play(input());
    expect(result).toEqual({
      ok: false,
      code: 'game-not-closing',
      message: CLOSE_MINECRAFT_MESSAGE,
    });
    expect(clock - started).toBeGreaterThanOrEqual(30_000);
    expect(parseDevRequest(await readFile(devFile('request.json'), 'utf8'))?.action).toBe('quit');
    expect(spawned).toEqual([]);

    // A game MSM cannot talk to (no status) holding the jar: the same words, at once.
    clock += 60_000;
    const locked = await service.play(input());
    expect(locked).toEqual({ ok: false, code: 'jar-locked', message: CLOSE_MINECRAFT_MESSAGE });
  });

  it('writes the overlays and a request on Reload', async () => {
    await playIntoWorld();
    let outputs = baseOutputs();
    outputs = replace(outputs, 'data/ruby/recipe/ruby.json', { type: 'shapeless' });
    outputs = replace(
      outputs,
      'msm/ruby/script/main.ts',
      new TextEncoder().encode('export const a: number = 2;\n'),
    );
    outputs = replace(outputs, 'msm/ruby/block/ruby_block.json', {
      events: { on_use: [{ action: 'give_item', item: 'ruby:ruby' }] },
      hardness: 1,
    });
    outputs = replace(outputs, 'assets/ruby/textures/item/ruby.png', new Uint8Array([1, 2]));

    const result = await service.reload({ targetId: 't', modId: 'ruby', outputs });
    expect(reloadSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({
      ok: true,
      action: 'reload',
      changes: 4,
      assets: true,
      counts: { data: 1, scripts: 1, events: 1, assets: 1, worldData: 0, removed: 0 },
      restart: [],
      message: 'Reloading 4 changes in Minecraft.',
    });
    const pack = join(gameDir(), 'saves', WORLD, 'datapacks', 'msm-dev');
    expect(await readJson(join(pack, 'data', 'ruby', 'recipe', 'ruby.json'))).toEqual({
      type: 'shapeless',
    });
    expect(await readJson(join(pack, 'pack.mcmeta'))).toMatchObject({ pack: { pack_format: 121 } });
    const overlay = join(gameDir(), 'msm-dev', 'overlay', 'msm', 'ruby');
    expect(await readFile(join(overlay, 'script', 'main.js'), 'utf8')).toBe(
      '"use strict";\n// export const a: number = 2;\n',
    );
    expect(await readJson(join(overlay, 'block', 'ruby_block.json'))).toMatchObject({
      events: { on_use: [{ action: 'give_item' }] },
    });
    expect(
      await readFile(
        join(
          gameDir(),
          'resourcepacks',
          'msm-dev',
          'assets',
          'ruby',
          'textures',
          'item',
          'ruby.png',
        ),
      ),
    ).toEqual(Buffer.from([1, 2]));
    const request = parseDevRequest(await readFile(devFile('request.json'), 'utf8'));
    expect(request).toEqual({ format: 1, seq: 2, action: 'reload', assets: true, changes: 4 });
    expect(result.ok && result.seq).toBe(2);
    const installed = parseInstalledDevRecord(await readFile(devFile('installed.json'), 'utf8'));
    expect(Object.keys(installed?.overlay ?? {}).sort()).toEqual([
      'assets/ruby/textures/item/ruby.png',
      'data/ruby/recipe/ruby.json',
      'msm/ruby/block/ruby_block.json',
      'msm/ruby/script/main.ts',
    ]);

    // Nothing pending: no request.
    await writeStatus('world', WORLD, { seq: 2, ok: true });
    const again = await service.reload({ targetId: 't', modId: 'ruby', outputs });
    expect(again).toMatchObject({ ok: true, action: 'none', seq: null, changes: 0 });
    expect(parseDevRequest(await readFile(devFile('request.json'), 'utf8'))?.seq).toBe(2);

    // Going back to what the jar holds removes the overlay files.
    const back = await service.reload({ targetId: 't', modId: 'ruby', outputs: baseOutputs() });
    expect(back).toMatchObject({ ok: true, action: 'reload', counts: { removed: 4 } });
    expect(await readdir(join(overlay, 'script'))).toEqual([]);
  });

  it('reopens the world for world data', async () => {
    await playIntoWorld();
    const outputs = replace(baseOutputs(), 'data/ruby/worldgen/biome/ruby_land.json', {
      temperature: 0.9,
    });
    const result = await service.reload({ targetId: 't', modId: 'ruby', outputs });
    expect(result).toMatchObject({ ok: true, action: 'reopen', assets: false, changes: 1 });
    expect(result.ok && result.message).toMatch(/new chunks/);
    expect(parseDevRequest(await readFile(devFile('request.json'), 'utf8'))?.action).toBe('reopen');
  });

  it('carries restart reasons in plain words and never writes overlays for potions', async () => {
    await playIntoWorld();
    let outputs = [
      ...baseOutputs(),
      {
        path: 'msm/ruby/block/ruby_lamp.json',
        contents: { light: 15 },
        elementId: 'ruby:ruby_lamp',
      },
    ];
    outputs = replace(outputs, 'msm/ruby/potion/ruby_potion.json', {
      effects: [{ id: 'minecraft:haste' }],
    });
    outputs = replace(outputs, 'msm/ruby/block/ruby_block.json', {
      events: { on_use: [] },
      hardness: 3,
    });
    outputs = replace(outputs, 'data/ruby/recipe/ruby.json', { type: 'shapeless' });
    const result = await service.reload({
      targetId: 't',
      modId: 'ruby',
      outputs,
      jar: jar('{"id":"ruby","description":"new"}'),
      names: { 'ruby:ruby_lamp': 'Ruby Lamp', 'ruby:ruby_block': 'Ruby Block' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.restart.map((reason) => [reason.reason, reason.path, reason.text])).toEqual([
      [
        'mod-file',
        'fabric.mod.json',
        "Your mod's details changed. They are only read when Minecraft starts.",
      ],
      [
        'definition-changed',
        'msm/ruby/block/ruby_block.json',
        'You changed more than what Ruby Block does when something happens. Changes like that are only read when Minecraft starts.',
      ],
      [
        'new-definition',
        'msm/ruby/block/ruby_lamp.json',
        'You added a new block: Ruby Lamp. New blocks are only read when Minecraft starts.',
      ],
      [
        'definition-changed',
        'msm/ruby/potion/ruby_potion.json',
        'You changed the potion ruby:ruby_potion. Changes to potions are only read when Minecraft starts.',
      ],
    ]);
    // The in-place part still reloads.
    expect(result).toMatchObject({ action: 'reload', changes: 1 });
    await expect(
      readdir(join(gameDir(), 'msm-dev', 'overlay', 'msm', 'ruby', 'potion')),
    ).rejects.toThrow();
    expect(await service.status('t')).toMatchObject({
      state: 'test-world',
      label: 'Restart needed',
      canReload: true,
    });
    expect((await service.status('t')).restartNeeded).toHaveLength(4);
  });

  it('words every restart reason', () => {
    const reasons = [
      'new-definition',
      'definition-changed',
      'definition-renamed',
      'file-removed',
      'sound-events',
      'mod-file',
      'mod-id',
      'runtime-version',
      'fabric-api-version',
    ] as const;
    for (const reason of reasons) {
      const text = restartReasonText(
        { reason, path: 'msm/ruby/entity/ghost.json', kind: 'entity' },
        'Ghost',
      );
      expect(text).toMatch(/Minecraft starts|starts again/);
    }
    expect(
      restartReasonText({ reason: 'new-definition', path: 'x', kind: 'entity' }, 'Ghost'),
    ).toBe('You added a new mob: Ghost. New mobs are only read when Minecraft starts.');
  });

  it('refuses Reload outside the test world and stops on script errors', async () => {
    expect(
      await service.reload({ targetId: 't', modId: 'ruby', outputs: baseOutputs() }),
    ).toMatchObject({
      ok: false,
      code: 'not-played',
    });
    await service.play(input());
    clock += 20_000;
    await writeStatus('title', null);
    expect(
      await service.reload({ targetId: 't', modId: 'ruby', outputs: baseOutputs() }),
    ).toMatchObject({
      ok: false,
      code: 'not-in-world',
      message: 'Reload works while Minecraft is in the test world. Press Play first.',
    });
    await writeStatus('world', 'my-survival-world');
    expect((await service.status('t')).state).toBe('other-world');

    await writeStatus('world', WORLD);
    const before = writes.length;
    const broken = replace(
      baseOutputs(),
      'msm/ruby/script/main.ts',
      new TextEncoder().encode('BROKEN'),
    );
    const result = await service.reload({
      targetId: 't',
      modId: 'ruby',
      outputs: replace(broken, 'data/ruby/recipe/ruby.json', { type: 'shapeless' }),
    });
    expect(result).toMatchObject({ ok: false, code: 'script-error' });
    expect(result.ok === false && result.message).toMatch(/Unexpected token/);
    expect(writes.length).toBe(before);
  });

  it('renames the test world for New test world, never while the game runs', async () => {
    expect(await service.newTestWorld('t', 'ruby')).toEqual({ ok: true, renamedTo: null });
    await service.play(input());
    await mkdir(join(gameDir(), 'saves', WORLD), { recursive: true });
    await mkdir(join(gameDir(), 'saves', `${WORLD}-old-1`), { recursive: true });
    await writeStatus('title', null);
    expect(await service.newTestWorld('t', 'ruby')).toMatchObject({
      ok: false,
      code: 'game-running',
    });
    clock += 60_000;
    expect(await service.newTestWorld('t', 'ruby')).toEqual({
      ok: true,
      renamedTo: `${WORLD}-old-2`,
    });
    expect((await readdir(join(gameDir(), 'saves'))).sort()).toEqual([
      `${WORLD}-old-1`,
      `${WORLD}-old-2`,
    ]);
  });

  it('pushes status changes while polling', async () => {
    const seen: string[] = [];
    const off = service.onStatus((status) => {
      // The preload's shape check accepts what main pushes.
      expect(isPlayStatusPayload(status)).toBe(true);
      seen.push(status.label);
    });
    await service.status('t');
    service.setPolling(true);
    expect(intervals).toHaveLength(1);
    await service.play(input());
    await new Promise((resolve) => setTimeout(resolve, 20));
    clock += 20_000;
    await writeStatus('world', WORLD);
    intervals[0]?.();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen).toContain('Starting…');
    expect(seen.at(-1)).toBe('In the test world');
    service.setPolling(false);
    expect(intervals).toHaveLength(0);
    off();
  });
});
