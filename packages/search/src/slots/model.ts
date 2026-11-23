/**
 * A flow's questions as the answer slots read them (ADR 0124 D7; B659): each question with its
 * plugin hint (`role`, `words`, `after`, `never`, `sameAs`, `appliesWhen`, `choiceWords`), its
 * words keyed once, its choices with the phrases that name them. Built once per question list
 * and kept while the entry lives. Pure data from the entry and the plugins.
 */

import type { Json, SearchQuestionHint } from '@msm/plugin-api';
import type { SearchQuestion } from '../types';
import { type Phrase, phraseOf, rawWordsOf } from './words';

/** One choice and the phrases that name it. */
export interface ChoiceModel {
  readonly value: string;
  readonly label: string;
  /** The label, the label's first word when no other choice starts with it, and the value's words. */
  readonly phrases: readonly Phrase[];
  /** The plugin's `choiceWords`: those of two words or more are taken without an "after" word. */
  readonly extra: readonly Phrase[];
}

export interface QuestionModel {
  readonly question: SearchQuestion;
  /** Declaration order. */
  readonly order: number;
  readonly hint: SearchQuestionHint;
  /** The label's words as one phrase. */
  readonly label?: Phrase;
  /** The label's own words of three letters or more, one phrase each (numerals left out). */
  readonly labelWords: readonly Phrase[];
  /** The hint's words. */
  readonly words: readonly Phrase[];
  /** The hint's "after" lines as folded words, stop words kept. */
  readonly after: readonly (readonly string[])[];
  readonly choices: readonly ChoiceModel[];
  /** The question is answered from words at all. */
  readonly open: boolean;
}

export interface FlowModel {
  readonly questions: readonly QuestionModel[];
  readonly byId: ReadonlyMap<string, QuestionModel>;
}

const NO_HINT: SearchQuestionHint = {};

/** The words of a choice value: its path after a namespace, split at `_`, `/` and `#`. */
function valueWords(value: string): string {
  const colon = value.indexOf(':');
  const path = colon >= 0 ? value.slice(colon + 1) : value;
  return path.replace(/[_/#.]+/g, ' ');
}

function phrases(lines: unknown): Phrase[] {
  if (!Array.isArray(lines)) return [];
  const out: Phrase[] = [];
  for (const line of lines.slice(0, 256)) {
    const phrase = phraseOf(line);
    if (phrase !== undefined) out.push(phrase);
  }
  return out;
}

/** Builds the model of one flow's questions with their hints. */
export function flowModel(
  questions: readonly SearchQuestion[],
  hints: Readonly<Record<string, SearchQuestionHint>> | undefined,
): FlowModel {
  const models: QuestionModel[] = [];
  const byId = new Map<string, QuestionModel>();
  questions.forEach((question, order) => {
    if (typeof question !== 'object' || question === null || typeof question.id !== 'string') {
      return;
    }
    const hint = (hints?.[question.id] as SearchQuestionHint | undefined) ?? NO_HINT;
    const label = phraseOf(question.label);
    const labelWords = (label?.keys ?? [])
      .filter((k) => k.length >= 3 && !/^[0-9]/.test(k))
      .map((k) => ({ keys: [k], text: k }));
    const choices: ChoiceModel[] = [];
    const rawChoices = Array.isArray(question.choices) ? question.choices : [];
    const firstWords = new Map<string, number>();
    for (const choice of rawChoices) {
      const first = phraseOf(choice?.label)?.keys[0];
      if (first !== undefined) firstWords.set(first, (firstWords.get(first) ?? 0) + 1);
    }
    for (const choice of rawChoices) {
      if (typeof choice?.value !== 'string') continue;
      const own: Phrase[] = [];
      const labelPhrase = phraseOf(choice.label);
      if (labelPhrase !== undefined) {
        own.push(labelPhrase);
        const first = labelPhrase.keys[0] as string;
        if (labelPhrase.keys.length > 1 && firstWords.get(first) === 1) {
          own.push({ keys: [first], text: first });
        }
      }
      const valuePhrase = phraseOf(valueWords(choice.value));
      if (valuePhrase !== undefined) own.push(valuePhrase);
      const extra = phrases(hint.choiceWords?.[choice.value]);
      choices.push({
        value: choice.value,
        label: typeof choice.label === 'string' ? choice.label : choice.value,
        phrases: own,
        extra,
      });
    }
    const after = (Array.isArray(hint.after) ? hint.after : [])
      .map(rawWordsOf)
      .filter((line) => line.length > 0);
    const model: QuestionModel = {
      question,
      order,
      hint,
      ...(label !== undefined ? { label } : {}),
      labelWords,
      words: phrases(hint.words),
      after,
      choices,
      open: hint.never !== true && question.type !== 'image' && question.type !== 'audio',
    };
    models.push(model);
    if (!byId.has(question.id)) byId.set(question.id, model);
  });
  return { questions: models, byId };
}

/** The questions and values a question's `appliesWhen` asks for, or undefined when it has none. */
export function conditionsOf(model: QuestionModel): [string, readonly Json[]][] | undefined {
  const when = model.hint.appliesWhen;
  if (when === undefined || typeof when !== 'object' || when === null) return undefined;
  const out: [string, readonly Json[]][] = [];
  for (const [id, allowed] of Object.entries(when)) {
    if (Array.isArray(allowed)) out.push([id, allowed]);
  }
  return out;
}
