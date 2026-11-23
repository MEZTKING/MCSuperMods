/**
 * Colours from words (ADR 0124 D7): a colour name of the plugins' vocabulary or a hex code
 * (`#3c44aa`). The first colour goes to the flow's main colour question (`role: 'main-colour'`,
 * else the first colour question declared), as Surprise me does; a colour beside a word of
 * another colour question ("green leaves", "leaf green") goes to that one. A `main-colour`
 * choice (a dye) takes the colour by its choice words. A word a choice already took (`gold` as a
 * tier) is not also a colour. Colour words are never corrected or struck through (B658).
 */

import { isStopWord } from '../text';
import type { QuestionModel } from './model';
import { appliesNow, type ColourMention, passes, type SlotState, setAnswer } from './state';
import { type AnswerText, findPhrase, indexesOf, type Phrase, type Span } from './words';

/** A hex colour typed as `#rrggbb` (the word after the `#`), lower case. */
export function hexAt(normalised: string, start: number, word: string): string | undefined {
  if (!/^[0-9a-f]{6}$/.test(word)) return undefined;
  return normalised.charAt(start - 1) === '#' ? `#${word}` : undefined;
}

/** Whether only stop words lie between `a` (exclusive end) and `b` (start). */
function closeBy(text: AnswerText, a: number, b: number): boolean {
  if (b < a) return false;
  for (let i = a; i < b; i++) {
    if (text.skip.has(i) || !isStopWord(text.folded[i] ?? '')) return false;
  }
  return b - a <= 2;
}

function besideWord(text: AnswerText, mention: Span, words: readonly Phrase[]): Span | undefined {
  for (const phrase of words) {
    for (const span of findPhrase(text, phrase)) {
      if (span.end <= mention.start && closeBy(text, span.end, mention.start)) return span;
      if (span.start >= mention.end && closeBy(text, mention.end, span.start)) return span;
    }
  }
  return undefined;
}

/** The words that point a colour at a question that is not the main one. */
function ownWords(model: QuestionModel, main: QuestionModel | undefined): Phrase[] {
  const shared = new Set(main?.label?.keys ?? []);
  return [...model.words, ...model.labelWords.filter((p) => !shared.has(p.keys[0] as string))];
}

/** Fills the flow's colour questions from the colours named in the words. */
export function assignColours(state: SlotState, mentions: readonly ColourMention[]): void {
  const colourQuestions = state.flow.questions.filter(
    (m) =>
      m.open &&
      (m.question.type === 'colour' ||
        (m.question.type === 'choice' && m.hint.role === 'main-colour')),
  );
  if (colourQuestions.length === 0) return;
  const main =
    colourQuestions.find((m) => m.hint.role === 'main-colour') ??
    colourQuestions.find((m) => m.question.type === 'colour');
  const others = colourQuestions.filter((m) => m !== main && m.question.type === 'colour');

  const give = (
    model: QuestionModel,
    mention: ColourMention,
    extra: readonly number[],
  ): boolean => {
    if (state.answers.has(model.question.id)) return false;
    const { ok, implies } = appliesNow(state, model);
    if (!ok) return false;
    const sources = [...indexesOf(mention), ...extra];
    if (model.question.type === 'colour') {
      if (!passes(state, model, mention.colour)) return false;
      setAnswer(state, model, mention.colour, sources, 'colour', implies);
      return true;
    }
    // A dye choice: the colour's own words name the choice.
    // The choice whose words cover most of the colour's words (`sky blue` before `blue`).
    let best: { value: string; length: number } | undefined;
    for (const choice of model.choices) {
      for (const phrase of [...choice.phrases, ...choice.extra]) {
        const found = findPhrase(state.text, phrase).find(
          (s) => s.start >= mention.start && s.end <= mention.end,
        );
        const length = found === undefined ? 0 : found.end - found.start;
        if (length > (best?.length ?? 0) && passes(state, model, choice.value)) {
          best = { value: choice.value, length };
        }
      }
    }
    if (best !== undefined) {
      setAnswer(state, model, best.value, sources, 'colour', implies);
      return true;
    }
    return false;
  };

  for (const mention of mentions) {
    if (indexesOf(mention).some((i) => state.used.has(i) || state.text.skip.has(i))) continue;
    let placed = false;
    for (const model of others) {
      const beside = besideWord(state.text, mention, ownWords(model, main));
      if (beside === undefined || indexesOf(beside).some((i) => state.used.has(i))) continue;
      if (give(model, mention, indexesOf(beside))) {
        placed = true;
        break;
      }
    }
    if (!placed && main !== undefined) give(main, mention, []);
  }
}
