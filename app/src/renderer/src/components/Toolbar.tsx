import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Footprints,
  House,
  Redo2,
  Save,
  Search,
  Share2,
  Sparkles,
  Trash2,
  Undo2,
} from 'lucide-react';
import { DropdownMenu, Toolbar as RadixToolbar } from 'radix-ui';
import { type ButtonHTMLAttributes, createContext, type ReactNode, useContext } from 'react';
import type { RecentProjectView } from '../../../shared/platform';
import { plainWordsIn } from '../studios/plain-things';
import {
  describeInstallTarget,
  type InstallTargetOption,
  installTargetName,
  launcherLabel,
  loaderLabel,
} from './install-target';
import { useMenuOpen } from './play/menu-open';
import { PlayControls } from './play/PlayControls';
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
  /**
   * Whether the open mod has changes that are not saved (ADR 0131 D2): `true` accents Save,
   * `false` shows it quiet with "Everything is saved."; absent, Save looks as before.
   */
  unsaved?: boolean;
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
   * Which pack is the mod's main one: the data pack for a mod with data pack content only, else
   * the resource pack. The Export submenu lists that pack first.
   */
  primaryExport?: 'resource' | 'data';
  /** `true` while an export or install runs. */
  exporting?: boolean;
  /** More > New mod… (Ctrl+Shift+N). */
  onNew(): void;
  /** More > Start from a ready-made mod… (the New mod dialog with the starters). */
  onNewFromStarter?(): void;
  /** More > Examples… and Help > Examples… (the Examples gallery). */
  onExamples?(): void;
  /** More > New mod with the AI helper… (ADR 0047 D3); hidden without it. */
  onNewWithAi?(): void;
  /** Shows Home (ADR 0083 D2). */
  onHome?(): void;
  /** "Share my mod": the Fabric mod jar with its defaults (ADR 0083 D4). */
  onShare?(): void;
  /** Why "Share my mod" is disabled, or `null`. */
  shareDisabledReason?: string | null;
  /** Help > Your first mod. */
  onFirstMod?(): void;
  /** Help > What's new. */
  onWhatsNew?(): void;
  /** Help > Guide…, the user guide read in the app (ADR 0124 D14); hidden without it. */
  onGuide?(): void;
  /** Shows the Play controls (ADR 0084 D1); default true. */
  showPlay?: boolean;
  /** Opens Try it, the test area in the app (ADR 0085 D13), before Play. Hidden when absent. */
  onTryIt?(): void;
  /** Whether Try it is the open view (the button then shows as pressed). */
  tryItOpen?: boolean;
  /**
   * Opens the search (ADR 0124 D10) with the letters typed on the field, if any; the toolbar
   * then shows its field (`toolbar-search`). Hidden when absent.
   */
  onSearch?(text: string): void;
  /** The search field's words ("Search or make anything"). */
  searchPlaceholder?: string;
  /** More > Open a mod… (Ctrl+O). */
  onOpen(): void;
  /** Recent mods for More > Recent mods, newest first. */
  recentProjects?: readonly RecentProjectView[];
  /** Opens a recent mod by its root. */
  onOpenRecent?(root: string): void;
  /** Removes a (missing) mod from the recent list. */
  onRemoveRecent?(root: string): void;
  /** Empties the recent list. */
  onClearRecent?(): void;
  /** Called when More > Recent mods opens, so the host can read the list again. */
  onRecentMenuOpen?(): void;
  onSave(): void;
  onUndo(): void;
  onRedo(): void;
  /** More > Add from the full list… (Ctrl+N). */
  onAddElement(): void;
  /** More > Bring in pictures or sounds…. */
  onImportAssets?(): void;
  /** Exports the resource pack as a zip. */
  onExportZip?(): void;
  /** Exports the data pack as a zip. */
  onExportDataZip?(): void;
  /** Exports both packs into a folder. */
  onExportCombined?(): void;
  /** More > Export > Export as a map… (ADR 0116); hidden without it. */
  onExportMap?(): void;
  /** Why the structure exports are disabled, or `null` when they are enabled. */
  structureExportDisabledReason?: string | null;
  /** Exports every structure template as `.nbt` into a folder. */
  onExportStructures?(): void;
  /** Exports every structure template as a Sponge schematic (`.schem`) into a folder. */
  onExportSchematics?(): void;
  /**
   * Further plugin exporters (built-in or external), listed in the Export submenu after the
   * structure exports, each with its own disabled reason.
   */
  pluginExports?: readonly ToolbarPluginExport[];
  /** Why "Fabric mod (.jar)…" is disabled, or `null` when it is enabled. */
  fabricJarExportDisabledReason?: string | null;
  /** Opens the Fabric mod jar export dialog. */
  onExportFabricJar?(): void;
  /**
   * Opens the Export Java project dialog (the eject; disabled for the same reason as the
   * Fabric mod jar).
   */
  onExportJavaProject?(): void;
  /** More > Test in Minecraft… (disabled for the same reason as the Fabric mod jar). */
  onTestInMinecraft?(): void;
  /** Installs the resource pack into the resourcepacks folder. */
  onInstall?(): void;
  /** Installs the data pack into a world (the host shows the world picker). */
  onInstallData?(): void;
  /** More > Modpacks… (ADR 0046); hidden without it. */
  onModpacks?(): void;
  /** More > Settings…. */
  onSettings?(): void;
  /** Opens or closes the AI helper tab in the right dock (ADR 0041 D8); hidden without it. */
  onAiHelper?(): void;
  /** More > Make something… (the Creator, ADR 0043 D3); hidden without it. */
  onCreator?(): void;
  /**
   * Where installs go. When given (also as `null`), the Install submenu opens with a sentence
   * naming the target; `null` means none is chosen or found.
   */
  installTarget?: InstallTargetOption | null;
  /** Every known install target, offered in the Install submenu's "Change target". */
  installTargets?: readonly InstallTargetOption[];
  /** Makes the target with this id the install target. */
  onChooseInstallTarget?(id: string): void;
}

/** A plugin exporter offered in the Export submenu. */
export interface ToolbarPluginExport {
  /** The exporter id; the entry's test id is `export-plugin-<id>`. */
  id: string;
  /** The menu label, for example `Greetings into a folder…`. */
  label: string;
  /** Why it is disabled, or `null`. */
  reason: string | null;
  onSelect(): void;
}

/** One entry of a toolbar menu. */
interface MenuEntry {
  label: string;
  testId: string;
  /** Why it is disabled, or `null`. */
  reason: string | null;
  onSelect: (() => void) | undefined;
  /** The keyboard shortcut, shown at the end of the entry. */
  shortcut?: string;
}

/** The platform's primary modifier key, for shortcut hints. */
export const modKey =
  typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? 'Cmd' : 'Ctrl';

/** The words a disabled entry shows without a mod. */
export const NO_MOD_REASON = 'Open a mod first.';
/** The words an entry shows while an export or install runs. */
export const BUSY_REASON = 'An export is running.';

const menuItemClass =
  'flex cursor-pointer flex-col rounded px-2 py-1 text-sm outline-none select-none ' +
  'data-[highlighted]:bg-bg data-[highlighted]:text-accent ' +
  'data-[disabled]:cursor-default data-[disabled]:text-muted';

const menuContentClass =
  'z-50 flex min-w-56 flex-col gap-0.5 rounded-md border border-border bg-panel p-1 text-text shadow-lg';

const menuSeparator = <DropdownMenu.Separator className="my-0.5 h-px bg-border" />;

/** The label of an entry with its shortcut at the end. */
function EntryLabel(props: { label: string; shortcut?: string | undefined }) {
  if (props.shortcut === undefined) return <span>{props.label}</span>;
  return (
    <span className="flex items-center justify-between gap-4">
      <span>{props.label}</span>
      <kbd className="font-sans text-xs text-muted">{props.shortcut}</kbd>
    </span>
  );
}

/** Tells the menu an entry was chosen ({@link useMenuOpen}'s `chose`). */
const ChoseContext = createContext<() => void>(() => {});

/** One menu entry; a disabled one stays listed with its reason under the label. */
function Entry({ entry }: { entry: MenuEntry }) {
  const chose = useContext(ChoseContext);
  const disabled = entry.reason !== null || entry.onSelect === undefined;
  return (
    <DropdownMenu.Item
      data-testid={entry.testId}
      disabled={disabled}
      className={menuItemClass}
      onSelect={() => {
        chose();
        entry.onSelect?.();
      }}
    >
      <EntryLabel label={entry.label} shortcut={entry.shortcut} />
      {entry.reason !== null && (
        <span className="text-xs text-muted" data-testid={`${entry.testId}-reason`}>
          {entry.reason}
        </span>
      )}
    </DropdownMenu.Item>
  );
}

/** A submenu of the More menu; a disabled one shows its reason under its label. */
function SubMenu(props: {
  label: string;
  testId: string;
  /** Why it is disabled, or `null`. */
  reason: string | null;
  /** Called when the submenu opens (Recent mods reads the list again). */
  onOpen?: (() => void) | undefined;
  /** The submenu's accessible name. */
  ariaLabel?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <DropdownMenu.Sub
      onOpenChange={(open) => {
        if (open) props.onOpen?.();
      }}
    >
      <DropdownMenu.SubTrigger
        data-testid={props.testId}
        disabled={props.reason !== null}
        className={menuItemClass}
      >
        <span className="flex items-center justify-between gap-4">
          <span>{props.label}</span>
          <ChevronRight size={14} aria-hidden />
        </span>
        {props.reason !== null && (
          <span className="text-xs text-muted" data-testid={`${props.testId}-reason`}>
            {props.reason}
          </span>
        )}
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent
          sideOffset={4}
          aria-label={props.ariaLabel ?? props.label}
          className={`${menuContentClass} ${props.wide === true ? 'max-w-[min(90vw,32rem)]' : ''}`}
        >
          {props.children}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}

/**
 * The top of the Install submenu: a sentence naming the install target, then a "Change target"
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
      {menuSeparator}
    </>
  );
}

/**
 * The rows of More > Recent mods: recent mods (missing ones disabled with "(missing)" and a
 * remove item), then "Clear list".
 */
function RecentRows(props: {
  projects: readonly RecentProjectView[];
  onOpen: ((root: string) => void) | undefined;
  onRemove: ((root: string) => void) | undefined;
  onClear: (() => void) | undefined;
}) {
  const { projects } = props;
  return (
    <>
      {projects.length === 0 ? (
        <DropdownMenu.Item disabled data-testid="recent-projects-empty" className={menuItemClass}>
          No recent mods
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
                aria-label={`Remove ${entry.name} from recent mods`}
                title="Remove from recent mods"
                className={`${iconButtonClass} outline-none data-[highlighted]:bg-bg data-[highlighted]:text-accent`}
                onSelect={() => props.onRemove?.(entry.root)}
              >
                <Trash2 size={14} aria-hidden />
              </DropdownMenu.Item>
            )}
          </div>
        ))
      )}
      {menuSeparator}
      <DropdownMenu.Item
        data-testid="recent-projects-clear"
        disabled={projects.length === 0 || props.onClear === undefined}
        className={menuItemClass}
        onSelect={() => props.onClear?.()}
      >
        Clear list
      </DropdownMenu.Item>
    </>
  );
}

/**
 * A toolbar button that opens a menu (Help, More). The trigger opens on a press of the main
 * button, Enter, Space or Down, like any Radix menu; Escape anywhere in the menu or its submenus
 * closes it ({@link useMenuOpen}).
 */
function ToolMenu(props: {
  /** The words on the button; empty for an icon-only button. */
  label: string;
  ariaLabel?: string;
  tip: string;
  icon: ReactNode;
  /** The icon after the words (More's arrow) rather than before them. */
  iconAfter?: boolean;
  testId: string;
  children: ReactNode;
}) {
  const menu = useMenuOpen();
  return (
    <DropdownMenu.Root modal={false} {...menu.root}>
      <Tip label={props.tip}>
        <DropdownMenu.Trigger asChild>
          <RadixToolbar.Button
            ref={menu.trigger}
            type="button"
            className={`${buttonClass} shrink-0`}
            data-testid={props.testId}
            aria-label={props.ariaLabel}
          >
            {props.iconAfter !== true && props.icon}
            {props.label}
            {props.iconAfter === true && props.icon}
          </RadixToolbar.Button>
        </DropdownMenu.Trigger>
      </Tip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          collisionPadding={8}
          className={`${menuContentClass} max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto`}
          {...menu.content}
        >
          <ChoseContext.Provider value={menu.chose}>{props.children}</ChoseContext.Provider>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Words shown from 1200 px wide; below that the button shows its icon only (ADR 0131 D4). */
const wideLabelClass = 'hidden min-[1200px]:inline';

function ToolButton(props: {
  label: string;
  tip: string;
  icon: ReactNode;
  testId: string;
  disabled?: boolean;
  /** `icon`: the icon only; `wide`: the words from 1200 px wide; `words` (default): always. */
  show?: 'icon' | 'wide' | 'words';
  /** Extra classes (Save's accent). */
  className?: string;
  ariaPressed?: boolean;
  onClick?: (() => void) | undefined;
}) {
  const disabled = props.disabled === true || props.onClick === undefined;
  const show = props.show ?? 'words';
  const button = (
    <RadixToolbar.Button
      type="button"
      className={`${buttonClass} shrink-0 ${props.className ?? ''}`}
      disabled={disabled}
      data-testid={props.testId}
      aria-label={show === 'words' ? undefined : props.label}
      aria-pressed={props.ariaPressed}
      onClick={props.onClick}
    >
      {props.icon}
      {show === 'words' && props.label}
      {show === 'wide' && <span className={wideLabelClass}>{props.label}</span>}
    </RadixToolbar.Button>
  );
  // A disabled button gets no pointer or focus events, so its tooltip (which says why it is
  // disabled) hangs on a wrapper that does.
  return (
    <Tip label={props.tip}>
      {disabled ? (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so the reason is reachable by keyboard.
        <span tabIndex={0} className="inline-flex shrink-0 rounded">
          {button}
        </span>
      ) : (
        button
      )}
    </Tip>
  );
}

/** A thin line between groups; it fills the row's height so every child shares one top. */
const separator = (
  <RadixToolbar.Separator className="mx-1 w-px shrink-0 self-stretch bg-border bg-clip-content py-2" />
);

/** Props of {@link SearchDoorField}. */
export interface SearchDoorFieldProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onKeyDown'> {
  /** The words shown in the field, also its accessible name. */
  readonly placeholder: string;
  /**
   * `large` on the start surfaces, `compact` elsewhere, `toolbar` in the toolbar: as `compact`
   * from 1000 px wide, an icon button below that (ADR 0131 D4).
   */
  readonly size: 'large' | 'compact' | 'toolbar';
  /** The key shown at the end (`Ctrl+K`). */
  readonly shortcut?: string | undefined;
  /** Opens the search with the letters typed so far (`''` for a click). */
  onOpen(text: string): void;
}

const DOOR_SIZE_CLASS: Record<SearchDoorFieldProps['size'], string> = {
  large: 'w-full max-w-2xl px-3 py-2.5 text-base',
  compact: 'w-56 max-w-full px-2 py-1 text-sm',
  toolbar: 'shrink-0 px-2 py-1 text-sm min-[1000px]:w-full min-[1000px]:shrink',
};

/**
 * A door of the search (ADR 0124 D10): looks like a field and opens the search panel, on a click,
 * Enter, Space or Down, or with the first letter typed on it (so no letter is dropped). Large on
 * Home and the empty editor area, compact in the toolbar.
 */
export function SearchDoorField({
  placeholder,
  size,
  shortcut,
  onOpen,
  className,
  ...rest
}: SearchDoorFieldProps) {
  const large = size === 'large';
  // In the toolbar the words and the key hide below 1000 px: the field is then an icon button.
  const narrowHidden = size === 'toolbar' ? 'hidden min-[1000px]:inline' : '';
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={placeholder}
      {...(shortcut === undefined
        ? {}
        : { 'aria-keyshortcuts': shortcut.replace('Ctrl', 'Control').replace('Cmd', 'Meta') })}
      {...rest}
      className={`flex min-w-0 cursor-text items-center gap-2 rounded-md border border-border bg-bg text-left text-muted hover:border-accent focus-visible:border-accent ${DOOR_SIZE_CLASS[size]} ${className ?? ''}`}
      onClick={() => onOpen('')}
      onKeyDown={(event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          onOpen('');
          return;
        }
        // A printable letter opens the search with it, so typing straight away works.
        if (event.key.length === 1 && event.key !== ' ') {
          event.preventDefault();
          onOpen(event.key);
        }
      }}
    >
      <Search size={large ? 20 : 14} aria-hidden className="shrink-0" />
      <span className={`min-w-0 flex-1 truncate ${narrowHidden}`}>{placeholder}</span>
      {shortcut !== undefined && (
        <kbd
          aria-hidden
          className={`shrink-0 rounded border border-border px-1 text-xs ${narrowHidden}`}
        >
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

/**
 * The toolbar's search field (ADR 0124 D10), when the host offers the search: it takes the row's
 * spare width (up to a comfortable line) and is an icon button below 1000 px.
 */
function ToolbarSearch(props: ToolbarProps) {
  if (props.onSearch === undefined) return null;
  const onSearch = props.onSearch;
  return (
    <div className="flex min-w-0 shrink-0 items-center justify-center min-[1000px]:flex-1 min-[1000px]:shrink">
      <RadixToolbar.Button asChild>
        <SearchDoorField
          data-testid="toolbar-search"
          size="toolbar"
          className="min-[1000px]:max-w-xl"
          placeholder={props.searchPlaceholder ?? 'Search or make anything'}
          shortcut={`${modKey}+K`}
          onOpen={onSearch}
        />
      </RadixToolbar.Button>
    </div>
  );
}

/** Undo's or Redo's tip: what it undoes in plain words (ids as words), with its shortcut. */
export function historyTip(kind: 'undo' | 'redo', label: string | undefined): string {
  if (label === undefined) return kind === 'undo' ? 'Nothing to undo' : 'Nothing to redo';
  return kind === 'undo'
    ? `Undo ${plainWordsIn(label)} (${modKey}+Z)`
    : `Redo ${plainWordsIn(label)} (${modKey}+Shift+Z)`;
}

/** Save's look and tip (ADR 0131 D2): accented while there are unsaved changes. */
export function saveLook(props: ToolbarProps): { tip: string; className: string } {
  if (props.saveDisabledReason !== null) return { tip: props.saveDisabledReason, className: '' };
  if (props.unsaved === true) {
    return {
      tip: `Save your mod (${modKey}+S). You have changes that are not saved.`,
      className: 'border-accent text-accent',
    };
  }
  if (props.unsaved === false) return { tip: 'Everything is saved.', className: 'text-muted' };
  return { tip: `Save your mod (${modKey}+S)`, className: '' };
}

/** The More menu's entries (ADR 0131 D1): everything the row does not show. */
function MoreMenu(props: ToolbarProps) {
  const exportReason = props.exportDisabledReason ?? null;
  const installReason = props.installDisabledReason ?? null;
  const dataExportReason = props.dataExportDisabledReason ?? null;
  const combinedReason = props.combinedExportDisabledReason ?? dataExportReason;
  const dataInstallReason = props.dataInstallDisabledReason ?? null;
  const structureReason = props.structureExportDisabledReason ?? null;
  const fabricJarReason = props.fabricJarExportDisabledReason ?? null;
  const busy = props.exporting === true;
  const busyReason = busy ? BUSY_REASON : null;
  /** The reason of an entry that needs a mod and waits for a running export. */
  const modReason = (reason: string | null): string | null =>
    !props.hasProject ? NO_MOD_REASON : (busyReason ?? reason);
  const needsMod = props.canAddElement ? null : NO_MOD_REASON;
  const packs: MenuEntry[] = [
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
  ];
  if (props.primaryExport === 'data') packs.reverse();
  const exports: MenuEntry[] = [
    ...packs,
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
      label: 'Fabric Java project (eject)…',
      testId: 'export-java-project',
      reason: busyReason ?? fabricJarReason,
      onSelect: props.onExportJavaProject,
    },
    ...(props.onExportMap === undefined
      ? []
      : [
          {
            label: 'Export as a map…',
            testId: 'export-map',
            reason: busyReason,
            onSelect: props.onExportMap,
          },
        ]),
  ];
  const moreExports: MenuEntry[] = [
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
    ...(props.pluginExports ?? []).map((entry) => ({
      label: entry.label,
      testId: `export-plugin-${entry.id}`,
      reason: busyReason ?? entry.reason,
      onSelect: entry.onSelect,
    })),
  ];
  return (
    <>
      <Entry
        entry={{
          label: 'New mod…',
          testId: 'toolbar-new-project',
          reason: null,
          onSelect: props.onNew,
          shortcut: `${modKey}+Shift+N`,
        }}
      />
      <Entry
        entry={{
          label: 'Start from a ready-made mod…',
          testId: 'toolbar-new-from-starter',
          reason: null,
          onSelect: props.onNewFromStarter,
        }}
      />
      <Entry
        entry={{
          label: 'Examples…',
          testId: 'toolbar-examples',
          reason: null,
          onSelect: props.onExamples,
        }}
      />
      {props.onNewWithAi !== undefined && (
        <Entry
          entry={{
            label: 'New mod with the AI helper…',
            testId: 'toolbar-new-with-ai',
            reason: null,
            onSelect: props.onNewWithAi,
          }}
        />
      )}
      {menuSeparator}
      <Entry
        entry={{
          label: 'Open a mod…',
          testId: 'toolbar-open-project',
          reason: null,
          onSelect: props.onOpen,
          shortcut: `${modKey}+O`,
        }}
      />
      <SubMenu
        label="Recent mods"
        testId="toolbar-open-menu"
        reason={null}
        wide
        onOpen={props.onRecentMenuOpen}
      >
        <RecentRows
          projects={props.recentProjects ?? []}
          onOpen={props.onOpenRecent}
          onRemove={props.onRemoveRecent}
          onClear={props.onClearRecent}
        />
      </SubMenu>
      {menuSeparator}
      {props.onCreator !== undefined && (
        <Entry
          entry={{
            label: 'Make something…',
            testId: 'toolbar-creator',
            reason: props.hasProject ? null : NO_MOD_REASON,
            onSelect: props.onCreator,
          }}
        />
      )}
      <Entry
        entry={{
          label: 'Add from the full list…',
          testId: 'toolbar-add-element',
          reason: needsMod,
          onSelect: props.onAddElement,
          shortcut: `${modKey}+N`,
        }}
      />
      <Entry
        entry={{
          label: 'Bring in pictures or sounds…',
          testId: 'toolbar-import-assets',
          reason: needsMod,
          onSelect: props.onImportAssets,
        }}
      />
      {menuSeparator}
      <SubMenu label="Export" testId="toolbar-export-menu" reason={modReason(null)}>
        {exports.map((entry) => (
          <Entry key={entry.testId} entry={entry} />
        ))}
        {menuSeparator}
        {moreExports.map((entry) => (
          <Entry key={entry.testId} entry={entry} />
        ))}
      </SubMenu>
      <SubMenu
        label="Install"
        testId="toolbar-install-menu"
        reason={modReason(null)}
        wide
        ariaLabel="Install into your Minecraft"
      >
        {props.installTarget !== undefined && (
          <InstallTargetSection
            target={props.installTarget}
            targets={props.installTargets ?? []}
            onChoose={props.onChooseInstallTarget}
          />
        )}
        <Entry
          entry={{
            label: 'Resource pack to the resourcepacks folder',
            testId: 'install-resource',
            reason: busyReason ?? installReason,
            onSelect: props.onInstall,
          }}
        />
        <Entry
          entry={{
            label: 'Data pack to a world…',
            testId: 'install-data',
            reason: busyReason ?? dataInstallReason,
            onSelect: props.onInstallData,
          }}
        />
      </SubMenu>
      <Entry
        entry={{
          label: 'Test in Minecraft…',
          testId: 'export-test-in-minecraft',
          reason: modReason(fabricJarReason),
          onSelect: props.onTestInMinecraft,
        }}
      />
      {props.onModpacks !== undefined && (
        <Entry
          entry={{
            label: 'Modpacks…',
            testId: 'toolbar-modpacks',
            reason: null,
            onSelect: props.onModpacks,
          }}
        />
      )}
      {menuSeparator}
      <Entry
        entry={{
          label: 'Settings…',
          testId: 'toolbar-settings',
          reason: null,
          onSelect: props.onSettings,
        }}
      />
    </>
  );
}

/**
 * The toolbar (ADR 0131 D1 to D4; a Radix toolbar: arrow keys move between its controls): one
 * row that never wraps, left to right Home, Undo, Redo, Save, Try it and Play, Share my mod, the
 * search field, the AI helper, Help and More. More holds everything else (new, open and recent
 * mods, Make something, Add from the full list, Bring in pictures or sounds, Export, Install,
 * Test in Minecraft, Modpacks and Settings); the native menus and the command palette have the
 * same. Every shortcut stays.
 */
export function Toolbar(props: ToolbarProps) {
  const iconSize = 16;
  const busy = props.exporting === true;
  const save = saveLook(props);
  return (
    <RadixToolbar.Root
      aria-label="Mod"
      data-testid="toolbar"
      className="flex min-w-0 flex-nowrap items-stretch gap-1.5 border-b border-border bg-panel p-2"
    >
      <ToolButton
        label="Home"
        tip="Your things and what you can make"
        testId="toolbar-home"
        show="icon"
        icon={<House size={iconSize} aria-hidden />}
        onClick={props.onHome}
      />
      <ToolButton
        label="Undo"
        tip={historyTip('undo', props.undoLabel)}
        testId="toolbar-undo"
        show="icon"
        icon={<Undo2 size={iconSize} aria-hidden />}
        disabled={!props.canUndo}
        onClick={props.onUndo}
      />
      <ToolButton
        label="Redo"
        tip={historyTip('redo', props.redoLabel)}
        testId="toolbar-redo"
        show="icon"
        icon={<Redo2 size={iconSize} aria-hidden />}
        disabled={!props.canRedo}
        onClick={props.onRedo}
      />
      <ToolButton
        label="Save"
        tip={save.tip}
        testId="toolbar-save"
        className={save.className}
        icon={<Save size={iconSize} aria-hidden />}
        disabled={props.saveDisabledReason !== null}
        onClick={props.onSave}
      />
      {(props.onTryIt !== undefined || props.showPlay !== false) && separator}
      {props.onTryIt !== undefined && (
        <ToolButton
          label="Try it"
          tip={
            props.hasProject
              ? 'Walk around your blocks and mobs here in the app, without Minecraft (F6). A preview, not the real game.'
              : 'Open a mod to try it.'
          }
          testId="toolbar-try-it"
          show="wide"
          icon={<Footprints size={iconSize} aria-hidden />}
          disabled={!props.hasProject}
          ariaPressed={props.tryItOpen === true}
          onClick={props.onTryIt}
        />
      )}
      {props.showPlay !== false && <PlayControls />}
      {props.onShare !== undefined && (
        <ToolButton
          label="Share my mod"
          tip={
            props.shareDisabledReason ??
            (busy
              ? 'Your mod is being made.'
              : 'Save your mod as one file to give to friends. They put it in their mods folder.')
          }
          testId="toolbar-share"
          show="wide"
          icon={<Share2 size={iconSize} aria-hidden />}
          disabled={!props.hasProject || (props.shareDisabledReason ?? null) !== null || busy}
          onClick={props.onShare}
        />
      )}
      <ToolbarSearch {...props} />
      {props.onSearch === undefined && <div className="flex-1" aria-hidden />}
      {props.onAiHelper !== undefined && (
        <ToolButton
          label="AI helper"
          tip="Ask the AI helper about your mod or have it make things"
          testId="toolbar-ai-helper"
          show="icon"
          icon={<Sparkles size={iconSize} aria-hidden />}
          onClick={props.onAiHelper}
        />
      )}
      <ToolMenu
        label=""
        ariaLabel="Help"
        tip="Help and what is new"
        testId="toolbar-help"
        icon={<CircleHelp size={iconSize} aria-hidden />}
      >
        <Entry
          entry={{
            label: 'Your first mod…',
            testId: 'toolbar-help-first-mod',
            reason: null,
            onSelect: props.onFirstMod,
          }}
        />
        <Entry
          entry={{
            label: 'Examples…',
            testId: 'toolbar-help-examples',
            reason: null,
            onSelect: props.onExamples,
          }}
        />
        <Entry
          entry={{
            label: 'What’s new…',
            testId: 'toolbar-help-whats-new',
            reason: null,
            onSelect: props.onWhatsNew,
          }}
        />
        {props.onGuide !== undefined && (
          <Entry
            entry={{
              label: 'Guide…',
              testId: 'toolbar-help-guide',
              reason: null,
              onSelect: props.onGuide,
            }}
          />
        )}
      </ToolMenu>
      <ToolMenu
        label="More"
        tip="New, open, make, export, install, settings and more"
        testId="toolbar-more"
        iconAfter
        icon={<ChevronDown size={iconSize} aria-hidden />}
      >
        <MoreMenu {...props} />
      </ToolMenu>
    </RadixToolbar.Root>
  );
}
