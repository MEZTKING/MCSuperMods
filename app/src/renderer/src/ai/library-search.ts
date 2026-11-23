/**
 * The AI helper's `search_library` (ADR 0124 D12, B669): the app's own search engine over the
 * static layer and the vanilla ids, in process, for one session.
 *
 * - **Static layer:** the same collector as the search panel's (`collectStatic`) over the built-in
 *   plugins (with their search data: vocabulary, keywords, question hints) and the session's own
 *   library (so a third-party plugin's starters are found too), with none of the app's own lists
 *   (settings and palette commands are not for the helper).
 * - **Vanilla layer:** the target's registry ids with words made from the ids only
 *   (`vanillaLayer(registries, null)`): never a name read from the user's jar.
 * - No project layer and no guide: the helper reads the project with its other tools.
 *
 * The index is built on the first search of a target and kept for the session (a `WeakMap`).
 * The tool executor imports this module dynamically, so the engine stays out of the first paint.
 *
 * @packageDocumentation
 */

import type { PluginContributions, TargetFacts } from '@msm/plugin-api';
import type { SearchAnswer, SearchEntry, SearchHit, SearchHitSlim } from '@msm/search';
import { builtInPlugins } from '../plugins/built-in';
import type { SearchOutbound } from '../search/client';
import { createSearchHost, type SearchHost } from '../search/host';
import type { SearchDataPlugin } from '../search/plugin-data';
import { gatherSearchData } from '../search/plugin-data';
import { collectStatic } from '../search/sources';
import { type VanillaRegistries, vanillaLayer } from '../search/sources/vanilla';
import type { ProjectSession } from '../session/project-session';

/** The sources `search_library` answers with; the rest of the static layer is for the panel. */
export const LIBRARY_SOURCES: ReadonlySet<SearchEntry['source']> = new Set([
  'flow',
  'starter',
  'template',
  'example',
  'kind',
  'rule',
  'vanilla',
]);

/** Most hits one search asks the engine for, per section. */
const ROWS_PER_SECTION = 50;

/** What the executor needs: hits for words, best first, only of {@link LIBRARY_SOURCES}. */
export interface LibrarySearch {
  search(query: string): Promise<readonly SearchHit[]>;
}

/** What the index is built from (the session gives it; tests may hand in their own). */
export interface LibrarySearchInput {
  readonly plugins: readonly SearchDataPlugin[];
  readonly target: TargetFacts;
  /** The target's vanilla registries (ids only). */
  readonly registries: VanillaRegistries;
}

/** The hits of an answer: Best matches first, then the rest by score; one hit per entry. */
export function hitsOf(answer: SearchAnswer): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  const take = (hit: SearchHit): void => {
    if (seen.has(hit.entry.id) || !LIBRARY_SOURCES.has(hit.entry.source)) return;
    seen.add(hit.entry.id);
    out.push(hit);
  };
  for (const hit of answer.best) take(hit);
  const rest = answer.sections
    .flatMap((section) => section.hits)
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
  for (const hit of rest) take(hit);
  return out;
}

/** Builds an in-process search over the static and vanilla layers. */
export async function createLibrarySearch(input: LibrarySearchInput): Promise<LibrarySearch> {
  const data = await gatherSearchData(input.plugins);
  const spec = collectStatic({
    plugins: input.plugins,
    target: input.target,
    data,
    lists: { commands: [], settings: [], kinds: {} },
  });
  const vanilla = vanillaLayer(input.registries, null);
  const entries = new Map<string, SearchEntry>();
  for (const entry of [...spec.entries, ...vanilla.entries]) entries.set(entry.id, entry);

  let answer: SearchOutbound | null = null;
  const host: SearchHost = createSearchHost(
    (message) => {
      answer = message;
    },
    { schedule: (run) => run() },
  );
  host.receive({ type: 'static', spec });
  host.receive({
    type: 'layer',
    layer: 'vanilla',
    entries: vanilla.entries,
    things: vanilla.things,
    protect: vanilla.protect,
  });
  let token = 0;

  return {
    async search(query) {
      token += 1;
      answer = null;
      host.receive({
        type: 'query',
        token,
        request: { text: query, mode: 'advanced', limit: ROWS_PER_SECTION },
      });
      const got = answer as SearchOutbound | null;
      if (got === null || got.type !== 'answer') return [];
      const whole = (slim: SearchHitSlim): SearchHit[] => {
        const entry = entries.get(slim.id);
        if (entry === undefined) return [];
        const { id: _id, ...rest } = slim;
        return [{ ...rest, entry }];
      };
      return hitsOf({
        understood: got.answer.understood,
        confident: got.answer.confident,
        best: got.answer.best.flatMap(whole),
        sections: got.answer.sections.map((section) => ({
          id: section.id,
          more: section.more,
          hits: section.hits.flatMap(whole),
        })),
      });
    },
  };
}

/** The session's library as one more plugin: a third-party plugin's starters and templates too. */
function sessionLibraryPlugin(session: ProjectSession): SearchDataPlugin {
  const contributes: PluginContributions = {
    elementKinds: [...session.registry.all()],
    projectStarters: [...session.library.starters],
    elementTemplates: [...session.library.templates],
    examples: [...session.library.examples],
  };
  return { id: 'msm.session-library', contributes };
}

const held = new WeakMap<ProjectSession, { target: string; search: Promise<LibrarySearch> }>();

/**
 * The library search of a session's target, built once per session and target. The vanilla ids
 * come from the session's schemas (the vendored registries); without them only the static layer
 * is searched.
 */
export function sessionLibrarySearch(session: ProjectSession): Promise<LibrarySearch> {
  const target = session.target;
  const before = held.get(session);
  if (before !== undefined && before.target === target.id) return before.search;
  const search = (async () => {
    let registries: VanillaRegistries = {};
    try {
      registries = (await session.schemas()).vanillaRegistries;
    } catch {
      // The static layer alone.
    }
    return createLibrarySearch({
      plugins: [...builtInPlugins, sessionLibraryPlugin(session)],
      target,
      registries,
    });
  })();
  held.set(session, { target: target.id, search });
  search.catch(() => {
    if (held.get(session)?.search === search) held.delete(session);
  });
  return search;
}
