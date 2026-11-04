// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FUNCTION_EDIT_DEBOUNCE_MS,
  FUNCTION_SOURCE_COALESCE,
  type FunctionCompletion,
  FunctionEditor,
} from '../../src/renderer/src/studios/FunctionEditor';

beforeEach(() => {
  window.msmNoMonaco = true;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.msmNoMonaco;
});

/** `\$(name) ${1:x}`: an escaped macro argument and a placeholder (`%` stands for `$`). */
const MACRO_SNIPPET = '\\%(name) %{1:x}'.replaceAll('%', '$');

function area(): HTMLTextAreaElement {
  return screen.getByTestId('function-editor-fallback') as HTMLTextAreaElement;
}

describe('FunctionEditor (textarea fallback)', () => {
  it('shows the lines as source text', () => {
    render(<FunctionEditor lines={['say hi', 'tp @s ~ ~1 ~']} onChange={vi.fn()} />);
    expect(screen.getByTestId('function-editor')).toBeTruthy();
    expect(area().value).toBe('say hi\ntp @s ~ ~1 ~');
  });

  it('debounces edits into one coalesced /lines change', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<FunctionEditor lines={['say hi']} onChange={onChange} />);
    fireEvent.change(area(), { target: { value: 'say hi\nsa' } });
    fireEvent.change(area(), { target: { value: 'say hi\r\nsay bye' } });
    act(() => vi.advanceTimersByTime(FUNCTION_EDIT_DEBOUNCE_MS - 1));
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('/lines', ['say hi', 'say bye'], {
      coalesce: FUNCTION_SOURCE_COALESCE,
    });
  });

  it('reports a pending edit when it unmounts', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const view = render(<FunctionEditor lines={['']} onChange={onChange} />);
    fireEvent.change(area(), { target: { value: 'kill @e' } });
    view.unmount();
    expect(onChange).toHaveBeenCalledWith('/lines', ['kill @e'], {
      coalesce: FUNCTION_SOURCE_COALESCE,
    });
  });

  it('keeps the draft when its own edit comes back and resets on outside changes', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const view = render(<FunctionEditor lines={['a']} onChange={onChange} />);
    fireEvent.change(area(), { target: { value: 'ab' } });
    act(() => vi.advanceTimersByTime(FUNCTION_EDIT_DEBOUNCE_MS));
    fireEvent.change(area(), { target: { value: 'abc' } });
    // The echo of "ab" arrives while "abc" is still pending.
    view.rerender(<FunctionEditor lines={['ab']} onChange={onChange} />);
    expect(area().value).toBe('abc');
    act(() => vi.advanceTimersByTime(FUNCTION_EDIT_DEBOUNCE_MS));
    view.rerender(<FunctionEditor lines={['abc']} onChange={onChange} />);
    expect(area().value).toBe('abc');
    // Undo elsewhere.
    view.rerender(<FunctionEditor lines={['a']} onChange={onChange} />);
    expect(area().value).toBe('a');
  });

  it('lists line problems and other problems', () => {
    render(
      <FunctionEditor
        lines={['say hi', 'tp @s 1 2']}
        onChange={vi.fn()}
        problems={[
          {
            path: '/lines/1',
            message: 'Expected a float',
            severity: 'error',
            range: { start: 9, end: 9 },
          },
          { path: '', message: 'Function file problem', severity: 'warning' },
        ]}
      />,
    );
    expect(area().getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Line 2: Expected a float')).toBeTruthy();
    expect(screen.getByText('Function file problem')).toBeTruthy();
  });

  it('completes on Ctrl+Space and inserts the unescaped snippet text', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const complete = vi.fn(
      async (_source: string, _offset: number): Promise<FunctionCompletion[]> => [
        { label: 'minecraft:stone', insertText: 'minecraft:stone', kind: 'value' },
        { label: 'macro', insertText: MACRO_SNIPPET, kind: 'snippet' },
      ],
    );
    render(<FunctionEditor lines={['give @s sto']} onChange={onChange} complete={complete} />);
    const editor = area();
    editor.focus();
    editor.setSelectionRange(11, 11);
    await act(async () => {
      fireEvent.keyDown(editor, { key: ' ', ctrlKey: true });
    });
    expect(complete).toHaveBeenCalledWith('give @s sto', 11);
    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['minecraft:stone', 'macro']);
    fireEvent.keyDown(editor, { key: 'ArrowDown' });
    fireEvent.keyDown(editor, { key: 'ArrowUp' });
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(area().value).toBe('give @s minecraft:stone');
    expect(screen.queryAllByRole('option')).toEqual([]);
    act(() => vi.advanceTimersByTime(FUNCTION_EDIT_DEBOUNCE_MS));
    expect(onChange).toHaveBeenLastCalledWith('/lines', ['give @s minecraft:stone'], {
      coalesce: FUNCTION_SOURCE_COALESCE,
    });
  });

  it('inserts a macro snippet as plain text and closes on Escape', async () => {
    const complete = async (): Promise<FunctionCompletion[]> => [
      { label: 'macro', insertText: MACRO_SNIPPET, kind: 'snippet' },
    ];
    render(<FunctionEditor lines={['say ']} onChange={vi.fn()} complete={complete} />);
    const editor = area();
    editor.setSelectionRange(4, 4);
    await act(async () => {
      fireEvent.keyDown(editor, { key: ' ', ctrlKey: true });
    });
    fireEvent.mouseDown(screen.getByRole('option', { name: /macro/ }));
    expect(area().value).toBe('say $(name) x');
    await act(async () => {
      fireEvent.keyDown(editor, { key: ' ', ctrlKey: true });
    });
    fireEvent.keyDown(editor, { key: 'Escape' });
    expect(screen.queryAllByRole('option')).toEqual([]);
  });
});
