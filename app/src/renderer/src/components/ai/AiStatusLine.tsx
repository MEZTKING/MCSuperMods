import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { type AiStatus, type AiStatusAction, WORKING_STATES } from './ai-status';
import { statusWords } from './ai-words';

/**
 * The class a primary button adds: the one button that is the user's next step (ADR 0125 D1).
 * Important (Tailwind's `!`): `Button`'s own `bg-panel` comes later in the built CSS and would win
 * (B690).
 */
export const PRIMARY_BUTTON_CLASS =
  'border-accent! bg-accent! text-white! hover:enabled:opacity-90';

/** The test id of a state line action: `ai-stop` for Stop (as before), else `ai-status-<id>`. */
export function statusActionTestId(id: AiStatusAction): string {
  return id === 'stop' ? 'ai-stop' : `ai-status-${id}`;
}

/**
 * The clock of the state line: `Date.now()` again every second while the helper works (so the
 * seconds count up), still otherwise.
 */
export function useStatusClock(working: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!working) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [working, intervalMs]);
  return now;
}

/** Whether a state is one in which the helper works and the user waits. */
export function isWorking(status: AiStatus): boolean {
  return WORKING_STATES.has(status.state);
}

/**
 * The state line above the message box (ADR 0125 D1): one sentence saying what is happening and
 * whose turn it is, with the seconds while the helper works, and at most one button. It is a
 * polite live region, so a screen reader hears each new state.
 */
export function AiStatusLine(props: {
  status: AiStatus;
  /** Whether the line's button is the panel's one primary button. */
  primary: boolean;
  /** Actions the panel cannot carry out here (their button is left out). */
  hidden?: ReadonlySet<AiStatusAction>;
  onAction(action: AiStatusAction): void;
}) {
  const words = statusWords(props.status);
  const action =
    words.action === null || props.hidden?.has(words.action.id) === true ? null : words.action;
  return (
    <div
      className="flex min-h-7 items-center gap-1.5 text-sm"
      data-testid="ai-status"
      data-state={props.status.state}
      data-working={isWorking(props.status) ? 'true' : 'false'}
    >
      <p role="status" aria-live="polite" className="min-w-0 flex-1" data-testid="ai-status-text">
        {words.text}
      </p>
      {action !== null && (
        <Button
          data-testid={statusActionTestId(action.id)}
          data-action={action.id}
          data-primary={props.primary ? 'true' : 'false'}
          className={props.primary ? PRIMARY_BUTTON_CLASS : undefined}
          onClick={() => props.onAction(action.id)}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
