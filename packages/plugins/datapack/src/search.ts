/**
 * The plugin's search data (plugin API 1.23.0, ADR 0124 D13): words, behaviours, extra doors and
 * question hints, loaded lazily through `searchData()`. Empty until the words brief fills it
 * (docs/PLAN-search.md B654, B655).
 */

import type { PluginSearchData } from '@msm/plugin-api';

export const SEARCH: PluginSearchData = {};
