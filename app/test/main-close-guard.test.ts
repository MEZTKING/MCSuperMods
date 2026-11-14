import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type CloseChoice,
  type CloseGuardDeps,
  type CloseRequest,
  createCloseGuard,
  createCloseRequests,
} from '../src/main/close-guard';
import { type AutoUpdaterEvent, type AutoUpdaterLike, createUpdater } from '../src/main/updater';

function closeEvent() {
  return { preventDefault: vi.fn() };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/** A window's guard dependencies: the renderer reports `reported`, the prompt answers `choice`. */
function deps(
  options: {
    reported?: boolean | null;
    lastDirty?: boolean;
    choice?: CloseChoice;
    saved?: boolean;
  } = {},
) {
  return {
    isDirty: vi.fn(() => options.lastDirty ?? false),
    flush: vi.fn(async () => (options.reported === undefined ? false : options.reported)),
    confirm: vi.fn(async () => options.choice ?? 'cancel'),
    save: vi.fn(async () => options.saved ?? true),
    close: vi.fn(),
  } satisfies CloseGuardDeps;
}

describe('createCloseGuard (the window close handler)', () => {
  it('asks the renderer first, then closes a clean window without a prompt', async () => {
    const window = deps({ reported: false });
    const guard = createCloseGuard(window);
    const event = closeEvent();
    guard(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    await settle();
    expect(window.flush).toHaveBeenCalledOnce();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(window.close).toHaveBeenCalledOnce();
    // The second close (from `close()`) goes through.
    const again = closeEvent();
    guard(again);
    expect(again.preventDefault).not.toHaveBeenCalled();
  });

  it('shows the prompt when typing still held back makes the project dirty', async () => {
    // Main last heard "clean": the editors had not reported the typing yet.
    const window = deps({ reported: true, lastDirty: false, choice: 'cancel' });
    const guard = createCloseGuard(window);
    guard(closeEvent());
    await settle();
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(window.close).not.toHaveBeenCalled();
  });

  it('saves and then closes after "Save"', async () => {
    const window = deps({ reported: true, choice: 'save', saved: true });
    const guard = createCloseGuard(window);
    guard(closeEvent());
    await settle();
    expect(window.save).toHaveBeenCalledOnce();
    expect(window.close).toHaveBeenCalledOnce();
    expect(window.save.mock.invocationCallOrder[0]).toBeLessThan(
      window.close.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('keeps the window open when saving fails, and asks again on the next close', async () => {
    const window = deps({ reported: true, choice: 'save', saved: false });
    const guard = createCloseGuard(window);
    guard(closeEvent());
    await settle();
    expect(window.close).not.toHaveBeenCalled();
    window.save.mockRejectedValueOnce(new Error('disk full'));
    const next = closeEvent();
    guard(next);
    expect(next.preventDefault).toHaveBeenCalledOnce();
    await settle();
    expect(window.confirm).toHaveBeenCalledTimes(2);
    expect(window.close).not.toHaveBeenCalled();
  });

  it('closes for good after "Discard changes" without saving', async () => {
    const window = deps({ reported: true, choice: 'discard' });
    const guard = createCloseGuard(window);
    guard(closeEvent());
    await settle();
    expect(window.save).not.toHaveBeenCalled();
    expect(window.close).toHaveBeenCalledOnce();
  });

  it('keeps the window open after Cancel, and asks again on the next close', async () => {
    const window = deps({ reported: true, choice: 'cancel' });
    const guard = createCloseGuard(window);
    guard(closeEvent());
    await settle();
    expect(window.close).not.toHaveBeenCalled();
    const next = closeEvent();
    guard(next);
    expect(next.preventDefault).toHaveBeenCalledOnce();
    await settle();
    expect(window.confirm).toHaveBeenCalledTimes(2);
  });

  it('falls back to the last reported state when the renderer does not answer in time', async () => {
    const dirty = deps({ reported: null, lastDirty: true, choice: 'cancel' });
    createCloseGuard(dirty)(closeEvent());
    await settle();
    expect(dirty.confirm).toHaveBeenCalledOnce();

    const clean = deps({ reported: null, lastDirty: false });
    createCloseGuard(clean)(closeEvent());
    await settle();
    expect(clean.confirm).not.toHaveBeenCalled();
    expect(clean.close).toHaveBeenCalledOnce();

    const failing = deps({ lastDirty: true });
    failing.flush.mockRejectedValueOnce(new Error('gone'));
    createCloseGuard(failing)(closeEvent());
    await settle();
    expect(failing.confirm).toHaveBeenCalledOnce();
  });

  it('does not stack a second prompt while one is open, and treats a failed prompt as Cancel', async () => {
    let answer: (choice: CloseChoice) => void = () => {};
    const window = deps({ reported: true });
    window.confirm.mockImplementation(
      () =>
        new Promise<CloseChoice>((resolve) => {
          answer = resolve;
        }),
    );
    const guard = createCloseGuard(window);
    guard(closeEvent());
    await settle();
    const second = closeEvent();
    guard(second);
    expect(second.preventDefault).toHaveBeenCalledOnce();
    expect(window.flush).toHaveBeenCalledOnce();
    expect(window.confirm).toHaveBeenCalledOnce();
    answer('discard');
    await settle();
    expect(window.close).toHaveBeenCalledOnce();

    const failing = deps({ reported: true });
    failing.confirm.mockRejectedValueOnce(new Error('no dialog'));
    createCloseGuard(failing)(closeEvent());
    await settle();
    expect(failing.close).not.toHaveBeenCalled();
  });
});

describe('createCloseRequests (main asking the renderer before a close)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches answers to requests by id and ignores stray or malformed answers', async () => {
    const sent: CloseRequest[] = [];
    const requests = createCloseRequests((request) => sent.push(request));
    const report = requests.ask('report', 1000);
    const save = requests.ask('save', 1000);
    expect(sent.map((request) => request.op)).toEqual(['report', 'save']);
    requests.answer({ id: 999, value: true });
    requests.answer({ id: sent[1]?.id, value: 'yes' });
    requests.answer(null);
    requests.answer({ id: sent[1]?.id, value: true });
    requests.answer({ id: sent[0]?.id, value: false });
    await expect(report).resolves.toBe(false);
    await expect(save).resolves.toBe(true);
  });

  it('resolves null when the renderer does not answer in time, and ignores a late answer', async () => {
    vi.useFakeTimers();
    const sent: CloseRequest[] = [];
    const requests = createCloseRequests((request) => sent.push(request));
    const report = requests.ask('report', 1000);
    vi.advanceTimersByTime(999);
    let settled = false;
    void report.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    vi.advanceTimersByTime(1);
    await expect(report).resolves.toBeNull();
    requests.answer({ id: sent[0]?.id, value: true });
  });

  it('resolves null at once when the renderer is gone', async () => {
    const requests = createCloseRequests(() => {
      throw new Error('destroyed');
    });
    await expect(requests.ask('report', 60_000)).resolves.toBeNull();
  });
});

describe('Restart to update through the close guard', () => {
  /** An updater with a downloaded update, whose `closeWindows` is `closeWindows`. */
  function downloadedUpdater(closeWindows: () => void) {
    const quitAndInstall = vi.fn();
    const listeners = new Map<AutoUpdaterEvent, ((payload: unknown) => void)[]>();
    const emit = (event: AutoUpdaterEvent, payload: unknown): void => {
      for (const listener of listeners.get(event) ?? []) listener(payload);
    };
    const fake: AutoUpdaterLike = {
      autoDownload: false,
      autoInstallOnAppQuit: true,
      allowPrerelease: true,
      allowDowngrade: true,
      disableWebInstaller: false,
      on(event, listener) {
        listeners.set(event, [...(listeners.get(event) ?? []), listener]);
        return this;
      },
      async checkForUpdates() {
        emit('update-available', { version: '9.9.9' });
        emit('update-downloaded', { version: '9.9.9' });
        return { isUpdateAvailable: true };
      },
      quitAndInstall,
    };
    const updater = createUpdater({
      gate: { isPackaged: true, platform: 'win32', env: {} },
      load: async () => fake,
      autoCheckEnabled: async () => true,
      broadcast: () => {},
      closeWindows,
      notify: () => {},
      log: () => {},
      schedule: () => {},
    });
    return { updater, quitAndInstall };
  }

  it('saves held-back typing after "Save" and then installs', async () => {
    const window = deps({ reported: true, lastDirty: false, choice: 'save', saved: true });
    const guard = createCloseGuard(window);
    let open = true;
    window.close.mockImplementation(() => {
      const event = closeEvent();
      guard(event);
      if (event.preventDefault.mock.calls.length === 0) open = false;
    });
    const { updater, quitAndInstall } = downloadedUpdater(() => {
      const event = closeEvent();
      guard(event);
      if (event.preventDefault.mock.calls.length === 0) open = false;
    });
    await updater.check();
    expect(updater.status.state).toBe('downloaded');
    await updater.install();
    await settle();
    expect(window.save).toHaveBeenCalledOnce();
    expect(open).toBe(false);
    // Every window has closed: `window-all-closed` starts the installer.
    expect(updater.finishInstall()).toBe('installing');
    expect(quitAndInstall).toHaveBeenCalledWith(true, true);
  });
});
