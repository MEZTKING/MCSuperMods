import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, normalize, relative, sep } from 'node:path';
import {
  type Downloader,
  type InstallFileSystem,
  type RecipeTargetFacts,
  SERVER_MARKER,
  serverMarkerText,
} from '@msm/interop';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createFolderQueue,
  createInstancesService,
  type InstancesService,
  LAUNCH_AFTER_CREATE_MS,
} from '../../src/main/platform/instances';
import { withRenameRetry } from '../../src/main/platform/node-platform';
import { createSettingsStore, type SettingsStore } from '../../src/main/platform/settings';
import { InvokeChannels, ipcContract } from '../../src/shared/ipc-contract';
import type { InstanceEnsureRequest, InstancePlanRequest } from '../../src/shared/platform';
import { type FakeMmcRoot, makeMmcRoot } from '../helpers/fake-launchers';

/**
 * Instances for anything in main (ADR 0133 D1 to D5, B763): a made-up Prism folder full of the
 * user's own instances, no network, a stub launcher program.
 */

/** Made-up versions; tests never name a real Minecraft version. */
const VERSION = '9.9-msm-test';
const SNAPSHOT = '9.10-msm-snap';
const FACTS: Record<string, RecipeTargetFacts> = {
  'mc-test': {
    mcVersion: VERSION,
    channel: 'release',
    java: 25,
    fabric: { loader: '0.20.1', api: '0.1.0+9.9' },
  } as unknown as RecipeTargetFacts,
  'mc-snap': {
    mcVersion: SNAPSHOT,
    channel: 'snapshot',
    java: 25,
    fabric: { loader: '0.20.1', api: '0.1.0+9.10' },
  } as unknown as RecipeTargetFacts,
};
const TEST = `MCSuperMods Test (${VERSION})`;
const PLAIN = `MCSuperMods Plain (${VERSION})`;
const API_JAR = new TextEncoder().encode('fake fabric api');
const MOD_JAR = zipSync({ 'fabric.mod.json': strToU8('{"id":"ruby"}') });

let temp: string;
let prism: FakeMmcRoot;
let settings: SettingsStore;
let service: InstancesService;
let cacheDir: string;
let msmHome: string;
let writes: string[];
let renames: [string, string][];
let spawned: { program: string; args: readonly string[] }[];
let shown: string[];
let trashed: string[];
let sleeps: number[];
let clock: number;
let runningServer: string | null;

const download: Downloader = async (url) => {
  if (url.endsWith('.sha512')) {
    return strToU8(createHash('sha512').update(API_JAR).digest('hex'));
  }
  return API_JAR;
};

function recordingFs(): InstallFileSystem {
  const inner = createNodeInstallFileSystem({ rename: true });
  return {
    ...inner,
    async writeFile(path, data) {
      writes.push(normalize(path));
      return inner.writeFile(path, data);
    },
    async rename(from, to) {
      renames.push([normalize(from), normalize(to)]);
      return (inner.rename as NonNullable<InstallFileSystem['rename']>)(from, to);
    },
  };
}

function makeService(): InstancesService {
  return createInstancesService({
    fs: recordingFs(),
    env: { platform: 'linux', home: join(temp, 'home') },
    settings,
    msmHome,
    cacheDir,
    download,
    targetFacts: (targetId) => {
      const facts = FACTS[targetId];
      if (facts === undefined) throw new Error(`Unknown target ${targetId}.`);
      return facts;
    },
    spawnLauncher: async (program, args) => {
      spawned.push({ program, args });
    },
    trashItem: async (path) => {
      trashed.push(path);
      await mkdir(join(temp, 'trash'), { recursive: true });
      await rename(path, join(temp, 'trash', `${trashed.length}`));
    },
    showItemInFolder: (path) => {
      shown.push(path);
    },
    serverRunning: (dir) => runningServer !== null && normalize(dir) === normalize(runningServer),
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  });
}

const project = { namespace: 'ruby', modId: 'ruby', playsWithoutMods: false };
const plainProject = { namespace: 'sky', modId: null, playsWithoutMods: true };

function plan(
  action: InstancePlanRequest['action'],
  overrides: Partial<InstancePlanRequest> = {},
): InstancePlanRequest {
  return { targetId: 'mc-test', action, project, ...overrides };
}

function ensure(
  action: InstancePlanRequest['action'],
  overrides: Partial<InstanceEnsureRequest> = {},
): InstanceEnsureRequest {
  return { ...plan(action), jars: [{ modId: 'ruby', data: MOD_JAR }], ...overrides };
}

/** Every file below `dir` with its bytes, by relative path; folders too. */
async function snapshot(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) {
        out.set(`${relative(dir, path)}/`, '');
        await walk(path);
      } else out.set(relative(dir, path), (await readFile(path)).toString('base64'));
    }
  };
  await walk(dir);
  return out;
}

const FOREIGN = Array.from({ length: 10 }, (_, i) => `Mine ${i}`);

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-main-instances-'));
  clock = 1_000_000;
  writes = [];
  renames = [];
  spawned = [];
  shown = [];
  trashed = [];
  sleeps = [];
  runningServer = null;
  prism = await makeMmcRoot(join(temp, 'prism'), {
    instances: [
      ...FOREIGN.map((folder, i) => ({
        folder,
        mcVersion: i % 2 === 0 ? VERSION : '1.0-test',
        loader: i % 3 === 0 ? { uid: 'net.fabricmc.fabric-loader', version: '0.1' } : null,
        worlds: [`World ${i}`],
      })),
      // A folder named like MSM's Plain instance, without MSM's marker: never touched.
      { folder: PLAIN, mcVersion: VERSION, worlds: ['Their world'] },
    ],
  });
  await writeFile(join(prism.root, 'accounts.json'), '{"accounts":["secret"]}');
  await writeFile(join(prism.root, 'prismlauncher'), '#!/bin/sh\n');
  await writeFile(join(prism.instanceDir('Mine 0'), 'minecraft', 'options.txt'), 'fov:1\n');
  msmHome = join(temp, 'msm-home');
  cacheDir = join(temp, 'user-data', 'downloads');
  settings = createSettingsStore({
    msmHome,
    installEnv: { platform: 'linux', home: join(temp, 'home') },
  });
  await settings.set({
    launchers: { prismDataDirs: [prism.root], multimcRoots: [], curseForgeRoots: [] },
  });
  service = makeService();
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('instances: plan', () => {
  it('works out the recipe, its card sentences and that the card shows the first time', async () => {
    const result = await service.plan(plan({ kind: 'test' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ipcContract[InvokeChannels.instancesPlan].response.safeParse(result).success).toBe(true);
    expect(result.kind).toBe('test');
    expect(result.launcher).toBe('prism');
    expect(result.existing).toBeNull();
    expect(result.ask).toBe(true);
    expect(result.recipe).toMatchObject({
      purpose: 'test',
      mcVersion: VERSION,
      place: { kind: 'instance', name: TEST },
      world: { folder: 'msm-test-ruby', copied: false },
    });
    expect(result.sentences[0]).toBe(
      `A Prism Launcher instance named ${TEST}, with Minecraft ${VERSION}, Fabric Loader 0.20.1, your mod and Fabric API.`,
    );
    expect(result.sentences.at(-1)).toBe('Your other instances are not touched.');
    // Nothing is written by a plan.
    expect(writes).toEqual([]);
  });

  it('says so on a snapshot target, and plans a server too', async () => {
    const snap = await service.plan(
      plan({ kind: 'plain' }, { targetId: 'mc-snap', project: plainProject }),
    );
    if (!snap.ok) throw new Error(snap.message);
    expect(snap.recipe.place.name).toBe(`MCSuperMods Plain (${SNAPSHOT})`);
    expect(snap.sentences.at(-1)).toMatch(/is a snapshot/);
    const server = await service.plan(plan({ kind: 'server' }));
    if (!server.ok) throw new Error(server.message);
    expect(server).toMatchObject({ kind: 'server', launcher: null, existing: null, ask: true });
    expect(server.title).toBe('Make a server');
  });

  it('answers in words, never a throw', async () => {
    expect(await service.plan(plan({ kind: 'plain' }))).toMatchObject({
      ok: false,
      code: 'needs-mod',
    });
    expect(await service.plan(plan({ kind: 'test' }, { targetId: 'mc-none' }))).toMatchObject({
      ok: false,
      code: 'failed',
    });
    expect(await service.plan(plan({ kind: 'map', name: 'Ruby Sky' }))).toMatchObject({
      ok: false,
      code: 'not-yet',
    });
    expect(
      await service.plan(plan({ kind: 'test' }, { project: { ...project, modId: null } })),
    ).toMatchObject({ ok: false, code: 'bad-input' });
  });

  it('follows the ask setting', async () => {
    await settings.set({ instances: { ask: 'never', madeByItself: [] } });
    const never = await service.plan(plan({ kind: 'test' }));
    expect(never.ok && never.ask).toBe(false);
    await settings.set({ instances: { ask: 'always', madeByItself: ['test'] } });
    const always = await service.plan(plan({ kind: 'test' }));
    expect(always.ok && always.ask).toBe(true);
    await settings.set({ instances: { ask: 'first-time', madeByItself: ['test'] } });
    const remembered = await service.plan(plan({ kind: 'test' }));
    expect(remembered.ok && remembered.ask).toBe(false);
  });

  it('has no launcher without a Prism folder', async () => {
    await settings.set({ launchers: { prismDataDirs: [], multimcRoots: [], curseForgeRoots: [] } });
    const result = await service.plan(plan({ kind: 'test' }));
    expect(result).toMatchObject({ ok: true, launcher: null, existing: null });
    expect(await service.ensure(ensure({ kind: 'test' }))).toMatchObject({
      ok: false,
      code: 'no-launcher',
    });
  });
});

describe('instances: ensure', () => {
  it('makes the test instance once, remembers the kind, and then shows no card for it', async () => {
    const made = await service.ensure(ensure({ kind: 'test' }));
    expect(made).toMatchObject({ ok: true, name: TEST, created: true });
    if (!made.ok) return;
    expect(ipcContract[InvokeChannels.instancesEnsure].response.safeParse(made).success).toBe(true);
    expect(made.mods.sort()).toEqual(['fabric-api-0.1.0+9.9.jar', 'ruby.jar']);
    const dir = prism.instanceDir(TEST);
    expect(JSON.parse(await readFile(join(dir, '.msm-managed.json'), 'utf8'))).toMatchObject({
      formatVersion: 2,
      purpose: 'test',
    });
    expect((await settings.instanceSettings()).madeByItself).toEqual(['test']);
    const again = await service.plan(plan({ kind: 'test' }));
    expect(again).toMatchObject({
      ok: true,
      existing: { id: made.id, name: TEST },
      ask: false,
    });
    const second = await service.ensure(ensure({ kind: 'test' }));
    expect(second).toMatchObject({ ok: true, created: false, id: made.id });
  });

  it('remembers a kind when asked, with the ask setting at always', async () => {
    await settings.set({ instances: { ask: 'always', madeByItself: [] } });
    await service.ensure(ensure({ kind: 'test' }));
    expect((await settings.instanceSettings()).madeByItself).toEqual([]);
    await service.ensure(ensure({ kind: 'plain' }, { project: plainProject, remember: true }));
    expect((await settings.instanceSettings()).madeByItself).toEqual(['plain']);
  });

  it('makes the Plain instance beside a same-named folder that is not MSM’s', async () => {
    const made = await service.ensure(
      ensure({ kind: 'plain' }, { project: plainProject, jars: [] }),
    );
    expect(made).toMatchObject({ ok: true, name: `${PLAIN}-2`, created: true, mods: [] });
    const pack = JSON.parse(
      await readFile(join(prism.instanceDir(`${PLAIN}-2`), 'mmc-pack.json'), 'utf8'),
    );
    expect(pack.components.map((c: { uid: string }) => c.uid)).toEqual(['net.minecraft']);
  });

  it('makes a modpack its own instance', async () => {
    const made = await service.ensure(
      ensure({ kind: 'modpack', name: 'Gem Pack', modIds: ['ruby'] }),
    );
    expect(made).toMatchObject({ ok: true, name: `MCSuperMods Pack Gem Pack (${VERSION})` });
  });

  it('refuses a server and a missing jar in words', async () => {
    expect(await service.ensure(ensure({ kind: 'server' }))).toMatchObject({
      ok: false,
      code: 'bad-input',
    });
    const missing = await service.ensure(ensure({ kind: 'test' }, { jars: [] }));
    expect(missing).toMatchObject({ ok: false, code: 'bad-input' });
    if (!missing.ok) expect(missing.message).toMatch(/ruby was not sent/);
    // Nothing half made is left: no instance folder without its marker.
    expect(
      await stat(prism.instanceDir(TEST)).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
  });

  it('runs one at a time in a launcher folder, so two at once both land whole', async () => {
    const [a, b] = await Promise.all([
      service.ensure(ensure({ kind: 'test' })),
      service.ensure(ensure({ kind: 'modpack', name: 'Gem Pack', modIds: ['ruby'] })),
    ]);
    expect(a.ok && b.ok).toBe(true);
    const staging = join(prism.instancesDir, '.msm-staging');
    const left = await readdir(staging).catch(() => []);
    expect(left).toEqual([]);
  });

  it('writes nothing outside a marked folder or the cache, and leaves foreign instances byte for byte the same (D5)', async () => {
    const before = await snapshot(prism.root);
    for (let round = 0; round < 2; round++) {
      for (const targetId of ['mc-test', 'mc-snap']) {
        for (const request of [
          ensure({ kind: 'test' }, { targetId }),
          ensure({ kind: 'game' }, { targetId }),
          ensure({ kind: 'plain' }, { targetId, project: plainProject, jars: [] }),
          ensure({ kind: 'modpack', name: 'Gem Pack', modIds: ['ruby'] }, { targetId }),
        ]) {
          const result = await service.ensure(request);
          expect(result.ok, JSON.stringify(result)).toBe(true);
        }
      }
    }
    const after = await snapshot(prism.root);
    const ours = new Set(
      (await service.list()).filter((thing) => thing.kind !== 'server').map((thing) => thing.name),
    );
    // Test (shared with game), Plain and the modpack's, on both targets.
    expect(ours.size).toBe(6);
    for (const [path, bytes] of before) expect(after.get(path), path).toBe(bytes);
    for (const path of after.keys()) {
      if (before.has(path)) continue;
      const top = path.split(/[\\/]/)[1] ?? '';
      expect(path.startsWith(`instances${sep}`) && ours.has(top), path).toBe(true);
    }
    const instances = normalize(prism.instancesDir);
    for (const path of writes) {
      const rel = relative(instances, path);
      const inOwn =
        !rel.startsWith('..') &&
        (ours.has(rel.split(sep)[0] ?? '') || rel.startsWith(`.msm-staging${sep}`));
      const inCache = path.startsWith(normalize(cacheDir) + sep);
      expect(inOwn || inCache, path).toBe(true);
    }
    for (const [from, to] of renames) {
      expect(from.startsWith(join(instances, '.msm-staging') + sep), from).toBe(true);
      expect(ours.has(relative(instances, to)), to).toBe(true);
    }
  });
});

describe('instances: list, remove, show in folder', () => {
  async function makeServerFolder(folder: string): Promise<string> {
    const dir = join(msmHome, 'servers', folder);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, SERVER_MARKER),
      serverMarkerText({
        formatVersion: 1,
        kind: 'fabric',
        owner: 'ruby',
        minecraft: VERSION,
        loader: '0.20.1',
        launcher: null,
        eula: null,
        properties: {},
        worlds: [],
      }),
    );
    return dir;
  }

  it('lists only what MSM made, and removes it into the recycle bin', async () => {
    const made = await service.ensure(ensure({ kind: 'test' }));
    if (!made.ok) throw new Error(made.message);
    const serverDir = await makeServerFolder(`ruby-${VERSION}`);
    await mkdir(join(msmHome, 'servers', 'not-ours'), { recursive: true });
    const list = await service.list();
    expect(ipcContract[InvokeChannels.instancesList].response.safeParse(list).success).toBe(true);
    expect(list.map((thing) => [thing.kind, thing.name, thing.launcher])).toEqual([
      ['test', TEST, 'prism'],
      ['server', `ruby-${VERSION}`, null],
    ]);
    const before = await snapshot(prism.root);

    // An id that is not in the list is never acted on, even a real folder of the user's.
    expect(await service.remove(`instance:${prism.instanceDir('Mine 1')}`)).toMatchObject({
      ok: false,
      code: 'not-found',
    });
    expect(await service.remove(`instance:${prism.instanceDir(PLAIN)}`)).toMatchObject({
      ok: false,
      code: 'not-found',
    });
    expect(
      await service.showInFolder(`server:${join(msmHome, 'servers', 'not-ours')}`),
    ).toMatchObject({
      ok: false,
      code: 'not-found',
    });

    // A running server stays.
    runningServer = serverDir;
    const server = list.find((thing) => thing.kind === 'server');
    expect(await service.remove(server?.id as string)).toMatchObject({
      ok: false,
      code: 'running',
    });
    runningServer = null;

    expect(await service.showInFolder(made.id)).toEqual({ ok: true });
    expect(shown).toEqual([normalize(prism.instanceDir(TEST))]);
    expect(await service.remove(made.id)).toEqual({ ok: true });
    expect(await service.remove(server?.id as string)).toEqual({ ok: true });
    expect(trashed).toEqual([normalize(prism.instanceDir(TEST)), normalize(serverDir)]);
    expect(await service.list()).toEqual([]);
    const after = await snapshot(prism.root);
    for (const [path, bytes] of after) expect(before.get(path), path).toBe(bytes);
  });

  it('refuses removal without a recycle bin', async () => {
    const made = await service.ensure(ensure({ kind: 'test' }));
    if (!made.ok) throw new Error(made.message);
    const bare = createInstancesService({
      fs: recordingFs(),
      env: { platform: 'linux', home: join(temp, 'home') },
      settings,
      msmHome,
      cacheDir,
      download,
      targetFacts: () => FACTS['mc-test'] as RecipeTargetFacts,
    });
    expect(await bare.remove(made.id)).toMatchObject({ ok: false, code: 'failed' });
    expect(await stat(prism.instanceDir(TEST)).then(() => true)).toBe(true);
  });
});

describe('instances: launch', () => {
  it('joins a server with --server, removing a stale play request first', async () => {
    expect(await service.launch(plan({ kind: 'test' }))).toMatchObject({
      ok: false,
      code: 'not-found',
    });
    await service.ensure(ensure({ kind: 'test' }));
    const play = join(prism.gameDir(TEST), 'msm-dev', 'play.json');
    await mkdir(join(prism.gameDir(TEST), 'msm-dev'), { recursive: true });
    await writeFile(play, '{"seq":1}');
    const join_ = { host: '127.0.0.1', port: 25566 };
    const result = await service.launch(plan({ kind: 'test', join: join_ }));
    expect(result).toEqual({ ok: true, name: TEST, launched: true, note: null });
    expect(spawned).toEqual([
      {
        program: join(prism.root, 'prismlauncher'),
        args: ['--dir', prism.root, '--launch', TEST, '--server', '127.0.0.1:25566'],
      },
    ]);
    await expect(stat(play)).rejects.toThrow();
    // Prism was given a moment to list the instance made just now (B760).
    expect(sleeps).toEqual([LAUNCH_AFTER_CREATE_MS]);
    await service.launch(plan({ kind: 'test' }));
    expect(spawned[1]?.args).toEqual(['--dir', prism.root, '--launch', TEST]);
    expect(sleeps).toHaveLength(1);
  });

  it('says how to start the game when the launcher program is not found', async () => {
    await rm(join(prism.root, 'prismlauncher'));
    await service.ensure(ensure({ kind: 'test' }));
    expect(await service.launch(plan({ kind: 'test' }))).toEqual({
      ok: true,
      name: TEST,
      launched: false,
      note: `Start Prism Launcher and choose "${TEST}".`,
    });
    expect(spawned).toEqual([]);
  });
});

describe('instances: later briefs', () => {
  it('declares their channels and answers not yet', async () => {
    expect(await service.playPlain({ targetId: 'mc-test', project: plainProject })).toMatchObject({
      ok: false,
      code: 'not-yet',
    });
    expect(
      await service.openMap({
        targetId: 'mc-test',
        project,
        mapName: 'Ruby Sky',
        sourceId: 'msm-play',
        worldDir: 'msm-game-ruby',
        jars: [],
      }),
    ).toMatchObject({ ok: false, code: 'not-yet' });
    expect(
      await service.curseForgeProfile({ targetId: 'mc-test', project, jars: [] }),
    ).toMatchObject({
      ok: false,
      code: 'not-yet',
    });
    expect(writes).toEqual([]);
  });
});

describe('the folder queue and the rename retry', () => {
  it('runs steps under one key one after another, and other keys alongside', async () => {
    const queue = createFolderQueue();
    const order: string[] = [];
    let releaseA: () => void = () => {};
    const a = queue(
      'x',
      () =>
        new Promise<void>((resolve) => {
          order.push('a start');
          releaseA = () => {
            order.push('a end');
            resolve();
          };
        }),
    );
    const b = queue('x', async () => {
      order.push('b');
    });
    const c = queue('y', async () => {
      order.push('c');
    });
    await c;
    expect(order).toEqual(['a start', 'c']);
    releaseA();
    await Promise.all([a, b]);
    expect(order).toEqual(['a start', 'c', 'a end', 'b']);
    // A failed step does not stop the next.
    await expect(queue('x', async () => Promise.reject(new Error('no')))).rejects.toThrow('no');
    await expect(queue('x', async () => 1)).resolves.toBe(1);
  });

  it('tries a briefly refused rename again, a bounded number of times', async () => {
    let calls = 0;
    let failWith = 'EPERM';
    let failures = 2;
    const waits: number[] = [];
    const fs = withRenameRetry(
      {
        rename: async () => {
          calls++;
          if (failures > 0) {
            failures--;
            throw Object.assign(new Error(failWith), { code: failWith });
          }
        },
      } as unknown as InstallFileSystem,
      { tries: 4, delayMs: 10, sleep: async (ms) => void waits.push(ms) },
    );
    const rename_ = fs.rename as NonNullable<InstallFileSystem['rename']>;
    await rename_('/a', '/b');
    expect(calls).toBe(3);
    expect(waits).toEqual([10, 20]);
    calls = 0;
    failures = 9;
    await expect(rename_('/a', '/b')).rejects.toThrow('EPERM');
    expect(calls).toBe(4);
    calls = 0;
    failures = 1;
    failWith = 'EEXIST';
    await expect(rename_('/a', '/b')).rejects.toThrow('EEXIST');
    expect(calls).toBe(1);
  });
});
