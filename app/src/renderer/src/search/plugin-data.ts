/**
 * Gathers the registered plugins' search data (ADR 0124 D13). Each plugin's `searchData()` is
 * called once, lazily; the result is copied through `validateSearchContributions` with the
 * plugin's own things and the built-in limits, so only plain data in range reaches the index.
 * Filled by B660; this stub shows the one call every built-in plugin goes through.
 */

import {
  BUILT_IN_SEARCH_LIMITS,
  type PluginContributions,
  searchOwnThingsOf,
  validateSearchContributions,
} from '@msm/plugin-api';

/** The checked search data of one built-in plugin (empty when it declares none). */
export async function checkedSearchData(contributions: PluginContributions) {
  return validateSearchContributions(
    await contributions.searchData?.(),
    searchOwnThingsOf(contributions),
    BUILT_IN_SEARCH_LIMITS,
  );
}
