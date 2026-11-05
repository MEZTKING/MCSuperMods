import { describe, expect, it, vi } from 'vitest';
import {
  type AutoUpdaterEvent,
  type AutoUpdaterLike,
  classifyUpdateError,
  createUpdater,
  STARTUP_CHECK_DELAY_MS,
  sanitiseUpdateReason,
  statusForEvent,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_OFFLINE_MESSAGE,
  UPDATE_REASON_MAX,
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
    notify: vi.fn(),
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
    expect(statusForEvent('update-not-available', {})).not.toHaveProperty('reason');
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
    expect(statusForEvent('error', new Error('disk full'))).toEqual({
      state: 'error',
      message: 'Could not check for updates. disk full',
    });
    expect(statusForEvent('error', undefined)).toEqual({
      state: 'error',
      message: 'Could not check for updates.',
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
    // And again every six hours.
    await vi.waitFor(() =>
      expect(scheduled.map((entry) => entry.delayMs)).toEqual([UPDATE_CHECK_INTERVAL_MS]),
    );
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
      { state: 'downloading', percent: 10, version: '0.2.0' },
      { state: 'downloading', percent: 75, version: '0.2.0' },
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
    const offline = { state: 'error', message: UPDATE_OFFLINE_MESSAGE };
    expect(await updater.check()).toEqual(offline);
    expect(deps.log).toHaveBeenCalled();
    expect(sent.at(-1)).toEqual(offline);
    // A later check can succeed.
    fake.failWith = null;
    expect(await updater.check()).toEqual({ state: 'not-available' });
  });

  it('reports a failure to load electron-updater as an error', async () => {
    const { deps, updater } = setup();
    deps.load.mockRejectedValueOnce(new Error('missing app-update.yml'));
    expect(await updater.check()).toEqual({
      state: 'error',
      message: 'Could not check for updates. missing app-update.yml',
    });
  });

  it('shares one check between concurrent requests', async () => {
    const { fake, updater } = setup();
    const [a, b] = await Promise.all([updater.check(), updater.check()]);
    expect(a).toEqual(b);
    expect(fake.checks).toBe(1);
  });

  // B145 root cause: only one check ran, a few seconds after start-up. A release published
  // later (the usual case: drafts are published by hand while the app is open) was found only
  // by Help > Check for Updates. The fix checks again every six hours, without a click.
  it('finds a release published after start-up without a manual check (B145)', async () => {
    const { fake, sent, scheduled, deps, updater } = setup();
    // At start-up only a draft exists, which the updater cannot see.
    fake.failWith = updaterError(
      'Unable to find latest version on GitHub',
      'ERR_UPDATER_LATEST_VERSION_NOT_FOUND',
    );
    updater.scheduleStartupCheck();
    const runTick = async (): Promise<void> => {
      const tick = scheduled.shift();
      if (tick === undefined) throw new Error('No check was scheduled.');
      tick.callback();
      await vi.waitFor(() => expect(scheduled).toHaveLength(1));
    };
    await runTick();
    expect(updater.status).toEqual({ state: 'not-available', reason: 'no-published-release' });
    // The next automatic check is six hours later.
    expect(scheduled.map((entry) => entry.delayMs)).toEqual([UPDATE_CHECK_INTERVAL_MS]);
    // The maintainer publishes the release meanwhile.
    fake.failWith = null;
    fake.script = [
      [
        'update-available',
        { version: '0.7.0', releaseNotes: '<h3>Added</h3><ul><li>Things</li></ul>' },
      ],
      ['download-progress', { percent: 50 }],
      ['update-downloaded', { version: '0.7.0' }],
    ];
    await runTick();
    expect(fake.checks).toBe(2);
    const notes = '### Added\n\n- Things';
    expect(sent).toContainEqual({ state: 'available', version: '0.7.0', notes });
    expect(sent).toContainEqual({ state: 'downloading', percent: 50, version: '0.7.0' });
    // The feed's notes carry over to `downloaded` for the banner's What's new.
    expect(updater.status).toEqual({ state: 'downloaded', version: '0.7.0', notes });
    expect(deps.notify).toHaveBeenCalledExactlyOnceWith('0.7.0');
    // Later ticks do not check again (or notify again) once downloaded.
    await runTick();
    expect(fake.checks).toBe(2);
    expect(deps.notify).toHaveBeenCalledOnce();
    // Background errors never reached the banner as anything but statuses it ignores.
    expect(sent.filter((status) => status.state === 'error')).toEqual([]);
  });

  it('reads the setting at every automatic tick', async () => {
    let enabled = false;
    const { fake, scheduled, deps, updater } = setup();
    deps.autoCheckEnabled.mockImplementation(async () => enabled);
    updater.scheduleStartupCheck(1, 2);
    const runTick = async (): Promise<void> => {
      scheduled.shift()?.callback();
      await vi.waitFor(() => expect(scheduled).toHaveLength(1));
    };
    await runTick();
    expect(fake.checks).toBe(0);
    expect(scheduled[0]?.delayMs).toBe(2);
    enabled = true;
    await runTick();
    expect(fake.checks).toBe(1);
  });

  it('does not start a check while an update is available but not yet downloading', async () => {
    const { fake, updater } = setup();
    fake.script = [['update-available', { version: '0.7.0' }]];
    expect(await updater.check()).toEqual({ state: 'available', version: '0.7.0' });
    expect(await updater.check()).toEqual({ state: 'available', version: '0.7.0' });
    expect(fake.checks).toBe(1);
  });

  it('keeps notifying failures out of the way', async () => {
    const { fake, deps, updater } = setup();
    deps.notify.mockImplementation(() => {
      throw new Error('notifications blocked');
    });
    fake.script = [['update-downloaded', { version: '0.7.0' }]];
    expect(await updater.check()).toEqual({ state: 'downloaded', version: '0.7.0' });
    expect(deps.log).toHaveBeenCalledWith(
      'MSM updates: the notification failed.',
      expect.any(Error),
    );
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
    expect(updater.status).toEqual({
      state: 'error',
      message: 'Could not start the update installer. spawn EPERM',
    });
    expect(updater.installRequested).toBe(false);
  });
});

/** An error shaped like electron-updater's `newError(message, code)`. */
function updaterError(message: string, code?: string, statusCode?: number): Error {
  const error = new Error(message) as Error & { code?: string; statusCode?: number };
  if (code !== undefined) error.code = code;
  if (statusCode !== undefined) error.statusCode = statusCode;
  return error;
}

/** The kind of HttpError text builder-util-runtime builds: status, then headers, then more. */
const HEADERS =
  'Headers: {\n  "set-cookie": [\n    "_gh_sess=abc123secret; path=/; secure; HttpOnly",\n' +
  '    "_octo=GH1.1.1234; Path=/", "logged_in=no; Path=/"\n  ],\n  "server": "github.com"\n}';
const FEED =
  '<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">' +
  '<id>tag:github.com,2008:https://github.com/MEZTKING/MCSuperMods/releases</id></feed>';
const STACK =
  'HttpError: 406 Not Acceptable\n    at createHttpError (C:\\app\\resources\\app.asar\\out\\main\\x.js:1:1)\n' +
  '    at ClientRequest.<anonymous> (C:\\app\\x.js:2:2)';

describe('classifyUpdateError', () => {
  it('treats "no published release" (draft only, 404/406, no latest.yml) as not-available', () => {
    const latest = updaterError(
      'Unable to find latest version on GitHub (https://github.com/MEZTKING/MCSuperMods/releases/latest), ' +
        `please ensure a production release exists: ${STACK}\n${HEADERS}\n${FEED}`,
      'ERR_UPDATER_LATEST_VERSION_NOT_FOUND',
    );
    expect(classifyUpdateError(latest)).toEqual({ kind: 'no-release' });
    expect(statusForEvent('error', latest)).toEqual({
      state: 'not-available',
      reason: 'no-published-release',
    });
    for (const error of [
      updaterError('No published versions on GitHub', 'ERR_UPDATER_NO_PUBLISHED_VERSIONS'),
      updaterError('No published versions on GitHub', 'ERR_XML_MISSED_ELEMENT'),
      updaterError(
        'Cannot find latest.yml in the latest release artifacts (https://github.com/x/y/releases/download/v0.1.0/latest.yml): HttpError: 404',
        'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND',
      ),
      updaterError(`404 Not Found\n${HEADERS}`, 'HTTP_ERROR_404', 404),
      updaterError(`406 Not Acceptable\n${HEADERS}\n${FEED}`, 'HTTP_ERROR_406', 406),
      // Matched on the message when the code is missing.
      updaterError(
        'Unable to find latest version on GitHub (https://github.com/x/y/releases/latest)',
      ),
    ]) {
      expect(classifyUpdateError(error)).toEqual({ kind: 'no-release' });
      expect(statusForEvent('error', error)).toEqual({
        state: 'not-available',
        reason: 'no-published-release',
      });
    }
  });

  it('reports network failures with a friendly message, even when electron-updater wraps them', () => {
    for (const error of [
      updaterError('getaddrinfo ENOTFOUND github.com', 'ENOTFOUND'),
      updaterError('socket hang up', 'ECONNRESET'),
      updaterError('connect ETIMEDOUT 140.82.121.4:443', 'ETIMEDOUT'),
      updaterError('getaddrinfo EAI_AGAIN github.com', 'EAI_AGAIN'),
      updaterError('net::ERR_NAME_NOT_RESOLVED'),
      updaterError(
        'Unable to find latest version on GitHub (https://github.com/x/y/releases/latest), please ensure a production release exists: Error: net::ERR_INTERNET_DISCONNECTED',
        'ERR_UPDATER_LATEST_VERSION_NOT_FOUND',
      ),
    ]) {
      expect(classifyUpdateError(error)).toEqual({
        kind: 'network',
        message: UPDATE_OFFLINE_MESSAGE,
      });
    }
  });

  it('sanitises anything else to a short first line without headers, cookies, XML or stack', () => {
    const error = updaterError(
      `500 Internal Server Error ${'x'.repeat(400)}\n${HEADERS}\n${FEED}\n${STACK}`,
      'HTTP_ERROR_500',
      500,
    );
    const status = statusForEvent('error', error);
    expect(status.state).toBe('error');
    const message = status.state === 'error' ? status.message : '';
    expect(message.startsWith('Could not check for updates. 500 Internal Server Error')).toBe(true);
    expect(message.length).toBeLessThanOrEqual(UPDATE_REASON_MAX);
    for (const banned of ['set-cookie', '_gh_sess', 'Headers', '<?xml', '<feed', ' at ', '\n']) {
      expect(message).not.toContain(banned);
    }
    const inline = statusForEvent(
      'error',
      updaterError(
        `Cannot parse releases feed: Bad thing Headers: {"set-cookie": "_octo=1"} <?xml`,
      ),
    );
    expect(inline).toEqual({
      state: 'error',
      message: 'Cannot parse releases feed: Bad thing'.replace(
        /^/,
        'Could not check for updates. ',
      ),
    });
  });

  it('redacts tokens and stops at stack frames', () => {
    expect(sanitiseUpdateReason('Bad credentials token ghp_abcDEF123 for Bearer abc.def')).toBe(
      'Bad credentials token [redacted] for Bearer [redacted]',
    );
    expect(sanitiseUpdateReason('Error: boom    at Object.<anonymous> (x.js:1:1)')).toBe(
      'Error: boom',
    );
    expect(sanitiseUpdateReason('a'.repeat(500)).length).toBe(UPDATE_REASON_MAX);
  });

  it('logs the full error but sends only the short message over IPC', async () => {
    const { fake, deps, updater, sent } = setup();
    const full = `500 Internal Server Error\n${HEADERS}\n${FEED}`;
    fake.failWith = updaterError(full, 'HTTP_ERROR_500', 500);
    const status = await updater.check();
    expect(status).toEqual({
      state: 'error',
      message: 'Could not check for updates. 500 Internal Server Error',
    });
    expect(deps.log).toHaveBeenCalledWith(expect.any(String), fake.failWith);
    const logged = deps.log.mock.calls.map((call) => (call as unknown[])[1]);
    expect(logged.some((error) => error instanceof Error && error.message === full)).toBe(true);
    expect(JSON.stringify(sent)).not.toMatch(/set-cookie|_gh_sess|<\?xml/);
  });

  it('reports a draft-only repository as having no published release', async () => {
    const { fake, updater, sent } = setup();
    fake.failWith = updaterError(
      `Unable to find latest version on GitHub (https://github.com/MEZTKING/MCSuperMods/releases/latest), please ensure a production release exists: HttpError: 406 Not Acceptable\n${HEADERS}\n${FEED}`,
      'ERR_UPDATER_LATEST_VERSION_NOT_FOUND',
    );
    expect(await updater.check()).toEqual({
      state: 'not-available',
      reason: 'no-published-release',
    });
    expect(sent.some((status) => status.state === 'error')).toBe(false);
  });
});
