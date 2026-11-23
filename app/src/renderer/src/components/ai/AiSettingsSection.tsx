import {
  AI_MODELS,
  type AiEffort,
  type AiMode,
  type AiModelId,
  type AiSettings,
  DEFAULT_AI_SETTINGS,
  modelInfo,
} from '@msm/ai';
import { forwardRef, useEffect, useId, useState } from 'react';
import type { AiPlatform } from '../../../../shared/platform';
import { usePreferences } from '../../store/preferences';
import { fieldClass } from '../NewElementDialog';
import { AiKeySetup } from './AiKeySetup';
import { LimitField } from './AiLimitsPopover';
import { modelChangeNotice } from './ai-controller';
import {
  LIMIT_LABELS,
  LIMIT_RANGES,
  LIMITS_HEADING,
  LIMITS_INTRO,
  withLimit,
  withPacing,
  worstCaseSentence,
} from './ai-limits-model';
import {
  AI_GUIDE_URL,
  EFFORT_WORDS,
  modelOption,
  modelOptionAdvanced,
  noFallback,
  pricesChecked,
  SETUP_WORDS,
} from './ai-setup-words';

export { keyStatusText } from './AiKeySetup';
export { AI_GUIDE_URL } from './ai-setup-words';

/** The heading of the key card in Settings (the settings line `ai-key`). */
export const KEY_HEADING = 'Your Anthropic key';

/** The fallback switch's label (ADR 0041 D7). */
export const AI_FALLBACK_LABEL = SETUP_WORDS.fallback;

function errorText(problem: unknown): string {
  return problem instanceof Error ? problem.message : String(problem);
}

/** One run size's default limits (Advanced). */
function LimitsRow(props: {
  size: AiMode;
  settings: AiSettings;
  disabled: boolean;
  onChange(next: AiSettings): void;
}) {
  const { size, settings } = props;
  const labels = LIMIT_LABELS[size];
  const limits = settings.limits[size];
  const stepsId = useId();
  const tokensId = useId();
  const paceId = useId();
  return (
    <div className="flex flex-col gap-1" data-testid={`settings-ai-limits-${size}`}>
      <span className="flex flex-wrap items-center gap-1.5">
        <label htmlFor={stepsId}>{labels.steps.before}</label>
        <span className="w-24">
          <LimitField
            id={stepsId}
            testId={`settings-ai-limit-steps-${size}`}
            value={limits.maxToolTurns}
            bounds={LIMIT_RANGES.steps}
            onCommit={(value) => props.onChange(withLimit(settings, size, 'steps', value))}
          />
        </span>
        <span>{labels.steps.after}</span>
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <label htmlFor={tokensId}>{labels.tokens.before}</label>
        <span className="w-32">
          <LimitField
            id={tokensId}
            testId={`settings-ai-limit-tokens-${size}`}
            value={limits.maxOutputTokens}
            bounds={LIMIT_RANGES.tokens}
            step={1000}
            onCommit={(value) => props.onChange(withLimit(settings, size, 'tokens', value))}
          />
        </span>
        <span>{labels.tokens.after}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <input
          id={paceId}
          type="checkbox"
          data-testid={`settings-ai-limit-pace-${size}`}
          checked={limits.taskBudget}
          disabled={props.disabled}
          onChange={(event) => props.onChange(withPacing(settings, size, event.target.checked))}
        />
        <label htmlFor={paceId}>{labels.pace}</label>
      </span>
      <p className="text-xs text-muted" data-testid={`settings-ai-limit-cost-${size}`}>
        {worstCaseSentence(settings.model, size, limits)}
      </p>
    </div>
  );
}

/**
 * Settings > "AI helper" (ADR 0041 D1, D7; ADR 0125 D5, D10): the set-up card with the saved
 * key's line, then the model, the two efforts, the fallback switch and, in Advanced, the default
 * limits per run size. With `focusKey` the key field takes the focus (the dialog scrolls the
 * section into view).
 */
export const AiSettingsSection = forwardRef<
  HTMLElement,
  {
    ai: AiPlatform;
    /** Reads the stored AI settings (defaults when unset). */
    load(): Promise<AiSettings>;
    /** Stores the AI settings. */
    save(settings: AiSettings): Promise<void>;
    /** Called after the settings or the key changed (the panel re-reads them). */
    onChanged?: (() => void) | undefined;
    /** The model the open conversation started with, or `null` without one. */
    conversationModel?: AiModelId | null;
    /** Focus the key field (Settings opened from the helper). */
    focusKey?: boolean;
  }
>(function AiSettingsSection(props, ref) {
  const { ai, load, onChanged } = props;
  const mode = usePreferences((state) => state.mode);
  const advanced = mode === 'advanced';
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modelId = useId();
  const chatId = useId();
  const buildId = useId();
  const fallbackId = useId();

  useEffect(() => {
    let live = true;
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
  }, [load]);

  const change = async (next: AiSettings) => {
    const previous = settings;
    setSettings(next);
    setError(null);
    try {
      await props.save(next);
      onChanged?.();
    } catch (problem) {
      setSettings(previous);
      setError(errorText(problem));
    }
  };

  const current = settings ?? DEFAULT_AI_SETTINGS;
  const model = modelInfo(current.model);
  const effortSelect = (size: AiMode, id: string, label: string) => (
    <span className="flex flex-col gap-0.5" data-setting={`ai-effort-${size}`}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className={fieldClass}
        data-testid={`settings-ai-effort-${size}`}
        value={current.effort[size]}
        disabled={settings === null}
        onChange={(event) =>
          void change({
            ...current,
            effort: { ...current.effort, [size]: event.target.value as AiEffort },
          })
        }
      >
        {EFFORT_WORDS.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.label}
          </option>
        ))}
      </select>
    </span>
  );

  return (
    <section
      ref={ref}
      className="flex scroll-mt-2 flex-col gap-1.5"
      data-testid="settings-ai"
      aria-label={SETUP_WORDS.sectionHeading}
    >
      <h3 className="mt-3 font-semibold">{SETUP_WORDS.sectionHeading}</h3>
      <div className="flex flex-col gap-1.5" data-setting="ai-key">
        <h4 className="mt-1 text-sm font-semibold" data-setting-label>
          {KEY_HEADING}
        </h4>
        <AiKeySetup
          ai={ai}
          model={current.model}
          manage
          hideHeading
          autoFocus={props.focusKey === true}
          statusTestId="settings-ai-key-status"
          sentTestId="settings-ai-privacy"
          onChanged={() => onChanged?.()}
          onReady={() => onChanged?.()}
        />
      </div>
      <div className="flex flex-col gap-1.5" data-setting="ai-model">
        <label htmlFor={modelId}>{SETUP_WORDS.model}</label>
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
              {advanced ? modelOptionAdvanced(entry.id) : modelOption(entry.id)}
            </option>
          ))}
        </select>
        {props.conversationModel != null && props.conversationModel !== current.model && (
          <p className="text-xs text-muted" data-testid="settings-ai-model-notice">
            {modelChangeNotice(current.model)}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {effortSelect('chat', chatId, SETUP_WORDS.effortSmall)}
        {effortSelect('build', buildId, SETUP_WORDS.effortBuild)}
      </div>
      <p className="text-xs text-muted">{SETUP_WORDS.effortHint}</p>
      <span className="flex items-start gap-1.5" data-setting="ai-fallbacks">
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
        <p className="text-xs text-muted">{noFallback(current.model)}</p>
      )}
      {advanced && (
        <div
          className="flex flex-col gap-2"
          data-testid="settings-ai-limits"
          data-setting="ai-limits"
        >
          <h4 className="mt-1 text-sm font-semibold" data-setting-label>
            {LIMITS_HEADING}
          </h4>
          <p className="text-xs text-muted">{LIMITS_INTRO}</p>
          {(['chat', 'build'] as const).map((size) => (
            <LimitsRow
              key={size}
              size={size}
              settings={current}
              disabled={settings === null}
              onChange={(next) => void change(next)}
            />
          ))}
        </div>
      )}
      {error !== null && (
        <p className="text-sm text-error" role="alert" data-testid="settings-ai-result">
          {error}
        </p>
      )}
      <p className="text-xs text-muted">
        {pricesChecked(model.pricing.checkedOn)}{' '}
        <a
          href={AI_GUIDE_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent underline"
        >
          {SETUP_WORDS.guide}
        </a>
      </p>
    </section>
  );
});
