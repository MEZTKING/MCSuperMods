// @vitest-environment happy-dom
import type { Element } from '@msm/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    // Said in plain words (ADR 0130 D2): sentence by sentence.
    expect(screen.getByTestId('element-notes-text').textContent).toBe('Line one. Line two.');
    expect(callout.querySelector('input, textarea, [contenteditable]')).toBeNull();
    await userEvent.setup().click(screen.getByTestId('element-notes-toggle'));
    expect(callout.open).toBe(false);
  });

  it('keeps the note as written under its More options when the plain one leaves part out', () => {
    window.msmMoreOptionsOpen = false;
    render(
      <EditorArea
        element={element('Mine it with a pickaxe. Its picture is textures/block/ruby_ore.png.')}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByTestId('element-notes-text').textContent).toBe('Mine it with a pickaxe.');
    expect(screen.queryByTestId('element-notes-full')).toBeNull();
    fireEvent.click(screen.getByTestId('more-options-element-notes'));
    expect(screen.getByTestId('element-notes-full').textContent).toContain('ruby_ore.png');
    cleanup();
    render(<EditorArea element={element('Line one.\nLine two.')} onApply={vi.fn()} />);
    expect(screen.queryByTestId('more-options-element-notes')).toBeNull();
    window.msmMoreOptionsOpen = true;
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
});

describe('EditorArea Try it (ADR 0085 D13)', () => {
  it('shows the Try it view instead of the element or Home', () => {
    render(
      <EditorArea
        element={element()}
        onApply={vi.fn()}
        home={<p>Home</p>}
        tryIt={<p data-testid="tryit-here">Try it</p>}
      />,
    );
    expect(screen.getByTestId('tryit-here')).toBeTruthy();
    expect(screen.queryByTestId('editor-studio')).toBeNull();
    cleanup();
    render(<EditorArea element={null} onApply={vi.fn()} home={<p>Home</p>} />);
    expect(screen.getByText('Home')).toBeTruthy();
  });
});

describe('one mode (ADR 0130 D2, D4)', () => {
  it('names the thing, never its id, until a More options is opened', async () => {
    window.msmMoreOptionsOpen = false;
    globalThis.localStorage.clear();
    try {
      const onChangeId = vi.fn();
      const onApply = vi.fn();
      render(
        <EditorArea
          element={element()}
          onApply={onApply}
          form={<p>Studio</p>}
          onChangeId={onChangeId}
          usedBy={() => [{ id: 'demo:other', name: 'Other' }]}
          filesOf={async () => ['datapack: data/demo/function/greet.mcfunction']}
        />,
      );
      expect(screen.getByTestId('editor-name').textContent).toBe('Greet');
      expect(screen.getByTestId('editor-form').textContent).not.toContain('demo:greet');
      expect(screen.getByTestId('new-here').textContent).toContain('commands');
      expect(screen.getByTestId('where-used-by-words').textContent).toBe('Used by Other.');
      const user = userEvent.setup();
      await user.click(screen.getByTestId('more-options-thing-name'));
      expect(screen.getByTestId('element-id').textContent).toBe('demo:greet');
      await user.click(screen.getByTestId('thing-change-id'));
      expect(onChangeId).toHaveBeenCalledWith('demo:greet');
      await user.click(screen.getByTestId('more-options-where-it-goes'));
      expect(screen.getByTestId('where-used-by').textContent).toContain('demo:other');
      await user.click(screen.getByTestId('where-files-show'));
      expect((await screen.findByTestId('where-files-list')).textContent).toContain('greet');
      await user.click(screen.getByTestId('more-options-where-raw-text'));
      expect(screen.getByTestId('where-raw-text')).toBeTruthy();
      // New here? goes once dismissed, for this kind.
      await user.click(screen.getByTestId('new-here-dismiss'));
      expect(screen.queryByTestId('new-here')).toBeNull();
    } finally {
      window.msmMoreOptionsOpen = true;
    }
  });

  it('opens Edit as raw text when the palette asks for it', () => {
    globalThis.localStorage.clear();
    render(<EditorArea element={element()} onApply={vi.fn()} tab="json" />);
    expect(screen.getByTestId('where-raw-text')).toBeTruthy();
  });
});
