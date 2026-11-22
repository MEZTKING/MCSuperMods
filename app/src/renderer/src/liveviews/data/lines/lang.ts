/**
 * The words B611's views fill text with: the project's own `en_us` language files (elements of
 * `minecraft:lang` named `en_us`) over vanilla's `en_us` from the user's jar cache. Also the
 * 150 ms settle every view of this brief follows an edit with (ADR 0120, "Follows an edit").
 */

import type { Json, Project } from '@msm/plugin-api';
import { useEffect, useMemo, useState } from 'react';
import type { VanillaAssetReader } from '../../../preview/model-chain';
import { type LangTable, resourceFoldersOf, useVanillaLang } from '../../frame/item-picture';
import { LIVE_VIEW_DEBOUNCE_MS } from '../../frame/live-data';
import type { LangLookup } from './text-component';

/** The project's own `en_us` keys (every namespace's `en_us` language file). */
export function projectLang(project: Pick<Project, 'namespaces'>): LangTable {
  const out: Record<string, string> = {};
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind !== 'minecraft:lang') continue;
      const path = element.id.slice(element.id.indexOf(':') + 1);
      if (path !== 'en_us') continue;
      const data = element.data as Json;
      if (typeof data !== 'object' || data === null || Array.isArray(data)) continue;
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string') out[key] = value;
      }
    }
  }
  return out;
}

/** A lookup over the project's words, then vanilla's. */
export function mergedLang(project: LangTable, vanilla: LangTable | null): LangLookup {
  return (key) =>
    Object.hasOwn(project, key)
      ? project[key]
      : vanilla !== null && Object.hasOwn(vanilla, key)
        ? vanilla[key]
        : undefined;
}

/** The project's words over vanilla's (vanilla's once the jar cache has answered). */
export function useLang(
  project: Project,
  vanillaAssets: VanillaAssetReader | null,
): { readonly lookup: LangLookup; readonly vanillaReady: boolean } {
  const folders = useMemo(() => resourceFoldersOf(project), [project]);
  const vanilla = useVanillaLang(vanillaAssets, folders);
  const own = useMemo(() => projectLang(project), [project]);
  return useMemo(
    () => ({ lookup: mergedLang(own, vanilla), vanillaReady: vanilla !== null }),
    [own, vanilla],
  );
}

/**
 * `value` as it was {@link LIVE_VIEW_DEBOUNCE_MS} after it last changed (the first value at
 * once), so a view works again once an edit settles rather than on every key.
 */
export function useSettled<T>(value: T, ms: number = LIVE_VIEW_DEBOUNCE_MS): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(value, settled)) return;
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, settled, ms]);
  return settled;
}
