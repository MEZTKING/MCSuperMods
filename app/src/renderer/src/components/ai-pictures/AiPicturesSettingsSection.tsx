/**
 * Settings > "AI pictures" (ADR 0093 D1): choose the image service, paste its key (stored
 * encrypted by main; the field is cleared after saving and only the last four characters come
 * back), "Test key" and "Clear key", and what is sent: the description only, never project
 * files.
 *
 * Test ids: `settings-ai-pictures`, `settings-ai-pictures-service`, `settings-ai-pictures-status`,
 * `settings-ai-pictures-key`, `settings-ai-pictures-save-key`, `settings-ai-pictures-test-key`,
 * `settings-ai-pictures-clear-key`, `settings-ai-pictures-result`, `settings-ai-pictures-privacy`.
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useId, useState } from 'react';
import {
  AI_PICTURE_SERVICE_INFO,
  AI_PICTURE_SERVICES,
  type AiPictureServiceId,
  type AiPicturesPlatform,
  type AiPicturesStatus,
} from '../../../../shared/ai-pictures';
import { fieldClass } from '../NewElementDialog';
import { Button } from '../ui/Button';

/** What is sent, in plain words. */
export const AI_PICTURES_PRIVACY_TEXT =
  'AI pictures send only the description you type (and the style) to the image service you choose, with your own key. Your project files and other pictures are never sent. The service charges your account for each picture.';

function errorText(problem: unknown): string {
  return problem instanceof Error ? problem.message : String(problem);
}

/** The key line of a service: "Key set (…abcd)" or "No key". */
export function aiPicturesKeyText(status: AiPicturesStatus | null, service: AiPictureServiceId) {
  if (status === null) return 'Checking…';
  const key = status.keys[service];
  if (!key.set) return 'No key';
  return key.tail === null ? 'Key set' : `Key set (…${key.tail})`;
}

export function AiPicturesSettingsSection(props: {
  aiPictures: AiPicturesPlatform;
  /** Called after the service or a key changed. */
  onChanged?: (() => void) | undefined;
}) {
  const { aiPictures, onChanged } = props;
  const [status, setStatus] = useState<AiPicturesStatus | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const serviceId = useId();
  const keyId = useId();

  const read = useCallback(async () => {
    try {
      setStatus(await aiPictures.status());
    } catch (problem) {
      setResult({ ok: false, text: errorText(problem) });
    }
  }, [aiPictures]);

  useEffect(() => {
    void read();
  }, [read]);

  const service = status?.service ?? 'retro-diffusion';
  const info = AI_PICTURE_SERVICE_INFO[service];
  const encryption = status?.encryptionAvailable !== false;
  const keySet = status?.keys[service].set === true;

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

  const choose = (next: AiPictureServiceId) =>
    run(async () => {
      await aiPictures.setService(next);
      await read();
      onChanged?.();
      return null;
    });

  const save = () =>
    run(async () => {
      await aiPictures.setKey(service, key.trim());
      setKey('');
      await read();
      onChanged?.();
      return { ok: true, text: 'Key saved.' };
    });

  const test = () =>
    run(async () => {
      const outcome = await aiPictures.testKey(service);
      return outcome.ok
        ? { ok: true, text: 'The key works.' }
        : { ok: false, text: `The key test failed: ${outcome.error}` };
    });

  const clear = () =>
    run(async () => {
      await aiPictures.clearKey(service);
      await read();
      onChanged?.();
      return { ok: true, text: 'Key cleared.' };
    });

  return (
    <section
      className="flex flex-col gap-1.5"
      data-testid="settings-ai-pictures"
      aria-label="AI pictures"
    >
      <h3 className="mt-3 font-semibold">AI pictures</h3>
      <p className="text-xs text-muted" data-testid="settings-ai-pictures-privacy">
        {AI_PICTURES_PRIVACY_TEXT}
      </p>
      <div className="flex flex-col gap-1.5" data-setting="ai-pictures-service">
        <label htmlFor={serviceId}>Image service</label>
        <select
          id={serviceId}
          data-testid="settings-ai-pictures-service"
          className={fieldClass}
          value={service}
          disabled={busy || status === null}
          onChange={(event) => void choose(event.target.value as AiPictureServiceId)}
        >
          {AI_PICTURE_SERVICES.map((id) => (
            <option key={id} value={id}>
              {AI_PICTURE_SERVICE_INFO[id].label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted">
          {info.blurb} Get a key at {info.signUp}
        </p>
      </div>
      <p className="text-sm" role="status" data-testid="settings-ai-pictures-status">
        {aiPicturesKeyText(status, service)}
      </p>
      {!encryption && (
        <p className="text-sm text-error">
          Encrypted storage is not available on this system, so a key cannot be saved.
        </p>
      )}
      <div className="flex flex-col gap-1.5" data-setting="ai-pictures-key">
        <label htmlFor={keyId}>Image service key</label>
        <input
          id={keyId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          className={fieldClass}
          data-testid="settings-ai-pictures-key"
          value={key}
          placeholder={keySet ? 'Enter a new key to replace the stored one' : info.keyHint}
          onChange={(event) => setKey(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (key.trim() !== '' && encryption && !busy) void save();
            }
          }}
        />
        <div className="flex flex-wrap gap-1.5">
          <Button
            data-testid="settings-ai-pictures-save-key"
            disabled={busy || !encryption || key.trim() === ''}
            onClick={() => void save()}
          >
            Save key
          </Button>
          <Button
            data-testid="settings-ai-pictures-test-key"
            disabled={busy || !keySet}
            onClick={() => void test()}
          >
            Test key
          </Button>
          <Button
            data-testid="settings-ai-pictures-clear-key"
            disabled={busy || !keySet}
            onClick={() => void clear()}
          >
            Clear key
          </Button>
        </div>
      </div>
      {result !== null && (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={result.ok ? 'text-sm' : 'text-sm text-error'}
          data-testid="settings-ai-pictures-result"
        >
          {result.text}
        </p>
      )}
    </section>
  );
}
