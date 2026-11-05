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

describe('EditorArea Creator entry points (ADR 0043)', () => {
  it('shows "Edit in Creator" only for elements with meta.creator', async () => {
    const onEditInCreator = vi.fn();
    render(<EditorArea element={element()} onApply={vi.fn()} onEditInCreator={onEditInCreator} />);
    expect(screen.queryByTestId('editor-edit-in-creator')).toBeNull();
    cleanup();
    const made = element();
    made.meta.creator = {
      flowId: 'gear-set',
      setId: 'set-1',
      values: { material_name: 'Ruby' },
      generatedId: 'demo:greet',
    };
    render(<EditorArea element={made} onApply={vi.fn()} onEditInCreator={onEditInCreator} />);
    const button = screen.getByTestId('editor-edit-in-creator');
    expect(button.textContent).toBe('Edit in Creator');
    await userEvent.setup().click(button);
    expect(onEditInCreator).toHaveBeenCalledWith(made);
  });

  it('offers the Creator when nothing is selected', async () => {
    const onOpenCreator = vi.fn();
    render(<EditorArea element={null} onApply={vi.fn()} onOpenCreator={onOpenCreator} />);
    const link = screen.getByTestId('editor-open-creator');
    expect(link.textContent).toBe('or Create something with the Creator');
    await userEvent.setup().click(link);
    expect(onOpenCreator).toHaveBeenCalledOnce();
  });
});
