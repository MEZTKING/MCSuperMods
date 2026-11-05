// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RightDock } from '../../src/renderer/src/components/RightDock';

afterEach(cleanup);

describe('RightDock', () => {
  it('has an "AI helper" tab when the assistant content is given', async () => {
    const onTabChange = vi.fn();
    render(
      <RightDock
        problems={[]}
        tab="problems"
        onTabChange={onTabChange}
        assistant={<p data-testid="assistant-content">Helper</p>}
      />,
    );
    const tab = screen.getByTestId('dock-tab-assistant');
    expect(tab.textContent).toBe('AI helper');
    await userEvent.setup().click(tab);
    expect(onTabChange).toHaveBeenCalledWith('assistant');
  });

  it('shows the assistant content on the assistant tab', () => {
    render(
      <RightDock
        problems={[]}
        tab="assistant"
        assistant={<p data-testid="assistant-content">Helper</p>}
      />,
    );
    expect(screen.getByTestId('assistant-content')).toBeTruthy();
  });

  it('has no AI helper tab without the assistant and falls back to Problems', () => {
    render(<RightDock problems={[]} tab="assistant" />);
    expect(screen.queryByTestId('dock-tab-assistant')).toBeNull();
    expect(screen.getByTestId('problems-panel')).toBeTruthy();
  });
});
