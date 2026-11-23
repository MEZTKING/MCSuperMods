/**
 * The flows and starters source (ADR 0124 D3, D7; B660): one entry per library starter whose kinds
 * are registered, first id wins (as the session's library). A starter with `creator` is a Creator
 * flow (`flow:<id>`, source `flow`), any other a starter (`starter:<id>`); both carry the questions
 * the answer reader fills from words and the plugins' keywords for the starter. Availability is
 * the starter's `supports(target)`.
 *
 * Also the facts the answer reader needs per flow (`flowFacts`): the sort of thing it makes, from
 * its Creator group, its parameter defaults and its parameters (the worker's check of an answer
 * is the wizard's own `validateParameter`).
 *
 * @packageDocumentation
 */

import type { CreatorGroup, Json, ProjectStarter, StarterParameter } from '@msm/plugin-api';
import type { SearchEntry } from '@msm/search';
import {
  asAction,
  asPreview,
  availability,
  entryIds,
  flowAction,
  questionOf,
  registeredStarters,
  type StaticSourceInput,
  sentenceField,
  supportsTarget,
  wordsField,
} from './shared';

/** The sort of thing a Creator group's flows make, for behaviours (B659). */
export const GROUP_SORTS: Readonly<Partial<Record<CreatorGroup, string>>> = {
  gear: 'item',
  food: 'item',
  magic: 'item',
  blocks: 'block',
  mobs: 'mob',
  vehicles: 'vehicle',
};

/** The group words a flow entry carries, so "a mob" or "gear" reaches its flows. */
const GROUP_WORDS: Readonly<Record<CreatorGroup, string>> = {
  gear: 'gear',
  blocks: 'block',
  food: 'food',
  mobs: 'mob',
  vehicles: 'vehicle',
  scripts: 'script',
  worlds: 'world',
  magic: 'magic',
  games: 'game',
};

/** What the worker knows of one flow or starter beside its entry. */
export interface FlowSpec {
  /** The sort of thing it makes (`item`, `block`, `mob`, `vehicle`), when its group says. */
  readonly sort?: string;
  /** Its parameter defaults (read by `appliesWhen`). */
  readonly defaults: Readonly<Record<string, Json>>;
  /** Its parameters as declared (plain data), for the wizard's check of an answer. */
  readonly parameters: readonly StarterParameter[];
}

/** Whether a starter is a Creator flow. */
export function isFlow(starter: ProjectStarter): boolean {
  return starter.creator !== undefined;
}

/** The entry id of a starter: `flow:<id>` for a flow, else `starter:<id>`. */
export function starterEntryId(starter: ProjectStarter): string {
  return isFlow(starter) ? entryIds.flow(starter.id) : entryIds.starter(starter.id);
}

/** The action of a starter's own entry. */
export function starterAction(starter: ProjectStarter) {
  return isFlow(starter)
    ? flowAction(starter.id)
    : ({ type: 'starter', starter: starter.id } as const);
}

/** A parameter's declaration as plain data (no functions; it crosses the worker). */
function plainParameter(parameter: StarterParameter): StarterParameter {
  return JSON.parse(JSON.stringify(parameter)) as StarterParameter;
}

/** The flow and starter entries of the plugin list on the input's target. */
export function flowEntries(input: StaticSourceInput): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const { plugin, starter } of registeredStarters(input)) {
    const flow = isFlow(starter);
    const group = starter.creator?.group;
    const parameters = starter.parameters ?? [];
    out.push({
      id: starterEntryId(starter),
      source: flow ? 'flow' : 'starter',
      title: starter.title,
      ...sentenceField(starter.creator?.blurb ?? starter.description),
      ...wordsField([
        ...(input.words.keywords[starter.id] ?? []),
        ...(group !== undefined ? [GROUP_WORDS[group]] : []),
      ]),
      ...(starter.creator !== undefined && starter.creator.blurb !== starter.description
        ? { body: starter.description }
        : {}),
      ...availability(supportsTarget(starter, input.target)),
      plugin,
      ...(parameters.length > 0 ? { questions: parameters.map(questionOf) } : {}),
      action: asAction(starterAction(starter)),
      preview: asPreview(starterAction(starter)),
    });
  }
  return out;
}

/** The facts of every flow and starter by starter id (the reader's `flows`). */
export function flowFacts(input: Pick<StaticSourceInput, 'plugins'>): Record<string, FlowSpec> {
  const out: Record<string, FlowSpec> = {};
  for (const { starter } of registeredStarters(input)) {
    const parameters = (starter.parameters ?? []).map(plainParameter);
    const defaults: Record<string, Json> = {};
    for (const parameter of parameters) defaults[parameter.id] = parameter.default as Json;
    const group = starter.creator?.group;
    const sort = group === undefined ? undefined : GROUP_SORTS[group];
    out[starter.id] = { ...(sort !== undefined ? { sort } : {}), defaults, parameters };
  }
  return out;
}
