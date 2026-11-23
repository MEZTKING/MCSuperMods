import { type AiUsage, DEFAULT_LIMITS, type ProposePlanInput } from '@msm/ai';
import { createMemoryFileSystem } from '@msm/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { PendingChangeset } from '../src/renderer/src/changeset/changeset';
import { followSteps, thingsOf } from '../src/renderer/src/components/ai/ai-status';
import { appliedStoredText } from '../src/renderer/src/components/ai/ai-words';
import {
  type AiAppliedStep,
  type AiConversation,
  addNotice,
  addUserMessage,
  applyEvent,
  decidePlan,
  doneNotice,
  followAppliedNotice,
  isRunning,
  keepGoingRequest,
  latestPlan,
  limitsFor,
  newConversation,
  pendingPlan,
  reachCheckpoint,
  showPlan,
  startRun,
  tickedItemIds,
  tryAgainRequest,
  typedPlanDecision,
  typedStepDecision,
  useAiStore,
} from '../src/renderer/src/store/ai-store';
import { newSession } from './session-fixture';

const usage = (inputTokens: number, outputTokens: number): AiUsage => ({
  inputTokens,
  outputTokens,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  requests: 1,
});

function running(): AiConversation {
  return startRun(addUserMessage(newConversation('c1'), 'Make a ruby ore', ['ctx']), 'run-1');
}

const plan: ProposePlanInput = {
  title: 'Ruby',
  items: [
    { itemId: 'ore', kind: 'msm:block', elementId: 'demo:ruby_ore', summary: 'The ore.' },
    { itemId: 'gem', kind: 'msm:item', elementId: 'demo:ruby', summary: 'The gem.' },
  ],
};

describe('ai-store reducers', () => {
  it('appends text and thinking deltas to the run’s current assistant message', () => {
    let state = running();
    expect(state.messages[0]).toEqual({
      seq: 0,
      role: 'user',
      text: 'Make a ruby ore',
      contextBlocks: ['ctx'],
    });
    state = applyEvent(state, 'run-1', { type: 'turn_start' });
    state = applyEvent(state, 'run-1', { type: 'thinking_delta', text: 'Let me ' });
    state = applyEvent(state, 'run-1', { type: 'thinking_delta', text: 'look.' });
    state = applyEvent(state, 'run-1', { type: 'text_delta', text: 'Hello ' });
    state = applyEvent(state, 'run-1', { type: 'text_delta', text: 'there.' });
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1]).toEqual({
      seq: 1,
      role: 'assistant',
      runId: 'run-1',
      text: 'Hello there.',
      thinking: 'Let me look.',
    });
  });

  it('adds tool entries, sets their status and starts a new assistant message after them', () => {
    let state = running();
    state = applyEvent(state, 'run-1', { type: 'text_delta', text: 'Reading.' });
    state = applyEvent(state, 'run-1', {
      type: 'tool_request',
      request: {
        requestId: 'q1',
        toolUseId: 'toolu_1',
        name: 'read_element',
        input: { id: 'demo:a' },
      },
    });
    state = applyEvent(state, 'run-1', {
      type: 'tool_request',
      request: {
        requestId: 'q2',
        toolUseId: 'toolu_2',
        name: 'run_checks',
        input: { scope: 'all' },
      },
    });
    state = applyEvent(state, 'run-1', { type: 'tool_done', requestId: 'q1', isError: false });
    state = applyEvent(state, 'run-1', { type: 'tool_done', requestId: 'q2', isError: true });
    state = applyEvent(state, 'run-1', { type: 'text_delta', text: 'Done.' });
    expect(state.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'tool',
      'assistant',
    ]);
    expect(state.messages.map((message) => message.seq)).toEqual([0, 1, 2, 3, 4]);
    const tools = state.messages.filter((message) => message.role === 'tool');
    expect(tools.map((tool) => (tool.role === 'tool' ? tool.status : ''))).toEqual([
      'done',
      'error',
    ]);
  });

  it('tracks run and conversation usage across runs', () => {
    let state = running();
    state = applyEvent(state, 'run-1', { type: 'usage', turn: usage(10, 5), total: usage(10, 5) });
    state = applyEvent(state, 'run-1', {
      type: 'usage',
      turn: usage(20, 5),
      total: { ...usage(30, 10), requests: 2 },
    });
    expect(state.run?.usage.inputTokens).toBe(30);
    expect(state.usage.inputTokens).toBe(30);
    state = applyEvent(state, 'run-1', { type: 'done', reason: 'end_turn' });
    state = startRun(state, 'run-2');
    state = applyEvent(state, 'run-2', { type: 'usage', turn: usage(5, 1), total: usage(5, 1) });
    expect(state.run?.usage.inputTokens).toBe(5);
    expect(state.usage).toEqual({
      inputTokens: 35,
      outputTokens: 11,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      requests: 3,
    });
  });

  it('adds notices for fallbacks and ends, and closes the run on done', () => {
    let state = running();
    state = applyEvent(state, 'run-1', {
      type: 'fallback',
      from: 'claude-opus-5-5',
      to: 'claude-sonnet-5-5',
    });
    expect(state.messages[1]).toMatchObject({ role: 'notice', kind: 'fallback' });
    expect(isRunning(state)).toBe(true);
    state = applyEvent(state, 'run-1', {
      type: 'done',
      reason: 'limit',
      message: 'The run stopped at its limit (24 tool turns / 100,000 output tokens).',
    });
    expect(isRunning(state)).toBe(false);
    expect(state.run).toMatchObject({ status: 'done', reason: 'limit' });
    expect(state.messages[2]).toMatchObject({
      role: 'notice',
      kind: 'limit',
      text: 'The run stopped at its limit (24 tool turns / 100,000 output tokens).',
    });
    // Events after done, or of another run, change nothing.
    expect(applyEvent(state, 'run-1', { type: 'text_delta', text: 'late' })).toBe(state);
    expect(applyEvent(running(), 'other', { type: 'text_delta', text: 'x' }).messages).toHaveLength(
      1,
    );

    const ended = applyEvent(running(), 'run-1', { type: 'done', reason: 'end_turn' });
    expect(ended.messages).toHaveLength(1);
  });

  it('words each done reason in plain words, with the error class kept on the notice', () => {
    expect(doneNotice('end_turn')).toBeUndefined();
    expect(doneNotice('cancelled')).toBe('Stopped.');
    expect(
      doneNotice('refusal', undefined, { category: 'cyber', explanation: 'Not allowed.' }),
    ).toBe('The helper would not do that. Try asking another way.');
    expect(doneNotice('error', 'Overloaded', undefined, 'OverloadedError')).toBe(
      'Anthropic is busy just now.',
    );
    expect(doneNotice('error', 'Raw text', undefined, 'BillingError')).toMatch(/no credit/);
    expect(doneNotice('error', 'Raw text')).toBe(
      'Something went wrong while talking to Anthropic.',
    );
    expect(doneNotice('no_key')).toBe('Add your Anthropic key first.');
    expect(doneNotice('max_tokens')).toMatch(/cut off/);
    expect(doneNotice('limit')).toBe('It paused so the cost stays small.');
    expect(doneNotice('limit', 'The helper paused at its limit.')).toBe(
      'The helper paused at its limit.',
    );

    let state = running();
    state = applyEvent(state, 'run-1', {
      type: 'done',
      reason: 'error',
      message: 'Your Anthropic API key was not accepted.',
      errorClass: 'AuthenticationError',
    });
    expect(state.run).toMatchObject({ reason: 'error', errorClass: 'AuthenticationError' });
    expect(state.messages.at(-1)).toMatchObject({
      role: 'notice',
      kind: 'error',
      text: 'Your key was not accepted.',
      errorClass: 'AuthenticationError',
    });
    state = applyEvent(running(), 'run-1', {
      type: 'done',
      reason: 'limit',
      limit: { toolTurns: 24, outputTokens: 100_000 },
    });
    expect(state.messages.at(-1)).toMatchObject({
      kind: 'limit',
      limit: { toolTurns: 24, outputTokens: 100_000 },
    });
  });

  it('records when the run and each model turn started', () => {
    let state = startRun(addUserMessage(newConversation('c'), 'Hi'), 'r', 'chat', 1_000);
    expect(state.run).toMatchObject({ startedAt: 1_000, turnStartedAt: 1_000, userSeq: 0 });
    state = applyEvent(state, 'r', { type: 'turn_start' }, 5_000);
    expect(state.run?.turnStartedAt).toBe(5_000);
    expect(state.run?.startedAt).toBe(1_000);
  });

  it('starts a run of the size its caller gives, with that size’s limits', () => {
    const state = startRun(newConversation('c'), 'r', 'build');
    expect(state.run?.mode).toBe('build');
    expect(state.run?.limits).toEqual(DEFAULT_LIMITS.build);
    expect(startRun(newConversation('c'), 'r').run?.mode).toBe('chat');
  });

  it('uses the run limits once, then the size defaults again', () => {
    let state = newConversation('c');
    expect(limitsFor(state)).toEqual(DEFAULT_LIMITS.chat);
    expect(limitsFor(state, 'build')).toEqual(DEFAULT_LIMITS.build);
    state = {
      ...state,
      runLimits: { maxToolTurns: 5, maxOutputTokens: 30_000, taskBudget: false },
    };
    state = startRun(state, 'r', 'build');
    expect(state.run?.limits).toEqual({
      maxToolTurns: 5,
      maxOutputTokens: 30_000,
      taskBudget: false,
    });
    expect(state.run?.mode).toBe('build');
    expect(limitsFor(state, 'build')).toEqual(DEFAULT_LIMITS.build);
  });
});

/** The newest plan of the conversation of `root` in the store. */
function latest(root: string) {
  const conversation = useAiStore.getState().conversations[root];
  return conversation === undefined ? null : latestPlan(conversation);
}

describe('useAiStore', () => {
  beforeEach(() => {
    for (const root of Object.keys(useAiStore.getState().conversations)) {
      useAiStore.getState().dropConversation(root);
    }
  });

  it('keeps one conversation per project root and mirrors its changeset', () => {
    const store = useAiStore.getState();
    const first = store.ensureConversation('/p/a', () => 'conv-a');
    expect(store.ensureConversation('/p/a', () => 'other')).toBe(first);
    store.ensureConversation('/p/b', () => 'conv-b');
    first.changeset.add({ op: 'create', elementId: 'demo:a', kind: 'msm:block', after: {} });
    expect(useAiStore.getState().conversations['/p/a']?.changesetItems).toHaveLength(1);
    expect(useAiStore.getState().conversations['/p/b']?.changesetItems).toHaveLength(0);
  });

  it('runs events through the reducer', () => {
    const store = useAiStore.getState();
    store.ensureConversation('/p', () => 'c');
    store.appendUser('/p', 'Hi');
    store.startRun('/p', 'r1');
    store.applyRunEvent('/p', 'r1', { type: 'text_delta', text: 'Hello' });
    store.applyRunEvent('/p', 'r1', { type: 'done', reason: 'cancelled' });
    const conversation = useAiStore.getState().conversations['/p'];
    expect(conversation?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'notice',
    ]);
    expect(conversation?.run?.status).toBe('done');
  });

  it('resolves the plan promise with the user’s decision and turns step mode on', async () => {
    const store = useAiStore.getState();
    store.ensureConversation('/p', () => 'c');
    store.startRun('/p', 'r1');
    const decision = store.proposePlan('/p', plan, 'r1');
    expect(latest('/p')?.status).toBe('pending');
    store.resolvePlan('/p', { decision: 'step', items: plan.items.slice(0, 1), comments: '' });
    await expect(decision).resolves.toEqual({
      decision: 'step',
      items: plan.items.slice(0, 1),
      comments: '',
    });
    expect(latest('/p')).toMatchObject({ status: 'decided', stepMode: true });
    expect(latest('/p')?.plan.items).toHaveLength(1);

    const checkpoint = store.checkpoint(
      '/p',
      { completedItemIds: ['ore'], summary: 'Built.' },
      'r1',
    );
    expect(useAiStore.getState().conversations['/p']?.checkpoint?.input.completedItemIds).toEqual([
      'ore',
    ]);
    expect(latest('/p')?.completed).toEqual(['ore']);
    store.resolveCheckpoint('/p', 'stop');
    await expect(checkpoint).resolves.toBe('stop');
    expect(useAiStore.getState().conversations['/p']?.checkpoint).toBeNull();
  });

  it('answers checkpoints at once in build-all mode and cancels a pending plan on done', async () => {
    const store = useAiStore.getState();
    store.ensureConversation('/p', () => 'c');
    store.startRun('/p', 'r1');
    const decision = store.proposePlan('/p', plan, 'r1');
    store.resolvePlan('/p', { decision: 'build_all', items: plan.items, comments: '' });
    await decision;
    await expect(
      store.checkpoint('/p', { completedItemIds: ['ore'], summary: 'x' }, 'r1'),
    ).resolves.toBe('continue');
    void store.proposePlan('/p', plan, 'r1');
    store.applyRunEvent('/p', 'r1', { type: 'done', reason: 'cancelled' });
    expect(latest('/p')?.status).toBe('cancelled');
  });

  it('resets a conversation with a new id, keeping the limits and clearing the changeset', () => {
    const store = useAiStore.getState();
    const first = store.ensureConversation('/p', () => 'c1', {
      limits: { chat: DEFAULT_LIMITS.build, build: DEFAULT_LIMITS.build },
    });
    store.setRunLimits('/p', { maxToolTurns: 3, maxOutputTokens: 20_000, taskBudget: true });
    first.changeset.add({ op: 'create', elementId: 'demo:a', kind: 'msm:block', after: {} });
    store.appendUser('/p', 'Hi');
    store.resetConversation('/p', 'c2');
    const fresh = useAiStore.getState().conversations['/p'];
    expect(fresh?.id).toBe('c2');
    expect(fresh?.limits.chat).toEqual(DEFAULT_LIMITS.build);
    expect(fresh).not.toHaveProperty('mode');
    expect(fresh).not.toHaveProperty('plan');
    // The Chat/Build switch is gone (ADR 0125 D2): the run's size comes from `send`'s caller.
    expect('setMode' in useAiStore.getState()).toBe(false);
    expect(fresh?.messages).toEqual([]);
    expect(fresh?.runLimits).toBeNull();
    expect(fresh?.changesetItems).toEqual([]);
    fresh?.changeset.add({ op: 'create', elementId: 'demo:b', kind: 'msm:block', after: {} });
    expect(useAiStore.getState().conversations['/p']?.changesetItems).toHaveLength(1);
  });
});

describe('the plan in the conversation', () => {
  it('is a transcript entry at the place it was proposed, read back by latestPlan', () => {
    let state = running();
    state = applyEvent(state, 'run-1', { type: 'text_delta', text: 'Here is a plan.' });
    state = showPlan(state, plan, 'run-1');
    state = applyEvent(state, 'run-1', { type: 'text_delta', text: 'late' });
    expect(state.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'plan',
      'assistant',
    ]);
    const entry = pendingPlan(state);
    expect(entry?.seq).toBe(2);
    expect(entry?.state).toBe(latestPlan(state));
    state = decidePlan(state, { decision: 'build_all', items: plan.items, comments: '' });
    expect(pendingPlan(state)).toBeUndefined();
    const decided = state.messages[2];
    expect(decided).toMatchObject({ role: 'plan', closed: false, state: { status: 'decided' } });
  });

  it('closes a decided plan to one line once its run has ended, and cancels a waiting one', () => {
    let state = showPlan(running(), plan, 'run-1');
    state = decidePlan(state, { decision: 'step', items: plan.items, comments: '' });
    state = applyEvent(state, 'run-1', { type: 'done', reason: 'end_turn' });
    expect(state.messages.find((message) => message.role === 'plan')).toMatchObject({
      closed: true,
      state: { status: 'decided' },
    });
    let waiting = showPlan(running(), plan, 'run-1');
    waiting = applyEvent(waiting, 'run-1', { type: 'done', reason: 'cancelled' });
    expect(waiting.messages.find((message) => message.role === 'plan')).toMatchObject({
      closed: true,
      state: { status: 'cancelled' },
    });
  });

  it('ticks a line only when the changes or the project hold its element', () => {
    let state = showPlan(running(), plan, 'run-1');
    state = decidePlan(state, { decision: 'build_all', items: plan.items, comments: '' });
    // The model says both are built; nothing is proposed yet.
    state = reachCheckpoint(state, { completedItemIds: ['ore', 'gem'], summary: 'Both.' }, 'run-1');
    const current = latestPlan(state);
    if (current === null) throw new Error('No plan.');
    expect(current.completed).toEqual(['ore', 'gem']);
    expect(tickedItemIds(current, state)).toEqual([]);
    state.changeset.add({
      op: 'create',
      elementId: 'demo:ruby_ore',
      kind: 'msm:block',
      after: {},
    });
    state = { ...state, changesetItems: state.changeset.items };
    expect(tickedItemIds(current, state)).toEqual(['ore']);
    expect(tickedItemIds(current, state, (id) => id === 'demo:ruby')).toEqual(['ore', 'gem']);
  });

  it('reads a typed answer to a waiting plan or step', () => {
    const waiting = latestPlan(showPlan(running(), plan, 'run-1'));
    if (waiting === null) throw new Error('No plan.');
    for (const text of ['go', 'Yes', ' OK! ', 'go.']) {
      expect(typedPlanDecision(waiting, text)).toEqual({
        decision: 'build_all',
        items: plan.items,
        comments: '',
      });
    }
    expect(typedPlanDecision(waiting, 'Make it blue instead ')).toEqual({
      decision: 'revise',
      items: plan.items,
      comments: 'Make it blue instead',
    });
    expect(typedPlanDecision(waiting, 'go on, but no gem').decision).toBe('revise');
    expect(typedStepDecision('stop')).toBe('stop');
    expect(typedStepDecision('Stop.')).toBe('stop');
    expect(typedStepDecision('yes please')).toBe('continue');
  });

  it('resolves a typed answer through the store like a button would', async () => {
    const store = useAiStore.getState();
    store.ensureConversation('/typed', () => 'c');
    store.startRun('/typed', 'r1', 'chat');
    const decision = store.proposePlan('/typed', plan, 'r1');
    const conversation = useAiStore.getState().conversations['/typed'];
    const entry = conversation === undefined ? undefined : pendingPlan(conversation);
    if (entry === undefined) throw new Error('No waiting plan.');
    store.appendUser('/typed', 'go');
    store.resolvePlan('/typed', typedPlanDecision(entry.state, 'go'));
    await expect(decision).resolves.toMatchObject({ decision: 'build_all' });
    const after = useAiStore.getState().conversations['/typed'];
    expect(after?.messages.map((message) => message.role)).toEqual(['plan', 'user']);
    store.dropConversation('/typed');
  });
});

describe('Try again and Keep going', () => {
  const ended = (
    reason: 'error' | 'limit' | 'refusal' | 'cancelled' | 'end_turn' | 'max_tokens',
  ) => {
    let state = addUserMessage(
      newConversation('c'),
      'Make a ruby sword',
      ['ctx'],
      ['data:image/png;base64,AAAA'],
    );
    state = startRun(state, 'r', 'build');
    state = applyEvent(state, 'r', { type: 'text_delta', text: 'Working.' });
    return applyEvent(state, 'r', {
      type: 'done',
      reason,
      ...(reason === 'error' ? { errorClass: 'OverloadedError' } : {}),
    });
  };

  it('sends the failed, refused or stopped run’s message again at its size', () => {
    for (const reason of ['error', 'refusal', 'cancelled'] as const) {
      expect(tryAgainRequest(ended(reason))).toEqual({
        text: 'Make a ruby sword',
        contextBlocks: ['ctx'],
        images: ['data:image/png;base64,AAAA'],
        size: 'build',
      });
    }
    expect(tryAgainRequest(ended('end_turn'))).toBeNull();
    expect(tryAgainRequest(ended('limit'))).toBeNull();
    expect(tryAgainRequest(running())).toBeNull();
  });

  it('sends "continue" after a limit stop or a cut-off answer', () => {
    expect(keepGoingRequest(ended('limit'))).toEqual({
      text: 'continue',
      contextBlocks: [],
      images: [],
      size: 'build',
    });
    expect(keepGoingRequest(ended('max_tokens'))?.text).toBe('continue');
    expect(keepGoingRequest(ended('error'))).toBeNull();
    expect(keepGoingRequest(running())).toBeNull();
  });
});

describe('the Apply notice follows the command stack', () => {
  it('says added, taken out again and put back through undo and redo, and lets go after an edit', async () => {
    const { session } = newSession(createMemoryFileSystem());
    await session.newProject();
    const changeset = new PendingChangeset();
    changeset.add({
      op: 'create',
      elementId: 'demo:ruby_sword',
      kind: 'msm:item',
      after: { display_name: 'Ruby Sword' },
    });
    changeset.add({
      op: 'create',
      elementId: 'demo:ruby_sword_model',
      kind: 'minecraft:model',
      after: { parent: 'minecraft:item/handheld' },
    });
    const items = changeset.items;
    const result = await session.applyChangeset(items);
    const label = session.snapshot.undoLabel ?? '';
    const things = thingsOf(items.filter((item) => result.applied.includes(item.itemId)));
    expect(things).toEqual([
      { id: 'demo:ruby_sword', name: 'Ruby Sword', what: 'Item', op: 'added' },
    ]);
    const step: AiAppliedStep = {
      label,
      things,
      changes: result.applied.length,
      skipped: 0,
      createdIds: ['demo:ruby_sword', 'demo:ruby_sword_model'],
      phase: 'added',
      onTop: true,
      addedText: 'Applied 2 changes. Undo reverts them in one step.',
    };
    let state = addNotice(newConversation('c'), 'info', step.addedText, undefined, {
      applied: step,
    });
    const seq = state.messages[0]?.seq ?? -1;
    const follow = () => {
      const notice = state.messages[0];
      if (notice?.role !== 'notice' || notice.applied === undefined) throw new Error('No step.');
      const [next] = followSteps([notice.applied], session.snapshot);
      if (next === undefined) throw new Error('No step.');
      state = followAppliedNotice(state, seq, next, appliedStoredText(next));
      return state.messages[0] as Extract<AiConversation['messages'][number], { role: 'notice' }>;
    };
    expect(follow().applied).toMatchObject({ phase: 'added', onTop: true });
    session.undo();
    expect(follow()).toMatchObject({
      text: 'Undone.',
      applied: { phase: 'taken-out', onTop: true },
    });
    session.redo();
    expect(follow()).toMatchObject({
      text: step.addedText,
      applied: { phase: 'put-back', onTop: true },
    });
    session.undo();
    expect(follow().applied).toMatchObject({ phase: 'taken-out', onTop: true });
    // Another edit drops the redo history: the notice stays as it was, no longer on top.
    session.addElement({ id: 'demo:other', kind: 'minecraft:function', data: { lines: [] } });
    expect(follow().applied).toMatchObject({ phase: 'taken-out', onTop: false });
  });

  it('gives the top to the newest of two steps with the same label', () => {
    const base = {
      label: 'Apply AI helper changes',
      things: [],
      changes: 1,
      skipped: 0,
      createdIds: [] as string[],
      phase: 'added' as const,
      onTop: true,
      addedText: 'x',
    };
    const followed = followSteps([base, base], {
      project: null,
      undoLabel: 'Apply AI helper changes',
      redoLabel: undefined,
    });
    expect(followed.map((step) => step.onTop)).toEqual([true, false]);
  });
});
