/**
 * The AI helper's renderer state (Zustand, ADR 0041 D8): one conversation per project root,
 * with its display transcript, the current run, the pending changeset (mirrored), the plan,
 * the checkpoint, usage and limits. Conversations live in memory only; they are never
 * persisted.
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
  type AiMode,
  type AiRunLimits,
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
  | { seq: number; role: 'notice'; kind: AiNoticeKind; text: string; runId?: string };

/** The state of one run (one user message until the model ends its turn). */
export interface RunState {
  runId: string;
  mode: AiMode;
  limits: AiRunLimits;
  status: 'running' | 'done';
  /** The run's usage so far (the `usage` event's total). */
  usage: AiUsage;
  /** Why the run ended, once `done`. */
  reason?: AiDoneReason;
  message?: string;
}

/** The plan `propose_plan` showed, and what the user did with it. */
export interface AiPlanState {
  runId: string | null;
  plan: ProposePlanInput;
  status: 'pending' | 'decided' | 'cancelled';
  decision?: PlanDecision;
  /** `true` after "Step through": every checkpoint waits for the user. */
  stepMode: boolean;
  /** Plan item ids the model reported as built (from checkpoints). */
  completed: string[];
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
  mode: AiMode;
  messages: AiDisplayMessage[];
  /** The current or last run; `null` before the first. */
  run: RunState | null;
  /** The pending changeset (mutable; mirrored in {@link changesetItems}). */
  changeset: PendingChangeset;
  /** The changeset's items as of its last change, so components re-render. */
  changesetItems: readonly ChangeItem[];
  plan: AiPlanState | null;
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

/** The limits the next run uses: the run override, else the mode's default. */
export function limitsFor(conversation: AiConversation): AiRunLimits {
  return conversation.runLimits ?? conversation.limits[conversation.mode];
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

/** Adds a notice to the transcript. */
export function addNotice(
  conversation: AiConversation,
  kind: AiNoticeKind,
  text: string,
  runId?: string,
): AiConversation {
  return push(conversation, {
    role: 'notice',
    kind,
    text,
    ...(runId === undefined ? {} : { runId }),
  });
}

/**
 * Starts a run with the conversation's current limits; the run override is used up.
 */
export function startRun(conversation: AiConversation, runId: string): AiConversation {
  return {
    ...conversation,
    run: {
      runId,
      mode: conversation.mode,
      limits: structuredClone(limitsFor(conversation)),
      status: 'running',
      usage: emptyUsage(),
    },
    runLimits: null,
    usageBefore: conversation.usage,
  };
}

/** The text of a `done` notice, or `undefined` for a normal end. */
export function doneNotice(
  reason: AiDoneReason,
  message?: string,
  stopDetails?: { category: string | null; explanation: string },
): string | undefined {
  switch (reason) {
    case 'end_turn':
      return undefined;
    case 'cancelled':
      return 'Stopped.';
    case 'limit':
      return message ?? 'The run stopped at its limit.';
    case 'refusal':
      return stopDetails?.explanation !== undefined && stopDetails.explanation !== ''
        ? `The model declined to continue: ${stopDetails.explanation}`
        : (message ?? 'The model declined to continue.');
    case 'max_tokens':
      return message ?? 'The answer reached the maximum length and was cut off.';
    case 'no_key':
      return message ?? 'No API key is set. Add one under Settings > AI helper.';
    case 'error':
      return message === undefined ? 'The run failed.' : `The run failed: ${message}`;
  }
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
): AiConversation {
  const run = conversation.run;
  if (run === null || run.runId !== runId || run.status !== 'running') return conversation;
  switch (event.type) {
    case 'turn_start':
      return conversation;
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
        },
        checkpoint: null,
        plan:
          conversation.plan?.status === 'pending'
            ? { ...conversation.plan, status: 'cancelled' }
            : conversation.plan,
      };
      const text = doneNotice(event.reason, event.message, event.stopDetails);
      if (text !== undefined) next = addNotice(next, event.reason, text, runId);
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

/** Shows a plan waiting for the user's decision. */
export function showPlan(
  conversation: AiConversation,
  plan: ProposePlanInput,
  runId: string | null,
): AiConversation {
  return {
    ...conversation,
    plan: { runId, plan: structuredClone(plan), status: 'pending', stepMode: false, completed: [] },
  };
}

/** Records the user's plan decision ("Step through" turns step mode on). */
export function decidePlan(conversation: AiConversation, decision: PlanDecision): AiConversation {
  if (conversation.plan === null) return conversation;
  return {
    ...conversation,
    plan: {
      ...conversation.plan,
      plan: { ...conversation.plan.plan, items: structuredClone(decision.items) },
      status: 'decided',
      decision: structuredClone(decision),
      stepMode: decision.decision === 'step',
    },
  };
}

/** Records a checkpoint's completed items; in step mode it waits for the user. */
export function reachCheckpoint(
  conversation: AiConversation,
  input: CheckpointInput,
  runId: string | null,
): AiConversation {
  const plan =
    conversation.plan === null
      ? null
      : {
          ...conversation.plan,
          completed: [...new Set([...conversation.plan.completed, ...input.completedItemIds])],
        };
  return {
    ...conversation,
    plan,
    checkpoint: plan?.stepMode === true ? { runId, input: structuredClone(input) } : null,
  };
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
  setMode(root: string, mode: AiMode): void;
  setLimits(root: string, limits: Record<AiMode, AiRunLimits>): void;
  setRunLimits(root: string, limits: AiRunLimits | null): void;
  appendUser(
    root: string,
    text: string,
    contextBlocks?: readonly string[],
    images?: readonly string[],
  ): void;
  startRun(root: string, runId: string): void;
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

    startRun(root, runId) {
      update(root, (conversation) => startRun(conversation, runId));
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
