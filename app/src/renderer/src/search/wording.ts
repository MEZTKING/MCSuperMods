/**
 * Every word of the search panel, per view mode (ADR 0124 D6, D8, D9, D11; the plan's
 * "Very easy wording", as built, per ADR 0124's findings): the field's label and placeholder per door, the examples under an empty
 * field, the section headings, the chips, the buttons of each result, the rows' source words, the
 * lines (nothing close, not on this version, the Minecraft folder, privacy) and the live region's
 * sentence. Very easy shows no ids and none of the words template, element, starter, kind,
 * namespace or JSON: {@link plainText} rewrites what the corpus says (titles, sentences, answers)
 * before Very easy shows it, and `test/components/search/wording.test.tsx` holds every Very easy
 * string and every row of the fixed query set's results to that.
 *
 * Pure data and functions, no DOM and no run-time import of `@msm/search` (the panel stays a small
 * lazy chunk; the engine is in the worker).
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';
import type { SearchEntry, SearchHit, SearchMode, SearchRequest, Understood } from '@msm/search';
import { ID_PATTERN, VERY_EASY_FORBIDDEN } from '../components/ai/ai-words';

/** Where the panel was opened (ADR 0124 D10). */
export type SearchDoor = 'start' | 'toolbar' | 'palette';

/** A scope chip or prefix (D10). */
export type SearchScope = NonNullable<SearchRequest['scope']>;

/** The scopes in chip order. */
export const SEARCH_SCOPES: readonly SearchScope[] = Object.freeze([
  'make',
  'mine',
  'minecraft',
  'help',
  'commands',
]);

/** The section ids of the engine (`@msm/search` `SECTION_IDS`, repeated: no run-time import). */
export type SearchSectionId = 'make' | 'mine' | 'minecraft' | 'help' | 'commands' | 'fix' | 'more';

/**
 * What a button of a result does; the panel hands the key to `props.onAction(hit, key)` and
 * B664's `run-action.ts` turns it into work (ADR 0124 D9's table).
 */
export type SearchActionKey =
  /** A flow: the Creator opened on it with the answers. */
  | 'make'
  /** Made at once into the open mod (a flow, a starter, an example, a template). */
  | 'add'
  /** A new mod made from it (no mod open). */
  | 'start'
  /** An example opened to look at. */
  | 'see-example'
  /** A kind: a new element of it. */
  | 'new'
  /** A kind: the mod's things of it. */
  | 'show-mine'
  /** A thing of the mod, a setting, a Home tile. */
  | 'open'
  | 'rename'
  | 'find-usages'
  | 'edit-in-creator'
  /** A vanilla id: the flows that take it, already answered. */
  | 'make-with'
  | 'copy-id'
  /** A Rules trigger, step, condition or number. */
  | 'add-rule'
  /** A command. */
  | 'run'
  /** A guide section, opened inside the app. */
  | 'show-me-how'
  /** A Thing to fix. */
  | 'fix'
  | 'show-me'
  /** Home's Surprise me tile. */
  | 'surprise'
  /** Home's AI helper tile. */
  | 'ask-ai';

/** One button of a result. */
export interface SearchActionButton {
  readonly key: SearchActionKey;
  readonly label: string;
}

/** What the buttons depend on besides the entry. */
export interface ActionContext {
  readonly mode: SearchMode;
  /** Whether a mod is open (no mod: **Start a mod with this**). */
  readonly hasMod: boolean;
  /** Whether a Thing to fix has a one-step fix (else **Show me**). */
  readonly canFix?: boolean;
}

// Fixed words ------------------------------------------------------------------------------

/** The fixed words of one mode. */
export interface SearchWords {
  readonly mode: SearchMode;
  /** The field's accessible name. */
  readonly fieldLabel: string;
  /** The field's placeholder per door. */
  readonly placeholder: Readonly<Record<SearchDoor, string>>;
  /** A line under the field (Advanced: the prefixes), or `null`. */
  readonly hint: string | null;
  /** "Try:" before the examples. */
  readonly examplesLead: string;
  /** Three searches of the fixed query set (`app/test/search/golden-queries.json`). */
  readonly examples: readonly string[];
  readonly understoodLead: string;
  readonly scopesLabel: string;
  readonly resultsLabel: string;
  readonly closest: string;
  readonly nothingClose: string;
  readonly wishlist: string;
  readonly askAi: string;
  readonly minecraftFolder: string;
  readonly privacy: string;
  readonly nameLabel: string;
  readonly searching: string;
}

const PLACEHOLDER_PLAIN: Readonly<Record<SearchDoor, string>> = Object.freeze({
  start: 'What do you want to make?',
  toolbar: 'Search or make anything',
  palette: 'Type a command',
});

const COMMON = {
  fieldLabel: 'Search',
  examplesLead: 'Try:',
  understoodLead: 'I understood:',
  scopesLabel: 'Look in',
  resultsLabel: 'Results',
  closest: 'Closest things',
  nothingClose: 'Nothing close to that yet. Try other words, or add it to your Wishlist.',
  wishlist: 'Add it to my Wishlist',
  askAi: 'Ask the AI helper',
  minecraftFolder: "Set up your Minecraft folder to see Minecraft's own names and pictures.",
  privacy: 'Nothing you type here leaves your computer.',
  nameLabel: 'Name',
  searching: 'Looking…',
} as const;

/** The words of each mode. */
export const SEARCH_WORDS: Readonly<Record<SearchMode, SearchWords>> = Object.freeze({
  'very-easy': {
    mode: 'very-easy',
    ...COMMON,
    placeholder: PLACEHOLDER_PLAIN,
    hint: null,
    examples: ['blue sword', 'make a pig fly', 'skyblock'],
  },
  easy: {
    mode: 'easy',
    ...COMMON,
    placeholder: PLACEHOLDER_PLAIN,
    hint: null,
    examples: ['blue sword', 'how do I add a recipe', 'export jar'],
  },
  advanced: {
    mode: 'advanced',
    ...COMMON,
    placeholder: PLACEHOLDER_PLAIN,
    hint: 'Start with > for commands, @ for your things, # for Minecraft ids, ? for how to.',
    examples: ['minecraft:creeper', 'export jar', 'how do I add a recipe'],
  },
});

/** The words of a mode. */
export function searchWords(mode: SearchMode): SearchWords {
  return SEARCH_WORDS[mode] ?? SEARCH_WORDS.easy;
}

/** The scope chips' words. Advanced shows each one's prefix beside it. */
export const SCOPE_LABELS: Readonly<Record<SearchScope, string>> = Object.freeze({
  make: 'Make',
  mine: 'My mod',
  minecraft: 'Minecraft',
  help: 'Help',
  commands: 'Commands',
});

/** The prefix of each scope in Advanced (D10). */
export const SCOPE_PREFIXES: Readonly<Record<SearchScope, string>> = Object.freeze({
  commands: '>',
  mine: '@',
  minecraft: '#',
  help: '?',
  make: '',
});

/** The scopes shown as chips in a mode (Very easy has no commands chip). */
export function scopesShown(mode: SearchMode): readonly SearchScope[] {
  return mode === 'very-easy'
    ? SEARCH_SCOPES.filter((scope) => scope !== 'commands')
    : SEARCH_SCOPES;
}

/**
 * The scope a typed prefix asks for, and the words after it (Advanced only; elsewhere the text is
 * read as it is).
 */
export function readPrefix(
  text: string,
  mode: SearchMode,
): { readonly scope?: SearchScope; readonly text: string } {
  if (mode !== 'advanced') return { text };
  const trimmed = text.trimStart();
  const first = trimmed.charAt(0);
  for (const scope of SEARCH_SCOPES) {
    const prefix = SCOPE_PREFIXES[scope];
    if (prefix !== '' && first === prefix) return { scope, text: trimmed.slice(1).trimStart() };
  }
  return { text };
}

/** The headings of the sections (the engine's `SECTION_TITLES`, held equal by a test). */
export const SECTION_HEADINGS: Readonly<Record<SearchSectionId, string>> = Object.freeze({
  make: 'Things you can make',
  mine: 'In your mod',
  minecraft: 'From Minecraft',
  help: 'How to',
  commands: 'Settings and commands',
  fix: 'Things to fix',
  more: 'More',
});

/** The heading of a section (an unknown id reads as More). */
export function sectionHeading(id: string): string {
  return SECTION_HEADINGS[id as SearchSectionId] ?? SECTION_HEADINGS.more;
}

/** The heading over the Best matches. */
export function bestHeading(count: number): string {
  return count === 1 ? 'Best match' : 'Best matches';
}

/** The Show more row: Very easy says only that; the others say how many. */
export function showMoreLabel(mode: SearchMode, more: number): string {
  return mode === 'very-easy' || more <= 0 ? 'Show more' : `Show more (${more})`;
}

// Very easy's plain text -----------------------------------------------------------------------

/** Plain words made from an id's path (`minecraft:oak_log` reads `oak log`). */
function wordsOfIdText(id: string): string {
  const path = id.includes(':') ? id.slice(id.lastIndexOf(':') + 1) : id;
  return path.replace(/[_/.]+/g, ' ').trim();
}

/**
 * Words Very easy says in place of the technical ones (whole words, keeping a capital). Minecraft's
 * own item name "smithing template" stays as the game says it.
 */
const PLAIN_SWAPS: readonly (readonly [RegExp, string])[] = [
  [/\bnamespaces\b/gi, 'mod names'],
  [/\bnamespace\b/gi, 'mod name'],
  [/\belements\b/gi, 'things'],
  [/\belement(?:'s)?\b/gi, 'thing'],
  [/\bstarters\b/gi, 'ready-made mods'],
  [/\bstarter\b/gi, 'ready-made mod'],
  [/\btemplates\b/gi, 'patterns'],
  [/\btemplate\b/gi, 'pattern'],
  [/\bkinds\b/gi, 'sorts'],
  [/\bkind\b/gi, 'sort'],
  [/\braw json\b/gi, 'file text'],
  [/\bjson\b/gi, 'file'],
  [/\bschematics\b/gi, 'building files'],
  [/\bschematic\b/gi, 'building file'],
  [/\bschemas?\b/gi, 'shape'],
  [/\bapi\b/gi, 'link'],
  [/\btokens?\b/gi, 'pieces'],
  [/\brequests?\b/gi, 'asks'],
  [/\bplaceholders?\b/gi, 'stand-in'],
  [/\bchangesets?\b/gi, 'changes'],
];

/** Words of the forbidden list Very easy never shows, as whole words (checked by tests). */
export const VERY_EASY_SEARCH_FORBIDDEN: readonly string[] = Object.freeze([
  'template',
  'element',
  'starter',
  'kind',
  'namespace',
  'json',
]);

/** A word, or its plural, as a whole word in any case. */
function wholeWord(word: string): RegExp {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i');
}

/** Minecraft's own names that hold a forbidden word and stay as the game says them. */
const KEPT_NAMES = /\bsmithing templates?\b/gi;

/** Keeps the first letter's case of `found` on `swap`. */
function sameCase(found: string, swap: string): string {
  const first = found.charAt(0);
  return first !== first.toLowerCase() ? swap.charAt(0).toUpperCase() + swap.slice(1) : swap;
}

/**
 * The forbidden words of a Very easy string: the AI helper's list (ids among them) and the
 * search's own whole words, leaving out Minecraft's own "smithing template".
 */
export function searchForbiddenIn(text: string): string[] {
  const kept = text.replace(KEPT_NAMES, '');
  const lower = kept.toLowerCase();
  // Whole words only: "api" is in "Lapis" and "leaping", which Very easy may well show.
  const found = VERY_EASY_FORBIDDEN.filter((word) =>
    word.endsWith(':') ? lower.includes(word) : wholeWord(word).test(kept),
  );
  for (const word of VERY_EASY_SEARCH_FORBIDDEN) {
    if (wholeWord(word).test(kept) && !found.includes(word)) found.push(word);
  }
  const id = ID_PATTERN.exec(kept);
  if (id !== null) found.push(id[0]);
  return found;
}

/**
 * The text as Very easy shows it: ids become their words (`#minecraft:load` reads `load`), the
 * technical words become plain ones; in the other modes the text is unchanged. Returns `null`
 * when nothing plain is left (a sentence is then left out); with `loose`, the rewritten text
 * whatever is left in it (a title is always shown: a word of the AI helper's list inside another
 * word, such as "api" in "rapid", is no technical word).
 */
export function plainText(
  text: string,
  mode: SearchMode,
  options: { readonly loose?: boolean } = {},
): string | null {
  if (mode !== 'very-easy') return text;
  let out = text.replace(/<[^<>\s]*>:/g, '');
  out = out.replace(new RegExp(`#?${ID_PATTERN.source}`, 'g'), (id) =>
    wordsOfIdText(id.replace(/^#/, '')),
  );
  const kept: string[] = [];
  out = out.replace(KEPT_NAMES, (name) => {
    kept.push(name);
    return `\uE000${kept.length - 1}\uE000`;
  });
  for (const [pattern, swap] of PLAIN_SWAPS) {
    out = out.replace(pattern, (found) => sameCase(found, swap));
  }
  out = out.replace(/\uE000(\d+)\uE000/g, (_, index: string) => kept[Number(index)] ?? '');
  out = out.replace(/\s{2,}/g, ' ').trim();
  if (out === '') return null;
  if (options.loose !== true && searchForbiddenIn(out).length > 0) return null;
  return out;
}

// Rows ------------------------------------------------------------------------------------

/** The source word and picture of a row (D11: never told by colour alone). */
export type SourcePicture = 'make' | 'mine' | 'minecraft' | 'help' | 'setting' | 'command' | 'fix';

/** A row's source word and picture. */
export function sourceOf(
  entry: SearchEntry,
  mode: SearchMode,
): { readonly word: string; readonly picture: SourcePicture } {
  switch (entry.source) {
    case 'flow':
    case 'tile':
      return { word: 'Make', picture: 'make' };
    case 'starter':
      return { word: mode === 'very-easy' ? 'Make' : 'Starter', picture: 'make' };
    case 'example':
      return { word: 'Example', picture: 'make' };
    case 'template':
      return { word: mode === 'very-easy' ? 'Make' : 'Template', picture: 'make' };
    case 'kind':
      return {
        word: mode === 'advanced' ? 'Kind' : mode === 'easy' ? 'Studio' : 'Make',
        picture: 'make',
      };
    case 'rule':
      return { word: 'Rule', picture: 'make' };
    case 'project':
      return { word: 'In your mod', picture: 'mine' };
    case 'vanilla':
      return { word: 'Minecraft', picture: 'minecraft' };
    case 'guide':
      return { word: 'How to', picture: 'help' };
    case 'setting':
      return { word: 'Setting', picture: 'setting' };
    case 'command':
      return { word: 'Command', picture: 'command' };
    case 'problem':
      return { word: 'To fix', picture: 'fix' };
    default:
      return { word: 'More', picture: 'make' };
  }
}

/** A colour answer as a hex code, when it is one. */
export function isHexColour(value: Json | undefined): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

/** One understood answer of a row. */
export interface AnswerWord {
  readonly question: string;
  readonly text: string;
  /** A colour answer's hex code, drawn as a swatch beside its words. */
  readonly swatch?: string;
}

function choiceLabel(entry: SearchEntry, question: string, value: Json): string | undefined {
  const asked = entry.questions?.find((q) => q.id === question);
  return asked?.choices?.find((choice) => choice.value === value)?.label;
}

/**
 * The answers of a hit in words, in the flow's question order: a choice by its label, a colour by
 * the colour word typed (the reader's colour chips in order; the code itself in Advanced), a name
 * as "called X", yes or no by the question's label. Very easy's words go through
 * {@link plainText}; an answer with nothing plain left is left out.
 */
export function answerWords(
  hit: SearchHit,
  understood: Understood,
  mode: SearchMode,
): AnswerWord[] {
  const answers = hit.answers;
  if (answers === undefined) return [];
  const colours = understood.chips
    .filter((chip) => chip.kind === 'colour' && chip.struck !== true)
    .map((chip) => chip.text);
  let colourAt = 0;
  const order = hit.entry.questions?.map((q) => q.id) ?? [];
  const ids = Object.keys(answers).sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib) || (a < b ? -1 : 1);
  });
  const out: AnswerWord[] = [];
  for (const id of ids) {
    const value = answers[id] as Json;
    const question = hit.entry.questions?.find((q) => q.id === id);
    const label = question?.label ?? id;
    let text: string;
    let swatch: string | undefined;
    if (isHexColour(value)) {
      swatch = value;
      const word = colours[colourAt++];
      text = word ?? (mode === 'advanced' ? value : 'its own colour');
      if (mode === 'advanced' && word !== undefined) text = `${word} (${value})`;
    } else if (Array.isArray(value)) {
      text = value
        .map((item) => choiceLabel(hit.entry, id, item) ?? (typeof item === 'string' ? item : ''))
        .filter((item) => item !== '')
        .join(', ');
    } else if (typeof value === 'boolean') {
      text = `${label}: ${value ? 'yes' : 'no'}`;
    } else if (typeof value === 'number') {
      text = `${label}: ${value}`;
    } else if (typeof value === 'string') {
      const chosen = choiceLabel(hit.entry, id, value);
      if (chosen !== undefined) text = chosen;
      else if (question?.type === 'string' || /name$/i.test(id)) text = `called ${value}`;
      else text = value;
    } else {
      continue;
    }
    const plain = plainText(text, mode);
    if (plain === null || plain === '') continue;
    out.push(
      swatch !== undefined ? { question: id, text: plain, swatch } : { question: id, text: plain },
    );
  }
  return out;
}

/** A row's words. */
export interface RowText {
  readonly title: string;
  /** The answers as one sentence ("Sword, blue, called Blue Sword."), or the entry's sentence. */
  readonly detail: string | null;
  readonly answers: readonly AnswerWord[];
  /** What the clause adds ("When a player breaks it, it gives experience."). */
  readonly behaviour: string | null;
  /** The id, in Advanced only. */
  readonly id: string | null;
  /** Why it cannot be made on this target. */
  readonly reason: string | null;
  readonly source: { readonly word: string; readonly picture: SourcePicture };
}

/** Joins answer words as a sentence: the first letter a capital, a full stop at the end. */
export function asSentence(words: readonly string[]): string | null {
  const text = words.filter((word) => word !== '').join(', ');
  if (text === '') return null;
  const capital = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

/** The words of a row in a mode. */
export function rowText(hit: SearchHit, understood: Understood, mode: SearchMode): RowText {
  const entry = hit.entry;
  const answers = answerWords(hit, understood, mode);
  const title = plainText(entry.title, mode, { loose: true }) ?? sourceOf(entry, mode).word;
  const sentence = entry.sentence === undefined ? null : plainText(entry.sentence, mode);
  const detail = answers.length > 0 ? asSentence(answers.map((answer) => answer.text)) : sentence;
  const behaviour = hit.behaviour === undefined ? null : plainText(hit.behaviour.sentence, mode);
  const id = mode === 'advanced' ? (entry.ids?.[0] ?? entry.id) : null;
  const reason =
    entry.available === false
      ? (plainText(entry.unavailableReason ?? 'Not on this Minecraft version.', mode) ??
        'Not on this Minecraft version.')
      : null;
  return { title, detail, answers, behaviour, id, reason, source: sourceOf(entry, mode) };
}

// Buttons -----------------------------------------------------------------------------------

const LABELS: Readonly<Record<SearchActionKey, string>> = Object.freeze({
  make: 'Make this',
  add: 'Add to my mod',
  start: 'Start a mod with this',
  'see-example': 'See the example',
  new: 'Make a new one',
  'show-mine': 'Show mine',
  open: 'Open',
  rename: 'Rename',
  'find-usages': 'Find usages',
  'edit-in-creator': 'Edit in Creator',
  'make-with': 'Make something with it',
  'copy-id': 'Copy id',
  'add-rule': 'Add this rule',
  run: 'Run',
  'show-me-how': 'Show me how',
  fix: 'Fix it',
  'show-me': 'Show me',
  surprise: 'Surprise me',
  'ask-ai': 'Ask the AI helper',
});

/** The label of an action key. */
export function actionLabel(key: SearchActionKey): string {
  return LABELS[key];
}

const button = (key: SearchActionKey): SearchActionButton => ({ key, label: LABELS[key] });

/**
 * The buttons of a result, main first (D9's table): Enter runs the first, Ctrl/Cmd+Enter the
 * second. An entry the target cannot make has none.
 */
export function actionsFor(entry: SearchEntry, context: ActionContext): SearchActionButton[] {
  if (entry.available === false) return [];
  const addOrStart = context.hasMod ? button('add') : button('start');
  const type = typeof entry.action?.type === 'string' ? entry.action.type : '';
  switch (type) {
    case 'flow':
      return [button('make'), addOrStart];
    case 'flows':
      return [button('make')];
    case 'starter':
      return [addOrStart];
    case 'example':
      return [addOrStart, button('see-example')];
    case 'template':
      return [addOrStart];
    case 'kind':
      return context.hasMod ? [button('new'), button('show-mine')] : [button('new')];
    case 'surprise':
      return [button('surprise')];
    case 'ai':
      return [button('ask-ai')];
    case 'rules-book':
    case 'paint':
    case 'setting':
    case 'asset':
      return [button('open')];
    case 'element':
      return context.mode === 'very-easy'
        ? [button('open'), button('rename')]
        : [button('open'), button('rename'), button('find-usages'), button('edit-in-creator')];
    case 'rule':
      return [button('open')];
    case 'vanilla':
      return context.mode === 'advanced'
        ? [button('make-with'), button('copy-id')]
        : [button('make-with')];
    case 'rule-part':
      return [button('add-rule')];
    case 'command':
      return [button('run')];
    case 'guide':
      return [button('show-me-how')];
    case 'problem':
      return context.canFix === true ? [button('fix'), button('show-me')] : [button('show-me')];
    default:
      return [button('open')];
  }
}

/** Whether a result's buttons take a name (a template, D9). */
export function takesName(entry: SearchEntry): boolean {
  return entry.available !== false && entry.action?.type === 'template';
}

// The live region ----------------------------------------------------------------------------

/** What the live region reads (D11: the count and the best match, politely). */
export function liveSentence(input: {
  readonly mode: SearchMode;
  readonly text: string;
  readonly count: number;
  readonly confident: boolean;
  readonly first: SearchHit | undefined;
  readonly understood: Understood;
}): string {
  if (input.text.trim() === '') return '';
  const words = searchWords(input.mode);
  if (input.count === 0 || input.first === undefined) return words.nothingClose;
  const count = input.count === 1 ? '1 result.' : `${input.count} results.`;
  const title = rowText(input.first, input.understood, input.mode).title;
  return input.confident
    ? `${count} ${bestHeading(1)}: ${title}.`
    : `${count} ${words.closest}: ${title}.`;
}

// Chips ---------------------------------------------------------------------------------------

/** A chip as the panel shows it. */
export interface ChipText {
  /** The words shown. */
  readonly text: string;
  /** The words read out by the remove button ("Remove blue"). */
  readonly removeLabel: string;
  readonly struck: boolean;
}

const CHIP_KIND_WORDS: Readonly<Record<string, string>> = Object.freeze({
  colour: 'colour',
  thing: 'thing',
  number: 'number',
  name: 'name',
  behaviour: 'does',
});

/**
 * A chip's words: Very easy and Easy say the words alone; Advanced says what each is ("colour:
 * blue"); struck ones read "Not understood: …".
 */
export function chipText(chip: Understood['chips'][number], mode: SearchMode): ChipText {
  const words = plainText(chip.text, mode) ?? chip.text.replace(/[^\p{L}\p{N}' ]+/gu, ' ').trim();
  const struck = chip.struck === true;
  if (struck) {
    return { text: words, removeLabel: `Remove ${words}`, struck };
  }
  const kind = CHIP_KIND_WORDS[chip.kind];
  const text = mode === 'advanced' && kind !== undefined ? `${kind}: ${words}` : words;
  return { text, removeLabel: `Remove ${words}`, struck };
}

/** The line of a corrected query ("Showing results for creeper"). */
export function correctedLine(understood: Understood, mode: SearchMode): string | null {
  if (understood.corrected === undefined || understood.corrected === '') return null;
  const words = plainText(understood.corrected, mode) ?? understood.corrected;
  return `Showing results for ${words}`;
}

/** The lead of the struck chips. */
export const NOT_UNDERSTOOD = 'Not understood:';
