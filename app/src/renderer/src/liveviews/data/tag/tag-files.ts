/**
 * The tag view's files (B612), given to the live views worker 150 ms after the last edit, as
 * `useLiveViewData` gives a view's files, with two additions the tag view needs:
 *
 * - **Two file sets**: the project's tags over vanilla's (the tag now) and vanilla's alone (for
 *   What changed), from one read of vanilla's folder.
 * - **The registry's ids** (`registries` of the data spec), so the worker's resolver knows which
 *   entries exist (B604's `exists`): from the Tag Studio, the session's registry index; in the
 *   preview panel, the target's vendored registry list read through the preload bridge
 *   ({@link useVendoredRegistries}, `tag-model.ts` `panelRegistryIds`).
 */

import type { Project } from '@msm/plugin-api';
import { defaultTargetId } from '@msm/targets';
import { useEffect, useState } from 'react';
import { type LiveViewClient, projectDataFiles, sharedLiveViewClient } from '../../client';
import { factsOf, LIVE_VIEW_DEBOUNCE_MS } from '../../frame/live-data';
import type { VanillaDataReader } from '../../vanilla-data';

/**
 * Registries whose tags the jar has none of (B600: no `tags/function` in either jar), so the view
 * asks no vanilla folder for them.
 */
const NO_VANILLA_TAGS: ReadonlySet<string> = new Set(['function']);

/** Where the tag view's files stand. */
export type TagFilesState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      /** The hash of the project's files over vanilla's. */
      readonly now: string;
      /** The hash of vanilla's files alone, or `null` when vanilla's were not read. */
      readonly vanillaOnly: string | null;
      /** Vanilla's folder: read, not set up, or not asked. */
      readonly vanilla: 'ready' | 'not_set_up' | 'none';
    }
  | { readonly status: 'error'; readonly message: string };

/**
 * Gives the tag view's files to the worker; again 150 ms after the project, the registry or the
 * ids change.
 *
 * @param registryIds - The registry's ids for `exists`, or `null` for "cannot tell".
 */
export function useTagFiles(
  project: Project,
  vanilla: VanillaDataReader,
  registry: string,
  registryIds: readonly string[] | null,
  client: LiveViewClient = sharedLiveViewClient(),
): TagFilesState {
  const [state, setState] = useState<TagFilesState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const facts = factsOf(project);
          if (facts === null) throw new Error('The project’s Minecraft version is not known.');
          const folder = `${facts.folders.data.tags}/${registry}`;
          const answer = NO_VANILLA_TAGS.has(registry) ? null : await vanilla.folders([folder]);
          if (!live) return;
          const ready = answer !== null && answer.status === 'ready' ? answer : null;
          const vanillaSpec =
            ready === null
              ? null
              : { key: vanilla.mcVersion ?? ready.version, folders: ready.folders };
          const registries =
            registryIds === null ? {} : { registries: { [registry]: registryIds } };
          const now = client.setData({
            project: projectDataFiles(project, [folder]),
            vanilla: vanillaSpec,
            facts,
            ...registries,
          });
          const vanillaOnly =
            vanillaSpec === null
              ? null
              : client.setData({ project: {}, vanilla: vanillaSpec, facts, ...registries });
          setState({
            status: 'ready',
            now,
            vanillaOnly,
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
  }, [project, vanilla, registry, registryIds, client]);
  return state;
}

/** Reads the target's vendored registry list (`mcmetaRegistries`) through the preload bridge. */
export type ReadVendoredRegistries = (
  targetId: string,
) => Promise<Readonly<Record<string, readonly string[]>>>;

const decoder = new TextDecoder();

/**
 * Reads through the preload bridge (`window.msm`), as `vanilla-data.ts` does, so nothing under
 * `liveviews/` imports from the session.
 */
const readThroughBridge: ReadVendoredRegistries = async (targetId) => {
  const msm = (window as Partial<Window>).msm;
  if (msm === undefined) throw new Error('The MSM preload bridge is missing.');
  const json = JSON.parse(
    decoder.decode(await msm.targets.readVendored(targetId, 'mcmetaRegistries')),
  ) as unknown;
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('The vendored registries file is not a JSON object.');
  }
  const out: Record<string, readonly string[]> = {};
  for (const [name, ids] of Object.entries(json)) {
    if (Array.isArray(ids)) out[name] = ids.filter((id): id is string => typeof id === 'string');
  }
  return out;
};

const vendoredCache = new Map<
  string,
  Promise<Readonly<Record<string, readonly string[]>> | null>
>();

/**
 * The target's vendored registry list, read once per target; `null` while loading or when it
 * cannot be read (no bridge: tests, a bundle without one).
 */
export function useVendoredRegistries(
  project: Pick<Project, 'targets'>,
  read: ReadVendoredRegistries = readThroughBridge,
): Readonly<Record<string, readonly string[]>> | null {
  const targetId = project.targets[0] ?? defaultTargetId;
  const [registries, setRegistries] = useState<Readonly<Record<string, readonly string[]>> | null>(
    null,
  );
  useEffect(() => {
    let live = true;
    const key = read === readThroughBridge ? targetId : '';
    let entry = key === '' ? undefined : vendoredCache.get(key);
    if (entry === undefined) {
      entry = read(targetId).catch(() => null);
      if (key !== '') {
        const kept = entry;
        vendoredCache.set(key, kept);
        // A failed read is asked again next time.
        void kept.then((found) => {
          if (found === null && vendoredCache.get(key) === kept) vendoredCache.delete(key);
        });
      }
    }
    void entry.then((found) => {
      if (live) setRegistries(found);
    });
    return () => {
      live = false;
    };
  }, [targetId, read]);
  return registries;
}
