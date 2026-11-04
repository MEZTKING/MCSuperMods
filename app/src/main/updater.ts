/**
 * In-app auto-update (ADR 0018): electron-updater's `autoUpdater` with the GitHub provider,
 * behind a small injectable interface so the rules can be tested without Electron.
 *
 * Rules:
 * - Active only in the installed Windows app: `app.isPackaged`, `win32`, and not a smoke or
 *   end-to-end run (`MSM_SMOKE`, any `MSM_E2E_*`). Otherwise every status is `disabled`.
 * - electron-updater is loaded lazily, on the first check, so inactive runs never load it.
 * - A start-up check runs a few seconds after the window has loaded, when the
 *   `updates.autoCheck` setting is on. Manual checks (Help menu, command palette) always run.
 * - Updates download automatically; installing happens only when the user asks
 *   ({@link Updater.install}), after every window has closed through the unsaved-changes
 *   prompt. Nothing installs on an ordinary quit.
 * - Errors are logged and reported as an `error` status; they never throw out of the updater.
 *
 * @packageDocumentation
 */

import type { UpdateDisabledReason, UpdateStatus } from '../shared/ipc-channels';

/** The events of electron-updater's `autoUpdater` this module listens to. */
export type AutoUpdaterEvent =
  | 'checking-for-update'
  | 'update-available'
  | 'update-not-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'error';

/** The part of electron-updater's `AppUpdater` MSM uses. */
export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: AutoUpdaterEvent, listener: (payload: unknown) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

/** The facts that decide whether the updater may run. */
export interface UpdaterGate {
  isPackaged: boolean;
  platform: string;
  env: Readonly<Record<string, string | undefined>>;
}

/** Why the updater is inactive under `gate`, or `null` when it may run. */
export function updateDisabledReason(gate: UpdaterGate): UpdateDisabledReason | null {
  if (!gate.isPackaged) return 'not-packaged';
  if (gate.platform !== 'win32') return 'unsupported-platform';
  const testRun =
    (gate.env.MSM_SMOKE !== undefined && gate.env.MSM_SMOKE !== '') ||
    Object.entries(gate.env).some(
      ([key, value]) => key.startsWith('MSM_E2E_') && value !== undefined && value !== '',
    );
  return testRun ? 'test-run' : null;
}

/** What the updater needs from the host. */
export interface UpdaterDeps {
  gate: UpdaterGate;
  /** Loads and returns electron-updater's `autoUpdater` (a dynamic import in production). */
  load(): Promise<AutoUpdaterLike>;
  /** Whether the start-up check is enabled (`updates.autoCheck`). */
  autoCheckEnabled(): Promise<boolean>;
  /** Sends a status to every renderer. */
  broadcast(status: UpdateStatus): void;
  /** Starts closing every window; each goes through the unsaved-changes prompt. */
  closeWindows(): void;
  log(message: string, error?: unknown): void;
  /** Defaults to the global `setTimeout`. */
  schedule?(callback: () => void, delayMs: number): void;
}

/** The main-process updater. */
export interface Updater {
  /** The current status. */
  readonly status: UpdateStatus;
  /** Whether the user asked to install and the windows are closing. */
  readonly installRequested: boolean;
  /** Runs the start-up check after `delayMs`, when active and `updates.autoCheck` is on. */
  scheduleStartupCheck(delayMs?: number): void;
  /** Checks now; resolves to the status once the check has finished. Never rejects. */
  check(): Promise<UpdateStatus>;
  /**
   * Starts installing a downloaded update: closes every window through the unsaved-changes
   * prompt. Does nothing unless an update has been downloaded.
   */
  install(): Promise<void>;
  /**
   * Called once every window has closed. Runs the installer and quits when the user asked to
   * install; returns whether it did (otherwise the caller quits as usual).
   */
  finishInstall(): boolean;
}

/** The start-up check's default delay after the window has loaded. */
export const STARTUP_CHECK_DELAY_MS = 5_000;

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message;
  return typeof error === 'string' && error !== '' ? error : 'The update check failed.';
}

function versionOf(payload: unknown): string {
  if (typeof payload === 'object' && payload !== null) {
    const version = (payload as Record<string, unknown>).version;
    if (typeof version === 'string') return version;
  }
  return 'unknown';
}

function percentOf(payload: unknown): number {
  if (typeof payload === 'object' && payload !== null) {
    const percent = (payload as Record<string, unknown>).percent;
    if (typeof percent === 'number' && Number.isFinite(percent)) {
      return Math.min(100, Math.max(0, Math.round(percent)));
    }
  }
  return 0;
}

/** Maps one electron-updater event to an MSM status. */
export function statusForEvent(event: AutoUpdaterEvent, payload: unknown): UpdateStatus {
  switch (event) {
    case 'checking-for-update':
      return { state: 'checking' };
    case 'update-available':
      return { state: 'available', version: versionOf(payload) };
    case 'update-not-available':
      return { state: 'not-available' };
    case 'download-progress':
      return { state: 'downloading', percent: percentOf(payload) };
    case 'update-downloaded':
      return { state: 'downloaded', version: versionOf(payload) };
    case 'error':
      return { state: 'error', message: messageOf(payload) };
  }
}

const EVENTS: readonly AutoUpdaterEvent[] = [
  'checking-for-update',
  'update-available',
  'update-not-available',
  'download-progress',
  'update-downloaded',
  'error',
];

function sameStatus(a: UpdateStatus, b: UpdateStatus): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Creates the updater. It loads electron-updater only when a check runs while active. */
export function createUpdater(deps: UpdaterDeps): Updater {
  const disabled = updateDisabledReason(deps.gate);
  let status: UpdateStatus =
    disabled === null ? { state: 'idle' } : { state: 'disabled', reason: disabled };
  let loading: Promise<AutoUpdaterLike> | null = null;
  let loaded: AutoUpdaterLike | null = null;
  let installRequested = false;
  let running: Promise<UpdateStatus> | null = null;

  const setStatus = (next: UpdateStatus): void => {
    if (sameStatus(status, next)) return;
    status = next;
    deps.broadcast(next);
  };

  const ensureLoaded = (): Promise<AutoUpdaterLike> => {
    loading ??= deps.load().then((updater) => {
      // Download in the background; install only when the user asks (never on quit).
      updater.autoDownload = true;
      updater.autoInstallOnAppQuit = false;
      for (const event of EVENTS) {
        updater.on(event, (payload) => {
          if (event === 'error') deps.log('MSM updates: error.', payload);
          setStatus(statusForEvent(event, payload));
        });
      }
      loaded = updater;
      return updater;
    });
    return loading;
  };

  const runCheck = async (): Promise<UpdateStatus> => {
    setStatus({ state: 'checking' });
    try {
      const updater = await ensureLoaded();
      const result = await updater.checkForUpdates();
      // electron-updater resolves `null` when it considers itself inactive.
      if (status.state === 'checking') setStatus(result === null ? { state: 'idle' } : status);
    } catch (error) {
      deps.log('MSM updates: the check failed.', error);
      if (status.state !== 'error') setStatus({ state: 'error', message: messageOf(error) });
    }
    return status;
  };

  const check = async (): Promise<UpdateStatus> => {
    if (status.state === 'disabled') return status;
    // A download in progress or finished needs no new check.
    if (status.state === 'downloading' || status.state === 'downloaded') return status;
    if (running !== null) return running;
    running = runCheck().finally(() => {
      running = null;
    });
    return running;
  };

  return {
    get status() {
      return status;
    },
    get installRequested() {
      return installRequested;
    },
    scheduleStartupCheck(delayMs = STARTUP_CHECK_DELAY_MS) {
      if (status.state === 'disabled') {
        deps.log(`MSM updates: inactive (${status.reason}).`);
        return;
      }
      const schedule = deps.schedule ?? ((callback, ms) => void setTimeout(callback, ms));
      schedule(() => {
        void deps
          .autoCheckEnabled()
          .catch(() => true)
          .then((enabled) => (enabled ? check() : undefined));
      }, delayMs);
    },
    check,
    async install() {
      if (status.state !== 'downloaded' || loaded === null) return;
      installRequested = true;
      deps.closeWindows();
    },
    finishInstall() {
      if (!installRequested || loaded === null) return false;
      try {
        // Silent install, then start the new version.
        loaded.quitAndInstall(true, true);
        return true;
      } catch (error) {
        installRequested = false;
        deps.log('MSM updates: the installer could not start.', error);
        setStatus({ state: 'error', message: messageOf(error) });
        return false;
      }
    },
  };
}
