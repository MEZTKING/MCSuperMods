/**
 * Yes or no questions from words (ADR 0124 D7): a question is answered yes when its hint words,
 * its whole label, or its label's one word are typed; no when "no", "not", "without" or "never"
 * stands just before them ("without a recipe"). Words a choice or a number already took are not
 * read again, so "drops 3" is a number, not "drops itself".
 */

import type { QuestionModel } from './model';
import { appliesNow, passes, type SlotState, setAnswer } from './state';
import { findPhrase, indexesOf, negatedAt, type Phrase } from './words';

function phrasesOf(model: QuestionModel): Phrase[] {
  const out = [...model.words];
  if (model.label !== undefined) {
    out.push(model.label);
    if (model.labelWords.length === 1 && model.label.keys.length === 1) {
      out.push(model.labelWords[0] as Phrase);
    }
  }
  // Longer phrases first: `drops itself` before `drops`.
  return out.sort((a, b) => b.keys.length - a.keys.length);
}

/** Fills the flow's yes or no questions from the words. */
export function assignBooleans(state: SlotState): void {
  for (const model of state.flow.questions) {
    if (!model.open || model.question.type !== 'boolean') continue;
    if (state.answers.has(model.question.id)) continue;
    for (const phrase of phrasesOf(model)) {
      const span = findPhrase(state.text, phrase, state.used)[0];
      if (span === undefined) continue;
      const negation = negatedAt(state.text, span.start);
      const value = negation === undefined;
      const { ok, implies } = appliesNow(state, model);
      if (!ok || !passes(state, model, value)) break;
      const sources = [...indexesOf(span), ...(negation !== undefined ? [negation] : [])];
      setAnswer(state, model, value, sources, 'yes-no', value ? implies : []);
      break;
    }
  }
}
