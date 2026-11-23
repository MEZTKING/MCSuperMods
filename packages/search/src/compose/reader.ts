/**
 * The answer reader (ADR 0124 D7, D8; B659): the {@link SearchAnswerReader} the index asks
 * (`query.ts`). Once per request it splits the head from the clause, reads the behaviour phrase
 * (or a phrase of two words or more in the head when there is no clause), the name typed as
 * such, the colours, things and numbers; it leaves the clause and the typed name out of the text
 * score and adds a behaviour's own flows as candidates. For each flow, starter or entry with
 * questions it reads the answers (the slots), the behaviour that fits the flow and the words it
 * absorbed. Everything comes from the plugins' data and the host's lists, handed in: no plugin
 * is imported and no game word is written here.
 */

import type { Json, PluginSearchData, SearchQuestionHint } from '@msm/plugin-api';
import type { EntryReading, ReadQuery, RequestReading, SearchAnswerReader } from '../query';
import { assignAnswers, type FlowInput, type RequestMentions } from '../slots/assign';
import { hexAt } from '../slots/colour';
import { numberSpans } from '../slots/number';
import type { Answer, AnswerValidator, ColourMention, Dropped } from '../slots/state';
import { findThings, type SearchThing, thingList } from '../slots/things';
import { answerText, indexesOf } from '../slots/words';
import { readNumbers, wordRole } from '../text';
import type { SearchEntry, SearchQuestion } from '../types';
import { type ChipNote, chipsOf } from '../understood';
import {
  type BehaviourIndex,
  createBehaviourIndex,
  type MadeBehaviour,
  makeBehaviour,
  type PluginBehaviour,
  pickBehaviour,
} from './behaviour';
import { splitClause, typedName } from './clause';

/** What the host knows of one flow beside its questions. */
export interface FlowFacts {
  /** The sort of thing the flow makes (`item`, `block`, `mob`, `vehicle`), for behaviours. */
  readonly sort?: string;
  /** The flow's default answers, read by `appliesWhen`. */
  readonly defaults?: Readonly<Record<string, Json>>;
}

/** One plugin's search data, as the host gathered it. */
export interface ReaderPluginData {
  readonly plugin?: string;
  readonly data: PluginSearchData | undefined;
}

export interface AnswerReaderOptions {
  /** The plugins' search data, in plugin order: question hints and behaviours. */
  readonly plugins?: readonly ReaderPluginData[];
  /** Facts of the flows by starter id. */
  readonly flows?: Readonly<Record<string, FlowFacts>>;
  /** Things the words may name: the open mod's and the game's. */
  readonly things?: readonly SearchThing[];
  /** The wizard's own check of each answer. */
  readonly validate?: AnswerValidator;
  /**
   * The starter id of an entry. By default the action's `starter`, `flowId` or `flow` field,
   * else the id after `flow:` or `starter:`.
   */
  readonly starterOf?: (entry: SearchEntry) => string | undefined;
  /** The entry id of a flow named by a behaviour's `flows`; by default `flow:<starter>`. */
  readonly entryIdOf?: (starter: string) => string;
}

/** An entry's reading with the words behind each answer (for tests and the panel's chips). */
export interface DetailedEntryReading extends EntryReading {
  /** Word indexes behind each answer. */
  readonly sources: Readonly<Record<string, readonly number[]>>;
  /** Numbers dropped for being outside a question's range. */
  readonly dropped: readonly Dropped[];
  /** The starter the entry opens. */
  readonly starter?: string;
}

export interface AnswerReader extends SearchAnswerReader {
  setPlugins(plugins: readonly ReaderPluginData[]): void;
  setFlows(flows: Readonly<Record<string, FlowFacts>>): void;
  setThings(things: readonly SearchThing[]): void;
  setValidator(validate: AnswerValidator | undefined): void;
  /** The behaviour with this id, as a plugin gave it. */
  behaviour(id: string): PluginBehaviour | undefined;
  /** What the behaviour makes for this flow and made thing (`$thing` replaced). */
  make(id: string, starter: string, thing: string): MadeBehaviour | undefined;
}

/** The default starter of an entry. */
export function defaultStarterOf(entry: SearchEntry): string | undefined {
  const action = entry.action as Record<string, unknown> | undefined;
  if (typeof action === 'object' && action !== null) {
    for (const field of ['starter', 'flowId', 'flow']) {
      const value = action[field];
      if (typeof value === 'string' && value !== '') return value;
    }
  }
  for (const prefix of ['flow:', 'starter:']) {
    if (typeof entry.id === 'string' && entry.id.startsWith(prefix)) {
      return entry.id.slice(prefix.length);
    }
  }
  return undefined;
}

const NO_FLOWS: Readonly<Record<string, FlowFacts>> = {};

/** Makes the answer reader. */
export function createAnswerReader(options: AnswerReaderOptions = {}): AnswerReader {
  let hints = new Map<string, Record<string, SearchQuestionHint>>();
  let behaviours: BehaviourIndex = createBehaviourIndex([]);
  let flows: Readonly<Record<string, FlowFacts>> = NO_FLOWS;
  let things = thingList([]);
  let validate = options.validate;
  const starterOf = options.starterOf ?? defaultStarterOf;
  const entryIdOf = options.entryIdOf ?? ((starter: string) => `flow:${starter}`);

  const setPlugins = (plugins: readonly ReaderPluginData[]): void => {
    const nextHints = new Map<string, Record<string, SearchQuestionHint>>();
    const list: PluginBehaviour[] = [];
    for (const item of Array.isArray(plugins) ? plugins : []) {
      const data = item?.data;
      if (typeof data !== 'object' || data === null) continue;
      for (const [starter, byQuestion] of Object.entries(data.questions ?? {})) {
        if (typeof byQuestion !== 'object' || byQuestion === null) continue;
        const merged = nextHints.get(starter) ?? {};
        for (const [question, hint] of Object.entries(byQuestion)) {
          if (!Object.hasOwn(merged, question) && typeof hint === 'object' && hint !== null) {
            merged[question] = hint;
          }
        }
        nextHints.set(starter, merged);
      }
      for (const behaviour of Array.isArray(data.behaviours) ? data.behaviours : []) {
        list.push(item.plugin !== undefined ? { plugin: item.plugin, behaviour } : { behaviour });
      }
    }
    hints = nextHints;
    behaviours = createBehaviourIndex(list);
  };
  setPlugins(options.plugins ?? []);
  if (options.flows !== undefined) flows = options.flows;
  if (options.things !== undefined) things = thingList(options.things);

  const read = (query: ReadQuery): RequestReading | undefined => {
    const words = query.words;
    if (words.length === 0) return undefined;
    const folded = query.folded;
    const notes: ChipNote[] = [];

    // The clause and its behaviour.
    const split = splitClause(words);
    const skip = new Set<number>();
    const answerSkip = new Set<number>();
    let behaviour: { match: ReturnType<BehaviourIndex['match']>[number]; at: number[] } | undefined;
    let unmatchedClause: readonly number[] = [];
    if (split.cue >= 0) {
      skip.add(split.cue);
      answerSkip.add(split.cue);
      for (const i of split.clause) skip.add(i);
      const offset = split.cue + 1;
      const found = behaviours.match(split.clause.map((i) => folded[i] ?? ''));
      for (const m of found) for (let i = m.start; i < m.end; i++) answerSkip.add(i + offset);
      const first = found[0];
      if (first !== undefined) {
        const match = { ...first, start: first.start + offset, end: first.end + offset };
        behaviour = { match, at: indexesOf(match) };
        notes.push({
          at: match.start,
          text: words.slice(match.start, match.end).join(' '),
          kind: 'behaviour',
        });
        for (const other of found.slice(1)) {
          notes.push({
            at: other.start + offset,
            text: words.slice(other.start + offset, other.end + offset).join(' '),
            kind: 'clause',
            struck: true,
          });
        }
      } else {
        // No behaviour: the clause's words may still answer ("that sells diamonds"); it is
        // struck through only when no flow took any of them.
        unmatchedClause = split.clause;
      }
    } else {
      // No clause: a behaviour phrase of two words or more in the head ("an animal you can ride").
      const found = behaviours.match(folded).find((m) => m.end - m.start >= 2);
      if (found !== undefined) {
        behaviour = { match: found, at: indexesOf(found) };
        for (const i of behaviour.at) answerSkip.add(i);
        notes.push({
          at: found.start,
          text: words.slice(found.start, found.end).join(' '),
          kind: 'behaviour',
        });
      }
    }

    // The name typed as such.
    const named = typedName(query.text, query.tokens.normalised, query.tokens.words, words.length);
    if (named !== undefined) {
      for (let i = named.start; i < named.end; i++) {
        skip.add(i);
        answerSkip.add(i);
      }
      notes.push({ at: named.start, text: named.name, kind: 'name' });
    }

    // Colours, things and numbers.
    const text = answerText(words, folded, answerSkip, query.ideas);
    const colours: ColourMention[] = [];
    const colourAt = new Set<number>();
    for (const m of query.vocabulary.colourPhrases.match(folded)) {
      const at = indexesOf(m);
      if (at.some((i) => answerSkip.has(i))) continue;
      colours.push({ start: m.start, end: m.end, colour: m.values[0] as string });
      for (const i of at) colourAt.add(i);
    }
    folded.forEach((w, i) => {
      if (colourAt.has(i) || answerSkip.has(i)) return;
      const byName = query.vocabulary.colours.get(w);
      const token = query.tokens.words[i];
      const hex = token === undefined ? undefined : hexAt(query.tokens.normalised, token.start, w);
      const colour = hex ?? byName;
      if (colour === undefined) return;
      colours.push({ start: i, end: i + 1, colour });
      colourAt.add(i);
    });
    colours.sort((a, b) => a.start - b.start);
    const thingMentions = findThings(
      text,
      query.tokens,
      things,
      query.vocabulary.groups,
      query.ideas,
    );
    const numbers = numberSpans(
      text,
      readNumbers(query.tokens).filter((m) => {
        const first = words[m.first];
        return first !== 'a' && first !== 'an';
      }),
    );
    const numberAt = new Set(numbers.flatMap(indexesOf));
    let noun: number | undefined;
    const headEnd = split.cue >= 0 ? split.cue : words.length;
    for (let i = headEnd - 1; i >= 0; i--) {
      const w = words[i] as string;
      if (answerSkip.has(i) || colourAt.has(i) || numberAt.has(i)) continue;
      if (wordRole(w) !== 'keep' || /^[0-9]/.test(w)) continue;
      noun = i;
      break;
    }
    const mentions: RequestMentions = {
      text,
      colours,
      things: thingMentions,
      numbers,
      ...(named !== undefined ? { named } : {}),
      ...(noun !== undefined ? { noun } : {}),
      headEnd,
    };

    // What the flows took, for the chips (read after every candidate was asked).
    const usedColours = new Set<number>();
    const usedThings = new Set<number>();
    const usedNumbers = new Set<number>();
    const droppedNumbers = new Set<number>();
    const absorbedAny = new Set<number>();

    const extra: string[] = [];
    for (const item of behaviour?.match.values ?? []) {
      for (const starter of item.behaviour.flows ?? []) {
        const id = entryIdOf(starter);
        if (!extra.includes(id)) extra.push(id);
      }
    }

    const answer = (entry: SearchEntry): DetailedEntryReading | undefined => {
      const starter = starterOf(entry);
      const questions: readonly SearchQuestion[] = Array.isArray(entry.questions)
        ? entry.questions
        : [];
      if (starter === undefined && questions.length === 0) return undefined;
      const facts = starter !== undefined ? (flows[starter] ?? {}) : {};
      const flowHints = starter !== undefined ? hints.get(starter) : undefined;
      const picked =
        behaviour !== undefined && starter !== undefined
          ? pickBehaviour(behaviour.match, starter, facts.sort)
          : undefined;
      const behaviourValues =
        picked !== undefined && starter !== undefined
          ? picked.item.behaviour.answers?.[starter]
          : undefined;
      const flow: FlowInput = {
        starter: starter ?? entry.id,
        title: typeof entry.title === 'string' ? entry.title : '',
        questions,
        ...(flowHints !== undefined ? { hints: flowHints } : {}),
        ...(facts.defaults !== undefined ? { defaults: facts.defaults } : {}),
        ...(facts.sort !== undefined ? { sort: facts.sort } : {}),
        ...(behaviourValues !== undefined && behaviour !== undefined
          ? { extra: { values: behaviourValues, sources: behaviour.at } }
          : {}),
      };
      const slots =
        questions.length > 0
          ? assignAnswers(flow, mentions, validate)
          : { answers: new Map<string, Answer>(), used: new Set<number>(), dropped: [] };
      const answers: Record<string, Json> = {};
      const sources: Record<string, readonly number[]> = {};
      for (const q of questions) {
        const a = slots.answers.get(q.id);
        if (a === undefined) continue;
        answers[q.id] = a.value;
        sources[q.id] = a.sources;
        if (a.kind === 'colour') for (const i of a.sources) usedColours.add(i);
        if (a.kind === 'thing') for (const i of a.sources) usedThings.add(i);
        if (a.kind === 'number') for (const i of a.sources) usedNumbers.add(i);
      }
      for (const d of slots.dropped) droppedNumbers.add(d.start);
      for (const i of slots.used) absorbedAny.add(i);
      const absorbed = [...slots.used].filter((i) => !skip.has(i)).sort((a, b) => a - b);
      return {
        ...(Object.keys(answers).length > 0 ? { answers } : {}),
        ...(picked !== undefined
          ? {
              behaviour: { id: picked.item.behaviour.id, sentence: picked.item.behaviour.sentence },
            }
          : {}),
        ...(absorbed.length > 0 ? { absorbed } : {}),
        makesThing:
          noun !== undefined &&
          [...slots.answers.values()].some(
            (a) => a.kind !== 'name' && a.kind !== 'colour' && a.sources.includes(noun),
          ),
        behaviourFits: picked !== undefined,
        sources,
        dropped: slots.dropped,
        ...(starter !== undefined ? { starter } : {}),
      };
    };

    return {
      skip: [...skip].sort((a, b) => a - b),
      extra,
      get chips() {
        const all = [...notes];
        if (unmatchedClause.length > 0 && !unmatchedClause.some((i) => absorbedAny.has(i))) {
          all.push({
            at: split.cue,
            text: unmatchedClause.map((i) => words[i]).join(' '),
            kind: 'clause',
            struck: true,
          });
        }
        for (const m of colours) {
          if (indexesOf(m).some((i) => usedColours.has(i))) {
            all.push({ at: m.start, text: words.slice(m.start, m.end).join(' '), kind: 'colour' });
          }
        }
        for (const m of thingMentions) {
          if (indexesOf(m).some((i) => usedThings.has(i))) {
            all.push({ at: m.start, text: words.slice(m.start, m.end).join(' '), kind: 'thing' });
          }
        }
        for (const m of numbers) {
          const used = indexesOf(m).some((i) => usedNumbers.has(i));
          if (!used && !droppedNumbers.has(m.start)) continue;
          all.push({
            at: m.start,
            text: words.slice(m.start, m.end).join(' '),
            kind: 'number',
            ...(used ? {} : { struck: true }),
          });
        }
        return chipsOf(all);
      },
      answer,
    };
  };

  return {
    read(query) {
      return read(query);
    },
    setPlugins,
    setFlows(next) {
      flows = typeof next === 'object' && next !== null ? next : NO_FLOWS;
    },
    setThings(next) {
      things = thingList(next);
    },
    setValidator(next) {
      validate = next;
    },
    behaviour: (id) => behaviours.byId(id),
    make(id, starter, thing) {
      const item = behaviours.byId(id);
      return item === undefined
        ? undefined
        : makeBehaviour(item, starter, flows[starter]?.sort, thing);
    },
  };
}
