// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CommandPalette,
  filterCommands,
  fuzzyScore,
  type PaletteCommand,
} from '../../src/renderer/src/components/CommandPalette';

afterEach(cleanup);

function commands(): (PaletteCommand & { run: ReturnType<typeof vi.fn<() => void>> })[] {
  return [
    { id: 'save', title: 'Save project', shortcut: 'Ctrl+S', run: vi.fn<() => void>() },
    { id: 'exportDataPack', title: 'Export data pack', run: vi.fn<() => void>() },
    { id: 'exportResourcePack', title: 'Export resource pack', run: vi.fn<() => void>() },
    { id: 'settings', title: 'Settings', run: vi.fn<() => void>() },
  ];
}

function listed(): string[] {
  return screen.getAllByRole('option').map((option) => option.getAttribute('data-testid') ?? '');
}

describe('fuzzy filtering', () => {
  it('matches characters in order and ranks prefixes and word starts first', () => {
    expect(fuzzyScore('edp', 'Export data pack')).not.toBeNull();
    expect(fuzzyScore('pde', 'Export data pack')).toBeNull();
    expect(filterCommands(commands(), 'ex data').map((command) => command.id)).toEqual([
      'exportDataPack',
    ]);
    expect(filterCommands(commands(), 'set').map((command) => command.id)).toEqual([
      'settings',
      'save',
    ]);
    expect(filterCommands(commands(), '').map((command) => command.id)).toEqual([
      'save',
      'exportDataPack',
      'exportResourcePack',
      'settings',
    ]);
  });
});

describe('CommandPalette', () => {
  it('renders nothing while closed', () => {
    render(<CommandPalette open={false} commands={commands()} onClose={vi.fn()} />);
    expect(screen.queryByTestId('command-palette')).toBeNull();
  });

  it('filters as the user types and runs the first match on Enter', async () => {
    const list = commands();
    const onClose = vi.fn();
    render(<CommandPalette open commands={list} onClose={onClose} />);
    const user = userEvent.setup();
    const input = screen.getByTestId('command-palette-input');
    expect(document.activeElement).toBe(input);
    await user.type(input, 'export');
    expect(listed()).toEqual(['command-exportDataPack', 'command-exportResourcePack']);
    await user.keyboard('{Enter}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(list[1]?.run).toHaveBeenCalledOnce();
  });

  it('moves the selection with the arrow keys, wrapping around', async () => {
    const list = commands();
    render(<CommandPalette open commands={list} onClose={vi.fn()} />);
    const user = userEvent.setup();
    const selected = () =>
      screen
        .getAllByRole('option')
        .find((option) => option.getAttribute('aria-selected') === 'true')
        ?.getAttribute('data-testid');
    expect(selected()).toBe('command-save');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(selected()).toBe('command-exportResourcePack');
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(selected()).toBe('command-settings');
    await user.keyboard('{Enter}');
    expect(list[3]?.run).toHaveBeenCalledOnce();
  });

  it('runs a clicked command and shows shortcuts', async () => {
    const list = commands();
    render(<CommandPalette open commands={list} onClose={vi.fn()} />);
    expect(screen.getByTestId('command-save').textContent).toContain('Ctrl+S');
    await userEvent.setup().click(screen.getByTestId('command-settings'));
    expect(list[3]?.run).toHaveBeenCalledOnce();
  });

  it('closes on Escape without running anything', async () => {
    const list = commands();
    const onClose = vi.fn();
    render(<CommandPalette open commands={list} onClose={onClose} />);
    await userEvent.setup().keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    for (const command of list) expect(command.run).not.toHaveBeenCalled();
  });

  it('says when nothing matches', async () => {
    render(<CommandPalette open commands={commands()} onClose={vi.fn()} />);
    await userEvent.setup().type(screen.getByTestId('command-palette-input'), 'zzz');
    expect(screen.queryAllByRole('option')).toEqual([]);
    expect(screen.getByText('No matching commands.')).toBeTruthy();
  });
});
