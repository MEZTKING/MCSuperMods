// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateBanner, updateCheckMessage } from '../../src/renderer/src/components/UpdateBanner';
import type { UpdateStatus } from '../../src/shared/ipc-channels';

afterEach(cleanup);

function renderBanner() {
  let listener: ((status: UpdateStatus) => void) | null = null;
  const install = vi.fn(async () => {});
  const unsubscribe = vi.fn();
  const view = render(
    <UpdateBanner
      updates={{
        install,
        onStatus: (next) => {
          listener = next;
          return unsubscribe;
        },
      }}
    />,
  );
  const push = (status: UpdateStatus) => act(() => listener?.(status));
  return { install, unsubscribe, push, view };
}

describe('UpdateBanner', () => {
  it('shows nothing for checks, errors and up-to-date results', () => {
    const { push } = renderBanner();
    for (const status of [
      { state: 'checking' },
      { state: 'not-available' },
      { state: 'available', version: '1.0.0' },
      { state: 'error', message: 'offline' },
      { state: 'disabled', reason: 'unsupported-platform' },
    ] satisfies UpdateStatus[]) {
      push(status);
      expect(screen.queryByTestId('update-banner')).toBeNull();
    }
  });

  it('shows download progress, then installs only when asked', async () => {
    const { push, install } = renderBanner();
    push({ state: 'downloading', percent: 37 });
    expect(screen.getByTestId('update-progress').getAttribute('value')).toBe('37');
    expect(screen.getByText('37%')).toBeTruthy();
    expect(screen.queryByTestId('update-install')).toBeNull();
    push({ state: 'downloaded', version: '1.4.0' });
    expect(screen.getByText('Version 1.4.0 is ready to install.')).toBeTruthy();
    expect(install).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Restart to update' }));
    expect(install).toHaveBeenCalledOnce();
    expect(screen.getByText('MCSuperMods will close and install the update.')).toBeTruthy();
    expect((screen.getByTestId('update-install') as HTMLButtonElement).disabled).toBe(true);
  });

  it('is dismissible, and a finished download shows it again', async () => {
    const { push } = renderBanner();
    const user = userEvent.setup();
    push({ state: 'downloading', percent: 5 });
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
