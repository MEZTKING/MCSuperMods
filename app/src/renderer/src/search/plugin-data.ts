/**
 * Gathers the registered plugins' search data (ADR 0124 D5, D13; B651, B652). Each plugin's lazy
 * `searchData()` is called once per plugin object; the result is copied through
 * `validateSearchContributions` with the plugin's own things and the built-in limits, so only
 * plain data in range reaches the index: vocabulary, behaviours, extra entries, keywords by kind,
 * template or starter id, and question hints by starter. A plugin whose data fails to load gives
 * nothing (and its problems say why); the others are not held up. Gathered from the plugin list
 * itself, so the static layer exists with no mod open.
 *
 * Third-party plugins' data comes through the sandbox with the third-party limits (B670); until
 * then a facade without `searchData` simply gives nothing.
 *
 * @packageDocumentation
 */

import {
  BUILT_IN_SEARCH_LIMITS,
  type PluginContributions,
  type PluginSearchData,
  type Problem,
  type SearchLimits,
  searchOwnThingsOf,
  validateSearchContributions,
} from '@msm/plugin-api';

/** The checked search data of one built-in plugin (empty when it declares none). */
export async function checkedSearchData(
  contributions: PluginContributions,
  limits: Readonly<SearchLimits> = BUILT_IN_SEARCH_LIMITS,
) {
  return validateSearchContributions(
    await contributions.searchData?.(),
    searchOwnThingsOf(contributions),
    limits,
  );
}

/** One plugin's gathered search data. */
export interface GatheredPluginData {
  readonly plugin: string;
  readonly data: PluginSearchData;
  /** What `validateSearchContributions` dropped, or why the data could not be read. */
  readonly problems: readonly Problem[];
}

/** A plugin as `plugin-data.ts` reads it. */
export interface SearchDataPlugin {
  readonly id: string;
  readonly contributes: PluginContributions;
}

const gathered = new WeakMap<object, Promise<GatheredPluginData>>();

/** Gathers one plugin's data, once per plugin object. */
export function gatherPluginData(
  plugin: SearchDataPlugin,
  limits: Readonly<SearchLimits> = BUILT_IN_SEARCH_LIMITS,
): Promise<GatheredPluginData> {
  const held = gathered.get(plugin);
  if (held !== undefined) return held;
  const pending = (async (): Promise<GatheredPluginData> => {
    try {
      const { data, problems } = await checkedSearchData(plugin.contributes, limits);
      return { plugin: plugin.id, data, problems };
    } catch (error) {
      return {
        plugin: plugin.id,
        data: {},
        problems: [
          {
            severity: 'error',
            code: 'search.unreadable',
            message: `The search data of ${plugin.id} could not be read: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  })();
  gathered.set(plugin, pending);
  return pending;
}

/** Every plugin's data, in plugin order (the vocabulary's and the reader's order). */
export async function gatherSearchData(
  plugins: readonly SearchDataPlugin[],
  limits: Readonly<SearchLimits> = BUILT_IN_SEARCH_LIMITS,
): Promise<GatheredPluginData[]> {
  return Promise.all(plugins.map((plugin) => gatherPluginData(plugin, limits)));
}
