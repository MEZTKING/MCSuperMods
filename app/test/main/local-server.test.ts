import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, normalize, relative, sep } from 'node:path';
import type { Downloader, InstallFileSystem, RecipeTargetFacts } from '@msm/interop';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerLocalServerEvents } from '../../src/main/ipc';
import {
  createLocalServerService,
  isPortFreeNode,
  type LocalServerService,
  nodeSpawnServer,
  processJavaEnv,
} from '../../src/main/platform/local-server';
import { createSettingsStore, type SettingsStore } from '../../src/main/platform/settings';
import { isLocalServerStatusPayload } from '../../src/shared/ipc-channels';
import {
  InvokeChannels,
  ipcContract,
  localServerStatusSchema,
} from '../../src/shared/ipc-contract';
import type { LocalServerRequest, LocalServerStatus } from '../../src/shared/platform';

/**
 * The local server in main (ADR 0133 D7 to D9, B763): a made-up MSM home, a stub "Java" (a Node
 * script that prints a server's start lines and stops on `stop`), no network.
 */

/** Made-up versions; tests never name a real Minecraft version. */
const VERSION = '9.9-msm-test';
const FACTS = {
  mcVersion: VERSION,
  channel: 'release',
  java: 25,
  fabric: { loader: '0.20.1', api: '0.1.0+9.9' },
} as unknown as RecipeTargetFacts;
const STUB = join(import.meta.dirname, '..', 'fixtures', 'local-server', 'stub-server.mjs');
const API_JAR = new TextEncoder().encode('fake fabric api');
const LAUNCHER_JAR = zipSync({ 'META-INF/MANIFEST.MF': strToU8('Main-Class: x\n') });
const MOD_JAR = zipSync({ 'fabric.mod.json': strToU8('{"id":"ruby"}') });

let temp: string;
let msmHome: string;
let cacheDir: string;
let javaHome: string;
let settings: SettingsStore;
let service: LocalServerService;
let writes: string[];
let downloads: string[];
let spawned: { program: string; args: string[]; cwd: string }[];
let takenPorts: Set<number>;
let services: LocalServerService[];

const download: Downloader = async (url) => {
  downloads.push(url);
  if (url.endsWith('/versions/installer')) {
    return strToU8(JSON.stringify([{ version: '1.1.0', stable: true }]));
  }
  if (url.endsWith('/server/jar')) return LAUNCHER_JAR;
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
  };
}

function makeService(
  options: {
    mode?: 'normal' | 'deaf' | 'port-taken' | 'port-taken-slow';
    java?: boolean;
    stopMs?: number;
  } = {},
): LocalServerService {
  const created = createLocalServerService({
    fs: recordingFs(),
    javaEnv: {
      platform: 'linux',
      home: join(temp, 'home'),
      ...(options.java === false ? {} : { javaHome }),
      path: '',
    },
    settings,
    msmHome,
    cacheDir,
    download,
    targetFacts: () => FACTS,
    probe: async () => null,
    spawnServer: async (command) => {
      spawned.push({ program: command.program, args: [...command.args], cwd: command.cwd });
      process.env.STUB_SERVER_MODE = options.mode ?? 'normal';
      try {
        // The stub stands in for Java: the same arguments, the same folder, no shell.
        return await nodeSpawnServer({
          program: process.execPath,
          args: [STUB, ...command.args],
          cwd: command.cwd,
        });
      } finally {
        delete process.env.STUB_SERVER_MODE;
      }
    },
    isPortFree: async (port) => !takenPorts.has(port),
    lanAddresses: () => ['192.168.1.20'],
    stopTimeoutMs: options.stopMs ?? 5_000,
    quitTimeoutMs: options.stopMs ?? 5_000,
  });
  services.push(created);
  return created;
}

const request = (overrides: Partial<LocalServerRequest> = {}): LocalServerRequest => ({
  targetId: 'mc-test',
  project: { namespace: 'ruby', modId: 'ruby', playsWithoutMods: false },
  jars: [{ modId: 'ruby', data: MOD_JAR }],
  ...overrides,
});

const accept = { accepted: true, at: '2026-11-23T10:00:00Z' } as const;

async function waitFor(
  check: (status: LocalServerStatus) => boolean,
  of: LocalServerService = service,
): Promise<LocalServerStatus> {
  const until = Date.now() + 15_000;
  for (;;) {
    const status = await of.status();
    if (check(status)) return status;
    if (Date.now() > until) throw new Error(`Timed out; the status is ${JSON.stringify(status)}.`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitGone(pid: number): Promise<void> {
  const until = Date.now() + 10_000;
  while (alive(pid)) {
    if (Date.now() > until) throw new Error(`Process ${pid} is still running.`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function stubPid(): Promise<number> {
  const status = await service.status();
  const dir = status.server?.path as string;
  return Number(await readFile(join(dir, 'stub.pid'), 'utf8'));
}

/** Every file below `dir` with its bytes, by relative path. */
async function snapshot(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else out.set(relative(dir, path), (await readFile(path)).toString('base64'));
    }
  };
  await walk(dir);
  return out;
}

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-main-server-'));
  msmHome = join(temp, 'msm-home');
  cacheDir = join(temp, 'user-data', 'downloads');
  javaHome = join(temp, 'jdk-25');
  await mkdir(join(javaHome, 'bin'), { recursive: true });
  await writeFile(join(javaHome, 'bin', 'java'), '#!/bin/sh\n');
  await writeFile(join(javaHome, 'release'), 'JAVA_VERSION="25.0.1"\n');
  settings = createSettingsStore({
    msmHome,
    installEnv: { platform: 'linux', home: join(temp, 'home') },
  });
  writes = [];
  downloads = [];
  spawned = [];
  takenPorts = new Set();
  services = [];
  service = makeService();
});

afterEach(async () => {
  for (const each of services) each.killNow();
  for (const each of services) await each.shutdown();
  await rm(temp, { recursive: true, force: true });
});

describe('local server: prepare', () => {
  it('makes the folder from the cached launcher, writes only there and in the cache, and finds Java', async () => {
    const result = await service.prepare(request());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(localServerStatusSchema.safeParse(result.status).success).toBe(true);
    const server = result.status.server;
    expect(server).toMatchObject({
      folder: `ruby-${VERSION}`,
      owner: 'ruby',
      mcVersion: VERSION,
      port: 25565,
      eulaAccepted: false,
    });
    expect(result.status.state).toBe('stopped');
    expect(result.status.java).toEqual({
      ok: true,
      version: '25.0.1',
      path: join(javaHome, 'bin', 'java'),
    });
    const dir = server?.path as string;
    const properties = await readFile(join(dir, 'server.properties'), 'utf8');
    // The defaults the user has not answered (ADR 0133 D7): white list off, online mode on.
    expect(properties).toMatch(/^white-list=false$/m);
    expect(properties).toMatch(/^online-mode=true$/m);
    expect((await readdir(join(dir, 'mods'))).sort()).toEqual(
      ['.msm-installed.json', 'fabric-api-0.1.0+9.9.jar', 'ruby.jar'].sort(),
    );
    await expect(stat(join(dir, 'eula.txt'))).rejects.toThrow();
    const servers = normalize(join(msmHome, 'servers'));
    for (const path of writes) {
      expect(path.startsWith(servers + sep) || path.startsWith(normalize(cacheDir) + sep)).toBe(
        true,
      );
    }
    // A second prepare downloads nothing.
    const before = downloads.length;
    expect((await service.prepare(request())).ok).toBe(true);
    expect(downloads.length).toBe(before);
  });

  it('uses the white list and online mode settings', async () => {
    await settings.set({ localServers: { whiteList: true, onlineMode: false } });
    const result = await service.prepare(request());
    if (!result.ok) throw new Error(result.message);
    const properties = await readFile(
      join(result.status.server?.path as string, 'server.properties'),
      'utf8',
    );
    expect(properties).toMatch(/^white-list=true$/m);
    expect(properties).toMatch(/^online-mode=false$/m);
  });

  it('says plainly when no Java is found, and refuses to start without one', async () => {
    service = makeService({ java: false });
    const prepared = await service.prepare(request());
    expect(prepared.ok).toBe(true);
    if (prepared.ok) expect(prepared.status.java).toMatchObject({ ok: false });
    await service.acceptEula(`ruby-${VERSION}`, accept);
    const started = await service.start(request());
    expect(started).toMatchObject({ ok: false, code: 'no-java' });
    expect(spawned).toEqual([]);
  });

  it('answers a game that needs its mod without its jar in words, never a throw', async () => {
    const result = await service.prepare(request({ jars: [] }));
    expect(result).toMatchObject({ ok: false, code: 'failed' });
    if (!result.ok) expect(result.message).toMatch(/ruby was not sent/);
  });
});

describe('local server: the EULA', () => {
  it('does not start until the user ticked the EULA, and then writes eula=true', async () => {
    await service.prepare(request());
    const refused = await service.start(request());
    expect(refused).toMatchObject({ ok: false, code: 'eula-needed' });
    expect(spawned).toEqual([]);
    const notTicked = await service.acceptEula(`ruby-${VERSION}`, {
      accepted: false,
      at: accept.at,
    } as never);
    expect(notTicked).toMatchObject({ ok: false, code: 'eula-needed' });
    const ticked = await service.acceptEula(`ruby-${VERSION}`, accept);
    expect(ticked.ok).toBe(true);
    if (ticked.ok) expect(ticked.status.server?.eulaAccepted).toBe(true);
    const dir = join(msmHome, 'servers', `ruby-${VERSION}`);
    expect(await readFile(join(dir, 'eula.txt'), 'utf8')).toMatch(/^eula=true$/m);
  });

  it('refuses a folder that is not one of its servers', async () => {
    await mkdir(join(msmHome, 'servers', 'someone-else'), { recursive: true });
    expect(await service.acceptEula('someone-else', accept)).toMatchObject({
      ok: false,
      code: 'not-managed',
    });
    expect(await service.acceptEula('../x', accept)).toMatchObject({
      ok: false,
      code: 'bad-input',
    });
    await expect(stat(join(msmHome, 'servers', 'someone-else', 'eula.txt'))).rejects.toThrow();
  });

  it('takes only a real tick over IPC', () => {
    const schema = ipcContract[InvokeChannels.localServerAcceptEula].request;
    expect(schema.safeParse({ folder: 'a', acceptance: accept }).success).toBe(true);
    expect(
      schema.safeParse({ folder: 'a', acceptance: { accepted: 'true', at: accept.at } }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ folder: 'a', acceptance: { accepted: true, at: 'now' } }).success,
    ).toBe(false);
  });
});

describe('local server: start and stop', () => {
  it('starts Java without a shell, reads the state from the log and stops on `stop`', async () => {
    const changes: LocalServerStatus[] = [];
    service.onStatus((status) => changes.push(status));
    await service.prepare(request());
    await service.acceptEula(`ruby-${VERSION}`, accept);
    const started = await service.start(request());
    expect(started.ok).toBe(true);
    const [command] = spawned;
    expect(command?.program).toBe(join(javaHome, 'bin', 'java'));
    expect(command?.args).toEqual(['-Xmx2048M', '-jar', 'fabric-server-launch.jar', 'nogui']);
    expect(command?.cwd).toBe(join(msmHome, 'servers', `ruby-${VERSION}`));
    const running = await waitFor((status) => status.state === 'running');
    expect(running.label).toBe('Running');
    expect(running.addresses).toEqual(['192.168.1.20:25565']);
    expect(service.isRunning()).toBe(true);
    expect(service.runs(join(msmHome, 'servers', `ruby-${VERSION}`))).toBe(true);
    expect(changes.every((status) => isLocalServerStatusPayload(status))).toBe(true);
    expect(changes.map((status) => status.state)).toContain('running');

    // A second start while one runs is refused in words; so is a prepare or an EULA change.
    const again = await service.start(request());
    expect(again).toMatchObject({ ok: false, code: 'running' });
    if (!again.ok) expect(again.message).toMatch(/is running\. Stop it first/);
    expect(await service.prepare(request())).toMatchObject({ ok: false, code: 'running' });
    expect(spawned).toHaveLength(1);

    const log = await service.log(0);
    expect(log.lines.some((line) => /Done \(0\.123s\)!/.test(line))).toBe(true);
    expect(log.lines.some((line) => /A line on standard error/.test(line))).toBe(true);
    expect((await service.log(log.next)).lines).toEqual([]);

    const pid = await stubPid();
    const stopped = await service.stop();
    expect(stopped.ok).toBe(true);
    if (stopped.ok) expect(stopped.status.state).toBe('stopped');
    expect(service.isRunning()).toBe(false);
    await waitGone(pid);
    expect((await service.log(0)).lines.some((line) => /Stopping server/.test(line))).toBe(true);
    expect(await service.stop()).toMatchObject({ ok: false, code: 'not-running' });
  });

  it('kills a server that does not stop in time', async () => {
    service = makeService({ mode: 'deaf', stopMs: 300 });
    await service.prepare(request());
    await service.acceptEula(`ruby-${VERSION}`, accept);
    await service.start(request());
    await waitFor((status) => status.state === 'running');
    const pid = await stubPid();
    const stopped = await service.stop();
    expect(stopped.ok).toBe(true);
    await waitGone(pid);
    expect(service.isRunning()).toBe(false);
  });

  it('takes the next free port when the usual one is taken, and writes it', async () => {
    takenPorts.add(25565);
    takenPorts.add(25566);
    await service.prepare(request());
    await service.acceptEula(`ruby-${VERSION}`, accept);
    await service.start(request());
    const running = await waitFor((status) => status.state === 'running');
    expect(running.server?.port).toBe(25567);
    expect(running.addresses).toEqual(['192.168.1.20:25567']);
    const dir = running.server?.path as string;
    expect(await readFile(join(dir, 'server.properties'), 'utf8')).toMatch(/^server-port=25567$/m);
    expect((await service.log(0)).lines.some((line) => line.includes('*:25567'))).toBe(true);
  });

  it('reads a taken port from the log although the process exits 0', async () => {
    service = makeService({ mode: 'port-taken' });
    await service.prepare(request());
    await service.acceptEula(`ruby-${VERSION}`, accept);
    await service.start(request());
    // The state comes from the log line, a moment before the process ends: wait for the end.
    const ended = await waitFor((status) => status.state === 'port-taken' && !service.isRunning());
    expect(ended.message).toMatch(/Another program is using port 25565/);
  });

  it('says a taken port in words while the server is still ending', async () => {
    // A real server writes its crash report after the bind failure and exits a while later;
    // the status names the failure with its words from the log line on (B714).
    service = makeService({ mode: 'port-taken-slow' });
    await service.prepare(request());
    await service.acceptEula(`ruby-${VERSION}`, accept);
    await service.start(request());
    const taken = await waitFor((status) => status.state === 'port-taken');
    expect(service.isRunning()).toBe(true);
    expect(taken.message).toMatch(/Another program is using port 25565/);
    await service.stop();
    const ended = await waitFor(() => !service.isRunning());
    expect(ended.state).toBe('port-taken');
    expect(ended.message).toMatch(/Another program is using port 25565/);
  });

  it('restarts with the new jar', async () => {
    await service.prepare(request());
    await service.acceptEula(`ruby-${VERSION}`, accept);
    await service.start(request());
    await waitFor((status) => status.state === 'running');
    const first = await stubPid();
    const newJar = zipSync({ 'fabric.mod.json': strToU8('{"id":"ruby","v":2}') });
    const restarted = await service.restart(request({ jars: [{ modId: 'ruby', data: newJar }] }));
    expect(restarted.ok).toBe(true);
    await waitGone(first);
    await waitFor((status) => status.state === 'running');
    const dir = join(msmHome, 'servers', `ruby-${VERSION}`);
    expect(new Uint8Array(await readFile(join(dir, 'mods', 'ruby.jar')))).toEqual(newJar);
    expect(spawned).toHaveLength(2);
  });
});

describe('local server: quitting the app', () => {
  it('stops the child when the app quits', async () => {
    await service.prepare(request());
    await service.acceptEula(`ruby-${VERSION}`, accept);
    await service.start(request());
    await waitFor((status) => status.state === 'running');
    const pid = await stubPid();
    await service.shutdown();
    expect(service.isRunning()).toBe(false);
    await waitGone(pid);
  });

  it('kills a child that does not stop when the app quits', async () => {
    service = makeService({ mode: 'deaf', stopMs: 200 });
    await service.prepare(request());
    await service.acceptEula(`ruby-${VERSION}`, accept);
    await service.start(request());
    await waitFor((status) => status.state === 'running');
    const pid = await stubPid();
    await service.shutdown();
    await waitGone(pid);
  });

  it("holds the app's quit until the server has stopped, then quits", async () => {
    let running = true;
    let shutdowns = 0;
    let quits = 0;
    let killed = 0;
    const handlers = new Map<string, (event: { preventDefault(): void }) => void>();
    const exitHandlers: (() => void)[] = [];
    let release: () => void = () => {};
    registerLocalServerEvents(
      {
        onStatus: () => () => {},
        isRunning: () => running,
        shutdown: () =>
          new Promise<void>((resolve) => {
            shutdowns++;
            release = () => {
              running = false;
              resolve();
            };
          }),
        killNow: () => {
          killed++;
        },
      },
      {
        on: ((name: string, handler: (event: { preventDefault(): void }) => void) => {
          handlers.set(name, handler);
        }) as never,
        quit: () => {
          quits++;
          let prevented = false;
          handlers.get('before-quit')?.({ preventDefault: () => (prevented = true) });
          if (prevented) throw new Error('The quit was held again.');
        },
      },
      { on: ((_name: string, handler: () => void) => exitHandlers.push(handler)) as never },
    );
    let prevented = false;
    handlers.get('before-quit')?.({ preventDefault: () => (prevented = true) });
    expect(prevented).toBe(true);
    // A second quit while it stops waits for the same stop.
    handlers.get('before-quit')?.({ preventDefault: () => {} });
    expect(shutdowns).toBe(1);
    expect(quits).toBe(0);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(quits).toBe(1);
    for (const handler of exitHandlers) handler();
    expect(killed).toBe(1);
  });
});

describe('local server: safety', () => {
  it('leaves foreign server folders and files byte for byte the same (D5)', async () => {
    const servers = join(msmHome, 'servers');
    await mkdir(join(servers, `ruby-${VERSION}`), { recursive: true });
    await writeFile(join(servers, `ruby-${VERSION}`, 'notes.txt'), 'mine, not MSM');
    await mkdir(join(servers, 'paper-test', 'world'), { recursive: true });
    await writeFile(join(servers, 'paper-test', 'server.properties'), 'server-port=1\n');
    await writeFile(join(servers, 'readme.txt'), 'a file of the user');
    const before = await snapshot(servers);
    for (let round = 0; round < 2; round++) {
      await service.prepare(request());
      await service.acceptEula(`ruby-${VERSION}-2`, accept);
      await service.start(request());
      await waitFor((status) => status.state === 'running');
      await service.stop();
    }
    const after = await snapshot(servers);
    for (const [path, bytes] of before) expect(after.get(path)).toBe(bytes);
    // MSM's own server went beside the unmarked folder of the same name.
    expect((await service.status()).server?.folder).toBe(`ruby-${VERSION}-2`);
    for (const path of writes) {
      const inOwn = path.startsWith(normalize(join(servers, `ruby-${VERSION}-2`)) + sep);
      const inStaging = path.startsWith(normalize(join(servers, '.msm-staging')) + sep);
      const inCache = path.startsWith(normalize(cacheDir) + sep);
      expect(inOwn || inStaging || inCache).toBe(true);
    }
  });
});

describe('local server: helpers', () => {
  it('checks a port by listening on it', async () => {
    const { createServer } = await import('node:net');
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    expect(await isPortFreeNode(port)).toBe(false);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await isPortFreeNode(port)).toBe(true);
  });

  it("reads Java's places from the process environment", () => {
    expect(processJavaEnv({ JAVA_HOME: '/jdk', Path: 'C:\\bin', LOCALAPPDATA: 'C:\\L' })).toEqual({
      javaHome: '/jdk',
      path: 'C:\\bin',
      localAppData: 'C:\\L',
    });
  });

  it('checks status pushes without zod', () => {
    expect(
      isLocalServerStatusPayload({ state: 'running', label: 'x', logSeq: 1, addresses: [] }),
    ).toBe(true);
    expect(
      isLocalServerStatusPayload({ state: 'flying', label: 'x', logSeq: 1, addresses: [] }),
    ).toBe(false);
    expect(
      isLocalServerStatusPayload({ state: 'running', label: 'x', logSeq: -1, addresses: [] }),
    ).toBe(false);
  });
});
