/**
 * The plugins' extra doors (ADR 0124 D13; B651's `PluginSearchData.entries`, B660): one entry per
 * contributed line ("Elytra" opening the Glider flow, "Lucky block" opening an example). Each takes
 * the source and the availability of the thing it opens, which must be found among the static
 * entries (else it is left out), and that thing's action with the line's answers: a line with no
 * answers has the same action as the thing and folds into its result.
 *
 * @packageDocumentation
 */

import type { SearchEntry } from '@msm/search';
import type { GatheredPluginData } from '../plugin-data';
import {
  actionOf,
  asAction,
  asPreview,
  entryIds,
  type SearchActionDescriptor,
  sentenceField,
  wordsField,
} from './shared';

/** The entry ids an `opens` may name, in the order they are tried. */
function openedIds(type: string, id: string): string[] {
  switch (type) {
    case 'starter':
      return [entryIds.flow(id), entryIds.starter(id)];
    case 'template':
      return [entryIds.template(id)];
    case 'example':
      return [entryIds.example(id)];
    case 'kind':
      return [entryIds.kind(id)];
    case 'command':
      return [entryIds.command(id)];
    default:
      return [];
  }
}

/** The contributed entries, given the static entries they open (by id). */
export function contributionEntries(
  plugins: readonly GatheredPluginData[],
  opened: ReadonlyMap<string, SearchEntry>,
): SearchEntry[] {
  const out: SearchEntry[] = [];
  const seen = new Set<string>();
  for (const { plugin, data } of plugins) {
    for (const line of data.entries ?? []) {
      const id = entryIds.contribution(plugin, line.id);
      if (seen.has(id)) continue;
      const target = openedIds(line.opens.type, line.opens.id)
        .map((entryId) => opened.get(entryId))
        .find((entry) => entry !== undefined);
      if (target === undefined) continue;
      seen.add(id);
      const base = actionOf(target);
      const values = line.opens.values;
      const action: SearchActionDescriptor =
        values !== undefined &&
        Object.keys(values).length > 0 &&
        (base.type === 'flow' || base.type === 'starter')
          ? { ...base, values }
          : base;
      out.push({
        id,
        source: target.source,
        title: line.title,
        ...sentenceField(line.sentence),
        ...wordsField(line.words ?? []),
        ...(target.ids !== undefined ? { ids: target.ids } : {}),
        available: target.available,
        ...(target.unavailableReason !== undefined
          ? { unavailableReason: target.unavailableReason }
          : {}),
        ...(target.technical === true ? { technical: true } : {}),
        plugin,
        ...(target.questions !== undefined ? { questions: target.questions } : {}),
        action: asAction(action),
        preview: asPreview(action),
      });
    }
  }
  return out;
}
