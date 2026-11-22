// @vitest-environment happy-dom
/**
 * Text inputs that mirror an outside value keep what is typed the moment they appear: a field
 * revealed by a lazy chunk has its passive effects flushed after the first change event, and an
 * effect resetting the text to the old value would wipe it (see id-input.test.tsx).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type ComponentType, lazy, Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LimitField } from '../../src/renderer/src/components/ai/AiLimitsPopover';
import { KeyInput } from '../../src/renderer/src/forms/StructEditor';
import { TextField } from '../../src/renderer/src/studios/blocks-items/parts';
import { NumberField } from '../../src/renderer/src/studios/structures/pickers';

afterEach(cleanup);

/** Mounts `Field` lazily and runs `act` on the input in the microtask after the reveal commit. */
async function typeOnReveal(
  Field: ComponentType,
  act: (input: HTMLElement) => void,
): Promise<HTMLInputElement> {
  const Lazy = lazy(async () => ({ default: Field }));
  render(
    <Suspense fallback={null}>
      <Lazy />
    </Suspense>,
  );
  await new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      const input = screen.queryByTestId('field');
      if (input === null) return;
      observer.disconnect();
      act(input);
      resolve();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  return screen.getByTestId('field') as HTMLInputElement;
}

describe('effect-free text reset', () => {
  it('KeyInput commits text typed before its effects ran', async () => {
    const onRename = vi.fn();
    await typeOnReveal(
      () => (
        <div data-testid="field">
          <KeyInput current="a" label="L" isTaken={() => false} onRename={onRename} />
        </div>
      ),
      (wrapper) => {
        const input = wrapper.querySelector('input') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'b' } });
        fireEvent.blur(input);
      },
    );
    expect(onRename.mock.calls).toEqual([['b']]);
  });

  it('LimitField keeps typed text', async () => {
    const input = await typeOnReveal(
      () => (
        <LimitField
          id="x"
          testId="field"
          value={5}
          bounds={{ min: 1, max: 100 }}
          onCommit={vi.fn()}
        />
      ),
      (el) => fireEvent.change(el, { target: { value: '' } }),
    );
    expect(input.value).toBe('');
  });

  it('TextField keeps typed text', async () => {
    const input = await typeOnReveal(
      () => <TextField label="T" value="old" testId="field" onCommit={vi.fn()} />,
      (el) => fireEvent.change(el, { target: { value: 'new' } }),
    );
    expect(input.value).toBe('new');
  });

  it('NumberField keeps typed text', async () => {
    const input = await typeOnReveal(
      () => <NumberField label="N" value={3} testId="field" onCommit={vi.fn()} />,
      (el) => fireEvent.change(el, { target: { value: '7' } }),
    );
    expect(input.value).toBe('7');
  });

  it('still shows a new value from outside', () => {
    const { rerender } = render(
      <TextField label="T" value="a" testId="field" onCommit={vi.fn()} />,
    );
    rerender(<TextField label="T" value="b" testId="field" onCommit={vi.fn()} />);
    expect((screen.getByTestId('field') as HTMLInputElement).value).toBe('b');
  });
});
