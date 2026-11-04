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
 * - Errors never throw out of the updater. Each is classified ({@link classifyUpdateError}):
 *   "no published release" (for example only a draft exists) becomes `not-available`, network
 *   failures and everything else become an `error` status with a short, sanitised message.
 *   The full error (which can carry HTTP headers, cookies and feed XML) goes only to the log.
 *
 * @packageDocumentation
 */

import {
  UPDATE_STATUS_MESSAGE_MAX,
  type UpdateDisabledReason,
  type UpdateStatus,
} from '../shared/ipc-channels';

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

/** The message shown when GitHub could not be reached. */
export const UPDATE_OFFLINE_MESSAGE =
  'Could not reach GitHub to check for updates. Check your internet connection and try again.';
/** The start of the message shown for any other failed check. */
export const UPDATE_FAILED_MESSAGE = 'Could not check for updates.';
/** The longest `error` message the updater builds from an unknown error. */
export const UPDATE_REASON_MAX = 160;

/**
 * electron-updater 6.8.11 error codes that mean "no published release to update to" (GitHub
 * provider): the `/releases/latest` lookup failed (also when only a draft exists), the feed
 * has no published entry, or the release has no `latest.yml`.
 */
const NO_RELEASE_CODES: ReadonlySet<string> = new Set([
  'ERR_UPDATER_LATEST_VERSION_NOT_FOUND',
  'ERR_UPDATER_NO_PUBLISHED_VERSIONS',
  'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND',
]);
const NO_RELEASE_MESSAGE =
  /Unable to find latest version on GitHub|No published versions on GitHub|please ensure a production release exists|Cannot find latest\.yml/i;
/** Node and Chromium network failure codes. */
const NETWORK_CODES: ReadonlySet<string> = new Set([
  'ENOTFOUND',
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'EAI_AGAIN',
  'ENETUNREACH',
  'ENETDOWN',
  'EHOSTUNREACH',
]);
const NETWORK_MESSAGE =
  /net::ERR_[A-Z_]+|\b(?:ENOTFOUND|ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|ESOCKETTIMEDOUT|EAI_AGAIN|ENETUNREACH|ENETDOWN|EHOSTUNREACH)\b/;

/** How an updater error is reported. */
export type UpdateErrorClass =
  | { kind: 'no-release' }
  | { kind: 'network'; message: string }
  | { kind: 'other'; message: string };

function rawMessageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

function codeOf(error: unknown): string | null {
  if (typeof error === 'object' && error !== null) {
    const code = (error as Record<string, unknown>).code;
    if (typeof code === 'string') return code;
  }
  return null;
}

function statusCodeOf(error: unknown): number | null {
  if (typeof error === 'object' && error !== null) {
    const statusCode = (error as Record<string, unknown>).statusCode;
    if (typeof statusCode === 'number') return statusCode;
  }
  const code = codeOf(error);
  const match = code === null ? null : /^HTTP_ERROR_(\d{3})$/.exec(code);
  return match === null ? null : Number(match[1]);
}

/**
 * A short reason safe to show: the first line only, cut before headers, cookies, markup and
 * stack frames, tokens redacted, at most `max` characters. Empty when nothing useful is left.
 */
export function sanitiseUpdateReason(raw: string, max = UPDATE_REASON_MAX): string {
  let text = raw.split(/\r?\n/, 1)[0] ?? '';
  const first = text;
  for (const marker of [/Headers:/i, /set-cookie/i, /<[?!a-z]/i, /\s+at\s+\S+\s*\(/, /\{/]) {
    const index = first.search(marker);
    if (index >= 0 && index < text.length) text = text.slice(0, index);
  }
  text = text
    .replace(/\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g, '[redacted]')
    .replace(/\b(Bearer|token)\s+\S+/gi, '$1 [redacted]')
    .replace(
      /([?&](?:token|access_token|sig|signature|X-Amz-[A-Za-z-]+)=)[^&\s]+/gi,
      '$1[redacted]',
    )
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s:,;(-]+$/, '');
  if (text.length > max) text = `${text.slice(0, max - 1).trimEnd()}\u2026`;
  return text;
}

/**
 * Classifies an electron-updater error. Network failures come first because electron-updater
 * wraps them in its own codes (`ERR_UPDATER_LATEST_VERSION_NOT_FOUND` includes the cause).
 */
export function classifyUpdateError(error: unknown): UpdateErrorClass {
  const code = codeOf(error);
  const raw = rawMessageOf(error);
  if ((code !== null && NETWORK_CODES.has(code)) || NETWORK_MESSAGE.test(raw)) {
    return { kind: 'network', message: UPDATE_OFFLINE_MESSAGE };
  }
  if (code !== null && NO_RELEASE_CODES.has(code)) return { kind: 'no-release' };
  if (code === 'ERR_XML_MISSED_ELEMENT' && NO_RELEASE_MESSAGE.test(raw)) {
    return { kind: 'no-release' };
  }
  const status = statusCodeOf(error);
  // 404 or 406 from the releases feed or `/releases/latest` (not an installer download).
  if ((status === 404 || status === 406) && !/\/releases\/download\/(?!.*latest\.yml)/.test(raw)) {
    return { kind: 'no-release' };
  }
  if (NO_RELEASE_MESSAGE.test(raw)) return { kind: 'no-release' };
  return { kind: 'other', message: failureMessage(UPDATE_FAILED_MESSAGE, raw) };
}

/** `lead` plus a sanitised reason, within {@link UPDATE_REASON_MAX} characters overall. */
function failureMessage(lead: string, raw: string): string {
  const reason = sanitiseUpdateReason(raw, UPDATE_REASON_MAX - lead.length - 1);
  return reason === '' ? lead : `${lead} ${reason}`;
}

/** The status an updater error becomes. */
export function statusForError(error: unknown): UpdateStatus {
  const classified = classifyUpdateError(error);
  return classified.kind === 'no-release'
    ? { state: 'not-available' }
    : { state: 'error', message: classified.message };
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
      return statusForError(payload);
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

  const setStatus = (proposed: UpdateStatus): void => {
    // Belt and braces: nothing long may cross IPC.
    const next: UpdateStatus =
      proposed.state === 'error' && proposed.message.length > UPDATE_STATUS_MESSAGE_MAX
        ? { state: 'error', message: proposed.message.slice(0, UPDATE_STATUS_MESSAGE_MAX) }
        : proposed;
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
      // The `error` event usually reported it already; the same status is not sent twice.
      setStatus(statusForError(error));
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
        setStatus({
          state: 'error',
          message: failureMessage('Could not start the update installer.', rawMessageOf(error)),
        });
        return false;
      }
    },
  };
}
