import type { SessionSnapshot } from '../session/project-session';

/** Project root, dirty marker, undo/redo labels and problem counts. Messages go to toasts. */
export function StatusBar({ snapshot }: { snapshot: SessionSnapshot }) {
  const errors = snapshot.problems.filter((problem) => problem.severity === 'error').length;
  const warnings = snapshot.problems.filter((problem) => problem.severity === 'warning').length;
  return (
    <footer className="flex gap-4 border-t border-border bg-panel px-2 py-1 text-xs text-muted">
      <span className="truncate">{snapshot.root ?? 'No project open'}</span>
      {snapshot.project !== null && <span>{snapshot.dirty ? 'Unsaved changes' : 'Saved'}</span>}
      {snapshot.undoLabel !== undefined && <span>Undo: {snapshot.undoLabel}</span>}
      {snapshot.redoLabel !== undefined && <span>Redo: {snapshot.redoLabel}</span>}
      <span className="ml-auto">
        {errors} error(s), {warnings} warning(s)
      </span>
    </footer>
  );
}
