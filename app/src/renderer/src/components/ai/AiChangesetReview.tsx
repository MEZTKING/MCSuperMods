import { type Json, stableStringify } from '@msm/core';
import { TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CHANGE_OPS, type ChangeItem, type ChangeOp } from '../../changeset/changeset';
import { ConfirmDialog } from '../ConfirmDialog';
import { Button } from '../ui/Button';
import { lineDiff } from './line-diff';

/** The group headings of the review, by operation. */
export const CHANGE_OP_LABELS: Readonly<Record<ChangeOp, string>> = {
  create: 'New elements',
  update: 'Changed elements',
  delete: 'Deleted elements',
  rename: 'Renamed elements',
  asset: 'Placeholder textures',
};

function json(value: unknown): string {
  return value === undefined ? '' : stableStringify(value as Json).trimEnd();
}

function itemTitle(item: ChangeItem): string {
  if (item.op === 'rename') return `${item.from ?? '?'} to ${item.to ?? item.elementId ?? '?'}`;
  if (item.op === 'asset' && item.asset !== undefined) {
    return `${item.asset.namespace}:${item.asset.path}`;
  }
  return item.elementId ?? item.itemId;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

/** Whether Apply has something to apply: an accepted item without a conflict. */
export function canApply(items: readonly ChangeItem[]): boolean {
  return items.some((item) => item.accepted && item.conflict === undefined);
}

function Diff({ item }: { item: ChangeItem }) {
  const lines = useMemo(
    () =>
      lineDiff(
        json(item.op === 'create' ? undefined : item.before),
        json(item.after ?? (item.op === 'rename' ? item.before : undefined)),
      ),
    [item],
  );
  return (
    <pre className="max-h-64 overflow-auto rounded bg-black/10 p-1.5 font-mono text-xs">
      {lines.map((line, index) => (
        <div
          key={index}
          data-diff={line.type}
          className={
            line.type === 'added'
              ? 'bg-green-500/15 text-green-700 dark:text-green-300'
              : line.type === 'removed'
                ? 'bg-red-500/15 text-red-700 dark:text-red-300'
                : ''
          }
        >
          {line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  '}
          {line.text}
        </div>
      ))}
    </pre>
  );
}

function ChangeRow(props: { item: ChangeItem; onToggle(accepted: boolean): void }) {
  const { item } = props;
  const testId = `ai-change-${item.itemId}`;
  const title = itemTitle(item);
  return (
    <li
      className="flex flex-col gap-0.5"
      data-testid={testId}
      data-op={item.op}
      data-accepted={item.accepted ? 'true' : 'false'}
    >
      <span className="flex items-start gap-1.5">
        <input
          type="checkbox"
          className="mt-0.5"
          data-testid={`${testId}-accept`}
          aria-label={`Keep ${title}`}
          checked={item.accepted}
          onChange={(event) => props.onToggle(event.target.checked)}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <code className="font-mono text-xs [overflow-wrap:anywhere]">{title}</code>
          {item.kind !== undefined && <span className="text-xs text-muted">{item.kind}</span>}
        </span>
      </span>
      {item.conflict !== undefined && (
        <p
          className="flex items-start gap-1 pl-5 text-xs text-warning"
          data-testid={`${testId}-conflict`}
        >
          <TriangleAlert size={12} aria-hidden className="mt-0.5 shrink-0" />
          Not applied: {item.conflict}
        </p>
      )}
      {item.problems.length > 0 && (
        <ul className="m-0 list-none pl-5 text-xs" data-testid={`${testId}-problems`}>
          {item.problems.map((problem, index) => (
            <li key={index} className={problem.severity === 'error' ? 'text-error' : 'text-muted'}>
              {problem.severity}: {problem.message}
              {problem.path !== undefined && problem.path !== '' && (
                <code className="ml-1 font-mono">{problem.path}</code>
              )}
            </li>
          ))}
        </ul>
      )}
      <details className="pl-5 text-xs" data-testid={`${testId}-diff`}>
        <summary className="cursor-pointer text-muted">
          {item.op === 'asset' ? 'Preview' : 'Before and after'}
        </summary>
        {item.op === 'asset' && item.asset !== undefined ? (
          <img
            alt={`Placeholder texture ${title}`}
            src={`data:image/png;base64,${base64(item.asset.bytes)}`}
            className="mt-1 size-16 [image-rendering:pixelated]"
          />
        ) : (
          <Diff item={item} />
        )}
      </details>
    </li>
  );
}

/**
 * The pending changeset (ADR 0041 D5): items grouped by operation, each with an accept
 * checkbox, kind and id, a before/after diff, the problems the last check found and conflict
 * notes. Apply is enabled when an accepted item has no conflict; Discard asks first.
 */
export function AiChangesetReview(props: {
  items: readonly ChangeItem[];
  running: boolean;
  applying: boolean;
  onToggle(itemId: string, accepted: boolean): void;
  onApply(): void;
  onDiscard(): void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { items } = props;
  const accepted = items.filter((item) => item.accepted).length;
  return (
    <section
      className="flex flex-col gap-2 rounded border border-border p-2 text-sm"
      aria-label="Proposed changes"
      data-testid="ai-changeset"
    >
      <h3 className="font-semibold">
        Proposed changes ({accepted} of {items.length} kept)
      </h3>
      {props.running && (
        <p className="text-xs text-muted">The helper is still working; more changes may follow.</p>
      )}
      {CHANGE_OPS.map((op) => {
        const group = items.filter((item) => item.op === op);
        if (group.length === 0) return null;
        return (
          <div key={op} className="flex flex-col gap-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {CHANGE_OP_LABELS[op]} ({group.length})
            </h4>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {group.map((item) => (
                <ChangeRow
                  key={item.itemId}
                  item={item}
                  onToggle={(next) => props.onToggle(item.itemId, next)}
                />
              ))}
            </ul>
          </div>
        );
      })}
      <div className="flex gap-1.5">
        <Button
          data-testid="ai-apply"
          disabled={!canApply(items) || props.running || props.applying}
          onClick={props.onApply}
        >
          Apply
        </Button>
        <Button
          data-testid="ai-discard"
          disabled={props.applying}
          onClick={() => setConfirming(true)}
        >
          Discard
        </Button>
      </div>
      {confirming && (
        <ConfirmDialog
          title="Discard proposed changes"
          message={`Discard all ${items.length} proposed change${items.length === 1 ? '' : 's'}? Nothing has been applied to the project.`}
          confirmLabel="Discard"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            props.onDiscard();
          }}
        />
      )}
    </section>
  );
}
