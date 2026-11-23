/**
 * Every word of the AI helper's conversation, per view mode (ADR 0125 D13): the empty panel,
 * the message box, the state line, the plan, the review, the notices after adding and undoing,
 * the tool lines, the cost sentence, the failures and Explain. The modes differ only in how much
 * detail they show: Very easy and Easy say the same plain sentences (Easy adds the files behind a
 * thing), Advanced adds ids, kinds, numbers and Anthropic's own reasons.
 *
 * Pure data and functions, no DOM; `ai-words.test.ts` reads every string of every mode and finds
 * none of {@link VERY_EASY_FORBIDDEN} and no id in a Very easy one.
 *
 * @packageDocumentation
 */

import {
  type AiLimitReached,
  type AiMode,
  type AiModelId,
  type AiUsage,
  estimateCost,
  formatCost,
  modelInfo,
} from '@msm/ai';
import { wordsOfId } from '../../session/plain-problems';
import type { AiAppliedStep, AiDisplayMessage, AiMadeThing } from '../../store/ai-store';
import type { AiFailure, AiStatus, AiStatusAction } from './ai-status';

/** The view modes the words are written for (the mode preference's values). */
export type UiMode = 'very-easy' | 'easy' | 'advanced';

/** Every view mode, Very easy first. */
export const WORDS_MODES: readonly UiMode[] = Object.freeze(['very-easy', 'easy', 'advanced']);

/**
 * The kinds that are things of their own, in the order a Creator set picks its main element,
 * with their words: the same list as `THING_KINDS` of `home/things.ts` (which this file cannot
 * import: it is compiled in the Node project too); `ai-status.test.ts` holds the two equal.
 */
export const THING_KIND_WORDS: readonly { kind: string; word: string }[] = Object.freeze([
  { kind: 'msm:vehicle', word: 'Vehicle' },
  { kind: 'msm:villager_profession', word: 'Village job' },
  { kind: 'msm:fluid', word: 'Liquid' },
  { kind: 'msm:block', word: 'Block' },
  { kind: 'msm:item', word: 'Item' },
  { kind: 'msm:entity', word: 'Mob' },
  { kind: 'msm:effect', word: 'Effect' },
  { kind: 'msm:potion', word: 'Potion' },
  { kind: 'msm:rules', word: 'Rules' },
  { kind: 'msm:command', word: 'Command' },
  { kind: 'msm:key_bind', word: 'Key' },
  { kind: 'msm:hud', word: 'On screen' },
  { kind: 'msm:creative_tab', word: 'Creative tab' },
]);

const THING_KIND_SET: ReadonlySet<string> = new Set(THING_KIND_WORDS.map((entry) => entry.kind));

/** Whether elements of `kind` are things of their own (cards of My things). */
export function isThingKind(kind: string): boolean {
  return THING_KIND_SET.has(kind);
}

/**
 * Words never shown in Very easy (ADR 0125 D13), matched without case anywhere in a string.
 * "Tool" alone stays allowed: a pickaxe is one.
 */
export const VERY_EASY_FORBIDDEN: readonly string[] = Object.freeze([
  'msm:',
  'minecraft:',
  'json',
  'api',
  'token',
  'tool turn',
  'element',
  'changeset',
  'schema',
  'starter',
  'request',
  'placeholder',
]);

/** An id (`name:path`) as Very easy must never show one. */
export const ID_PATTERN = /\b[a-z0-9_.-]+:[a-z0-9_./-]+\b/;

/** The words of `text` that Very easy forbids, and an id if it holds one. */
export function forbiddenIn(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = VERY_EASY_FORBIDDEN.filter((word) => lower.includes(word));
  const id = ID_PATTERN.exec(text);
  if (id !== null) found.push(id[0]);
  return found;
}

/** One example ask of the empty panel: it fills the box (and the run's size) without sending. */
export interface AiExampleAsk {
  text: string;
  /** The run's size when sent: `build` for a whole mod (ADR 0125 D2). */
  size: AiMode;
}

/** The four example asks (the same in every mode). */
export const EXAMPLE_ASKS: readonly AiExampleAsk[] = Object.freeze([
  { text: 'Make a ruby sword', size: 'chat' },
  { text: 'Make a block that glows in the dark', size: 'chat' },
  { text: 'Make a friendly animal that follows me', size: 'chat' },
  {
    text: 'Make a whole mod about rubies: ore, gem, tools and armour',
    size: 'build',
  },
] satisfies AiExampleAsk[]);

/** The label of each action a state line or notice may offer. */
export type AiActionLabels = Readonly<Record<AiStatusAction, string>>;

/** The fixed words of one mode. */
export interface AiWords {
  readonly mode: UiMode;
  readonly emptyTitle: string;
  readonly emptyBody: string;
  /** One more sentence of the empty panel, or `null`. */
  readonly emptyExtra: string | null;
  readonly examples: readonly AiExampleAsk[];
  /** The empty panel's last line: chats are not kept after MCSuperMods closes (F19). */
  readonly notSaved: string;
  readonly inputPlaceholder: string;
  readonly send: string;
  readonly newChat: string;
  readonly actions: AiActionLabels;
  /** Whether the transcript shows the model's thinking (closed) at all. */
  readonly showThinking: boolean;
  readonly thinking: string;
  readonly plan: {
    readonly heading: string;
    readonly makeAll: string;
    readonly oneAtATime: string;
    readonly change: string;
    readonly changePrompt: string;
    readonly leaveOut: string;
    readonly keepGoing: string;
    readonly stop: string;
    readonly pictures: string;
  };
  readonly review: {
    readonly add: string;
    /** "Do it" when something is changed or removed. */
    readonly makeChanges: string;
    readonly throwAway: string;
    readonly keep: string;
    /** The disclosure of a thing's files (Easy), or `null` where files are not shown that way. */
    readonly filesBehind: string | null;
    /** The disclosure of a file's diff (Advanced), or `null`. */
    readonly beforeAfter: string | null;
    readonly pictures: string;
    readonly moreMayFollow: string;
  };
  /** The Explain entry point's label (a Things to fix row in Very easy, the Problems tab else). */
  readonly explain: string;
}

const ACTIONS: AiActionLabels = Object.freeze({
  stop: 'Stop',
  'show-plan': 'Show the plan',
  look: 'Look',
  'keep-going': 'Keep going',
  'try-again': 'Try again',
  'check-key': 'Check my key',
  'new-chat': 'New chat',
  'show-me': 'Show me',
  undo: 'Undo',
  'put-back': 'Put back',
});

const PLAIN: AiWords = Object.freeze({
  mode: 'easy',
  emptyTitle: 'What would you like to make?',
  emptyBody:
    'Say it in your own words. I show you what I would make first. Nothing is added to your mod until you say so.',
  emptyExtra: null,
  examples: EXAMPLE_ASKS,
  notSaved: 'Chats are not saved: they last until you close MCSuperMods or start a new one.',
  inputPlaceholder: 'Type what you want, then press Send',
  send: 'Send',
  newChat: 'New chat',
  actions: ACTIONS,
  showThinking: true,
  thinking: 'Thinking',
  plan: Object.freeze({
    heading: 'Here is my plan',
    makeAll: 'Make all of it',
    oneAtATime: 'One at a time',
    change: 'Change the plan',
    changePrompt: 'What should be different?',
    leaveOut: 'Leave this out',
    keepGoing: 'Keep going',
    stop: 'Stop',
    pictures: 'Pictures',
  }),
  review: Object.freeze({
    add: 'Add to my mod',
    makeChanges: 'Make these changes',
    throwAway: 'Throw away',
    keep: 'Keep',
    filesBehind: 'Files behind this',
    beforeAfter: null,
    pictures: 'Pictures',
    moreMayFollow: 'More may follow',
  }),
  explain: 'Explain',
});

const WORDS: Readonly<Record<UiMode, AiWords>> = Object.freeze({
  'very-easy': Object.freeze({
    ...PLAIN,
    mode: 'very-easy',
    showThinking: false,
    review: Object.freeze({ ...PLAIN.review, filesBehind: null }),
    explain: 'Ask the helper',
  }),
  easy: PLAIN,
  advanced: Object.freeze({
    ...PLAIN,
    mode: 'advanced',
    emptyExtra: 'Ask about a problem or an element.',
    inputPlaceholder: 'Ask or describe what to make (Enter sends, Shift+Enter for a new line)',
    actions: Object.freeze({ ...ACTIONS, 'show-me': 'Show', 'put-back': 'Redo' }),
    review: Object.freeze({
      ...PLAIN.review,
      add: 'Apply',
      makeChanges: 'Apply',
      throwAway: 'Discard',
      filesBehind: null,
      beforeAfter: 'Before and after',
      pictures: 'Textures',
    }),
  }),
});

/** The fixed words of `mode`. */
export function wordsFor(mode: UiMode): AiWords {
  return WORDS[mode];
}

// Small helpers --------------------------------------------------------------------------

const NUMBER = new Intl.NumberFormat('en-GB');

/** "1 thing", "2 things". */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${NUMBER.format(n)} ${n === 1 ? one : many}`;
}

const isAre = (n: number): string => (n === 1 ? 'is' : 'are');

/** "A, B and C". */
export function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "a tool", "an item". */
export function withArticle(what: string): string {
  const word = what.toLowerCase();
  return `${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}`;
}

// Failures -------------------------------------------------------------------------------

interface FailureEntry {
  readonly sentence: string;
  readonly action: AiStatusAction | null;
}

/**
 * The sentence and the one action of each error class (ADR 0125 D9). Classes not listed read as
 * {@link UNKNOWN_FAILURE}.
 */
export const ERROR_WORDS: Readonly<Record<string, FailureEntry>> = Object.freeze({
  AuthenticationError: { sentence: 'Your key was not accepted.', action: 'check-key' },
  PermissionDeniedError: { sentence: 'Your key may not use this model.', action: 'check-key' },
  BillingError: {
    sentence: "Your Anthropic account has no credit left. Add credit on Anthropic's site.",
    action: 'try-again',
  },
  RateLimitError: { sentence: 'Anthropic is busy just now.', action: 'try-again' },
  OverloadedError: { sentence: 'Anthropic is busy just now.', action: 'try-again' },
  InternalServerError: { sentence: 'Anthropic is busy just now.', action: 'try-again' },
  APIConnectionError: {
    sentence: 'No connection to Anthropic. Check the internet.',
    action: 'try-again',
  },
  TimeoutError: { sentence: 'Anthropic took too long to answer.', action: 'try-again' },
  ContextWindowExceeded: {
    sentence: 'This chat has grown too long. Start a new chat to go on.',
    action: 'new-chat',
  },
  RequestTooLargeError: {
    sentence: 'The message is too large to send. Try fewer or smaller pictures.',
    action: null,
  },
  ModelOutputError: { sentence: "The helper's answer could not be read.", action: 'try-again' },
});

/** The words of an error without a class of its own. */
export const UNKNOWN_FAILURE: FailureEntry = Object.freeze({
  sentence: 'Something went wrong while talking to Anthropic.',
  action: 'try-again',
});

/** The sentence and action of each way a run can end other than normally. */
const REASON_WORDS: Readonly<Record<Exclude<AiFailure['reason'], 'error'>, FailureEntry>> =
  Object.freeze({
    cancelled: { sentence: 'Stopped.', action: 'try-again' },
    limit: { sentence: 'It paused so the cost stays small.', action: 'keep-going' },
    max_tokens: { sentence: 'The answer got too long and was cut off.', action: 'keep-going' },
    refusal: {
      sentence: 'The helper would not do that. Try asking another way.',
      action: null,
    },
    no_key: { sentence: 'Add your Anthropic key first.', action: 'check-key' },
  });

/** The words of a failure, before Advanced's details. */
function failureEntry(failure: AiFailure): FailureEntry {
  if (failure.reason !== 'error') return REASON_WORDS[failure.reason];
  return (
    (failure.errorClass === undefined ? undefined : ERROR_WORDS[failure.errorClass]) ??
    UNKNOWN_FAILURE
  );
}

/** The one action a failure offers (Try again, Keep going, Check my key, New chat or none). */
export function failureAction(failure: AiFailure): AiStatusAction | null {
  return failureEntry(failure).action;
}

function limitDetail(limit: AiLimitReached): string {
  return `${count(limit.toolTurns, 'tool turn')}, ${count(limit.outputTokens, 'output token')}`;
}

/**
 * The sentence of a run that ended other than normally: the same in Very easy and Easy, with
 * the numbers, the error class or Anthropic's reason in Advanced.
 */
export function doneSentence(failure: AiFailure, mode: UiMode): string {
  const { sentence } = failureEntry(failure);
  if (mode !== 'advanced') return sentence;
  switch (failure.reason) {
    case 'limit':
      return failure.limit === undefined
        ? sentence
        : `${sentence.replace(/\.$/, '')} (${limitDetail(failure.limit)}).`;
    case 'refusal':
      return failure.explanation === undefined || failure.explanation === ''
        ? sentence
        : `${sentence} Anthropic's reason: ${failure.explanation}`;
    case 'error':
      if (failure.errorClass !== undefined) return `${sentence} (${failure.errorClass})`;
      return failure.message === undefined ? sentence : `${sentence} (${failure.message})`;
    default:
      return sentence;
  }
}

// The state line -------------------------------------------------------------------------

/** A line's or notice's action with its label. */
export interface AiActionWords {
  id: AiStatusAction;
  label: string;
}

/** The state line: one sentence and at most one action. */
export interface AiStatusWords {
  text: string;
  action: AiActionWords | null;
}

const seconds = (status: AiStatus): string =>
  status.seconds === null ? '' : ` (${NUMBER.format(status.seconds)} s)`;

function soFar(status: AiStatus): string {
  if (status.things > 0) return ` ${count(status.things, 'thing')} so far`;
  if (status.changes > 0) return ` ${count(status.changes, 'change')} so far`;
  return '';
}

/** "2 things are ready. Nothing is in your mod yet." (Advanced: proposed changes, applied). */
export function readySentence(things: number, changes: number, mode: UiMode): string {
  if (mode === 'advanced') {
    return `${count(changes, 'proposed change')} ${isAre(changes)} ready. Nothing is applied yet.`;
  }
  return things > 0
    ? `${count(things, 'thing')} ${isAre(things)} ready. Nothing is in your mod yet.`
    : `${count(changes, 'change')} ${isAre(changes)} ready. Nothing is in your mod yet.`;
}

/** The state line's words for `status` in `mode` (ADR 0125 D1). */
export function statusWords(status: AiStatus, mode: UiMode): AiStatusWords {
  const words = wordsFor(mode);
  const action =
    status.action === null ? null : { id: status.action, label: words.actions[status.action] };
  switch (status.state) {
    case 'idle': {
      if (status.applied !== undefined) {
        return { text: appliedWords(status.applied, mode).text, action };
      }
      return {
        text: status.empty ? words.emptyTitle : 'Your turn: ask for anything.',
        action,
      };
    }
    case 'thinking':
      return { text: `Thinking…${seconds(status)}`, action };
    case 'reading':
      return { text: `Looking at your mod…${seconds(status)}`, action };
    case 'making':
      return { text: `Making it…${soFar(status)}${seconds(status)}`, action };
    case 'checking':
      return { text: `Checking it works…${seconds(status)}`, action };
    case 'your-turn-plan':
      return { text: 'Your turn: choose what to do with the plan.', action };
    case 'your-turn-step':
      return { text: 'Your turn: keep going or stop?', action };
    case 'ready':
      return { text: readySentence(status.things, status.changes, mode), action };
    case 'stopped':
    case 'failed':
      return {
        text:
          status.failure === undefined
            ? UNKNOWN_FAILURE.sentence
            : doneSentence(status.failure, mode),
        action,
      };
  }
}

// After adding ---------------------------------------------------------------------------

/** A notice's words: one sentence and its actions (at most two: Show me and Undo). */
export interface AiNoticeWords {
  text: string;
  actions: AiActionWords[];
}

function thingSentences(things: readonly AiMadeThing[]): string {
  const names = (op: AiMadeThing['op']) =>
    things.filter((thing) => thing.op === op).map((thing) => thing.name);
  const added = names('added');
  const changed = names('changed');
  const removed = names('removed');
  const parts: string[] = [];
  if (added.length > 0) {
    parts.push(`Added ${count(added.length, 'thing')} to your mod: ${listOf(added)}.`);
  }
  if (changed.length > 0) parts.push(`Changed ${listOf(changed)}.`);
  if (removed.length > 0) parts.push(`Took ${listOf(removed)} out of your mod.`);
  return parts.join(' ');
}

function skippedSentence(skipped: number): string {
  return skipped === 0
    ? ''
    : ` ${count(skipped, 'change')} no longer fitted and ${skipped === 1 ? 'was' : 'were'} left out.`;
}

/** The notice of an Apply as its step stands now (ADR 0125 D4). */
export function appliedWords(step: AiAppliedStep, mode: UiMode): AiNoticeWords {
  const labels = wordsFor(mode).actions;
  const act = (id: AiStatusAction): AiActionWords => ({ id, label: labels[id] });
  const present = step.things.some((thing) => thing.op !== 'removed');
  const live: AiActionWords[] = [
    ...(present ? [act('show-me')] : []),
    ...(step.onTop ? [act('undo')] : []),
  ];
  const advanced = mode === 'advanced';
  switch (step.phase) {
    case 'added': {
      const text = advanced
        ? `Applied ${count(step.changes, 'change')}.${skippedSentence(step.skipped)}`
        : `${step.things.length > 0 ? thingSentences(step.things) : `Made ${count(step.changes, 'change')} to your mod.`}${skippedSentence(step.skipped)}`;
      return { text, actions: live };
    }
    case 'taken-out':
      return {
        text: advanced ? 'Undone.' : 'Taken out again.',
        actions: step.onTop ? [act('put-back')] : [],
      };
    case 'put-back': {
      const names = step.things.filter((thing) => thing.op !== 'removed').map((t) => t.name);
      const text = advanced
        ? `Redone: ${count(step.changes, 'change')} applied again.`
        : names.length > 0
          ? `Put back in your mod: ${listOf(names)}.`
          : 'Put back.';
      return { text, actions: live };
    }
  }
}

/** The text a notice carries for today's mode-blind panel: Advanced's words of the phase. */
export function appliedStoredText(step: AiAppliedStep): string {
  switch (step.phase) {
    case 'added':
    case 'put-back':
      return step.addedText;
    case 'taken-out':
      return 'Undone.';
  }
}

/** Today's text right after Apply ("Applied 9 changes. Undo reverts them in one step."). */
export function applyResultText(applied: number, skipped: number): string {
  if (applied === 0) {
    return skipped === 0
      ? 'Nothing was applied.'
      : `Nothing was applied: ${count(skipped, 'change')} no longer fit the project.`;
  }
  let text = `Applied ${count(applied, 'change')}. Undo reverts ${applied === 1 ? 'it' : 'them'} in one step.`;
  if (skipped > 0) {
    text += ` ${count(skipped, 'change')} no longer fit the project and ${skipped === 1 ? 'was' : 'were'} left out.`;
  }
  return text;
}

/** The notice after Apply found nothing to apply, by mode. */
export function nothingAppliedWords(skipped: number, mode: UiMode): string {
  if (mode === 'advanced') return applyResultText(0, skipped);
  return skipped === 0
    ? 'Nothing was added.'
    : `Nothing was added: ${count(skipped, 'change')} no longer fitted your mod.`;
}

/** The notice after Throw away (Discard). */
export function discardedWords(mode: UiMode): string {
  return mode === 'advanced' ? DISCARDED_TEXT : 'Thrown away. Nothing was added to your mod.';
}

/** Today's text after Discard. */
export const DISCARDED_TEXT = 'Discarded the proposed changes.';

/** The notice when Apply itself failed. */
export function applyFailedWords(message: string, mode: UiMode): string {
  return mode === 'advanced'
    ? `Apply failed: ${message}`
    : 'Adding to your mod did not work. Nothing was changed.';
}

/** The notice after the model setting changed while a chat exists. */
export function modelChangeWords(modelLabel: string, mode: UiMode): string {
  return mode === 'advanced'
    ? `Start a new conversation to use ${modelLabel}.`
    : `Start a new chat to use ${modelLabel}.`;
}

/** The notice when another Claude model answered a declined message. */
export function fallbackWords(from: string, to: string, mode: UiMode): string {
  return mode === 'advanced'
    ? `${from} declined this request; ${to} answered instead.`
    : 'Another Claude model answered this one.';
}

/**
 * The words of any notice entry in `mode`: failures by their reason and error class, Apply by
 * its step, the rest by their stored text in Advanced and plain words otherwise.
 */
export function noticeWords(
  notice: Extract<AiDisplayMessage, { role: 'notice' }>,
  mode: UiMode,
): AiNoticeWords {
  if (notice.applied !== undefined) return appliedWords(notice.applied, mode);
  const labels = wordsFor(mode).actions;
  switch (notice.kind) {
    case 'cancelled':
    case 'limit':
    case 'max_tokens':
    case 'refusal':
    case 'no_key':
    case 'error': {
      const failure: AiFailure = {
        reason: notice.kind,
        ...(notice.errorClass === undefined ? {} : { errorClass: notice.errorClass }),
        ...(notice.limit === undefined ? {} : { limit: notice.limit }),
        ...(notice.explanation === undefined ? {} : { explanation: notice.explanation }),
      };
      const action = failureAction(failure);
      return {
        text: doneSentence(failure, mode),
        actions: action === null ? [] : [{ id: action, label: labels[action] }],
      };
    }
    case 'fallback':
      return {
        text: mode === 'advanced' ? notice.text : fallbackWords('', '', mode),
        actions: [],
      };
    default:
      return { text: notice.text, actions: [] };
  }
}

// The plan -------------------------------------------------------------------------------

/** A plan line: "Ruby Pickaxe, a tool" (Advanced adds the kind and id). */
export function planLineWords(
  line: { name: string; what: string; kind: string; elementId: string },
  mode: UiMode,
): string {
  const plain = `${line.name}, ${withArticle(line.what)}`;
  return mode === 'advanced' ? `${plain} (${line.kind} ${line.elementId})` : plain;
}

/** A decided plan once its run has ended, closed to one line. */
export function closedPlanWords(
  title: string,
  made: number,
  total: number,
  decided: boolean,
): string {
  if (!decided) return `Plan: ${title}. Not started.`;
  return `Plan: ${title}. ${NUMBER.format(made)} of ${NUMBER.format(total)} made.`;
}

// Review headings ------------------------------------------------------------------------

/** The review's heading (ADR 0125 wording table). */
export function reviewHeading(
  counts: { things: number; files: number; kept: number; total: number },
  mode: UiMode,
): string {
  switch (mode) {
    case 'very-easy':
      return `Ready to add: ${count(counts.things, 'thing')}`;
    case 'easy':
      return `Ready to add: ${count(counts.things, 'thing')}, ${count(counts.files, 'file')} behind them`;
    case 'advanced':
      return `Proposed changes (${NUMBER.format(counts.kept)} of ${NUMBER.format(counts.total)} kept)`;
  }
}

// Explain --------------------------------------------------------------------------------

/** The chip of Explain: "About: Ruby Sword, a picture is missing" (Advanced: code and id). */
export function explainChip(
  problem: { code: string; elementId?: string },
  thing: string,
  plain: string,
  mode: UiMode,
): string {
  if (mode === 'advanced') {
    return `Problem ${problem.code}${problem.elementId === undefined ? '' : ` on ${problem.elementId}`}`;
  }
  const short = plain.replace(/\.$/, '');
  return `About: ${thing}, ${short.charAt(0).toLowerCase()}${short.slice(1)}`;
}

// Cost -----------------------------------------------------------------------------------

/**
 * The cost sentence: "This chat has cost about $0.11 so far." Advanced adds the tokens, the
 * requests and the model. `null` before anything was sent.
 */
export function costSentence(usage: AiUsage, model: AiModelId, mode: UiMode): string | null {
  if (usage.requests === 0) return null;
  const sentence = `This chat has cost ${formatCost(estimateCost(model, usage))} so far`;
  if (mode !== 'advanced') return `${sentence}.`;
  const input = usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
  const label = modelInfo(model).label.replace(/^Claude /, '');
  return `${sentence} (${NUMBER.format(input)} in / ${NUMBER.format(usage.outputTokens)} out, ${count(usage.requests, 'request')}, ${label}).`;
}

// Tool lines -----------------------------------------------------------------------------

type ToolMessage = Extract<AiDisplayMessage, { role: 'tool' }>;

function field(input: unknown, name: string): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const value = (input as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}

/** The problem count of a `run_checks` result, or `undefined` while unknown. */
function checkedCount(result: string | undefined): number | undefined {
  if (result === undefined) return undefined;
  try {
    const parsed = JSON.parse(result) as { counts?: Record<string, number> };
    if (parsed.counts === undefined) return undefined;
    return Object.values(parsed.counts).reduce((sum, n) => sum + n, 0);
  } catch {
    return undefined;
  }
}

/** A proposed element's display name: its `display_name` or `name`, else words of its id. */
export function proposedName(element: { id?: unknown; data?: unknown }): string {
  const data = element.data;
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    for (const key of ['display_name', 'name']) {
      const value = (data as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim() !== '') return value.trim();
      if (typeof value === 'object' && value !== null) {
        const text = (value as Record<string, unknown>).text;
        if (typeof text === 'string' && text.trim() !== '') return text.trim();
      }
    }
  }
  return typeof element.id === 'string' ? wordsOfId(element.id) : 'something';
}

/** The Advanced line of a tool entry (today's summary, with words for every tool). */
function advancedToolLine(message: Pick<ToolMessage, 'name' | 'input' | 'result'>): string {
  const { input } = message;
  const code = (name: string) => {
    const value = field(input, name);
    return value === undefined ? '' : ` \`${value}\``;
  };
  switch (message.name) {
    case 'project_summary':
      return 'Read the project summary';
    case 'list_kinds':
      return 'Listed the element kinds';
    case 'kind_schema':
      return `Read the schema of${code('kind')}`;
    case 'list_elements':
      return 'Listed elements';
    case 'read_element':
      return `Read${code('id')}`;
    case 'list_problems':
      return 'Listed problems';
    case 'search_library':
      return `Searched the library for${code('query')}`;
    case 'list_templates':
      return 'Listed templates';
    case 'template_data':
      return `Read template${code('templateId')}`;
    case 'list_starters':
      return 'Listed starters';
    case 'target_facts':
      return "Read the target's facts";
    case 'script_api_typings':
      return 'Read the script API typings';
    case 'pending_changes':
      return 'Read the pending changes';
    case 'create_elements': {
      const elements = (input as { elements?: unknown[] } | null)?.elements;
      return `Proposed ${count(Array.isArray(elements) ? elements.length : 0, 'element')}`;
    }
    case 'update_element':
      return `Proposed a change to${code('id')}`;
    case 'delete_element':
      return `Proposed deleting${code('id')}`;
    case 'rename_element':
      return `Proposed renaming${code('from')} to${code('to')}`;
    case 'create_texture': {
      const namespace = field(input, 'namespace');
      const path = field(input, 'path');
      return namespace === undefined || path === undefined
        ? 'Proposed a texture'
        : `Proposed the texture \`${namespace}:${path}\``;
    }
    case 'add_starter':
      return `Proposed the starter${code('starterId')}`;
    case 'run_checks': {
      const n = checkedCount(message.result);
      return n === undefined ? 'Checking' : `Checked: ${count(n, 'problem')}`;
    }
    case 'propose_plan':
      return `Proposed a plan${field(input, 'title') === undefined ? '' : `: ${field(input, 'title')}`}`;
    case 'checkpoint': {
      const summary = field(input, 'summary');
      return summary === undefined ? 'Finished a step' : `Finished a step: ${summary}`;
    }
    case 'note_missing_feature': {
      const title = field(input, 'title');
      return title === undefined
        ? 'Wrote down a wish in the Wishlist'
        : `Wrote down a wish in the Wishlist: ${title}`;
    }
    default:
      return `Used ${message.name}`;
  }
}

/** The plain line of a tool entry, or `null` for the entries Very easy and Easy hide. */
function plainToolLine(message: Pick<ToolMessage, 'name' | 'input' | 'result'>): string | null {
  const { input } = message;
  switch (message.name) {
    case 'create_elements': {
      const elements = (input as { elements?: unknown[] } | null)?.elements;
      if (!Array.isArray(elements)) return null;
      const names = elements
        .filter(
          (element): element is { id?: unknown; kind?: unknown; data?: unknown } =>
            typeof element === 'object' &&
            element !== null &&
            isThingKind(String((element as { kind?: unknown }).kind)),
        )
        .map(proposedName);
      return names.length === 0 ? null : `Made ${listOf(names)}`;
    }
    case 'run_checks': {
      const n = checkedCount(message.result);
      if (n === undefined) return null;
      return n === 0 ? 'Checked: no problems' : `Checked: ${count(n, 'problem')} to fix`;
    }
    case 'note_missing_feature': {
      const title = field(input, 'title');
      return title === undefined ? 'Wrote down a wish' : `Wrote down a wish: ${title}`;
    }
    case 'checkpoint': {
      const summary = field(input, 'summary');
      return summary === undefined ? 'Finished a step' : `Finished: ${summary}`;
    }
    default:
      return null;
  }
}

/**
 * A tool entry's one line in `mode` (replaces `toolSummary`): every tool in Advanced, with code
 * spans in Markdown backticks; in Very easy and Easy only "Made Ruby Sword", "Checked: no
 * problems", "Wrote down a wish: …" and "Finished: …", and `null` for the rest.
 */
export function toolLine(
  message: Pick<ToolMessage, 'name' | 'input' | 'result'>,
  mode: UiMode,
): string | null {
  return mode === 'advanced' ? advancedToolLine(message) : plainToolLine(message);
}
