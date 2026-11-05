// @vitest-environment happy-dom
import { DEFAULT_AI_SETTINGS } from '@msm/ai';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AI_FALLBACK_LABEL,
  AiSettingsSection,
  keyStatusText,
} from '../../src/renderer/src/components/ai/AiSettingsSection';
import { SettingsDialog } from '../../src/renderer/src/components/SettingsDialog';
import type { AppSettingsPatch } from '../../src/shared/platform';
import { type FakeAi, fakeAi } from './ai-fixtures';

afterEach(cleanup);

function renderSection(ai: FakeAi = fakeAi()) {
  const save = vi.fn(async () => {});
  const onChanged = vi.fn();
  render(
    <AiSettingsSection
      ai={ai}
      load={async () => DEFAULT_AI_SETTINGS}
      save={save}
      onChanged={onChanged}
      conversationModel="claude-opus-5-5"
    />,
  );
  return { ai, save, onChanged, user: userEvent.setup() };
}

const status = () => screen.getByTestId('settings-ai-key-status').textContent;
const button = (id: string) => screen.getByTestId(id) as HTMLButtonElement;

describe('AiSettingsSection', () => {
  it('saves the key, clears the field and shows only the tail', async () => {
    const { ai, user, onChanged } = renderSection(fakeAi({ set: false, tail: null }));
    await waitFor(() => expect(status()).toBe('No key'));
    const input = screen.getByTestId('settings-ai-key') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(button('settings-ai-save-key').disabled).toBe(true);
    expect(button('settings-ai-test-key').disabled).toBe(true);
    await user.type(input, 'sk-ant-test-wxyz');
    await user.click(button('settings-ai-save-key'));
    await waitFor(() => expect(status()).toBe('Key set (…wxyz)'));
    expect(ai.keys).toEqual(['sk-ant-test-wxyz']);
    expect(input.value).toBe('');
    expect(onChanged).toHaveBeenCalled();
    expect(screen.getByTestId('settings-ai-result').textContent).toBe('Key saved.');
  });

  it('tests the key and reports a failure with its error class', async () => {
    const { ai, user } = renderSection();
    await waitFor(() => expect(status()).toBe('Key set (…abcd)'));
    await user.click(button('settings-ai-test-key'));
    expect(await screen.findByText('The key works.')).toBeTruthy();
    ai.testResult = { ok: false, error: 'invalid x-api-key', errorClass: 'AuthenticationError' };
    await user.click(button('settings-ai-test-key'));
    expect(
      await screen.findByText('The key test failed (AuthenticationError): invalid x-api-key'),
    ).toBeTruthy();
  });

  it('clears the key', async () => {
    const { ai, user } = renderSection();
    await waitFor(() => expect(button('settings-ai-clear-key').disabled).toBe(false));
    await user.click(button('settings-ai-clear-key'));
    await waitFor(() => expect(status()).toBe('No key'));
    expect(ai.clears).toBe(1);
  });

  it('says when encrypted storage is unavailable and disables Save', async () => {
    const { user } = renderSection(fakeAi({ set: false, tail: null, encryptionAvailable: false }));
    expect((await screen.findByTestId('settings-ai-encryption')).textContent).toContain(
      'Encrypted storage is not available on this system',
    );
    await user.type(screen.getByTestId('settings-ai-key'), 'sk-ant-x');
    expect(button('settings-ai-save-key').disabled).toBe(true);
  });

  it('saves the model, efforts and fallback switch, and notes a model change', async () => {
    const { save, user } = renderSection();
    const model = screen.getByTestId('settings-ai-model') as HTMLSelectElement;
    await waitFor(() => expect(model.disabled).toBe(false));
    expect(screen.queryByTestId('settings-ai-model-notice')).toBeNull();
    await user.selectOptions(model, 'claude-sonnet-5-5');
    expect(save).toHaveBeenLastCalledWith({ ...DEFAULT_AI_SETTINGS, model: 'claude-sonnet-5-5' });
    expect(screen.getByTestId('settings-ai-model-notice').textContent).toBe(
      'Start a new conversation to use Sonnet 5.5.',
    );
    await user.selectOptions(screen.getByTestId('settings-ai-effort-build'), 'xhigh');
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ effort: { chat: 'medium', build: 'xhigh' } }),
    );
    const fallback = screen.getByRole('checkbox', { name: AI_FALLBACK_LABEL }) as HTMLInputElement;
    expect(fallback.checked).toBe(true);
    await user.click(fallback);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ fallbacks: false }));
    expect(screen.getByTestId('settings-ai-privacy').textContent).toContain(
      'Nothing is sent until you send a message.',
    );
    expect(screen.getByRole('link', { name: 'AI helper guide' }).getAttribute('href')).toBe(
      'https://meztking.github.io/MCSuperMods/ai-helper',
    );
  });

  it('formats the key status', () => {
    expect(keyStatusText(null)).toBe('Checking…');
    expect(keyStatusText({ set: false, tail: null, encryptionAvailable: true })).toBe('No key');
    expect(keyStatusText({ set: true, tail: '1234', encryptionAvailable: true })).toBe(
      'Key set (…1234)',
    );
  });
});

describe('SettingsDialog AI helper section', () => {
  it('is shown with the AI services and saves through the settings patch', async () => {
    const save = vi.fn(async (_patch: AppSettingsPatch) => {});
    render(
      <SettingsDialog
        mcVersion="1.0-test"
        status={null}
        progress={null}
        load={async () => ({
          minecraftDir: null,
          updates: { autoCheck: true },
          detectedMinecraftDir: null,
          ai: DEFAULT_AI_SETTINGS,
        })}
        save={save}
        browse={async () => null}
        extract={async () => null}
        onClose={vi.fn()}
        ai={fakeAi()}
      />,
    );
    expect(await screen.findByTestId('settings-ai')).toBeTruthy();
    const model = screen.getByTestId('settings-ai-model') as HTMLSelectElement;
    await waitFor(() => expect(model.disabled).toBe(false));
    await userEvent.setup().selectOptions(model, 'claude-haiku-5-5');
    expect(save).toHaveBeenCalledWith({
      ai: { ...DEFAULT_AI_SETTINGS, model: 'claude-haiku-5-5' },
    });
  });

  it('is left out without the AI services', async () => {
    render(
      <SettingsDialog
        mcVersion="1.0-test"
        status={null}
        progress={null}
        load={async () => ({
          minecraftDir: null,
          updates: { autoCheck: true },
          detectedMinecraftDir: null,
        })}
        save={vi.fn(async () => {})}
        browse={async () => null}
        extract={async () => null}
        onClose={vi.fn()}
      />,
    );
    await screen.findByTestId('settings-dialog');
    expect(screen.queryByTestId('settings-ai')).toBeNull();
  });
});
