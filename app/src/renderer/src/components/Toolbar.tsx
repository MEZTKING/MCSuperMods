import { FilePlus, FolderOpen, FolderPlus, Plus, Redo2, Save, Undo2 } from 'lucide-react';
import { Toolbar as RadixToolbar } from 'radix-ui';
import type { ReactNode } from 'react';
import { buttonClass } from './ui/Button';
import { Tip } from './ui/Tip';

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

/** The platform's primary modifier key, for shortcut hints. */
export const modKey =
  typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? 'Cmd' : 'Ctrl';

function ToolButton(props: {
  label: string;
  tip: string;
  icon: ReactNode;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <Tip label={props.tip}>
      <RadixToolbar.Button
        type="button"
        className={buttonClass}
        disabled={props.disabled === true}
        onClick={props.onClick}
      >
        {props.icon}
        {props.label}
      </RadixToolbar.Button>
    </Tip>
  );
}

const separator = <RadixToolbar.Separator className="mx-1 h-5 w-px bg-border" />;

/** The main toolbar (a Radix toolbar: arrow keys move between buttons). */
export function Toolbar(props: ToolbarProps) {
  const iconSize = 16;
  return (
    <RadixToolbar.Root
      aria-label="Project"
      className="flex flex-wrap items-center gap-1.5 border-b border-border bg-panel p-2"
    >
      <ToolButton
        label="New"
        tip="Create a new project"
        icon={<FilePlus size={iconSize} aria-hidden />}
        onClick={props.onNew}
      />
      <ToolButton
        label="Open"
        tip="Open a project folder"
        icon={<FolderOpen size={iconSize} aria-hidden />}
        onClick={props.onOpen}
      />
      <ToolButton
        label="Save"
        tip={props.saveDisabledReason ?? `Save the project (${modKey}+S)`}
        icon={<Save size={iconSize} aria-hidden />}
        disabled={props.saveDisabledReason !== null}
        onClick={props.onSave}
      />
      {separator}
      <ToolButton
        label="Undo"
        tip={
          props.undoLabel === undefined
            ? 'Nothing to undo'
            : `Undo ${props.undoLabel} (${modKey}+Z)`
        }
        icon={<Undo2 size={iconSize} aria-hidden />}
        disabled={!props.canUndo}
        onClick={props.onUndo}
      />
      <ToolButton
        label="Redo"
        tip={
          props.redoLabel === undefined
            ? 'Nothing to redo'
            : `Redo ${props.redoLabel} (${modKey}+Shift+Z)`
        }
        icon={<Redo2 size={iconSize} aria-hidden />}
        disabled={!props.canRedo}
        onClick={props.onRedo}
      />
      {separator}
      <ToolButton
        label="Add namespace"
        tip="Add a namespace to the project"
        icon={<FolderPlus size={iconSize} aria-hidden />}
        disabled={!props.hasProject}
        onClick={props.onAddNamespace}
      />
      <ToolButton
        label="Add element"
        tip={`Add an element (${modKey}+N)`}
        icon={<Plus size={iconSize} aria-hidden />}
        disabled={!props.canAddElement}
        onClick={props.onAddElement}
      />
    </RadixToolbar.Root>
  );
}
