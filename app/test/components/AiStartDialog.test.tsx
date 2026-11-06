// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_START_IDEAS, AiStartDialog } from '../../src/renderer/src/components/AiStartDialog';

afterEach(cleanup);

describe('AiStartDialog', () => {
  it('starts with the description, or an idea picked from the list', async () => {
    const onStart = vi.fn();
    render(<AiStartDialog keySet onStart={onStart} onOpenSettings={vi.fn()} onClose={vi.fn()} />);
    const user = userEvent.setup();
    const submit = screen.getByRole('button', { name: 'Choose folder and build…' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByText(AI_START_IDEAS[0] as string));
    await user.click(submit);
    expect(onStart).toHaveBeenCalledWith(AI_START_IDEAS[0]);
  });

  it('sends people without a key to Settings', async () => {
    const onOpenSettings = vi.fn();
    render(
      <AiStartDialog
        keySet={false}
        onStart={vi.fn()}
        onOpenSettings={onOpenSettings}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('ai-start-no-key')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(onOpenSettings).toHaveBeenCalled();
  });
});
