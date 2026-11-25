// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from 'radix-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toolbar, type ToolbarProps } from '../../src/renderer/src/components/Toolbar';

/**
 * Tab into the toolbar row after a pointer press in it (B714): Radix's row keeps a "clicked"
 * flag from any mouse press in it until the row or a control takes the focus, so a press that
 * focused nothing in the row made the next Tab land on the row itself instead of a control.
 */

afterEach(cleanup);

function props(): ToolbarProps {
  return {
    hasProject: true,
    canUndo: false,
    canRedo: false,
    undoLabel: undefined,
    redoLabel: undefined,
    saveDisabledReason: null,
    canAddElement: true,
    onNew: vi.fn(),
    onOpen: vi.fn(),
    onSave: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onAddElement: vi.fn(),
    onHome: vi.fn(),
    onSettings: vi.fn(),
  };
}

function renderWithField() {
  render(
    <Tooltip.Provider>
      <input data-testid="before-row" />
      <Toolbar {...props()} />
    </Tooltip.Provider>,
  );
}

/** A macrotask, so a press's moment is over. */
const later = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

describe('Tab into the toolbar row (B714)', () => {
  it('lands on a control after a press in the row that focused nothing', async () => {
    renderWithField();
    const row = screen.getByTestId('toolbar');
    // A press on the row's separator: no control and not the row takes the focus.
    const separator = row.querySelector('[role="separator"]') as HTMLElement;
    fireEvent.pointerDown(separator);
    fireEvent.mouseDown(separator);
    fireEvent.mouseUp(separator);
    await later();
    screen.getByTestId('before-row').focus();
    await userEvent.setup().tab();
    expect(document.activeElement).not.toBe(row);
    expect(document.activeElement).toBe(screen.getByTestId('toolbar-home'));
  });

  it('lands on a control with no press before', async () => {
    renderWithField();
    screen.getByTestId('before-row').focus();
    await userEvent.setup().tab();
    expect(document.activeElement).toBe(screen.getByTestId('toolbar-home'));
  });

  it('a press on the row itself still focuses the row, as Radix does', () => {
    renderWithField();
    const row = screen.getByTestId('toolbar');
    fireEvent.pointerDown(row);
    fireEvent.mouseDown(row);
    row.focus();
    expect(document.activeElement).toBe(row);
  });
});
