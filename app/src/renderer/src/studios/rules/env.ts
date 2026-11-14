/**
 * What every part of a rule card reads besides the book: the project (names, things), the
 * registry view, pictures, the mode, the book's problems and how to say them, and focus requests.
 * The Rule book Studio provides it; another Studio that embeds {@link RuleCard} (the Rules
 * section of B375) builds one with {@link makeRulesEnv} and wraps the cards in
 * {@link RulesEnvContext}.
 *
 * @packageDocumentation
 */

import type { Problem, Project } from '@msm/core';
import { createContext, useContext } from 'react';
import type { ThingPictures, ThingRegistries } from '../../components/thing-picker/ThingPicker';
import { type ThingSort, thingName } from '../../components/thing-picker/thing-sources';
import type { RulesMode } from './mode';
import { type PlainProblemWords, problemText } from './problem-words';
import { problemsByAnchor, type RuleBookData } from './rules-model';

/** The rule card environment. */
export interface RulesEnv {
  readonly project: Project;
  /** The book being edited (its id is the problems' element). */
  readonly bookId: string;
  /** Vanilla and project ids (`SchemaContext.registries(project, 'msm:rules')`). */
  readonly registries: ThingRegistries;
  /** The target's texture folder (`target.folders.resource.textures`). */
  readonly texturesFolder: string;
  /** Where pictures come from; `null` shows generic icons. */
  readonly pictures: ThingPictures | null;
  readonly mode: RulesMode;
  /** The book's problems by anchor pointer (`problemsByAnchor`). */
  readonly problems: ReadonlyMap<string, readonly Problem[]>;
  /** The words of a problem (plain words when the table has them). */
  text(problem: Problem): string;
  /** The display name of an id. */
  name(id: string, sort?: ThingSort): string;
  /** Asks the card holding `pointer` to take focus after the next render (moves, adds). */
  requestFocus(pointer: string): void;
}

/** What {@link makeRulesEnv} needs. */
export interface RulesEnvInput {
  readonly project: Project;
  readonly bookId: string;
  readonly book: RuleBookData;
  readonly registries: ThingRegistries;
  readonly texturesFolder: string;
  readonly pictures: ThingPictures | null;
  readonly mode: RulesMode;
  /** The book's own problems (`sessionProblems` of the book element). */
  readonly problems: readonly Problem[];
  readonly plainWords: PlainProblemWords | null;
  readonly requestFocus?: (pointer: string) => void;
}

/** A rule card environment from its parts. */
export function makeRulesEnv(input: RulesEnvInput): RulesEnv {
  return {
    project: input.project,
    bookId: input.bookId,
    registries: input.registries,
    texturesFolder: input.texturesFolder,
    pictures: input.pictures,
    mode: input.mode,
    problems: problemsByAnchor(input.book, input.problems),
    text: (problem) => problemText(problem, input.plainWords),
    name: (id, sort) => thingName(input.project, id, sort),
    requestFocus: input.requestFocus ?? (() => undefined),
  };
}

/** Provided around rule cards. */
export const RulesEnvContext = createContext<RulesEnv | null>(null);

/** The rule card environment; throws outside a {@link RulesEnvContext} provider. */
export function useRulesEnv(): RulesEnv {
  const env = useContext(RulesEnvContext);
  if (env === null) throw new Error('Rule cards must be rendered inside a RulesEnvContext.');
  return env;
}

const NO_PROBLEMS: readonly Problem[] = [];

/** The problems anchored exactly at `pointer`. */
export function useProblemsAt(pointer: string): readonly Problem[] {
  return useRulesEnv().problems.get(pointer) ?? NO_PROBLEMS;
}

/** How a card part changes the book: the book it reads and one undoable change. */
export interface BookEdit {
  readonly book: RuleBookData;
  /** Sends the next book as one undo step; `coalesce` merges typing (`typingKey`). */
  change(next: RuleBookData, coalesce?: string): void;
}

/** Provided by {@link RuleCard} around its parts. */
export const BookEditContext = createContext<BookEdit | null>(null);

/** The book and its change callback; throws outside a rule card. */
export function useBookEdit(): BookEdit {
  const edit = useContext(BookEditContext);
  if (edit === null) throw new Error('Rule card parts must be rendered inside a RuleCard.');
  return edit;
}
