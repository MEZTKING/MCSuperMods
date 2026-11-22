/**
 * What the AI helper's conversation is doing and whose turn it is (ADR 0125 D1, D4, D9): one
 * state for the state line above the message box, with the count of things, the seconds since
 * the model's turn started and at most one action. The words come from `ai-words.ts`
 * (`statusWords`); this file decides only the state.
 *
 * Also the small pure helpers the controller needs for "what was made": the things of a list of
 * change items, and how an Apply's undo step stands on the command stack.
 *
 * Pure: no DOM and no store, so it runs in Node tests.
 *
 * @packageDocumentation
 */

import { type AiDoneReason, type AiLimitReached, toolDefinition } from '@msm/ai';
import type { Project } from '@msm/core';
import type { ContentBundle } from '@msm/plugin-api';
import type { ChangeItem } from '../../changeset/changeset';
import { displayName } from '../../preview/bundle-source';
import { findProjectElement } from '../../session/plain-problems';
import {
  type AiAppliedStep,
  type AiConversation,
  type AiDisplayMessage,
  type AiMadeThing,
  type AiPlanState,
  pendingPlan,
  tickedItemIds,
} from '../../store/ai-store';
import { failureAction, isThingKind, proposedName, THING_KIND_WORDS } from './ai-words';

/** The states of the state line (ADR 0125 D1). */
export const AI_STATUS_STATES = Object.freeze([
  'idle',
  'thinking',
  'reading',
  'making',
  'checking',
  'your-turn-plan',
  'your-turn-step',
  'ready',
  'stopped',
  'failed',
] as const);

/** One of {@link AI_STATUS_STATES}. */
export type AiStatusState = (typeof AI_STATUS_STATES)[number];

/** The states in which the helper works and the user waits. */
export const WORKING_STATES: ReadonlySet<AiStatusState> = new Set([
  'thinking',
  'reading',
  'making',
  'checking',
]);

/** Every action a state line or a notice may offer (one per line, two on an Apply notice). */
export const AI_STATUS_ACTIONS = Object.freeze([
  'stop',
  'show-plan',
  'look',
  'keep-going',
  'try-again',
  'check-key',
  'new-chat',
  'show-me',
  'undo',
  'put-back',
] as const);

/** One of {@link AI_STATUS_ACTIONS}. */
export type AiStatusAction = (typeof AI_STATUS_ACTIONS)[number];

/** How a run ended other than normally, with what the words need. */
export interface AiFailure {
  reason: Exclude<AiDoneReason, 'end_turn'>;
  errorClass?: string;
  limit?: AiLimitReached;
  explanation?: string;
  /** The `done` event's own text (shown in Advanced for an error without a class). */
  message?: string;
}

/** The state line's state. */
export interface AiStatus {
  state: AiStatusState;
  /** Things in the waiting changes (by {@link thingsOf}). */
  things: number;
  /** Change items waiting. */
  changes: number;
  /** Whole seconds since the model's turn started, while it works; else `null`. */
  seconds: number | null;
  /** The one action, or `null`. */
  action: AiStatusAction | null;
  /** With `stopped` and `failed`. */
  failure?: AiFailure;
  /** With `idle` right after an Apply notice: the step as it stands. */
  applied?: AiAppliedStep;
  /** Whether the conversation has no entries yet. */
  empty: boolean;
}

type Notice = Extract<AiDisplayMessage, { role: 'notice' }>;
type Tool = Extract<AiDisplayMessage, { role: 'tool' }>;

const STOPPED: ReadonlySet<AiDoneReason> = new Set(['cancelled', 'limit', 'max_tokens']);

/** What a running tool shows: reading, making or checking (thinking for the rest). */
function toolState(name: string): AiStatusState {
  switch (toolDefinition(name)?.group) {
    case 'read':
      return 'reading';
    case 'propose':
      return 'making';
    case 'check':
      return 'checking';
    default:
      return 'thinking';
  }
}

function newestNotice(conversation: AiConversation): Notice | undefined {
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    const message = conversation.messages[i];
    if (message?.role === 'notice') return message;
  }
  return undefined;
}

function runningTool(conversation: AiConversation, runId: string): Tool | undefined {
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    const message = conversation.messages[i];
    if (message?.role === 'tool' && message.runId === runId && message.status === 'running') {
      return message;
    }
  }
  return undefined;
}

/** The action of an Apply notice on the state line: Show me, or Put back once taken out. */
function appliedAction(step: AiAppliedStep): AiStatusAction | null {
  if (step.phase === 'taken-out') return step.onTop ? 'put-back' : null;
  return step.things.some((thing) => thing.op !== 'removed') ? 'show-me' : null;
}

/** The failure of a run that ended other than normally. */
export function failureOf(run: NonNullable<AiConversation['run']>): AiFailure | undefined {
  if (run.reason === undefined || run.reason === 'end_turn') return undefined;
  const explanation = run.stopDetails?.explanation;
  return {
    reason: run.reason,
    ...(run.errorClass === undefined ? {} : { errorClass: run.errorClass }),
    ...(run.limit === undefined ? {} : { limit: run.limit }),
    ...(explanation === undefined || explanation === '' ? {} : { explanation }),
    ...(run.message === undefined ? {} : { message: run.message }),
  };
}

/**
 * The conversation's state (ADR 0125 D1). Total: every conversation has exactly one. While a run
 * is open it is the user's turn when a plan or a step waits (never "working" then), otherwise
 * the model works (thinking, reading, making or checking, by the tool that runs) and Stop is
 * offered. Once the run has ended: a failure or stop that is the newest notice comes first, then
 * waiting changes (**Look**), then an Apply notice (**Show me** or **Put back**), then idle.
 *
 * @param now - The clock, in milliseconds (for the seconds while working).
 */
export function conversationStatus(
  conversation: AiConversation,
  now: number = Date.now(),
): AiStatus {
  const changes = conversation.changesetItems.length;
  const base = {
    things: thingsOf(conversation.changesetItems).length,
    changes,
    seconds: null,
    action: null,
    empty: conversation.messages.length === 0,
  };
  const run = conversation.run;
  if (run !== null && run.status === 'running') {
    if (pendingPlan(conversation) !== undefined) {
      return { ...base, state: 'your-turn-plan', action: 'show-plan' };
    }
    if (conversation.checkpoint !== null) {
      return { ...base, state: 'your-turn-step', action: 'show-plan' };
    }
    const tool = runningTool(conversation, run.runId);
    return {
      ...base,
      state: tool === undefined ? 'thinking' : toolState(tool.name),
      seconds: Math.max(0, Math.floor((now - run.turnStartedAt) / 1000)),
      action: 'stop',
    };
  }
  const notice = newestNotice(conversation);
  const failure = run === null ? undefined : failureOf(run);
  if (
    run !== null &&
    failure !== undefined &&
    notice !== undefined &&
    notice.runId === run.runId &&
    notice.kind === run.reason
  ) {
    return {
      ...base,
      state: STOPPED.has(failure.reason) ? 'stopped' : 'failed',
      action: failureAction(failure),
      failure,
    };
  }
  if (changes > 0) return { ...base, state: 'ready', action: 'look' };
  if (notice?.applied !== undefined) {
    return {
      ...base,
      state: 'idle',
      action: appliedAction(notice.applied),
      applied: notice.applied,
    };
  }
  return { ...base, state: 'idle' };
}

// Things ---------------------------------------------------------------------------------

const KIND_ORDER = new Map(THING_KIND_WORDS.map((entry, index) => [entry.kind, index]));

function kindWord(kind: string, data: unknown): string {
  if (
    kind === 'msm:block' &&
    typeof data === 'object' &&
    data !== null &&
    (data as Record<string, unknown>).type === 'portal'
  ) {
    return 'Portal';
  }
  return THING_KIND_WORDS.find((entry) => entry.kind === kind)?.word ?? 'Thing';
}

function opOf(item: ChangeItem): AiMadeThing['op'] {
  if (item.op === 'create') return 'added';
  if (item.op === 'delete') return 'removed';
  return 'changed';
}

/** The set name a Creator set stores in `meta.creator.values` (`name` or `*_name`), if any. */
function setName(item: ChangeItem): string | undefined {
  const values = item.meta?.creator?.values;
  if (values === undefined) return undefined;
  const key = Object.keys(values)
    .sort()
    .find((entry) => entry === 'name' || entry.endsWith('_name'));
  const value = key === undefined ? undefined : values[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * The things a list of change items stands for (ADR 0125 D4): one per Creator set, else one per
 * item of a kind My things shows, in the items' order, named by `displayName` of
 * `preview/bundle-source.ts` over the items (the language files they carry, then the elements'
 * own names), else words of the id. Supporting files (models, recipes, pictures) are no thing of
 * their own. B688's `proposal-things.ts` groups them for the review.
 */
export function thingsOf(items: readonly ChangeItem[]): AiMadeThing[] {
  const bundle: ContentBundle = {
    elements: items.flatMap((item) =>
      item.elementId === undefined || item.kind === undefined || item.after === undefined
        ? []
        : [{ id: item.elementId, kind: item.kind, data: item.after }],
    ),
    assets: [],
  };
  const nameOf = (item: ChangeItem, id: string): string => {
    const type =
      item.kind === 'msm:block' ? 'block' : item.kind === 'msm:item' ? 'item' : undefined;
    return (
      (type === undefined ? undefined : displayName(bundle, id, type)) ??
      proposedName({ id, data: item.after ?? item.before })
    );
  };
  const sets = new Map<string, ChangeItem[]>();
  const order: ({ set: string } | { item: ChangeItem })[] = [];
  for (const item of items) {
    if (item.elementId === undefined || item.kind === undefined) continue;
    const setId = item.meta?.creator?.setId;
    if (setId !== undefined) {
      const list = sets.get(setId);
      if (list === undefined) {
        sets.set(setId, [item]);
        order.push({ set: setId });
      } else list.push(item);
    } else if (isThingKind(item.kind)) {
      order.push({ item });
    }
  }
  const things: AiMadeThing[] = [];
  for (const entry of order) {
    if ('item' in entry) {
      const { item } = entry;
      const id = item.elementId as string;
      things.push({
        id,
        name: nameOf(item, id),
        what: kindWord(item.kind as string, item.after ?? item.before),
        op: opOf(item),
      });
      continue;
    }
    const members = sets.get(entry.set) ?? [];
    const main = [...members]
      .filter((item) => isThingKind(item.kind as string))
      .sort(
        (a, b) =>
          (KIND_ORDER.get(a.kind as string) ?? 99) - (KIND_ORDER.get(b.kind as string) ?? 99) ||
          (a.elementId as string).localeCompare(b.elementId as string),
      )[0];
    if (main === undefined) continue;
    const id = main.elementId as string;
    things.push({
      id,
      name: setName(main) ?? nameOf(main, id),
      what: kindWord(main.kind as string, main.after ?? main.before),
      op: opOf(main),
    });
  }
  return things;
}

/**
 * The undo step an Apply made, from the changeset's items and the session's result, or `null`
 * when nothing was applied. `onTop` says whether Undo acts on it now (the stack's undo label is
 * the step's).
 */
export function appliedStepOf(
  items: readonly ChangeItem[],
  result: { applied: readonly string[]; skipped: readonly string[] },
  label: string,
  stack: Pick<StackView, 'undoLabel'>,
  addedText: string,
): AiAppliedStep | null {
  if (result.applied.length === 0) return null;
  const applied = new Set(result.applied);
  const made = items.filter((item) => applied.has(item.itemId));
  return {
    label,
    things: thingsOf(made),
    changes: result.applied.length,
    skipped: result.skipped.length,
    createdIds: made.flatMap((item) =>
      item.op === 'create' && item.elementId !== undefined ? [item.elementId] : [],
    ),
    phase: 'added',
    onTop: stack.undoLabel === label,
    addedText,
  };
}

// Following an Apply on the command stack --------------------------------------------------

/** The parts of a session snapshot an Apply step is followed by. */
export interface StackView {
  project: Project | null;
  undoLabel: string | undefined;
  redoLabel: string | undefined;
}

/**
 * Where each Apply step stands now (ADR 0125 D4), newest first: a step is on top when Undo (or,
 * once taken out, Redo) would act on it, which is when the stack's label is the step's and the
 * elements it created are there (or, taken out, gone). A step keeps its phase while it stays on
 * top in the same direction and flips (taken out, put back) when it is on top the other way. At
 * most one step claims the top of Undo and one the top of Redo; the rest are not on top and keep
 * the phase they last had.
 *
 * @param steps - The Apply steps, newest first.
 */
export function followSteps(steps: readonly AiAppliedStep[], stack: StackView): AiAppliedStep[] {
  let undoClaimed = false;
  let redoClaimed = false;
  return steps.map((step) => {
    const present = step.createdIds.every(
      (id) => findProjectElement(stack.project, id) !== undefined,
    );
    const absent = step.createdIds.every(
      (id) => findProjectElement(stack.project, id) === undefined,
    );
    const asUndo = !undoClaimed && stack.undoLabel === step.label && present;
    const asRedo = !redoClaimed && stack.redoLabel === step.label && absent;
    const out = step.phase === 'taken-out';
    if (out ? asRedo : asUndo) {
      if (out) redoClaimed = true;
      else undoClaimed = true;
      return { ...step, onTop: true };
    }
    if (out ? asUndo : asRedo) {
      if (out) undoClaimed = true;
      else redoClaimed = true;
      return { ...step, phase: out ? 'put-back' : 'taken-out', onTop: true };
    }
    return step.onTop ? { ...step, onTop: false } : step;
  });
}

// The plan -------------------------------------------------------------------------------

/**
 * The ticked lines of a plan (ADR 0125 F6): reported built by a checkpoint, and the pending
 * changes hold an item for the line's element or the project has it.
 */
export function tickedLines(
  plan: AiPlanState,
  conversation: AiConversation,
  project: Project | null,
): ReadonlySet<string> {
  return new Set(
    tickedItemIds(plan, conversation, (id) => findProjectElement(project, id) !== undefined),
  );
}
