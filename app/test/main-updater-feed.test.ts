/**
 * The updater end to end, off Windows (2026-11-14 audit): electron-updater's real `NsisUpdater`
 * behind MSM's `createUpdater`, reading a `generic` feed from a local HTTP server, so the feed
 * parsing, the version comparison, the download with its sha512 check and the NSIS installer
 * arguments run for real. Only the Windows-specific parts are stubbed: the Electron app (a
 * fake `AppAdapter`), Electron's `net` (Node's `http`), the installer spawn (recorded, not run)
 * and `require('electron').autoUpdater` (an event emitter). Also checks the packaging
 * configuration the updater depends on and the What's New-once rule.
 *
 * @packageDocumentation
 */

import { createHash, randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CloseChoice, createCloseGuard } from '../src/main/close-guard';
import { createNodePlatform } from '../src/main/platform/node-platform';
import { type AutoUpdaterLike, createUpdater } from '../src/main/updater';
import type { UpdateStatus } from '../src/shared/ipc-channels';

const appDir = join(import.meta.dirname, '..');
const repoDir = join(appDir, '..');
// electron-updater and its own dependencies, resolved the way the packaged app resolves them.
const updaterRequire = createRequire(createRequire(import.meta.url).resolve('electron-updater'));
const { NsisUpdater } = updaterRequire('electron-updater') as typeof import('electron-updater');
const yaml = updaterRequire('js-yaml') as { load(text: string): unknown };
const { ElectronHttpExecutor } = updaterRequire('./electronHttpExecutor') as {
  ElectronHttpExecutor: new (login: null) => object;
};

/**
 * electron-updater's own executor (its `download` with the sha512 check), with Node's `http`
 * in place of Electron's `net.request`.
 */
class NodeHttpExecutor extends ElectronHttpExecutor {
  constructor() {
    super(null);
  }

  createRequest(options: object, callback: (response: unknown) => void): unknown {
    return httpRequest(options, callback);
  }

  addRedirectHandlers(): void {
    // The local feed never redirects.
  }
}

/** `require('electron')` inside electron-updater: only `autoUpdater.emit` is used here. */
const fakeElectronAutoUpdater = new EventEmitter();
function installFakeElectron(): void {
  const path = updaterRequire.resolve('electron');
  updaterRequire.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports: { autoUpdater: fakeElectronAutoUpdater },
  } as unknown as NodeJS.Module;
}

const VERSION_INSTALLED = '1.5.1';
const installerName = (version: string) => `MCSuperMods-${version}-win-x64.exe`;
const sha512 = (bytes: Buffer) => createHash('sha512').update(bytes).digest('base64');

/** A `latest.yml` as electron-builder writes it for the NSIS target. */
function latestYml(version: string, bytes: Buffer, hash = sha512(bytes)): string {
  const name = installerName(version);
  return [
    `version: ${version}`,
    'files:',
    `  - url: ${name}`,
    `    sha512: ${hash}`,
    `    size: ${bytes.length}`,
    `path: ${name}`,
    `sha512: ${hash}`,
    "releaseDate: '2026-11-14T12:00:00.000Z'",
    '',
  ].join('\n');
}

let temp: string;
let server: Server;
let files: Map<string, Buffer | string>;
let baseUrl: string;

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-updater-feed-'));
  files = new Map();
  server = createServer((req, res) => {
    const name = decodeURIComponent((req.url ?? '/').split('?')[0]?.slice(1) ?? '');
    const body = files.get(name);
    if (body === undefined) {
      res.writeHead(404).end('Not Found');
      return;
    }
    res.writeHead(200, { 'content-length': Buffer.byteLength(body) }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  installFakeElectron();
});

afterEach(async () => {
  // Let electron-updater's `setImmediate` quit step run against the fake before removing it.
  await new Promise((resolve) => setImmediate(resolve));
  delete updaterRequire.cache[updaterRequire.resolve('electron')];
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(temp, { recursive: true, force: true });
});

/** A real `NsisUpdater` for an installed `version`, reading the local feed. */
async function realUpdater(version = VERSION_INSTALLED) {
  const configPath = join(temp, 'app-update.yml');
  await writeFile(
    configPath,
    `provider: generic\nurl: ${baseUrl}\nupdaterCacheDirName: mcsupermods-updater\n`,
  );
  const quits: number[] = [];
  const quitHandlers: ((exitCode: number) => void)[] = [];
  const app = {
    version,
    name: 'MCSuperMods',
    isPackaged: true,
    appUpdateConfigPath: configPath,
    userDataPath: join(temp, 'userData'),
    baseCachePath: join(temp, 'cache'),
    whenReady: async () => {},
    relaunch: () => {},
    quit: () => quits.push(Date.now()),
    onQuit: (handler: (exitCode: number) => void) => quitHandlers.push(handler),
  };
  const updater = new NsisUpdater(null, app);
  const internals = updater as unknown as {
    httpExecutor: object;
    _testOnlyOptions: object;
    spawnLog(cmd: string, args: string[]): Promise<boolean>;
  };
  internals.httpExecutor = new NodeHttpExecutor();
  // Windows as the platform; a full download (no earlier installer to diff against).
  internals._testOnlyOptions = { platform: 'win32', isUseDifferentialDownload: false };
  updater.logger = null;
  const spawned: { cmd: string; args: string[] }[] = [];
  internals.spawnLog = async (cmd, args) => {
    spawned.push({ cmd, args });
    return true;
  };
  return { updater, quits, quitHandlers, spawned };
}

function msmUpdater(load: () => Promise<AutoUpdaterLike>) {
  const sent: UpdateStatus[] = [];
  const updater = createUpdater({
    gate: { isPackaged: true, platform: 'win32', env: {} },
    load,
    autoCheckEnabled: async () => true,
    broadcast: (status) => sent.push(status),
    closeWindows: vi.fn(),
    notify: vi.fn(),
    log: vi.fn(),
    schedule: () => {},
  });
  return { updater, sent };
}

describe('electron-updater against a local feed (NsisUpdater, generic provider)', () => {
  it('finds a newer release, downloads it with the sha512 check and installs silently with relaunch', async () => {
    const bytes = randomBytes(64 * 1024);
    files.set('latest.yml', latestYml('1.5.2', bytes));
    files.set(installerName('1.5.2'), bytes);
    const real = await realUpdater();
    const { updater, sent } = msmUpdater(async () => real.updater as unknown as AutoUpdaterLike);

    expect(await updater.check()).toMatchObject({ state: 'available', version: '1.5.2' });
    await vi.waitFor(() =>
      expect(updater.status).toMatchObject({ state: 'downloaded', version: '1.5.2' }),
    );
    expect(sent.map((status) => status.state)).toContain('available');
    // The options MSM sets reached the real updater.
    expect(real.updater.autoDownload).toBe(true);
    expect(real.updater.autoInstallOnAppQuit).toBe(true);
    expect(real.updater.allowPrerelease).toBe(false);
    expect(real.updater.allowDowngrade).toBe(false);
    // The download added electron-updater's install-on-quit handler (ADR 0018, 2026-11-21).
    expect(real.quitHandlers).toHaveLength(1);

    await updater.install();
    expect(updater.finishInstall()).toBe('installing');
    // The downloaded installer runs silently and starts the app when done.
    expect(real.spawned).toHaveLength(1);
    expect(real.spawned[0]?.args).toEqual(['--updated', '/S', '--force-run']);
    expect(await readFile(real.spawned[0]?.cmd ?? '')).toEqual(bytes);
    // electron-updater then quits the app on the next tick.
    await vi.waitFor(() => expect(real.quits).toHaveLength(1));
    // That quit does not run the installer a second time.
    for (const handler of real.quitHandlers) handler(0);
    expect(real.spawned).toHaveLength(1);
  });

  it('never offers an older published release to a newer installed app (1.5.1 over 1.0.0)', async () => {
    const bytes = randomBytes(1024);
    files.set('latest.yml', latestYml('1.0.0', bytes));
    files.set(installerName('1.0.0'), bytes);
    const real = await realUpdater('1.5.1');
    const { updater } = msmUpdater(async () => real.updater as unknown as AutoUpdaterLike);
    expect(await updater.check()).toEqual({ state: 'not-available' });
    // The same version is not an update either.
    files.set('latest.yml', latestYml('1.5.1', bytes));
    const same = await realUpdater('1.5.1');
    const second = msmUpdater(async () => same.updater as unknown as AutoUpdaterLike);
    expect(await second.updater.check()).toEqual({ state: 'not-available' });
  });

  it('rejects a download whose sha512 does not match, as a quiet download error', async () => {
    const bytes = randomBytes(4096);
    files.set('latest.yml', latestYml('1.5.2', bytes, sha512(randomBytes(16))));
    files.set(installerName('1.5.2'), bytes);
    const real = await realUpdater();
    const { updater } = msmUpdater(async () => real.updater as unknown as AutoUpdaterLike);
    await updater.check();
    await vi.waitFor(() => expect(updater.status.state).toBe('error'));
    const status = updater.status;
    expect(status.state === 'error' && status.message).toMatch(/^Could not download the update\./);
    // Nothing to install.
    await updater.install();
    expect(updater.finishInstall()).toBe('none');
    expect(real.spawned).toEqual([]);
  });

  it('reports a missing installer (404) as a download error and a missing feed as no release', async () => {
    const bytes = randomBytes(1024);
    files.set('latest.yml', latestYml('1.5.2', bytes));
    const real = await realUpdater();
    const { updater } = msmUpdater(async () => real.updater as unknown as AutoUpdaterLike);
    await updater.check();
    await vi.waitFor(() => expect(updater.status.state).toBe('error'));
    files.clear();
    const empty = await realUpdater();
    const second = msmUpdater(async () => empty.updater as unknown as AutoUpdaterLike);
    const result = await second.updater.check();
    // The generic provider's 404 on latest.yml: no release to offer, never a crash.
    expect(['not-available', 'error']).toContain(result.state);
  });

  it('reports an unreachable server as the offline message', async () => {
    const real = await realUpdater();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { updater } = msmUpdater(async () => real.updater as unknown as AutoUpdaterLike);
    const result = await updater.check();
    expect(result.state).toBe('error');
    expect(result.state === 'error' && result.message).toMatch(/^Could not reach GitHub/);
  });
});

/**
 * One window behind MSM's close guard, with main's `window-all-closed` step: after the guard
 * lets the close through, `finishInstall` runs, and when no Restart to update was asked for the
 * app quits normally (the real updater's quit handlers run with `exitCode`).
 */
function guardedWindow(
  real: Awaited<ReturnType<typeof realUpdater>>,
  updater: ReturnType<typeof msmUpdater>['updater'],
  options: { dirty: boolean; choice: CloseChoice; saves?: boolean; exitCode?: number },
) {
  const closed: string[] = [];
  const confirm = vi.fn(async () => options.choice);
  const save = vi.fn(async () => options.saves ?? true);
  const onClose = createCloseGuard({
    isDirty: () => options.dirty,
    flush: async () => options.dirty,
    confirm,
    save,
    close() {
      closed.push('closed');
      if (updater.finishInstall() !== 'none') return;
      for (const handler of real.quitHandlers) handler(options.exitCode ?? 0);
    },
  });
  const close = async (): Promise<void> => {
    onClose({ preventDefault() {} });
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { closed, confirm, save, close };
}

/** A real updater that has downloaded 1.5.2 from the local feed. */
async function downloaded() {
  const bytes = randomBytes(8 * 1024);
  files.set('latest.yml', latestYml('1.5.2', bytes));
  files.set(installerName('1.5.2'), bytes);
  const real = await realUpdater();
  const { updater } = msmUpdater(async () => real.updater as unknown as AutoUpdaterLike);
  await updater.check();
  await vi.waitFor(() =>
    expect(updater.status).toMatchObject({ state: 'downloaded', version: '1.5.2' }),
  );
  return { real, updater, bytes };
}

describe('a downloaded update installs when the app closes (ADR 0018, 2026-11-21)', () => {
  it('installs silently on an ordinary close of a saved project, without starting the app', async () => {
    const { real, updater, bytes } = await downloaded();
    const window = guardedWindow(real, updater, { dirty: false, choice: 'cancel' });
    await window.close();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(window.closed).toEqual(['closed']);
    expect(real.spawned).toHaveLength(1);
    // Silent, and the app is not started again: the user closed it.
    expect(real.spawned[0]?.args).toEqual(['--updated', '/S']);
    expect(await readFile(real.spawned[0]?.cmd ?? '')).toEqual(bytes);
  });

  it('installs after Save in the unsaved-changes prompt', async () => {
    const { real, updater } = await downloaded();
    const window = guardedWindow(real, updater, { dirty: true, choice: 'save' });
    await window.close();
    expect(window.save).toHaveBeenCalledOnce();
    expect(window.closed).toEqual(['closed']);
    expect(real.spawned).toHaveLength(1);
  });

  it('installs after Discard changes in the unsaved-changes prompt', async () => {
    const { real, updater } = await downloaded();
    const window = guardedWindow(real, updater, { dirty: true, choice: 'discard' });
    await window.close();
    expect(window.closed).toEqual(['closed']);
    expect(real.spawned).toHaveLength(1);
  });

  it('installs nothing when the prompt is cancelled or the save fails, and the window stays open', async () => {
    const { real, updater } = await downloaded();
    const cancelled = guardedWindow(real, updater, { dirty: true, choice: 'cancel' });
    await cancelled.close();
    expect(cancelled.confirm).toHaveBeenCalledOnce();
    const failedSave = guardedWindow(real, updater, { dirty: true, choice: 'save', saves: false });
    await failedSave.close();
    expect(failedSave.save).toHaveBeenCalledOnce();
    expect(cancelled.closed).toEqual([]);
    expect(failedSave.closed).toEqual([]);
    expect(real.spawned).toEqual([]);
    // The update stays ready, and a later close after Discard changes installs it.
    expect(updater.status).toMatchObject({ state: 'downloaded', version: '1.5.2' });
    const later = guardedWindow(real, updater, { dirty: true, choice: 'discard' });
    await later.close();
    expect(real.spawned).toHaveLength(1);
  });

  it('installs nothing when the app quits with an error exit code', async () => {
    const { real, updater } = await downloaded();
    const window = guardedWindow(real, updater, { dirty: false, choice: 'cancel', exitCode: 1 });
    await window.close();
    expect(window.closed).toEqual(['closed']);
    expect(real.spawned).toEqual([]);
  });

  it('keeps Restart to update: installs once and starts the new version after the prompt', async () => {
    const { real, updater } = await downloaded();
    const window = guardedWindow(real, updater, { dirty: true, choice: 'discard' });
    await updater.install();
    await window.close();
    expect(window.closed).toEqual(['closed']);
    expect(real.spawned).toHaveLength(1);
    expect(real.spawned[0]?.args).toEqual(['--updated', '/S', '--force-run']);
    // electron-updater's own quit then skips the install-on-quit handler.
    await vi.waitFor(() => expect(real.quits).toHaveLength(1));
    for (const handler of real.quitHandlers) handler(0);
    expect(real.spawned).toHaveLength(1);
  });
});

describe('packaging the updater depends on', () => {
  it('publishes to MEZTKING/MCSuperMods on GitHub with a stable app id and no publisher name', async () => {
    const config = yaml.load(await readFile(join(appDir, 'electron-builder.yml'), 'utf8')) as {
      appId: string;
      productName: string;
      artifactName: string;
      win: { publish: Record<string, unknown>; signtoolOptions?: unknown };
      nsis: Record<string, unknown>;
    };
    expect(config.appId).toBe('dev.mcsupermods.app');
    expect(config.productName).toBe('MCSuperMods');
    expect(config.win.publish).toEqual({
      provider: 'github',
      owner: 'MEZTKING',
      repo: 'MCSuperMods',
      releaseType: 'draft',
    });
    // Unsigned: a stale publisher name would make every update fail its signature check.
    expect(config.win.publish.publisherName).toBeUndefined();
    expect(config.win.signtoolOptions).toBeUndefined();
    expect(config.nsis).toMatchObject({
      oneClick: false,
      perMachine: false,
      runAfterFinish: true,
      differentialPackage: true,
    });
    expect(config.artifactName).toBe(`\${productName}-\${version}-\${os}-\${arch}.\${ext}`);
  });

  it('uploads and checks the asset names latest.yml points at', async () => {
    const release = await readFile(join(repoDir, '.github/workflows/release.yml'), 'utf8');
    expect(release).toContain(`"app/dist/MCSuperMods-\${version}-win-x64.exe"`);
    expect(release).toContain(`"app/dist/MCSuperMods-\${version}-win-x64.exe.blockmap"`);
    expect(release).toContain('app/dist/latest.yml');
    expect(release).toContain('CSC_IDENTITY_AUTO_DISCOVERY: false');
    const publish = await readFile(join(repoDir, '.github/workflows/publish-release.yml'), 'utf8');
    expect(publish).toContain(`MCSuperMods-\${VERSION}-win-x64.exe`);
    expect(publish).toContain("grep -cx 'latest.yml'");
    expect(publish).toContain('make_latest=true');
  });
});

describe("What's new once after an update", () => {
  it("shows the Welcome on a fresh install, then What's new once per new version", async () => {
    const msmHome = join(temp, 'msm-home');
    const launch = (version: string) =>
      createNodePlatform({
        info: async () => ({ version, electron: '0', platform: 'test' }),
        dialogs: {
          pickDirectory: async () => null,
          confirmDiscard: async () => true,
          openFiles: async () => [],
          saveFilePath: async () => null,
        },
        showItemInFolder: () => {},
        resizePng: (png) => png,
        msmHome,
        installEnv: { platform: 'win32', home: join(temp, 'home') },
      }).app.launchNotice();
    // First launch after installing 1.5.1 from the .exe (the installer starts the app).
    expect(await launch('1.5.1')).toBe('welcome');
    expect(await launch('1.5.1')).toBeNull();
    // The relaunch after "Restart to update" to 1.5.2.
    expect(await launch('1.5.2')).toBe('whats-new');
    // Every later launch, and a renderer reload, shows nothing.
    expect(await launch('1.5.2')).toBeNull();
    expect(await launch('1.5.2')).toBeNull();
  });
});
