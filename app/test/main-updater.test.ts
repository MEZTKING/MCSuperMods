import { describe, expect, it, vi } from 'vitest';
import {
  type AutoUpdaterEvent,
  type AutoUpdaterLike,
  createUpdater,
  STARTUP_CHECK_DELAY_MS,
  statusForEvent,
  type UpdaterGate,
  updateDisabledReason,
} from '../src/main/updater';
import type { UpdateStatus } from '../src/shared/ipc-channels';

const windows: UpdaterGate = { isPackaged: true, platform: 'win32', env: {} };

/** A fake electron-updater: `checkForUpdates` plays the scripted events. */
class FakeAutoUpdater implements AutoUpdaterLike {
  autoDownload = false;
  autoInstallOnAppQuit = true;
  checks = 0;
  installs: [boolean | undefined, boolean | undefined][] = [];
  script: [AutoUpdaterEvent, unknown][] = [['update-not-available', { version: '0.1.0' }]];
  failWith: Error | null = null;
  readonly listeners = new Map<AutoUpdaterEvent, ((payload: unknown) => void)[]>();

  on(event: AutoUpdaterEvent, listener: (payload: unknown) => void): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  emit(event: AutoUpdaterEvent, payload?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }

  async checkForUpdates(): Promise<unknown> {
    this.checks += 1;
    this.emit('checking-for-update');
    if (this.failWith !== null) {
      this.emit('error', this.failWith);
      throw this.failWith;
    }
    for (const [event, payload] of this.script) this.emit(event, payload);
    return { isUpdateAvailable: this.script.some(([event]) => event === 'update-available') };
  }

  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void {
    this.installs.push([isSilent, isForceRunAfter]);
  }
}

function setup(options: { gate?: UpdaterGate; autoCheck?: boolean } = {}) {
  const fake = new FakeAutoUpdater();
  const sent: UpdateStatus[] = [];
  const scheduled: { callback: () => void; delayMs: number }[] = [];
  const deps = {
    gate: options.gate ?? windows,
    load: vi.fn(async () => fake),
    autoCheckEnabled: vi.fn(async () => options.autoCheck ?? true),
    broadcast: (status: UpdateStatus) => sent.push(status),
    closeWindows: vi.fn(),
    log: vi.fn(),
    schedule: (callback: () => void, delayMs: number) => scheduled.push({ callback, delayMs }),
  };
  const updater = createUpdater(deps);
  const runScheduled = async (): Promise<void> => {
    for (const { callback } of scheduled.splice(0)) callback();
    await vi.waitFor(() => expect(deps.autoCheckEnabled).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { fake, sent, scheduled, deps, updater, runScheduled };
}

describe('updateDisabledReason', () => {
  it('allows only the packaged Windows app outside test runs', () => {
    expect(updateDisabledReason(windows)).toBeNull();
    expect(updateDisabledReason({ ...windows, isPackaged: false })).toBe('not-packaged');
    expect(updateDisabledReason({ ...windows, platform: 'linux' })).toBe('unsupported-platform');
    expect(updateDisabledReason({ ...windows, platform: 'darwin' })).toBe('unsupported-platform');
    expect(updateDisabledReason({ ...windows, env: { MSM_SMOKE: '1' } })).toBe('test-run');
    expect(updateDisabledReason({ ...windows, env: { MSM_E2E_PROJECT_DIR: '/p' } })).toBe(
      'test-run',
    );
    expect(updateDisabledReason({ ...windows, env: { MSM_E2E_OUT_DIR: '' } })).toBeNull();
    expect(updateDisabledReason({ ...windows, env: { MSM_HOME: '/h' } })).toBeNull();
  });
});

describe('statusForEvent', () => {
  it('maps electron-updater events to statuses', () => {
    expect(statusForEvent('checking-for-update', undefined)).toEqual({ state: 'checking' });
    expect(statusForEvent('update-available', { version: '1.2.0' })).toEqual({
      state: 'available',
      version: '1.2.0',
    });
    expect(statusForEvent('update-not-available', {})).toEqual({ state: 'not-available' });
    expect(statusForEvent('download-progress', { percent: 41.6 })).toEqual({
      state: 'downloading',
      percent: 42,
    });
    expect(statusForEvent('download-progress', { percent: 180 })).toEqual({
      state: 'downloading',
      percent: 100,
    });
    expect(statusForEvent('update-downloaded', { version: '1.2.0' })).toEqual({
      state: 'downloaded',
      version: '1.2.0',
    });
    expect(statusForEvent('error', new Error('offline'))).toEqual({
      state: 'error',
      message: 'offline',
    });
    expect(statusForEvent('error', undefined)).toEqual({
      state: 'error',
      message: 'The update check failed.',
    });
  });
});

describe('createUpdater', () => {
  it('stays disabled off Windows, never loads electron-updater and never schedules', async () => {
    const { deps, updater, scheduled } = setup({ gate: { ...windows, platform: 'linux' } });
    expect(updater.status).toEqual({ state: 'disabled', reason: 'unsupported-platform' });
    updater.scheduleStartupCheck();
    expect(scheduled).toEqual([]);
    expect(deps.log).toHaveBeenCalledWith('MSM updates: inactive (unsupported-platform).');
    expect(await updater.check()).toEqual({ state: 'disabled', reason: 'unsupported-platform' });
    await updater.install();
    expect(updater.finishInstall()).toBe(false);
    expect(deps.load).not.toHaveBeenCalled();
    expect(deps.closeWindows).not.toHaveBeenCalled();
  });

  it('is disabled in smoke runs and when running from source', () => {
    expect(setup({ gate: { ...windows, env: { MSM_SMOKE: '1' } } }).updater.status).toEqual({
      state: 'disabled',
      reason: 'test-run',
    });
    expect(setup({ gate: { ...windows, isPackaged: false } }).updater.status).toEqual({
      state: 'disabled',
      reason: 'not-packaged',
    });
  });

  it('checks after the start-up delay when the setting is on, with download but no install on quit', async () => {
    const { fake, sent, scheduled, updater, runScheduled } = setup();
    updater.scheduleStartupCheck();
    expect(scheduled.map((entry) => entry.delayMs)).toEqual([STARTUP_CHECK_DELAY_MS]);
    expect(fake.checks).toBe(0);
    await runScheduled();
    await vi.waitFor(() => expect(fake.checks).toBe(1));
    expect(fake.autoDownload).toBe(true);
    expect(fake.autoInstallOnAppQuit).toBe(false);
    await vi.waitFor(() => expect(updater.status).toEqual({ state: 'not-available' }));
    expect(sent).toEqual([{ state: 'checking' }, { state: 'not-available' }]);
  });

  it('skips the start-up check when the setting is off, but still checks manually', async () => {
    const { fake, deps, updater, runScheduled } = setup({ autoCheck: false });
    updater.scheduleStartupCheck(10);
    await runScheduled();
    expect(fake.checks).toBe(0);
    expect(deps.load).not.toHaveBeenCalled();
    expect(await updater.check()).toEqual({ state: 'not-available' });
    expect(fake.checks).toBe(1);
  });

  it('reports download progress and the downloaded version, and installs only on request', async () => {
    const { fake, sent, deps, updater } = setup();
    fake.script = [
      ['update-available', { version: '0.2.0' }],
      ['download-progress', { percent: 10.2 }],
      ['download-progress', { percent: 10.4 }],
      ['download-progress', { percent: 75 }],
      ['update-downloaded', { version: '0.2.0' }],
    ];
    expect(updater.finishInstall()).toBe(false);
    expect(await updater.check()).toEqual({ state: 'downloaded', version: '0.2.0' });
    expect(sent).toEqual([
      { state: 'checking' },
      { state: 'available', version: '0.2.0' },
      { state: 'downloading', percent: 10 },
      { state: 'downloading', percent: 75 },
      { state: 'downloaded', version: '0.2.0' },
    ]);
    // Downloaded, but nothing installs until the user asks.
    expect(fake.installs).toEqual([]);
    expect(updater.finishInstall()).toBe(false);
    // A further check is not needed once downloaded.
    expect(await updater.check()).toEqual({ state: 'downloaded', version: '0.2.0' });
    expect(fake.checks).toBe(1);

    await updater.install();
    expect(updater.installRequested).toBe(true);
    expect(deps.closeWindows).toHaveBeenCalledOnce();
    expect(fake.installs).toEqual([]);
    // Every window has closed (through the unsaved-changes prompt): now it installs.
    expect(updater.finishInstall()).toBe(true);
    expect(fake.installs).toEqual([[true, true]]);
  });

  it('ignores install requests before a download has finished', async () => {
    const { fake, deps, updater } = setup();
    await updater.install();
    await updater.check();
    await updater.install();
    expect(deps.closeWindows).not.toHaveBeenCalled();
    expect(updater.finishInstall()).toBe(false);
    expect(fake.installs).toEqual([]);
  });

  it('logs errors and reports them without throwing', async () => {
    const { fake, deps, updater, sent } = setup();
    fake.failWith = new Error('net::ERR_INTERNET_DISCONNECTED');
    expect(await updater.check()).toEqual({
      state: 'error',
      message: 'net::ERR_INTERNET_DISCONNECTED',
    });
    expect(deps.log).toHaveBeenCalled();
    expect(sent.at(-1)).toEqual({ state: 'error', message: 'net::ERR_INTERNET_DISCONNECTED' });
    // A later check can succeed.
    fake.failWith = null;
    expect(await updater.check()).toEqual({ state: 'not-available' });
  });

  it('reports a failure to load electron-updater as an error', async () => {
    const { deps, updater } = setup();
    deps.load.mockRejectedValueOnce(new Error('missing app-update.yml'));
    expect(await updater.check()).toEqual({ state: 'error', message: 'missing app-update.yml' });
  });

  it('shares one check between concurrent requests', async () => {
    const { fake, updater } = setup();
    const [a, b] = await Promise.all([updater.check(), updater.check()]);
    expect(a).toEqual(b);
    expect(fake.checks).toBe(1);
  });

  it('reports a failure to start the installer', async () => {
    const { fake, updater } = setup();
    fake.script = [['update-downloaded', { version: '0.2.0' }]];
    await updater.check();
    fake.quitAndInstall = () => {
      throw new Error('spawn EPERM');
    };
    await updater.install();
    expect(updater.finishInstall()).toBe(false);
    expect(updater.status).toEqual({ state: 'error', message: 'spawn EPERM' });
    expect(updater.installRequested).toBe(false);
  });
});
