import { type AiUsage, DEFAULT_LIMITS, type ProposePlanInput } from '@msm/ai';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type AiConversation,
  addUserMessage,
  applyEvent,
  doneNotice,
  isRunning,
  limitsFor,
  newConversation,
  startRun,
  useAiStore,
} from '../src/renderer/src/store/ai-store';

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

  it('words each done reason', () => {
    expect(doneNotice('end_turn')).toBeUndefined();
    expect(doneNotice('cancelled')).toBe('Stopped.');
    expect(
      doneNotice('refusal', undefined, { category: 'cyber', explanation: 'Not allowed.' }),
    ).toBe('The model declined to continue: Not allowed.');
    expect(doneNotice('error', 'Overloaded')).toBe('The run failed: Overloaded');
    expect(doneNotice('no_key')).toMatch(/Settings > AI helper/);
    expect(doneNotice('max_tokens')).toMatch(/maximum length/);
  });

  it('uses the run limits once, then the mode defaults again', () => {
    let state = newConversation('c', { mode: 'build' });
    expect(limitsFor(state)).toEqual(DEFAULT_LIMITS.build);
    state = {
      ...state,
      runLimits: { maxToolTurns: 5, maxOutputTokens: 30_000, taskBudget: false },
    };
    state = startRun(state, 'r');
    expect(state.run?.limits).toEqual({
      maxToolTurns: 5,
      maxOutputTokens: 30_000,
      taskBudget: false,
    });
    expect(state.run?.mode).toBe('build');
    expect(limitsFor(state)).toEqual(DEFAULT_LIMITS.build);
  });
});

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
    store.ensureConversation('/p/b', () => 'conv-b', { mode: 'build' });
    expect(useAiStore.getState().conversations['/p/b']?.mode).toBe('build');
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
    expect(useAiStore.getState().conversations['/p']?.plan?.status).toBe('pending');
    store.resolvePlan('/p', { decision: 'step', items: plan.items.slice(0, 1), comments: '' });
    await expect(decision).resolves.toEqual({
      decision: 'step',
      items: plan.items.slice(0, 1),
      comments: '',
    });
    const state = useAiStore.getState().conversations['/p'];
    expect(state?.plan).toMatchObject({ status: 'decided', stepMode: true });
    expect(state?.plan?.plan.items).toHaveLength(1);

    const checkpoint = store.checkpoint(
      '/p',
      { completedItemIds: ['ore'], summary: 'Built.' },
      'r1',
    );
    expect(useAiStore.getState().conversations['/p']?.checkpoint?.input.completedItemIds).toEqual([
      'ore',
    ]);
    expect(useAiStore.getState().conversations['/p']?.plan?.completed).toEqual(['ore']);
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
    expect(useAiStore.getState().conversations['/p']?.plan?.status).toBe('cancelled');
  });

  it('resets a conversation with a new id, keeping mode and limits and clearing the changeset', () => {
    const store = useAiStore.getState();
    const first = store.ensureConversation('/p', () => 'c1');
    store.setMode('/p', 'build');
    store.setRunLimits('/p', { maxToolTurns: 3, maxOutputTokens: 20_000, taskBudget: true });
    first.changeset.add({ op: 'create', elementId: 'demo:a', kind: 'msm:block', after: {} });
    store.appendUser('/p', 'Hi');
    store.resetConversation('/p', 'c2');
    const fresh = useAiStore.getState().conversations['/p'];
    expect(fresh?.id).toBe('c2');
    expect(fresh?.mode).toBe('build');
    expect(fresh?.messages).toEqual([]);
    expect(fresh?.runLimits).toBeNull();
    expect(fresh?.changesetItems).toEqual([]);
    fresh?.changeset.add({ op: 'create', elementId: 'demo:b', kind: 'msm:block', after: {} });
    expect(useAiStore.getState().conversations['/p']?.changesetItems).toHaveLength(1);
  });
});
