/**
 * The answers of one entry while the slots fill them (B659): each answer with the word indexes
 * behind it (D7: never an answer without a typed word), the words already taken, the values a
 * question's `appliesWhen` reads (an answer, else the flow's default) and the check every answer
 * passes: the question's own type, choices and range, then the host's validator.
 */

import type { Json } from '@msm/plugin-api';
import type { SearchQuestion } from '../types';
import { conditionsOf, type FlowModel, type QuestionModel } from './model';
import type { AnswerText, Span } from './words';

/** What read an answer: shown as the chip's kind. */
export type AnswerKind = 'colour' | 'choice' | 'number' | 'yes-no' | 'name' | 'thing' | 'behaviour';

export interface Answer {
  readonly value: Json;
  /** The word indexes the answer was read from; never empty. */
  readonly sources: readonly number[];
  readonly kind: AnswerKind;
}

/**
 * The host's check of one answer: the wizard's own (`validateParameter` in the app). Answers it
 * refuses are dropped. Called with the starter id, the question id, the value and the answers so far.
 */
export type AnswerValidator = (
  starter: string,
  question: string,
  value: Json,
  answers: Readonly<Record<string, Json>>,
) => boolean;

/** A colour named in the words: its words and its `#rrggbb`. */
export interface ColourMention extends Span {
  readonly colour: string;
}

/** A thing named in the words: a whole id, a project thing or a vocabulary idea with an id. */
export interface ThingMention extends Span {
  readonly id: string;
  readonly sort?: string;
}

/** A number named in the words (B653's `readNumbers`), the unit word included in the span. */
export interface NumberSpan extends Span {
  readonly value: number;
  readonly upTo?: number;
  /** The index of the unit word, if any. */
  readonly unitAt?: number;
}

/** A number dropped for being outside a question's range. */
export interface Dropped extends Span {
  readonly question: string;
  readonly value: number;
}

export interface SlotState {
  readonly starter: string;
  readonly text: AnswerText;
  readonly flow: FlowModel;
  readonly defaults: Readonly<Record<string, Json>>;
  readonly answers: Map<string, Answer>;
  readonly used: Set<number>;
  readonly dropped: Dropped[];
  readonly validate?: AnswerValidator;
}

const HEX = /^#[0-9a-f]{6}$/;

/** Whether a value fits the question's own type, choices and range. */
export function fitsQuestion(question: SearchQuestion, value: Json): boolean {
  switch (question.type) {
    case 'colour':
      return typeof value === 'string' && HEX.test(value);
    case 'number':
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        (typeof question.min !== 'number' || value >= question.min) &&
        (typeof question.max !== 'number' || value <= question.max)
      );
    case 'boolean':
      return typeof value === 'boolean';
    case 'choice':
      return (
        typeof value === 'string' &&
        (!Array.isArray(question.choices) || question.choices.some((c) => c?.value === value))
      );
    case 'set':
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every(
          (v) =>
            typeof v === 'string' &&
            (!Array.isArray(question.choices) || question.choices.some((c) => c?.value === v)),
        )
      );
    case 'string':
      return typeof value === 'string' && value.trim() !== '';
    default:
      return false;
  }
}

/** The answers as plain values. */
export function valuesOf(state: SlotState): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const [id, answer] of state.answers) out[id] = answer.value;
  return out;
}

/** Whether a value passes the question's own check and the host's. */
export function passes(state: SlotState, model: QuestionModel, value: Json): boolean {
  if (!fitsQuestion(model.question, value)) return false;
  if (state.validate === undefined) return true;
  try {
    return state.validate(state.starter, model.question.id, value, valuesOf(state)) === true;
  } catch {
    return false;
  }
}

/** The value a condition reads: the answer, else the flow's default. */
export function currentValue(state: SlotState, id: string): Json | undefined {
  return state.answers.get(id)?.value ?? state.defaults[id];
}

/**
 * Whether a question applies with the answers so far (`appliesWhen`, B650 SQ6 rule 7). A value
 * not known holds. A yes or no question that is not answered and needs to be yes for this one is
 * implied by the words of this answer (B654: a melee damage number turns on the flow's own
 * numbers); those questions are returned in `implies`.
 */
export function appliesNow(
  state: SlotState,
  model: QuestionModel,
): { ok: boolean; implies: string[] } {
  const conditions = conditionsOf(model);
  const implies: string[] = [];
  if (conditions === undefined) return { ok: true, implies };
  for (const [id, allowed] of conditions) {
    const current = currentValue(state, id);
    const controller = state.flow.byId.get(id);
    if (
      controller?.question.type === 'boolean' &&
      !state.answers.has(id) &&
      allowed.includes(true) &&
      controller.open
    ) {
      if (current !== true) implies.push(id);
      continue;
    }
    if (current === undefined || allowed.some((a) => a === current)) continue;
    return { ok: false, implies: [] };
  }
  return { ok: true, implies };
}

/** Records an answer, its words taken; implied yes answers share its words. */
export function setAnswer(
  state: SlotState,
  model: QuestionModel,
  value: Json,
  sources: readonly number[],
  kind: AnswerKind,
  implies: readonly string[] = [],
): void {
  if (sources.length === 0) return;
  const sorted = [...new Set(sources)].sort((a, b) => a - b);
  state.answers.set(model.question.id, { value, sources: sorted, kind });
  for (const i of sorted) state.used.add(i);
  for (const id of implies) {
    const controller = state.flow.byId.get(id);
    if (controller !== undefined && passes(state, controller, true)) {
      state.answers.set(id, { value: true, sources: sorted, kind: 'yes-no' });
    }
  }
}
