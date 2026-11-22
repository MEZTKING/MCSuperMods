// @vitest-environment happy-dom
/**
 * `IdInput` keeps what is typed into it the moment it appears. A field revealed by a lazy chunk
 * is committed by one task and has its passive effects flushed by a later one; typing in between
 * (a fast user, or a test under load whose `findBy` resolved first) must not be reset to the old
 * value by a mount effect, which once lost the Profession Studio's first picture.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { lazy, Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IdInput } from '../../src/renderer/src/forms/IdInput';

afterEach(cleanup);

describe('IdInput', () => {
  it('commits text typed before the field’s effects have run', async () => {
    const onCommit = vi.fn();
    const Field = lazy(async () => ({
      default: () => <IdInput value="" label="Picture" testId="field" onCommit={onCommit} />,
    }));
    render(
      <Suspense fallback={null}>
        <Field />
      </Suspense>,
    );
    // Type and leave the field in the microtask right after the commit that shows it, before
    // the task that flushes its passive effects.
    await new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        const input = screen.queryByTestId('field');
        if (input === null) return;
        observer.disconnect();
        fireEvent.change(input, { target: { value: 'demo:art/smith' } });
        fireEvent.blur(input);
        resolve();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    expect(onCommit.mock.calls).toEqual([['demo:art/smith']]);
  });

  it('shows a new value given from outside', () => {
    const { rerender } = render(
      <IdInput value="a:b" label="Id" testId="field" onCommit={vi.fn()} />,
    );
    rerender(<IdInput value="c:d" label="Id" testId="field" onCommit={vi.fn()} />);
    expect((screen.getByTestId('field') as HTMLInputElement).value).toBe('c:d');
  });
});
