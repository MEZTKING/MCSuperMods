// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_START_IDEAS, AiStartDialog } from '../../src/renderer/src/components/AiStartDialog';
import { costSentence } from '../../src/renderer/src/components/ai/ai-setup-words';
import { fakeAi } from './ai-fixtures';

afterEach(cleanup);

const KEY = 'sk-ant-start-0000-zyxw';
const DESCRIPTION = 'A ruby sword that sets mobs on fire.';

describe('AiStartDialog', () => {
  it('starts with the description, or an idea picked from the list', async () => {
    const onStart = vi.fn();
    render(<AiStartDialog keySet onStart={onStart} onClose={vi.fn()} />);
    const user = userEvent.setup();
    const submit = screen.getByRole('button', { name: 'Choose folder and build…' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('ai-setup')).toBeNull();
    expect(screen.getByTestId('ai-start-cost').textContent).toContain(
      costSentence('claude-opus-5-5'),
    );
    await user.click(screen.getByText(AI_START_IDEAS[0] as string));
    await user.click(submit);
    expect(onStart).toHaveBeenCalledWith(AI_START_IDEAS[0], []);
  });

  it('shows the set-up card in place, keeps what was typed and goes on once the key works', async () => {
    const ai = fakeAi({ set: false, tail: null });
    const onStart = vi.fn();
    const onKeyReady = vi.fn();
    const view = render(
      <AiStartDialog
        keySet={false}
        ai={ai}
        model="claude-sonnet-5-5"
        onStart={onStart}
        onKeyReady={onKeyReady}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    expect(screen.getByTestId('ai-start-no-key').textContent).toContain(
      'What you typed stays here.',
    );
    expect(screen.getByTestId('ai-setup-cost').textContent).toContain('Claude Sonnet 5.5');
    const submit = screen.getByTestId('ai-start-dialog-submit') as HTMLButtonElement;
    await user.type(screen.getByTestId('ai-start-input'), DESCRIPTION);
    // Without a key it cannot start yet; the text stays.
    expect(submit.disabled).toBe(true);
    await user.type(screen.getByTestId('ai-setup-key'), KEY);
    await user.click(screen.getByTestId('ai-setup-save'));
    await waitFor(() => expect(onStart).toHaveBeenCalledWith(DESCRIPTION, []));
    expect(onKeyReady).toHaveBeenCalledOnce();
    expect(ai.keys).toEqual([KEY]);
    expect((screen.getByTestId('ai-start-input') as HTMLTextAreaElement).value).toBe(DESCRIPTION);
    expect(view.container.ownerDocument.body.textContent).not.toContain(KEY);
  });

  it('keeps the description and the card when the key is not accepted', async () => {
    const ai = fakeAi({ set: false, tail: null });
    ai.testResult = { ok: false, error: 'invalid x-api-key', errorClass: 'AuthenticationError' };
    const onStart = vi.fn();
    render(<AiStartDialog keySet={false} ai={ai} onStart={onStart} onClose={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByTestId('ai-start-input'), DESCRIPTION);
    await user.type(screen.getByTestId('ai-setup-key'), `${KEY}{Enter}`);
    await waitFor(() =>
      expect(screen.getByTestId('ai-setup-result').textContent).toMatch(
        /^Your key was not accepted\./,
      ),
    );
    expect(onStart).not.toHaveBeenCalled();
    expect((screen.getByTestId('ai-start-input') as HTMLTextAreaElement).value).toBe(DESCRIPTION);
    expect((screen.getByTestId('ai-start-dialog-submit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('waits for a description after the key works', async () => {
    const onStart = vi.fn();
    render(
      <AiStartDialog
        keySet={false}
        ai={fakeAi({ set: false, tail: null })}
        onStart={onStart}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByTestId('ai-setup-key'), KEY);
    await user.click(screen.getByTestId('ai-setup-save'));
    await waitFor(() =>
      expect(screen.getByTestId('ai-setup-result').textContent).toBe(
        'The key works. You can start.',
      ),
    );
    expect(onStart).not.toHaveBeenCalled();
    await user.type(screen.getByTestId('ai-start-input'), DESCRIPTION);
    await user.click(screen.getByTestId('ai-start-dialog-submit'));
    expect(onStart).toHaveBeenCalledWith(DESCRIPTION, []);
  });

  it("asks only the mod's name in Very easy and starts in its folder", async () => {
    const onStart = vi.fn(async () => 'A folder called Ruby mod is already there.');
    render(
      <AiStartDialog
        keySet
        parent="/home/ann/Documents/MCSuperMods"
        onStart={onStart}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    expect(screen.queryByRole('button', { name: 'Choose folder and build…' })).toBeNull();
    const submit = screen.getByRole('button', { name: 'Make my mod' });
    expect(screen.getByLabelText('What is your mod called?')).toBeTruthy();
    expect(screen.getByTestId('ai-start-folder').textContent).toBe(
      'It is saved in /home/ann/Documents/MCSuperMods',
    );
    await user.type(screen.getByTestId('ai-start-input'), DESCRIPTION);
    await user.click(submit);
    expect(screen.getByRole('alert').textContent).toBe('Type a name for your mod.');
    expect(onStart).not.toHaveBeenCalled();
    await user.type(screen.getByTestId('ai-start-name'), 'Ruby mod');
    expect(screen.getByTestId('ai-start-folder').textContent).toBe(
      'It is saved in /home/ann/Documents/MCSuperMods/Ruby mod',
    );
    await user.click(submit);
    expect(onStart).toHaveBeenCalledWith(
      DESCRIPTION,
      [],
      '/home/ann/Documents/MCSuperMods/Ruby mod',
    );
    // A failure from the host is said in the dialog, which stays open with what was typed.
    expect((await screen.findByRole('alert')).textContent).toBe(
      'A folder called Ruby mod is already there.',
    );
    expect((screen.getByTestId('ai-start-input') as HTMLTextAreaElement).value).toBe(DESCRIPTION);
  });
});
