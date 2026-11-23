// @vitest-environment happy-dom
import { DEFAULT_AI_SETTINGS } from '@msm/ai';
import type { Element, Project } from '@msm/core';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redoAiStep, showMeTarget, undoAiStep } from '../../src/renderer/src/App';
import { AiChangesetReview } from '../../src/renderer/src/components/ai/AiChangesetReview';
import { AiKeyMissing, READY_PAUSE_MS } from '../../src/renderer/src/components/ai/AiKeyMissing';
import { AiPanel } from '../../src/renderer/src/components/ai/AiPanel';
import { AiController, useAiPanelStore } from '../../src/renderer/src/components/ai/ai-controller';
import { EditorArea } from '../../src/renderer/src/components/EditorArea';
import type { AiAppliedStep, AiMadeThing } from '../../src/renderer/src/store/ai-store';
import { useAiStore } from '../../src/renderer/src/store/ai-store';
import { usePreferences } from '../../src/renderer/src/store/preferences';
import { useUiStore } from '../../src/renderer/src/store/ui-store';
import { aiSession, type FakeAi, fakeAi } from './ai-fixtures';

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

afterEach(() => {
  cleanup();
  delete (window as Partial<Window>).msm;
  usePreferences.setState({ mode: 'advanced' });
});

const element: Element = {
  id: 'demo:greet',
  kind: 'minecraft:function',
  formatVersion: 1,
  data: { lines: ['say hi'] },
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
};

describe('EditorArea "Ask AI" (ADR 0041 D8)', () => {
  it('asks about the element from the editor header', async () => {
    const onAskAi = vi.fn();
    render(<EditorArea element={element} onApply={vi.fn()} onAskAi={onAskAi} />);
    const button = screen.getByTestId('editor-ask-ai');
    expect(button.textContent).toBe('Ask AI');
    await userEvent.setup().click(button);
    expect(onAskAi).toHaveBeenCalledWith('demo:greet');
  });

  it('hides "Ask AI" without onAskAi', () => {
    render(<EditorArea element={element} onApply={vi.fn()} />);
    expect(screen.queryByTestId('editor-ask-ai')).toBeNull();
  });
});

const KEY = 'sk-ant-panel-1111-qrst';

describe('The AI panel without a key (ADR 0125 D5)', () => {
  it('shows the set-up card in place and goes on to the chat once the key works', async () => {
    const ai = fakeAi({ set: false, tail: null });
    // The panel's card reaches main through the preload bridge, as in the app.
    (window as unknown as { msm: { ai: typeof ai } }).msm = { ai };
    const { session } = await aiSession();
    const controller = new AiController({
      session,
      ai,
      loadSettings: async () => ({
        minecraftDir: null,
        updates: { autoCheck: true },
        detectedMinecraftDir: null,
        ai: { ...DEFAULT_AI_SETTINGS, model: 'claude-haiku-5-5' },
      }),
      newId: () => 'id-1',
    });
    controller.attach();
    const onOpenSettings = vi.fn();
    render(<AiPanel controller={controller} onOpenSettings={onOpenSettings} />);
    const user = userEvent.setup();
    const missing = await screen.findByTestId('ai-key-missing');
    expect(missing.querySelector('[data-testid="ai-setup"]')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('ai-setup-cost').textContent).toContain('Claude Haiku 5.5'),
    );
    expect(screen.getByTestId('ai-setup-sent').textContent).toContain(
      'Where files are on your computer.',
    );

    // A wrong key is said at once and the card stays.
    ai.testResult = { ok: false, error: 'invalid x-api-key', errorClass: 'AuthenticationError' };
    await user.type(screen.getByTestId('ai-setup-key'), KEY);
    await user.click(screen.getByTestId('ai-setup-save'));
    await waitFor(() =>
      expect(screen.getByTestId('ai-setup-result').textContent).toMatch(
        /^Your key was not accepted\./,
      ),
    );
    expect(screen.queryByTestId('ai-input')).toBeNull();

    // A right one: the card says so, then the panel goes on to the chat.
    ai.testResult = { ok: true, model: 'claude-haiku-5-5' };
    await user.type(screen.getByTestId('ai-setup-key'), KEY);
    await user.click(screen.getByTestId('ai-setup-save'));
    await waitFor(() =>
      expect(screen.getByTestId('ai-setup-result').textContent).toBe(
        'The key works. You can start.',
      ),
    );
    expect(
      await screen.findByTestId('ai-input', {}, { timeout: READY_PAUSE_MS + 2000 }),
    ).toBeTruthy();
    expect(useAiPanelStore.getState().keyStatus?.set).toBe(true);
    expect(document.body.textContent).not.toContain(KEY);
  });

  it('opens Settings on the helper from All AI helper settings', async () => {
    const onOpenSettings = vi.fn();
    render(
      <AiKeyMissing onOpenSettings={onOpenSettings} ai={fakeAi({ set: false, tail: null })} />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'All AI helper settings' }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it('hands a passed check to the host after a short pause', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onReady = vi.fn();
      render(
        <AiKeyMissing
          onOpenSettings={vi.fn()}
          ai={fakeAi({ set: false, tail: null })}
          onReady={onReady}
        />,
      );
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.type(screen.getByTestId('ai-setup-key'), KEY);
      await user.click(screen.getByTestId('ai-setup-save'));
      await waitFor(() =>
        expect(screen.getByTestId('ai-setup-result').textContent).toBe(
          'The key works. You can start.',
        ),
      );
      expect(onReady).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(READY_PAUSE_MS);
      });
      expect(onReady).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});

// After adding (ADR 0125 D4, B689) --------------------------------------------------------

function made(id: string, name: string, op: AiMadeThing['op'] = 'added'): AiMadeThing {
  return { id, name, what: 'Item', op };
}

function stepOf(things: readonly AiMadeThing[]): AiAppliedStep {
  return {
    label: 'Apply AI helper changes',
    things,
    changes: things.length,
    skipped: 0,
    createdIds: things.map((thing) => thing.id),
    phase: 'added',
    onTop: true,
    addedText: '',
  };
}

function elementOf(id: string, creator = false): Element {
  return {
    id: id as Element['id'],
    kind: 'msm:item',
    formatVersion: 1,
    data: {},
    meta: {
      createdAt: '2026-01-01T00:00:00.000Z',
      ...(creator
        ? {
            creator: {
              flowId: 'gear-set',
              setId: 'set-1',
              values: {},
              generatedId: id,
            },
          }
        : {}),
    },
  } as Element;
}

/** A project with a plain sword, a pickaxe made by a Creator set, and an axe. */
const MADE: Project = {
  namespaces: [
    {
      namespace: 'demo',
      elements: [
        elementOf('demo:ruby_sword'),
        elementOf('demo:ruby_pickaxe', true),
        elementOf('demo:ruby_axe'),
      ],
    },
  ],
} as unknown as Project;

describe('Show me after adding (ADR 0125 D4)', () => {
  const sword = made('demo:ruby_sword', 'Ruby Sword');
  const pickaxe = made('demo:ruby_pickaxe', 'Ruby Pickaxe');
  const axe = made('demo:ruby_axe', 'Ruby Axe');

  it.each(['very-easy', 'easy', 'advanced'] as const)(
    'opens one thing in its Studio in %s',
    (mode) => {
      expect(showMeTarget(stepOf([sword]), MADE, mode)).toEqual({
        type: 'open',
        id: 'demo:ruby_sword',
      });
    },
  );

  it('opens a Creator set in the Creator in Very easy, and in its Studio otherwise', () => {
    const target = showMeTarget(stepOf([pickaxe]), MADE, 'very-easy');
    expect(target?.type).toBe('creator');
    expect(target?.type === 'creator' ? target.element.id : null).toBe('demo:ruby_pickaxe');
    for (const mode of ['easy', 'advanced'] as const) {
      expect(showMeTarget(stepOf([pickaxe]), MADE, mode)).toEqual({
        type: 'open',
        id: 'demo:ruby_pickaxe',
      });
    }
  });

  it("opens Home's My things for several in Very easy and selects the first otherwise", () => {
    const step = stepOf([sword, pickaxe, axe]);
    expect(showMeTarget(step, MADE, 'very-easy')).toEqual({ type: 'my-things' });
    for (const mode of ['easy', 'advanced'] as const) {
      expect(showMeTarget(step, MADE, mode)).toEqual({ type: 'select', id: 'demo:ruby_sword' });
    }
  });

  it('leaves out things taken out or no longer in the project', () => {
    const gone = made('demo:ruby_hoe', 'Ruby Hoe');
    const removed = made('demo:ruby_sword', 'Ruby Sword', 'removed');
    // Only the axe is left: one thing, so it opens.
    expect(showMeTarget(stepOf([gone, removed, axe]), MADE, 'very-easy')).toEqual({
      type: 'open',
      id: 'demo:ruby_axe',
    });
    expect(showMeTarget(stepOf([gone, removed]), MADE, 'easy')).toBeNull();
    expect(showMeTarget(stepOf([sword]), null, 'advanced')).toBeNull();
  });
});

async function emitSword(ai: FakeAi, runId: string): Promise<void> {
  await ai.emit(runId, {
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
  await ai.waitForResults(1);
  await ai.emit(runId, { type: 'done', reason: 'end_turn' });
}

describe("Undo and Put back of the helper's step (ADR 0125 D4)", () => {
  it.each(['very-easy', 'easy', 'advanced'] as const)(
    'offers Undo while the step is on top, and not after another edit, in %s',
    async (mode) => {
      usePreferences.setState({ mode });
      const ai = fakeAi();
      const { session } = await aiSession();
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
      const onShowMe = vi.fn();
      render(
        <AiPanel
          controller={controller}
          onOpenSettings={vi.fn()}
          onShowMe={onShowMe}
          onUndo={() => undoAiStep(session)}
          onRedo={() => redoAiStep(session)}
        />,
      );
      const user = userEvent.setup();
      await user.type(await screen.findByTestId('ai-input'), 'Make a ruby sword');
      await user.click(screen.getByTestId('ai-send'));
      await waitFor(() => expect(ai.starts.length).toBe(1));
      // The run's size comes from the caller, chat unless a whole build (D2).
      expect(ai.starts[0]?.mode).toBe('chat');
      await emitSword(ai, ai.starts[0]?.runId ?? '');
      await user.click(screen.getByTestId('ai-apply'));
      await waitFor(() => expect(session.snapshot.undoLabel).toBe('Apply AI helper changes'));
      const notice = () => {
        const all = screen
          .getAllByTestId(/^ai-message-\d+$/)
          .filter((entry) => entry.dataset.role === 'notice');
        return all[all.length - 1] as HTMLElement;
      };
      await waitFor(() =>
        expect(within(notice()).queryByRole('button', { name: 'Undo' })).not.toBeNull(),
      );
      await user.click(screen.getByTestId('ai-status-show-me'));
      expect(onShowMe).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ createdIds: ['demo:ruby_sword'] }),
      );

      // Undo and Put back go through the session's stack.
      await user.click(within(notice()).getByRole('button', { name: 'Undo' }));
      await waitFor(() => expect(session.snapshot.redoLabel).toBe('Apply AI helper changes'));
      await user.click(await screen.findByTestId('ai-status-put-back'));
      await waitFor(() => expect(session.snapshot.undoLabel).toBe('Apply AI helper changes'));
      await waitFor(() =>
        expect(within(notice()).queryByRole('button', { name: 'Undo' })).not.toBeNull(),
      );

      // Another edit is now on top: Undo is no longer offered, and the host would refuse it.
      act(() => {
        session.addElement({
          id: 'demo:other',
          kind: 'minecraft:function',
          data: { lines: ['say other'] },
        });
      });
      await waitFor(() =>
        expect(within(notice()).queryByRole('button', { name: 'Undo' })).toBeNull(),
      );
      expect(screen.queryByTestId('ai-status-undo')).toBeNull();
      expect(undoAiStep(session)).toBe(false);
      expect(session.snapshot.undoLabel).not.toBe('Apply AI helper changes');
    },
  );

  it('refuses Undo and Put back when the stack holds another step', async () => {
    const { session } = await aiSession();
    expect(undoAiStep(session)).toBe(false);
    expect(redoAiStep(session)).toBe(false);
  });
});

describe("The open tray's Add is the primary button (B685's note)", () => {
  it('marks Add primary while no run is open, and not while one is', () => {
    const props = {
      items: [],
      project: null,
      mode: 'very-easy' as const,
      applying: false,
      onToggle: vi.fn(),
      onApply: vi.fn(),
      onDiscard: vi.fn(),
    };
    const first = render(<AiChangesetReview {...props} running={false} />);
    expect(screen.getByTestId('ai-apply').dataset.primary).toBe('true');
    first.unmount();
    const second = render(<AiChangesetReview {...props} running />);
    expect(screen.getByTestId('ai-apply').dataset.primary).toBe('false');
    second.unmount();
    render(<AiChangesetReview {...props} running={false} primary={false} />);
    expect(screen.getByTestId('ai-apply').dataset.primary).toBe('false');
  });
});
