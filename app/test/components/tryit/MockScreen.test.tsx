// @vitest-environment happy-dom
import type { OpenScreen, ScreenSpec } from '@msm/sim';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOCK_UP_LABEL, MockScreen, screenWords } from '../../../src/renderer/src/tryit/MockScreen';

afterEach(cleanup);

const open = (spec: ScreenSpec): OpenScreen => ({
  pos: { x: 1, y: 0, z: 1 },
  block: 'demo:crate',
  displayName: 'Crate',
  spec,
  origin: { elementId: 'demo:crate' },
});

describe('mock-up screens', () => {
  it('draws a container by its rows and columns, labelled "Mock-up"', () => {
    render(
      <MockScreen
        screen={open({
          kind: 'container',
          layout: 'chest',
          rows: 2,
          columns: 9,
          keepContents: false,
        })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('tryit-screen-label').textContent).toBe(MOCK_UP_LABEL);
    expect(screen.getByTestId('tryit-screen-title').textContent).toBe('Crate');
    expect(screen.getAllByTestId('tryit-screen-slot')).toHaveLength(18);
    expect(screen.getByTestId('tryit-screen').textContent).toContain('chest screen, 2 rows of 9');
  });

  it('draws hoppers, dispensers and shulker boxes by their layout', () => {
    expect(
      screenWords(
        open({ kind: 'container', layout: 'hopper', rows: 1, columns: 5, keepContents: false }),
      ),
    ).toBe('hopper screen');
    expect(
      screenWords(
        open({ kind: 'container', layout: 'chest', rows: 3, columns: 9, keepContents: true }),
      ),
    ).toBe('shulker box screen, 3 rows of 9');
    render(
      <MockScreen
        screen={open({
          kind: 'container',
          layout: 'dispenser',
          rows: 3,
          columns: 3,
          keepContents: false,
        })}
        onClose={() => {}}
      />,
    );
    expect(screen.getAllByTestId('tryit-screen-slot')).toHaveLength(9);
  });

  it("draws a machine by the furnace's three slots", () => {
    render(
      <MockScreen
        screen={open({ kind: 'machine', menu: 'smoker', power: 'redstone' })}
        onClose={() => {}}
      />,
    );
    const slots = screen.getAllByTestId('tryit-screen-slot');
    expect(slots.map((slot) => slot.getAttribute('aria-label'))).toEqual([
      'Input',
      'Fuel (not used)',
      'Output',
    ]);
    expect(screen.getByTestId('tryit-screen').textContent).toContain('smoker screen');
  });

  it('closes with Close, Esc and E', () => {
    const onClose = vi.fn();
    render(
      <MockScreen
        screen={open({ kind: 'machine', menu: 'furnace', power: 'fuel' })}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('tryit-screen-close'));
    fireEvent.keyDown(screen.getByTestId('tryit-screen'), { key: 'Escape' });
    fireEvent.keyDown(screen.getByTestId('tryit-screen'), { key: 'e', code: 'KeyE' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
