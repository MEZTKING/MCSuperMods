import {
  FilePlus,
  FolderOpen,
  FolderPlus,
  Gamepad2,
  ImageUp,
  PackageOpen,
  Plus,
  Redo2,
  Save,
  Settings,
  Undo2,
} from 'lucide-react';
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
  /** Why "Export .zip" is disabled, or `null` when it is enabled. */
  exportDisabledReason?: string | null;
  /** Why "Install" is disabled, or `null` when it is enabled. */
  installDisabledReason?: string | null;
  /** `true` while an export or install runs. */
  exporting?: boolean;
  onNew(): void;
  onOpen(): void;
  onSave(): void;
  onUndo(): void;
  onRedo(): void;
  onAddNamespace(): void;
  onAddElement(): void;
  onImportAssets?(): void;
  onExportZip?(): void;
  onInstall?(): void;
  onSettings?(): void;
}

/** The platform's primary modifier key, for shortcut hints. */
export const modKey =
  typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? 'Cmd' : 'Ctrl';

function ToolButton(props: {
  label: string;
  tip: string;
  icon: ReactNode;
  testId: string;
  disabled?: boolean;
  onClick?: (() => void) | undefined;
}) {
  const disabled = props.disabled === true || props.onClick === undefined;
  const button = (
    <RadixToolbar.Button
      type="button"
      className={buttonClass}
      disabled={disabled}
      data-testid={props.testId}
      onClick={props.onClick}
    >
      {props.icon}
      {props.label}
    </RadixToolbar.Button>
  );
  // A disabled button gets no pointer or focus events, so its tooltip (which says why it is
  // disabled) hangs on a wrapper that does.
  return (
    <Tip label={props.tip}>
      {disabled ? (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so the reason is reachable by keyboard.
        <span tabIndex={0} className="inline-flex rounded">
          {button}
        </span>
      ) : (
        button
      )}
    </Tip>
  );
}

const separator = <RadixToolbar.Separator className="mx-1 h-5 w-px bg-border" />;

/** The main toolbar (a Radix toolbar: arrow keys move between buttons). */
export function Toolbar(props: ToolbarProps) {
  const iconSize = 16;
  const exportReason = props.exportDisabledReason ?? null;
  const installReason = props.installDisabledReason ?? null;
  const busy = props.exporting === true;
  return (
    <RadixToolbar.Root
      aria-label="Project"
      className="flex flex-wrap items-center gap-1.5 border-b border-border bg-panel p-2"
    >
      <ToolButton
        label="New"
        tip={`Create a new project (${modKey}+Shift+N)`}
        testId="toolbar-new-project"
        icon={<FilePlus size={iconSize} aria-hidden />}
        onClick={props.onNew}
      />
      <ToolButton
        label="Open"
        tip={`Open a project folder (${modKey}+O)`}
        testId="toolbar-open-project"
        icon={<FolderOpen size={iconSize} aria-hidden />}
        onClick={props.onOpen}
      />
      <ToolButton
        label="Save"
        tip={props.saveDisabledReason ?? `Save the project (${modKey}+S)`}
        testId="toolbar-save"
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
        testId="toolbar-undo"
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
        testId="toolbar-redo"
        icon={<Redo2 size={iconSize} aria-hidden />}
        disabled={!props.canRedo}
        onClick={props.onRedo}
      />
      {separator}
      <ToolButton
        label="Add namespace"
        tip={props.hasProject ? 'Add a namespace to the project' : 'No project is open.'}
        testId="toolbar-add-namespace"
        icon={<FolderPlus size={iconSize} aria-hidden />}
        disabled={!props.hasProject}
        onClick={props.onAddNamespace}
      />
      <ToolButton
        label="Add element"
        tip={
          props.canAddElement ? `Add an element (${modKey}+N)` : 'Open a project with a namespace.'
        }
        testId="toolbar-add-element"
        icon={<Plus size={iconSize} aria-hidden />}
        disabled={!props.canAddElement}
        onClick={props.onAddElement}
      />
      <ToolButton
        label="Import assets"
        tip={
          props.canAddElement
            ? 'Import textures (PNG) or sounds (Ogg) into a namespace'
            : 'Open a project with a namespace.'
        }
        testId="toolbar-import-assets"
        icon={<ImageUp size={iconSize} aria-hidden />}
        disabled={!props.canAddElement}
        onClick={props.onImportAssets}
      />
      {separator}
      <ToolButton
        label="Export .zip"
        tip={exportReason ?? 'Export resource pack (.zip)…'}
        testId="toolbar-export-zip"
        icon={<PackageOpen size={iconSize} aria-hidden />}
        disabled={exportReason !== null || busy}
        onClick={props.onExportZip}
      />
      <ToolButton
        label="Install"
        tip={installReason ?? 'Install to the resourcepacks folder of your Minecraft folder'}
        testId="toolbar-install"
        icon={<Gamepad2 size={iconSize} aria-hidden />}
        disabled={installReason !== null || busy}
        onClick={props.onInstall}
      />
      {separator}
      <ToolButton
        label="Settings"
        tip="Minecraft folder and vanilla assets"
        testId="toolbar-settings"
        icon={<Settings size={iconSize} aria-hidden />}
        onClick={props.onSettings}
      />
    </RadixToolbar.Root>
  );
}
