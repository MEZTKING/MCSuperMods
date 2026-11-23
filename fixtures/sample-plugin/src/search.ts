/**
 * The sample plugin's search data (plugin API 1.23.0, ADR 0124 D13): one vocabulary group and
 * one extra door, so the app's search finds the greeting by the words people type.
 *
 * Search data is plain data: no function of the plugin runs in the search. The app asks the
 * worker for it once, checks it with `validateSearchContributions` and the third-party limits
 * (500 lines, 50 behaviours, 50 entries) and leaves it out whole if a line fails, for example an
 * entry that opens another plugin's thing. An entry may open only this plugin's own starters,
 * templates, examples and kinds; there is no field for stop or intent words.
 */
import type { PluginSearchData } from '@msm/plugin-api';

/** The search data `contributes.searchData` returns. */
export const SAMPLE_SEARCH_DATA: PluginSearchData = {
  vocabulary: {
    words: [
      {
        idea: 'greeting',
        same: ['welcome message', 'join message'],
        near: ['message', 'announcement'],
        slang: ['howdy', 'motd'],
        misspellings: ['greating'],
      },
    ],
  },
  entries: [
    {
      id: 'welcome-message',
      title: 'Welcome message',
      sentence: 'Says hello to every player when the world loads.',
      words: ['howdy', 'motd', 'join message', 'hello on join'],
      opens: { type: 'example', id: 'sample-greeting-example' },
    },
  ],
  keywords: { 'sample-greeting': ['howdy', 'welcome message', 'tellraw'] },
};
