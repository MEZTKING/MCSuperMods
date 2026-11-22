/**
 * Hooks the B610 views share: what is known of each enchantment (the project's files over
 * vanilla's, read from the user's jar cache), the members of an id list or `#tag` (a `tag` job in
 * the live views worker, so the resolver stays off the main thread) and the curses
 * (`#minecraft:curse`, red in a tooltip).
 */

import type { Json, Project } from '@msm/plugin-api';
import { useEffect, useMemo, useState } from 'react';
import type { LiveViewClient, LiveViewJob } from '../../client';
import type { LangTable } from '../../frame/item-picture';
import { useLiveViewJob } from '../../frame/live-data';
import type { VanillaDataReader, VanillaFolderFiles } from '../../vanilla-data';
import { type EnchantmentInfo, enchantmentInfoOf, fullId, projectEnchantments } from './words';

/** Vanilla's enchantment files, or `null` while loading or when not set up. */
export function useVanillaEnchantments(vanilla: VanillaDataReader): VanillaFolderFiles | null {
  const [files, setFiles] = useState<VanillaFolderFiles | null>(null);
  useEffect(() => {
    let live = true;
    void vanilla
      .folder('enchantment')
      .then((answer) => {
        if (live) setFiles(answer.status === 'ready' ? answer.files : null);
      })
      .catch(() => {
        if (live) setFiles(null);
      });
    return () => {
      live = false;
    };
  }, [vanilla]);
  return files;
}

/** What is known of each enchantment by id: the project's file first, then vanilla's. */
export function useEnchantmentInfo(
  project: Project,
  vanilla: VanillaDataReader,
  lang: LangTable | null,
): (id: string) => EnchantmentInfo | undefined {
  const vanillaFiles = useVanillaEnchantments(vanilla);
  return useMemo(() => {
    const own = projectEnchantments(project);
    const cache = new Map<string, EnchantmentInfo | undefined>();
    return (id: string) => {
      const full = fullId(id);
      if (cache.has(full)) return cache.get(full);
      const file: Json | undefined = own.get(full) ?? vanillaFiles?.[full];
      const info = file === undefined ? undefined : enchantmentInfoOf(file, lang);
      cache.set(full, info);
      return info;
    };
  }, [project, vanillaFiles, lang]);
}

/** The members of an id, a list of ids or a `#tag`. */
export interface IdSet {
  /** The ids, or `null` while a tag is being resolved. */
  readonly ids: readonly string[] | null;
  /** The tag named, or `null` for plain ids. */
  readonly tag: string | null;
  /** True when the game would drop the tag (a missing entry or a cycle). */
  readonly dropped: boolean;
  /** Required entries not found. */
  readonly missing: readonly string[];
}

/** An id, a list of ids or a `#tag` (a list may name tags too) of a registry, resolved. */
export function useIdSet(
  data: string | null,
  registry: string,
  value: Json | undefined,
  client?: LiveViewClient,
): IdSet {
  const plain = useMemo(() => {
    const list = Array.isArray(value) ? value : value === undefined ? [] : [value];
    return list.filter((entry): entry is string => typeof entry === 'string').map(fullId);
  }, [value]);
  const tag = plain.length === 1 && plain[0]?.startsWith('#') ? plain[0].slice(1) : null;
  const job = useMemo<Extract<LiveViewJob, { kind: 'tag' }> | null>(
    () => (tag === null ? null : { kind: 'tag', registry, id: tag }),
    [registry, tag],
  );
  const state = useLiveViewJob(data, job, client);
  if (tag === null) {
    return {
      ids: plain.filter((id) => !id.startsWith('#')),
      tag: null,
      dropped: false,
      missing: [],
    };
  }
  const result = state.result;
  if (result === null || result.id !== tag)
    return { ids: null, tag: `#${tag}`, dropped: false, missing: [] };
  return {
    ids: result.dropped ? [] : result.members.map((member) => member.id),
    tag: `#${tag}`,
    dropped: result.dropped,
    missing: result.missing,
  };
}

/** The curses (`#minecraft:curse`, the project's entries merged in), drawn red. */
export function useCurses(data: string | null, client?: LiveViewClient): ReadonlySet<string> {
  const set = useIdSet(data, 'enchantment', '#minecraft:curse', client);
  return useMemo(() => new Set(set.ids ?? []), [set.ids]);
}
