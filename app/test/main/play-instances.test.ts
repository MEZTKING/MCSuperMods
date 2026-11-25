import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type Downloader,
  locationPathKey,
  type RecipeTargetFacts,
  readInstanceMarker,
} from '@msm/interop';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFolderQueue, createInstancesService } from '../../src/main/platform/instances';
import { createLocationResolver } from '../../src/main/platform/locations';
import { createPlayService, type TargetDevFacts } from '../../src/main/platform/play';
import { createSettingsStore, type SettingsStore } from '../../src/main/platform/settings';
import {
  createTestInMinecraftService,
  type FolderQueue,
} from '../../src/main/platform/test-in-minecraft';
import type { InstanceEnsureRequest, PlayInput } from '../../src/shared/platform';
import { type FakeMmcRoot, makeMmcRoot } from '../helpers/fake-launchers';

/**
 * Play and Test in Minecraft through recipes in main (ADR 0133, B765): the test instance made by
 * `instances.ensure` is the one Play uses, and every step that makes or changes an instance runs
 * in the launcher folder's one queue, shared by the three services.
 */

/** Made-up versions; tests never name a real Minecraft version. */
const TARGETS: Record<string, { mcVersion: string; loader: string; api: string }> = {
  'mc-a': { mcVersion: '9.9-msm-test', loader: '0.20.1', api: '0.1.0+9.9' },
  'mc-b': { mcVersion: '9.10-msm-snap', loader: '0.20.1', api: '0.1.0+9.10' },
};
const DEV_FACTS: TargetDevFacts = {
  dev: {
    gameRules: {
      advanceTime: 'advance_time',
      advanceWeather: 'advance_weather',
      spawnMobs: 'spawn_mobs',
      keepInventory: 'keep_inventory',
    },
    worldDataFolders: [],
  },
  packFormats: { resource: { major: 97, minor: 1 }, data: { major: 121, minor: 0 } },
};
const API_JAR = new TextEncoder().encode('fake fabric api');
const MOD_JAR = zipSync({
  'fabric.mod.json': strToU8('{"id":"ruby"}'),
  'META-INF/jars/msm_runtime-1.8.0.jar': new Uint8Array([1, 2, 3]),
});

const download: Downloader = async (url) =>
  url.endsWith('.sha512') ? strToU8(createHash('sha512').update(API_JAR).digest('hex')) : API_JAR;

function factsOf(targetId: string) {
  const facts = TARGETS[targetId];
  if (facts === undefined) throw new Error(`Unknown target ${targetId}.`);
  return facts;
}

function recipeFacts(targetId: string): RecipeTargetFacts {
  const facts = factsOf(targetId);
  return {
    mcVersion: facts.mcVersion,
    channel: targetId === 'mc-b' ? 'snapshot' : 'release',
    java: 25,
    fabric: { loader: facts.loader, api: facts.api },
  } as unknown as RecipeTargetFacts;
}

let temp: string;
let prism: FakeMmcRoot;
let settings: SettingsStore;
let queued: { key: string; service: string }[];
let spawned: string[][];
let active: number;
let mostAtOnce: number;

/** The shared queue, recording which service queued under which key and how many ran at once. */
function recordingQueue(service: string, shared: FolderQueue): FolderQueue {
  return (key, step) => {
    queued.push({ key, service });
    return shared(key, async () => {
      active += 1;
      mostAtOnce = Math.max(mostAtOnce, active);
      try {
        // A turn of the event loop inside the step, so an unqueued second step would overlap.
        await new Promise((resolve) => setTimeout(resolve, 5));
        return await step();
      } finally {
        active -= 1;
      }
    });
  };
}

function services() {
  const fs = createNodeInstallFileSystem({ rename: true });
  const env = { platform: 'linux' as const, home: join(temp, 'home') };
  const cacheDir = join(temp, 'user-data', 'downloads');
  const shared = createFolderQueue();
  const spawnLauncher = async (_program: string, args: readonly string[]) => {
    spawned.push([...args]);
  };
  const instances = createInstancesService({
    fs,
    env,
    settings,
    msmHome: join(temp, 'msm-home'),
    cacheDir,
    download,
    targetFacts: recipeFacts,
    spawnLauncher,
    queue: recordingQueue('instances', shared),
  });
  const play = createPlayService({
    fs,
    env,
    settings,
    cacheDir,
    appVersion: async () => '1.5.9-test',
    transpile: async (source) => ({ js: source }),
    download,
    facts: factsOf,
    devFacts: () => DEV_FACTS,
    spawnLauncher,
    queue: recordingQueue('play', shared),
  });
  const testInMinecraft = createTestInMinecraftService({
    fs,
    env,
    locations: createLocationResolver({ fs, env, settings }),
    settings,
    cacheDir,
    download,
    facts: factsOf,
    spawnLauncher,
    pickProgram: async () => null,
    queue: recordingQueue('test-in-minecraft', shared),
  });
  return { instances, play, testInMinecraft };
}

function ensureRequest(targetId: string, kind: 'test' | 'game' = 'test'): InstanceEnsureRequest {
  return {
    targetId,
    action: { kind },
    project: { namespace: 'ruby', modId: 'ruby', playsWithoutMods: false },
    jars: [{ modId: 'ruby', data: MOD_JAR }],
  };
}

function playInput(targetId: string): PlayInput {
  return {
    targetId,
    modId: 'ruby',
    jar: MOD_JAR,
    outputs: [],
    namespaces: ['ruby'],
    items: [],
  };
}

function instanceDir(targetId: string): string {
  return prism.instanceDir(`MCSuperMods Test (${factsOf(targetId).mcVersion})`);
}

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-play-instances-'));
  queued = [];
  spawned = [];
  active = 0;
  mostAtOnce = 0;
  prism = await makeMmcRoot(join(temp, 'prism'), {
    instances: [{ folder: 'My Survival', mcVersion: '9.9-msm-test' }],
  });
  await writeFile(join(prism.root, 'prismlauncher'), '#!/bin/sh\n');
  settings = createSettingsStore({
    msmHome: join(temp, 'msm-home'),
    installEnv: { platform: 'linux', home: join(temp, 'home') },
  });
  await settings.set({
    launchers: { prismDataDirs: [prism.root], multimcRoots: [], curseForgeRoots: [] },
  });
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('Play through recipes in main', () => {
  for (const targetId of Object.keys(TARGETS)) {
    it(`plays in the test instance instances.ensure made, on ${targetId}`, async () => {
      const { instances, play } = services();
      const plan = await instances.plan(ensureRequest(targetId));
      expect(plan).toMatchObject({ ok: true, existing: null, ask: true, launcher: 'prism' });
      const made = await instances.ensure(ensureRequest(targetId));
      expect(made).toMatchObject({
        ok: true,
        name: `MCSuperMods Test (${factsOf(targetId).mcVersion})`,
        created: true,
      });
      // Now the plan finds it, so Play never shows the card for it again.
      expect(await instances.plan(ensureRequest(targetId))).toMatchObject({
        ok: true,
        existing: { name: `MCSuperMods Test (${factsOf(targetId).mcVersion})` },
        ask: false,
      });

      const result = await play.play(playInput(targetId));
      expect(result.ok ? 'ok' : result.message).toBe('ok');
      expect(result).toMatchObject({ ok: true, instanceCreated: false, launched: true });
      // Play kept the marker instances.ensure wrote (version 2, the test role).
      expect(
        await readInstanceMarker(createNodeInstallFileSystem(), instanceDir(targetId)),
      ).toMatchObject({
        formatVersion: 2,
        role: 'test',
      });
      const mods = (await readdir(join(instanceDir(targetId), 'minecraft', 'mods'))).sort();
      expect(mods).toContain('ruby.jar');
      expect(mods).toContain(`fabric-api-${factsOf(targetId).api}.jar`);
      // The user's own instance is untouched.
      expect(
        await readFile(join(prism.instanceDir('My Survival'), 'instance.cfg'), 'utf8'),
      ).toContain('name=My Survival');
    });
  }

  it('gives each target its own test instance', async () => {
    const { instances } = services();
    await instances.ensure(ensureRequest('mc-a'));
    const second = await instances.plan(ensureRequest('mc-b', 'game'));
    expect(second).toMatchObject({ ok: true, existing: null });
    expect(await instances.ensure(ensureRequest('mc-b', 'game'))).toMatchObject({
      ok: true,
      name: 'MCSuperMods Test (9.10-msm-snap)',
      created: true,
    });
    const folders = (await readdir(join(prism.root, 'instances'))).sort();
    expect(folders).toEqual([
      'MCSuperMods Test (9.10-msm-snap)',
      'MCSuperMods Test (9.9-msm-test)',
      'My Survival',
    ]);
  });

  it('makes and checks the test instance in the launcher folder queue the services share', async () => {
    const { instances, play, testInMinecraft } = services();
    // Play without the card (an old caller) still makes the instance, in the queue.
    const [played, ensured] = await Promise.all([
      play.play(playInput('mc-a')),
      instances.ensure(ensureRequest('mc-b')),
    ]);
    expect(played.ok ? 'ok' : played.message).toBe('ok');
    expect(ensured.ok ? 'ok' : ensured.message).toBe('ok');
    await testInMinecraft.createInstance('mc-a');
    const key = locationPathKey(prism.root);
    expect(queued.map((entry) => entry.key)).toEqual([key, key, key]);
    expect(queued.map((entry) => entry.service).sort()).toEqual([
      'instances',
      'play',
      'test-in-minecraft',
    ]);
    // One step at a time in the Prism folder.
    expect(mostAtOnce).toBe(1);
    // No staging folder is left behind by either.
    expect((await readdir(join(prism.root, 'instances'))).filter((n) => n.startsWith('.'))).toEqual(
      [],
    );
  });
});
