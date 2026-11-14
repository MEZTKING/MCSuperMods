import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCloseGuard } from '../src/main/close-guard';
import { closeRequestHandlers } from '../src/renderer/src/session/close-requests';
import { registerPendingEdit } from '../src/renderer/src/session/pending-edits';

/** A session double whose `dirty` an editor's held-back edit sets. */
function fakeSession(options: { failSave?: boolean } = {}) {
  const session = {
    snapshot: { dirty: false },
    save: vi.fn(async () => {
      if (options.failSave === true) throw new Error('The disk is full.');
      session.snapshot = { dirty: false };
    }),
  };
  return session;
}

const unregister: (() => void)[] = [];
afterEach(() => {
  for (const off of unregister.splice(0)) off();
});

describe('closeRequestHandlers (the renderer side of the window close round trip)', () => {
  it('reports typing an editor still holds back as unsaved', () => {
    const session = fakeSession();
    unregister.push(
      registerPendingEdit(() => {
        session.snapshot = { dirty: true };
      }),
    );
    expect(closeRequestHandlers(session).report()).toBe(true);
  });

  it('reports a clean project as clean', () => {
    expect(closeRequestHandlers(fakeSession()).report()).toBe(false);
  });

  it('saves for the prompt\'s "Save" and says whether it worked', async () => {
    const saved = vi.fn();
    const failed = vi.fn();
    const session = fakeSession();
    session.snapshot = { dirty: true };
    await expect(closeRequestHandlers(session, { saved, failed }).save()).resolves.toBe(true);
    expect(session.save).toHaveBeenCalledOnce();
    expect(saved).toHaveBeenCalledOnce();

    const broken = fakeSession({ failSave: true });
    await expect(closeRequestHandlers(broken, { saved, failed }).save()).resolves.toBe(false);
    expect(failed).toHaveBeenCalledWith(new Error('The disk is full.'));
  });

  it("closing with the X within the editors' pause shows the prompt, and Save saves and closes", async () => {
    const session = fakeSession();
    // The editor has not reported the typing yet, so main last heard "clean".
    unregister.push(
      registerPendingEdit(() => {
        session.snapshot = { dirty: true };
      }),
    );
    const handlers = closeRequestHandlers(session);
    const window = {
      isDirty: () => false,
      flush: async () => handlers.report(),
      confirm: vi.fn(async () => 'save' as const),
      save: () => handlers.save(),
      close: vi.fn(),
    };
    createCloseGuard(window)({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(window.close).toHaveBeenCalledOnce());
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(session.save).toHaveBeenCalledOnce();
  });
});
