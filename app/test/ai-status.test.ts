/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { AI_ERROR_CLASSES, type AiDoneReason, type ProposePlanInput } from '@msm/ai';
import { describe, expect, it } from 'vitest';
import {
  AI_STATUS_STATES,
  type AiStatus,
  conversationStatus,
  thingsOf,
  WORKING_STATES,
} from '../src/renderer/src/components/ai/ai-status';
import {
  statusWords,
  THING_KIND_WORDS,
} from '../src/renderer/src/components/ai/ai-words';
import {
  type AiAppliedStep,
  type AiConversation,
  addNotice,
  addUserMessage,
  applyEvent,
  decidePlan,
  newConversation,
  reachCheckpoint,
  showPlan,
  startRun,
} from '../src/renderer/src/store/ai-store';

const plan: ProposePlanInput = {
  title: 'Ruby tools',
  items: [
    { itemId: 'sword', kind: 'msm:item', elementId: 'demo:ruby_sword', summary: 'A sword.' },
    { itemId: 'pick', kind: 'msm:item', elementId: 'demo:ruby_pickaxe', summary: 'A pickaxe.' },
  ],
};

type RunCase =
  | { kind: 'none' }
  | { kind: 'running'; tool?: string }
  | { kind: 'done'; reason: AiDoneReason; errorClass?: string };
type PlanCase = 'none' | 'pending' | 'build_all' | 'step';
type NoticeCase = 'none' | 'added' | 'taken-out' | 'put-back' | 'info';

const RUNS: RunCase[] = [
  { kind: 'none' },
  { kind: 'running' },
  { kind: 'running', tool: 'read_element' },
  { kind: 'running', tool: 'create_elements' },
  { kind: 'running', tool: 'run_checks' },
  { kind: 'running', tool: 'note_missing_feature' },
  ...(['end_turn', 'cancelled', 'limit', 'refusal', 'max_tokens', 'no_key'] as const).map(
    (reason): RunCase => ({ kind: 'done', reason }),
  ),
  { kind: 'done', reason: 'error' },
  ...AI_ERROR_CLASSES.map((errorClass): RunCase => ({ kind: 'done', reason: 'error', errorClass })),
];
const PLANS: PlanCase[] = ['none', 'pending', 'build_all', 'step'];
const NOTICES: NoticeCase[] = ['none', 'added', 'taken-out', 'put-back', 'info'];

function step(phase: AiAppliedStep['phase'], onTop: boolean): AiAppliedStep {
  return {
    label: 'Apply AI helper changes',
    things: [{ id: 'demo:ruby_sword', name: 'Ruby Sword', what: 'Item', op: 'added' }],
    changes: 4,
    skipped: 0,
    createdIds: ['demo:ruby_sword'],
    phase,
    onTop,
    addedText: 'Applied 4 changes. Undo reverts them in one step.',
  };
}

/** A conversation in the given combination; `stepWaits` makes the checkpoint wait. */
function build(
  run: RunCase,
  planCase: PlanCase,
  stepWaits: boolean,
  changes: boolean,
  notice: NoticeCase,
  onTop: boolean,
): AiConversation {
  let state = newConversation('c');
  const noticeFirst = (current: AiConversation): AiConversation => {
    if (notice === 'none') return current;
    if (notice === 'info') return addNotice(current, 'info', 'Discarded the proposed changes.');
    return addNotice(current, 'info', 'Applied.', undefined, { applied: step(notice, onTop) });
  };
  // The notice of an earlier Apply comes before the message, as it does in the app.
  state = noticeFirst(state);
  if (run.kind === 'none') {
    return changes ? withChanges(state) : state;
  }
  state = addUserMessage(state, 'Make ruby tools');
  state = startRun(state, 'r', 'chat', 0);
  state = applyEvent(state, 'r', { type: 'turn_start' }, 2_000);
  if (planCase !== 'none') {
    state = showPlan(state, plan, 'r');
    if (planCase !== 'pending') {
      state = decidePlan(state, { decision: planCase, items: plan.items, comments: '' });
      if (planCase === 'step' && stepWaits) {
        state = reachCheckpoint(state, { completedItemIds: ['sword'], summary: 'Sword.' }, 'r');
      }
    }
  }
  if (changes) state = withChanges(state);
  if (run.kind === 'running' && run.tool !== undefined) {
    state = applyEvent(state, 'r', {
      type: 'tool_request',
      request: { requestId: 'q', toolUseId: 't', name: run.tool, input: {} },
    });
  }
  if (run.kind === 'done') {
    state = applyEvent(state, 'r', {
      type: 'done',
      reason: run.reason,
      ...(run.errorClass === undefined ? {} : { errorClass: run.errorClass }),
      ...(run.reason === 'limit' ? { limit: { toolTurns: 24, outputTokens: 100_000 } } : {}),
      ...(run.reason === 'refusal'
        ? { stopDetails: { category: null, explanation: 'Not this.' } }
        : {}),
    });
  }
  return state;
}

function withChanges(state: AiConversation): AiConversation {
  state.changeset.add({
    op: 'create',
    elementId: 'demo:ruby_sword',
    kind: 'msm:item',
    after: { display_name: 'Ruby Sword' },
  });
  state.changeset.add({
    op: 'create',
    elementId: 'demo:ruby_sword_model',
    kind: 'minecraft:model',
    after: {},
  });
  return { ...state, changesetItems: state.changeset.items };
}

interface Combination {
  name: string;
  conversation: AiConversation;
  awaitsAnswer: boolean;
}

function combinations(): Combination[] {
  const all: Combination[] = [];
  for (const run of RUNS) {
    for (const planCase of PLANS) {
      for (const stepWaits of [false, true]) {
        if (stepWaits && planCase !== 'step') continue;
        for (const changes of [false, true]) {
          for (const notice of NOTICES) {
            for (const onTop of [true, false]) {
              if (onTop === false && (notice === 'none' || notice === 'info')) continue;
              const conversation = build(run, planCase, stepWaits, changes, notice, onTop);
              all.push({
                name: JSON.stringify({ run, planCase, stepWaits, changes, notice, onTop }),
                conversation,
                awaitsAnswer:
                  run.kind === 'running' &&
                  (planCase === 'pending' || (planCase === 'step' && stepWaits)),
              });
            }
          }
        }
      }
    }
  }
  return all;
}

const WORKING_WORDS = /Thinking|Looking at|Making it|Checking it/;

describe('conversationStatus', () => {
  const all = combinations();

  it('covers every state', () => {
    const states = new Set(all.map(({ conversation }) => conversationStatus(conversation).state));
    expect([...states].sort()).toEqual([...AI_STATUS_STATES].sort());
    expect(all.length).toBeGreaterThan(500);
  });

  it('gives exactly one non-empty line and at most one action', () => {
    for (const { name, conversation } of all) {
      const status = conversationStatus(conversation, 14_700);
      const words = statusWords(status);
      expect(words.text.trim(), name).not.toBe('');
      expect(words.text, name).not.toMatch(/\n/);
      if (words.action !== null) expect(words.action.label.trim(), name).not.toBe('');
      expect(words.action === null ? null : words.action.id, name).toBe(status.action);
    }
  });

  it('never says working while the user’s answer is awaited', () => {
    const awaiting = all.filter((entry) => entry.awaitsAnswer);
    expect(awaiting.length).toBeGreaterThan(0);
    for (const { name, conversation } of awaiting) {
      const status = conversationStatus(conversation, 14_700);
      expect(WORKING_STATES.has(status.state), name).toBe(false);
      expect(status.state, name).toMatch(/^your-turn-/);
      expect(status.seconds, name).toBeNull();
      expect(statusWords(status).text, name).not.toMatch(WORKING_WORDS);
    }
  });

  it('says what the helper works on, with the seconds since its turn started and Stop', () => {
    const at = (tool?: string): AiStatus =>
      conversationStatus(
        build(
          { kind: 'running', ...(tool === undefined ? {} : { tool }) },
          'none',
          false,
          false,
          'none',
          true,
        ),
        14_700,
      );
    expect(at()).toMatchObject({ state: 'thinking', seconds: 12, action: 'stop' });
    expect(at('read_element').state).toBe('reading');
    expect(at('create_elements').state).toBe('making');
    expect(at('run_checks').state).toBe('checking');
    expect(statusWords(at()).text).toBe('Thinking… (12 s)');
    expect(statusWords(at('run_checks')).text).toBe('Checking it works… (12 s)');
  });

  it('counts things, not files, when changes are ready', () => {
    const status = conversationStatus(
      build({ kind: 'done', reason: 'end_turn' }, 'none', false, true, 'none', true),
    );
    expect(status).toMatchObject({ state: 'ready', things: 1, changes: 2, action: 'look' });
    expect(statusWords(status).text).toBe(
      '1 thing is ready. Nothing is in your mod yet.',
    );
  });

  it('puts a failure first while it is the newest notice, with its one action', () => {
    const failed = (errorClass: string) =>
      conversationStatus(
        build({ kind: 'done', reason: 'error', errorClass }, 'none', false, true, 'none', true),
      );
    expect(failed('AuthenticationError')).toMatchObject({ state: 'failed', action: 'check-key' });
    expect(failed('BillingError')).toMatchObject({ state: 'failed', action: 'try-again' });
    expect(failed('OverloadedError').action).toBe('try-again');
    expect(failed('APIConnectionError').action).toBe('try-again');
    expect(failed('ContextWindowExceeded').action).toBe('new-chat');
    const limit = conversationStatus(
      build({ kind: 'done', reason: 'limit' }, 'none', false, false, 'none', true),
    );
    expect(limit).toMatchObject({ state: 'stopped', action: 'keep-going' });
    expect(statusWords(limit).text).toBe('It paused so the cost stays small.');
    expect(statusWords(failed('AuthenticationError')).text).toBe('Your key was not accepted.');
  });

  it('offers Show me after adding and Put back once taken out', () => {
    const idle = (phase: AiAppliedStep['phase'], onTop: boolean) =>
      conversationStatus(build({ kind: 'none' }, 'none', false, false, phase, onTop));
    expect(idle('added', true)).toMatchObject({ state: 'idle', action: 'show-me' });
    expect(statusWords(idle('added', true)).text).toBe(
      'Added 1 thing to your mod: Ruby Sword.',
    );
    expect(idle('taken-out', true).action).toBe('put-back');
    expect(idle('taken-out', false).action).toBeNull();
    expect(statusWords(idle('taken-out', true)).text).toBe('Taken out again.');
    expect(statusWords(idle('taken-out', true))).toEqual({
      text: 'Taken out again.',
      action: { id: 'put-back', label: 'Put back' },
    });
  });
});

describe('thingsOf', () => {
  it('names one thing per Creator set or main element, by the language files first', () => {
    const conversation = newConversation('c');
    const add = conversation.changeset.add.bind(conversation.changeset);
    add({ op: 'create', elementId: 'demo:ruby_ore', kind: 'msm:block', after: {} });
    add({
      op: 'create',
      elementId: 'demo:en_us',
      kind: 'minecraft:lang',
      after: { 'block.demo.ruby_ore': 'Ruby Ore' },
    });
    add({
      op: 'create',
      elementId: 'demo:ruby_sword',
      kind: 'msm:item',
      after: {},
      meta: {
        creator: { flowId: 'gear', setId: 's1', generatedId: 'g', values: { name: 'Ruby Gear' } },
      },
    });
    add({
      op: 'create',
      elementId: 'demo:ruby_pickaxe',
      kind: 'msm:item',
      after: {},
      meta: {
        creator: { flowId: 'gear', setId: 's1', generatedId: 'g', values: { name: 'Ruby Gear' } },
      },
    });
    add({ op: 'delete', elementId: 'demo:old_gem', kind: 'msm:item', before: {} });
    add({
      op: 'update',
      elementId: 'demo:greet',
      kind: 'minecraft:function',
      before: {},
      after: {},
    });
    expect(thingsOf(conversation.changeset.items)).toEqual([
      { id: 'demo:ruby_ore', name: 'Ruby Ore', what: 'Block', op: 'added' },
      { id: 'demo:ruby_pickaxe', name: 'Ruby Gear', what: 'Item', op: 'added' },
      { id: 'demo:old_gem', name: 'Old gem', what: 'Item', op: 'removed' },
    ]);
  });

  it('knows the same thing kinds as My things', () => {
    const source = readFileSync(
      new URL('../src/renderer/src/components/home/things.ts', import.meta.url),
      'utf8',
    );
    const list = source.slice(source.indexOf('export const THING_KINDS'), source.indexOf('];'));
    const kinds = [...list.matchAll(/\{ kind: ('([^']+)'|RULES_KIND), word: '([^']+)'/g)].map(
      (match) => ({ kind: match[2] ?? 'msm:rules', word: match[3] }),
    );
    expect(kinds.length).toBeGreaterThan(10);
    expect(THING_KIND_WORDS).toEqual(kinds);
  });
});
