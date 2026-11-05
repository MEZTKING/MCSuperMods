import type { TargetFacts } from '@msm/plugin-api';
import type { SessionSnapshot } from '../session/project-session';

/**
 * Project root, dirty marker, the project's target (ADR 0037 D4: id and a "snapshot" badge),
 * undo/redo labels and problem counts. Messages go to toasts.
 */
export function StatusBar({
  snapshot,
  target = null,
}: {
  snapshot: SessionSnapshot;
  /** The open project's target; shown only while a project is open. */
  target?: TargetFacts | null;
}) {
  const errors = snapshot.problems.filter((problem) => problem.severity === 'error').length;
  const warnings = snapshot.problems.filter((problem) => problem.severity === 'warning').length;
  return (
    <footer className="flex gap-4 border-t border-border bg-panel px-2 py-1 text-xs text-muted">
      <span className="truncate">{snapshot.root ?? 'No project open'}</span>
      {snapshot.project !== null && <span>{snapshot.dirty ? 'Unsaved changes' : 'Saved'}</span>}
      {snapshot.project !== null && target !== null && (
        <span
          className="flex items-center gap-1"
          data-testid="project-target"
          title={`Minecraft ${target.mcVersion}`}
        >
          {target.id}
          {target.channel === 'snapshot' && (
            <span
              className="rounded border border-border px-1 text-[0.65rem]"
              data-testid="project-target-snapshot"
            >
              snapshot
            </span>
          )}
        </span>
      )}
      {snapshot.undoLabel !== undefined && <span>Undo: {snapshot.undoLabel}</span>}
      {snapshot.redoLabel !== undefined && <span>Redo: {snapshot.redoLabel}</span>}
      <span className="ml-auto">
        {errors} error(s), {warnings} warning(s)
      </span>
    </footer>
  );
}
