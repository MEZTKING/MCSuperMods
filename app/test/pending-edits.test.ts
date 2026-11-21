import { afterEach, describe, expect, it } from 'vitest';
import { flushPendingEdits, registerPendingEdit } from '../src/renderer/src/session/pending-edits';

const unregister: (() => void)[] = [];
afterEach(() => {
  for (const off of unregister.splice(0)) off();
});

describe('flushPendingEdits (edits an editor holds back)', () => {
  it('starts every flush at once, synchronous and asynchronous alike', () => {
    const started: string[] = [];
    unregister.push(
      registerPendingEdit(() => {
        started.push('function editor');
      }),
      registerPendingEdit(async () => {
        started.push('rules');
        await Promise.resolve();
      }),
    );
    void flushPendingEdits();
    expect(started).toEqual(['function editor', 'rules']);
  });

  it('settles only once an asynchronous flush has landed', async () => {
    let landed = false;
    let land = (): void => undefined;
    unregister.push(
      registerPendingEdit(
        () =>
          new Promise<void>((resolve) => {
            land = () => {
              landed = true;
              resolve();
            };
          }),
      ),
    );
    let settled = false;
    const flushed = flushPendingEdits().then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    land();
    await flushed;
    expect(landed).toBe(true);
  });

  it('settles when an asynchronous flush fails (its editor reports the error)', async () => {
    unregister.push(registerPendingEdit(() => Promise.reject(new Error('The project changed.'))));
    await expect(flushPendingEdits()).resolves.toBeUndefined();
  });

  it('settles at once with nothing held back, and skips an unregistered flush', async () => {
    let called = false;
    registerPendingEdit(() => {
      called = true;
    })();
    await expect(flushPendingEdits()).resolves.toBeUndefined();
    expect(called).toBe(false);
  });
});
