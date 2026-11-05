/**
 * The "Upgrade project target" dialog (ADR 0037 D4): lists every built-in target other than
 * the project's (with a "snapshot" badge for snapshot targets), previews what moving the
 * project there changes (the target's `migrateFrom` report: changes, then problems grouped by
 * severity) and hands "Upgrade" to the host, which applies the report as one undo step.
 * Downgrading uses the same dialog. Presentational: the host owns the session.
 *
 * @packageDocumentation
 */

import type { MigrationReport, Problem, ProblemSeverity, TargetFacts } from '@msm/plugin-api';
import { useEffect, useState } from 'react';
import { Modal } from './NewElementDialog';
import { Button } from './ui/Button';
import { targetLabel } from './wizard/wizard-model';

/** The problem severities in the order the preview groups them. */
const SEVERITIES: readonly { severity: ProblemSeverity; heading: string }[] = [
  { severity: 'error', heading: 'Errors' },
  { severity: 'warning', heading: 'Warnings' },
  { severity: 'info', heading: 'Notes' },
];

/** The preview's summary line. */
export function upgradeSummary(report: MigrationReport): string {
  const changes = report.changes.length;
  const problems = report.problems.length;
  const changeText = changes === 1 ? '1 change' : `${changes} changes`;
  const problemText = problems === 1 ? '1 problem' : `${problems} problems`;
  return `${changeText}, ${problemText}.`;
}

/** The problems of `report` with `severity`. */
export function problemsOfSeverity(
  report: MigrationReport,
  severity: ProblemSeverity,
): readonly Problem[] {
  return report.problems.filter((problem) => problem.severity === severity);
}

export interface UpgradeTargetDialogProps {
  /** The open project's target id (not offered). */
  currentTargetId: string;
  /** Every built-in target, newest first (`session.availableTargets`). */
  targets: readonly TargetFacts[];
  /** `session.upgradeTargetPreview`. */
  preview(targetId: string): Promise<MigrationReport>;
  /** Applies the previewed report (`session.upgradeTarget`); the host closes the dialog. */
  onUpgrade(targetId: string, report: MigrationReport): void;
  onCancel(): void;
}

type PreviewState =
  | { state: 'idle' }
  | { state: 'loading'; targetId: string }
  | { state: 'ready'; targetId: string; report: MigrationReport }
  | { state: 'failed'; targetId: string; message: string };

export function UpgradeTargetDialog(props: UpgradeTargetDialogProps) {
  const { currentTargetId, targets, preview } = props;
  const offered = targets.filter((target) => target.id !== currentTargetId);
  const [chosen, setChosen] = useState<string | null>(offered[0]?.id ?? null);
  const [state, setState] = useState<PreviewState>({ state: 'idle' });

  useEffect(() => {
    if (chosen === null) return;
    let live = true;
    setState({ state: 'loading', targetId: chosen });
    preview(chosen).then(
      (report) => {
        if (live) setState({ state: 'ready', targetId: chosen, report });
      },
      (error: unknown) => {
        if (live) {
          const message = error instanceof Error ? error.message : String(error);
          setState({ state: 'failed', targetId: chosen, message });
        }
      },
    );
    return () => {
      live = false;
    };
  }, [chosen, preview]);

  const current = targets.find((target) => target.id === currentTargetId);
  const ready = state.state === 'ready' && state.targetId === chosen ? state : null;

  return (
    <Modal
      title="Upgrade project target"
      error={state.state === 'failed' ? `Could not preview the upgrade: ${state.message}` : null}
      wide
      testId="upgrade-target-dialog"
      submitLabel="Upgrade"
      busy={ready === null}
      onCancel={props.onCancel}
      onSubmit={() => {
        if (ready !== null) props.onUpgrade(ready.targetId, ready.report);
      }}
    >
      <p className="text-muted text-sm">
        The project exports for{' '}
        <span data-testid="upgrade-target-current">
          {current === undefined ? currentTargetId : targetLabel(current)}
        </span>
        . Choose the target to move it to; Undo reverts the upgrade.
      </p>
      {offered.length === 0 ? (
        <p className="text-muted text-sm" data-testid="upgrade-target-none">
          There is no other target to move this project to.
        </p>
      ) : (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm">Target</legend>
          {offered.map((target) => (
            <Button
              key={target.id}
              type="button"
              aria-pressed={chosen === target.id}
              data-testid={`upgrade-target-${target.id}`}
              className={`flex items-center justify-between gap-2 text-left ${chosen === target.id ? 'border-accent' : ''}`}
              onClick={() => setChosen(target.id)}
            >
              <span>
                {targetLabel(target)} <span className="text-muted">({target.id})</span>
              </span>
              {target.channel === 'snapshot' && (
                <span
                  className="rounded border border-border px-1 text-[0.7rem] text-muted"
                  data-testid={`upgrade-target-${target.id}-snapshot`}
                >
                  snapshot
                </span>
              )}
            </Button>
          ))}
        </fieldset>
      )}
      {chosen !== null && state.state === 'loading' && (
        <p className="text-muted text-sm" data-testid="upgrade-target-loading">
          Checking the project…
        </p>
      )}
      {ready !== null && <UpgradePreview report={ready.report} />}
    </Modal>
  );
}

function UpgradePreview({ report }: { report: MigrationReport }) {
  return (
    <section className="flex flex-col gap-1.5 text-sm" data-testid="upgrade-target-preview">
      <p data-testid="upgrade-target-summary">{upgradeSummary(report)}</p>
      {report.changes.length > 0 && (
        <div>
          <h3 className="font-semibold">Changes</h3>
          <ul className="list-disc pl-5" data-testid="upgrade-target-changes">
            {report.changes.map((change, index) => (
              // Changes have no id of their own; the order is fixed for one report.
              <li key={index}>
                <span className="font-mono">{change.elementId}</span>: {change.description}
                {change.kind === 'remove' ? ' (removed)' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {SEVERITIES.map(({ severity, heading }) => {
        const problems = problemsOfSeverity(report, severity);
        if (problems.length === 0) return null;
        return (
          <div key={severity}>
            <h3 className="font-semibold">{heading}</h3>
            <ul className="list-disc pl-5" data-testid={`upgrade-target-problems-${severity}`}>
              {problems.map((problem, index) => (
                <li key={index}>
                  {problem.elementId === undefined ? (
                    ''
                  ) : (
                    <span className="font-mono">{problem.elementId}: </span>
                  )}
                  {problem.message}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
