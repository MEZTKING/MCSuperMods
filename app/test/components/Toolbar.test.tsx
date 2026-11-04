// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from 'radix-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toolbar, type ToolbarProps } from '../../src/renderer/src/components/Toolbar';

afterEach(cleanup);

function props(overrides: Partial<ToolbarProps> = {}): ToolbarProps {
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
    onAddNamespace: vi.fn(),
    onAddElement: vi.fn(),
    ...overrides,
  };
}

function renderToolbar(p: ToolbarProps) {
  return render(
    <Tooltip.Provider>
      <Toolbar {...p} />
    </Tooltip.Provider>,
  );
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

describe('Toolbar', () => {
  it('disables Save, Add namespace and Add element without a project', () => {
    renderToolbar(
      props({ hasProject: false, canAddElement: false, saveDisabledReason: 'No project is open.' }),
    );
    expect(button('Save').disabled).toBe(true);
    expect(button('Add namespace').disabled).toBe(true);
    expect(button('Add element').disabled).toBe(true);
    expect(button('New').disabled).toBe(false);
    expect(button('Open').disabled).toBe(false);
  });

  it('enables Save with a project and reports clicks', async () => {
    const p = props({ canUndo: true, undoLabel: 'Add element' });
    renderToolbar(p);
    expect(button('Save').disabled).toBe(false);
    expect(button('Redo').disabled).toBe(true);
    const user = userEvent.setup();
    await user.click(button('Save'));
    await user.click(button('Undo'));
    expect(p.onSave).toHaveBeenCalledOnce();
    expect(p.onUndo).toHaveBeenCalledOnce();
  });

  it('is a labelled toolbar', () => {
    renderToolbar(props());
    expect(screen.getByRole('toolbar', { name: 'Project' })).toBeTruthy();
  });
});
