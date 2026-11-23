/**
 * The name of the made thing (ADR 0124 D7): the question whose role is `name` (else the first
 * text question whose label says "name"), from, in this order, quoted text, the words after
 * "called" or "named", the colour and the thing's noun in title case ("Blue Sword": the noun is
 * the label of the choice that took it, or the typed noun when the flow's title has it), or a
 * thing named in the words in place of the sort word of the flow's title, when another word of
 * the title was typed ("make a pig fly" for the "Flying mob": "Flying Pig"); only a thing known
 * to be of the flow's sort stands in for it, so "custom ore" never names a Custom mob "Custom
 * Ore" (B666). The name must pass the question's check (its pattern and length, by the host's
 * validator); otherwise none.
 */

import type { QuestionModel } from './model';
import { type ColourMention, passes, type SlotState, setAnswer, type ThingMention } from './state';
import { indexesOf, keyOf, phraseOf, type Span, spanText, titleCase } from './words';

/** The longest name made from words. */
export const MAX_NAME_CHARS = 64;

/** A name typed as such: quoted, or after "called" or "named". */
export interface NamedSpan extends Span {
  readonly name: string;
}

/** What the name slot needs to know of the entry and the words. */
export interface NameContext {
  readonly title: string;
  /** A word of the flow's title other than its sort word was typed in the head ("fly"). */
  readonly titleTyped?: boolean;
  /** The sort of thing the flow makes, when the host says. */
  readonly sort?: string;
  /** The last word of the head that is a noun (not a colour, a number or a stop word). */
  readonly noun?: number;
  readonly named?: NamedSpan;
  readonly colours: readonly ColourMention[];
  readonly things: readonly ThingMention[];
}

/** The flow's name question. */
export function nameQuestion(state: SlotState): QuestionModel | undefined {
  const questions = state.flow.questions.filter((m) => m.open && m.question.type === 'string');
  return (
    questions.find((m) => m.hint.role === 'name') ??
    questions.find(
      (m) =>
        m.hint.role === undefined &&
        m.after.length === 0 &&
        (m.label?.keys ?? []).includes(keyOf('name')),
    )
  );
}

function within(span: Span, sources: readonly number[]): boolean {
  return indexesOf(span).every((i) => sources.includes(i));
}

/** Fills the name question, if the words give a name. */
export function assignName(state: SlotState, context: NameContext): void {
  const model = nameQuestion(state);
  if (model === undefined || state.answers.has(model.question.id)) return;
  const tryName = (name: string, sources: readonly number[]): boolean => {
    const value = titleCase(name);
    if (value === '' || value.length > MAX_NAME_CHARS || sources.length === 0) return false;
    if (!passes(state, model, value)) return false;
    setAnswer(state, model, value, sources, 'name');
    return true;
  };

  if (context.named !== undefined) {
    if (tryName(context.named.name, indexesOf(context.named))) return;
  }

  // The colour and the noun.
  const colourAnswer = [...state.answers.values()].find((a) => a.kind === 'colour');
  const colour =
    colourAnswer === undefined
      ? undefined
      : context.colours.find((m) => within(m, colourAnswer.sources));
  if (colour !== undefined && context.noun !== undefined) {
    const at = context.noun;
    let noun: string | undefined;
    for (const [id, answer] of state.answers) {
      if (answer.kind !== 'choice' || !answer.sources.includes(at)) continue;
      // The noun of the thing is one choice's label, not a member of a set.
      if (state.flow.byId.get(id)?.question.type !== 'choice') break;
      const choice = state.flow.byId
        .get(id)
        ?.choices.find(
          (c) =>
            c.value === answer.value ||
            (Array.isArray(answer.value) && answer.value.includes(c.value)),
        );
      if (choice !== undefined) noun = choice.label;
      break;
    }
    if (noun === undefined) {
      const titleKeys = phraseOf(context.title)?.keys ?? [];
      const word = state.text.folded[at] ?? '';
      if (titleKeys.includes(keyOf(word))) noun = state.text.words[at];
    }
    if (
      noun !== undefined &&
      tryName(`${spanText(state.text, colour)} ${noun}`, [...indexesOf(colour), at])
    ) {
      return;
    }
  }

  // A thing in place of the sort word of the title.
  if (context.sort !== undefined && context.titleTyped === true) {
    const titleWords = context.title.split(/\s+/);
    const sortKey = keyOf(context.sort.toLowerCase());
    const place = titleWords.findIndex((w) => keyOf(w.toLowerCase()) === sortKey);
    if (place < 0) return;
    for (const thing of context.things) {
      // A thing of another or of an unknown sort is not the sort word's stand-in (B666).
      if (thing.sort !== context.sort) continue;
      const at = indexesOf(thing);
      if (at.some((i) => state.used.has(i))) continue;
      const words = [...titleWords];
      words[place] = spanText(state.text, thing);
      if (tryName(words.join(' '), at)) return;
    }
  }
}
