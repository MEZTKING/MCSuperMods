import { type AiRunLimits, TASK_BUDGET_MIN } from '@msm/ai';
import { Gauge } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useEffect, useId, useState } from 'react';
import { fieldClass } from '../NewElementDialog';
import { Button, buttonClass } from '../ui/Button';

/** Bounds of the limit fields (as main clamps them). */
export const LIMIT_BOUNDS = Object.freeze({
  toolTurns: { min: 1, max: 1000 },
  outputTokens: { min: 1000, max: 5_000_000 },
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * A number field that keeps what the user types and commits values within `bounds`; on blur
 * an out-of-range value is clamped and an empty one goes back to the current value.
 */
function LimitField(props: {
  id: string;
  testId: string;
  value: number;
  bounds: { min: number; max: number };
  step?: number;
  onCommit(value: number): void;
}) {
  const { value, bounds, onCommit } = props;
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      id={props.id}
      type="number"
      className={fieldClass}
      data-testid={props.testId}
      min={bounds.min}
      max={bounds.max}
      step={props.step ?? 1}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        const parsed = Number(event.target.value);
        if (
          event.target.value !== '' &&
          Number.isInteger(parsed) &&
          parsed >= bounds.min &&
          parsed <= bounds.max
        ) {
          onCommit(parsed);
        }
      }}
      onBlur={() => {
        const parsed = Number(text);
        if (text === '' || !Number.isFinite(parsed)) {
          setText(String(value));
          return;
        }
        const clamped = clamp(parsed, bounds.min, bounds.max);
        setText(String(clamped));
        if (clamped !== value) onCommit(clamped);
      }}
    />
  );
}

/**
 * "Run limits": the next run's tool turn and output token limits and the task budget switch
 * (ADR 0041 D7). The defaults come from Settings; a change applies to the next run only.
 */
export function AiLimitsPopover(props: {
  /** The limits the next run uses. */
  limits: AiRunLimits;
  /** `true` when the limits differ from the mode's defaults. */
  overridden: boolean;
  disabled?: boolean;
  onChange(limits: AiRunLimits): void;
  /** Back to the mode's defaults. */
  onReset(): void;
}) {
  const turnsId = useId();
  const tokensId = useId();
  const budgetId = useId();
  const { limits } = props;
  return (
    <Popover.Root>
      <Popover.Trigger
        className={buttonClass}
        data-testid="ai-limits"
        disabled={props.disabled}
        aria-label="Run limits"
      >
        <Gauge size={14} aria-hidden />
        Run limits
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className="z-50 flex w-72 flex-col gap-2 rounded-md border border-border bg-panel p-3 text-sm text-text shadow-lg"
          data-testid="ai-limits-popover"
        >
          <p className="font-semibold">Run limits</p>
          <p className="text-xs text-muted">
            For this run. The defaults are set per mode in Settings, AI helper.
          </p>
          <label htmlFor={turnsId}>Tool turns</label>
          <LimitField
            id={turnsId}
            testId="ai-limit-tool-turns"
            value={limits.maxToolTurns}
            bounds={LIMIT_BOUNDS.toolTurns}
            onCommit={(maxToolTurns) => props.onChange({ ...limits, maxToolTurns })}
          />
          <label htmlFor={tokensId}>Output tokens</label>
          <LimitField
            id={tokensId}
            testId="ai-limit-output-tokens"
            value={limits.maxOutputTokens}
            bounds={LIMIT_BOUNDS.outputTokens}
            step={1000}
            onCommit={(maxOutputTokens) => props.onChange({ ...limits, maxOutputTokens })}
          />
          <span className="flex items-center gap-1.5">
            <input
              id={budgetId}
              type="checkbox"
              data-testid="ai-limit-task-budget"
              checked={limits.taskBudget}
              onChange={(event) => props.onChange({ ...limits, taskBudget: event.target.checked })}
            />
            <label htmlFor={budgetId}>Tell the model its output budget</label>
          </span>
          <p className="text-xs text-muted">
            With the budget on, the model paces itself to the output token limit (only for limits of
            at least {TASK_BUDGET_MIN.toLocaleString('en-GB')} tokens).
          </p>
          <div className="flex justify-end gap-1.5">
            <Button
              data-testid="ai-limits-reset"
              disabled={!props.overridden}
              onClick={props.onReset}
            >
              Use defaults
            </Button>
            <Popover.Close asChild>
              <Button>Done</Button>
            </Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
