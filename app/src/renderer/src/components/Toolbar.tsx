import {
  ChevronDown,
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
import { DropdownMenu, Toolbar as RadixToolbar } from 'radix-ui';
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
  /** Why the resource pack export is disabled, or `null` when it is enabled. */
  exportDisabledReason?: string | null;
  /** Why the resource pack install is disabled, or `null` when it is enabled. */
  installDisabledReason?: string | null;
  /** Why the data pack export is disabled, or `null` when it is enabled. */
  dataExportDisabledReason?: string | null;
  /** Why "Export both" is disabled, or `null` when it is enabled. */
  combinedExportDisabledReason?: string | null;
  /** Why the data pack install is disabled, or `null` when it is enabled. */
  dataInstallDisabledReason?: string | null;
  /**
   * Which pack the "Export .zip" button exports: the data pack for a project with data pack
   * content only, else the resource pack (default). The Export menu offers every option.
   */
  primaryExport?: 'resource' | 'data';
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
  /** Exports the resource pack as a zip. */
  onExportZip?(): void;
  /** Exports the data pack as a zip. */
  onExportDataZip?(): void;
  /** Exports both packs into a folder. */
  onExportCombined?(): void;
  /** Installs the resource pack into the resourcepacks folder. */
  onInstall?(): void;
  /** Installs the data pack into a world (the host shows the world picker). */
  onInstallData?(): void;
  onSettings?(): void;
}

/** One entry of a toolbar menu. */
interface MenuEntry {
  label: string;
  testId: string;
  /** Why it is disabled, or `null`. */
  reason: string | null;
  onSelect: (() => void) | undefined;
}

const menuItemClass =
  'flex cursor-pointer flex-col rounded px-2 py-1 text-sm outline-none select-none ' +
  'data-[highlighted]:bg-bg data-[highlighted]:text-accent ' +
  'data-[disabled]:cursor-default data-[disabled]:text-muted';

/**
 * A toolbar button that opens a menu. Disabled entries stay listed with the reason under
 * their label, so the menu always says why something is unavailable.
 */
function ToolMenu(props: {
  label: string;
  ariaLabel?: string;
  tip: string;
  icon: ReactNode;
  testId: string;
  disabled?: boolean;
  entries: readonly MenuEntry[];
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <Tip label={props.tip}>
        <DropdownMenu.Trigger asChild disabled={props.disabled === true}>
          <RadixToolbar.Button
            type="button"
            className={buttonClass}
            data-testid={props.testId}
            aria-label={props.ariaLabel}
          >
            {props.icon}
            {props.label}
          </RadixToolbar.Button>
        </DropdownMenu.Trigger>
      </Tip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="z-50 flex min-w-56 flex-col gap-0.5 rounded-md border border-border bg-panel p-1 text-text shadow-lg"
        >
          {props.entries.map((entry) => {
            const disabled = entry.reason !== null || entry.onSelect === undefined;
            return (
              <DropdownMenu.Item
                key={entry.testId}
                data-testid={entry.testId}
                disabled={disabled}
                className={menuItemClass}
                onSelect={() => entry.onSelect?.()}
              >
                <span>{entry.label}</span>
                {entry.reason !== null && (
                  <span className="text-xs text-muted" data-testid={`${entry.testId}-reason`}>
                    {entry.reason}
                  </span>
                )}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
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
  const dataExportReason = props.dataExportDisabledReason ?? null;
  const combinedReason = props.combinedExportDisabledReason ?? dataExportReason;
  const dataInstallReason = props.dataInstallDisabledReason ?? null;
  const busy = props.exporting === true;
  const busyReason = busy ? 'An export is running.' : null;
  const primaryIsData = props.primaryExport === 'data';
  const primaryReason = primaryIsData ? dataExportReason : exportReason;
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
        tip={
          primaryReason ??
          (primaryIsData ? 'Export the data pack (.zip)…' : 'Export the resource pack (.zip)…')
        }
        testId="toolbar-export-zip"
        icon={<PackageOpen size={iconSize} aria-hidden />}
        disabled={primaryReason !== null || busy}
        onClick={primaryIsData ? props.onExportDataZip : props.onExportZip}
      />
      <ToolMenu
        label=""
        ariaLabel="Export options"
        tip="Export the resource pack, the data pack or both"
        testId="toolbar-export-menu"
        icon={<ChevronDown size={iconSize} aria-hidden />}
        disabled={!props.hasProject || busy}
        entries={[
          {
            label: 'Resource pack (.zip)…',
            testId: 'export-resource-zip',
            reason: busyReason ?? exportReason,
            onSelect: props.onExportZip,
          },
          {
            label: 'Data pack (.zip)…',
            testId: 'export-data-zip',
            reason: busyReason ?? dataExportReason,
            onSelect: props.onExportDataZip,
          },
          {
            label: 'Both packs into a folder…',
            testId: 'export-combined',
            reason: busyReason ?? combinedReason,
            onSelect: props.onExportCombined,
          },
        ]}
      />
      <ToolMenu
        label="Install"
        tip="Install into your Minecraft folder"
        testId="toolbar-install-menu"
        icon={<Gamepad2 size={iconSize} aria-hidden />}
        disabled={!props.hasProject || busy}
        entries={[
          {
            label: 'Resource pack to the resourcepacks folder',
            testId: 'install-resource',
            reason: busyReason ?? installReason,
            onSelect: props.onInstall,
          },
          {
            label: 'Data pack to a world…',
            testId: 'install-data',
            reason: busyReason ?? dataInstallReason,
            onSelect: props.onInstallData,
          },
        ]}
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
