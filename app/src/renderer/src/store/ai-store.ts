/**
 * The AI helper's renderer state (Zustand, ADR 0041 D8, ADR 0125 D1, D2, D4, D9): one
 * conversation per project root, with its display transcript (which holds each plan at the place
 * it was proposed), the current run, the pending changeset (mirrored), the checkpoint, usage and
 * limits. Conversations live in memory only; they are never persisted.
 *
 * What the conversation is doing and whose turn it is comes from `conversationStatus` in
 * `components/ai/ai-status.ts`; every word the user reads from `components/ai/ai-words.ts`.
 *
 * The event reducer ({@link applyEvent}) and the other transitions are pure functions over a
 * {@link AiConversation}, so they are tested without the store. Plan and checkpoint decisions
 * are promises the executor awaits and the panel resolves; their resolvers live beside the
 * store, keyed by project root.
 *
 * @packageDocumentation
 */

import {
  type AiDoneReason,
  type AiEvent,
  type AiLimitReached,
  type AiMode,
  type AiRunLimits,
  type AiStopDetails,
  type AiUsage,
  addUsage,
  type CheckpointInput,
  DEFAULT_LIMITS,
  emptyUsage,
  type PlanDecision,
  type ProposePlanInput,
} from '@msm/ai';
import { create } from 'zustand';
import { type ChangeItem, PendingChangeset } from '../changeset/changeset';
import { doneSentence } from '../components/ai/ai-words';

/** A notice's reason in the transcript. */
export type AiNoticeKind = AiDoneReason | 'fallback' | 'info';

/** One entry of the display transcript; `seq` is unique within the conversation. */
export type AiDisplayMessage =
  | {
      seq: number;
      role: 'user';
      text: string;
      contextBlocks: string[];
      /** Thumbnails (`data:` URLs) of the pictures sent with the message (ADR 0048). */
      images?: string[];
    }
  | { seq: number; role: 'assistant'; runId: string; text: string; thinking: string }
  | {
      seq: number;
      role: 'tool';
      runId: string;
      requestId: string;
      name: string;
      input: unknown;
      status: 'running' | 'done' | 'error';
      /** The result text, when the controller records it. */
      result?: string;
    }
  | {
      seq: number;
      role: 'notice';
      kind: AiNoticeKind;
      /**
       * The notice in mode-free words, as today's panel shows it; the words per mode come from
       * `noticeWords` of `ai-words.ts`, which reads the fields below.
       */
      text: string;
      runId?: string;
      /** With `error`: the error class of the `done` event (ADR 0125 D9). */
      errorClass?: string;
      /** With `limit`: the limits the run stopped at (shown in Advanced). */
      limit?: AiLimitReached;
      /** With `refusal`: Anthropic's reason, when it gave one (shown in Advanced). */
      explanation?: string;
      /** After Apply: what was added, followed through the command stack (ADR 0125 D4). */
      applied?: AiAppliedStep;
    }
  | {
      seq: number;
      role: 'plan';
      /** The plan as it is now (the same object {@link AiConversation.plan} holds while latest). */
      state: AiPlanState;
      /** A decided or cancelled plan whose run has ended closes to one line (ADR 0125 D1). */
      closed: boolean;
    };

/** One thing an Apply added, changed or removed, by its display name (ADR 0125 D4). */
export interface AiMadeThing {
  /** The thing's main element. */
  id: string;
  /** Its display name ("Ruby Sword"). */
  name: string;
  /** What it is, in words ("Item", "Gear set"). */
  what: string;
  /** What the Apply did to it. */
  op: 'added' | 'changed' | 'removed';
}

/**
 * The undo step an Apply made, as its notice follows it: `added` right after Apply, `taken-out`
 * after Undo, `put-back` after Redo; `onTop` says whether the step is still the one Undo (or,
 * when taken out, Redo) would act on.
 */
export interface AiAppliedStep {
  /** The undo label the step was recorded with. */
  label: string;
  things: readonly AiMadeThing[];
  /** Changes applied. */
  changes: number;
  /** Accepted changes left out because they no longer fitted. */
  skipped: number;
  /** Elements the step created (how the stack is followed beside the label). */
  createdIds: readonly string[];
  phase: 'added' | 'taken-out' | 'put-back';
  onTop: boolean;
  /** The notice's text right after Apply (today's words, kept for the put-back phase). */
  addedText: string;
}

/** The state of one run (one user message until the model ends its turn). */
export interface RunState {
  runId: string;
  /** The run's size (`chat` or `build`), chosen by the caller of `send` (ADR 0125 D2). */
  mode: AiMode;
  limits: AiRunLimits;
  status: 'running' | 'done';
  /** The run's usage so far (the `usage` event's total). */
  usage: AiUsage;
  /** When the run started (milliseconds since the epoch). */
  startedAt: number;
  /** When the model's current turn started (the last `turn_start`, else {@link startedAt}). */
  turnStartedAt: number;
  /** The `seq` of the user message that started the run (what Try again sends again). */
  userSeq: number | null;
  /** Why the run ended, once `done`. */
  reason?: AiDoneReason;
  message?: string;
  /** With `error`: the `done` event's error class. */
  errorClass?: string;
  /** With `limit`: the limits the run stopped at. */
  limit?: AiLimitReached;
  /** With `refusal`: Anthropic's refusal details. */
  stopDetails?: AiStopDetails;
}

/** The plan `propose_plan` showed, and what the user did with it. */
export interface AiPlanState {
  runId: string | null;
  plan: ProposePlanInput;
  status: 'pending' | 'decided' | 'cancelled';
  decision?: PlanDecision;
  /** `true` after "Step through": every checkpoint waits for the user. */
  stepMode: boolean;
  /**
   * Plan item ids the model reported as built (from checkpoints); the ticked lines are
   * {@link tickedItemIds} (ADR 0125 F6).
   */
  completed: string[];
  /** The `seq` of the plan's transcript entry. */
  seq?: number;
}

/** A checkpoint waiting for the user (step mode only). */
export interface AiCheckpointState {
  runId: string | null;
  input: CheckpointInput;
}

/** One conversation (one per project root). */
export interface AiConversation {
  /** The id main knows the conversation by. */
  id: string;
  /**
   * @deprecated The run size now comes from the caller of `send` (ADR 0125 D2); kept until the
   * panel's switch and `App.tsx` stop using it (B685, B689), deleted at B693.
   */
  mode: AiMode;
  messages: AiDisplayMessage[];
  /** The current or last run; `null` before the first. */
  run: RunState | null;
  /** The pending changeset (mutable; mirrored in {@link changesetItems}). */
  changeset: PendingChangeset;
  /** The changeset's items as of its last change, so components re-render. */
  changesetItems: readonly ChangeItem[];
  /**
   * The latest plan, mirrored from its transcript entry.
   *
   * @deprecated Read the `plan` entries of {@link messages} (ADR 0125 D1); kept for today's
   * panel until B685 and B686, deleted at B693.
   */
  plan: AiPlanState | null;
  /**
   * The checkpoint waiting for the user. Read through `conversationStatus`; kept as a field (the
   * step's buttons need its summary).
   */
  checkpoint: AiCheckpointState | null;
  /** Usage of every finished run plus the current one. */
  usage: AiUsage;
  /** Usage of the finished runs (the current run's usage is added to it). */
  usageBefore: AiUsage;
  /** The default limits per mode (from Settings). */
  limits: Record<AiMode, AiRunLimits>;
  /** Limits for the next run only ("Run limits"), or `null` for the mode's defaults. */
  runLimits: AiRunLimits | null;
  nextSeq: number;
}

/** A fresh conversation. */
export function newConversation(
  id: string,
  options: {
    mode?: AiMode;
    limits?: Record<AiMode, AiRunLimits>;
    changeset?: PendingChangeset;
  } = {},
): AiConversation {
  const changeset = options.changeset ?? new PendingChangeset();
  return {
    id,
    mode: options.mode ?? 'chat',
    messages: [],
    run: null,
    changeset,
    changesetItems: changeset.items,
    plan: null,
    checkpoint: null,
    usage: emptyUsage(),
    usageBefore: emptyUsage(),
    limits: structuredClone(
      options.limits ?? { chat: DEFAULT_LIMITS.chat, build: DEFAULT_LIMITS.build },
    ),
    runLimits: null,
    nextSeq: 0,
  };
}

/** The limits the next run of `size` uses: the run override, else the size's default. */
export function limitsFor(
  conversation: AiConversation,
  size: AiMode = conversation.mode,
): AiRunLimits {
  return conversation.runLimits ?? conversation.limits[size];
}

/** Whether a run is in progress. */
export function isRunning(conversation: AiConversation): boolean {
  return conversation.run?.status === 'running';
}

type NewMessage = AiDisplayMessage extends infer M
  ? M extends AiDisplayMessage
    ? Omit<M, 'seq'>
    : never
  : never;

function push(conversation: AiConversation, message: NewMessage): AiConversation {
  return {
    ...conversation,
    messages: [
      ...conversation.messages,
      { ...message, seq: conversation.nextSeq } as AiDisplayMessage,
    ],
    nextSeq: conversation.nextSeq + 1,
  };
}

/** Adds the user's message to the transcript. */
export function addUserMessage(
  conversation: AiConversation,
  text: string,
  contextBlocks: readonly string[] = [],
  images: readonly string[] = [],
): AiConversation {
  return push(conversation, {
    role: 'user',
    text,
    contextBlocks: [...contextBlocks],
    ...(images.length > 0 ? { images: [...images] } : {}),
  });
}

/** The extra fields a notice may carry. */
export type AiNoticeExtras = Partial<
  Pick<
    Extract<AiDisplayMessage, { role: 'notice' }>,
    'errorClass' | 'limit' | 'explanation' | 'applied'
  >
>;

/** Adds a notice to the transcript. */
export function addNotice(
  conversation: AiConversation,
  kind: AiNoticeKind,
  text: string,
  runId?: string,
  extras: AiNoticeExtras = {},
): AiConversation {
  return push(conversation, {
    role: 'notice',
    kind,
    text,
    ...(runId === undefined ? {} : { runId }),
    ...extras,
  });
}

/** The newest user message's `seq`, or `null`. */
function lastUserSeq(conversation: AiConversation): number | null {
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    const message = conversation.messages[i];
    if (message?.role === 'user') return message.seq;
  }
  return null;
}

/**
 * Starts a run of `size` (default: the deprecated conversation mode, which is `chat` unless
 * today's switch changed it) with that size's limits; the run override is used up. The run
 * remembers the newest user message, which Try again sends again.
 */
export function startRun(
  conversation: AiConversation,
  runId: string,
  size: AiMode = conversation.mode,
  now: number = Date.now(),
): AiConversation {
  return {
    ...conversation,
    run: {
      runId,
      mode: size,
      limits: structuredClone(limitsFor(conversation, size)),
      status: 'running',
      usage: emptyUsage(),
      startedAt: now,
      turnStartedAt: now,
      userSeq: lastUserSeq(conversation),
    },
    runLimits: null,
    usageBefore: conversation.usage,
  };
}

/**
 * The mode-free text of a `done` notice, or `undefined` for a normal end: the plain sentence of
 * `ai-words.ts` (Easy's words), or the `done` event's own sentence for a limit stop.
 */
export function doneNotice(
  reason: AiDoneReason,
  message?: string,
  stopDetails?: AiStopDetails,
  errorClass?: string,
): string | undefined {
  if (reason === 'end_turn') return undefined;
  if (reason === 'limit' && message !== undefined) return message;
  return doneSentence(
    {
      reason,
      ...(errorClass === undefined ? {} : { errorClass }),
      ...(stopDetails === undefined ? {} : { explanation: stopDetails.explanation }),
    },
    'easy',
  );
}

/** Replaces the plan (and its transcript entry); `closed` is set on the entry when given. */
function setPlan(
  conversation: AiConversation,
  plan: AiPlanState | null,
  closed?: boolean,
): AiConversation {
  if (plan === null) return { ...conversation, plan };
  return {
    ...conversation,
    plan,
    messages: conversation.messages.map((message) =>
      message.role === 'plan' && message.seq === plan.seq
        ? { ...message, state: plan, ...(closed === undefined ? {} : { closed }) }
        : message,
    ),
  };
}

/** Closes every plan entry of `runId` that is no longer waiting (its run has ended). */
function closePlans(conversation: AiConversation, runId: string): AiConversation {
  let changed = false;
  const messages = conversation.messages.map((message) => {
    if (message.role !== 'plan' || message.closed || message.state.runId !== runId) return message;
    changed = true;
    const state =
      message.state.status === 'pending'
        ? { ...message.state, status: 'cancelled' as const }
        : message.state;
    return { ...message, state, closed: true };
  });
  return changed ? { ...conversation, messages } : conversation;
}

/**
 * Applies one run event to the conversation: text and thinking deltas append to the run's
 * current assistant message (a new one starts after a tool entry or a notice), tool requests
 * add tool entries and `tool_done` sets their status, `usage` updates the run's and the
 * conversation's usage, `fallback` adds a notice and `done` closes the run (with a notice for
 * every reason but `end_turn`) and cancels a pending plan or checkpoint. Events of another run
 * than the current one are ignored.
 */
export function applyEvent(
  conversation: AiConversation,
  runId: string,
  event: AiEvent,
  now: number = Date.now(),
): AiConversation {
  const run = conversation.run;
  if (run === null || run.runId !== runId || run.status !== 'running') return conversation;
  switch (event.type) {
    case 'turn_start':
      return { ...conversation, run: { ...run, turnStartedAt: now } };
    case 'text_delta':
    case 'thinking_delta': {
      const field = event.type === 'text_delta' ? 'text' : 'thinking';
      const last = conversation.messages[conversation.messages.length - 1];
      if (last?.role === 'assistant' && last.runId === runId) {
        const updated = { ...last, [field]: last[field] + event.text };
        return { ...conversation, messages: [...conversation.messages.slice(0, -1), updated] };
      }
      return push(conversation, {
        role: 'assistant',
        runId,
        text: field === 'text' ? event.text : '',
        thinking: field === 'thinking' ? event.text : '',
      });
    }
    case 'tool_request':
      return push(conversation, {
        role: 'tool',
        runId,
        requestId: event.request.requestId,
        name: event.request.name,
        input: event.request.input,
        status: 'running',
      });
    case 'tool_done':
      return {
        ...conversation,
        messages: conversation.messages.map((message) =>
          message.role === 'tool' &&
          message.runId === runId &&
          message.requestId === event.requestId
            ? { ...message, status: event.isError ? 'error' : 'done' }
            : message,
        ),
      };
    case 'usage':
      return {
        ...conversation,
        run: { ...run, usage: event.total },
        usage: addUsage(conversation.usageBefore, event.total),
      };
    case 'fallback':
      return addNotice(
        conversation,
        'fallback',
        `${event.from} declined this request; ${event.to} answered instead.`,
        runId,
      );
    case 'done': {
      let next: AiConversation = {
        ...conversation,
        run: {
          ...run,
          status: 'done',
          reason: event.reason,
          ...(event.message === undefined ? {} : { message: event.message }),
          ...(event.errorClass === undefined ? {} : { errorClass: event.errorClass }),
          ...(event.limit === undefined ? {} : { limit: structuredClone(event.limit) }),
          ...(event.stopDetails === undefined
            ? {}
            : { stopDetails: structuredClone(event.stopDetails) }),
        },
        checkpoint: null,
        plan:
          conversation.plan?.status === 'pending'
            ? { ...conversation.plan, status: 'cancelled' }
            : conversation.plan,
      };
      next = closePlans(next, runId);
      const text = doneNotice(event.reason, event.message, event.stopDetails, event.errorClass);
      if (text !== undefined) {
        const explanation = event.stopDetails?.explanation;
        next = addNotice(next, event.reason, text, runId, {
          ...(event.errorClass === undefined ? {} : { errorClass: event.errorClass }),
          ...(event.limit === undefined ? {} : { limit: structuredClone(event.limit) }),
          ...(explanation === undefined || explanation === '' ? {} : { explanation }),
        });
      }
      return next;
    }
  }
}

/** Records a tool's result text on its transcript entry (for the entry's disclosure). */
export function recordToolResult(
  conversation: AiConversation,
  runId: string,
  requestId: string,
  result: string,
): AiConversation {
  return {
    ...conversation,
    messages: conversation.messages.map((message) =>
      message.role === 'tool' && message.runId === runId && message.requestId === requestId
        ? { ...message, result }
        : message,
    ),
  };
}

/**
 * Shows a plan waiting for the user's decision: a `plan` entry at this place of the transcript,
 * mirrored into {@link AiConversation.plan}. An earlier plan still waiting is cancelled.
 */
export function showPlan(
  conversation: AiConversation,
  plan: ProposePlanInput,
  runId: string | null,
): AiConversation {
  const seq = conversation.nextSeq;
  const state: AiPlanState = {
    runId,
    plan: structuredClone(plan),
    status: 'pending',
    stepMode: false,
    completed: [],
    seq,
  };
  const messages = conversation.messages.map((message) =>
    message.role === 'plan' && message.state.status === 'pending'
      ? { ...message, state: { ...message.state, status: 'cancelled' as const } }
      : message,
  );
  return {
    ...conversation,
    messages: [...messages, { seq, role: 'plan', state, closed: false }],
    nextSeq: seq + 1,
    plan: state,
  };
}

/** Records the user's plan decision ("Step through" turns step mode on). */
export function decidePlan(conversation: AiConversation, decision: PlanDecision): AiConversation {
  if (conversation.plan === null) return conversation;
  return setPlan(conversation, {
    ...conversation.plan,
    plan: { ...conversation.plan.plan, items: structuredClone(decision.items) },
    status: 'decided',
    decision: structuredClone(decision),
    stepMode: decision.decision === 'step',
  });
}

/** Whether the pending changes hold an item for `elementId` (created, changed or renamed to). */
export function changesHold(conversation: AiConversation, elementId: string): boolean {
  return conversation.changesetItems.some(
    (item) => item.op !== 'delete' && (item.elementId === elementId || item.to === elementId),
  );
}

/**
 * Records a checkpoint's completed items (the model's word: see {@link tickedItemIds} for the
 * lines that are really made); in step mode it waits for the user.
 */
export function reachCheckpoint(
  conversation: AiConversation,
  input: CheckpointInput,
  runId: string | null,
): AiConversation {
  const current = conversation.plan;
  if (current === null) return { ...conversation, checkpoint: null };
  const plan = {
    ...current,
    completed: [...new Set([...current.completed, ...input.completedItemIds])],
  };
  return {
    ...setPlan(conversation, plan),
    checkpoint: plan.stepMode ? { runId, input: structuredClone(input) } : null,
  };
}

/**
 * The plan lines that are ticked (ADR 0125 F6): reported built by a checkpoint and real, which
 * is when the pending changes hold an item for the line's element or `exists` (the project has
 * it) says so. The model's word alone ticks nothing.
 */
export function tickedItemIds(
  plan: AiPlanState,
  conversation: AiConversation,
  exists: (elementId: string) => boolean = () => false,
): string[] {
  const reported = new Set(plan.completed);
  return plan.plan.items
    .filter(
      (item) =>
        reported.has(item.itemId) &&
        (changesHold(conversation, item.elementId) || exists(item.elementId)),
    )
    .map((item) => item.itemId);
}

/** The plan entry waiting for the user's answer, if any. */
export function pendingPlan(
  conversation: AiConversation,
): Extract<AiDisplayMessage, { role: 'plan' }> | undefined {
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    const message = conversation.messages[i];
    if (message?.role === 'plan' && message.state.status === 'pending') return message;
  }
  return undefined;
}

/** The words that, typed alone while a plan waits, accept it (ADR 0125 D2). */
export const PLAN_ACCEPT_WORDS: readonly string[] = Object.freeze(['go', 'yes', 'ok']);

/** `text` without case, surrounding spaces and closing punctuation ("Go!" is "go"). */
function bare(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:\s]+$/u, '');
}

/**
 * The plan decision a typed message makes while `plan` waits: "go", "yes" or "ok" alone builds
 * all of it; anything else asks for a revision with the text as the comments.
 */
export function typedPlanDecision(plan: AiPlanState, text: string): PlanDecision {
  return PLAN_ACCEPT_WORDS.includes(bare(text))
    ? { decision: 'build_all', items: structuredClone(plan.plan.items), comments: '' }
    : { decision: 'revise', items: structuredClone(plan.plan.items), comments: text.trim() };
}

/** The step decision a typed message makes while a step waits: "stop" stops, else continue. */
export function typedStepDecision(text: string): 'continue' | 'stop' {
  return bare(text) === 'stop' ? 'stop' : 'continue';
}

/** A message to send again: Try again's or Keep going's (ADR 0125 D9, D10). */
export interface AiResend {
  text: string;
  /** The visible context blocks sent with it the first time. */
  contextBlocks: readonly string[];
  /** The pictures' `data:` URLs sent with it the first time. */
  images: readonly string[];
  /** The ended run's size. */
  size: AiMode;
}

/** The ends after which Try again sends the run's message again. */
export const TRY_AGAIN_REASONS: ReadonlySet<AiDoneReason> = new Set([
  'error',
  'no_key',
  'refusal',
  'cancelled',
]);

/** The ends after which Keep going sends "continue". */
export const KEEP_GOING_REASONS: ReadonlySet<AiDoneReason> = new Set(['limit', 'max_tokens']);

/** What Keep going sends. */
export const KEEP_GOING_TEXT = 'continue';

/**
 * What Try again sends: the message that started the last run, when that run failed, was
 * refused or was stopped; `null` otherwise.
 */
export function tryAgainRequest(conversation: AiConversation): AiResend | null {
  const run = conversation.run;
  if (run === null || run.status !== 'done' || run.reason === undefined) return null;
  if (!TRY_AGAIN_REASONS.has(run.reason) || run.userSeq === null) return null;
  const message = conversation.messages.find(
    (entry) => entry.role === 'user' && entry.seq === run.userSeq,
  );
  if (message?.role !== 'user') return null;
  return {
    text: message.text,
    contextBlocks: [...message.contextBlocks],
    images: [...(message.images ?? [])],
    size: run.mode,
  };
}

/** What Keep going sends after a stop at the limit or a cut-off answer; `null` otherwise. */
export function keepGoingRequest(conversation: AiConversation): AiResend | null {
  const run = conversation.run;
  if (run === null || run.status !== 'done' || run.reason === undefined) return null;
  if (!KEEP_GOING_REASONS.has(run.reason)) return null;
  return { text: KEEP_GOING_TEXT, contextBlocks: [], images: [], size: run.mode };
}

/** Replaces the `applied` step of the notice `seq` (its text follows: ADR 0125 D4). */
export function followAppliedNotice(
  conversation: AiConversation,
  seq: number,
  applied: AiAppliedStep,
  text: string,
): AiConversation {
  let changed = false;
  const messages = conversation.messages.map((message) => {
    if (message.role !== 'notice' || message.seq !== seq || message.applied === undefined) {
      return message;
    }
    const before = message.applied;
    if (before.phase === applied.phase && before.onTop === applied.onTop && message.text === text) {
      return message;
    }
    changed = true;
    return { ...message, applied, text };
  });
  return changed ? { ...conversation, messages } : conversation;
}

// The store -----------------------------------------------------------------------------

/** What the store holds and offers. */
export interface AiStoreState {
  /** Conversations by project root. */
  conversations: Record<string, AiConversation>;
  /**
   * The conversation of `root`, created with `create()` options when missing (the id comes
   * from `newId`). The changeset is mirrored into the store from then on.
   */
  ensureConversation(
    root: string,
    newId: () => string,
    options?: { mode?: AiMode; limits?: Record<AiMode, AiRunLimits> },
  ): AiConversation;
  /** Replaces the conversation of `root` with a fresh one (same changeset cleared). */
  resetConversation(root: string, id: string): void;
  /** Drops the conversation of `root` (for example when the project closes). */
  dropConversation(root: string): void;
  /** Applies a pure transition to the conversation of `root` (no-op when missing). */
  update(root: string, transition: (conversation: AiConversation) => AiConversation): void;
  /** @deprecated The run size comes from the caller of `send` (ADR 0125 D2); deleted at B693. */
  setMode(root: string, mode: AiMode): void;
  setLimits(root: string, limits: Record<AiMode, AiRunLimits>): void;
  setRunLimits(root: string, limits: AiRunLimits | null): void;
  appendUser(
    root: string,
    text: string,
    contextBlocks?: readonly string[],
    images?: readonly string[],
  ): void;
  /** Starts a run of `size` (default: the deprecated conversation mode). */
  startRun(root: string, runId: string, size?: AiMode): void;
  applyRunEvent(root: string, runId: string, event: AiEvent): void;
  /** Shows the plan and resolves with the user's decision (see {@link resolvePlan}). */
  proposePlan(root: string, plan: ProposePlanInput, runId: string | null): Promise<PlanDecision>;
  /** Answers the pending plan. */
  resolvePlan(root: string, decision: PlanDecision): void;
  /**
   * Records a checkpoint; resolves at once with `continue` unless the plan is in step mode,
   * then waits for {@link resolveCheckpoint}.
   */
  checkpoint(
    root: string,
    input: CheckpointInput,
    runId: string | null,
  ): Promise<'continue' | 'stop'>;
  /** Answers the pending checkpoint. */
  resolveCheckpoint(root: string, decision: 'continue' | 'stop'): void;
}

/** Pending decision resolvers per project root (kept out of the store state). */
const planResolvers = new Map<string, (decision: PlanDecision) => void>();
const checkpointResolvers = new Map<string, (decision: 'continue' | 'stop') => void>();
/** Changeset subscriptions per project root. */
const changesetSubscriptions = new Map<string, () => void>();

function forget(root: string): void {
  planResolvers.delete(root);
  checkpointResolvers.delete(root);
  changesetSubscriptions.get(root)?.();
  changesetSubscriptions.delete(root);
}

export const useAiStore = create<AiStoreState>((set, get) => {
  const update = (root: string, transition: (conversation: AiConversation) => AiConversation) => {
    const current = get().conversations[root];
    if (current === undefined) return;
    const next = transition(current);
    if (next !== current)
      set((state) => ({ conversations: { ...state.conversations, [root]: next } }));
  };

  const mirror = (root: string, changeset: PendingChangeset) => {
    changesetSubscriptions.get(root)?.();
    changesetSubscriptions.set(
      root,
      changeset.subscribe((items) =>
        update(root, (conversation) => ({ ...conversation, changesetItems: items })),
      ),
    );
  };

  return {
    conversations: {},

    ensureConversation(root, newId, options = {}) {
      const existing = get().conversations[root];
      if (existing !== undefined) return existing;
      const conversation = newConversation(newId(), options);
      set((state) => ({ conversations: { ...state.conversations, [root]: conversation } }));
      mirror(root, conversation.changeset);
      return conversation;
    },

    resetConversation(root, id) {
      const current = get().conversations[root];
      planResolvers.delete(root);
      checkpointResolvers.delete(root);
      const changeset = current?.changeset ?? new PendingChangeset();
      changeset.clear();
      const fresh = newConversation(id, {
        changeset,
        ...(current === undefined ? {} : { mode: current.mode, limits: current.limits }),
      });
      set((state) => ({ conversations: { ...state.conversations, [root]: fresh } }));
      mirror(root, changeset);
    },

    dropConversation(root) {
      forget(root);
      set((state) => {
        const { [root]: _dropped, ...rest } = state.conversations;
        return { conversations: rest };
      });
    },

    update,

    setMode(root, mode) {
      update(root, (conversation) =>
        conversation.mode === mode ? conversation : { ...conversation, mode },
      );
    },

    setLimits(root, limits) {
      update(root, (conversation) => ({ ...conversation, limits: structuredClone(limits) }));
    },

    setRunLimits(root, limits) {
      update(root, (conversation) => ({
        ...conversation,
        runLimits: limits === null ? null : structuredClone(limits),
      }));
    },

    appendUser(root, text, contextBlocks = [], images = []) {
      update(root, (conversation) => addUserMessage(conversation, text, contextBlocks, images));
    },

    startRun(root, runId, size) {
      update(root, (conversation) => startRun(conversation, runId, size));
    },

    applyRunEvent(root, runId, event) {
      update(root, (conversation) => applyEvent(conversation, runId, event));
      if (event.type === 'done') {
        planResolvers.delete(root);
        checkpointResolvers.delete(root);
      }
    },

    proposePlan(root, plan, runId) {
      update(root, (conversation) => showPlan(conversation, plan, runId));
      return new Promise<PlanDecision>((resolve) => {
        planResolvers.set(root, resolve);
      });
    },

    resolvePlan(root, decision) {
      const resolve = planResolvers.get(root);
      planResolvers.delete(root);
      update(root, (conversation) => decidePlan(conversation, decision));
      resolve?.(structuredClone(decision));
    },

    checkpoint(root, input, runId) {
      update(root, (conversation) => reachCheckpoint(conversation, input, runId));
      if (get().conversations[root]?.checkpoint == null) return Promise.resolve('continue');
      return new Promise<'continue' | 'stop'>((resolve) => {
        checkpointResolvers.set(root, resolve);
      });
    },

    resolveCheckpoint(root, decision) {
      const resolve = checkpointResolvers.get(root);
      checkpointResolvers.delete(root);
      update(root, (conversation) => ({ ...conversation, checkpoint: null }));
      resolve?.(decision);
    },
  };
});
