import {
  Check,
  ChevronDown,
  ChevronRight,
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
  Trash2,
  Undo2,
} from 'lucide-react';
import { DropdownMenu, Toolbar as RadixToolbar } from 'radix-ui';
import type { ReactNode } from 'react';
import type { RecentProjectView } from '../../../shared/platform';
import {
  describeInstallTarget,
  type InstallTargetOption,
  installTargetName,
  launcherLabel,
  loaderLabel,
} from './install-target';
import { buttonClass, iconButtonClass } from './ui/Button';
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
  /** Opens the New project dialog with the starters (the "New" split arrow). */
  onNewFromStarter?(): void;
  /** Opens the Examples gallery (the "New" split arrow). */
  onExamples?(): void;
  onOpen(): void;
  /** Recent projects for the "Open" split arrow, newest first. */
  recentProjects?: readonly RecentProjectView[];
  /** Opens a recent project by its root. */
  onOpenRecent?(root: string): void;
  /** Removes a (missing) project from the recent list. */
  onRemoveRecent?(root: string): void;
  /** Empties the recent list. */
  onClearRecent?(): void;
  /** Called when the "Open" split arrow opens, so the host can re-read the list. */
  onRecentMenuOpen?(): void;
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
  /**
   * Why the structure exports ("More exports") are disabled, or `null` when they are
   * enabled.
   */
  structureExportDisabledReason?: string | null;
  /** Exports every structure template as `.nbt` into a folder. */
  onExportStructures?(): void;
  /** Exports every structure template as a Sponge schematic (`.schem`) into a folder. */
  onExportSchematics?(): void;
  /** Why "Fabric mod (.jar)…" is disabled, or `null` when it is enabled. */
  fabricJarExportDisabledReason?: string | null;
  /** Opens the Fabric mod jar export dialog. */
  onExportFabricJar?(): void;
  /** Opens the Test in Minecraft dialog (disabled for the same reason as the Fabric mod jar). */
  onTestInMinecraft?(): void;
  /** Installs the resource pack into the resourcepacks folder. */
  onInstall?(): void;
  /** Installs the data pack into a world (the host shows the world picker). */
  onInstallData?(): void;
  onSettings?(): void;
  /**
   * Where installs go. When given (also as `null`), the Install menu opens with a sentence
   * naming the target; `null` means none is chosen or found.
   */
  installTarget?: InstallTargetOption | null;
  /** Every known install target, offered in the Install menu's "Change target" submenu. */
  installTargets?: readonly InstallTargetOption[];
  /** Makes the target with this id the install target. */
  onChooseInstallTarget?(id: string): void;
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

const menuContentClass =
  'z-50 flex min-w-56 flex-col gap-0.5 rounded-md border border-border bg-panel p-1 text-text shadow-lg';

/**
 * The top of the Install menu: a sentence naming the install target, then a "Change target"
 * submenu with every known location as a radio item.
 */
function InstallTargetSection(props: {
  target: InstallTargetOption | null;
  targets: readonly InstallTargetOption[];
  onChoose: ((id: string) => void) | undefined;
}) {
  const sentence = describeInstallTarget(props.target);
  const canChoose = props.targets.length > 0 && props.onChoose !== undefined;
  return (
    <>
      <DropdownMenu.Label
        data-testid="install-target"
        aria-live="polite"
        className="flex flex-col px-2 py-1 text-sm text-muted"
      >
        <span>{sentence}</span>
        {props.target?.warnings.map((warning) => (
          <span key={warning} className="text-xs">
            {warning}
          </span>
        ))}
      </DropdownMenu.Label>
      {canChoose && (
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger
            data-testid="install-target-change"
            className={`${menuItemClass} flex-row items-center justify-between gap-2`}
          >
            <span>Change target</span>
            <ChevronRight size={14} aria-hidden />
          </DropdownMenu.SubTrigger>
          <DropdownMenu.Portal>
            <DropdownMenu.SubContent
              sideOffset={4}
              aria-label="Install target"
              className={`${menuContentClass} max-w-[min(90vw,28rem)]`}
            >
              <DropdownMenu.RadioGroup
                value={props.target?.id ?? ''}
                onValueChange={(id) => props.onChoose?.(id)}
              >
                {props.targets.map((option) => {
                  const loader = loaderLabel(option.loader);
                  const note = option.problems[0] ?? option.warnings[0];
                  return (
                    <DropdownMenu.RadioItem
                      key={option.id}
                      value={option.id}
                      data-testid={`install-target-${option.id}`}
                      aria-label={`Install to ${installTargetName(option)}${loader === null ? '' : `, ${loader}`}${option.installable ? '' : ', cannot install here'}`}
                      className={`${menuItemClass} relative pl-6`}
                    >
                      <DropdownMenu.ItemIndicator className="absolute top-1.5 left-1.5">
                        <Check size={14} aria-hidden />
                      </DropdownMenu.ItemIndicator>
                      <span>
                        {option.displayName === ''
                          ? launcherLabel(option.launcher)
                          : option.displayName}
                      </span>
                      <span className="text-xs text-muted">
                        {[
                          launcherLabel(option.launcher),
                          option.mcVersion === null ? null : `MC ${option.mcVersion}`,
                          loader,
                        ]
                          .filter((part) => part !== null)
                          .join(' · ')}
                      </span>
                      {note !== undefined && <span className="text-xs text-muted">{note}</span>}
                    </DropdownMenu.RadioItem>
                  );
                })}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.SubContent>
          </DropdownMenu.Portal>
        </DropdownMenu.Sub>
      )}
      <DropdownMenu.Separator className="my-0.5 h-px bg-border" />
    </>
  );
}

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
  /** Content shown above the entries (the Install menu's target). */
  header?: ReactNode;
  entries: readonly MenuEntry[];
  /** A submenu after the entries (the Export menu's "More exports"). */
  more?: { label: string; testId: string; entries: readonly MenuEntry[] };
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
        <DropdownMenu.Content align="start" sideOffset={4} className={menuContentClass}>
          {props.header}
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
          {props.more !== undefined && (
            <>
              <DropdownMenu.Separator className="my-0.5 h-px bg-border" />
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger
                  data-testid={props.more.testId}
                  className={`${menuItemClass} flex-row items-center justify-between`}
                >
                  {props.more.label}
                  <ChevronRight size={14} aria-hidden />
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent sideOffset={4} className={menuContentClass}>
                    {props.more.entries.map((entry) => (
                      <DropdownMenu.Item
                        key={entry.testId}
                        data-testid={entry.testId}
                        disabled={entry.reason !== null || entry.onSelect === undefined}
                        className={menuItemClass}
                        onSelect={() => entry.onSelect?.()}
                      >
                        <span>{entry.label}</span>
                        {entry.reason !== null && (
                          <span
                            className="text-xs text-muted"
                            data-testid={`${entry.testId}-reason`}
                          >
                            {entry.reason}
                          </span>
                        )}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * The "Open" split arrow: recent projects (missing ones disabled with "(missing)" and a
 * remove item), then "Clear list".
 */
function RecentMenu(props: {
  projects: readonly RecentProjectView[];
  onOpen: ((root: string) => void) | undefined;
  onRemove: ((root: string) => void) | undefined;
  onClear: (() => void) | undefined;
  onMenuOpen: (() => void) | undefined;
  iconSize: number;
}) {
  const { projects } = props;
  return (
    <DropdownMenu.Root
      modal={false}
      onOpenChange={(open) => {
        if (open) props.onMenuOpen?.();
      }}
    >
      <Tip label="Open a recent project">
        <DropdownMenu.Trigger asChild>
          <RadixToolbar.Button
            type="button"
            className={buttonClass}
            data-testid="toolbar-open-menu"
            aria-label="Recent projects"
          >
            <ChevronDown size={props.iconSize} aria-hidden />
          </RadixToolbar.Button>
        </DropdownMenu.Trigger>
      </Tip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          aria-label="Recent projects"
          className={`${menuContentClass} max-w-[min(90vw,32rem)]`}
        >
          {projects.length === 0 ? (
            <DropdownMenu.Item
              disabled
              data-testid="recent-projects-empty"
              className={menuItemClass}
            >
              No recent projects
            </DropdownMenu.Item>
          ) : (
            projects.map((entry, index) => (
              <div key={entry.root} className="flex min-w-0 items-center gap-1">
                <DropdownMenu.Item
                  data-testid={`recent-project-${index}`}
                  disabled={!entry.exists || props.onOpen === undefined}
                  aria-label={`${entry.name}${entry.exists ? '' : ' (missing)'}, ${entry.root}`}
                  className={`${menuItemClass} min-w-0 flex-1`}
                  onSelect={() => props.onOpen?.(entry.root)}
                >
                  <span className="truncate">
                    {entry.name}
                    {!entry.exists && ' (missing)'}
                  </span>
                  <span className="truncate text-xs text-muted" title={entry.root}>
                    {entry.root}
                  </span>
                </DropdownMenu.Item>
                {!entry.exists && props.onRemove !== undefined && (
                  <DropdownMenu.Item
                    data-testid={`recent-project-remove-${index}`}
                    aria-label={`Remove ${entry.name} from recent projects`}
                    title="Remove from recent projects"
                    className={`${iconButtonClass} outline-none data-[highlighted]:bg-bg data-[highlighted]:text-accent`}
                    onSelect={() => props.onRemove?.(entry.root)}
                  >
                    <Trash2 size={14} aria-hidden />
                  </DropdownMenu.Item>
                )}
              </div>
            ))
          )}
          <DropdownMenu.Separator className="my-0.5 h-px bg-border" />
          <DropdownMenu.Item
            data-testid="recent-projects-clear"
            disabled={projects.length === 0 || props.onClear === undefined}
            className={menuItemClass}
            onSelect={() => props.onClear?.()}
          >
            Clear list
          </DropdownMenu.Item>
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
  const structureReason = props.structureExportDisabledReason ?? null;
  const fabricJarReason = props.fabricJarExportDisabledReason ?? null;
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
      <ToolMenu
        label=""
        ariaLabel="More ways to start a project"
        tip="Start from a starter or an example"
        testId="toolbar-new-menu"
        icon={<ChevronDown size={iconSize} aria-hidden />}
        entries={[
          {
            label: 'Blank project…',
            testId: 'toolbar-new-blank',
            reason: null,
            onSelect: props.onNew,
          },
          {
            label: 'New from starter…',
            testId: 'toolbar-new-from-starter',
            reason: null,
            onSelect: props.onNewFromStarter,
          },
          {
            label: 'Examples…',
            testId: 'toolbar-examples',
            reason: null,
            onSelect: props.onExamples,
          },
        ]}
      />
      <ToolButton
        label="Open"
        tip={`Open a project folder (${modKey}+O)`}
        testId="toolbar-open-project"
        icon={<FolderOpen size={iconSize} aria-hidden />}
        onClick={props.onOpen}
      />
      <RecentMenu
        projects={props.recentProjects ?? []}
        onOpen={props.onOpenRecent}
        onRemove={props.onRemoveRecent}
        onClear={props.onClearRecent}
        onMenuOpen={props.onRecentMenuOpen}
        iconSize={iconSize}
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
        tip="Export the resource pack, the data pack, both or a Fabric mod jar, or test the mod in Minecraft"
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
          {
            label: 'Fabric mod (.jar)…',
            testId: 'export-fabric-jar',
            reason: busyReason ?? fabricJarReason,
            onSelect: props.onExportFabricJar,
          },
          {
            label: 'Test in Minecraft…',
            testId: 'export-test-in-minecraft',
            reason: busyReason ?? fabricJarReason,
            onSelect: props.onTestInMinecraft,
          },
        ]}
        more={{
          label: 'More exports',
          testId: 'export-more',
          entries: [
            {
              label: 'Structures (.nbt) into a folder…',
              testId: 'export-structures',
              reason: busyReason ?? structureReason,
              onSelect: props.onExportStructures,
            },
            {
              label: 'Structures as Sponge schematics (.schem)…',
              testId: 'export-schematics',
              reason: busyReason ?? structureReason,
              onSelect: props.onExportSchematics,
            },
          ],
        }}
      />
      <ToolMenu
        label="Install"
        tip="Install into your Minecraft folder or launcher instance"
        testId="toolbar-install-menu"
        icon={<Gamepad2 size={iconSize} aria-hidden />}
        disabled={!props.hasProject || busy}
        header={
          props.installTarget === undefined ? undefined : (
            <InstallTargetSection
              target={props.installTarget}
              targets={props.installTargets ?? []}
              onChoose={props.onChooseInstallTarget}
            />
          )
        }
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
        tip="Game locations, vanilla assets and updates"
        testId="toolbar-settings"
        icon={<Settings size={iconSize} aria-hidden />}
        onClick={props.onSettings}
      />
    </RadixToolbar.Root>
  );
}
