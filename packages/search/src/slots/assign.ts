/**
 * The answers of one flow from the words (ADR 0124 D7; B659), the slots in B650's clash order:
 * choices and sets first (the "from" and "like" rules, numbered repeats, `sameAs`, declaration
 * order), then colours (a word a choice took is not also a colour), things after their `after`
 * words, numbers beside their words (dropped out of range), yes or no, and the name last (it
 * reads the colour and the noun the others took). A final pass drops every answer whose
 * `appliesWhen` no longer holds. Every answer passes the question's own check and the host's
 * validator, and carries the word indexes behind it: nothing is invented.
 */

import type { Json, SearchQuestionHint } from '@msm/plugin-api';
import type { SearchQuestion } from '../types';
import { assignBooleans } from './boolean';
import { assignChoices } from './choice';
import { assignColours } from './colour';
import { conditionsOf, type FlowModel, flowModel } from './model';
import { assignName, type NameContext } from './name';
import { assignNumbers } from './number';
import {
  type Answer,
  type AnswerValidator,
  appliesNow,
  type ColourMention,
  currentValue,
  type Dropped,
  type NumberSpan,
  passes,
  type SlotState,
  setAnswer,
  type ThingMention,
} from './state';
import { assignThings } from './things';
import { type AnswerText, keyOf, phraseOf } from './words';

/** What the words of one request give every flow (read once per request). */
export interface RequestMentions {
  readonly text: AnswerText;
  readonly colours: readonly ColourMention[];
  readonly things: readonly ThingMention[];
  readonly numbers: readonly NumberSpan[];
  readonly named?: NameContext['named'];
  readonly noun?: number;
  /** Where the head ends: the clause cue's index, or the number of words. */
  readonly headEnd?: number;
}

/** One flow as the slots need it. */
export interface FlowInput {
  readonly starter: string;
  readonly title: string;
  readonly questions: readonly SearchQuestion[];
  readonly hints?: Readonly<Record<string, SearchQuestionHint>>;
  readonly defaults?: Readonly<Record<string, Json>>;
  readonly sort?: string;
  /** Answers a behaviour gives this flow, with the words of its phrase; typed answers come first. */
  readonly extra?: {
    readonly values: Readonly<Record<string, Json>>;
    readonly sources: readonly number[];
  };
}

/** The answers read for one flow. */
export interface SlotAnswers {
  readonly answers: ReadonlyMap<string, Answer>;
  readonly used: ReadonlySet<number>;
  readonly dropped: readonly Dropped[];
}

const models = new WeakMap<readonly SearchQuestion[], Map<unknown, FlowModel>>();

/** The flow's model, kept while its question list lives. */
export function modelOf(
  questions: readonly SearchQuestion[],
  hints: Readonly<Record<string, SearchQuestionHint>> | undefined,
): FlowModel {
  let byHints = models.get(questions);
  if (byHints === undefined) {
    byHints = new Map();
    models.set(questions, byHints);
  }
  let model = byHints.get(hints);
  if (model === undefined) {
    model = flowModel(questions, hints);
    byHints.set(hints, model);
  }
  return model;
}

/** Reads a flow's answers from the words. */
export function assignAnswers(
  flow: FlowInput,
  words: RequestMentions,
  validate?: AnswerValidator,
): SlotAnswers {
  const state: SlotState = {
    starter: flow.starter,
    text: words.text,
    flow: modelOf(flow.questions, flow.hints),
    defaults: flow.defaults ?? {},
    answers: new Map(),
    used: new Set(),
    dropped: [],
    ...(validate !== undefined ? { validate } : {}),
  };
  // The flow's own title words name the flow, not an answer ("flying mob" is not a way of flying).
  const titleKeys = new Set(phraseOf(flow.title)?.keys ?? []);
  const reserved = new Set<number>();
  for (const w of words.text.flat) if (titleKeys.has(w.key)) reserved.add(w.at);
  for (const i of reserved) state.used.add(i);
  assignChoices(state, words.things);
  assignColours(state, words.colours);
  assignThings(state, words.things);
  assignNumbers(state, words.numbers);
  assignBooleans(state);
  const sortKey = flow.sort !== undefined ? keyOf(flow.sort.toLowerCase()) : undefined;
  const headEnd = words.headEnd ?? words.text.words.length;
  assignName(state, {
    title: flow.title,
    titleTyped: words.text.flat.some(
      (w) => w.at < headEnd && reserved.has(w.at) && w.key !== sortKey,
    ),
    ...(flow.sort !== undefined ? { sort: flow.sort } : {}),
    ...(words.noun !== undefined ? { noun: words.noun } : {}),
    ...(words.named !== undefined ? { named: words.named } : {}),
    colours: words.colours,
    things: words.things,
  });
  if (flow.extra !== undefined && flow.extra.sources.length > 0) {
    for (const model of state.flow.questions) {
      const id = model.question.id;
      if (!Object.hasOwn(flow.extra.values, id) || state.answers.has(id)) continue;
      if (model.question.type === 'image' || model.question.type === 'audio') continue;
      const value = flow.extra.values[id] as Json;
      const { ok, implies } = appliesNow(state, model);
      if (ok && passes(state, model, value)) {
        setAnswer(state, model, value, flow.extra.sources, 'behaviour', implies);
      }
    }
  }
  // `appliesWhen` read again with every answer in: an answer whose question no longer applies goes.
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...state.answers.keys()]) {
      const model = state.flow.byId.get(id);
      const conditions = model === undefined ? undefined : conditionsOf(model);
      if (conditions === undefined) continue;
      const holds = conditions.every(([other, allowed]) => {
        const value = currentValue(state, other);
        return value === undefined || allowed.some((a) => a === value);
      });
      if (holds) continue;
      state.answers.delete(id);
      changed = true;
    }
  }
  const used = new Set<number>();
  for (const answer of state.answers.values()) {
    for (const i of answer.sources) if (!reserved.has(i)) used.add(i);
  }
  return { answers: state.answers, used, dropped: state.dropped };
}
