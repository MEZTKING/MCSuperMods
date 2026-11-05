/**
 * The Creator's Elements tab (ADR 0043 D3, D4): what Create will do, in sections ("Will be
 * created", "Will be replaced", "Kept your edits" and so on). Rows are
 * `creator-element-<key>` (a conflict carries the badge `creator-conflict-<key>`); kept rows are
 * `creator-kept-<key>` with an "Overwrite" toggle `creator-overwrite-<key>` and a diff between
 * the user's version and what the flow makes now.
 *
 * @packageDocumentation
 */

import { type Json, stableStringify } from '@msm/core';
import { TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import type { CreatorEntry, CreatorPlan } from '../../changeset/creator-sets';
import { lineDiff } from '../ai/line-diff';
import { ENTRY_SECTIONS } from './creator-model';

function json(value: Json | undefined): string {
  return value === undefined ? '' : stableStringify(value).trimEnd();
}

function KeptDiff({ entry }: { entry: CreatorEntry }) {
  const lines = useMemo(
    () => lineDiff(json(entry.current), json(entry.next)),
    [entry.current, entry.next],
  );
  if (entry.asset !== undefined || entry.next === undefined) return null;
  return (
    <details className="pl-5 text-xs" data-testid={`creator-kept-${entry.key}-diff`}>
      <summary className="cursor-pointer text-muted">Your version and the Creator's</summary>
      <pre className="max-h-48 overflow-auto rounded bg-black/10 p-1.5 font-mono text-xs">
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
    </details>
  );
}

function entryKind(entry: CreatorEntry): string {
  return entry.asset !== undefined ? 'asset' : (entry.kind ?? '');
}

/** The plan as sections of rows. */
export function CreatorElements(props: {
  plan: CreatorPlan;
  overwrite: ReadonlySet<string>;
  onOverwriteChange(key: string, overwrite: boolean): void;
}) {
  const { plan } = props;
  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="creator-elements">
      {ENTRY_SECTIONS.map((section) => {
        const entries = plan.entries.filter((entry) => section.statuses.includes(entry.status));
        if (entries.length === 0) return null;
        const kept = section.statuses.includes('keep');
        return (
          <section key={section.title} aria-label={section.title} className="flex flex-col gap-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {section.title} ({entries.length})
            </h4>
            {kept && (
              <p className="text-xs text-muted">
                You changed these by hand, so the Creator leaves them as they are. Tick Overwrite to{' '}
                {plan.mode === 'update' ? 'replace (or remove) one anyway' : 'replace one'}.
              </p>
            )}
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {entries.map((entry) => {
                const testId = kept ? `creator-kept-${entry.key}` : `creator-element-${entry.key}`;
                return (
                  <li
                    key={`${entry.status}-${entry.key}`}
                    data-testid={testId}
                    data-status={entry.status}
                    className="flex flex-col gap-0.5"
                  >
                    <span className="flex flex-wrap items-center gap-1.5">
                      {kept && (
                        <label className="inline-flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            data-testid={`creator-overwrite-${entry.key}`}
                            aria-label={`Overwrite ${entry.key}`}
                            checked={props.overwrite.has(entry.key)}
                            onChange={(event) =>
                              props.onOverwriteChange(entry.key, event.target.checked)
                            }
                          />
                          Overwrite
                        </label>
                      )}
                      <code className="font-mono text-xs [overflow-wrap:anywhere]">
                        {entry.key}
                      </code>
                      <span className="text-xs text-muted">{entryKind(entry)}</span>
                      {entry.status === 'keep-removed' && (
                        <span className="text-xs text-muted">(no longer made by these values)</span>
                      )}
                      {entry.generatedId !== undefined && (
                        <span className="text-xs text-muted">
                          (renamed from {entry.generatedId})
                        </span>
                      )}
                      {entry.status === 'conflict' && (
                        <span
                          className="inline-flex items-center gap-1 rounded border border-warning px-1 text-xs text-warning"
                          data-testid={`creator-conflict-${entry.key}`}
                        >
                          <TriangleAlert size={12} aria-hidden />
                          Already exists
                        </span>
                      )}
                    </span>
                    {entry.note !== undefined && (
                      <span className="pl-1 text-xs text-muted">{entry.note}</span>
                    )}
                    {kept && <KeptDiff entry={entry} />}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
