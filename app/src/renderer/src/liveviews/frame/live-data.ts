/**
 * How a view feeds the live views worker (B608): {@link useLiveViewData} gathers the view's files
 * (the project's data files of the folders the view reads, vanilla's of the same folders from
 * the user's jar cache, the target's facts) 150 ms after the last edit and gives them to the
 * client; {@link useLiveViewJob} runs one job over them in the view's own lane and keeps the
 * latest answer, the odds step by step. A view asks only the folders it needs (B603: all of
 * them are about 1.4 MB).
 */

import type { Project, TargetFacts } from '@msm/plugin-api';
import type { OddsStep } from '@msm/sim';
import { defaultTargetId, targetFacts } from '@msm/targets';
import { useEffect, useId, useState } from 'react';
import { stableKey } from '../../terrain/client';
import {
  type LiveViewClient,
  type LiveViewJob,
  type LiveViewResults,
  projectDataFiles,
  sharedLiveViewClient,
} from '../client';
import type { VanillaDataReader } from '../vanilla-data';

/** A view asks again this long after the last edit (ADR 0120, "Follows an edit"). */
export const LIVE_VIEW_DEBOUNCE_MS = 150;

/** The facts of the project's target (the default target's for none), or `null`. */
export function factsOf(project: Pick<Project, 'targets'>): TargetFacts | null {
  return targetFacts(project.targets[0] ?? defaultTargetId) ?? null;
}

/** Where a view's files stand. */
export type LiveDataState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      /** The files' hash, for {@link useLiveViewJob}. */
      readonly data: string;
      /**
       * Vanilla's folders: `ready`, `not_set_up` (the frame's banner shows when the view names
       * a vanilla file, `needsSetUpBanner`), or `none` when the view asked none.
       */
      readonly vanilla: 'ready' | 'not_set_up' | 'none';
    }
  | { readonly status: 'error'; readonly message: string };

/**
 * Gives the view's files to the worker and answers their hash; again 150 ms after the project
 * or the folders change.
 */
export function useLiveViewData(
  project: Project,
  vanilla: VanillaDataReader,
  folders: readonly string[],
  client: LiveViewClient = sharedLiveViewClient(),
): LiveDataState {
  const [state, setState] = useState<LiveDataState>({ status: 'loading' });
  const folderKey = [...new Set(folders)].sort().join('|');
  useEffect(() => {
    let live = true;
    const wanted = folderKey === '' ? [] : folderKey.split('|');
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const facts = factsOf(project);
          if (facts === null) throw new Error('The project’s Minecraft version is not known.');
          const answer = wanted.length === 0 ? null : await vanilla.folders(wanted);
          if (!live) return;
          const ready = answer !== null && answer.status === 'ready' ? answer : null;
          const data = client.setData({
            project: projectDataFiles(project, wanted),
            vanilla:
              ready === null
                ? null
                : { key: vanilla.mcVersion ?? ready.version, folders: ready.folders },
            facts,
          });
          setState({
            status: 'ready',
            data,
            vanilla: answer === null ? 'none' : ready === null ? 'not_set_up' : 'ready',
          });
        } catch (error) {
          if (live) {
            setState({
              status: 'error',
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      })();
    }, LIVE_VIEW_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [project, vanilla, folderKey, client]);
  return state;
}

/** Where a job stands. */
export interface LiveJobState<K extends LiveViewJob['kind']> {
  /** The latest answer (the odds' latest step until the last), or `null` before the first. */
  readonly result: LiveViewResults[K] | null;
  /** True while the job runs (an older answer may be shown meanwhile). */
  readonly pending: boolean;
  readonly error: string | null;
}

/**
 * Runs `job` over the files of `data` in the view's own lane, again whenever either changes; a
 * newer run cancels the older. `null` for either runs nothing.
 */
export function useLiveViewJob<J extends LiveViewJob>(
  data: string | null,
  job: J | null,
  client: LiveViewClient = sharedLiveViewClient(),
): LiveJobState<J['kind']> {
  const lane = useId();
  const [state, setState] = useState<LiveJobState<J['kind']>>({
    result: null,
    pending: false,
    error: null,
  });
  const jobKey = job === null ? '' : stableKey(job);
  useEffect(() => {
    if (data === null || job === null) {
      setState((before) => ({ ...before, pending: false }));
      return;
    }
    let live = true;
    setState((before) => ({ ...before, pending: true, error: null }));
    client
      .run(lane, data, job, (step: OddsStep) => {
        if (live) {
          setState((before) => ({ ...before, result: step as LiveViewResults[J['kind']] }));
        }
      })
      .then(
        (result) => {
          if (live && result !== null) setState({ result, pending: false, error: null });
        },
        (error: unknown) => {
          if (live) {
            setState((before) => ({
              ...before,
              pending: false,
              error: error instanceof Error ? error.message : String(error),
            }));
          }
        },
      );
    return () => {
      live = false;
      client.cancel(lane);
    };
  }, [data, jobKey, client, lane]);
  return state;
}
