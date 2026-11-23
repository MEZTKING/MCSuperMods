/**
 * The library's search data (plugin API 1.23.0, ADR 0124 D5, D7, D13; brief
 * B654): the words of the things its flows, starters and examples make, colour names, the
 * behaviours its flows make, extra doors, keywords by starter and hints for answering the flows'
 * questions from a query's words. Loaded lazily through `searchData()`, so none of it is in the
 * first-paint bundle. Plain data: nothing here runs in the search, and the engine is not
 * imported. Checked by `test/search.test.ts` against the plugin's own starters and both targets.
 */

import type { PluginSearchData } from '@msm/plugin-api';
import { BEHAVIOURS } from './search/behaviours';
import { COLOURS } from './search/colours';
import { ENTRIES } from './search/entries';
import { KEYWORDS } from './search/keywords';
import { MATERIALS } from './search/materials';
import { QUESTIONS } from './search/questions';
import { THINGS } from './search/things';

export const SEARCH: PluginSearchData = {
  vocabulary: { words: [...THINGS, ...MATERIALS], colours: COLOURS },
  behaviours: BEHAVIOURS,
  entries: ENTRIES,
  keywords: KEYWORDS,
  questions: QUESTIONS,
};
