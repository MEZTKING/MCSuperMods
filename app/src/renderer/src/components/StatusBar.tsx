import type { TargetFacts } from '@msm/plugin-api';
import type { SessionSnapshot } from '../session/project-session';
import { plainWordsIn } from '../studios/plain-things';

/** "1 thing to fix", "3 things to fix", or `null` for none (plan B703). */
export function thingsToFixWords(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? '1 thing to fix' : `${count} things to fix`;
}

/**
 * The mod's name, whether it is saved, the Minecraft it is for (ADR 0037 D4, plan B703: "For
 * Minecraft <version>" with a "snapshot" badge where it is one), undo and redo in words and the
 * number of things to fix, all in plain words (the folder is reached by Show in folder on Home's
 * Your mods). Messages go to toasts.
 */
export function StatusBar({
  snapshot,
  target = null,
}: {
  snapshot: SessionSnapshot;
  /** The open project's target; shown only while a project is open. */
  target?: TargetFacts | null;
}) {
  const toFix = thingsToFixWords(
    snapshot.problems.filter(
      (problem) => problem.severity === 'error' || problem.severity === 'warning',
    ).length,
  );
  const project = snapshot.project;
  return (
    <footer className="flex gap-4 border-t border-border bg-panel px-2 py-1 text-xs text-muted">
      <span className="truncate" data-testid="status-mod-name">
        {project === null ? 'No mod is open' : project.name}
      </span>
      {project !== null && <span>{snapshot.dirty ? 'Not saved yet' : 'Saved'}</span>}
      {project !== null && target !== null && (
        <span className="flex items-center gap-1" data-testid="project-target">
          For Minecraft {target.mcVersion}
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
      {snapshot.undoLabel !== undefined && <span>Undo: {plainWordsIn(snapshot.undoLabel)}</span>}
      {snapshot.redoLabel !== undefined && <span>Redo: {plainWordsIn(snapshot.redoLabel)}</span>}
      {toFix !== null && (
        <span className="ml-auto" data-testid="status-things-to-fix">
          {toFix}
        </span>
      )}
    </footer>
  );
}
