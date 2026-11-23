/**
 * The examples source (ADR 0124 D3; B660): one entry per library example whose kinds are all
 * registered, first id wins, then only if its kinds are registered (as the session's library), with its category and tags as words.
 * Availability is the example's `supports(target)`.
 *
 * @packageDocumentation
 */

import type { ExampleProject } from '@msm/plugin-api';
import type { SearchEntry } from '@msm/search';
import {
  asAction,
  asPreview,
  availability,
  entryIds,
  registeredKinds,
  type StaticSourceInput,
  sentenceField,
  supportsTarget,
  wordsField,
} from './shared';

/** The examples of the plugin list the session's library would offer. */
export function registeredExamples(
  input: Pick<StaticSourceInput, 'plugins'>,
): { plugin: string; example: ExampleProject }[] {
  const kinds = registeredKinds(input);
  const seen = new Set<string>();
  const out: { plugin: string; example: ExampleProject }[] = [];
  for (const plugin of input.plugins) {
    for (const example of plugin.contributes.examples ?? []) {
      if (seen.has(example.id)) continue;
      seen.add(example.id);
      if (!(example.requiresKinds ?? []).every((kind) => kinds.has(kind))) continue;
      out.push({ plugin: plugin.id, example });
    }
  }
  return out;
}

/** The example entries of the plugin list on the input's target. */
export function exampleEntries(input: StaticSourceInput): SearchEntry[] {
  return registeredExamples(input).map(({ plugin, example }) => {
    const action = { type: 'example', example: example.id } as const;
    return {
      id: entryIds.example(example.id),
      source: 'example',
      title: example.title,
      ...sentenceField(example.description),
      ...wordsField([...(example.tags ?? []), example.category]),
      ids: [example.kind],
      ...availability(supportsTarget(example, input.target)),
      plugin,
      action: asAction(action),
      preview: asPreview(action),
    } satisfies SearchEntry;
  });
}
