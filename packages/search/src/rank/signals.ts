/**
 * The ranking signals (ADR 0124 D6), each a pure function from plain data to a factor and the
 * word it adds to a hit's `why` list. Context is handed in as plain data (the open mod's kinds
 * and templates, the local history): the engine never asks the app for anything.
 */

import type { SearchIntent } from '../text';
import type { SearchEntry, SearchMode, SearchRequest, SearchSource } from '../types';
import { BONUS, CONTEXT, COVERAGE_FLOOR, HISTORY_MAX_TIMES, SOURCE_WEIGHT } from './weights';

/** One signal's effect on a hit: a factor, and why (absent when the factor is one). */
export interface Signal {
  readonly factor: number;
  readonly why?: string;
}

const NONE: Signal = { factor: 1 };

/** Context handed in by the app as plain data (D6, D11). */
export interface SearchContext {
  /** Ids of entries the open mod already uses (its kinds and the templates of its things). */
  readonly inMod?: readonly string[];
  /** Ids of entries chosen before on this computer, with how many times (D11's local history). */
  readonly history?: Readonly<Record<string, number>>;
  /** What the door leans to when the words carry no intent (Home: make; the palette: command). */
  readonly lean?: SearchIntent;
}

/**
 * The intent the source weights follow: the words' own, else the door's lean, else Very easy's
 * lean to make and the commands scope's lean to commands (D4), else balanced.
 */
export function rankingIntent(
  intent: SearchIntent,
  mode: SearchMode,
  scope: SearchRequest['scope'],
  context: SearchContext,
): SearchIntent {
  if (intent !== 'none') return intent;
  if (context.lean !== undefined && context.lean in SOURCE_WEIGHT) return context.lean;
  if (scope === 'commands') return 'command';
  if (mode === 'very-easy') return 'make';
  return 'none';
}

/** The source weight for the intent (D6). */
export function intentSignal(intent: SearchIntent, source: SearchSource): Signal {
  const factor = SOURCE_WEIGHT[intent]?.[source] ?? 0.5;
  return intent === 'none' ? { factor } : { factor, why: `intent ${intent}` };
}

/** An entry not available on the open target: shown last and greyed, never hidden. */
export function availabilitySignal(entry: SearchEntry): Signal {
  return entry.available === false ? { factor: CONTEXT.unavailable, why: 'not available' } : NONE;
}

/** Very easy keeps technical entries under More, lower down. */
export function modeSignal(entry: SearchEntry, mode: SearchMode): Signal {
  return mode === 'very-easy' && entry.technical === true
    ? { factor: CONTEXT.technical, why: 'technical' }
    : NONE;
}

/** A kind or template the open mod already uses. */
export function modSignal(entry: SearchEntry, inMod: ReadonlySet<string>): Signal {
  return inMod.has(entry.id) ? { factor: CONTEXT.inMod, why: 'in your mod' } : NONE;
}

/** Chosen before on this computer: a small boost, growing to a cap. */
export function historySignal(
  entry: SearchEntry,
  history: Readonly<Record<string, number>> | undefined,
): Signal {
  const times = history !== undefined && Object.hasOwn(history, entry.id) ? history[entry.id] : 0;
  if (typeof times !== 'number' || !Number.isFinite(times) || times <= 0) return NONE;
  const n = Math.min(HISTORY_MAX_TIMES, Math.floor(times));
  return n > 0 ? { factor: 1 + CONTEXT.historyPerTime * n, why: 'chosen before' } : NONE;
}

/** Coverage: the share of the query's words matched, squared, over a floor; all of them a bonus. */
export function coverageSignal(matched: number, required: number): Signal {
  if (required <= 0) return NONE;
  const coverage = Math.min(1, matched / required);
  const factor = COVERAGE_FLOOR + (1 - COVERAGE_FLOOR) * coverage * coverage;
  return coverage === 1
    ? { factor: factor * BONUS.everyWord, why: 'every word' }
    : { factor, why: `${matched} of ${required} words` };
}

/** Whether every key of `keys` matches some term and every term some key. */
function sameWords(keys: readonly string[], terms: readonly ReadonlySet<string>[]): boolean {
  if (keys.length === 0 || terms.length === 0 || keys.length > terms.length) return false;
  return (
    keys.every((key) => terms.some((term) => term.has(key))) &&
    terms.every((term) => keys.some((key) => term.has(key)))
  );
}

/**
 * The title bonuses: the title is the query's words (or the name before a colon is), else the
 * title has every query word. `title` and `name` are the stems of their words; each term is the
 * set of stems that count as that query word.
 */
export function titleSignal(
  title: readonly string[],
  name: readonly string[] | undefined,
  terms: readonly ReadonlySet<string>[],
): Signal {
  if (terms.length === 0) return NONE;
  if (name !== undefined && sameWords(name, terms)) {
    return { factor: BONUS.exactTitle, why: 'exact name' };
  }
  if (sameWords(title, terms)) return { factor: BONUS.exactTitle, why: 'exact title' };
  if (terms.every((term) => title.some((key) => term.has(key)))) {
    return { factor: BONUS.titleHasEvery, why: 'title has every word' };
  }
  return NONE;
}

/** Words in the query's order in the title, and next to each other (two words or more). */
export function orderSignal(
  title: readonly string[],
  terms: readonly ReadonlySet<string>[],
): Signal {
  if (terms.length < 2) return NONE;
  const at: number[] = [];
  for (const term of terms) {
    const i = title.findIndex((key) => term.has(key));
    if (i >= 0) at.push(i);
  }
  if (at.length < 2) return NONE;
  const inOrder = at.every((value, k) => k === 0 || value > (at[k - 1] as number));
  const close =
    new Set(at).size === at.length && Math.max(...at) - Math.min(...at) + 1 === at.length;
  if (inOrder && close) return { factor: BONUS.inOrder * BONUS.close, why: 'in order and close' };
  if (inOrder) return { factor: BONUS.inOrder, why: 'in order' };
  if (close) return { factor: BONUS.close, why: 'close' };
  return NONE;
}

/**
 * Under the make lean, a flow that makes the thing the words name (its answers took the noun)
 * ranks above the thing itself (B650's `netherite pick`, `blue sword`).
 */
export function makesThingSignal(makesThing: boolean, intent: SearchIntent): Signal {
  return makesThing && intent === 'make' ? { factor: BONUS.makesThing, why: 'makes this' } : NONE;
}

/** A behaviour read from the words fits the entry (D7). */
export function behaviourSignal(fits: boolean): Signal {
  return fits ? { factor: BONUS.behaviour, why: 'behaviour' } : NONE;
}

/**
 * The words are the whole title, word for word, with the stop and intent words the matching
 * drops (`whats new` is the title What's new; `very easy mode` is Very easy mode, not Easy
 * mode). Asked only when the query has such a word: without one, {@link titleSignal} already
 * sees the whole title.
 *
 * - `blind`: the words left no term for {@link titleSignal} to compare (`whats new` keeps only
 *   the weak `new`), so the exact title bonus is given here.
 * - `cueInTitle`: the intent was read from a stop word that is the title's own (`whats`), so the
 *   intent's source weight is lifted to at least neutral for this entry: its words are a name,
 *   not a question. An intent read from a word that carries meaning (`make` in "make a potion")
 *   stays: the Potion flow still beats the guide's section "Make a potion".
 */
export function wholeTitleSignal(
  whole: boolean,
  blind: boolean,
  intent: Signal,
  cueInTitle: boolean,
): Signal {
  if (!whole) return NONE;
  const lift = cueInTitle && intent.factor < 1 ? 1 / intent.factor : 1;
  const exact = blind ? BONUS.exactTitle : 1;
  return { factor: BONUS.wholeTitle * exact * lift, why: 'whole title' };
}
