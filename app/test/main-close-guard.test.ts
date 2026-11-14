import { describe, expect, it, vi } from 'vitest';
import { createCloseGuard } from '../src/main/close-guard';

function closeEvent() {
  return { preventDefault: vi.fn() };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createCloseGuard (the window close handler before "Restart to update")', () => {
  it('lets a clean window close at once, so the update can install', () => {
    const deps = { isDirty: () => false, confirmDiscard: vi.fn(async () => true), close: vi.fn() };
    const guard = createCloseGuard(deps);
    const event = closeEvent();
    guard(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(deps.confirmDiscard).not.toHaveBeenCalled();
  });

  it('asks first when dirty, then closes for good after "Discard changes"', async () => {
    const deps = { isDirty: () => true, confirmDiscard: vi.fn(async () => true), close: vi.fn() };
    const guard = createCloseGuard(deps);
    const event = closeEvent();
    guard(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    await settle();
    expect(deps.close).toHaveBeenCalledOnce();
    // The second close (from `close()`) is not blocked again.
    const again = closeEvent();
    guard(again);
    expect(again.preventDefault).not.toHaveBeenCalled();
    expect(deps.confirmDiscard).toHaveBeenCalledOnce();
  });

  it('keeps the window open after Cancel, and asks again on the next close', async () => {
    const deps = { isDirty: () => true, confirmDiscard: vi.fn(async () => false), close: vi.fn() };
    const guard = createCloseGuard(deps);
    guard(closeEvent());
    await settle();
    expect(deps.close).not.toHaveBeenCalled();
    const next = closeEvent();
    guard(next);
    expect(next.preventDefault).toHaveBeenCalledOnce();
    await settle();
    expect(deps.confirmDiscard).toHaveBeenCalledTimes(2);
  });

  it('does not stack a second prompt while one is open, and treats a failed prompt as Cancel', async () => {
    let answer: (discard: boolean) => void = () => {};
    const deps = {
      isDirty: () => true,
      confirmDiscard: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            answer = resolve;
          }),
      ),
      close: vi.fn(),
    };
    const guard = createCloseGuard(deps);
    guard(closeEvent());
    const second = closeEvent();
    guard(second);
    expect(second.preventDefault).toHaveBeenCalledOnce();
    expect(deps.confirmDiscard).toHaveBeenCalledOnce();
    answer(true);
    await settle();
    expect(deps.close).toHaveBeenCalledOnce();

    const failing = createCloseGuard({
      isDirty: () => true,
      confirmDiscard: async () => {
        throw new Error('no dialog');
      },
      close: vi.fn(),
    });
    failing(closeEvent());
    await settle();
  });
});
