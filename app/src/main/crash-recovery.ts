/**
 * When the window's page stops (B870, after B840's S4): a plugin worker that fills its memory
 * takes the whole page down with it (`render-process-gone`), and before this the user was left
 * with an empty window. Main now reloads the page, and the reloaded page says, in plain words,
 * that MCSuperMods started its window again, which third-party plugins were running, and that
 * changes not yet saved could not be kept (the page's memory is gone; nothing can save it).
 *
 * If the page stops again within {@link CRASH_REPEAT_WINDOW_MS} of the last time, the next
 * reload runs with every third-party plugin off for the rest of this run (a simple safe mode;
 * the full one, with its marks across starts, is B843). If it stops yet again so soon with
 * plugins already off, main stops reloading and asks.
 *
 * {@link createCrashRecovery} is the state, without Electron; {@link withCrashRecovery} wraps
 * the plugins service so it knows which plugins were started and can turn them off.
 *
 * @packageDocumentation
 */

import type { Problem } from '@msm/plugin-api';
import type { ExternalPluginEntry } from '../shared/platform';
import { PLUGIN_OFF_FOR_THIS_RUN, type RecoveryNotice } from '../shared/recovery-notice';
import type { PluginsService } from './platform/plugins';

/** How soon a second stop counts as "again" (two minutes). */
export const CRASH_REPEAT_WINDOW_MS = 120_000;

/** What main does after the page stopped. */
export type CrashAction = 'reload' | 'ask' | 'ignore';

/** The crash state of one run of the app. */
export interface CrashRecovery {
  /** A third-party plugin's files were handed to the page: it is starting. */
  noteStarted(name: string): void;
  /** Whether third-party plugins are off for the rest of this run. */
  pluginsOff(): boolean;
  /**
   * The page stopped with Electron's `reason`: `'reload'` it, `'ask'` the user (it stopped
   * again so soon with plugins already off), or `'ignore'` (a clean exit).
   */
  onGone(reason: string): CrashAction;
  /** The notice for the reloaded page, once; `null` when there is none. */
  takeNotice(): RecoveryNotice | null;
}

/**
 * The crash state.
 *
 * @param now - The clock (milliseconds).
 * @param repeatWindowMs - How soon a second stop counts as "again".
 */
export function createCrashRecovery(
  now: () => number = Date.now,
  repeatWindowMs = CRASH_REPEAT_WINDOW_MS,
): CrashRecovery {
  const running = new Set<string>();
  let off = false;
  let lastGone: number | null = null;
  let notice: RecoveryNotice | null = null;
  return {
    noteStarted(name) {
      running.add(name);
    },
    pluginsOff: () => off,
    onGone(reason) {
      if (reason === 'clean-exit') return 'ignore';
      const at = now();
      const again = lastGone !== null && at - lastGone < repeatWindowMs;
      lastGone = at;
      const plugins = [...running].sort((a, b) => a.localeCompare(b));
      running.clear();
      if (again && off) {
        notice = { plugins, pluginsOff: true };
        return 'ask';
      }
      if (again) off = true;
      notice = { plugins, pluginsOff: off };
      return 'reload';
    },
    takeNotice() {
      const taken = notice;
      notice = null;
      return taken;
    },
  };
}

/** The plugins service with the crash state's notice (what main serves over IPC). */
export interface RecoveringPlugins
  extends Pick<PluginsService, 'dir' | 'list' | 'read' | 'openFolder'> {
  recoveryNotice(): RecoveryNotice | null;
}

/**
 * Wraps the plugins service: `read` notes each plugin the page starts; while plugins are off
 * for this run, `list` shows every usable plugin as turned off (so the page starts none, and
 * Settings > Plugins says why) and `read` refuses.
 *
 * @param plugins - The plugins service.
 * @param recovery - The crash state.
 */
export function withCrashRecovery(
  plugins: PluginsService,
  recovery: CrashRecovery,
): RecoveringPlugins {
  const offProblem: Problem = {
    severity: 'error',
    code: PLUGIN_OFF_FOR_THIS_RUN,
    message:
      'Turned off for now: MCSuperMods had to start its window again twice in a short time. ' +
      'Plugins come back on the next time you start MCSuperMods.',
  };
  return {
    dir: plugins.dir,
    async list(): Promise<ExternalPluginEntry[]> {
      const entries = await plugins.list();
      if (!recovery.pluginsOff()) return entries;
      return entries.map((entry) =>
        entry.manifest === null ? entry : { ...entry, manifest: null, problems: [offProblem] },
      );
    },
    async read(id) {
      if (recovery.pluginsOff())
        throw new Error(`${PLUGIN_OFF_FOR_THIS_RUN}: ${offProblem.message}`);
      const bundle = await plugins.read(id);
      recovery.noteStarted(bundle.manifest.name);
      return bundle;
    },
    openFolder: () => plugins.openFolder(),
    recoveryNotice: () => recovery.takeNotice(),
  };
}
