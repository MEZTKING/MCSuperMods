// @vitest-environment happy-dom
import { AI_MODELS, DEFAULT_AI_SETTINGS, formatCost, typicalCost } from '@msm/ai';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiKeySetup } from '../../src/renderer/src/components/ai/AiKeySetup';
import { LIMIT_BOUNDS } from '../../src/renderer/src/components/ai/AiLimitsPopover';
import {
  AI_FALLBACK_LABEL,
  AiSettingsSection,
  keyStatusText,
} from '../../src/renderer/src/components/ai/AiSettingsSection';
import { LIMIT_RANGES } from '../../src/renderer/src/components/ai/ai-limits-model';
import {
  ANTHROPIC_KEYS_URL,
  costSentence,
  keyCheckWords,
  plainSetupStrings,
  SETUP_WORDS,
} from '../../src/renderer/src/components/ai/ai-setup-words';
import { SettingsDialog } from '../../src/renderer/src/components/SettingsDialog';
import type { AppSettingsPatch } from '../../src/shared/platform';
import { type FakeAi, fakeAi } from './ai-fixtures';

/** Words Very easy never shows (ADR 0125 D13), and an id or a kind id. */
const FORBIDDEN =
  /\b(json|api|tokens?|tool turns?|elements?|changesets?|schemas?|starters?|requests?|placeholders?)\b/i;
const ID = /\b[a-z0-9_.-]+:[a-z0-9_./-]+/;

/** The plain words check: what Very easy may show. */
function expectPlain(text: string): void {
  expect(text).not.toMatch(FORBIDDEN);
  expect(text).not.toMatch(ID);
  expect(text).not.toMatch(/\bmsm:|\bminecraft:/);
}

const KEY = 'sk-ant-test-0123456789-wxyz';

afterEach(cleanup);

function renderSection(ai: FakeAi = fakeAi(), focusKey = false) {
  const save = vi.fn(async () => {});
  const onChanged = vi.fn();
  const view = render(
    <AiSettingsSection
      ai={ai}
      load={async () => DEFAULT_AI_SETTINGS}
      save={save}
      onChanged={onChanged}
      conversationModel="claude-opus-5-5"
      focusKey={focusKey}
    />,
  );
  return { ai, save, onChanged, user: userEvent.setup(), container: view.container };
}

const status = () => screen.getByTestId('settings-ai-key-status').textContent;
const button = (id: string) => screen.getByTestId(id) as HTMLButtonElement;
const result = () => screen.getByTestId('ai-setup-result').textContent;

describe('AiKeySetup words (ADR 0125 D5, D8)', () => {
  it('says the typical cost from the price table, never a typed number', () => {
    for (const model of AI_MODELS) {
      const cost = typicalCost(model.id);
      const sentence = costSentence(model.id);
      expect(sentence).toContain(model.label);
      expect(sentence).toContain(formatCost(cost.firstQuestion));
      expect(sentence).toContain(formatCost(cost.followUp));
    }
    // A different price table gives a different sentence: nothing is typed by hand.
    expect(costSentence('claude-opus-5-5', { firstQuestion: 1.5, followUp: 0.25 })).toContain(
      'about $1.50',
    );
  });

  it('has no id and none of the words Very easy never shows', () => {
    for (const model of AI_MODELS) {
      for (const text of plainSetupStrings(model.id)) expectPlain(text);
    }
  });

  it('turns every key check into a plain sentence without the class or the raw text', () => {
    const cases: [string, string, RegExp][] = [
      ['AuthenticationError', 'invalid x-api-key', /^Your key was not accepted\./],
      ['PermissionDeniedError', 'denied', /may not use Claude/],
      ['APIError', '402 {"type":"error","error":{"type":"billing_error"}}', /no credit left/],
      ['InternalServerError', '529 {"error":{"type":"overloaded_error"}}', /busy just now/],
      ['RateLimitError', 'slow down', /busy just now/],
      ['APIConnectionError', 'fetch failed', /No connection to Anthropic/],
      ['APIConnectionTimeoutError', 'timed out', /busy just now/],
      ['ClientLoadError', 'missing chunk', /could not be checked/],
      ['NoKey', 'No API key is saved.', /^No key is saved yet\./],
    ];
    for (const [errorClass, error, sentence] of cases) {
      const words = keyCheckWords({ ok: false, error, errorClass });
      expect(words.ok).toBe(false);
      expect(words.text).toMatch(sentence);
      expect(words.text).not.toContain(errorClass);
      expect(words.text).not.toContain(error);
    }
    expect(keyCheckWords({ ok: true, model: 'claude-haiku-5-5' })).toEqual({
      ok: true,
      text: 'The key works. You can start.',
      checkAgain: false,
    });
    expect(
      keyCheckWords({ ok: false, error: 'x', errorClass: 'AuthenticationError' }).checkAgain,
    ).toBe(false);
  });
});

describe('AiKeySetup', () => {
  it('shows the three steps, the cost and what is sent', async () => {
    render(<AiKeySetup ai={fakeAi({ set: false, tail: null })} model="claude-opus-5-5" />);
    const card = screen.getByTestId('ai-setup');
    expect(card.textContent).toContain(SETUP_WORDS.heading);
    expect(card.textContent).toContain('1. Get a key');
    expect(card.textContent).toContain('2. Paste it here');
    expect(card.textContent).toContain('3.');
    expect(screen.getByTestId('ai-setup-cost').textContent).toContain(
      costSentence('claude-opus-5-5'),
    );
    const site = screen.getByRole('link', { name: "Open Anthropic's site" });
    expect(site.getAttribute('href')).toBe(ANTHROPIC_KEYS_URL);
    expect(ANTHROPIC_KEYS_URL.startsWith('https:')).toBe(true);
    expect(site.getAttribute('target')).toBe('_blank');
    const sent = screen.getByTestId('ai-setup-sent').textContent ?? '';
    expect(sent).toContain('Sent to Anthropic when you press Send:');
    expect(sent).toContain('Never sent:');
    expect(sent).toContain('Where files are on your computer.');
    expect((screen.getByLabelText('2. Paste it here') as HTMLInputElement).type).toBe('password');
    expectPlain(card.textContent ?? '');
  });

  it('saves and checks at once: a wrong key is said right after saving and kept', async () => {
    const ai = fakeAi({ set: false, tail: null });
    ai.testResult = { ok: false, error: 'invalid x-api-key', errorClass: 'AuthenticationError' };
    const onReady = vi.fn();
    const onChanged = vi.fn();
    const view = render(
      <AiKeySetup ai={ai} model="claude-opus-5-5" onReady={onReady} onChanged={onChanged} />,
    );
    const user = userEvent.setup();
    expect(button('ai-setup-save').disabled).toBe(true);
    await user.type(screen.getByTestId('ai-setup-key'), KEY);
    await user.click(button('ai-setup-save'));
    await waitFor(() => expect(result()).toMatch(/^Your key was not accepted\./));
    expect(ai.keys).toEqual([KEY]);
    expect(ai.status.set).toBe(true);
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ set: true }));
    expect(onReady).not.toHaveBeenCalled();
    expect((screen.getByTestId('ai-setup-key') as HTMLInputElement).value).toBe('');
    expect(view.container.textContent).not.toContain(KEY);
    expect(view.container.textContent).not.toContain('AuthenticationError');
  });

  it('offers Check again when Anthropic could not be asked, and passes on a working key', async () => {
    const ai = fakeAi({ set: false, tail: null });
    ai.testResult = { ok: false, error: 'fetch failed', errorClass: 'APIConnectionError' };
    const onReady = vi.fn();
    render(<AiKeySetup ai={ai} model="claude-opus-5-5" onReady={onReady} />);
    const user = userEvent.setup();
    const field = screen.getByTestId('ai-setup-key');
    await user.type(field, `${KEY}{Enter}`);
    await waitFor(() => expect(result()).toMatch(/No connection to Anthropic/));
    ai.testResult = { ok: true, model: 'claude-haiku-5-5' };
    await user.click(await screen.findByTestId('ai-setup-check-again'));
    await waitFor(() => expect(result()).toBe('The key works. You can start.'));
    expect(onReady).toHaveBeenCalledOnce();
    expect(ai.keys).toEqual([KEY]);
  });

  it('says when this computer cannot keep a key and does not save', async () => {
    render(
      <AiKeySetup
        ai={fakeAi({ set: false, tail: null, encryptionAvailable: false })}
        model="claude-opus-5-5"
      />,
    );
    expect((await screen.findByTestId('ai-setup-encryption')).textContent).toBe(
      SETUP_WORDS.noEncryption,
    );
    expect(button('ai-setup-save').disabled).toBe(true);
  });
});

describe('AiSettingsSection', () => {
  it('saves and checks the key, clears the field and shows only the tail', async () => {
    const { ai, user, onChanged, container } = renderSection(fakeAi({ set: false, tail: null }));
    await waitFor(() => expect(status()).toBe('No key'));
    expect(button('ai-setup-check-again').disabled).toBe(true);
    const input = screen.getByTestId('ai-setup-key') as HTMLInputElement;
    await user.type(input, KEY);
    await user.click(button('ai-setup-save'));
    await waitFor(() => expect(status()).toBe('Key set (…wxyz)'));
    await waitFor(() => expect(result()).toBe('The key works. You can start.'));
    expect(ai.keys).toEqual([KEY]);
    expect(input.value).toBe('');
    expect(onChanged).toHaveBeenCalled();
    expect(container.textContent).not.toContain(KEY);
  });

  it('checks the saved key again and says a failure in plain words', async () => {
    const { ai, user } = renderSection();
    await waitFor(() => expect(status()).toBe('Key set (…abcd)'));
    await user.click(button('ai-setup-check-again'));
    await waitFor(() => expect(result()).toBe('The key works. You can start.'));
    ai.testResult = { ok: false, error: 'invalid x-api-key', errorClass: 'AuthenticationError' };
    await user.click(button('ai-setup-check-again'));
    await waitFor(() => expect(result()).toMatch(/^Your key was not accepted\./));
    expect(result()).not.toContain('AuthenticationError');
    expect(result()).not.toContain('invalid x-api-key');
  });

  it('removes the key', async () => {
    const { ai, user } = renderSection();
    await waitFor(() => expect(button('ai-setup-remove').disabled).toBe(false));
    await user.click(button('ai-setup-remove'));
    await waitFor(() => expect(status()).toBe('No key'));
    expect(result()).toBe('The key is removed.');
    expect(ai.clears).toBe(1);
  });

  it('saves the model, efforts and fallback switch, and notes a model change', async () => {
    const { save, user } = renderSection();
    const model = screen.getByTestId('settings-ai-model') as HTMLSelectElement;
    await waitFor(() => expect(model.disabled).toBe(false));
    expect(screen.queryByTestId('settings-ai-model-notice')).toBeNull();
    expect(model.options[0]?.textContent).toBe(
      `Claude Opus 5.5 (a first question ${formatCost(typicalCost('claude-opus-5-5').firstQuestion)})`,
    );
    await user.selectOptions(model, 'claude-sonnet-5-5');
    expect(save).toHaveBeenLastCalledWith({ ...DEFAULT_AI_SETTINGS, model: 'claude-sonnet-5-5' });
    expect(screen.getByTestId('settings-ai-model-notice').textContent).toBe(
      'Start a new chat to use Sonnet 5.5.',
    );
    // The cost sentence follows the chosen model.
    expect(screen.getByTestId('ai-setup-cost').textContent).toContain('Claude Sonnet 5.5');
    expect(screen.getByLabelText('Effort for questions and small changes')).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Effort for whole builds'), 'xhigh');
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ effort: { chat: 'medium', build: 'xhigh' } }),
    );
    const fallback = screen.getByRole('checkbox', { name: AI_FALLBACK_LABEL }) as HTMLInputElement;
    expect(fallback.checked).toBe(true);
    await user.click(fallback);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ fallbacks: false }));
    expect(screen.getByTestId('settings-ai-privacy').textContent).toContain(
      'Nothing is sent until you press Send.',
    );
    expect(screen.getByRole('link', { name: 'AI helper guide' }).getAttribute('href')).toBe(
      'https://meztking.github.io/MCSuperMods/ai-helper',
    );
  });

  it('keeps the default limits under More options (ADR 0130)', async () => {
    window.msmMoreOptionsOpen = false;
    try {
      const plain = renderSection();
      await waitFor(() => expect(status()).toBe('Key set (…abcd)'));
      expect(screen.queryByTestId('settings-ai-limits')).toBeNull();
      // Nothing in the default view says an id or a word it never shows.
      expectPlain(plain.container.textContent ?? '');
      fireEvent.click(screen.getByTestId('more-options-settings-ai'));
      expect(screen.getByTestId('settings-ai-limits')).toBeTruthy();
    } finally {
      window.msmMoreOptionsOpen = true;
    }
  });

  it('edits the default limits under More options, within the bounds, with the worst-case cost', async () => {
    const { save, user } = renderSection();
    const steps = (await screen.findByTestId('settings-ai-limit-steps-chat')) as HTMLInputElement;
    await waitFor(() =>
      expect((screen.getByTestId('settings-ai-model') as HTMLSelectElement).disabled).toBe(false),
    );
    expect(steps.value).toBe(String(DEFAULT_AI_SETTINGS.limits.chat.maxToolTurns));
    expect(screen.getByTestId('settings-ai-limits-chat').textContent).toContain(
      'Stop a small ask after',
    );
    expect(screen.getByTestId('settings-ai-limits-build').textContent).toContain(
      'Stop a whole build after',
    );
    expect(screen.getByTestId('settings-ai-limits-build').textContent).toContain('tokens written');
    expect(screen.getByTestId('settings-ai-limit-cost-chat').textContent).toMatch(
      /^A small ask stopped at these limits has cost at most about \$\d+\.\d\d with Claude Opus 5\.5/,
    );
    await user.clear(steps);
    await user.type(steps, '40');
    await waitFor(() =>
      expect(save).toHaveBeenLastCalledWith({
        ...DEFAULT_AI_SETTINGS,
        limits: {
          ...DEFAULT_AI_SETTINGS.limits,
          chat: { ...DEFAULT_AI_SETTINGS.limits.chat, maxToolTurns: 40 },
        },
      }),
    );
    const tokens = screen.getByTestId('settings-ai-limit-tokens-build') as HTMLInputElement;
    await user.clear(tokens);
    await user.type(tokens, '99999999');
    tokens.blur();
    await waitFor(() =>
      expect(save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          limits: expect.objectContaining({
            build: expect.objectContaining({ maxOutputTokens: 5_000_000 }),
          }),
        }),
      ),
    );
    await user.click(screen.getByTestId('settings-ai-limit-pace-build'));
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        limits: expect.objectContaining({
          build: expect.objectContaining({ taskBudget: false }),
        }),
      }),
    );
    // More options names the price per million tokens.
    expect(screen.getByTestId('settings-ai-model-details').textContent).toBe(
      'Claude Opus 5.5 (about $4 in, $20 out per million tokens)',
    );
  });

  it('uses the bounds of the Run limits popover', () => {
    expect(LIMIT_BOUNDS).toEqual({
      toolTurns: LIMIT_RANGES.steps,
      outputTokens: LIMIT_RANGES.tokens,
    });
  });

  it('formats the key status', () => {
    expect(keyStatusText(null)).toBe('Checking…');
    expect(keyStatusText({ set: false, tail: null, encryptionAvailable: true })).toBe('No key');
    expect(keyStatusText({ set: true, tail: '1234', encryptionAvailable: true })).toBe(
      'Key set (…1234)',
    );
  });
});

const settingsView = () => ({
  minecraftDir: null,
  updates: { autoCheck: true },
  detectedMinecraftDir: null,
  ai: DEFAULT_AI_SETTINGS,
});

describe('SettingsDialog AI helper section', () => {
  it('is shown with the AI services and saves through the settings patch', async () => {
    const save = vi.fn(async (_patch: AppSettingsPatch) => {});
    render(
      <SettingsDialog
        mcVersion="1.0-test"
        status={null}
        progress={null}
        load={async () => settingsView()}
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

  it("opens on the helper's section with the key field focused (focus: 'ai')", async () => {
    const scrolled: Element[] = [];
    const spy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function (
      this: HTMLElement,
    ) {
      scrolled.push(this);
    });
    try {
      render(
        <SettingsDialog
          mcVersion="1.0-test"
          status={null}
          progress={null}
          load={async () => settingsView()}
          save={vi.fn(async () => {})}
          browse={async () => null}
          extract={async () => null}
          onClose={vi.fn()}
          ai={fakeAi({ set: false, tail: null })}
          focus="ai"
        />,
      );
      const section = await screen.findByTestId('settings-ai');
      await waitFor(() => expect(scrolled).toContain(section));
      await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('ai-setup-key')));
    } finally {
      spy.mockRestore();
    }
  });

  it('opens at its top without a focus', async () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
    try {
      render(
        <SettingsDialog
          mcVersion="1.0-test"
          status={null}
          progress={null}
          load={async () => settingsView()}
          save={vi.fn(async () => {})}
          browse={async () => null}
          extract={async () => null}
          onClose={vi.fn()}
          ai={fakeAi()}
        />,
      );
      await screen.findByTestId('settings-ai');
      expect(spy).not.toHaveBeenCalled();
      expect(document.activeElement).not.toBe(screen.getByTestId('ai-setup-key'));
    } finally {
      spy.mockRestore();
    }
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
