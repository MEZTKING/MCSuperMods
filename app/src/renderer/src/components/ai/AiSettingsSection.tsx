import {
  AI_MODELS,
  type AiEffort,
  type AiModelId,
  type AiSettings,
  DEFAULT_AI_SETTINGS,
  modelInfo,
} from '@msm/ai';
import { useCallback, useEffect, useId, useState } from 'react';
import type { AiKeyStatus, AiPlatform } from '../../../../shared/platform';
import { fieldClass } from '../NewElementDialog';
import { Button } from '../ui/Button';
import { AI_PRIVACY_TEXT } from './AiKeyMissing';
import { modelChangeNotice } from './ai-controller';

/** The user guide page of the AI helper. */
export const AI_GUIDE_URL = 'https://meztking.github.io/MCSuperMods/ai-helper';

/** The fallback switch's label (ADR 0041 D7). */
export const AI_FALLBACK_LABEL =
  'Allow Anthropic to answer with another Claude model when a request is declined';

/** The message shown when `safeStorage` cannot encrypt (ADR 0041 D1). */
export const AI_ENCRYPTION_UNAVAILABLE = 'Encrypted storage is not available on this system';

const EFFORTS: readonly { value: AiEffort; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
];

/** The key status line: "Key set (…abcd)" or "No key". */
export function keyStatusText(status: AiKeyStatus | null): string {
  if (status === null) return 'Checking…';
  if (!status.set) return 'No key';
  return status.tail === null ? 'Key set' : `Key set (…${status.tail})`;
}

function errorText(problem: unknown): string {
  return problem instanceof Error ? problem.message : String(problem);
}

/**
 * Settings > "AI helper" (ADR 0041 D1, D7): the API key (stored encrypted by main; the field
 * is cleared after saving and only the last four characters come back), Test and Clear, the
 * model, the effort per mode, the fallback switch, the privacy text and a link to the guide.
 */
export function AiSettingsSection(props: {
  ai: AiPlatform;
  /** Reads the stored AI settings (defaults when unset). */
  load(): Promise<AiSettings>;
  /** Stores the AI settings. */
  save(settings: AiSettings): Promise<void>;
  /** Called after the settings or the key changed (the panel re-reads them). */
  onChanged?: (() => void) | undefined;
  /** The model the open conversation started with, or `null` without one. */
  conversationModel?: AiModelId | null;
}) {
  const { ai, load, onChanged } = props;
  const [status, setStatus] = useState<AiKeyStatus | null>(null);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const keyId = useId();
  const modelId = useId();
  const chatId = useId();
  const buildId = useId();
  const fallbackId = useId();

  const readStatus = useCallback(async () => {
    try {
      setStatus(await ai.keyStatus());
    } catch (problem) {
      setResult({ ok: false, text: errorText(problem) });
    }
  }, [ai]);

  useEffect(() => {
    let live = true;
    void readStatus();
    load().then(
      (loaded) => {
        if (live) setSettings(loaded);
      },
      () => {
        if (live) setSettings(DEFAULT_AI_SETTINGS);
      },
    );
    return () => {
      live = false;
    };
  }, [load, readStatus]);

  const run = async (work: () => Promise<{ ok: boolean; text: string } | null>) => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await work());
    } catch (problem) {
      setResult({ ok: false, text: errorText(problem) });
    } finally {
      setBusy(false);
    }
  };

  const saveKey = () =>
    run(async () => {
      await ai.setKey(key.trim());
      setKey('');
      await readStatus();
      onChanged?.();
      return { ok: true, text: 'Key saved.' };
    });

  const testKey = () =>
    run(async () => {
      const outcome = await ai.testKey();
      return outcome.ok
        ? { ok: true, text: 'The key works.' }
        : { ok: false, text: `The key test failed (${outcome.errorClass}): ${outcome.error}` };
    });

  const clearKey = () =>
    run(async () => {
      await ai.clearKey();
      await readStatus();
      onChanged?.();
      return { ok: true, text: 'Key cleared.' };
    });

  const change = async (next: AiSettings) => {
    const previous = settings;
    setSettings(next);
    try {
      await props.save(next);
      onChanged?.();
    } catch (problem) {
      setSettings(previous);
      setResult({ ok: false, text: errorText(problem) });
    }
  };

  const encryption = status?.encryptionAvailable !== false;
  const current = settings ?? DEFAULT_AI_SETTINGS;
  const model = modelInfo(current.model);

  return (
    <section className="flex flex-col gap-1.5" data-testid="settings-ai" aria-label="AI helper">
      <h3 className="mt-3 font-semibold">AI helper</h3>
      <p className="text-xs text-muted" data-testid="settings-ai-privacy">
        {AI_PRIVACY_TEXT}
      </p>
      <p className="text-sm" role="status" data-testid="settings-ai-key-status">
        {keyStatusText(status)}
      </p>
      {!encryption && (
        <p className="text-sm text-error" data-testid="settings-ai-encryption">
          {AI_ENCRYPTION_UNAVAILABLE}, so a key cannot be saved.
        </p>
      )}
      <label htmlFor={keyId}>Anthropic API key</label>
      <input
        id={keyId}
        type="password"
        autoComplete="off"
        spellCheck={false}
        className={fieldClass}
        data-testid="settings-ai-key"
        value={key}
        placeholder={
          status?.set === true ? 'Enter a new key to replace the stored one' : 'sk-ant-…'
        }
        onChange={(event) => setKey(event.target.value)}
        onKeyDown={(event) => {
          // The dialog is a form: Enter here saves the key, not the folder.
          if (event.key === 'Enter') {
            event.preventDefault();
            if (key.trim() !== '' && encryption && !busy) void saveKey();
          }
        }}
      />
      <div className="flex flex-wrap gap-1.5">
        <Button
          data-testid="settings-ai-save-key"
          disabled={busy || !encryption || key.trim() === ''}
          onClick={() => void saveKey()}
        >
          Save key
        </Button>
        <Button
          data-testid="settings-ai-test-key"
          disabled={busy || status?.set !== true}
          onClick={() => void testKey()}
        >
          Test key
        </Button>
        <Button
          data-testid="settings-ai-clear-key"
          disabled={busy || status?.set !== true}
          onClick={() => void clearKey()}
        >
          Clear key
        </Button>
      </div>
      {result !== null && (
        <p
          className={`text-sm ${result.ok ? '' : 'text-error'}`}
          role={result.ok ? 'status' : 'alert'}
          data-testid="settings-ai-result"
        >
          {result.text}
        </p>
      )}
      <label htmlFor={modelId}>Model</label>
      <select
        id={modelId}
        className={fieldClass}
        data-testid="settings-ai-model"
        value={current.model}
        disabled={settings === null}
        onChange={(event) => void change({ ...current, model: event.target.value as AiModelId })}
      >
        {AI_MODELS.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label} (about ${entry.pricing.inputPerMTok} in, ${entry.pricing.outputPerMTok}{' '}
            out per million tokens)
          </option>
        ))}
      </select>
      {props.conversationModel != null && props.conversationModel !== current.model && (
        <p className="text-xs text-muted" data-testid="settings-ai-model-notice">
          {modelChangeNotice(current.model)}
        </p>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <span className="flex flex-col gap-0.5">
          <label htmlFor={chatId}>Effort in chat</label>
          <select
            id={chatId}
            className={fieldClass}
            data-testid="settings-ai-effort-chat"
            value={current.effort.chat}
            disabled={settings === null}
            onChange={(event) =>
              void change({
                ...current,
                effort: { ...current.effort, chat: event.target.value as AiEffort },
              })
            }
          >
            {EFFORTS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </span>
        <span className="flex flex-col gap-0.5">
          <label htmlFor={buildId}>Effort in build</label>
          <select
            id={buildId}
            className={fieldClass}
            data-testid="settings-ai-effort-build"
            value={current.effort.build}
            disabled={settings === null}
            onChange={(event) =>
              void change({
                ...current,
                effort: { ...current.effort, build: event.target.value as AiEffort },
              })
            }
          >
            {EFFORTS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </span>
      </div>
      <span className="flex items-start gap-1.5">
        <input
          id={fallbackId}
          type="checkbox"
          className="mt-1"
          data-testid="settings-ai-fallbacks"
          checked={current.fallbacks}
          disabled={settings === null}
          onChange={(event) => void change({ ...current, fallbacks: event.target.checked })}
        />
        <label htmlFor={fallbackId}>{AI_FALLBACK_LABEL}</label>
      </span>
      {!model.supportsFallbacks && (
        <p className="text-xs text-muted">{model.label} has no fallback model.</p>
      )}
      <p className="text-xs text-muted">
        Prices are approximate (checked on {model.pricing.checkedOn}); the panel shows each
        conversation's usage. Run limits per mode are changed in the panel for one run.{' '}
        <a
          href={AI_GUIDE_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent underline"
        >
          AI helper guide
        </a>
      </p>
    </section>
  );
}
