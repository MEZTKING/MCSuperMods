import type { SessionSnapshot } from '../session/project-session';
import { useUiStore } from '../store/ui-store';

/** Project root, dirty marker, undo/redo labels and the latest message. */
export function StatusBar({ snapshot }: { snapshot: SessionSnapshot }) {
  const message = useUiStore((state) => state.message);
  return (
    <footer className="status-bar">
      <span>{snapshot.root ?? 'No project open'}</span>
      {snapshot.project !== null && <span>{snapshot.dirty ? 'Unsaved changes' : 'Saved'}</span>}
      {snapshot.undoLabel !== undefined && <span>Undo: {snapshot.undoLabel}</span>}
      {snapshot.redoLabel !== undefined && <span>Redo: {snapshot.redoLabel}</span>}
      <output
        className={message?.kind === 'error' ? 'message error' : 'message'}
        aria-live="polite"
      >
        {message?.text ?? ''}
      </output>
    </footer>
  );
}
