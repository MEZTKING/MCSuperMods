// @vitest-environment happy-dom
import { DEFAULT_AI_SETTINGS } from '@msm/ai';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiPanel } from '../../src/renderer/src/components/ai/AiPanel';
import { toolSummary } from '../../src/renderer/src/components/ai/AiTranscript';
import { usageText } from '../../src/renderer/src/components/ai/AiUsageLine';
import {
  AiController,
  EXPLAIN_PROBLEM_TEXT,
  useAiPanelStore,
} from '../../src/renderer/src/components/ai/ai-controller';
import { lineDiff } from '../../src/renderer/src/components/ai/line-diff';
import type { ProjectSession } from '../../src/renderer/src/session/project-session';
import { useAiStore } from '../../src/renderer/src/store/ai-store';
import { useUiStore } from '../../src/renderer/src/store/ui-store';
import type { AppSettingsView } from '../../src/shared/platform';
import { aiSession, type FakeAi, fakeAi } from './ai-fixtures';

const settingsView = (): AppSettingsView => ({
  minecraftDir: null,
  updates: { autoCheck: true },
  detectedMinecraftDir: null,
  ai: DEFAULT_AI_SETTINGS,
});

interface Setup {
  session: ProjectSession;
  ai: FakeAi;
  controller: AiController;
  onOpenSettings: ReturnType<typeof vi.fn>;
  user: ReturnType<typeof userEvent.setup>;
}

async function setup(ai: FakeAi = fakeAi()): Promise<Setup> {
  const { session } = await aiSession();
  let next = 0;
  const controller = new AiController({
    session,
    ai,
    loadSettings: async () => settingsView(),
    newId: () => `id-${++next}`,
  });
  controller.attach();
  const onOpenSettings = vi.fn();
  render(<AiPanel controller={controller} onOpenSettings={onOpenSettings} />);
  return { session, ai, controller, onOpenSettings, user: userEvent.setup() };
}

/** Types a message and sends it; resolves with the run id main received. */
async function sendMessage(s: Setup, text: string): Promise<string> {
  const input = await screen.findByTestId('ai-input');
  await s.user.type(input, text);
  await s.user.click(screen.getByTestId('ai-send'));
  await waitFor(() => expect(s.ai.starts.length).toBeGreaterThan(0));
  return s.ai.starts[s.ai.starts.length - 1]?.runId ?? '';
}

function lastMessage(role: string): HTMLElement {
  const all = screen
    .getAllByTestId(/^ai-message-\d+$/)
    .filter((entry) => entry.dataset.role === role);
  const last = all[all.length - 1];
  if (last === undefined) throw new Error(`No ${role} message.`);
  return last;
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
});

afterEach(cleanup);

describe('AiPanel', () => {
  it('sends the message with the project context and streams the answer as Markdown', async () => {
    const s = await setup();
    const runId = await sendMessage(s, 'What is in my project?');
    const start = s.ai.starts[0];
    expect(start?.text).toBe('What is in my project?');
    expect(start?.mode).toBe('chat');
    expect(start?.conversationId).toBe('id-1');
    expect(start?.limits).toEqual(DEFAULT_AI_SETTINGS.limits.chat);
    expect(start?.contextBlocks).toHaveLength(1);
    expect(start?.contextBlocks[0]).toContain('demo');
    expect(lastMessage('user').textContent).toContain('What is in my project?');
    expect(screen.getByTestId('ai-stop')).toBeTruthy();
    expect((screen.getByTestId('ai-send') as HTMLButtonElement).disabled).toBe(true);

    await s.ai.emit(runId, { type: 'thinking_delta', text: 'Looking at the counts.' });
    await s.ai.emit(runId, { type: 'text_delta', text: 'You have one ' });
    await s.ai.emit(runId, { type: 'text_delta', text: '**function**.' });
    const answer = lastMessage('assistant');
    expect(answer.querySelector('strong')?.textContent).toBe('function');
    const thinking = within(answer).getByText('Thinking');
    expect(thinking.closest('details')?.open).toBe(false);
    await s.ai.emit(runId, {
      type: 'usage',
      turn: {
        inputTokens: 12000,
        outputTokens: 3210,
        cacheReadInputTokens: 431,
        cacheCreationInputTokens: 0,
        requests: 1,
      },
      total: {
        inputTokens: 12000,
        outputTokens: 3210,
        cacheReadInputTokens: 431,
        cacheCreationInputTokens: 0,
        requests: 4,
      },
    });
    expect(screen.getByTestId('ai-usage').textContent).toMatch(
      /^12,431 in \/ 3,210 out, 4 requests, about \$0\.\d\d, Opus 5\.5$/,
    );
    await s.ai.emit(runId, { type: 'done', reason: 'end_turn' });
    expect(screen.queryByTestId('ai-stop')).toBeNull();
  });

  it('runs a tool request against the session and shows it as a one-line entry', async () => {
    const s = await setup();
    const runId = await sendMessage(s, 'Read greet');
    await s.ai.emit(runId, {
      type: 'tool_request',
      request: {
        requestId: 'r1',
        toolUseId: 'toolu_1',
        name: 'read_element',
        input: { id: 'demo:greet' },
      },
    });
    await s.ai.waitForResults(1);
    const result = s.ai.results[0];
    expect(result?.runId).toBe(runId);
    expect(result?.result.isError).toBe(false);
    expect(result?.result.content).toContain('say hi');
    await s.ai.emit(runId, { type: 'tool_done', requestId: 'r1', isError: false });
    const entry = lastMessage('tool');
    expect(entry.textContent).toContain('Read demo:greet');
    expect(entry.querySelector('code')?.textContent).toBe('demo:greet');
    await waitFor(() => expect(entry.textContent).toContain('Result'));
  });

  it.each([
    ['ai-plan-build-all', 'build_all'],
    ['ai-plan-step', 'step'],
    ['ai-plan-revise', 'revise'],
  ] as const)('renders the plan and answers it with %s', async (button, decision) => {
    const s = await setup();
    await s.user.click(await screen.findByTestId('ai-mode-build'));
    const runId = await sendMessage(s, 'Build a ruby mod');
    expect(s.ai.starts[0]?.mode).toBe('build');
    await s.ai.emit(runId, {
      type: 'tool_request',
      request: {
        requestId: 'p1',
        toolUseId: 'toolu_1',
        name: 'propose_plan',
        input: {
          title: 'Ruby mod',
          items: [
            { itemId: 'ore', kind: 'msm:block', elementId: 'ruby:ruby_ore', summary: 'Ruby ore' },
            { itemId: 'gem', kind: 'msm:item', elementId: 'ruby:ruby', summary: 'Ruby gem' },
          ],
          notes: 'Textures are placeholders.',
        },
      },
    });
    const plan = await screen.findByTestId('ai-plan');
    expect(plan.textContent).toContain('Ruby mod');
    expect(plan.textContent).toContain('Textures are placeholders.');
    await s.user.click(screen.getByTestId('ai-plan-item-gem-remove'));
    expect(screen.queryByTestId('ai-plan-item-gem')).toBeNull();
    await s.user.type(screen.getByTestId('ai-plan-comments'), 'Use red');
    await s.user.click(screen.getByTestId(button));
    await s.ai.waitForResults(1);
    const answer = JSON.parse(s.ai.results[0]?.result.content ?? '{}');
    expect(answer.decision).toBe(decision);
    expect(answer.items.map((item: { itemId: string }) => item.itemId)).toEqual(['ore']);
    expect(answer.comments).toBe('Use red');
    expect(screen.queryByTestId('ai-plan-build-all')).toBeNull();

    if (decision === 'step') {
      await s.ai.emit(runId, {
        type: 'tool_request',
        request: {
          requestId: 'c1',
          toolUseId: 'toolu_2',
          name: 'checkpoint',
          input: { completedItemIds: ['ore'], summary: 'The ore is proposed.' },
        },
      });
      await s.user.click(await screen.findByTestId('ai-checkpoint-continue'));
      await s.ai.waitForResults(2);
      expect(JSON.parse(s.ai.results[1]?.result.content ?? '{}')).toEqual({
        decision: 'continue',
      });
      expect(screen.getByTestId('ai-plan-item-ore').dataset.done).toBe('true');
      expect(screen.queryByTestId('ai-checkpoint')).toBeNull();
    }
  });

  it('reviews the changeset, toggles acceptance and applies it as one undo step', async () => {
    const s = await setup();
    const runId = await sendMessage(s, 'Delete greet');
    await s.ai.emit(runId, {
      type: 'tool_request',
      request: {
        requestId: 'd1',
        toolUseId: 'toolu_1',
        name: 'delete_element',
        input: { id: 'demo:greet' },
      },
    });
    await s.ai.waitForResults(1);
    const changeset = await screen.findByTestId('ai-changeset');
    expect(changeset.textContent).toContain('Deleted elements (1)');
    const row = within(changeset).getAllByTestId(/^ai-change-item-\d+$/)[0] as HTMLElement;
    const itemId = row.dataset.testid?.replace('ai-change-', '') ?? '';
    const accept = screen.getByTestId(`ai-change-${itemId}-accept`) as HTMLInputElement;
    expect(accept.checked).toBe(true);
    // Apply waits for the run to end.
    expect((screen.getByTestId('ai-apply') as HTMLButtonElement).disabled).toBe(true);
    await s.ai.emit(runId, { type: 'done', reason: 'end_turn' });
    expect((screen.getByTestId('ai-apply') as HTMLButtonElement).disabled).toBe(false);
    await s.user.click(accept);
    expect(accept.checked).toBe(false);
    expect((screen.getByTestId('ai-apply') as HTMLButtonElement).disabled).toBe(true);
    await s.user.click(accept);
    await s.user.click(
      screen.getByTestId(`ai-change-${itemId}-diff`).querySelector('summary') as Element,
    );
    expect(screen.getByTestId(`ai-change-${itemId}-diff`).textContent).toContain('- ');

    await s.user.click(screen.getByTestId('ai-apply'));
    await waitFor(() => expect(lastMessage('notice').textContent).toMatch(/Applied 1 change\./));
    const ids = (s.session.snapshot.project?.namespaces ?? []).flatMap((namespace) =>
      namespace.elements.map((element) => element.id),
    );
    expect(ids).not.toContain('demo:greet');
    expect(s.session.snapshot.undoLabel).toBe('Apply AI helper changes');
    expect(screen.queryByTestId('ai-changeset')).toBeNull();
    act(() => {
      s.session.undo();
    });
    const restored = (s.session.snapshot.project?.namespaces ?? []).flatMap((namespace) =>
      namespace.elements.map((element) => element.id),
    );
    expect(restored).toContain('demo:greet');
  });

  it('discards the changeset after confirmation', async () => {
    const s = await setup();
    const runId = await sendMessage(s, 'Delete greet');
    await s.ai.emit(runId, {
      type: 'tool_request',
      request: {
        requestId: 'd1',
        toolUseId: 't',
        name: 'delete_element',
        input: { id: 'demo:greet' },
      },
    });
    await s.ai.waitForResults(1);
    await s.user.click(await screen.findByTestId('ai-discard'));
    await s.user.click(await screen.findByTestId('confirm-dialog-confirm'));
    await waitFor(() => expect(screen.queryByTestId('ai-changeset')).toBeNull());
    expect(lastMessage('notice').textContent).toContain('Discarded the proposed changes.');
  });

  it('stops a run with Stop and shows the cancelled notice', async () => {
    const s = await setup();
    const runId = await sendMessage(s, 'Long task');
    await s.user.click(screen.getByTestId('ai-stop'));
    expect(s.ai.cancels).toEqual([runId]);
    await s.ai.emit(runId, { type: 'done', reason: 'cancelled' });
    expect(lastMessage('notice').textContent).toBe('Stopped.');
  });

  it('edits the next run limits in the Run limits popover', async () => {
    const s = await setup();
    await s.user.click(await screen.findByTestId('ai-limits'));
    const turns = await screen.findByTestId('ai-limit-tool-turns');
    await s.user.clear(turns);
    await s.user.type(turns, '5');
    await s.user.click(screen.getByTestId('ai-limit-task-budget'));
    await s.user.keyboard('{Escape}');
    const runId = await sendMessage(s, 'Small task');
    expect(s.ai.starts[0]?.limits).toEqual({
      maxToolTurns: 5,
      maxOutputTokens: DEFAULT_AI_SETTINGS.limits.chat.maxOutputTokens,
      taskBudget: false,
    });
    await s.ai.emit(runId, {
      type: 'done',
      reason: 'limit',
      message: 'The run stopped at its limit (5 tool turns / 100000 output tokens).',
    });
    expect(lastMessage('notice').textContent).toContain('5 tool turns');
    // The override was for that run only.
    expect(useAiStore.getState().conversations['/projects/demo']?.runLimits).toBeNull();
  });

  it('shows the privacy notice and Open Settings without a key', async () => {
    const s = await setup(fakeAi({ set: false, tail: null }));
    const missing = await screen.findByTestId('ai-key-missing');
    expect(missing.textContent).toContain('Textures, other files and file paths are never sent.');
    await s.user.click(screen.getByTestId('ai-open-settings'));
    expect(s.onOpenSettings).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('ai-input')).toBeNull();
  });

  it('puts an explained problem in the input area and sends it as a context block', async () => {
    const s = await setup();
    await screen.findByTestId('ai-input');
    act(() =>
      s.controller.explainProblem({
        severity: 'error',
        code: 'schema.type',
        message: 'Expected a string.',
        elementId: 'demo:greet',
        path: '/lines/0',
      }),
    );
    expect(useUiStore.getState().rightDock).toBe('assistant');
    const context = await screen.findByTestId('ai-context');
    expect(context.textContent).toContain('Problem schema.type on demo:greet');
    expect(context.textContent).toContain('Expected a string.');
    expect((screen.getByTestId('ai-input') as HTMLTextAreaElement).value).toBe(
      EXPLAIN_PROBLEM_TEXT,
    );
    await s.user.click(screen.getByTestId('ai-send'));
    await waitFor(() => expect(s.ai.starts).toHaveLength(1));
    expect(s.ai.starts[0]?.contextBlocks[1]).toContain('`schema.type` on `demo:greet`');
    expect(screen.queryByTestId('ai-context')).toBeNull();
  });

  it('starts a new conversation and drops the old one in main', async () => {
    const s = await setup();
    const runId = await sendMessage(s, 'Hello');
    await s.ai.emit(runId, { type: 'done', reason: 'end_turn' });
    await s.user.click(screen.getByTestId('ai-new-conversation'));
    await waitFor(() => expect(s.ai.drops).toEqual(['id-1']));
    expect(screen.queryByTestId('ai-message-0')).toBeNull();
    await sendMessage(s, 'Again');
    expect(s.ai.starts[1]?.conversationId).not.toBe('id-1');
  });

  it('notes a model change while a conversation exists', async () => {
    const s = await setup();
    const runId = await sendMessage(s, 'Hello');
    await s.ai.emit(runId, { type: 'done', reason: 'end_turn' });
    await act(async () => {
      s.controller.modelChanged('claude-sonnet-5-5');
    });
    expect(lastMessage('notice').textContent).toBe('Start a new conversation to use Sonnet 5.5.');
  });
});

describe('AI helper panel helpers', () => {
  it('summarises tool entries', () => {
    expect(toolSummary({ name: 'read_element', input: { id: 'ruby:ruby_ore' } })).toBe(
      'Read `ruby:ruby_ore`',
    );
    expect(toolSummary({ name: 'create_elements', input: { elements: [{}, {}, {}, {}] } })).toBe(
      'Proposed 4 elements',
    );
    expect(
      toolSummary({
        name: 'run_checks',
        input: { scope: 'pending' },
        result: JSON.stringify({ counts: { error: 1, warning: 1, info: 0 } }),
      }),
    ).toBe('Checked: 2 problems');
  });

  it('formats the usage line', () => {
    expect(
      usageText(
        {
          inputTokens: 12431,
          outputTokens: 3210,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          requests: 4,
        },
        'claude-opus-5-5',
      ),
    ).toBe('12,431 in / 3,210 out, 4 requests, about $0.11, Opus 5.5');
  });

  it('diffs lines with a longest common subsequence', () => {
    expect(lineDiff('a\nb\nc', 'a\nx\nc')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'removed', text: 'b' },
      { type: 'added', text: 'x' },
      { type: 'same', text: 'c' },
    ]);
    expect(lineDiff('', 'a')).toEqual([{ type: 'added', text: 'a' }]);
    expect(lineDiff('a\nb', '')).toEqual([
      { type: 'removed', text: 'a' },
      { type: 'removed', text: 'b' },
    ]);
  });
});
