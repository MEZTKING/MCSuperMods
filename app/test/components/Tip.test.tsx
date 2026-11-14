// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Tooltip } from 'radix-ui';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);

import { Tip } from '../../src/renderer/src/components/ui/Tip';

function setup() {
  render(
    <Tooltip.Provider delayDuration={0}>
      <Tip label="Helpful words">
        <button type="button">Trigger</button>
      </Tip>
    </Tooltip.Provider>,
  );
  return screen.getByRole('button', { name: 'Trigger' });
}

describe('Tip', () => {
  it('opens on keyboard focus', () => {
    const button = setup();
    act(() => button.focus());
    expect(screen.queryAllByRole('tooltip').length).toBeGreaterThan(0);
  });

  it('does not reopen on the focus returned after a press', () => {
    const button = setup();
    fireEvent.pointerDown(button);
    act(() => button.blur());
    act(() => button.focus());
    expect(screen.queryAllByRole('tooltip')).toHaveLength(0);
  });
});
