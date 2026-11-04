// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  sortWorlds,
  type WorldOption,
  WorldPickerDialog,
} from '../../src/renderer/src/components/WorldPickerDialog';

afterEach(cleanup);

const worlds: WorldOption[] = [
  { dir: 'Old World', name: 'Old World', lastModified: '2026-01-01T10:00:00.000Z' },
  { dir: 'New World (1)', name: 'New World (1)', lastModified: '2026-10-30T18:30:00.000Z' },
  { dir: 'Survival', name: 'Survival', lastModified: '2026-06-15T08:00:00.000Z' },
];

describe('WorldPickerDialog', () => {
  it('sorts worlds newest first', () => {
    expect(sortWorlds(worlds).map((world) => world.dir)).toEqual([
      'New World (1)',
      'Survival',
      'Old World',
    ]);
  });

  it('renders nothing while closed', () => {
    render(<WorldPickerDialog open={false} worlds={worlds} onPick={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByTestId('world-picker')).toBeNull();
  });

  it('preselects the newest world and picks the chosen one', async () => {
    const onPick = vi.fn();
    render(<WorldPickerDialog open worlds={worlds} onPick={onPick} onClose={vi.fn()} />);
    const user = userEvent.setup();
    const newest = screen.getByTestId('world-row-New World (1)').querySelector('input');
    expect(newest?.checked).toBe(true);
    await user.click(screen.getByTestId('world-row-Survival'));
    await user.click(screen.getByTestId('world-picker-submit'));
    expect(onPick).toHaveBeenCalledExactlyOnceWith(worlds[2]);
  });

  it('cancels with Escape', async () => {
    const onClose = vi.fn();
    render(<WorldPickerDialog open worlds={worlds} onPick={vi.fn()} onClose={onClose} />);
    await userEvent.setup().keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('explains when there are no worlds and disables Install', () => {
    render(<WorldPickerDialog open worlds={[]} onPick={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/No worlds found/)).toBeTruthy();
    expect((screen.getByTestId('world-picker-submit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('names the game location in the title and the empty state', () => {
    const name = 'Prism Launcher — My Instance';
    const { rerender } = render(
      <WorldPickerDialog
        open
        worlds={worlds}
        onPick={vi.fn()}
        onClose={vi.fn()}
        locationName={name}
      />,
    );
    expect(
      screen.getByRole('dialog', { name: `Install data pack to a world — ${name}` }),
    ).toBeTruthy();
    rerender(
      <WorldPickerDialog open worlds={[]} onPick={vi.fn()} onClose={vi.fn()} locationName={name} />,
    );
    expect(screen.getByTestId('world-picker-empty').textContent).toBe(
      `No worlds found in ${name}. Create a singleplayer world there first.`,
    );
  });
});
