/**
 * The AI helper's set-up card (ADR 0125 D5, D8): get a key, paste it, **Save and check**. Shown
 * in the panel without a key, in New project with the AI helper and at the head of Settings'
 * section. The key goes from the field to main through `ai:setKey` and is never read back; only
 * its last four characters are ever shown.
 *
 * @packageDocumentation
 */

import type { AiModelId } from '@msm/ai';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { AiKeyStatus, AiPlatform } from '../../../../shared/platform';
import { fieldClass } from '../NewElementDialog';
import { Button, buttonClass } from '../ui/Button';
import {
  ANTHROPIC_KEYS_URL,
  introSentence,
  type KeyCheckWords,
  keyCheckWords,
  SETUP_WORDS,
} from './ai-setup-words';

/** The key status line of Settings: "Key set (…abcd)" or "No key". */
export function keyStatusText(status: AiKeyStatus | null): string {
  if (status === null) return 'Checking…';
  if (!status.set) return 'No key';
  return status.tail === null ? 'Key set' : `Key set (…${status.tail})`;
}

/** What is sent and what never is, as two short lists. */
export function AiWhatIsSent(props: { testId?: string }) {
  return (
    <div className="flex flex-col gap-1 text-xs text-muted" data-testid={props.testId}>
      <p className="font-medium text-text">{SETUP_WORDS.whatIsSent}</p>
      <p>{SETUP_WORDS.sentHeading}</p>
      <ul className="m-0 list-disc pl-4">
        {SETUP_WORDS.sent.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p>{SETUP_WORDS.neverSentHeading}</p>
      <ul className="m-0 list-disc pl-4">
        {SETUP_WORDS.neverSent.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p>{SETUP_WORDS.nothingUntilSend}</p>
    </div>
  );
}

/** Props of {@link AiKeySetup}. */
export interface AiKeySetupProps {
  /** Main's AI services; without them the card cannot save and says nothing more. */
  ai: AiPlatform | undefined;
  /** The model the cost sentence is about (the settings' model). */
  model: AiModelId;
  /** After a key was saved or removed, with the new status. */
  onChanged?: ((status: AiKeyStatus) => void) | undefined;
  /** After a check passed. */
  onReady?: (() => void) | undefined;
  /** Focus the key field when the card appears. */
  autoFocus?: boolean;
  /** Settings: the saved key's line, **Check again** and **Remove the key**. */
  manage?: boolean;
  /** Leave out the card's own heading (Settings has the section's). */
  hideHeading?: boolean;
  /** The test id of the saved key's line (Settings keeps `settings-ai-key-status`). */
  statusTestId?: string;
  /** The test id of "What is sent" (Settings keeps `settings-ai-privacy`). */
  sentTestId?: string;
}

function errorText(problem: unknown): string {
  return problem instanceof Error ? problem.message : String(problem);
}

type Phase = 'idle' | 'saving' | 'checking';

/** The three-step card. */
export function AiKeySetup(props: AiKeySetupProps) {
  const { ai, onChanged, onReady } = props;
  const [status, setStatus] = useState<AiKeyStatus | null>(null);
  const [key, setKey] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<KeyCheckWords | null>(null);
  const keyId = useId();
  const keyRef = useRef<HTMLInputElement>(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const readStatus = useCallback(async (): Promise<AiKeyStatus | null> => {
    if (ai === undefined) return null;
    try {
      const next = await ai.keyStatus();
      if (live.current) setStatus(next);
      return next;
    } catch (problem) {
      if (live.current) setResult({ ok: false, text: errorText(problem), checkAgain: false });
      return null;
    }
  }, [ai]);

  useEffect(() => {
    void readStatus();
  }, [readStatus]);

  useEffect(() => {
    if (props.autoFocus === true) keyRef.current?.focus({ preventScroll: true });
  }, [props.autoFocus]);

  const check = async (): Promise<void> => {
    if (ai === undefined) return;
    setPhase('checking');
    setResult(null);
    try {
      const words = keyCheckWords(await ai.testKey());
      if (!live.current) return;
      setResult(words);
      if (words.ok) onReady?.();
    } catch (problem) {
      if (live.current) setResult({ ok: false, text: errorText(problem), checkAgain: true });
    } finally {
      if (live.current) setPhase('idle');
    }
  };

  const saveAndCheck = async (): Promise<void> => {
    const trimmed = key.trim();
    if (ai === undefined || trimmed === '' || phase !== 'idle') return;
    setPhase('saving');
    setResult(null);
    try {
      await ai.setKey(trimmed);
    } catch (problem) {
      if (!live.current) return;
      setPhase('idle');
      const text = errorText(problem);
      setResult({
        ok: false,
        text: /encrypt/i.test(text) ? SETUP_WORDS.noEncryption : text,
        checkAgain: false,
      });
      return;
    }
    if (!live.current) return;
    // The field never keeps the key once it is in main.
    setKey('');
    const next = await readStatus();
    if (next !== null) onChanged?.(next);
    await check();
  };

  const remove = async (): Promise<void> => {
    if (ai === undefined || phase !== 'idle') return;
    setPhase('saving');
    setResult(null);
    try {
      await ai.clearKey();
      const next = await readStatus();
      if (!live.current) return;
      setResult({ ok: true, text: SETUP_WORDS.removed, checkAgain: false });
      if (next !== null) onChanged?.(next);
    } catch (problem) {
      if (live.current) setResult({ ok: false, text: errorText(problem), checkAgain: false });
    } finally {
      if (live.current) setPhase('idle');
    }
  };

  const encryption = status?.encryptionAvailable !== false;
  const busy = phase !== 'idle';
  const canSave = ai !== undefined && encryption && !busy && key.trim() !== '';
  const keySet = status?.set === true;

  return (
    <section
      className="flex flex-col gap-2 rounded border border-border p-3 text-sm"
      data-testid="ai-setup"
      aria-label={SETUP_WORDS.heading}
    >
      {props.hideHeading !== true && <h3 className="font-semibold">{SETUP_WORDS.heading}</h3>}
      <p data-testid="ai-setup-cost">{introSentence(props.model)}</p>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        <li className="flex flex-col items-start gap-1">
          <span className="font-medium">{SETUP_WORDS.stepGet}</span>
          <span className="text-xs text-muted">{SETUP_WORDS.stepGetHint}</span>
          <a
            href={ANTHROPIC_KEYS_URL}
            target="_blank"
            rel="noreferrer noopener"
            className={buttonClass}
            data-testid="ai-setup-open-site"
          >
            {SETUP_WORDS.openSite}
          </a>
        </li>
        <li className="flex flex-col gap-1">
          <label htmlFor={keyId} className="font-medium">
            {SETUP_WORDS.stepPaste}
          </label>
          <input
            ref={keyRef}
            id={keyId}
            type="password"
            autoComplete="off"
            spellCheck={false}
            className={fieldClass}
            data-testid="ai-setup-key"
            value={key}
            disabled={!encryption}
            placeholder={keySet ? SETUP_WORDS.keyPlaceholderReplace : SETUP_WORDS.keyPlaceholder}
            onChange={(event) => setKey(event.target.value)}
            onKeyDown={(event) => {
              // The hosts are forms: Enter here saves the key, nothing else.
              if (event.key === 'Enter') {
                event.preventDefault();
                if (canSave) void saveAndCheck();
              }
            }}
          />
        </li>
        <li className="flex items-center gap-1.5">
          <span className="font-medium">{SETUP_WORDS.stepSave}</span>
          <Button
            data-testid="ai-setup-save"
            disabled={!canSave}
            onClick={() => void saveAndCheck()}
          >
            {SETUP_WORDS.saveAndCheck}
          </Button>
        </li>
      </ol>
      {!encryption && (
        <p className="text-error" data-testid="ai-setup-encryption">
          {SETUP_WORDS.noEncryption}
        </p>
      )}
      {phase === 'checking' && (
        <p role="status" data-testid="ai-setup-checking">
          {SETUP_WORDS.checking}
        </p>
      )}
      {result !== null && (
        <div className="flex flex-wrap items-center gap-1.5">
          <p
            className={result.ok ? '' : 'text-error'}
            role={result.ok ? 'status' : 'alert'}
            data-testid="ai-setup-result"
          >
            {result.text}
          </p>
          {props.manage !== true && result.checkAgain && keySet && (
            <Button data-testid="ai-setup-check-again" disabled={busy} onClick={() => void check()}>
              {SETUP_WORDS.checkAgain}
            </Button>
          )}
        </div>
      )}
      {props.manage === true && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span role="status" data-testid={props.statusTestId ?? 'ai-setup-status'}>
            {keyStatusText(status)}
          </span>
          <Button
            data-testid="ai-setup-check-again"
            disabled={busy || !keySet}
            onClick={() => void check()}
          >
            {SETUP_WORDS.checkAgain}
          </Button>
          <Button
            data-testid="ai-setup-remove"
            disabled={busy || !keySet}
            onClick={() => void remove()}
          >
            {SETUP_WORDS.removeKey}
          </Button>
        </div>
      )}
      <AiWhatIsSent testId={props.sentTestId ?? 'ai-setup-sent'} />
    </section>
  );
}
