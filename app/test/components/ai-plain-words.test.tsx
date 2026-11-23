// @vitest-environment happy-dom
/**
 * Plain words (ADR 0125 D13, B685): the Very easy panel is rendered through a whole scripted
 * conversation (ask, plan, build, ready, added, taken out, and each way a run can fail) and every
 * text a user can read or hear (the text, placeholders, titles, labels and picture texts) is swept
 * for the words Very easy never shows and for ids. Every button has a text or a label, and there
 * is exactly one primary button (`data-primary="true"`).
 */
import type { AiEvent } from '@msm/ai';
import { DEFAULT_AI_SETTINGS } from '@msm/ai';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AiPanel } from '../../src/renderer/src/components/ai/AiPanel';
import { AiController, useAiPanelStore } from '../../src/renderer/src/components/ai/ai-controller';
import { forbiddenIn } from '../../src/renderer/src/components/ai/ai-words';
import type { ProjectSession } from '../../src/renderer/src/session/project-session';
import { useAiStore } from '../../src/renderer/src/store/ai-store';
import { usePreferences } from '../../src/renderer/src/store/preferences';
import { useUiStore } from '../../src/renderer/src/store/ui-store';
import { aiSession, type FakeAi, fakeAi } from './ai-fixtures';

/**
 * Parts drawn by another brief of wave 2, left out of the sweep until it lands: the open review
 * (B688, `AiChangesetReview`; the tray is swept closed). Remove the entry when B688 has merged
 * (B690 at the latest).
 */
const OTHER_BRIEFS: readonly string[] = ['ai-changeset'];

const ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'] as const;

/** Every text of the panel a user can read or hear, outside {@link OTHER_BRIEFS}. */
function readable(panel: HTMLElement): string[] {
  const copy = panel.cloneNode(true) as HTMLElement;
  for (const id of OTHER_BRIEFS) {
    for (const element of copy.querySelectorAll(`[data-testid="${id}"]`)) element.remove();
  }
  const texts = [copy.textContent ?? ''];
  for (const element of [copy, ...copy.querySelectorAll<HTMLElement>('*')]) {
    for (const name of ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (value !== null && value !== '') texts.push(value);
    }
  }
  return texts;
}

/** Sweeps the panel as it is now; `step` names the moment in a failure. */
function sweep(step: string): void {
  const panel = screen.getByTestId('ai-panel');
  const found = readable(panel).flatMap((text) => forbiddenIn(text));
  expect(found, step).toEqual([]);
  for (const button of panel.querySelectorAll('button')) {
    const text = (button.textContent ?? '').trim();
    const label = button.getAttribute('aria-label') ?? '';
    expect(text !== '' || label !== '', `${step}: a button without a text or label`).toBe(true);
  }
  const primaries = panel.querySelectorAll('[data-primary="true"]');
  expect(primaries.length, `${step}: primary buttons`).toBe(1);
}

interface Setup {
  session: ProjectSession;
  ai: FakeAi;
  user: ReturnType<typeof userEvent.setup>;
}

async function setup(): Promise<Setup> {
  const { session } = await aiSession();
  const ai = fakeAi();
  let next = 0;
  const controller = new AiController({
    session,
    ai,
    loadSettings: async () => ({
      minecraftDir: null,
      updates: { autoCheck: true },
      detectedMinecraftDir: null,
      ai: DEFAULT_AI_SETTINGS,
    }),
    newId: () => `id-${++next}`,
  });
  controller.attach();
  render(
    <AiPanel
      controller={controller}
      onOpenSettings={() => {}}
      onShowMe={() => {}}
      onUndo={() => session.undo()}
      onRedo={() => session.redo()}
    />,
  );
  await screen.findByTestId('ai-input');
  return { session, ai, user: userEvent.setup() };
}

async function ask(s: Setup, text: string): Promise<string> {
  const count = s.ai.starts.length;
  await s.user.type(screen.getByTestId('ai-input'), text);
  await s.user.click(screen.getByTestId('ai-send'));
  await waitFor(() => expect(s.ai.starts.length).toBe(count + 1));
  return s.ai.starts[count]?.runId ?? '';
}

async function tool(s: Setup, runId: string, requestId: string, name: string, input: unknown) {
  const done = s.ai.results.length + 1;
  await s.ai.emit(runId, {
    type: 'tool_request',
    request: { requestId, toolUseId: `t-${requestId}`, name, input },
  });
  return done;
}

beforeEach(() => {
  useAiStore.setState({ conversations: {} });
  useAiPanelStore.setState({
    keyStatus: null,
    settings: null,
    models: {},
    drafts: {},
    applying: false,
    focusRequest: 0,
  });
  useUiStore.setState({ snapshot: null, rightDock: 'problems' });
  usePreferences.setState({ mode: 'very-easy' });
});

afterEach(() => {
  cleanup();
  usePreferences.setState({ mode: 'advanced' });
});

describe('the Very easy panel in plain words', () => {
  it('says nothing forbidden through a whole conversation', async () => {
    const s = await setup();
    sweep('empty');

    const runId = await ask(s, 'Make ruby tools');
    sweep('thinking');
    await s.ai.emit(runId, { type: 'turn_start' });
    await s.ai.emit(runId, { type: 'thinking_delta', text: 'The user wants demo:ruby_sword.' });
    await s.ai.emit(runId, { type: 'text_delta', text: 'Here is what I would make.' });
    await tool(s, runId, 'r1', 'read_element', { id: 'demo:greet' });
    await s.ai.waitForResults(1);
    sweep('reading');

    await tool(s, runId, 'p1', 'propose_plan', {
      title: 'Ruby tools',
      items: [
        { itemId: 'sword', kind: 'msm:item', elementId: 'demo:ruby_sword', summary: 'A sword.' },
      ],
    });
    await waitFor(() =>
      expect(screen.getByTestId('ai-status').dataset.state).toBe('your-turn-plan'),
    );
    sweep('plan waits');

    await s.user.type(screen.getByTestId('ai-input'), 'go{Enter}');
    await s.ai.waitForResults(2);
    await tool(s, runId, 'c1', 'create_elements', {
      elements: [{ id: 'demo:ruby_sword', kind: 'msm:item', data: { display_name: 'Ruby Sword' } }],
    });
    await s.ai.waitForResults(3);
    sweep('making');
    await tool(s, runId, 'k1', 'run_checks', { scope: 'pending' });
    await s.ai.waitForResults(4);
    await s.ai.emit(runId, { type: 'tool_done', requestId: 'k1', isError: false });
    sweep('checked');
    await s.ai.emit(runId, { type: 'text_delta', text: ' The Ruby Sword is ready for you.' });
    await s.ai.emit(runId, { type: 'done', reason: 'end_turn' });
    expect(screen.getByTestId('ai-status-text').textContent).toBe(
      '1 thing is ready. Nothing is in your mod yet.',
    );
    sweep('ready');

    await s.user.click(screen.getByTestId('ai-apply'));
    await waitFor(() =>
      expect(screen.getByTestId('ai-status-text').textContent).toBe(
        'Added 1 thing to your mod: Ruby Sword.',
      ),
    );
    sweep('added');
    act(() => {
      s.session.undo();
    });
    await waitFor(() =>
      expect(screen.getByTestId('ai-status-text').textContent).toBe('Taken out again.'),
    );
    sweep('taken out');
  });

  const failures: [string, Extract<AiEvent, { type: 'done' }>][] = [
    [
      'a key not accepted',
      { type: 'done', reason: 'error', errorClass: 'AuthenticationError', message: 'x-api-key' },
    ],
    [
      'no credit',
      { type: 'done', reason: 'error', errorClass: 'BillingError', message: 'credit balance' },
    ],
    ['busy', { type: 'done', reason: 'error', errorClass: 'OverloadedError', message: '529' }],
    [
      'offline',
      { type: 'done', reason: 'error', errorClass: 'APIConnectionError', message: 'ECONNRESET' },
    ],
    ['an unknown error', { type: 'done', reason: 'error', message: 'TypeError: x is undefined' }],
    [
      'the limit',
      {
        type: 'done',
        reason: 'limit',
        message: 'It paused.',
        limit: { toolTurns: 24, outputTokens: 100_000 },
      },
    ],
    ['a cut-off answer', { type: 'done', reason: 'max_tokens' }],
    [
      'a refusal',
      {
        type: 'done',
        reason: 'refusal',
        stopDetails: {
          category: 'cyber',
          explanation: 'The request was declined.',
        },
      },
    ],
    ['Stop', { type: 'done', reason: 'cancelled' }],
  ];

  it.each(failures)('says nothing forbidden after %s', async (name, event) => {
    const s = await setup();
    const runId = await ask(s, 'Make a ruby sword');
    await s.ai.emit(runId, event);
    expect(screen.getByTestId('ai-status').dataset.state).toMatch(/^(stopped|failed)$/);
    sweep(name);
  });
});
