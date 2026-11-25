/**
 * **Check on other versions** and what moving back cannot put back (ADR 0136 D7, B820).
 *
 * - {@link OtherVersions}: one row per Minecraft version MCSuperMods makes mods for, from the
 *   same dry run the report uses: "works as it is", "works after a move, n changes" or "n things
 *   would break", each opening that version's report. The rows follow edits: a new project
 *   state asks again.
 * - {@link MoveBackLead}: shown first in the report of a move back, before the user presses:
 *   what cannot be put back (with the reason), the things changed since the move, and, for a
 *   move up MCSuperMods has no record of, the changes it made by itself that it cannot undo.
 *
 * Both render inside the report view (its context gives the project, ids and Show me). This
 * module is a lazy chunk with the report.
 *
 * @packageDocumentation
 */

import type { NotRestoredReason, Project } from '@msm/core';
import type { TargetFacts } from '@msm/plugin-api';
import { useEffect, useState } from 'react';
import type { MoveBackResult } from '../../session/upgrade/move-back';
import type { MoveReport } from '../UpgradeTargetDialog';
import { targetLabel } from '../wizard/wizard-model';
import { linkClass, Part, Raw, ShowMe, thingName, useReport } from './parts/shared';
import { changeSentence, count } from './sentences';

/** The heading of the rows. */
export const OTHER_VERSIONS_TITLE = 'Check on other versions';

/** How a version stands for the mod, from its dry run. */
export type VersionStatus =
  | { kind: 'as-is' }
  | { kind: 'after-move'; changes: number }
  | { kind: 'breaks'; things: number };

/**
 * How the mod stands on a version: things to change by hand (part 3) mean it would break;
 * otherwise changes MCSuperMods makes mean it works after a move; otherwise it works as it is.
 */
export function versionStatus(move: MoveReport): VersionStatus {
  const things = move.report.todo.length;
  if (things > 0) return { kind: 'breaks', things };
  const changes = move.migration.changes.length;
  if (changes > 0) return { kind: 'after-move', changes };
  return { kind: 'as-is' };
}

/** The row's words for a status. */
export function versionStatusText(status: VersionStatus): string {
  switch (status.kind) {
    case 'as-is':
      return 'Works as it is.';
    case 'after-move':
      return `Works after a move: ${count(status.changes, 'change', 'changes')}.`;
    case 'breaks':
      return `${status.things === 1 ? '1 thing' : `${status.things} things`} would break.`;
  }
}

/** How often a run cancelled by an edit is asked for again. */
const STALE_RETRIES = 5;

function isStale(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'DryRunCancelled' &&
    (error as Error & { reason?: string }).reason === 'stale'
  );
}

type RowState =
  | { state: 'checking' }
  | { state: 'ready'; status: VersionStatus; checking: boolean }
  | { state: 'failed'; message: string };

/** Props of {@link OtherVersions}. */
export interface OtherVersionsProps {
  /** The mod's own target. */
  currentTargetId: string;
  /** Every target MCSuperMods builds for, newest first. */
  targets: readonly TargetFacts[];
  /** The version whose report is open, if any. */
  chosenId?: string;
  /** The project: a new state asks again. */
  project: Project | null;
  /** The dry run of moving to a version (`session.upgradeReport`). */
  report(targetId: string, signal: AbortSignal): Promise<MoveReport>;
  /** Opens a version's report. */
  onOpen(targetId: string): void;
}

/** **Check on other versions**: a row per version with how the mod stands there. */
export function OtherVersions(props: OtherVersionsProps) {
  const { ids } = useReport();
  const { currentTargetId, targets, report: ask, project } = props;
  const others = targets.filter((target) => target.id !== currentTargetId);
  const otherIds = others.map((target) => target.id).join('\u0000');
  const [rows, setRows] = useState<Readonly<Record<string, RowState>>>({});

  // One version after another (the dry runs share one scratch session), asked again whenever
  // the project changes (`project` is a dependency on purpose); the old answer stays, marked,
  // until the new one is in.
  useEffect(() => {
    const controller = new AbortController();
    const ids = otherIds === '' ? [] : otherIds.split('\u0000');
    setRows((previous) => {
      const next: Record<string, RowState> = {};
      for (const id of ids) {
        const row = previous[id];
        next[id] = row?.state === 'ready' ? { ...row, checking: true } : { state: 'checking' };
      }
      return next;
    });
    const run = async (): Promise<void> => {
      for (const id of ids) {
        let tries = 0;
        for (;;) {
          if (controller.signal.aborted) return;
          try {
            const move = await ask(id, controller.signal);
            if (controller.signal.aborted) return;
            const status = versionStatus(move);
            setRows((previous) => ({
              ...previous,
              [id]: { state: 'ready', status, checking: false },
            }));
            break;
          } catch (error) {
            if (controller.signal.aborted) return;
            if (isStale(error) && tries < STALE_RETRIES) {
              tries += 1;
              await new Promise((resolve) => setTimeout(resolve, 50));
              continue;
            }
            const message = error instanceof Error ? error.message : String(error);
            setRows((previous) => ({ ...previous, [id]: { state: 'failed', message } }));
            break;
          }
        }
      }
    };
    void run();
    return () => controller.abort();
  }, [otherIds, ask, project]);

  const current = targets.find((target) => target.id === currentTargetId);
  return (
    <Part id="other-versions" title={OTHER_VERSIONS_TITLE}>
      <p className="text-muted text-sm">
        How your mod does on each Minecraft version MCSuperMods makes mods for.
      </p>
      <ul className="flex flex-col gap-1">
        {current !== undefined && (
          <li className="text-sm" data-testid={`upgrade-other-${current.id}`}>
            <span className="font-medium">{targetLabel(current)}</span>
            {ids && <span className="text-muted"> ({current.id})</span>}
            {': your mod is made for this one.'}
          </li>
        )}
        {others.map((target) => {
          const row = rows[target.id] ?? { state: 'checking' };
          const open = props.chosenId === target.id;
          return (
            <li
              key={target.id}
              className="flex flex-wrap items-baseline gap-x-2 text-sm"
              data-testid={`upgrade-other-${target.id}`}
            >
              <span>
                <span className="font-medium">{targetLabel(target)}</span>
                {ids && <span className="text-muted"> ({target.id})</span>}
                {': '}
                <span data-testid={`upgrade-other-${target.id}-status`}>
                  {row.state === 'checking'
                    ? 'Checking…'
                    : row.state === 'failed'
                      ? 'Could not be checked.'
                      : versionStatusText(row.status)}
                </span>
                {row.state === 'ready' && row.checking && (
                  <span className="text-muted"> Checking again…</span>
                )}
              </span>
              {open ? (
                <span className="text-muted text-xs">Its report is above.</span>
              ) : (
                <button
                  type="button"
                  className={linkClass}
                  aria-label={`See the report for ${targetLabel(target)}`}
                  data-testid={`upgrade-other-${target.id}-open`}
                  onClick={() => props.onOpen(target.id)}
                >
                  See the report
                </button>
              )}
              {row.state === 'failed' && <Raw>{row.message}</Raw>}
            </li>
          );
        })}
      </ul>
    </Part>
  );
}

/** Why a value is not put back, in plain words. */
export const NOT_RESTORED_WORDS: Readonly<Record<NotRestoredReason, string>> = {
  'element-gone': 'it is no longer in your mod.',
  removed: 'the move removed it and kept no copy.',
  'parent-gone': 'the part of it that held the value is gone.',
  'place-taken': 'something else is in its place now, and that is kept.',
  'changed-since': 'it was changed after the move, so it is left as it is.',
};

/** Props of {@link MoveBackLead}. */
export interface MoveBackLeadProps {
  /** What the move back puts back and what it cannot (`dry.inverted`). */
  inverted: MoveBackResult;
  /** The Minecraft version moved back from. */
  fromVersion: string;
}

/**
 * The lead of a move back's report: what cannot be put back first, then the things changed
 * since the move, then how much is put back.
 */
export function MoveBackLead({ inverted, fromVersion }: MoveBackLeadProps) {
  const { project, versionOf, ids } = useReport();
  const { notRestored, edited, unrecorded, restored } = inverted;
  const recordless = inverted.segments.filter((segment) => segment.noRecord);
  const cannot = notRestored.length + unrecorded.length;
  return (
    <div className="flex flex-col gap-2" data-testid="upgrade-move-back">
      {recordless.length > 0 && (
        <p className="text-sm" data-testid="upgrade-move-back-no-record">
          {`MCSuperMods has no record of the move to Minecraft ${versionOf(recordless[0]?.from)} (it was made before MCSuperMods kept one, or the record was cleared), so anything that move took away cannot be put back.`}
          {unrecorded.length === 0 &&
            ' None of the changes it would have made by itself touches your mod.'}
        </p>
      )}
      {cannot > 0 && (
        <Part id="cannot-put-back" title={`What cannot be put back (${cannot})`}>
          <ul className="flex flex-col gap-1">
            {notRestored.map((entry, index) => (
              <li
                key={`${entry.elementId}\u0000${entry.path ?? ''}\u0000${index}`}
                className="flex flex-wrap items-baseline gap-x-1 text-sm"
                data-testid={`upgrade-move-back-not-restored-${index}`}
              >
                <span>
                  <span className="font-medium">{thingName(project, entry.elementId)}</span>
                  {`: not put back, because ${NOT_RESTORED_WORDS[entry.reason]}`}
                </span>
                <ShowMe
                  elementId={entry.elementId}
                  path={entry.path}
                  testId={`upgrade-move-back-not-restored-${index}-show`}
                />
                <Raw>{`${entry.elementId}${entry.path ?? ''}${entry.changeId === undefined ? '' : ` (${entry.changeId})`}`}</Raw>
              </li>
            ))}
            {unrecorded.map((entry, index) => (
              <li
                key={`${entry.targetId}\u0000${entry.change.id}`}
                className="flex flex-col gap-0.5 text-sm"
                data-testid={`upgrade-move-back-unrecorded-${index}`}
              >
                <span>
                  {`${changeSentence(entry.change, versionOf(entry.targetId))} The move did that by itself, and with no record MCSuperMods cannot undo it.`}
                </span>
                {entry.elementIds.length > 0 && (
                  <span className="flex flex-wrap items-baseline gap-x-1 text-muted">
                    {'Check '}
                    {entry.elementIds.map((elementId, at) => (
                      <span key={elementId} className="inline-flex items-baseline gap-x-0.5">
                        {thingName(project, elementId)}
                        <ShowMe
                          elementId={elementId}
                          testId={`upgrade-move-back-unrecorded-${index}-show-${at}`}
                        />
                      </span>
                    ))}
                  </span>
                )}
                <Raw>{entry.change.id}</Raw>
              </li>
            ))}
          </ul>
        </Part>
      )}
      {edited.length > 0 && (
        <Part id="changed-since-move" title={`Changed since the move (${edited.length})`}>
          <p className="text-muted text-sm">
            {`These were changed after the move to Minecraft ${fromVersion}. What the move took away is put back only where nothing else is in its place; check them once your mod is moved back.`}
          </p>
          <ul className="flex flex-col gap-1">
            {edited.map((elementId, index) => (
              <li
                key={elementId}
                className="flex flex-wrap items-baseline gap-x-1 text-sm"
                data-testid={`upgrade-move-back-edited-${index}`}
              >
                <span className="font-medium">{thingName(project, elementId)}</span>
                <ShowMe elementId={elementId} testId={`upgrade-move-back-edited-${index}-show`} />
                {ids && <Raw>{elementId}</Raw>}
              </li>
            ))}
          </ul>
        </Part>
      )}
      {restored.length > 0 && (
        <p className="text-sm" data-testid="upgrade-move-back-restored">
          {cannot === 0
            ? `Everything the move to Minecraft ${fromVersion} changed is put back (${count(restored.length, 'value', 'values')}).`
            : `The rest is put back (${count(restored.length, 'value', 'values')}).`}
        </p>
      )}
    </div>
  );
}
