/** Props of {@link Toolbar}. */
export interface ToolbarProps {
  hasProject: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | undefined;
  redoLabel: string | undefined;
  /** Why Save is disabled, or `null` when it is enabled. */
  saveDisabledReason: string | null;
  canAddElement: boolean;
  onNew(): void;
  onOpen(): void;
  onSave(): void;
  onUndo(): void;
  onRedo(): void;
  onAddNamespace(): void;
  onAddElement(): void;
}

/** The main toolbar. */
export function Toolbar(props: ToolbarProps) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Project">
      <button type="button" onClick={props.onNew}>
        New
      </button>
      <button type="button" onClick={props.onOpen}>
        Open
      </button>
      <button
        type="button"
        onClick={props.onSave}
        disabled={props.saveDisabledReason !== null}
        title={props.saveDisabledReason ?? 'Save the project'}
      >
        Save
      </button>
      <span className="toolbar-separator" aria-hidden="true" />
      <button
        type="button"
        onClick={props.onUndo}
        disabled={!props.canUndo}
        title={props.undoLabel === undefined ? 'Nothing to undo' : `Undo ${props.undoLabel}`}
      >
        Undo
      </button>
      <button
        type="button"
        onClick={props.onRedo}
        disabled={!props.canRedo}
        title={props.redoLabel === undefined ? 'Nothing to redo' : `Redo ${props.redoLabel}`}
      >
        Redo
      </button>
      <span className="toolbar-separator" aria-hidden="true" />
      <button type="button" onClick={props.onAddNamespace} disabled={!props.hasProject}>
        Add namespace
      </button>
      <button type="button" onClick={props.onAddElement} disabled={!props.canAddElement}>
        Add element
      </button>
    </div>
  );
}
