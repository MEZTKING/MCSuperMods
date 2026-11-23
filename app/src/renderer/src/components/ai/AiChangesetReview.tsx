import { type Json, type Project, stableStringify } from '@msm/core';
import { targetById } from '@msm/targets';
import { TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CHANGE_OPS, type ChangeItem, type ChangeOp } from '../../changeset/changeset';
import { usePreferences } from '../../store/preferences';
import { useUiStore } from '../../store/ui-store';
import { ConfirmDialog } from '../ConfirmDialog';
import { Button } from '../ui/Button';
import { AiProposalCards } from './AiProposalCards';
import { AiSeeIt } from './AiSeeIt';
import { reviewHeading, type UiMode, wordsFor } from './ai-words';
import { lineDiff } from './line-diff';
import { CARD_WORDS, changesSomething, proposalThings, reviewCounts } from './proposal-things';

/** The group headings of Advanced's file list, by operation. */
export const CHANGE_OP_LABELS: Readonly<Record<ChangeOp, string>> = {
  create: 'New elements',
  update: 'Changed elements',
  delete: 'Deleted elements',
  rename: 'Renamed elements',
  asset: wordsFor('advanced').review.pictures,
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
          {item.op === 'asset' ? 'Preview' : wordsFor('advanced').review.beforeAfter}
        </summary>
        {item.op === 'asset' && item.asset !== undefined ? (
          <img
            alt={`Texture ${title}`}
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
 * The pending changeset (ADR 0041 D5, ADR 0125 D3): what the helper would make, seen before
 * anything is added. The heading says how many things are ready; the **See it** pane (B615,
 * {@link AiSeeIt}) comes first, drawing the open project as it would be with the kept changes;
 * then one card per thing ({@link AiProposalCards}) with its picture, name and **Keep**. Very easy
 * shows nothing else; Easy folds each thing's files under **Files behind this**; Advanced adds
 * today's file list (by operation, each with its kind and id, the diff, the raw problems and
 * conflict notes).
 *
 * **Add to my mod** (**Make these changes** when something already in the mod is changed or
 * taken out; **Apply** in Advanced) is enabled when a kept item has no conflict and the helper
 * has finished; **Throw away** (**Discard**) asks first.
 */
export function AiChangesetReview(props: {
  items: readonly ChangeItem[];
  /** The project the changes apply to; default: the open project. */
  project?: Project | null;
  /** The view mode; default: the preference. */
  mode?: UiMode;
  running: boolean;
  applying: boolean;
  onToggle(itemId: string, accepted: boolean): void;
  onApply(): void;
  onDiscard(): void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { items } = props;
  const preferred = usePreferences((state) => state.mode);
  const mode = props.mode ?? preferred;
  const words = wordsFor(mode).review;
  const open = useUiStore((state) => state.snapshot?.project ?? null);
  const project = props.project === undefined ? open : props.project;
  const targetId = project?.targets[0];
  const folders =
    targetId === undefined ? undefined : targetById(targetId)?.target.folders.resource;
  const things = useMemo(
    () => proposalThings(items, folders === undefined ? {} : { folders }),
    [items, folders],
  );
  const counts = reviewCounts(things, items);
  const advanced = mode === 'advanced';
  const doIt = changesSomething(items) ? words.makeChanges : words.add;
  const thingCount = things.filter((thing) => !thing.other).length;
  return (
    <section
      className="flex flex-col gap-2 rounded border border-border p-2 text-sm"
      aria-label={advanced ? 'Proposed changes' : 'Ready to add'}
      data-testid="ai-changeset"
      data-mode={mode}
    >
      <h3 className="font-semibold" data-testid="ai-review-heading">
        {reviewHeading(counts, mode)}
      </h3>
      {project !== null && <AiSeeIt project={project} items={items} running={props.running} />}
      <AiProposalCards things={things} mode={mode} onToggle={props.onToggle} />
      {advanced &&
        CHANGE_OPS.map((op) => {
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
          {doIt}
        </Button>
        <Button
          data-testid="ai-discard"
          disabled={props.applying}
          onClick={() => setConfirming(true)}
        >
          {words.throwAway}
        </Button>
      </div>
      {confirming && (
        <ConfirmDialog
          title={advanced ? 'Discard proposed changes' : CARD_WORDS.discardTitle}
          message={
            advanced
              ? `Discard all ${items.length} proposed change${items.length === 1 ? '' : 's'}? Nothing has been applied to the project.`
              : CARD_WORDS.discardMessage(thingCount)
          }
          confirmLabel={words.throwAway}
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
