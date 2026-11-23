/**
 * The search index and its query (ADR 0124 D3, D4, D6; B658): layers built, replaced and patched
 * by deltas; the words read in B653's order (intent and numbers on the words as typed; phrases,
 * joined and split words before stop words are dropped; each word left folded, corrected when
 * the index does not know it, its stem class reached); BM25F over the fields with the bonuses and
 * penalties; the intent by source table; availability, mode, the open mod and the local history
 * as plain data; duplicates folded; three Best matches and the sections; the confidence floor;
 * the `why` list; ties broken by source order, title and id. A request never throws: a failure
 * inside is counted (`stats().failures`) and answered with an empty list.
 *
 * Answers from the words and behaviours are B659's: a {@link SearchAnswerReader} handed in reads
 * them, and the ranker counts the words it absorbed as matched.
 */

import type { Json, SearchVocabulary } from '@msm/plugin-api';
import { createDictionary, type Dictionary } from './index/dictionary';
import { actionKey, isPlainWord } from './index/entry';
import {
  createLayer,
  type Layer,
  layerBytes,
  patchLayerEntries,
  setLayerEntries,
  slotOf,
} from './index/layer';
import { type Segment, titleOf } from './index/postings';
import { createVocabulary, type Vocabulary, type WordSense } from './index/vocabulary';
import { accumulate, type Collection, createCollection, idf, locate, saturate } from './rank/bm25f';
import { foldHits } from './rank/fold';
import { arrange, inScope, isConfident } from './rank/sections';
import {
  availabilitySignal,
  behaviourSignal,
  coverageSignal,
  historySignal,
  intentSignal,
  makesThingSignal,
  modeSignal,
  modSignal,
  orderSignal,
  rankingIntent,
  type SearchContext,
  type Signal,
  titleSignal,
  wholeTitleSignal,
} from './rank/signals';
import {
  ABSORBED_BONUS,
  EXACT_ID_SCORE,
  EXPANSION,
  MAX_SECTION_ROWS,
  SCORE_DECIMALS,
  SECTION_ROWS,
  SOURCE_ORDER,
} from './rank/weights';
import {
  fold,
  isStopWord,
  joinsAndSplits,
  normalise,
  readIntent,
  type SearchIntent,
  type TokenisedText,
  tokenise,
  wordRole,
} from './text';
import type {
  SearchAnswer,
  SearchEntry,
  SearchHit,
  SearchHitSlim,
  SearchIndex,
  SearchMode,
  SearchRequest,
  Understood,
} from './types';

export type { SearchContext } from './rank/signals';

/** Characters of a request read; the rest is ignored. */
export const MAX_QUERY_CHARS = 256;
/** Words of a request read. */
export const MAX_QUERY_WORDS = 24;
/** Terms ranked (one bit each in a 32-bit mask). */
const MAX_TERMS = 31;
/** Words offered for the word being typed. */
const PREFIX_WORDS = 6;
/** Typo candidates read per unknown word. */
const TYPO_CANDIDATES = 2;
/**
 * Candidates read per unknown word when more of them tie with the best on edits and first letter
 * (`soin`: `spin`, `soil` and `skin`). The typo index's own ties (a key beside, frequency) know
 * nothing of the other words; the ranker does, so every tied word is offered and the correction
 * shown is the one the first result was found by (ADR 0124's open item after B666: "mob soin"
 * is Mob skin). Only for ties: the precision SQ3 measured for the first candidate is unchanged.
 */
const TYPO_TIES = 4;
/** Hits compared for folding (more than can ever be shown). */
const FOLD_WINDOW = 400;
/** Titles' whole-title keys remembered (pure); cleared beyond this many. */
const MAX_TITLE_MEMO = 20000;
const wholeTitles = new Map<string, string>();
/** The score of an entry a behaviour names with no word of its own matched (B650: 2). */
const EXTRA_SCORE = 2;

/** What the answer reader is given: the words as the query read them. */
export interface ReadQuery {
  /** The text read (prefix and anything past {@link MAX_QUERY_CHARS} removed). */
  readonly text: string;
  readonly mode: SearchMode;
  /** The intent read from the words. */
  readonly intent: SearchIntent;
  /** The intent the source weights follow (the words', else the door's lean). */
  readonly lean: SearchIntent;
  readonly tokens: TokenisedText;
  /** The normalised words (at most {@link MAX_QUERY_WORDS}). */
  readonly words: readonly string[];
  /** The folded words, corrections applied (`netherrite` read as the vocabulary's word). */
  readonly folded: readonly string[];
  /** Word index to the corrected word, for every corrected word. */
  readonly corrections: ReadonlyMap<number, string>;
  /** Word index to the vocabulary ideas the word (or a phrase it starts) reaches. */
  readonly ideas: ReadonlyMap<number, readonly string[]>;
  /** The merged vocabulary. */
  readonly vocabulary: Vocabulary;
}

/** What the reader says of one entry (D7). */
export interface EntryReading {
  readonly answers?: Readonly<Record<string, Json>>;
  readonly behaviour?: { readonly id: string; readonly sentence: string };
  /** Word indexes absorbed into answers: counted as matched for the ranker. */
  readonly absorbed?: readonly number[];
  /** The answers took the noun of the thing: this flow makes the thing named. */
  readonly makesThing?: boolean;
  /** A behaviour read from the words fits this entry. */
  readonly behaviourFits?: boolean;
}

/** What the reader says of a request, once. */
export interface RequestReading {
  /** Word indexes left out of the text score (a clause read as a behaviour). */
  readonly skip?: readonly number[];
  /** Entry ids made candidates even with no word of theirs matched (a behaviour's own flows). */
  readonly extra?: readonly string[];
  /** Chips added to the understood line. */
  readonly chips?: Understood['chips'];
  /** The reading of one candidate; asked for entries with questions and for flows and starters. */
  answer?(entry: SearchEntry): EntryReading | undefined;
}

/** Reads answers and behaviours from the words (B659's slots and compose modules). */
export interface SearchAnswerReader {
  read(query: ReadQuery): RequestReading | undefined;
}

export interface SearchEngineOptions {
  /** The plugins' vocabularies, in plugin order. */
  readonly vocabulary?: readonly SearchVocabulary[];
  /** Protected words (game id words, vocabulary headwords); folded here. */
  readonly protect?: Iterable<string>;
  readonly answers?: SearchAnswerReader;
  readonly context?: SearchContext;
}

/** Numbers for tests and the worker's report. */
export interface SearchStats {
  readonly layers: Readonly<Record<string, number>>;
  readonly entries: number;
  readonly terms: number;
  readonly postings: number;
  readonly words: number;
  readonly bytes: number;
  readonly failures: number;
}

/** The index with the setters the worker needs beside the frozen {@link SearchIndex}. */
export interface SearchEngine extends SearchIndex {
  setVocabulary(vocabularies: readonly SearchVocabulary[]): void;
  setProtected(words: Iterable<string>): void;
  setAnswerReader(reader: SearchAnswerReader | undefined): void;
  setContext(context: SearchContext): void;
  /** Builds what the next query needs (the dictionary, the typo index) now, not at the key press. */
  warm(): void;
  /** The live entry with this id, if any layer holds it. */
  entry(id: string): SearchEntry | undefined;
  stats(): SearchStats;
}

/** A hit as it crosses the worker: its entry's id in place of the entry. */
export function toSlim(hit: SearchHit): SearchHitSlim {
  return {
    id: hit.entry.id,
    score: hit.score,
    ...(hit.answers !== undefined ? { answers: hit.answers } : {}),
    ...(hit.behaviour !== undefined ? { behaviour: hit.behaviour } : {}),
    why: hit.why,
  };
}

/** One way a query word reaches index words. Every part must match (a phrase has several). */
interface Group {
  readonly parts: readonly (readonly string[])[];
  readonly weight: number;
  readonly why: string;
  readonly exactId?: boolean;
  readonly typo?: boolean;
}

/** A query term: words `start` to `end` of the query read as one thing. */
interface Term {
  readonly start: number;
  readonly end: number;
  readonly groups: readonly Group[];
  /** Weak and extra readings do not count towards coverage. */
  readonly optional: boolean;
  /** Stems that count as this word in a title, one set per word the term stands for. */
  readonly keys: readonly ReadonlySet<string>[];
}

interface Reading {
  readonly tokens: TokenisedText;
  readonly words: string[];
  readonly folded: string[];
  readonly intent: SearchIntent;
  /** The words that said the intent. */
  readonly cue: readonly number[];
  readonly terms: Term[];
  readonly corrections: Map<number, string>;
  readonly misspelt: Set<number>;
  /** Word index to the word as typed, for words offered more than one tied correction. */
  readonly typos: Map<number, string>;
  readonly notUnderstood: number[];
  readonly ideas: Map<number, string[]>;
}

interface State {
  readonly key: string;
  readonly dictionary: Dictionary;
  readonly collection: Collection;
  readonly layerOf: Map<Segment, string>;
  tt: Float64Array;
  best: Float64Array;
  total: Float64Array;
  mask: Uint32Array;
  seen: Uint8Array;
}

const MODES: readonly SearchMode[] = ['very-easy', 'easy', 'advanced'];
const SCOPES: readonly NonNullable<SearchRequest['scope']>[] = [
  'make',
  'mine',
  'minecraft',
  'help',
  'commands',
];
const PREFIX_SCOPE: Readonly<Record<string, NonNullable<SearchRequest['scope']>>> = {
  '>': 'commands',
  '@': 'mine',
  '#': 'minecraft',
  '?': 'help',
};
const SOURCE_RANK = new Map(SOURCE_ORDER.map((source, i) => [source, i]));
const SCALE = 10 ** SCORE_DECIMALS;

function round(score: number): number {
  return Number.isFinite(score) ? Math.round(score * SCALE) / SCALE : 0;
}

function compareText(a: unknown, b: unknown): number {
  const x = typeof a === 'string' ? a : '';
  const y = typeof b === 'string' ? b : '';
  return x < y ? -1 : x > y ? 1 : 0;
}

function emptyAnswer(): SearchAnswer {
  return { understood: { chips: [] }, best: [], sections: [], confident: false };
}

function popcount(n: number): number {
  let v = n - ((n >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Makes an index. */
export function createSearchIndex(options: SearchEngineOptions = {}): SearchEngine {
  const layers = new Map<string, Layer>();
  let vocabulary = createVocabulary(options.vocabulary ?? []);
  let vocabularyVersion = 0;
  let protect: string[] = [];
  let protectVersion = 0;
  let reader = options.answers;
  let context: SearchContext = {};
  let inMod: ReadonlySet<string> = new Set();
  let state: State | undefined;
  let failures = 0;

  const setProtected = (words: Iterable<string>): void => {
    const out = new Set<string>();
    try {
      for (const word of words) if (typeof word === 'string') out.add(fold(normalise(word).trim()));
    } catch {
      failures++;
    }
    protect = [...out].sort();
    protectVersion++;
  };
  const setContext = (next: SearchContext): void => {
    context = typeof next === 'object' && next !== null ? next : {};
    inMod = new Set(Array.isArray(context.inMod) ? context.inMod : []);
  };
  if (options.protect !== undefined) setProtected(options.protect);
  if (options.context !== undefined) setContext(options.context);

  const sortedLayers = (): Layer[] =>
    [...layers.values()].sort((a, b) => compareText(a.name, b.name));

  const refresh = (): State => {
    const ordered = sortedLayers();
    const key = `${ordered.map((l) => `${l.name}:${l.version}`).join('|')}#${vocabularyVersion}#${protectVersion}`;
    if (state !== undefined && state.key === key) return state;
    const vocabularyWords = new Map<string, number>();
    for (const word of vocabulary.words) vocabularyWords.set(word, 1);
    const dictionary = createDictionary(
      [...ordered.map((layer) => layer.words), vocabularyWords],
      protect,
    );
    const collection = createCollection(ordered);
    const layerOf = new Map<Segment, string>();
    for (const layer of ordered)
      for (const segment of layer.segments) layerOf.set(segment, layer.name);
    const slots = collection.slots;
    const reuse = state !== undefined && state.tt.length >= slots;
    state = {
      key,
      dictionary,
      collection,
      layerOf,
      tt: reuse ? (state as State).tt : new Float64Array(slots),
      best: reuse ? (state as State).best : new Float64Array(slots),
      total: reuse ? (state as State).total : new Float64Array(slots),
      mask: reuse ? (state as State).mask : new Uint32Array(slots),
      seen: reuse ? (state as State).seen : new Uint8Array(slots),
    };
    return state;
  };

  const layerFor = (name: string): Layer => {
    let layer = layers.get(name);
    if (layer === undefined) {
      layer = createLayer(name);
      layers.set(name, layer);
    }
    return layer;
  };

  const findEntry = (id: string): { segment: Segment; doc: number } | undefined => {
    for (const layer of sortedLayers()) {
      const slot = slotOf(layer, id);
      if (slot !== undefined) return slot;
    }
    return undefined;
  };

  const engine: SearchEngine = {
    setLayer(name, entries) {
      try {
        if (typeof name !== 'string') return;
        setLayerEntries(layerFor(name), entries);
      } catch {
        failures++;
      }
    },
    patchLayer(name, upserts, removes) {
      try {
        if (typeof name !== 'string') return;
        patchLayerEntries(layerFor(name), upserts, removes);
      } catch {
        failures++;
      }
    },
    query(request) {
      try {
        return runQuery(refresh(), request);
      } catch {
        failures++;
        // The scratch arrays may be left dirty: the next query starts from fresh ones.
        state = undefined;
        return emptyAnswer();
      }
    },
    setVocabulary(vocabularies) {
      vocabulary = createVocabulary(vocabularies);
      vocabularyVersion++;
    },
    setProtected,
    setAnswerReader(next) {
      reader = next;
    },
    setContext,
    warm() {
      try {
        refresh();
      } catch {
        failures++;
      }
    },
    entry(id) {
      const slot = typeof id === 'string' ? findEntry(id) : undefined;
      return slot === undefined ? undefined : slot.segment.entries[slot.doc];
    },
    stats() {
      let terms = 0;
      let postings = 0;
      let bytes = 0;
      const counts: Record<string, number> = {};
      for (const layer of sortedLayers()) {
        counts[layer.name] = layer.live;
        bytes += layerBytes(layer);
        for (const segment of layer.segments) {
          terms += segment.terms.size;
          postings += segment.docs.length;
        }
      }
      const s = state;
      return {
        layers: counts,
        entries: Object.values(counts).reduce((a, b) => a + b, 0),
        terms,
        postings,
        words: s?.dictionary.counts.size ?? 0,
        bytes,
        failures,
      };
    },
  };

  /**
   * The vocabulary senses of a folded word or of a word of its stem class (`teapots` has the
   * senses of `teapot`), listed misspellings only for the word itself.
   */
  const sensesOf = (s: State, word: string): WordSense[] => {
    const out: WordSense[] = [];
    const add = (sense: WordSense): void => {
      if (!out.some((o) => o.idea === sense.idea && o.kind === sense.kind)) out.push(sense);
    };
    for (const sense of vocabulary.senses(word)) add(sense);
    const forms = [s.dictionary.stem(word), ...s.dictionary.siblings(word)];
    for (const form of forms) {
      if (form === word) continue;
      for (const sense of vocabulary.senses(form)) if (sense.kind !== 'misspelling') add(sense);
    }
    return out;
  };

  /** The groups by which an index word (folded) is reached, at `weight` times their own. */
  const expand = (s: State, word: string, weight: number, why: string, typo: boolean): Group[] => {
    const groups: Group[] = [];
    const own = s.dictionary.siblings(word);
    if (own.length > 0) groups.push({ parts: [own], weight, why, typo });
    const ownSet = new Set(own);
    for (const sense of sensesOf(s, word)) {
      if (sense.kind === 'misspelling') continue;
      const group = vocabulary.groups.get(sense.idea);
      if (group === undefined) continue;
      const w = weight * (sense.kind === 'near' ? EXPANSION.near : EXPANSION.same);
      const singles = new Set<string>();
      for (const form of group.forms) {
        if (form.length === 1) {
          for (const surface of s.dictionary.siblings(form[0] as string)) {
            if (!ownSet.has(surface)) singles.add(surface);
          }
          continue;
        }
        const parts = form
          .filter((part) => !isStopWord(part))
          .map((part) => s.dictionary.siblings(part));
        if (parts.length > 0 && parts.every((part) => part.length > 0)) {
          groups.push({ parts, weight: w, why: `idea ${sense.idea}`, typo });
        }
      }
      if (singles.size > 0) {
        groups.push({ parts: [[...singles].sort()], weight: w, why: `idea ${sense.idea}`, typo });
      }
      if (group.vanillaIds.length > 0) {
        groups.push({ parts: [group.vanillaIds], weight: w, why: `idea ${sense.idea}`, typo });
      }
    }
    return groups;
  };

  /** The stems a term counts as in a title: the word's own and its vocabulary forms'. */
  const keysOf = (s: State, words: readonly string[], groups: readonly Group[]): Set<string>[] => {
    const sets = words.filter((w) => !isStopWord(w)).map((w) => new Set([s.dictionary.stem(w)]));
    if (sets.length === 0) return [];
    const first = sets[0] as Set<string>;
    for (const group of groups) {
      if (group.parts.length !== 1) continue;
      for (const surface of group.parts[0] as readonly string[])
        first.add(s.dictionary.stem(surface));
    }
    return sets;
  };

  const readWords = (s: State, text: string): Reading => {
    const tokens = tokenise(text);
    const words = tokens.words.slice(0, MAX_QUERY_WORDS).map((t) => t.text);
    const intentReading = readIntent(words, text);
    const intent = intentReading.intent;
    const cue = intentReading.cue;
    // The question's own words ("how does … work"): read for the intent, never matched.
    const frame = new Set(intentReading.frame ?? []);
    const folded = words.map(fold);
    const terms: Term[] = [];
    const consumed = new Uint8Array(words.length);
    const corrections = new Map<number, string>();
    const misspelt = new Set<number>();
    const typos = new Map<number, string>();
    const notUnderstood: number[] = [];
    const ideas = new Map<number, string[]>();
    const known = (w: string): boolean =>
      s.dictionary.has(w) || vocabulary.senses(w).length > 0 || s.dictionary.siblings(w).length > 0;
    const last = tokens.words[words.length - 1];
    const typing =
      last !== undefined &&
      words.length === tokens.words.length &&
      last.end === tokens.normalised.length;
    const addIdea = (i: number, idea: string): void => {
      const list = ideas.get(i);
      if (list === undefined) ideas.set(i, [idea]);
      else if (!list.includes(idea)) list.push(idea);
    };

    // Whole ids: an exact token each; the words inside it are optional readings. Only whole-id
    // tokens are exact surfaces: the typed id itself, and its path only when the path is itself
    // a whole id (`end_stone`). A one-word path (`stone` of `minecraft:stone`) is an ordinary word
    // of every id that holds it (`end_stone`, `snowy_plains`), so it is left to the optional word
    // readings (ADR 0124's open item, B666's finding).
    const inId = new Uint8Array(words.length);
    for (const id of tokens.ids) {
      const inside: number[] = [];
      tokens.words.slice(0, words.length).forEach((t, i) => {
        if (t.start >= id.start && t.end <= id.end) inside.push(i);
      });
      if (inside.length === 0) continue;
      for (const i of inside) inId[i] = 1;
      const colon = id.text.indexOf(':');
      const path = colon >= 0 ? id.text.slice(colon + 1) : '';
      const surfaces = path !== '' && !isPlainWord(path) ? [id.text, path] : [id.text];
      terms.push({
        start: inside[0] as number,
        end: (inside[inside.length - 1] as number) + 1,
        groups: [{ parts: [surfaces], weight: EXPANSION.exact, why: 'exact id', exactId: true }],
        optional: false,
        keys: [],
      });
    }

    // Phrases of the vocabulary, stop words still in place.
    for (const match of vocabulary.phrases.match(folded)) {
      let free = true;
      for (let i = match.start; i < match.end; i++)
        if (consumed[i] === 1 || inId[i] === 1) free = false;
      if (!free) continue;
      const literal = folded.slice(match.start, match.end).filter((w) => !isStopWord(w));
      const groups: Group[] = [];
      const parts = literal.map((w) => s.dictionary.siblings(w));
      if (parts.length > 0 && parts.every((p) => p.length > 0)) {
        groups.push({ parts, weight: EXPANSION.exact, why: `phrase ${match.phrase}` });
      }
      for (const sense of match.values) {
        addIdea(match.start, sense.idea);
        groups.push(
          ...expandIdea(s, sense.idea, sense.kind === 'near' ? EXPANSION.near : EXPANSION.same),
        );
      }
      if (groups.length === 0) continue;
      for (let i = match.start; i < match.end; i++) consumed[i] = 1;
      terms.push({
        start: match.start,
        end: match.end,
        groups,
        optional: false,
        keys: keysOf(s, literal, groups),
      });
    }

    // Colour names are understood (they are answers), never corrected or struck.
    const colour = new Uint8Array(words.length);
    folded.forEach((w, i) => {
      if (vocabulary.colours.has(w)) colour[i] = 1;
    });
    for (const match of vocabulary.colourPhrases.match(folded)) {
      for (let i = match.start; i < match.end; i++) colour[i] = 1;
    }

    // Joined and split words.
    for (const reading of joinsAndSplits(folded, (w) => s.dictionary.has(w))) {
      const span = [];
      for (let i = reading.start; i < reading.end; i++) span.push(i);
      if (span.some((i) => consumed[i] === 1 || inId[i] === 1)) continue;
      if (
        reading.kind === 'split' &&
        vocabulary.senses(folded[reading.start] as string).length > 0
      ) {
        continue;
      }
      if (reading.kind === 'joined') {
        const joined = reading.words[0] as string;
        const bothKnown = span.every((i) => known(folded[i] as string));
        const groups = expand(
          s,
          joined,
          bothKnown ? EXPANSION.joined : EXPANSION.exact,
          'joined',
          false,
        );
        if (groups.length === 0) continue;
        if (!bothKnown) for (const i of span) consumed[i] = 1;
        terms.push({
          start: reading.start,
          end: reading.end,
          groups,
          optional: bothKnown,
          keys: keysOf(s, [joined], groups),
        });
        continue;
      }
      consumed[reading.start] = 1;
      for (const part of reading.words) {
        const groups = expand(s, part, EXPANSION.split, 'split', false);
        terms.push({
          start: reading.start,
          end: reading.end,
          groups,
          optional: false,
          keys: keysOf(s, [part], groups),
        });
      }
    }

    // Every word left.
    for (let i = 0; i < words.length; i++) {
      if (consumed[i] === 1 || frame.has(i)) continue;
      const raw = words[i] as string;
      let w = folded[i] as string;
      const role = wordRole(raw);
      if (role === 'drop') continue;
      const optional = inId[i] === 1;
      if (role === 'weak') {
        const groups = s.dictionary.has(w)
          ? expand(s, w, EXPANSION.weak, 'intent word', false)
          : [];
        if (groups.length > 0)
          terms.push({ start: i, end: i + 1, groups, optional: true, keys: [] });
        continue;
      }
      if (/^[0-9]/.test(w)) {
        // A bare number is for the answers; it matches only where the index has it as a word.
        const groups = s.dictionary.has(w) ? expand(s, w, EXPANSION.exact, `word ${w}`, false) : [];
        if (groups.length > 0)
          terms.push({ start: i, end: i + 1, groups, optional: true, keys: [] });
        continue;
      }
      const groups: Group[] = [];
      // The word being typed: read as the start of longer words; corrected only if it starts none.
      const completions =
        typing && i === words.length - 1 && w.length >= 2
          ? s.dictionary.typo.complete(w, PREFIX_WORDS)
          : [];
      const listed = vocabulary.senses(w).find((sense) => sense.kind === 'misspelling');
      if (listed !== undefined && !s.dictionary.has(w)) {
        const to = listed.idea;
        corrections.set(i, to);
        misspelt.add(i);
        addIdea(i, to);
        groups.push(...expandIdea(s, to, EXPANSION.misspelling, `misspelling ${w}->${to}`));
        w = to;
      } else if (known(w)) {
        groups.push(...expand(s, w, EXPANSION.exact, `word ${w}`, false));
      } else if (colour[i] === 0 && completions.length === 0) {
        const all = s.dictionary.typo.correct(w, TYPO_TIES);
        const lead = all[0];
        const tied = all.filter(
          (c, k) =>
            k < TYPO_CANDIDATES ||
            (c.edits === lead?.edits && c.word[0] === lead.word[0] && c.word[0] === w[0]),
        );
        if (tied.length > 1) typos.set(i, w);
        tied.forEach((candidate) => {
          const found = expand(
            s,
            candidate.word,
            EXPANSION.typo ** candidate.edits,
            `typo ${w}->${candidate.word}`,
            true,
          );
          if (found.length === 0) return;
          if (!corrections.has(i)) corrections.set(i, candidate.word);
          groups.push(...found);
        });
      }
      for (const sense of sensesOf(s, corrections.get(i) ?? w)) addIdea(i, sense.idea);
      if (completions.length > 0 && !misspelt.has(i)) {
        const surfaces = new Set<string>();
        for (const word of completions) {
          for (const surface of s.dictionary.siblings(word)) surfaces.add(surface);
        }
        groups.push({
          parts: [[...surfaces].sort()],
          weight: EXPANSION.prefix,
          why: `prefix ${w}`,
        });
      }
      if (groups.length === 0) {
        if (colour[i] === 0 && !optional) notUnderstood.push(i);
        continue;
      }
      const corrected = corrections.get(i);
      terms.push({
        start: i,
        end: i + 1,
        groups,
        optional: optional || (colour[i] === 1 && !s.dictionary.has(w)),
        keys: keysOf(s, (corrected ?? w).split(' '), groups),
      });
    }
    const correctedFolded = folded.map((w, i) => corrections.get(i) ?? w);
    terms.sort((a, b) => a.start - b.start || a.end - b.end);
    return {
      tokens,
      words,
      folded: correctedFolded,
      intent,
      cue,
      terms: terms.slice(0, MAX_TERMS),
      corrections,
      misspelt,
      typos,
      notUnderstood,
      ideas,
    };
  };

  /** The groups of a vocabulary idea, every form of it at `weight`. */
  const expandIdea = (s: State, idea: string, weight: number, why = `idea ${idea}`): Group[] => {
    const group = vocabulary.groups.get(idea);
    const out: Group[] = [];
    const singles = new Set<string>();
    const forms = group?.forms ?? [idea.split(' ')];
    for (const form of forms) {
      if (form.length === 1) {
        for (const surface of s.dictionary.siblings(form[0] as string)) singles.add(surface);
        continue;
      }
      const parts = form
        .filter((part) => !isStopWord(part))
        .map((part) => s.dictionary.siblings(part));
      if (parts.length > 0 && parts.every((part) => part.length > 0))
        out.push({ parts, weight, why });
    }
    if (singles.size > 0) out.unshift({ parts: [[...singles].sort()], weight, why });
    if (group !== undefined && group.vanillaIds.length > 0) {
      out.push({ parts: [group.vanillaIds], weight, why });
    }
    return out;
  };

  const runQuery = (s: State, request: SearchRequest): SearchAnswer => {
    if (typeof request !== 'object' || request === null) return emptyAnswer();
    const mode: SearchMode = MODES.includes(request.mode) ? request.mode : 'easy';
    let scope = SCOPES.includes(request.scope as never) ? request.scope : undefined;
    let text = typeof request.text === 'string' ? request.text.slice(0, MAX_QUERY_CHARS) : '';
    if (mode === 'advanced') {
      const prefix = /^\s*([>@#?])\s*/.exec(text);
      if (prefix !== null) {
        scope = PREFIX_SCOPE[prefix[1] as string];
        text = text.slice(prefix[0].length);
      }
    }
    const rows =
      typeof request.limit === 'number' && Number.isFinite(request.limit)
        ? Math.max(1, Math.min(MAX_SECTION_ROWS, Math.floor(request.limit)))
        : SECTION_ROWS;
    if (text.trim() === '') return emptyAnswer();

    const read = readWords(s, text);
    const lean = rankingIntent(read.intent, mode, scope, context);
    let readingOfRequest: RequestReading | undefined;
    if (reader !== undefined) {
      try {
        readingOfRequest = reader.read({
          text,
          mode,
          intent: read.intent,
          lean,
          tokens: read.tokens,
          words: read.words,
          folded: read.folded,
          corrections: read.corrections,
          ideas: read.ideas,
          vocabulary,
        });
      } catch {
        failures++;
      }
    }
    const skip = new Set(readingOfRequest?.skip ?? []);
    const terms = read.terms.filter((term) => {
      for (let i = term.start; i < term.end; i++) if (!skip.has(i)) return true;
      return false;
    });
    const notUnderstood = read.notUnderstood.filter((i) => !skip.has(i));

    // Text scores.
    const { collection, tt, best, total, mask, seen } = s;
    const candidates: number[] = [];
    const exactId = new Set<number>();
    const termGroup: Map<number, number>[] = [];
    let requiredMask = 0;
    const touched: number[] = [];
    const bestTouched: number[] = [];
    terms.forEach((term, ti) => {
      const bit = 2 ** ti;
      if (!term.optional) requiredMask |= bit;
      const groupOf = new Map<number, number>();
      termGroup.push(groupOf);
      const offer = (g: number, v: number, gi: number): void => {
        if (v <= (best[g] as number)) return;
        if (best[g] === 0) bestTouched.push(g);
        best[g] = v;
        groupOf.set(g, gi);
      };
      term.groups.forEach((group, gi) => {
        if (group.parts.length === 1) {
          accumulate(collection, group.parts[0] as readonly string[], tt, touched);
          const weight = idf(touched.length, collection.docs) * group.weight;
          for (const g of touched) {
            let v = saturate(tt[g] as number) * weight;
            if (group.exactId === true) {
              v = Math.max(v, EXACT_ID_SCORE * group.weight);
              exactId.add(g);
            }
            tt[g] = 0;
            offer(g, v, gi);
          }
          touched.length = 0;
          return;
        }
        const sums = new Map<number, number>();
        const counts = new Map<number, number>();
        for (const part of group.parts) {
          accumulate(collection, part, tt, touched);
          const weight = idf(touched.length, collection.docs);
          for (const g of touched) {
            sums.set(g, (sums.get(g) ?? 0) + saturate(tt[g] as number) * weight);
            counts.set(g, (counts.get(g) ?? 0) + 1);
            tt[g] = 0;
          }
          touched.length = 0;
        }
        for (const [g, n] of counts) {
          if (n === group.parts.length) offer(g, (sums.get(g) as number) * group.weight, gi);
        }
      });
      for (const g of bestTouched) {
        if (seen[g] === 0) {
          seen[g] = 1;
          candidates.push(g);
        }
        total[g] = (total[g] as number) + (best[g] as number);
        if (!term.optional) mask[g] = ((mask[g] as number) | bit) >>> 0;
        best[g] = 0;
      }
      bestTouched.length = 0;
    });
    for (const id of readingOfRequest?.extra ?? []) {
      const slot = typeof id === 'string' ? findEntry(id) : undefined;
      if (slot === undefined) continue;
      const g = slot.segment.base + slot.doc;
      if (seen[g] === 0) {
        seen[g] = 1;
        candidates.push(g);
      }
      total[g] = Math.max(total[g] as number, EXTRA_SCORE);
    }

    // The whole title, stop and intent words included: asked only when the words have one that
    // the matching drops or reads as a cue (else the title signal sees the whole title).
    const wholeText = read.words.some((w) => wordRole(w) !== 'keep') ? read.folded.join(' ') : '';
    // The intent was read from a stop word (`whats`), not from a word with meaning (`make`).
    const cueIsStop =
      read.intent === lean &&
      read.cue.length > 0 &&
      read.cue.every((i) => isStopWord(read.words[i] as string));
    const isWholeTitle = (title: unknown): boolean => {
      if (wholeText === '' || typeof title !== 'string') return false;
      let key = wholeTitles.get(title);
      if (key === undefined) {
        if (wholeTitles.size >= MAX_TITLE_MEMO) wholeTitles.clear();
        key = tokenise(title)
          .words.map((t) => fold(t.text))
          .join(' ');
        wholeTitles.set(title, key);
      }
      return key === wholeText;
    };

    // Each candidate: signals, answers, why.
    const required = terms.filter((t) => !t.optional);
    const titleTerms = required.flatMap((t) => t.keys);
    const hits: { hit: SearchHit; layer: string }[] = [];
    try {
      for (const g of candidates) {
        const place = locate(collection, g);
        if (place === undefined) continue;
        const { segment, doc } = place;
        const entry = segment.entries[doc] as SearchEntry;
        if (!inScope(entry, mode, scope)) continue;
        let text = total[g] as number;
        let matched = popcount(((mask[g] as number) & requiredMask) >>> 0);
        const why: string[] = [];
        terms.forEach((term, ti) => {
          const gi = termGroup[ti]?.get(g);
          if (gi !== undefined) why.push((term.groups[gi] as Group).why);
        });
        let entryReading: EntryReading | undefined;
        const asks =
          readingOfRequest?.answer !== undefined &&
          (entry.source === 'flow' ||
            entry.source === 'starter' ||
            (Array.isArray(entry.questions) && entry.questions.length > 0));
        if (asks) {
          try {
            entryReading = readingOfRequest?.answer?.(entry);
          } catch {
            failures++;
          }
        }
        if (entryReading?.absorbed !== undefined && entryReading.absorbed.length > 0) {
          const absorbed = new Set(entryReading.absorbed);
          terms.forEach((term, ti) => {
            const bit = 2 ** ti;
            if (term.optional || ((mask[g] as number) & bit) !== 0) return;
            for (let i = term.start; i < term.end; i++) if (!absorbed.has(i)) return;
            matched++;
            text += ABSORBED_BONUS;
          });
          why.push('answers');
        }
        const signals: Signal[] = [coverageSignal(matched, required.length)];
        const titleKeys = titleOf(segment, doc).map((w) => s.dictionary.stem(w));
        const nameLength = segment.nameLengths[doc] as number;
        const nameKeys = nameLength > 0 ? titleKeys.slice(0, nameLength) : undefined;
        const title = titleSignal(titleKeys, nameKeys, titleTerms);
        const intent = intentSignal(lean, entry.source);
        signals.push(
          title,
          orderSignal(titleKeys, titleTerms),
          intent,
          wholeTitleSignal(isWholeTitle(entry.title), titleTerms.length === 0, intent, cueIsStop),
          makesThingSignal(entryReading?.makesThing === true, lean),
          behaviourSignal(entryReading?.behaviourFits === true),
          availabilitySignal(entry),
          modeSignal(entry, mode),
          modSignal(entry, inMod),
          historySignal(entry, context.history),
        );
        let score = text;
        for (const signal of signals) {
          score *= signal.factor;
          if (signal.why !== undefined) why.push(signal.why);
        }
        if (exactId.has(g)) why.unshift('exact id');
        const hit: SearchHit = {
          entry,
          score: round(score),
          ...(entryReading?.answers !== undefined ? { answers: entryReading.answers } : {}),
          ...(entryReading?.behaviour !== undefined ? { behaviour: entryReading.behaviour } : {}),
          why,
        };
        hits.push({ hit, layer: s.layerOf.get(segment) ?? '' });
      }
    } finally {
      for (const g of candidates) {
        total[g] = 0;
        mask[g] = 0;
        seen[g] = 0;
      }
    }

    hits.sort(
      (a, b) =>
        b.hit.score - a.hit.score ||
        (SOURCE_RANK.get(a.hit.entry.source) ?? 99) - (SOURCE_RANK.get(b.hit.entry.source) ?? 99) ||
        compareText(a.hit.entry.title, b.hit.entry.title) ||
        compareText(a.hit.entry.id, b.hit.entry.id) ||
        compareText(a.layer, b.layer),
    );
    const folded = foldHits(
      hits.map((h) => h.hit),
      (hit) => actionKey(hit.entry.action),
      FOLD_WINDOW,
    );

    const first = folded.find((hit) => hit.entry.available !== false);
    // A tied typo: the correction shown is the one the first result was found by.
    for (const [i, typed] of read.typos) {
      const by = first?.why.find((why) => why.startsWith(`typo ${typed}->`));
      if (by !== undefined) read.corrections.set(i, by.slice(`typo ${typed}->`.length));
    }
    const top = first?.score ?? 0;
    const plain = required.filter((t) => t.groups.some((g) => g.typo !== true)).length;
    const confident = isConfident({
      top,
      plain,
      words: required.length + notUnderstood.length,
      corrected: read.corrections.size,
      exactId: exactId.size > 0,
    });
    const { best: bestHits, sections } = arrange(folded, { mode, confident, rows });
    return {
      understood: understood(read, notUnderstood, readingOfRequest?.chips),
      best: bestHits,
      sections,
      confident,
    };
  };

  return engine;
}

/** What the query understood: corrections shown, words not placed struck through (D8). */
function understood(
  read: Reading,
  notUnderstood: readonly number[],
  extra: Understood['chips'] | undefined,
): Understood {
  const chips: Understood['chips'][number][] = [];
  for (const [i, to] of [...read.corrections].sort((a, b) => a[0] - b[0])) {
    chips.push({ text: to, kind: read.misspelt.has(i) ? 'misspelling' : 'corrected' });
  }
  for (const i of notUnderstood) {
    chips.push({ text: read.words[i] as string, kind: 'not-understood', struck: true });
  }
  if (Array.isArray(extra)) chips.push(...extra);
  if (read.corrections.size === 0) return { chips };
  const corrected = read.words.map((w, i) => read.corrections.get(i) ?? w).join(' ');
  return { corrected, chips };
}
