/**
 * The newer-Minecraft notice's state (ADR 0136 D5, B817): when a mod is open and a newer target
 * is announced ({@link newerTargetFor}), the session's dry run (`session.upgradeReport`) runs
 * once when the app is idle after the first paint, and again, when idle, after each edit, so the
 * counts follow the mod. A run an edit cancelled (`DryRunCancelled`) is asked for again when
 * idle. While the first run is going nothing shows; the counts of an older run stay until the
 * new one is in. **Not now** is remembered per mod and target in `.msm/upgrade-notice.json`.
 *
 * @packageDocumentation
 */

import type { UpgradeReport } from '@msm/core';
import type { TargetFacts } from '@msm/plugin-api';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type NoticeFileSystem, newerTargetFor, readNotNow, rememberNotNow } from './notice';

/** The part of the session the notice asks. */
export interface NoticeSession {
  upgradeReport(
    targetId: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ readonly report: Pick<UpgradeReport, 'done' | 'todo'> }>;
}

/** What the notice shows. */
export type UpgradeNoticeState =
  /** No mod, or no newer target to tell about. */
  | { readonly status: 'none' }
  /** The first dry run is going: nothing shows yet. */
  | { readonly status: 'checking'; readonly newer: TargetFacts }
  /** The dry run is in: what changes by itself and what needs the user. */
  | {
      readonly status: 'ready';
      readonly newer: TargetFacts;
      readonly done: number;
      readonly todo: number;
      readonly dismissed: boolean;
    }
  /** The dry run could not finish. */
  | {
      readonly status: 'failed';
      readonly newer: TargetFacts;
      readonly message: string;
      readonly dismissed: boolean;
    };

/** Runs `run` once the app is idle; returns a cancel. */
export type WhenIdle = (run: () => void) => () => void;

/** After a short pause (so a run of edits asks once), then when the browser is idle. */
export const whenIdle: WhenIdle = (run) => {
  let idle: number | undefined;
  const timer = setTimeout(() => {
    if (typeof globalThis.requestIdleCallback === 'function') {
      idle = globalThis.requestIdleCallback(run, { timeout: 2000 });
    } else run();
  }, 400);
  return () => {
    clearTimeout(timer);
    if (idle !== undefined && typeof globalThis.cancelIdleCallback === 'function') {
      globalThis.cancelIdleCallback(idle);
    }
  };
};

/** How many times a run cancelled by edits is asked for again before waiting for the next edit. */
const RETRIES = 5;

/** Inputs of {@link useUpgradeNotice}. */
export interface UpgradeNoticeInput {
  readonly session: NoticeSession;
  /** The open mod's file system (for **Not now**); `null` keeps it for this run only. */
  readonly fs: NoticeFileSystem | null;
  /** The open mod's folder, or `null` with none open. */
  readonly root: string | null;
  /** The project state; a new state asks again. `null` with none open. */
  readonly project: object | null;
  /** The open mod's target. */
  readonly target: TargetFacts | null;
  /** Every built-in target. */
  readonly targets: readonly TargetFacts[];
  /** **Tell me about test versions of Minecraft**. */
  readonly testVersions: boolean;
  /** When to run (tests run at once). */
  readonly whenIdle?: WhenIdle;
}

interface Outcome {
  readonly key: string;
  readonly done?: number;
  readonly todo?: number;
  readonly message?: string;
}

/** The notice's state, and **Not now** for the announced target. */
export function useUpgradeNotice(input: UpgradeNoticeInput): {
  readonly notice: UpgradeNoticeState;
  readonly notNow: () => void;
} {
  const { session, fs, root, project, target, targets, testVersions } = input;
  const schedule = input.whenIdle ?? whenIdle;
  // Keyed by the id: the facts App passes may be a new object each render; the result is one of
  // `targets` (the session's frozen list), so the effects below see a stable target.
  const currentId = project === null ? null : (target?.id ?? null);
  const newer = useMemo(
    () => (currentId === null ? null : newerTargetFor(currentId, targets, testVersions)),
    [currentId, targets, testVersions],
  );
  const key = root === null || newer === null ? null : `${root}\u0000${newer.id}`;

  const [notNowList, setNotNowList] = useState<{ root: string; ids: readonly string[] } | null>(
    null,
  );
  useEffect(() => {
    if (root === null || fs === null) return;
    let live = true;
    readNotNow(fs).then((ids) => {
      if (live) setNotNowList({ root, ids });
    });
    return () => {
      live = false;
    };
  }, [root, fs]);

  const [outcome, setOutcome] = useState<Outcome | null>(null);
  useEffect(() => {
    if (key === null || newer === null || project === null) return;
    let live = true;
    let cancel = (): void => {};
    let controller: AbortController | null = null;
    let tries = 0;
    const ask = (): void => {
      controller = new AbortController();
      session.upgradeReport(newer.id, { signal: controller.signal }).then(
        (dry) => {
          if (!live) return;
          setOutcome({
            key,
            done: dry.report.done.filter((item) => item.kind !== 'note').length,
            todo: dry.report.todo.length,
          });
        },
        (error: unknown) => {
          if (!live) return;
          if (error instanceof Error && error.name === 'DryRunCancelled') {
            // An edit made the run stale: ask again when idle (the next edit asks anyway).
            if (tries < RETRIES) {
              tries += 1;
              cancel = schedule(ask);
            }
            return;
          }
          setOutcome({ key, message: error instanceof Error ? error.message : String(error) });
        },
      );
    };
    cancel = schedule(ask);
    return () => {
      live = false;
      cancel();
      controller?.abort('cancelled');
    };
  }, [key, newer, project, session, schedule]);

  const notNow = useCallback(() => {
    if (root === null || newer === null) return;
    setNotNowList((list) => ({
      root,
      ids: [...(list?.root === root ? list.ids : []), newer.id],
    }));
    if (fs === null) return;
    rememberNotNow(fs, newer.id).catch((error: unknown) => {
      console.warn(`MSM: could not remember Not now: ${String(error)}`);
    });
  }, [root, newer, fs]);

  let notice: UpgradeNoticeState = { status: 'none' };
  if (key !== null && newer !== null) {
    const dismissed = notNowList?.root === root && notNowList.ids.includes(newer.id);
    if (outcome === null || outcome.key !== key) notice = { status: 'checking', newer };
    else if (outcome.message !== undefined) {
      notice = { status: 'failed', newer, message: outcome.message, dismissed };
    } else {
      notice = {
        status: 'ready',
        newer,
        done: outcome.done ?? 0,
        todo: outcome.todo ?? 0,
        dismissed,
      };
    }
  }
  return { notice, notNow };
}

/** Whether the Things to fix note has anything to show (a finished run not put off). */
export function noticeShows(notice: UpgradeNoticeState): boolean {
  return (notice.status === 'ready' || notice.status === 'failed') && !notice.dismissed;
}
