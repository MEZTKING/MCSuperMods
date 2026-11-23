// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChoiceDialog } from '../../src/renderer/src/components/ChoiceDialog';

afterEach(cleanup);

const choices = [
  { id: 'weapon', title: 'Weapon', sentence: 'Crafting ingredient' },
  { id: 'extra_drop', title: 'Extra drop' },
];

describe('ChoiceDialog (B667)', () => {
  it('lists the named choices and gives back the one picked', async () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(
      <ChoiceDialog
        title="Make something with Emerald"
        lead="Pick one."
        choices={choices}
        onPick={onPick}
        onClose={onClose}
      />,
    );
    const dialog = screen.getByTestId('choice-dialog');
    expect(screen.getByRole('dialog', { name: 'Make something with Emerald' })).toBe(dialog);
    expect(dialog.textContent).toContain('Pick one.');
    expect(screen.getByTestId('choice-0').textContent).toBe('WeaponCrafting ingredient');
    expect(screen.getByTestId('choice-1').textContent).toBe('Extra drop');
    await userEvent.setup().click(screen.getByTestId('choice-1'));
    expect(onPick).toHaveBeenCalledWith(choices[1]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Cancel and on Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <ChoiceDialog
        title="What is the rule about?"
        choices={choices}
        onPick={vi.fn()}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByTestId('choice-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    render(
      <ChoiceDialog
        title="What is the rule about?"
        choices={choices}
        onPick={vi.fn()}
        onClose={onClose}
      />,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
