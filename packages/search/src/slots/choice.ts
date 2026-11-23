/**
 * Choice and set questions from words (ADR 0124 D7; B650 SQ6 rules 1 to 5 and 8): a choice is
 * named by its label, its label's first word when that word is its own, its value's words, the
 * plugin's `choiceWords`, or a thing named in the words whose id is the value. The clash rules:
 *
 * 1 and 2. A question with `after` lines (a "from" or a "like X" question) takes a word only
 *    after one of them; a `choiceWords` line of two words or more (`no recipe`, `my own`) needs
 *    none. Where both a gated and an open question take the same words, the gated one wins
 *    (`sword from diamonds` is the recipe, `diamond sword` the tier).
 * 3. Numbered repeats fill in order: a word goes to the first question that is still free.
 * 4. `never` questions take nothing.
 * 5. `sameAs` questions take the same word together.
 * 8. Otherwise the longest words first, left to right, then the first question declared.
 *
 * A `main-colour` choice (a dye) is the colour slot's. Every answer passes the question's check.
 */

import type { Json } from '@msm/plugin-api';
import type { QuestionModel } from './model';
import { appliesNow, passes, type SlotState, setAnswer, type ThingMention } from './state';
import { findPhrase, indexesOf, type Phrase, precededBy, type Span } from './words';

interface Candidate {
  readonly model: QuestionModel;
  readonly value: string;
  readonly span: Span;
  /** The words of the "after" line, taken with the answer. */
  readonly after?: Span;
  readonly choiceOrder: number;
}

/** Whether a question is read by this slot. */
export function isChoiceQuestion(model: QuestionModel): boolean {
  const type = model.question.type;
  return model.open && (type === 'choice' || type === 'set') && model.hint.role !== 'main-colour';
}

function key(span: Span): string {
  return `${span.start}:${span.end}`;
}

/** Every reading of the words as a choice of one of the flow's questions. */
function candidatesOf(state: SlotState, things: readonly ThingMention[]): Candidate[] {
  const out: Candidate[] = [];
  for (const model of state.flow.questions) {
    if (!isChoiceQuestion(model)) continue;
    const gated = model.after.length > 0;
    const add = (value: string, choiceOrder: number, span: Span, open: boolean): void => {
      if (!gated || open) {
        out.push({ model, value, span, choiceOrder });
        return;
      }
      const after = precededBy(state.text, span.start, model.after);
      if (after !== undefined) out.push({ model, value, span, after, choiceOrder });
    };
    model.choices.forEach((choice, choiceOrder) => {
      const seen = new Set<string>();
      const each = (phrase: Phrase, open: boolean): void => {
        for (const span of findPhrase(state.text, phrase, state.used)) {
          if (seen.has(key(span))) continue;
          seen.add(key(span));
          add(choice.value, choiceOrder, span, open);
        }
      };
      for (const phrase of choice.phrases) each(phrase, false);
      for (const phrase of choice.extra) each(phrase, phrase.keys.length > 1);
      for (const thing of things) {
        if (thing.id !== choice.value || seen.has(key(thing))) continue;
        seen.add(key(thing));
        add(choice.value, choiceOrder, thing, false);
      }
    });
  }
  // Leftmost, longest, a gated question before an open one, then declaration order.
  out.sort(
    (a, b) =>
      a.span.start - b.span.start ||
      b.span.end - a.span.end ||
      (a.after === undefined ? 1 : 0) - (b.after === undefined ? 1 : 0) ||
      a.model.order - b.model.order ||
      a.choiceOrder - b.choiceOrder,
  );
  return out;
}

/** The questions that take the same word as this one (`sameAs`, both ways). */
function partners(state: SlotState, model: QuestionModel): QuestionModel[] {
  const out: QuestionModel[] = [];
  const id = model.question.id;
  for (const other of state.flow.questions) {
    if (other === model) continue;
    if (other.hint.sameAs === id || model.hint.sameAs === other.question.id) out.push(other);
  }
  return out;
}

/** Fills the flow's choice and set questions from the words. */
export function assignChoices(state: SlotState, things: readonly ThingMention[]): void {
  const candidates = candidatesOf(state, things);
  const sets = new Map<string, { values: string[]; sources: number[] }>();
  const take = (c: Candidate): boolean => {
    const id = c.model.question.id;
    const sources = [...indexesOf(c.span), ...(c.after !== undefined ? indexesOf(c.after) : [])];
    if (c.model.question.type === 'set') {
      const now = sets.get(id) ?? { values: [], sources: [] };
      if (now.values.includes(c.value)) return false;
      const values = [...now.values, c.value];
      if (!passes(state, c.model, values as Json)) return false;
      const next = { values, sources: [...now.sources, ...sources] };
      sets.set(id, next);
      setAnswer(state, c.model, values, next.sources, 'choice');
      return true;
    }
    if (state.answers.has(id)) return false;
    const { ok, implies } = appliesNow(state, c.model);
    if (!ok || !passes(state, c.model, c.value)) return false;
    setAnswer(state, c.model, c.value, sources, 'choice', implies);
    return true;
  };
  for (const c of candidates) {
    if (indexesOf(c.span).some((i) => state.used.has(i))) continue;
    if (!take(c)) continue;
    // A word shared by `sameAs` answers the partner questions too.
    const others = partners(state, c.model);
    for (const o of candidates) {
      if (o === c || key(o.span) !== key(c.span) || !others.includes(o.model)) continue;
      if (state.answers.has(o.model.question.id)) continue;
      const { ok } = appliesNow(state, o.model);
      if (ok && passes(state, o.model, o.value)) {
        const sources = state.answers.get(c.model.question.id)?.sources ?? indexesOf(c.span);
        setAnswer(state, o.model, o.value, sources, 'choice');
      }
    }
  }
}
