// @vitest-environment happy-dom
import { DEFAULT_AI_SETTINGS } from '@msm/ai';
import type { Element } from '@msm/core';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiKeyMissing, READY_PAUSE_MS } from '../../src/renderer/src/components/ai/AiKeyMissing';
import { AiPanel } from '../../src/renderer/src/components/ai/AiPanel';
import { AiController, useAiPanelStore } from '../../src/renderer/src/components/ai/ai-controller';
import { EditorArea } from '../../src/renderer/src/components/EditorArea';
import { aiSession, fakeAi } from './ai-fixtures';

afterEach(() => {
  cleanup();
  delete (window as Partial<Window>).msm;
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
