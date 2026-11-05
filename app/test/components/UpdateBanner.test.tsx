// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bannerNotice,
  UpdateBanner,
  updateCheckMessage,
} from '../../src/renderer/src/components/UpdateBanner';
import type { UpdateStatus } from '../../src/shared/ipc-channels';

afterEach(cleanup);

function renderBanner(options: { current?: UpdateStatus | Promise<UpdateStatus> } = {}) {
  let listener: ((status: UpdateStatus) => void) | null = null;
  const install = vi.fn(async () => {});
  const unsubscribe = vi.fn();
  const whatsNew = vi.fn();
  const view = render(
    <UpdateBanner
      updates={{
        install,
        current: async () => options.current ?? { state: 'idle' },
        onStatus: (next) => {
          listener = next;
          return unsubscribe;
        },
      }}
      onWhatsNew={whatsNew}
    />,
  );
  const push = (status: UpdateStatus) => act(() => listener?.(status));
  return { install, unsubscribe, push, view, whatsNew };
}

describe('UpdateBanner', () => {
  it('shows nothing for checks, errors and up-to-date results', () => {
    const { push } = renderBanner();
    for (const status of [
      { state: 'checking' },
      { state: 'not-available' },
      { state: 'error', message: 'offline' },
      { state: 'disabled', reason: 'unsupported-platform' },
    ] satisfies UpdateStatus[]) {
      push(status);
      expect(screen.queryByTestId('update-banner')).toBeNull();
    }
  });

  it('appears as soon as an update is found, without any click', () => {
    const { push } = renderBanner();
    push({ state: 'available', version: '1.4.0' });
    expect(screen.getByTestId('update-banner-text').textContent).toBe(
      'Version 1.4.0 is available, downloading\u2026',
    );
    expect(screen.queryByTestId('update-progress')).toBeNull();
    push({ state: 'error', message: 'Could not check for updates.' });
    expect(screen.queryByTestId('update-banner')).toBeNull();
  });

  it('shows download progress with the version, then installs only when asked', async () => {
    const { push, install } = renderBanner();
    push({ state: 'available', version: '1.4.0' });
    push({ state: 'downloading', percent: 37 });
    expect(screen.getByTestId('update-banner-text').textContent).toBe(
      'Version 1.4.0 is available, downloading\u2026',
    );
    expect(screen.getByTestId('update-progress').getAttribute('value')).toBe('37');
    expect(screen.getByText('37%')).toBeTruthy();
    expect(screen.queryByTestId('update-install')).toBeNull();
    push({ state: 'downloaded', version: '1.4.0' });
    expect(screen.getByTestId('update-banner-text').textContent).toBe(
      'Version 1.4.0 is ready \u2014',
    );
    expect(install).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Restart to update' }));
    expect(install).toHaveBeenCalledOnce();
    expect(screen.getByText('MCSuperMods will close and install the update.')).toBeTruthy();
    expect((screen.getByTestId('update-install') as HTMLButtonElement).disabled).toBe(true);
  });

  it('starts from the current status, so a reload does not lose a downloaded update', async () => {
    renderBanner({ current: { state: 'downloaded', version: '2.0.0', notes: '- New' } });
    expect((await screen.findByTestId('update-banner-text')).textContent).toBe(
      'Version 2.0.0 is ready \u2014',
    );
  });

  it('prefers a pushed status over a slower answer to the current status', async () => {
    let answer: (status: UpdateStatus) => void = () => {};
    const { push } = renderBanner({
      current: new Promise<UpdateStatus>((resolve) => {
        answer = resolve;
      }),
    });
    push({ state: 'downloaded', version: '2.0.0' });
    await act(async () => answer({ state: 'idle' }));
    expect(screen.getByTestId('update-banner')).toBeTruthy();
  });

  it("offers What's new with the feed's release notes", async () => {
    const { push, whatsNew } = renderBanner();
    const user = userEvent.setup();
    push({ state: 'available', version: '1.4.0', notes: '### Added\n\n- Things' });
    await user.click(screen.getByRole('button', { name: "What's new" }));
    expect(whatsNew).toHaveBeenLastCalledWith('1.4.0', '### Added\n\n- Things');
    push({ state: 'downloading', percent: 50, version: '1.4.0' });
    push({ state: 'downloaded', version: '1.4.0' });
    await user.click(screen.getByRole('button', { name: "What's new" }));
    expect(whatsNew).toHaveBeenLastCalledWith('1.4.0', '### Added\n\n- Things');
  });

  it('is dismissible, and a finished download shows it again', async () => {
    const { push } = renderBanner();
    const user = userEvent.setup();
    push({ state: 'downloading', percent: 5 });
    expect(screen.getByText('Downloading an update\u2026')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Dismiss update notice' }));
    expect(screen.queryByTestId('update-banner')).toBeNull();
    push({ state: 'downloading', percent: 60 });
    expect(screen.queryByTestId('update-banner')).toBeNull();
    push({ state: 'downloaded', version: '1.4.0' });
    expect(screen.getByTestId('update-banner')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Dismiss update notice' }));
    expect(screen.queryByTestId('update-banner')).toBeNull();
  });

  it('unsubscribes on unmount', () => {
    const { unsubscribe, view } = renderBanner();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

describe('bannerNotice', () => {
  it('keeps the version and notes from available through the download', () => {
    const available = bannerNotice({ state: 'available', version: '3.0.0', notes: 'n' }, null);
    expect(available).toEqual({
      phase: 'downloading',
      version: '3.0.0',
      percent: null,
      notes: 'n',
    });
    const progress = bannerNotice({ state: 'downloading', percent: 10 }, available);
    expect(progress).toEqual({ phase: 'downloading', version: '3.0.0', percent: 10, notes: 'n' });
    expect(bannerNotice({ state: 'downloaded', version: '3.0.0' }, progress)).toEqual({
      phase: 'downloaded',
      version: '3.0.0',
      notes: 'n',
    });
    expect(bannerNotice({ state: 'checking' }, progress)).toBeNull();
  });
});

describe('updateCheckMessage', () => {
  it('describes each manual check result', () => {
    expect(updateCheckMessage({ state: 'not-available' }, '0.1.0')).toEqual({
      kind: 'info',
      text: 'You have the latest version (v0.1.0).',
    });
    expect(updateCheckMessage({ state: 'not-available' }).text).toBe(
      'You have the latest version.',
    );
    expect(
      updateCheckMessage({ state: 'not-available', reason: 'no-published-release' }, '0.1.0'),
    ).toEqual({
      kind: 'info',
      text: 'No published release found on GitHub yet. Releases must be published (not drafts) before installed copies can update.',
    });
    expect(updateCheckMessage({ state: 'available', version: '2.0.0' }).text).toMatch(/2\.0\.0/);
    expect(updateCheckMessage({ state: 'error', message: 'Could not check for updates.' })).toEqual(
      { kind: 'error', text: 'Could not check for updates.' },
    );
    expect(updateCheckMessage({ state: 'disabled', reason: 'not-packaged' }).text).toBe(
      'Automatic updates are available only in the installed Windows app.',
    );
    expect(updateCheckMessage({ state: 'disabled', reason: 'test-run' }).text).toBe(
      'Updates are turned off in test runs.',
    );
  });
});
