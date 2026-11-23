/**
 * Numbers from words (ADR 0124 D7 as amended; B650 SQ6 rules 3, 6 and 7): a number fills a
 * number question only with its unit or a word of the question beside it (its label's words or
 * its hint words, two words either side); a number with nothing beside it fills the question
 * whose role is `main-number` ("a 500 boss"). The question with the most words beside it wins,
 * then the question named after a choice just answered beside it (`effect_1_seconds` beside the
 * first effect), then the first declared. A range fills the question and the next one that also
 * fits ("drops 3 to 5"). A number outside the question's range is dropped and shown struck
 * through, never clamped; a question that does not apply (`appliesWhen`) takes nothing.
 */

import type { NumberMention } from '../text';
import type { QuestionModel } from './model';
import { appliesNow, type NumberSpan, passes, type SlotState, setAnswer } from './state';
import { type AnswerText, findPhrase, indexesOf, precededBy, type Span } from './words';

/** Words either side of a number read for the question's words. */
const WINDOW = 2;

/** The numbers of the words, as spans of the words the reader keeps. */
export function numberSpans(text: AnswerText, mentions: readonly NumberMention[]): NumberSpan[] {
  const out: NumberSpan[] = [];
  for (const m of mentions) {
    if (m.first < 0 || m.last >= text.words.length) continue;
    const span = { start: m.first, end: m.last + 1 };
    if (indexesOf(span).some((i) => text.skip.has(i))) continue;
    out.push({
      ...span,
      value: m.value,
      ...(m.upTo !== undefined ? { upTo: m.upTo } : {}),
      ...(m.unit !== undefined ? { unitAt: m.last } : {}),
    });
  }
  return out;
}

interface Fit {
  readonly model: QuestionModel;
  readonly score: number;
  readonly words: readonly number[];
}

/** How many words of the question stand beside the number, and which. */
function fitOf(state: SlotState, model: QuestionModel, mention: NumberSpan): Fit | undefined {
  const before: Span = { start: Math.max(0, mention.start - WINDOW), end: mention.start };
  const after: Span = { start: mention.end, end: mention.end + WINDOW };
  const inside = (s: Span): boolean =>
    (s.start >= before.start && s.end <= before.end) ||
    (s.start >= after.start && s.end <= after.end) ||
    (mention.unitAt !== undefined && s.start === mention.unitAt && s.end === mention.unitAt + 1);
  let score = 0;
  const words = new Set<number>();
  for (const phrase of [...model.words, ...model.labelWords]) {
    for (const span of findPhrase(state.text, phrase)) {
      if (!inside(span)) continue;
      const at = indexesOf(span);
      if (at.every((i) => words.has(i))) continue;
      score += span.end - span.start;
      for (const i of at) words.add(i);
    }
  }
  if (score === 0) return undefined;
  // A question with `after` lines takes a number only with one of them before it.
  if (model.after.length > 0) {
    let found = false;
    for (let end = mention.start; end >= Math.max(0, mention.start - WINDOW - 1); end--) {
      if (precededBy(state.text, end, model.after) !== undefined) found = true;
    }
    if (!found) return undefined;
  }
  // A question named after a choice answered beside the number (`effect_1_seconds`).
  for (const [id, answer] of state.answers) {
    if (!model.question.id.startsWith(`${id}_`)) continue;
    if (answer.sources.some((i) => i >= before.start - WINDOW && i < after.end + WINDOW)) {
      score += 0.5;
    }
  }
  return { model, score, words: [...words] };
}

/** Fills the flow's number questions from the numbers in the words. */
export function assignNumbers(state: SlotState, mentions: readonly NumberSpan[]): void {
  const questions = state.flow.questions.filter((m) => m.open && m.question.type === 'number');
  if (questions.length === 0) return;
  const free = (m: QuestionModel): boolean =>
    !state.answers.has(m.question.id) && appliesNow(state, m).ok;
  for (const mention of mentions) {
    const at = indexesOf(mention);
    if (at.some((i) => state.used.has(i))) continue;
    const fits = questions
      .filter(free)
      .map((m) => fitOf(state, m, mention))
      .filter((f): f is Fit => f !== undefined)
      .sort((a, b) => b.score - a.score || a.model.order - b.model.order);
    let first = fits[0];
    let words = first?.words ?? [];
    if (first === undefined) {
      const main = questions.find((m) => m.hint.role === 'main-number' && free(m));
      if (main === undefined || mention.upTo !== undefined) continue;
      first = { model: main, score: 0, words: [] };
      words = [];
    }
    const put = (fit: Fit, value: number, sources: readonly number[]): boolean => {
      const { implies } = appliesNow(state, fit.model);
      if (!passes(state, fit.model, value)) {
        state.dropped.push({ ...mention, question: fit.model.question.id, value });
        return false;
      }
      setAnswer(state, fit.model, value, sources, 'number', implies);
      return true;
    };
    const sources = [...at, ...words];
    if (!put(first, mention.value, sources)) continue;
    if (mention.upTo !== undefined) {
      const second = fits.find((f) => f.model !== first.model && free(f.model));
      if (second !== undefined) put(second, mention.upTo, [...at, ...second.words]);
    }
  }
}
