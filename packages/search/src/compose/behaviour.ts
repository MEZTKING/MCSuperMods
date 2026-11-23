/**
 * Behaviours (ADR 0124 D7, limit SL3; B650 SQ12): what a made thing does, read from the clause
 * by the plugins' behaviour phrases, leftmost and longest, the words folded and stemmed on both
 * sides ("drop xp" meets "drops xp"). One phrase may name a behaviour for each sort of thing
 * ("explodes" for a block and for an item, B655), so the behaviour of a hit is the first of the
 * phrase's behaviours that fits the flow: the flow itself (`flows`), answers of the flow
 * (`answers`), or, for a flow that makes a thing of a sort it applies to (`appliesTo`), one rule
 * (`rule`) or one companion flow (`beside`). {@link makeBehaviour} turns one into what is made,
 * with `$thing` replaced everywhere in the rule and the companion's answers.
 */

import type { Json, SearchBehaviour } from '@msm/plugin-api';
import { keyOf } from '../slots/words';
import { createPhraseMatcher, type PhraseMatch, type PhraseMatcher } from '../text';

/** The string a behaviour names the made thing by. */
export const THING_PLACEHOLDER = '$thing';

/** A behaviour with the plugin that gave it. */
export interface PluginBehaviour {
  readonly plugin?: string;
  readonly behaviour: SearchBehaviour;
}

/** How a behaviour fits one flow. */
export type BehaviourFit = 'flow' | 'answers' | 'rule' | 'beside';

export interface BehaviourIndex {
  /** The behaviours in the order they were handed in. */
  readonly list: readonly PluginBehaviour[];
  /** The phrases found in the folded words, left to right, longest first. */
  match(folded: readonly string[]): PhraseMatch<PluginBehaviour>[];
  /** The behaviour with this id (the first one handed in). */
  byId(id: string): PluginBehaviour | undefined;
}

/** Phrases read per behaviour. */
const MAX_PHRASES = 64;

/** Builds the phrase index of the plugins' behaviours. */
export function createBehaviourIndex(list: readonly PluginBehaviour[]): BehaviourIndex {
  const kept: PluginBehaviour[] = [];
  const ids = new Map<string, PluginBehaviour>();
  const lines: { phrase: string; value: PluginBehaviour }[] = [];
  for (const item of Array.isArray(list) ? list : []) {
    const b = item?.behaviour;
    if (typeof b !== 'object' || b === null || typeof b.id !== 'string') continue;
    if (typeof b.sentence !== 'string' || !Array.isArray(b.phrases)) continue;
    kept.push(item);
    if (!ids.has(b.id)) ids.set(b.id, item);
    for (const phrase of b.phrases.slice(0, MAX_PHRASES)) {
      if (typeof phrase === 'string') lines.push({ phrase, value: item });
    }
  }
  const matcher: PhraseMatcher<PluginBehaviour> = createPhraseMatcher(lines, keyOf);
  return {
    list: kept,
    match: (folded) => matcher.match(folded),
    byId: (id) => ids.get(id),
  };
}

/** How the behaviour fits the flow with this starter id and sort, or undefined. */
export function behaviourFit(
  behaviour: SearchBehaviour,
  starter: string,
  sort: string | undefined,
): BehaviourFit | undefined {
  if (Array.isArray(behaviour.flows) && behaviour.flows.includes(starter)) return 'flow';
  const answers = behaviour.answers?.[starter];
  if (typeof answers === 'object' && answers !== null) return 'answers';
  if (sort === undefined || !Array.isArray(behaviour.appliesTo)) return undefined;
  if (!(behaviour.appliesTo as readonly string[]).includes(sort)) return undefined;
  if (behaviour.rule !== undefined) return 'rule';
  if (behaviour.beside !== undefined) return 'beside';
  return undefined;
}

/** How close a fit is: the flow itself, then its own answers, then a rule, then a companion. */
const FIT_ORDER: readonly BehaviourFit[] = ['flow', 'answers', 'rule', 'beside'];

/**
 * The phrase's behaviour that fits the flow best (SQ12's order: the flow itself, its own answers,
 * one rule, one companion flow), the first in plugin order among equals. "A wand that strikes
 * lightning" takes the Scripted behaviour flow's own Lightning answer before a Rules rule that
 * strikes lightning, now that the flow has a sort (ADR 0124's open item after B666).
 */
export function pickBehaviour(
  match: PhraseMatch<PluginBehaviour>,
  starter: string,
  sort: string | undefined,
): { readonly item: PluginBehaviour; readonly fit: BehaviourFit } | undefined {
  let best: { readonly item: PluginBehaviour; readonly fit: BehaviourFit } | undefined;
  for (const item of match.values) {
    const fit = behaviourFit(item.behaviour, starter, sort);
    if (fit === undefined) continue;
    if (best === undefined || FIT_ORDER.indexOf(fit) < FIT_ORDER.indexOf(best.fit)) {
      best = { item, fit };
    }
  }
  return best;
}

/** A copy of a JSON value with `$thing` replaced by the thing's id in every string. */
export function replaceThing(value: Json, thing: string): Json {
  if (typeof value === 'string') return value.split(THING_PLACEHOLDER).join(thing);
  if (Array.isArray(value)) return value.map((v) => replaceThing(v, thing));
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, Json> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = replaceThing((value as Record<string, Json>)[key] as Json, thing);
    }
    return out;
  }
  return value;
}

/** What a behaviour makes beside or inside the made thing. */
export interface MadeBehaviour {
  readonly id: string;
  readonly sentence: string;
  readonly plugin?: string;
  /** Answers of the flow being made, when the behaviour has some for it. */
  readonly answers?: Readonly<Record<string, Json>>;
  /** One rule on the made thing, `$thing` replaced. */
  readonly rule?: Json;
  /** One companion flow, `$thing` replaced in its answers. */
  readonly beside?: { readonly starter: string; readonly values: Readonly<Record<string, Json>> };
}

/**
 * What a behaviour makes for the flow `starter` and the thing `thing` (its id, for example
 * `mod:ruby_sword`): its answers for that flow, or its rule or companion flow when it applies
 * to the flow's sort.
 */
export function makeBehaviour(
  item: PluginBehaviour,
  starter: string,
  sort: string | undefined,
  thing: string,
): MadeBehaviour | undefined {
  const b = item.behaviour;
  const fit = behaviourFit(b, starter, sort);
  if (fit === undefined) return undefined;
  const base = {
    id: b.id,
    sentence: b.sentence,
    ...(item.plugin !== undefined ? { plugin: item.plugin } : {}),
  };
  const answers = b.answers?.[starter];
  const withAnswers =
    typeof answers === 'object' && answers !== null
      ? { answers: replaceThing(answers as Json, thing) as Record<string, Json> }
      : {};
  if (fit === 'flow' || fit === 'answers') return { ...base, ...withAnswers };
  if (fit === 'rule') return { ...base, rule: replaceThing(b.rule as Json, thing) };
  const beside = b.beside as { starter: string; values: Record<string, Json> };
  return {
    ...base,
    beside: {
      starter: beside.starter,
      values: replaceThing(beside.values ?? {}, thing) as Record<string, Json>,
    },
  };
}

/**
 * A rule key not yet taken in the book: the key itself, else the key with `_2`, `_3` and so on
 * (B655: a behaviour's rule key is unique within its plugin, not within a book).
 */
export function uniqueRuleKey(key: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(key)) return key;
  for (let n = 2; ; n++) {
    const next = `${key}_${n}`;
    if (!used.has(next)) return next;
  }
}
