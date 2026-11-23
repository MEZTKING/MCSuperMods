/**
 * Search data: the words, behaviours and extra doors a plugin gives the host's search
 * (ADR 0124 D5, D7, D13). Since 1.23.0.
 *
 * Everything here is plain data: no code of a plugin runs in the search. A plugin hands its
 * search data over lazily through {@link PluginContributions.searchData}, so that the data is
 * loaded only when the host builds its search index; the host and the third-party plugin
 * sandbox both pass what they receive through {@link validateSearchContributions}, which keeps
 * the lines that are well formed, within the limits and (where asked) about the plugin's own
 * things, and reports the rest as problems.
 *
 * @packageDocumentation
 */

import type { PluginContributions } from './contributions';
import type { Json } from './json';
import type { Problem } from './problems';

/**
 * A group of words that mean one idea, for example the idea `sword` with `blade` and `katana`.
 * The host's search treats a word of the group as the idea, with {@link near} words weaker and
 * {@link misspellings} shown as corrected. Every string is matched without regard to case or
 * accents; British and American spellings are folded by the search itself, so a group lists
 * only one of them. Since 1.23.0 (ADR 0124 D5).
 *
 * @example
 * ```ts
 * const experience: SearchWordGroup = {
 *   idea: 'experience',
 *   same: ['experience points'],
 *   slang: ['xp', 'exp'],
 *   phrases: ['drops xp'],
 *   misspellings: ['experiance'],
 *   vanillaIds: ['minecraft:experience_bottle'],
 * };
 * ```
 */
export interface SearchWordGroup {
  /** The idea's own word, also a word of the group, for example `sword`. */
  idea: string;
  /** Words that mean exactly the idea, for example `blade`. May be empty. */
  same: string[];
  /** Nearer and weaker words, for example `weapon` for `sword`: they match with less weight. */
  near?: string[];
  /** Slang and short forms players type, for example `xp` or `pick`. */
  slang?: string[];
  /** Phrases of several words that mean the idea, for example `catches fire` for `fire`. */
  phrases?: string[];
  /**
   * Misspellings beyond the search's own typo limits (one wrong letter in words of four to
   * seven letters, two in longer ones), for example `vehical`: shown as corrected. Since 1.23.0
   * (B650 SQ3).
   */
  misspellings?: string[];
  /**
   * Vanilla ids the idea names, namespaced, for example `minecraft:diamond_sword`. The host
   * drops an id the open project's target does not have, so a group names ids of every target.
   */
  vanillaIds?: string[];
}

/**
 * Colour names with their colour, for example `crimson` and `blood red` for `#b02e26`, so that
 * a colour typed in words answers a colour question. Since 1.23.0 (ADR 0124 D5, D7).
 */
export interface SearchColour {
  /** The names, for example `light blue` and `sky blue`. At least one. */
  names: string[];
  /** The colour as `#rrggbb` with lower-case hex digits, as a colour question's value is. */
  colour: string;
}

/**
 * The words of one plugin's area: word groups and colour names. Since 1.23.0 (ADR 0124 D5).
 * A plugin cannot add stop words or intent words; those are the search's own.
 */
export interface SearchVocabulary {
  /** Groups of words that mean one idea; see {@link SearchWordGroup}. */
  words?: SearchWordGroup[];
  /** Colour names; see {@link SearchColour}. */
  colours?: SearchColour[];
}

/** The sorts of made thing a {@link SearchBehaviour} can describe. Since 1.23.0. */
export type SearchBehaviourSubject = 'item' | 'block' | 'mob' | 'vehicle';

/**
 * What a made thing does, read from a clause after "that", "which" or "when" ("a block that
 * glows", "a sword that sets mobs on fire") and turned into what makes it: the flow itself
 * ({@link flows}), answers of the flow being made ({@link answers}), one Rules rule
 * ({@link rule}) or one companion flow ({@link beside}). At least one of the four. Since
 * 1.23.0 (ADR 0124 D7).
 *
 * @example
 * ```ts
 * const dropsXp: SearchBehaviour = {
 *   id: 'drops-xp',
 *   phrases: ['drops xp', 'gives experience'],
 *   sentence: 'When a player breaks it, it gives experience.',
 *   appliesTo: ['block'],
 *   rule: { trigger: { type: 'block_broken', block: '$thing' }, steps: [{ type: 'give_experience', amount: 5 }] },
 * };
 * ```
 */
export interface SearchBehaviour {
  /** Unique within the plugin, for example `drops-xp`. */
  id: string;
  /** The phrases that name the behaviour, for example `drops xp`. At least one. */
  phrases: string[];
  /** One plain sentence shown on the result, in British English. */
  sentence: string;
  /** The sorts of made thing the behaviour applies to. At least one. */
  appliesTo: SearchBehaviourSubject[];
  /**
   * Starter ids of flows the clause names as a whole: "you can ride" is the Mount flow.
   * Since 1.23.0 (B650 SQ12).
   */
  flows?: string[];
  /**
   * Answers of the flow being made, by starter id and then question id: "glows" answers a
   * block flow's light question with 15. Each answer must pass the flow's own check.
   */
  answers?: Record<string, Record<string, Json>>;
  /**
   * One `msm:rules` rule, as the rule book stores it, added beside the made thing; the string
   * `$thing` stands for the made thing's id.
   */
  rule?: Json;
  /** One companion flow made beside the thing, with its answers by question id. */
  beside?: { starter: string; values: Record<string, Json> };
}

/** The sorts of thing a {@link SearchEntryContribution} can open. Since 1.23.0. */
export type SearchEntryOpensType = 'starter' | 'template' | 'example' | 'kind' | 'command';

/**
 * One extra door to one of the plugin's own things: a starter or flow (with answers), a
 * template, an example, a kind or a command, found by its own title and words, for example
 * "Blue sword" opening the Weapon flow with the colour answered. Its availability follows the
 * thing it opens (that thing's own `supports`). Since 1.23.0 (ADR 0124 D13).
 */
export interface SearchEntryContribution {
  /** Unique within the plugin. */
  id: string;
  /** The title shown on the result, in British English. */
  title: string;
  /** One plain sentence shown under the title, in British English. */
  sentence: string;
  /** Extra words the entry is found by. */
  words?: string[];
  /** What the entry opens. */
  opens: {
    /** The sort of thing. */
    type: SearchEntryOpensType;
    /** The thing's id: one of the plugin's own starters, templates, examples, kinds or commands. */
    id: string;
    /** For a starter, answers by question id; each must pass the starter's own check. */
    values?: Record<string, Json>;
  };
}

/**
 * How the search may answer one question of a flow from the words of a query. Since 1.23.0
 * (ADR 0124 D7, B650 SQ6).
 */
export interface SearchQuestionHint {
  /**
   * The question's role: `name` takes the thing's name, `main-colour` the first colour typed and
   * `main-number` a number with nothing else beside it.
   */
  role?: 'name' | 'main-colour' | 'main-number';
  /** Extra words that name the question, beside its label. */
  words?: string[];
  /** The question takes a word only after one of these, for example `from`, `of` or `like`. */
  after?: string[];
  /** The question is never answered from words (a variant, say). */
  never?: boolean;
  /** Another question of the same flow that takes the same word; the clash goes to that one. */
  sameAs?: string;
  /** The question applies only when other questions have one of these values, by question id. */
  appliesWhen?: Record<string, Json[]>;
  /** Extra words for the question's choices, by choice value. */
  choiceWords?: Record<string, string[]>;
}

/**
 * Everything one plugin gives the search, returned by {@link PluginContributions.searchData}.
 * Every field is optional. Since 1.23.0 (ADR 0124 D13).
 */
export interface PluginSearchData {
  /** The words of the plugin's area; see {@link SearchVocabulary}. */
  vocabulary?: SearchVocabulary;
  /** What made things do; see {@link SearchBehaviour}. */
  behaviours?: SearchBehaviour[];
  /** Extra doors to the plugin's own things; see {@link SearchEntryContribution}. */
  entries?: SearchEntryContribution[];
  /**
   * Extra words for the plugin's own templates, starters and kinds, by their id, where the title
   * does not carry them.
   */
  keywords?: Record<string, string[]>;
  /** Hints for the questions of the plugin's own starters, by starter id and then question id. */
  questions?: Record<string, Record<string, SearchQuestionHint>>;
}

/**
 * Size bounds for one plugin's {@link PluginSearchData}; see {@link BUILT_IN_SEARCH_LIMITS} and
 * {@link THIRD_PARTY_SEARCH_LIMITS}. Since 1.23.0.
 */
export interface SearchLimits {
  /**
   * The most lines: each word group, colour, keywords list and question hint is one line.
   */
  lines: number;
  /** The most behaviours. */
  behaviours: number;
  /** The most entries. */
  entries: number;
  /** The most strings in one list (one group's `same`, one keywords list, say). */
  listLength: number;
  /** The longest word, phrase, title or id, in UTF-16 code units. */
  wordLength: number;
  /** The longest sentence, in UTF-16 code units. */
  sentenceLength: number;
  /** The longest JSON value (a rule, answers, values), as compact JSON text. */
  valueLength: number;
  /**
   * Whether a behaviour may name only the plugin's own starters. Entries, keywords and question
   * hints always name only the plugin's own things.
   */
  ownBehavioursOnly: boolean;
}

/**
 * The limits of a built-in plugin (B650: about 2,000 lines are 0.11 MB). Since 1.23.0.
 */
export const BUILT_IN_SEARCH_LIMITS: Readonly<SearchLimits> = Object.freeze({
  lines: 3000,
  behaviours: 300,
  entries: 300,
  listLength: 64,
  wordLength: 64,
  sentenceLength: 200,
  valueLength: 4096,
  ownBehavioursOnly: false,
});

/**
 * The limits of a third-party plugin, which can name only its own things (ADR 0124 D13).
 * Since 1.23.0.
 */
export const THIRD_PARTY_SEARCH_LIMITS: Readonly<SearchLimits> = Object.freeze({
  lines: 500,
  behaviours: 50,
  entries: 50,
  listLength: 64,
  wordLength: 64,
  sentenceLength: 200,
  valueLength: 4096,
  ownBehavioursOnly: true,
});

/**
 * The ids of one plugin's own things, which its search data may name. Build it with
 * {@link searchOwnThingsOf} from a plugin's contributions, or from a sandboxed plugin's
 * description. Since 1.23.0.
 */
export interface SearchOwnThings {
  /** Element kind ids. */
  kinds: readonly string[];
  /** Element template ids. */
  templates: readonly string[];
  /** Project starter ids (flows included). */
  starters: readonly string[];
  /** Example ids. */
  examples: readonly string[];
  /** Command ids. */
  commands: readonly string[];
  /**
   * The questions of each starter, by starter id and then question id, with the question's
   * choice values (empty for a question without choices). When absent, question hints are
   * checked against {@link starters} only.
   */
  questions?: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
}

/**
 * The ids of a plugin's own things, read from its contributions. Since 1.23.0.
 *
 * @param contributions - The plugin's contributions.
 * @returns The ids its search data may name.
 */
export function searchOwnThingsOf(contributions: PluginContributions): SearchOwnThings {
  const questions: Record<string, Record<string, readonly string[]>> = {};
  for (const starter of contributions.projectStarters ?? []) {
    const own: Record<string, readonly string[]> = {};
    for (const parameter of starter.parameters ?? []) {
      own[parameter.id] =
        parameter.type === 'choice' || parameter.type === 'set'
          ? parameter.choices.map((choice) => choice.value)
          : [];
    }
    questions[starter.id] = own;
  }
  return {
    kinds: (contributions.elementKinds ?? []).map((kind) => kind.id),
    templates: (contributions.elementTemplates ?? []).map((template) => template.id),
    starters: (contributions.projectStarters ?? []).map((starter) => starter.id),
    examples: (contributions.examples ?? []).map((example) => example.id),
    commands: (contributions.commands ?? []).map((command) => command.id),
    questions,
  };
}

/**
 * What {@link validateSearchContributions} returns. Since 1.23.0.
 */
export interface SearchValidation {
  /**
   * A fresh copy of the lines that passed, plain data only: fields the API does not define are
   * left out, and lines past a limit are dropped.
   */
  data: PluginSearchData;
  /**
   * One problem per dropped line or field, with an RFC 6901 `path` into the search data and a
   * `search.<check>` code. Empty when everything passed.
   */
  problems: Problem[];
}

const RESOURCE_LOCATION = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const COLOUR = /^#[0-9a-f]{6}$/;
const SUBJECTS: readonly string[] = ['item', 'block', 'mob', 'vehicle'];
const OPENS: readonly string[] = ['starter', 'template', 'example', 'kind', 'command'];
const ROLES: readonly string[] = ['name', 'main-colour', 'main-number'];

type Plain = Record<string, unknown>;

function isObject(value: unknown): value is Plain {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isJson(value: unknown, depth = 0): value is Json {
  if (depth > 64) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJson(item, depth + 1));
  if (isObject(value)) return Object.values(value).every((item) => isJson(item, depth + 1));
  return false;
}

function pointer(parts: readonly (string | number)[]): string {
  return parts.map((part) => `/${String(part).replace(/~/g, '~0').replace(/\//g, '~1')}`).join('');
}

/**
 * Checks one plugin's search data and keeps what passes. Pure and deterministic; never throws,
 * whatever it is given, so the host can pass it data from a sandboxed plugin as it arrived.
 *
 * A line is dropped (with an `error` problem) when it is malformed: a missing or empty string,
 * a string over the length limits, a list over {@link SearchLimits.listLength}, a colour not
 * written `#rrggbb` in lower case, a vanilla id that is not a namespaced id, a behaviour with
 * nothing to make, a JSON value that is not plain JSON or is over
 * {@link SearchLimits.valueLength}, a duplicate id, or a name of something that is not one of
 * the plugin's own things (entries, keywords and question hints always; behaviours when
 * {@link SearchLimits.ownBehavioursOnly}). Lines past a count limit are dropped with one problem.
 * An unknown field is left out with a `warning`.
 *
 * @example
 * ```ts
 * const { data, problems } = validateSearchContributions(
 *   await plugin.contributes.searchData?.(),
 *   searchOwnThingsOf(plugin.contributes),
 *   THIRD_PARTY_SEARCH_LIMITS,
 * );
 * ```
 *
 * @param input - What the plugin's `searchData` returned (anything; `undefined` is no data).
 * @param own - The ids of the plugin's own things.
 * @param limits - The limits to apply; defaults to {@link THIRD_PARTY_SEARCH_LIMITS}.
 * @returns The lines that passed and the problems found.
 */
export function validateSearchContributions(
  input: unknown,
  own: SearchOwnThings,
  limits: Readonly<SearchLimits> = THIRD_PARTY_SEARCH_LIMITS,
): SearchValidation {
  const problems: Problem[] = [];
  const data: PluginSearchData = {};
  const error = (code: string, message: string, path: readonly (string | number)[]): void => {
    problems.push({ severity: 'error', code: `search.${code}`, message, path: pointer(path) });
  };
  const warn = (message: string, path: readonly (string | number)[]): void => {
    problems.push({
      severity: 'warning',
      code: 'search.unknown-field',
      message,
      path: pointer(path),
    });
  };
  if (input === undefined || input === null) return { data, problems };
  if (!isObject(input)) {
    error('shape', 'The search data must be an object.', []);
    return { data, problems };
  }

  const starters = new Set(own.starters);
  const ownIds: Record<string, ReadonlySet<string>> = {
    starter: starters,
    template: new Set(own.templates),
    example: new Set(own.examples),
    kind: new Set(own.kinds),
    command: new Set(own.commands),
  };
  let lines = 0;

  /** Unknown fields of `value` other than `known`, each a warning. */
  const unknownFields = (
    value: Plain,
    known: readonly string[],
    path: readonly (string | number)[],
  ) => {
    for (const key of Object.keys(value).sort()) {
      if (!known.includes(key))
        warn(`The field "${key}" is not part of the search data; it was left out.`, [...path, key]);
    }
  };
  /** A non-empty string within `max`, else a message. */
  const text = (value: unknown, max: number, what: string): string | undefined => {
    if (typeof value !== 'string' || value.trim() === '')
      return `${what} must be a non-empty string.`;
    if (value.length > max) return `${what} is longer than ${max} characters.`;
    return undefined;
  };
  /** A list of words, or a message. */
  const words = (value: unknown, what: string, allowEmpty: boolean): string[] | string => {
    if (!Array.isArray(value)) return `${what} must be a list of strings.`;
    if (!allowEmpty && value.length === 0) return `${what} must not be empty.`;
    if (value.length > limits.listLength)
      return `${what} has more than ${limits.listLength} strings.`;
    for (const word of value) {
      const problem = text(word, limits.wordLength, `Each of ${what}`);
      if (problem !== undefined) return problem;
    }
    return [...(value as string[])];
  };
  const json = (value: unknown, what: string): Json | string => {
    if (!isJson(value)) return `${what} must be plain JSON.`;
    if (JSON.stringify(value).length > limits.valueLength) {
      return `${what} is longer than ${limits.valueLength} characters as JSON.`;
    }
    return structuredJson(value);
  };
  const takeLine = (path: readonly (string | number)[]): boolean => {
    if (lines >= limits.lines) {
      if (lines === limits.lines) {
        error('too-many', `More than ${limits.lines} search lines; the rest were dropped.`, path);
      }
      lines++;
      return false;
    }
    lines++;
    return true;
  };

  unknownFields(input, ['vocabulary', 'behaviours', 'entries', 'keywords', 'questions'], []);

  // Vocabulary.
  if (input.vocabulary !== undefined) {
    const vocabulary = input.vocabulary;
    if (!isObject(vocabulary)) {
      error('shape', 'The vocabulary must be an object.', ['vocabulary']);
    } else {
      unknownFields(vocabulary, ['words', 'colours'], ['vocabulary']);
      const out: SearchVocabulary = {};
      if (vocabulary.words !== undefined) {
        if (!Array.isArray(vocabulary.words)) {
          error('shape', 'The vocabulary words must be a list.', ['vocabulary', 'words']);
        } else {
          const groups: SearchWordGroup[] = [];
          vocabulary.words.forEach((group: unknown, index: number) => {
            const path = ['vocabulary', 'words', index];
            const kept = wordGroup(group, path);
            if (kept !== undefined && takeLine(path)) groups.push(kept);
          });
          out.words = groups;
        }
      }
      if (vocabulary.colours !== undefined) {
        if (!Array.isArray(vocabulary.colours)) {
          error('shape', 'The vocabulary colours must be a list.', ['vocabulary', 'colours']);
        } else {
          const colours: SearchColour[] = [];
          vocabulary.colours.forEach((colour: unknown, index: number) => {
            const path = ['vocabulary', 'colours', index];
            const kept = colourLine(colour, path);
            if (kept !== undefined && takeLine(path)) colours.push(kept);
          });
          out.colours = colours;
        }
      }
      data.vocabulary = out;
    }
  }

  function wordGroup(group: unknown, path: (string | number)[]): SearchWordGroup | undefined {
    if (!isObject(group)) {
      error('shape', 'A word group must be an object.', path);
      return undefined;
    }
    unknownFields(
      group,
      ['idea', 'same', 'near', 'slang', 'phrases', 'misspellings', 'vanillaIds'],
      path,
    );
    const idea = text(group.idea, limits.wordLength, "A word group's idea");
    if (idea !== undefined) {
      error('word', idea, [...path, 'idea']);
      return undefined;
    }
    const same = words(group.same, "A word group's same words", true);
    if (typeof same === 'string') {
      error('word', same, [...path, 'same']);
      return undefined;
    }
    const kept: SearchWordGroup = { idea: group.idea as string, same };
    for (const field of ['near', 'slang', 'phrases', 'misspellings', 'vanillaIds'] as const) {
      if (group[field] === undefined) continue;
      const list = words(group[field], `A word group's ${field}`, true);
      if (typeof list === 'string') {
        error('word', list, [...path, field]);
        return undefined;
      }
      if (field === 'vanillaIds') {
        const bad = list.findIndex((id) => !RESOURCE_LOCATION.test(id));
        if (bad >= 0) {
          error('vanilla-id', `"${list[bad]}" is not a namespaced id such as minecraft:stone.`, [
            ...path,
            field,
            bad,
          ]);
          return undefined;
        }
      }
      kept[field] = list;
    }
    return kept;
  }

  function colourLine(colour: unknown, path: (string | number)[]): SearchColour | undefined {
    if (!isObject(colour)) {
      error('shape', 'A colour must be an object.', path);
      return undefined;
    }
    unknownFields(colour, ['names', 'colour'], path);
    const names = words(colour.names, "A colour's names", false);
    if (typeof names === 'string') {
      error('word', names, [...path, 'names']);
      return undefined;
    }
    if (typeof colour.colour !== 'string' || !COLOUR.test(colour.colour)) {
      error('colour', 'A colour must be written #rrggbb with lower-case hex digits.', [
        ...path,
        'colour',
      ]);
      return undefined;
    }
    return { names, colour: colour.colour };
  }

  // Behaviours.
  if (input.behaviours !== undefined) {
    if (!Array.isArray(input.behaviours)) {
      error('shape', 'The behaviours must be a list.', ['behaviours']);
    } else {
      const kept: SearchBehaviour[] = [];
      const ids = new Set<string>();
      let reported = false;
      input.behaviours.forEach((behaviour: unknown, index: number) => {
        const path = ['behaviours', index];
        const line = behaviourLine(behaviour, path, ids);
        if (line === undefined) return;
        if (kept.length >= limits.behaviours) {
          if (!reported) {
            reported = true;
            error(
              'too-many',
              `More than ${limits.behaviours} behaviours; the rest were dropped.`,
              path,
            );
          }
          return;
        }
        ids.add(line.id);
        kept.push(line);
      });
      data.behaviours = kept;
    }
  }

  function starterNamed(id: unknown, path: (string | number)[]): boolean {
    if (typeof id !== 'string' || id === '') {
      error('shape', 'A starter id must be a non-empty string.', path);
      return false;
    }
    if (limits.ownBehavioursOnly && !starters.has(id)) {
      error('not-own', `"${id}" is not one of this plugin's own starters.`, path);
      return false;
    }
    return true;
  }

  function behaviourLine(
    behaviour: unknown,
    path: (string | number)[],
    ids: ReadonlySet<string>,
  ): SearchBehaviour | undefined {
    if (!isObject(behaviour)) {
      error('shape', 'A behaviour must be an object.', path);
      return undefined;
    }
    unknownFields(
      behaviour,
      ['id', 'phrases', 'sentence', 'appliesTo', 'flows', 'answers', 'rule', 'beside'],
      path,
    );
    const id = text(behaviour.id, limits.wordLength, "A behaviour's id");
    if (id !== undefined) {
      error('word', id, [...path, 'id']);
      return undefined;
    }
    if (ids.has(behaviour.id as string)) {
      error('duplicate', `The behaviour id "${behaviour.id as string}" is used twice.`, [
        ...path,
        'id',
      ]);
      return undefined;
    }
    const phrases = words(behaviour.phrases, "A behaviour's phrases", false);
    if (typeof phrases === 'string') {
      error('word', phrases, [...path, 'phrases']);
      return undefined;
    }
    const sentence = text(behaviour.sentence, limits.sentenceLength, "A behaviour's sentence");
    if (sentence !== undefined) {
      error('sentence', sentence, [...path, 'sentence']);
      return undefined;
    }
    const appliesTo = behaviour.appliesTo;
    if (
      !Array.isArray(appliesTo) ||
      appliesTo.length === 0 ||
      !appliesTo.every((subject) => typeof subject === 'string' && SUBJECTS.includes(subject))
    ) {
      error('applies-to', 'A behaviour applies to one or more of item, block, mob and vehicle.', [
        ...path,
        'appliesTo',
      ]);
      return undefined;
    }
    const kept: SearchBehaviour = {
      id: behaviour.id as string,
      phrases,
      sentence: behaviour.sentence as string,
      appliesTo: [...new Set(appliesTo as SearchBehaviourSubject[])],
    };
    if (behaviour.flows !== undefined) {
      const flows = words(behaviour.flows, "A behaviour's flows", false);
      if (typeof flows === 'string') {
        error('word', flows, [...path, 'flows']);
        return undefined;
      }
      for (const [index, flow] of flows.entries()) {
        if (!starterNamed(flow, [...path, 'flows', index])) return undefined;
      }
      kept.flows = flows;
    }
    if (behaviour.answers !== undefined) {
      if (!isObject(behaviour.answers) || !Object.values(behaviour.answers).every(isObject)) {
        error('shape', "A behaviour's answers are objects of answers by starter id.", [
          ...path,
          'answers',
        ]);
        return undefined;
      }
      for (const starter of Object.keys(behaviour.answers)) {
        if (!starterNamed(starter, [...path, 'answers', starter])) return undefined;
      }
      const answers = json(behaviour.answers, "A behaviour's answers");
      if (typeof answers === 'string') {
        error('value', answers, [...path, 'answers']);
        return undefined;
      }
      kept.answers = answers as Record<string, Record<string, Json>>;
    }
    if (behaviour.rule !== undefined) {
      const rule = json(behaviour.rule, "A behaviour's rule");
      if (typeof rule === 'string' || !isObject(rule)) {
        error('value', typeof rule === 'string' ? rule : "A behaviour's rule must be an object.", [
          ...path,
          'rule',
        ]);
        return undefined;
      }
      kept.rule = rule;
    }
    if (behaviour.beside !== undefined) {
      const beside = behaviour.beside;
      if (!isObject(beside) || !isObject(beside.values)) {
        error('shape', "A behaviour's companion flow has a starter and values.", [
          ...path,
          'beside',
        ]);
        return undefined;
      }
      unknownFields(beside, ['starter', 'values'], [...path, 'beside']);
      if (!starterNamed(beside.starter, [...path, 'beside', 'starter'])) return undefined;
      const values = json(beside.values, "A companion flow's values");
      if (typeof values === 'string') {
        error('value', values, [...path, 'beside', 'values']);
        return undefined;
      }
      kept.beside = { starter: beside.starter as string, values: values as Record<string, Json> };
    }
    if (
      kept.flows === undefined &&
      kept.answers === undefined &&
      kept.rule === undefined &&
      kept.beside === undefined
    ) {
      error('makes-nothing', 'A behaviour names flows, answers, a rule or a companion flow.', path);
      return undefined;
    }
    return kept;
  }

  // Entries.
  if (input.entries !== undefined) {
    if (!Array.isArray(input.entries)) {
      error('shape', 'The entries must be a list.', ['entries']);
    } else {
      const kept: SearchEntryContribution[] = [];
      const ids = new Set<string>();
      let reported = false;
      input.entries.forEach((entry: unknown, index: number) => {
        const path = ['entries', index];
        const line = entryLine(entry, path, ids);
        if (line === undefined) return;
        if (kept.length >= limits.entries) {
          if (!reported) {
            reported = true;
            error('too-many', `More than ${limits.entries} entries; the rest were dropped.`, path);
          }
          return;
        }
        ids.add(line.id);
        kept.push(line);
      });
      data.entries = kept;
    }
  }

  function entryLine(
    entry: unknown,
    path: (string | number)[],
    ids: ReadonlySet<string>,
  ): SearchEntryContribution | undefined {
    if (!isObject(entry)) {
      error('shape', 'An entry must be an object.', path);
      return undefined;
    }
    unknownFields(entry, ['id', 'title', 'sentence', 'words', 'opens'], path);
    for (const [field, max] of [
      ['id', limits.wordLength],
      ['title', limits.wordLength],
    ] as const) {
      const problem = text(entry[field], max, `An entry's ${field}`);
      if (problem !== undefined) {
        error('word', problem, [...path, field]);
        return undefined;
      }
    }
    if (ids.has(entry.id as string)) {
      error('duplicate', `The entry id "${entry.id as string}" is used twice.`, [...path, 'id']);
      return undefined;
    }
    const sentence = text(entry.sentence, limits.sentenceLength, "An entry's sentence");
    if (sentence !== undefined) {
      error('sentence', sentence, [...path, 'sentence']);
      return undefined;
    }
    const opens = entry.opens;
    if (
      !isObject(opens) ||
      typeof opens.type !== 'string' ||
      !OPENS.includes(opens.type) ||
      typeof opens.id !== 'string'
    ) {
      error('shape', 'An entry opens a starter, template, example, kind or command by id.', [
        ...path,
        'opens',
      ]);
      return undefined;
    }
    unknownFields(opens, ['type', 'id', 'values'], [...path, 'opens']);
    if (!ownIds[opens.type]?.has(opens.id)) {
      error('not-own', `"${opens.id}" is not one of this plugin's own ${opens.type}s.`, [
        ...path,
        'opens',
        'id',
      ]);
      return undefined;
    }
    const kept: SearchEntryContribution = {
      id: entry.id as string,
      title: entry.title as string,
      sentence: entry.sentence as string,
      opens: { type: opens.type as SearchEntryOpensType, id: opens.id },
    };
    if (opens.values !== undefined) {
      if (opens.type !== 'starter' || !isObject(opens.values)) {
        error('shape', 'Only an entry that opens a starter has values, as an object.', [
          ...path,
          'opens',
          'values',
        ]);
        return undefined;
      }
      const values = json(opens.values, "An entry's values");
      if (typeof values === 'string') {
        error('value', values, [...path, 'opens', 'values']);
        return undefined;
      }
      kept.opens.values = values as Record<string, Json>;
    }
    if (entry.words !== undefined) {
      const list = words(entry.words, "An entry's words", true);
      if (typeof list === 'string') {
        error('word', list, [...path, 'words']);
        return undefined;
      }
      kept.words = list;
    }
    return kept;
  }

  // Keywords.
  if (input.keywords !== undefined) {
    if (!isObject(input.keywords)) {
      error('shape', 'The keywords must be an object of word lists by id.', ['keywords']);
    } else {
      const kept: Record<string, string[]> = {};
      for (const id of Object.keys(input.keywords).sort()) {
        const path = ['keywords', id];
        if (!ownIds.template?.has(id) && !starters.has(id) && !ownIds.kind?.has(id)) {
          error(
            'not-own',
            `"${id}" is not one of this plugin's own templates, starters or kinds.`,
            path,
          );
          continue;
        }
        const list = words(input.keywords[id], 'A keywords list', false);
        if (typeof list === 'string') {
          error('word', list, path);
          continue;
        }
        if (takeLine(path)) kept[id] = list;
      }
      data.keywords = kept;
    }
  }

  // Question hints.
  if (input.questions !== undefined) {
    if (!isObject(input.questions)) {
      error('shape', 'The question hints must be an object by starter id.', ['questions']);
    } else {
      const kept: Record<string, Record<string, SearchQuestionHint>> = {};
      for (const starter of Object.keys(input.questions).sort()) {
        const hints = input.questions[starter];
        if (!starters.has(starter)) {
          error('not-own', `"${starter}" is not one of this plugin's own starters.`, [
            'questions',
            starter,
          ]);
          continue;
        }
        if (!isObject(hints)) {
          error('shape', "A starter's question hints must be an object by question id.", [
            'questions',
            starter,
          ]);
          continue;
        }
        const known = own.questions?.[starter];
        const keptHints: Record<string, SearchQuestionHint> = {};
        for (const question of Object.keys(hints).sort()) {
          const path = ['questions', starter, question];
          const hint = hintLine(hints[question], path, question, known);
          if (hint !== undefined && takeLine(path)) keptHints[question] = hint;
        }
        kept[starter] = keptHints;
      }
      data.questions = kept;
    }
  }

  function hintLine(
    hint: unknown,
    path: (string | number)[],
    question: string,
    known: Readonly<Record<string, readonly string[]>> | undefined,
  ): SearchQuestionHint | undefined {
    if (known !== undefined && !Object.hasOwn(known, question)) {
      error('not-own', `"${question}" is not a question of this starter.`, path);
      return undefined;
    }
    if (!isObject(hint)) {
      error('shape', 'A question hint must be an object.', path);
      return undefined;
    }
    unknownFields(
      hint,
      ['role', 'words', 'after', 'never', 'sameAs', 'appliesWhen', 'choiceWords'],
      path,
    );
    const kept: SearchQuestionHint = {};
    if (hint.role !== undefined) {
      if (typeof hint.role !== 'string' || !ROLES.includes(hint.role)) {
        error('shape', "A question's role is name, main-colour or main-number.", [...path, 'role']);
        return undefined;
      }
      kept.role = hint.role as NonNullable<SearchQuestionHint['role']>;
    }
    for (const field of ['words', 'after'] as const) {
      if (hint[field] === undefined) continue;
      const list = words(hint[field], `A question hint's ${field}`, false);
      if (typeof list === 'string') {
        error('word', list, [...path, field]);
        return undefined;
      }
      kept[field] = list;
    }
    if (hint.never !== undefined) {
      if (typeof hint.never !== 'boolean') {
        error('shape', "A question hint's never is true or false.", [...path, 'never']);
        return undefined;
      }
      kept.never = hint.never;
    }
    if (hint.sameAs !== undefined) {
      if (
        typeof hint.sameAs !== 'string' ||
        hint.sameAs === question ||
        (known !== undefined && !Object.hasOwn(known, hint.sameAs))
      ) {
        error('not-own', "A question hint's sameAs names another question of the same starter.", [
          ...path,
          'sameAs',
        ]);
        return undefined;
      }
      kept.sameAs = hint.sameAs;
    }
    if (hint.appliesWhen !== undefined) {
      const appliesWhen = hint.appliesWhen;
      if (
        !isObject(appliesWhen) ||
        !Object.values(appliesWhen).every((values) => Array.isArray(values))
      ) {
        error('shape', "A question hint's appliesWhen lists values by question id.", [
          ...path,
          'appliesWhen',
        ]);
        return undefined;
      }
      for (const other of Object.keys(appliesWhen)) {
        if (other === question || (known !== undefined && !Object.hasOwn(known, other))) {
          error('not-own', `"${other}" is not another question of this starter.`, [
            ...path,
            'appliesWhen',
            other,
          ]);
          return undefined;
        }
      }
      const values = json(appliesWhen, "A question hint's appliesWhen");
      if (typeof values === 'string') {
        error('value', values, [...path, 'appliesWhen']);
        return undefined;
      }
      kept.appliesWhen = values as Record<string, Json[]>;
    }
    if (hint.choiceWords !== undefined) {
      const choiceWords = hint.choiceWords;
      if (!isObject(choiceWords)) {
        error('shape', "A question hint's choiceWords lists words by choice value.", [
          ...path,
          'choiceWords',
        ]);
        return undefined;
      }
      const keptChoices: Record<string, string[]> = {};
      for (const choice of Object.keys(choiceWords).sort()) {
        const choices = known?.[question];
        if (choices !== undefined && !choices.includes(choice)) {
          error('not-own', `"${choice}" is not a choice of this question.`, [
            ...path,
            'choiceWords',
            choice,
          ]);
          return undefined;
        }
        const list = words(choiceWords[choice], "A choice's words", false);
        if (typeof list === 'string') {
          error('word', list, [...path, 'choiceWords', choice]);
          return undefined;
        }
        keptChoices[choice] = list;
      }
      kept.choiceWords = keptChoices;
    }
    return kept;
  }

  return { data, problems };
}

/** A deep copy of plain JSON (already checked by `isJson`). */
function structuredJson(value: Json): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
