/**
 * The kinds source (ADR 0124 D3; B660): one entry per registered kind, first registration wins,
 * titled with the app's friendly name for it (the sidebar's group label) or words made from its
 * id, with the plugins' keywords for it and its id as an exact id. Kinds are available on every
 * target; a technical kind (models, names, pack settings) and a kind with no friendly name are
 * marked technical for Very easy.
 *
 * @packageDocumentation
 */

import type { SearchEntry } from '@msm/search';
import {
  asAction,
  asPreview,
  entryIds,
  kindOwners,
  registeredKinds,
  type StaticSourceInput,
  wordsField,
} from './shared';
import type { KindWords } from './templates';
import { kindIdWords } from './templates';

const capitalise = (text: string): string =>
  text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);

/** The kind entries of the plugin list. */
export function kindEntries(input: StaticSourceInput, words: KindWords = {}): SearchEntry[] {
  const owners = kindOwners(input);
  const out: SearchEntry[] = [];
  for (const kind of registeredKinds(input).values()) {
    const label = words.label?.(kind.id);
    const action = { type: 'kind', kind: kind.id } as const;
    const technical = label === undefined || words.technical?.(kind.id) === true;
    const plugin = owners.get(kind.id);
    out.push({
      id: entryIds.kind(kind.id),
      source: 'kind',
      title: label ?? capitalise(kindIdWords(kind.id)),
      ...wordsField([...(input.words.keywords[kind.id] ?? []), kind.folder.replace(/[_/]+/g, ' ')]),
      ids: [kind.id],
      available: true,
      ...(technical ? { technical: true } : {}),
      ...(plugin !== undefined ? { plugin } : {}),
      action: asAction(action),
      preview: asPreview(action),
    });
  }
  return out;
}
