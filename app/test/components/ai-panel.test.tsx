// @vitest-environment happy-dom
import { DEFAULT_AI_SETTINGS } from '@msm/ai';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiPanel, primaryOf } from '../../src/renderer/src/components/ai/AiPanel';
import {
  rememberContextLabel,
  SENT_CONTEXT_WORDS,
  sentContextLabel,
} from '../../src/renderer/src/components/ai/AiTranscript';
import { usageText } from '../../src/renderer/src/components/ai/AiUsageLine';
import {
  AiController,
  EXPLAIN_PROBLEM_TEXT,
  useAiPanelStore,
} from '../../src/renderer/src/components/ai/ai-controller';
import {
  AI_STATUS_STATES,
  conversationStatus,
} from '../../src/renderer/src/components/ai/ai-status';
import {
  forbiddenIn,
  statusWords,
  toolLine,
  wordsFor,
} from '../../src/renderer/src/components/ai/ai-words';
import { lineDiff } from '../../src/renderer/src/components/ai/line-diff';
import type { ProjectSession } from '../../src/renderer/src/session/project-session';
import {
  type AiConversation,
  applyEvent,
  latestPlan,
  useAiStore,
} from '../../src/renderer/src/store/ai-store';
import { useUiStore } from '../../src/renderer/src/store/ui-store';
import type { AppSettingsView } from '../../src/shared/platform';
import { aiSession, aiStateFixtures, type FakeAi, fakeAi } from './ai-fixtures';

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

type PanelExtras = Partial<Pick<ComponentProps<typeof AiPanel>, 'onShowMe' | 'onUndo' | 'onRedo'>>;

async function setup(ai: FakeAi = fakeAi(), extras: PanelExtras = {}): Promise<Setup> {
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
  render(<AiPanel controller={controller} onOpenSettings={onOpenSettings} {...extras} />);
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
  // A More options opened by one test stays open in local storage.
  globalThis.localStorage.clear();
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
    // No thinking line (ADR 0130 D5: one plain view).
    expect(within(answer).queryByText('Thinking')).toBeNull();
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
      /^This chat has cost about \$0\.\d\d so far\.$/,
    );
    await s.ai.emit(runId, { type: 'done', reason: 'end_turn' });
    expect(screen.queryByTestId('ai-stop')).toBeNull();
  });

  it('runs a tool request against the session and leaves a read out of the chat', async () => {
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
    // Reading has no plain line, so it is not shown (ADR 0130 D5).
    expect(() => lastMessage('tool')).toThrow('No tool message.');
  });

  it('shows a plan where it was proposed, says whose turn it is and takes a typed go', async () => {
    const s = await setup();
    const runId = await sendMessage(s, 'Build a ruby mod');
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
          ],
        },
      },
    });
    const entry = lastMessage('plan');
    expect(entry.dataset.closed).toBe('false');
    expect(within(entry).getByTestId('ai-plan')).toBeTruthy();
    expect(screen.getByTestId('ai-status').dataset.state).toBe('your-turn-plan');
    expect(screen.getByTestId('ai-status-text').textContent).toBe(
      'Your turn: choose what to do with the plan.',
    );
    expect(screen.queryByTestId('ai-stop')).toBeNull();
    const input = screen.getByTestId('ai-input');
    await s.user.type(input, 'go{Enter}');
    await s.ai.waitForResults(1);
    expect(JSON.parse(s.ai.results[0]?.result.content ?? '{}').decision).toBe('build_all');
    expect(s.ai.starts).toHaveLength(1);
    expect(lastMessage('user').textContent).toContain('go');
    await s.ai.emit(runId, { type: 'done', reason: 'end_turn' });
    const closed = within(lastMessage('plan')).getByTestId('ai-plan');
    expect(closed.dataset.closed).toBe('true');
    expect(closed.textContent).toBe('Plan: Ruby mod. 0 of 1 made.');
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
    // The tray is closed to its heading and two buttons; Apply waits for the run to end.
    const tray = await screen.findByTestId('ai-tray');
    expect(tray.dataset.open).toBe('false');
    expect(screen.queryByTestId('ai-changeset')).toBeNull();
    expect(screen.getByTestId('ai-tray-toggle').textContent).toBe('Ready to add: 1 change');
    expect((screen.getByTestId('ai-apply') as HTMLButtonElement).disabled).toBe(true);
    await s.ai.emit(runId, { type: 'done', reason: 'end_turn' });
    expect((screen.getByTestId('ai-apply') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId('ai-status-text').textContent).toBe(
      '1 change is ready. Nothing is in your mod yet.',
    );
    await s.user.click(screen.getByTestId('ai-status-look'));
    expect(screen.getByTestId('ai-tray').dataset.open).toBe('true');
    expect(screen.queryByTestId('ai-status-look')).toBeNull();
    const changeset = screen.getByTestId('ai-changeset');
    expect(changeset.textContent).toContain('Deleted elements (1)');
    const row = within(changeset).getAllByTestId(/^ai-change-item-\d+$/)[0] as HTMLElement;
    const itemId = row.dataset.testid?.replace('ai-change-', '') ?? '';
    const accept = screen.getByTestId(`ai-change-${itemId}-accept`) as HTMLInputElement;
    expect(accept.checked).toBe(true);
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
    await waitFor(() =>
      expect(lastMessage('notice').textContent).toBe('Made 1 change to your mod.'),
    );
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
    // The run limits are under the panel's More options (ADR 0130).
    await s.user.click(await screen.findByTestId('more-options-ai-panel'));
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
      message: 'It paused so the cost stays small.',
      limit: { toolTurns: 5, outputTokens: 100_000 },
    });
    expect(lastMessage('notice').textContent).toBe('It paused so the cost stays small.');
    expect(screen.getByTestId('ai-status-keep-going').textContent).toBe('Keep going');
    // The override was for that run only.
    expect(useAiStore.getState().conversations['/projects/demo']?.runLimits).toBeNull();
  });

  it('shows the set-up card, what is sent and Open Settings without a key', async () => {
    const s = await setup(fakeAi({ set: false, tail: null }));
    const missing = await screen.findByTestId('ai-key-missing');
    expect(missing.textContent).toContain('Where files are on your computer.');
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
    expect(context.textContent).toContain('something in Greet needs fixing');
    expect((screen.getByTestId('ai-input') as HTMLTextAreaElement).value).toBe(
      EXPLAIN_PROBLEM_TEXT,
    );
    await s.user.click(screen.getByTestId('ai-send'));
    await waitFor(() => expect(s.ai.starts).toHaveLength(1));
    expect(s.ai.starts[0]?.contextBlocks[1]).toContain('`schema.type` on `demo:greet`');
    expect(screen.queryByTestId('ai-context')).toBeNull();
  });

  it('shows the context block when asked, in the box and in the conversation', async () => {
    const s = await setup();
    await screen.findByTestId('ai-input');
    const block = 'Problem `schema.type` on `demo:greet`: Expected a string.';
    act(() =>
      s.controller.setDraft({ text: 'Explain it.', context: { label: 'About: Greet', block } }),
    );
    await screen.findByTestId('ai-context');
    expect(screen.queryByTestId('ai-context-block')).toBeNull();
    const show = screen.getByTestId('ai-context-show');
    expect(show.textContent).toBe('See exactly what is sent');
    expect(show.getAttribute('aria-expanded')).toBe('false');
    await s.user.click(show);
    expect(screen.getByTestId('ai-context-block').textContent).toBe(block);
    await s.user.click(screen.getByTestId('ai-send'));
    await waitFor(() => expect(s.ai.starts).toHaveLength(1));
    const user = screen
      .getByTestId('ai-transcript')
      .querySelector<HTMLElement>('[data-role="user"]');
    const sent = user?.querySelector<HTMLElement>('[data-testid$="-context-0"]');
    expect(sent?.textContent).toContain('About: Greet');
    expect(sent?.textContent).not.toContain('demo:greet');
    const again = sent?.querySelector<HTMLElement>('[data-testid$="-context-0-show"]');
    if (again) await s.user.click(again);
    expect(sent?.textContent).toContain(block);
  });

  it('labels a sent block in plain words only when its chip label holds no id', () => {
    rememberContextLabel('block one', 'About: Ruby Sword');
    rememberContextLabel('block two', 'Problem schema.type on demo:greet');
    expect(sentContextLabel('block one')).toBe('About: Ruby Sword');
    expect(sentContextLabel('block two')).toBe(SENT_CONTEXT_WORDS.unknown);
    expect(sentContextLabel('never sent')).toBe(SENT_CONTEXT_WORDS.unknown);
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
    expect(lastMessage('notice').textContent).toBe('Start a new chat to use Sonnet 5.5.');
  });
});

describe('AI helper panel helpers', () => {
  it('summarises only the plain tool entries', () => {
    expect(toolLine({ name: 'read_element', input: { id: 'ruby:ruby_ore' } })).toBeNull();
    expect(
      toolLine({
        name: 'run_checks',
        input: { scope: 'pending' },
        result: JSON.stringify({ counts: { error: 1, warning: 1, info: 0 } }),
      }),
    ).toBe('Checked: 2 problems to fix');
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

const ROOT = '/projects/demo';

/** Puts `conversation` in the store as the open project's, once the panel shows its input. */
async function show(conversation: AiConversation): Promise<void> {
  await screen.findByTestId('ai-input');
  act(() => useAiStore.setState({ conversations: { [ROOT]: conversation } }));
}

/** The panel's primary buttons. */
function primaries(): HTMLElement[] {
  return [...screen.getByTestId('ai-panel').querySelectorAll<HTMLElement>('[data-primary="true"]')];
}

describe('AiPanel by state', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it.each(AI_STATUS_STATES)('draws the state line of %s', async (state) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(12_000);
    await setup();
    const conversation = aiStateFixtures()[state];
    await show(conversation);
    const line = screen.getByTestId('ai-status');
    expect(line.dataset.state).toBe(state);
    const expected = statusWords(conversationStatus(conversation, 12_000));
    expect(screen.getByTestId('ai-status-text').textContent).toBe(expected.text);
    const buttons = within(line).queryAllByRole('button');
    expect(buttons.length).toBeLessThanOrEqual(1);
    if (expected.action !== null) expect(buttons[0]?.textContent).toBe(expected.action.label);
    // No Chat or Build switch.
    expect(screen.queryByTestId('ai-mode-chat')).toBeNull();
    expect(screen.queryByTestId('ai-mode-build')).toBeNull();
    // Exactly one primary button (a waiting plan's or step's own, B686).
    expect(primaries()).toHaveLength(1);
    // The message box stays usable while the user's answer is awaited.
    expect((screen.getByTestId('ai-input') as HTMLTextAreaElement).disabled).toBe(false);
    expect(screen.getByTestId('ai-new-conversation').textContent).toBe(wordsFor().newChat);
    // The run limits wait in the panel's More options (ADR 0130 D3).
    expect(screen.queryByTestId('ai-limits')).toBeNull();
    expect(screen.getByTestId('more-options-ai-panel')).toBeTruthy();
  });

  it('counts the seconds up once a second while the helper works', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(12_000);
    await setup();
    await show(aiStateFixtures().thinking);
    expect(screen.getByTestId('ai-status-text').textContent).toBe('Thinking… (12 s)');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('ai-status-text').textContent).toBe('Thinking… (13 s)');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId('ai-status-text').textContent).toBe('Thinking… (15 s)');
  });

  it('answers a waiting plan with typed text and keeps the box usable', async () => {
    const s = await setup();
    await show(aiStateFixtures()['your-turn-plan']);
    expect(s.controller.awaitsAnswer()).toBe(true);
    expect((screen.getByTestId('ai-input') as HTMLTextAreaElement).placeholder).toContain('go');
    await s.user.type(screen.getByTestId('ai-input'), 'make it red');
    expect((screen.getByTestId('ai-send') as HTMLButtonElement).disabled).toBe(false);
    await s.user.click(screen.getByTestId('ai-send'));
    const conversation = useAiStore.getState().conversations[ROOT];
    const plan = conversation === undefined ? null : latestPlan(conversation);
    expect(plan?.decision?.decision).toBe('revise');
    expect(plan?.decision?.comments).toBe('make it red');
    expect(s.ai.starts).toHaveLength(0);
  });

  it('fills the box from an example ask without sending, and a whole mod runs as a build', async () => {
    const s = await setup();
    const empty = await screen.findByTestId('ai-empty');
    expect(empty.textContent).toContain('What would you like to make?');
    const examples = within(empty).getAllByRole('button');
    expect(examples).toHaveLength(4);
    await s.user.click(screen.getByTestId('ai-example-0'));
    expect((screen.getByTestId('ai-input') as HTMLTextAreaElement).value).toBe('Make a ruby sword');
    expect(s.ai.starts).toHaveLength(0);
    await s.user.click(screen.getByTestId('ai-example-3'));
    await s.user.click(screen.getByTestId('ai-send'));
    await waitFor(() => expect(s.ai.starts).toHaveLength(1));
    expect(s.ai.starts[0]?.mode).toBe('build');
    expect(s.ai.starts[0]?.text).toMatch(/^Make a whole mod/);
  });

  it('says a new chat is not kept after closing the app (F19)', async () => {
    await setup();
    const empty = await screen.findByTestId('ai-empty');
    const line = within(empty).getByTestId('ai-not-saved');
    expect(line.textContent).toBe(
      'Chats are not saved: they last until you close MCSuperMods or start a new one.',
    );
    expect(forbiddenIn(line.textContent ?? '')).toEqual([]);
  });

  it('wires Try again, Keep going and Check my key', async () => {
    const s = await setup();
    await show(aiStateFixtures().failed);
    await s.user.click(screen.getByTestId('ai-status-try-again'));
    await waitFor(() => expect(s.ai.starts).toHaveLength(1));
    expect(s.ai.starts[0]?.text).toBe('Make ruby tools');

    cleanup();
    useAiStore.setState({ conversations: {} });
    const t = await setup();
    await show(aiStateFixtures().stopped);
    await t.user.click(screen.getByTestId('ai-status-keep-going'));
    await waitFor(() => expect(t.ai.starts).toHaveLength(1));
    expect(t.ai.starts[0]?.text).toBe('continue');

    cleanup();
    useAiStore.setState({ conversations: {} });
    const u = await setup();
    const keyless = applyEvent(aiStateFixtures().thinking, 'r', {
      type: 'done',
      reason: 'error',
      errorClass: 'AuthenticationError',
      message: 'invalid x-api-key',
    });
    await show(keyless);
    expect(screen.getByTestId('ai-status-text').textContent).toBe('Your key was not accepted.');
    await u.user.click(screen.getByTestId('ai-status-check-key'));
    expect(u.onOpenSettings).toHaveBeenCalledOnce();
  });

  it('opens the tray with Look and offers Stop while working', async () => {
    const s = await setup();
    await show(aiStateFixtures().making);
    expect(screen.getByTestId('ai-tray').dataset.open).toBe('false');
    await s.user.click(screen.getByTestId('ai-stop'));
    expect(s.ai.cancels).toEqual(['r']);
    act(() => useAiStore.setState({ conversations: { [ROOT]: aiStateFixtures().ready } }));
    expect(primaries().map((button) => button.dataset.testid)).toEqual(['ai-status-look']);
    await s.user.click(screen.getByTestId('ai-status-look'));
    expect(screen.getByTestId('ai-tray').dataset.open).toBe('true');
    expect(screen.getByTestId('ai-changeset')).toBeTruthy();
    await s.user.click(screen.getByTestId('ai-tray-toggle'));
    expect(screen.getByTestId('ai-tray').dataset.open).toBe('false');
  });

  it('offers Show me, Undo and Put back on an Apply only when the host handles them', async () => {
    const onShowMe = vi.fn();
    const s = await setup(fakeAi(), {
      onShowMe,
      onUndo: () => s.session.undo(),
      onRedo: () => s.session.redo(),
    });
    const runId = await sendMessage(s, 'Make a ruby sword');
    await s.ai.emit(runId, {
      type: 'tool_request',
      request: {
        requestId: 'c1',
        toolUseId: 't1',
        name: 'create_elements',
        input: {
          elements: [
            { id: 'demo:ruby_sword', kind: 'msm:item', data: { display_name: 'Ruby Sword' } },
          ],
        },
      },
    });
    await s.ai.waitForResults(1);
    await s.ai.emit(runId, { type: 'done', reason: 'end_turn' });
    await s.user.click(screen.getByTestId('ai-apply'));
    await waitFor(() =>
      expect(screen.getByTestId('ai-status-text').textContent).toBe(
        'Added 1 thing to your mod: Ruby Sword.',
      ),
    );
    await s.user.click(screen.getByTestId('ai-status-show-me'));
    expect(onShowMe).toHaveBeenCalledWith(
      expect.objectContaining({ createdIds: ['demo:ruby_sword'] }),
    );
    // The notice offers Undo; Show me is on the state line already.
    const notice = lastMessage('notice');
    expect(
      within(notice)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Undo']);
    await s.user.click(within(notice).getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(screen.getByTestId('ai-status-text').textContent).toBe('Taken out again.'),
    );
    await s.user.click(screen.getByTestId('ai-status-put-back'));
    await waitFor(() =>
      expect(screen.getByTestId('ai-status-text').textContent).toBe(
        'Put back in your mod: Ruby Sword.',
      ),
    );
  });

  it('leaves out Show me, Undo and Put back without the host', async () => {
    const s = await setup();
    const runId = await sendMessage(s, 'Make a ruby sword');
    await s.ai.emit(runId, {
      type: 'tool_request',
      request: {
        requestId: 'c1',
        toolUseId: 't1',
        name: 'create_elements',
        input: {
          elements: [
            { id: 'demo:ruby_sword', kind: 'msm:item', data: { display_name: 'Ruby Sword' } },
          ],
        },
      },
    });
    await s.ai.waitForResults(1);
    await s.ai.emit(runId, { type: 'done', reason: 'end_turn' });
    await s.user.click(screen.getByTestId('ai-apply'));
    await waitFor(() =>
      expect(lastMessage('notice').textContent).toBe('Added 1 thing to your mod: Ruby Sword.'),
    );
    expect(screen.queryByTestId('ai-status-show-me')).toBeNull();
    expect(within(lastMessage('notice')).queryAllByRole('button')).toHaveLength(0);
    expect(primaries().map((button) => button.dataset.testid)).toEqual(['ai-send']);
  });

  it('shows no thinking and no technical tool lines', async () => {
    const s = await setup();
    const runId = await sendMessage(s, 'Make a sword');
    await s.ai.emit(runId, { type: 'thinking_delta', text: 'A sword it is.' });
    await s.ai.emit(runId, { type: 'text_delta', text: 'Here it is.' });
    await s.ai.emit(runId, {
      type: 'tool_request',
      request: {
        requestId: 'r1',
        toolUseId: 't1',
        name: 'read_element',
        input: { id: 'demo:greet' },
      },
    });
    await s.ai.waitForResults(1);
    expect(screen.queryAllByTestId(/^ai-thinking-/)).toHaveLength(0);
    const tools = screen
      .getAllByTestId(/^ai-message-\d+$/)
      .filter((entry) => entry.dataset.role === 'tool');
    expect(tools).toHaveLength(0);
  });

  it('follows the newest entry, and says New below once the user has scrolled up', async () => {
    const s = await setup();
    const runId = await sendMessage(s, 'Hello');
    const scroller = screen.getByTestId('ai-conversation');
    let height = 1000;
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => height });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, get: () => 200 });
    // The newest entry starts 50 px above the end of the content.
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const top = this.hasAttribute('data-entry') ? height - 50 - scroller.scrollTop : 0;
        return {
          top,
          bottom: top,
          left: 0,
          right: 0,
          width: 0,
          height: 0,
          x: 0,
          y: top,
        } as DOMRect;
      });
    await s.ai.emit(runId, { type: 'text_delta', text: 'First words.' });
    expect(scroller.scrollTop).toBe(800);
    expect(screen.queryByTestId('ai-new-below')).toBeNull();
    // The user scrolls up: the next words do not pull the view down.
    act(() => {
      scroller.scrollTop = 100;
      scroller.dispatchEvent(new Event('scroll'));
    });
    height = 1200;
    await s.ai.emit(runId, { type: 'text_delta', text: ' More words.' });
    expect(scroller.scrollTop).toBe(100);
    await s.user.click(await screen.findByTestId('ai-new-below'));
    expect(scroller.scrollTop).toBe(1000);
    expect(screen.queryByTestId('ai-new-below')).toBeNull();
    rect.mockRestore();
  });

  it('picks the one primary button', () => {
    const fixtures = aiStateFixtures();
    const ready = conversationStatus(fixtures.ready, 0);
    expect(primaryOf(ready, false, true)).toBe('status');
    expect(primaryOf(ready, true, false)).toBe('tray');
    expect(primaryOf(conversationStatus(fixtures.idle, 0), false, false)).toBe('send');
    expect(primaryOf(conversationStatus(fixtures['your-turn-plan'], 0), false, true)).toBe('plan');
  });
});
