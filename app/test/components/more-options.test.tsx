// @vitest-environment happy-dom
/**
 * **More options** (ADR 0130 D3): a button with `aria-expanded` over a labelled region, closed
 * and empty by default, opened by click or keyboard, remembered per key; `InMore` sends a part of
 * a section into its More options, with ids allowed there; a section the Studio does not list
 * shows its title, why and More options only.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  InMore,
  MoreOptions,
  rememberedMoreOptions,
  usePlain,
} from '../../src/renderer/src/components/ui/MoreOptions';
import { CommonSectionsContext } from '../../src/renderer/src/studios/plain';
import { Section } from '../../src/renderer/src/studios/worldgen/parts';

function Plainness({ testId }: { testId: string }) {
  return <span data-testid={testId}>{usePlain() ? 'plain' : 'ids'}</span>;
}

beforeEach(() => {
  globalThis.localStorage.clear();
  // The default view: every More options closed (the test setup opens them).
  window.msmMoreOptionsOpen = false;
});
afterEach(cleanup);

describe('MoreOptions', () => {
  it('starts closed with nothing rendered, opens by keyboard and is remembered', async () => {
    const user = userEvent.setup();
    const first = render(
      <MoreOptions storageKey="demo">
        <Plainness testId="inside" />
      </MoreOptions>,
    );
    const toggle = screen.getByTestId('more-options-demo');
    expect(toggle.textContent).toBe('More options');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const region = screen.getByTestId('more-options-demo-content');
    expect(toggle.getAttribute('aria-controls')).toBe(region.id);
    expect(region.getAttribute('aria-label')).toBe('More options');
    expect(screen.queryByTestId('inside')).toBeNull();
    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    // Inside a More options the view is not plain: ids may show.
    expect(screen.getByTestId('inside').textContent).toBe('ids');
    expect(rememberedMoreOptions('demo')).toBe(true);
    first.unmount();
    render(
      <MoreOptions storageKey="demo">
        <Plainness testId="inside" />
      </MoreOptions>,
    );
    expect(screen.getByTestId('more-options-demo').getAttribute('aria-expanded')).toBe('true');
  });

  it('is held open while asked', () => {
    render(<MoreOptions storageKey="held" open />);
    expect(screen.getByTestId('more-options-held').getAttribute('aria-expanded')).toBe('true');
  });
});

describe('Section and InMore', () => {
  it('sends InMore parts into the section’s More options, plain outside it', () => {
    render(
      <Section title="Item" testId="item-general">
        <Plainness testId="main" />
        <InMore>
          <Plainness testId="extra" />
        </InMore>
      </Section>,
    );
    expect(screen.getByTestId('main').textContent).toBe('plain');
    expect(screen.getByTestId('item-general-why').textContent).toMatch(/name/);
    expect(screen.queryByTestId('extra')).toBeNull();
    fireEvent.click(screen.getByTestId('more-options-item-general'));
    expect(screen.getByTestId('extra').textContent).toBe('ids');
    expect(screen.getByTestId('more-options-item-general-content').textContent).toContain('ids');
  });

  it('shows a section the Studio does not list as its title, why and More options', () => {
    render(
      <CommonSectionsContext.Provider value={new Set(['item-general'])}>
        <Section title="Behaviour" testId="item-behaviour">
          <Plainness testId="body" />
        </Section>
      </CommonSectionsContext.Provider>,
    );
    expect(screen.getByRole('heading', { name: 'Behaviour' })).toBeTruthy();
    expect(screen.getByTestId('item-behaviour-why')).toBeTruthy();
    expect(screen.queryByTestId('body')).toBeNull();
    fireEvent.click(screen.getByTestId('more-options-item-behaviour'));
    expect(screen.getByTestId('body').textContent).toBe('ids');
  });

  it('gives an InMore outside any section a More options of its own', () => {
    render(
      <InMore fallbackKey="loose">
        <Plainness testId="loose" />
      </InMore>,
    );
    expect(screen.queryByTestId('loose')).toBeNull();
    fireEvent.click(screen.getByTestId('more-options-loose'));
    expect(screen.getByTestId('loose').textContent).toBe('ids');
  });
});
