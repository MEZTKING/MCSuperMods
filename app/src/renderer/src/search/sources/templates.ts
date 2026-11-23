/**
 * The templates source (ADR 0124 D3; B660): one entry per element template whose kind some
 * plugin registers, first id wins (as the session's library), with the template's category and
 * the plugins' keywords for it. Availability is the template's `supports(target)`; a template of a
 * technical kind (models, names, pack settings) is marked technical for Very easy.
 *
 * @packageDocumentation
 */

import type { ElementTemplate } from '@msm/plugin-api';
import type { SearchEntry } from '@msm/search';
import {
  asAction,
  asPreview,
  availability,
  entryIds,
  idWords,
  registeredKinds,
  type StaticSourceInput,
  sentenceField,
  supportsTarget,
  wordsField,
} from './shared';

/** What decides a kind's words and whether it is technical (the app's sidebar lists). */
export interface KindWords {
  /** The kind's friendly name ("Rule books"), when the app has one. */
  label?(kind: string): string | undefined;
  /** Whether Easy folds the kind under "More" (models, names, pack settings). */
  technical?(kind: string): boolean;
}

/** The templates of the plugin list that the session's library would offer. */
export function registeredTemplates(
  input: Pick<StaticSourceInput, 'plugins'>,
): { plugin: string; template: ElementTemplate }[] {
  const kinds = registeredKinds(input);
  const seen = new Set<string>();
  const out: { plugin: string; template: ElementTemplate }[] = [];
  for (const plugin of input.plugins) {
    for (const template of plugin.contributes.elementTemplates ?? []) {
      if (seen.has(template.id) || !kinds.has(template.kind)) continue;
      seen.add(template.id);
      out.push({ plugin: plugin.id, template });
    }
  }
  return out;
}

/** The template entries of the plugin list on the input's target. */
export function templateEntries(input: StaticSourceInput, kinds: KindWords = {}): SearchEntry[] {
  return registeredTemplates(input).map(({ plugin, template }) => {
    const action = { type: 'template', template: template.id, kind: template.kind } as const;
    return {
      id: entryIds.template(template.id),
      source: 'template',
      title: template.title,
      ...sentenceField(template.description),
      ...wordsField([
        ...(input.words.keywords[template.id] ?? []),
        template.category,
        kinds.label?.(template.kind),
      ]),
      ids: [template.kind],
      ...availability(supportsTarget(template, input.target)),
      ...(kinds.technical?.(template.kind) === true ? { technical: true } : {}),
      plugin,
      action: asAction(action),
      preview: asPreview(action),
    } satisfies SearchEntry;
  });
}

/** Words of a kind with no friendly name: its id's path (`worldgen/biome` reads `worldgen biome`). */
export function kindIdWords(kind: string): string {
  return idWords(kind);
}
