// @vitest-environment happy-dom
import type { Element } from '@msm/core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorArea } from '../../src/renderer/src/components/EditorArea';

afterEach(cleanup);

function element(notes?: string): Element {
  const meta: Element['meta'] = { createdAt: '2026-01-01T00:00:00.000Z' };
  if (notes !== undefined) meta.notes = notes;
  return {
    id: 'demo:greet',
    kind: 'minecraft:function',
    formatVersion: 1,
    data: { lines: [] },
    meta,
  };
}

describe('EditorArea notes callout', () => {
  it('shows meta.notes read-only in an open, collapsible callout', async () => {
    render(<EditorArea element={element('Line one.\nLine two.')} onApply={vi.fn()} />);
    const callout = screen.getByTestId('element-notes') as HTMLDetailsElement;
    expect(callout.open).toBe(true);
    expect(screen.getByTestId('element-notes-text').textContent).toBe('Line one.\nLine two.');
    expect(callout.querySelector('input, textarea, [contenteditable]')).toBeNull();
    await userEvent.setup().click(screen.getByTestId('element-notes-toggle'));
    expect(callout.open).toBe(false);
  });

  it('has no callout without notes', () => {
    render(<EditorArea element={element()} onApply={vi.fn()} />);
    expect(screen.queryByTestId('element-notes')).toBeNull();
    cleanup();
    render(<EditorArea element={element('  ')} onApply={vi.fn()} />);
    expect(screen.queryByTestId('element-notes')).toBeNull();
  });
});
