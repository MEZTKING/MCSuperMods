// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from 'radix-ui';
import { afterEach, describe, expect, it } from 'vitest';
import { PlayControls } from '../../src/renderer/src/components/play/PlayControls';
import { PrismSetupPanel } from '../../src/renderer/src/components/play/PrismSetupPanel';
import { RestartNeededDialog } from '../../src/renderer/src/components/play/RestartNeededDialog';
import { connectPlay, usePlayStore } from '../../src/renderer/src/store/play-store';
import {
  CHIP_LABELS,
  type FakeBridge,
  type FakeSession,
  fakeBridge,
  fakeSession,
  RESTART_NEEDED,
  RESTART_REASONS,
  reloadOk,
  statusFor,
} from './play-fixtures';

let disconnect: (() => void) | null = null;

afterEach(() => {
  cleanup();
  disconnect?.();
  disconnect = null;
});

async function mount(
  bridge: FakeBridge = fakeBridge(),
  session: FakeSession = fakeSession(),
): Promise<{ bridge: FakeBridge; session: FakeSession }> {
  disconnect = connectPlay(session, bridge, { notify: () => {}, showProblems: () => {} });
  render(
    <Tooltip.Provider>
      <PlayControls />
    </Tooltip.Provider>,
  );
  await waitFor(() => expect(usePlayStore.getState().status).not.toBeNull());
  return { bridge, session };
}

describe('PlayControls', () => {
  it('renders nothing before it is connected or without a project', async () => {
    const { container } = render(<PlayControls />);
    expect(container.innerHTML).toBe('');
    cleanup();
    disconnect = connectPlay(fakeSession({ project: null }), fakeBridge());
    const second = render(<PlayControls />);
    expect(second.container.innerHTML).toBe('');
  });

  const chips = [
    ['no-prism', CHIP_LABELS['no-prism'], 'Prism Launcher not found'],
    ['not-running', CHIP_LABELS['not-running'], 'Game not running'],
    ['starting', CHIP_LABELS.starting, 'Starting…'],
    ['test-world', CHIP_LABELS['test-world'], 'In the test world'],
    ['other-world', CHIP_LABELS['other-world'], 'In another world'],
  ] as const;

  for (const [state, label, words] of chips) {
    it(`shows the chip "${words}"`, async () => {
      expect(label).toBe(words);
      await mount(fakeBridge(statusFor(state)));
      const chip = screen.getByTestId('play-chip');
      expect(chip.textContent).toBe(words);
      expect(chip.getAttribute('data-state')).toBe(state);
    });
  }

  it('shows the chip "Restart needed" and opens the reasons from it', async () => {
    expect(RESTART_NEEDED).toBe('Restart needed');
    await mount(fakeBridge(statusFor('test-world', { restart: true })));
    const chip = screen.getByTestId('play-chip');
    expect(chip.textContent).toBe('Restart needed');
    expect(chip.getAttribute('data-state')).toBe('restart-needed');
    fireEvent.click(chip);
    const dialog = await screen.findByTestId('play-restart-dialog');
    expect(within(dialog).getByText(RESTART_REASONS[0]?.text as string)).toBeTruthy();
  });

  it('shows "Checking the game…" before the first status', async () => {
    const bridge = fakeBridge();
    bridge.play.status.mockImplementation(() => new Promise(() => {}));
    disconnect = connectPlay(fakeSession(), bridge);
    render(
      <Tooltip.Provider>
        <PlayControls />
      </Tooltip.Provider>,
    );
    const chip = screen.getByTestId('play-chip');
    expect(chip.textContent).toBe('Checking the game…');
    expect(chip.getAttribute('data-state')).toBe('checking');
  });

  it('follows pushed statuses', async () => {
    const { bridge } = await mount();
    act(() => bridge.push(statusFor('starting')));
    expect(screen.getByTestId('play-chip').textContent).toBe('Starting…');
    act(() => bridge.push(statusFor('test-world')));
    expect(screen.getByTestId('play-chip').textContent).toBe('In the test world');
  });

  it('opens the Prism panel from the no-prism chip', async () => {
    await mount(fakeBridge(statusFor('no-prism')));
    fireEvent.click(screen.getByTestId('play-chip'));
    expect(await screen.findByTestId('play-prism-panel')).toBeTruthy();
  });

  it('Play plays; Reload is off outside the test world', async () => {
    const { bridge } = await mount();
    const reload = screen.getByTestId('play-reload') as HTMLButtonElement;
    expect(reload.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('play-button'));
    await waitFor(() => expect(bridge.play.play).toHaveBeenCalledTimes(1));
  });

  it('Reload in the test world, then Restart from the dialog', async () => {
    const bridge = fakeBridge(statusFor('test-world'));
    bridge.play.reload.mockResolvedValue(reloadOk(RESTART_REASONS));
    await mount(bridge);
    const reload = screen.getByTestId('play-reload') as HTMLButtonElement;
    expect(reload.disabled).toBe(false);
    fireEvent.click(reload);
    const dialog = await screen.findByTestId('play-restart-dialog');
    fireEvent.click(within(dialog).getByTestId('play-restart-dialog-submit'));
    await waitFor(() => expect(bridge.play.restart).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId('play-restart-dialog')).toBeNull());
  });

  it("shows main's progress line while main is busy and disables Play", async () => {
    const { bridge } = await mount();
    act(() =>
      bridge.push(statusFor('not-running', { busy: 'play', progress: 'Installing the mod…' })),
    );
    expect(screen.getByTestId('play-progress').textContent).toBe('Installing the mod…');
    expect((screen.getByTestId('play-button') as HTMLButtonElement).disabled).toBe(true);
    act(() => bridge.push(statusFor('starting')));
    expect(screen.getByTestId('play-progress').textContent).toBe('');
  });

  it('shows the renderer progress while saving', async () => {
    const session = fakeSession({ dirty: true });
    let release: () => void = () => {};
    session.save.mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));
    await mount(fakeBridge(), session);
    fireEvent.click(screen.getByTestId('play-button'));
    await waitFor(() =>
      expect(screen.getByTestId('play-progress').textContent).toBe('Saving the project…'),
    );
    await act(async () => release());
  });

  it('menu says why entries are off while the game is not running', async () => {
    await mount(fakeBridge(statusFor('not-running', { gameDir: null, instance: 'missing' })));
    await userEvent.setup().click(screen.getByTestId('play-menu'));
    expect(screen.getByTestId('play-menu-restart-reason').textContent).toBe(
      'The game is not running.',
    );
    expect(screen.getByTestId('play-menu-open-folder-reason').textContent).toBe(
      'The test instance is made the first time you press Play.',
    );
    expect(screen.queryByTestId('play-menu-new-world-reason')).toBeNull();
  });

  it('menu runs New test world and opens the folder', async () => {
    const { bridge } = await mount();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('play-menu'));
    await user.click(screen.getByTestId('play-menu-new-world'));
    await waitFor(() => expect(bridge.play.newWorld).toHaveBeenCalledWith('mc-26.3', 'demo'));
    await user.click(screen.getByTestId('play-menu'));
    await user.click(screen.getByTestId('play-menu-open-folder'));
    await waitFor(() => expect(bridge.shell.showItemInFolder).toHaveBeenCalled());
  });

  it('menu restarts a running game; New test world waits for it to close', async () => {
    const { bridge } = await mount(fakeBridge(statusFor('other-world')));
    const user = userEvent.setup();
    await user.click(screen.getByTestId('play-menu'));
    expect(screen.getByTestId('play-menu-new-world-reason').textContent).toBe(
      'Close Minecraft first.',
    );
    await user.click(screen.getByTestId('play-menu-restart'));
    await waitFor(() => expect(bridge.play.restart).toHaveBeenCalledTimes(1));
  });
});

describe('RestartNeededDialog', () => {
  it('shows each of the nine restart reason texts', () => {
    render(
      <RestartNeededDialog
        reasons={RESTART_REASONS}
        busy={false}
        onRestart={() => {}}
        onClose={() => {}}
      />,
    );
    const items = within(screen.getByTestId('play-restart-reasons')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'You added a new block: Ruby Lamp. New blocks are only read when Minecraft starts.',
      'You changed more than what Ruby does when something happens. Changes like that are only read when Minecraft starts.',
      'You renamed the mob Goblin. New names are only read when Minecraft starts.',
      'You removed the effect Glow. Minecraft keeps it until it starts again.',
      'You added or removed a sound. Sounds are only read when Minecraft starts.',
      "Your mod's details changed. They are only read when Minecraft starts.",
      "Your mod's id changed. It is only read when Minecraft starts.",
      'MCSuperMods has a new version of its runtime. It is only loaded when Minecraft starts.',
      'The Fabric API version changed. It is only loaded when Minecraft starts.',
    ]);
    expect(items.map((item) => item.textContent)).toEqual(
      RESTART_REASONS.map((reason) => reason.text),
    );
  });

  it('Restart is off while busy', () => {
    render(
      <RestartNeededDialog
        reasons={RESTART_REASONS}
        busy
        onRestart={() => {}}
        onClose={() => {}}
      />,
    );
    expect((screen.getByTestId('play-restart-dialog-submit') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe('PrismSetupPanel', () => {
  it('says how to get Prism and offers Find Prism and the folder picker', () => {
    let found = 0;
    let chose = 0;
    render(
      <PrismSetupPanel
        message={null}
        busy={false}
        onFind={() => {
          found += 1;
        }}
        onChooseFolder={() => {
          chose += 1;
        }}
        onClose={() => {}}
      />,
    );
    const panel = screen.getByTestId('play-prism-panel');
    expect(panel.textContent).toContain('prismlauncher.org');
    expect(panel.textContent).toContain('Microsoft account');
    fireEvent.click(screen.getByTestId('play-prism-panel-submit'));
    fireEvent.click(screen.getByTestId('play-prism-choose'));
    expect([found, chose]).toEqual([1, 1]);
  });

  it('shows the last finding', () => {
    render(
      <PrismSetupPanel
        message={'Close Minecraft, then press Play again.'}
        busy={false}
        onFind={() => {}}
        onChooseFolder={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('Close Minecraft, then press Play again.');
  });
});
