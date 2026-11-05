import type { PlanDecision } from '@msm/ai';
import { Check, Circle, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import type { AiCheckpointState, AiPlanState } from '../../store/ai-store';
import { fieldClass } from '../NewElementDialog';
import { Button, iconButtonClass } from '../ui/Button';

const badgeClass =
  'inline-flex items-center rounded border border-border bg-bg px-1 py-px font-mono text-[0.7rem] leading-4';

const STATUS_TEXT: Readonly<Record<AiPlanState['status'], string>> = {
  pending: 'Waiting for your decision.',
  decided: '',
  cancelled: 'The run ended before a decision.',
};

const DECISION_TEXT: Readonly<Record<PlanDecision['decision'], string>> = {
  build_all: 'Building all items.',
  step: 'Building step by step.',
  revise: 'Sent back for revision.',
};

/**
 * The plan `propose_plan` showed (ADR 0041 D6): the title, the items as a checklist with kind
 * badges (removable while the plan waits), the notes and the three decisions "Build all",
 * "Step through" and "Revise" (with comments). While building, completed items tick; in step
 * mode a checkpoint shows "Continue" and "Stop".
 */
export function AiPlanView(props: {
  plan: AiPlanState;
  checkpoint: AiCheckpointState | null;
  onDecide(decision: PlanDecision): void;
  onCheckpoint(decision: 'continue' | 'stop'): void;
}) {
  const { plan } = props;
  const pending = plan.status === 'pending';
  const [items, setItems] = useState(plan.plan.items);
  const [comments, setComments] = useState('');
  const commentsId = useId();
  // A new plan (or the decided one) replaces the local edits.
  useEffect(() => setItems(plan.plan.items), [plan.plan.items]);
  const decide = (decision: PlanDecision['decision']) =>
    props.onDecide({ decision, items, comments: comments.trim() });
  const completed = new Set(plan.completed);
  return (
    <section
      className="flex flex-col gap-1.5 rounded border border-border p-2 text-sm"
      aria-label="Plan"
      data-testid="ai-plan"
      data-status={plan.status}
    >
      <h3 className="font-semibold">{plan.plan.title}</h3>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {items.map((item) => (
          <li
            key={item.itemId}
            className="flex items-start gap-1.5"
            data-testid={`ai-plan-item-${item.itemId}`}
            data-done={completed.has(item.itemId) ? 'true' : 'false'}
          >
            {completed.has(item.itemId) ? (
              <Check size={14} aria-label="Done" className="mt-0.5 shrink-0 text-accent" />
            ) : (
              <Circle size={14} aria-label="Not done" className="mt-0.5 shrink-0 text-muted" />
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex flex-wrap items-center gap-1">
                <span className={badgeClass}>{item.kind}</span>
                <code className="font-mono text-xs [overflow-wrap:anywhere]">{item.elementId}</code>
              </span>
              <span>{item.summary}</span>
            </span>
            {pending && (
              <button
                type="button"
                className={iconButtonClass}
                data-testid={`ai-plan-item-${item.itemId}-remove`}
                aria-label={`Remove ${item.elementId} from the plan`}
                title="Remove from the plan"
                onClick={() =>
                  setItems((current) => current.filter((entry) => entry.itemId !== item.itemId))
                }
              >
                <X size={14} aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
      {plan.plan.assets !== undefined && plan.plan.assets.length > 0 && (
        <p className="text-xs text-muted">
          Placeholder textures:{' '}
          {plan.plan.assets.map((asset) => `${asset.namespace}:${asset.path}`).join(', ')}
        </p>
      )}
      {plan.plan.notes !== undefined && plan.plan.notes !== '' && (
        <p className="text-xs whitespace-pre-wrap text-muted">{plan.plan.notes}</p>
      )}
      {pending ? (
        <>
          <label htmlFor={commentsId} className="text-xs">
            Comments for Revise
          </label>
          <textarea
            id={commentsId}
            className={`${fieldClass} min-h-12`}
            data-testid="ai-plan-comments"
            value={comments}
            onChange={(event) => setComments(event.target.value)}
          />
          <div className="flex flex-wrap gap-1.5">
            <Button
              data-testid="ai-plan-build-all"
              disabled={items.length === 0}
              onClick={() => decide('build_all')}
            >
              Build all
            </Button>
            <Button
              data-testid="ai-plan-step"
              disabled={items.length === 0}
              onClick={() => decide('step')}
            >
              Step through
            </Button>
            <Button data-testid="ai-plan-revise" onClick={() => decide('revise')}>
              Revise
            </Button>
          </div>
          <p className="text-xs text-muted">{STATUS_TEXT.pending}</p>
        </>
      ) : (
        <p className="text-xs text-muted">
          {plan.decision === undefined
            ? STATUS_TEXT[plan.status]
            : DECISION_TEXT[plan.decision.decision]}
        </p>
      )}
      {props.checkpoint !== null && (
        <div className="flex flex-col gap-1 rounded bg-bg p-1.5" data-testid="ai-checkpoint">
          <p className="text-xs">{props.checkpoint.input.summary}</p>
          <div className="flex gap-1.5">
            <Button
              data-testid="ai-checkpoint-continue"
              onClick={() => props.onCheckpoint('continue')}
            >
              Continue
            </Button>
            <Button data-testid="ai-checkpoint-stop" onClick={() => props.onCheckpoint('stop')}>
              Stop
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
