// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { locateJsonError } from '../../src/renderer/src/components/json-editor/json-error';
import { RawJsonPanel } from '../../src/renderer/src/components/RawJsonPanel';
import { element } from './fixtures';

beforeAll(() => {
  window.msmNoMonaco = true;
});
afterAll(() => {
  delete window.msmNoMonaco;
});
afterEach(cleanup);

function textarea(): HTMLTextAreaElement {
  return screen.getByLabelText(/Data of/) as HTMLTextAreaElement;
}

describe('RawJsonPanel', () => {
  it('asks for a selection without an element', () => {
    render(<RawJsonPanel element={null} onApply={vi.fn()} />);
    expect(screen.getByText(/Select an element/)).toBeTruthy();
  });

  it('falls back to a textarea when Monaco is disabled', () => {
    render(<RawJsonPanel element={element('demo:ruby', 'k', { a: 1 })} onApply={vi.fn()} />);
    expect(textarea().tagName).toBe('TEXTAREA');
    expect(JSON.parse(textarea().value)).toEqual({ a: 1 });
    expect(screen.queryByTestId('monaco-host')).toBeNull();
  });

  it('applies valid JSON', async () => {
    const onApply = vi.fn();
    render(<RawJsonPanel element={element('demo:ruby', 'k', { a: 1 })} onApply={onApply} />);
    const apply = screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    const user = userEvent.setup();
    await user.clear(textarea());
    await user.type(textarea(), '{{"b": [[2]}');
    await user.click(apply);
    expect(onApply).toHaveBeenCalledWith('demo:ruby', { b: [2] });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports invalid JSON with its location and does not apply it', async () => {
    const onApply = vi.fn();
    render(<RawJsonPanel element={element('demo:ruby', 'k', { a: 1 })} onApply={onApply} />);
    const user = userEvent.setup();
    await user.clear(textarea());
    await user.type(textarea(), '{{"a": }');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/^Invalid JSON \(line 1, column \d+\)/);
    expect(textarea().getAttribute('aria-invalid')).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Revert' }));
    expect(JSON.parse(textarea().value)).toEqual({ a: 1 });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('resets the draft when the element data changes from outside', async () => {
    const { rerender } = render(
      <RawJsonPanel element={element('demo:ruby', 'k', { a: 1 })} onApply={vi.fn()} />,
    );
    const user = userEvent.setup();
    await user.type(textarea(), ' ');
    rerender(<RawJsonPanel element={element('demo:ruby', 'k', { a: 2 })} onApply={vi.fn()} />);
    expect(JSON.parse(textarea().value)).toEqual({ a: 2 });
  });
});

describe('locateJsonError', () => {
  it('reads line and column from the message', () => {
    expect(locateJsonError('', 'Bad (line 3 column 7)')).toEqual({
      message: 'Bad',
      line: 3,
      column: 7,
    });
  });

  it('converts a position to line and column', () => {
    expect(locateJsonError('{\n  x', 'Unexpected token at position 4')).toMatchObject({
      line: 2,
      column: 3,
    });
  });

  it('points at the end of the text otherwise', () => {
    expect(locateJsonError('{\n"a":', 'Unexpected end of JSON input')).toMatchObject({
      line: 2,
      column: 5,
    });
  });
});
