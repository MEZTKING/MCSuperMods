/**
 * Things named in the words (ADR 0124 D7): a whole id typed (`base:pebble`), a thing of the open
 * mod or of the game handed in by the host (by its name), or a vocabulary idea that stands for
 * one id. A thing fills a free-text question that takes one after its `after` words ("sells
 * diamonds", "drops bones"), a choice whose value is its id (the choice slot), and the noun of a
 * name ("Flying Pig", the name slot). Data only: the names come from the host and the plugins.
 */

import type { MergedGroup } from '../index/vocabulary';
import type { TokenisedText } from '../text';
import { appliesNow, passes, type SlotState, setAnswer, type ThingMention } from './state';
import { type AnswerText, findPhrase, indexesOf, type Phrase, phraseOf, precededBy } from './words';

/** A thing the host can name: a project element or a game thing, with the words of its name. */
export interface SearchThing {
  /** Its whole id, for example `mod:ruby` or `base:pebble`. */
  readonly id: string;
  /** Its name as shown, for example `Ruby`. */
  readonly name: string;
  /** The sort of thing (`item`, `block`, `mob`, `vehicle` or another), when known. */
  readonly sort?: string;
}

/** Things compiled once for matching. */
export interface ThingList {
  readonly things: readonly { readonly thing: SearchThing; readonly phrase: Phrase }[];
}

/** Things longer than this many words are not matched by name. */
const MAX_NAME_WORDS = 6;

export function thingList(things: readonly SearchThing[] | undefined): ThingList {
  const out: { thing: SearchThing; phrase: Phrase }[] = [];
  for (const thing of Array.isArray(things) ? things : []) {
    if (typeof thing?.id !== 'string' || typeof thing.name !== 'string') continue;
    const phrase = phraseOf(thing.name);
    if (phrase === undefined || phrase.keys.length > MAX_NAME_WORDS) continue;
    out.push({ thing, phrase });
  }
  // Longer names first, so `iron block` is found before `iron`.
  out.sort((a, b) => b.phrase.keys.length - a.phrase.keys.length);
  return { things: out };
}

/** The things named in the words, left to right, none overlapping. */
export function findThings(
  text: AnswerText,
  tokens: TokenisedText,
  list: ThingList,
  groups: ReadonlyMap<string, MergedGroup>,
  rawIdeas: ReadonlyMap<number, readonly string[]>,
): ThingMention[] {
  const out: ThingMention[] = [];
  const taken = new Set<number>();
  const claim = (mention: ThingMention): void => {
    const at = indexesOf(mention);
    if (at.length === 0 || at.some((i) => taken.has(i) || text.skip.has(i))) return;
    for (const i of at) taken.add(i);
    out.push(mention);
  };
  // Whole ids typed.
  for (const id of tokens.ids) {
    if (!id.text.includes(':')) continue;
    const inside: number[] = [];
    tokens.words.slice(0, text.words.length).forEach((t, i) => {
      if (t.start >= id.start && t.end <= id.end) inside.push(i);
    });
    if (inside.length === 0) continue;
    claim({
      start: inside[0] as number,
      end: (inside[inside.length - 1] as number) + 1,
      id: id.text.replace(/^#/, ''),
    });
  }
  // Things by name.
  for (const { thing, phrase } of list.things) {
    for (const span of findPhrase(text, phrase, taken)) {
      claim({ ...span, id: thing.id, ...(thing.sort !== undefined ? { sort: thing.sort } : {}) });
    }
  }
  // Vocabulary ideas with an id.
  for (const [i, ideas] of rawIdeas) {
    for (const idea of ideas) {
      const id = groups.get(idea)?.vanillaIds[0];
      if (id === undefined) continue;
      claim({ start: i, end: i + 1, id });
      break;
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

/** Fills free-text questions that take a thing after their `after` words. */
export function assignThings(state: SlotState, mentions: readonly ThingMention[]): void {
  const questions = state.flow.questions.filter(
    (m) => m.open && m.question.type === 'string' && m.hint.role !== 'name' && m.after.length > 0,
  );
  if (questions.length === 0) return;
  for (const mention of mentions) {
    const at = indexesOf(mention);
    if (at.some((i) => state.used.has(i))) continue;
    for (const model of questions) {
      if (state.answers.has(model.question.id)) continue;
      const after = precededBy(state.text, mention.start, model.after);
      if (after === undefined) continue;
      const { ok, implies } = appliesNow(state, model);
      if (!ok || !passes(state, model, mention.id)) continue;
      setAnswer(state, model, mention.id, [...at, ...indexesOf(after)], 'thing', implies);
      break;
    }
  }
}
