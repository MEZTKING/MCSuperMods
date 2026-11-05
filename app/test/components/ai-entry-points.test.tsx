// @vitest-environment happy-dom
import type { Element } from '@msm/core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorArea } from '../../src/renderer/src/components/EditorArea';

afterEach(cleanup);

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
