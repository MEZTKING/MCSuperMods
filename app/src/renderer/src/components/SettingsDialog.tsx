import { type AiModelId, type AiSettings, DEFAULT_AI_SETTINGS } from '@msm/ai';
import { Dialog } from 'radix-ui';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { AiPicturesPlatform } from '../../../shared/ai-pictures';
import type { MinecraftProgress } from '../../../shared/ipc-channels';
import type {
  AiPlatform,
  AppSettingsPatch,
  AppSettingsView,
  MinecraftStatus,
  WorldBackupsPlatform,
} from '../../../shared/platform';
import type { ExternalPluginState } from '../plugins/external-plugins';
import { usePreferences } from '../store/preferences';
import { AiSettingsSection } from './ai/AiSettingsSection';
import { AiPicturesSettingsSection } from './ai-pictures/AiPicturesSettingsSection';
import {
  type InstallTargetOption,
  installTargetName,
  launcherLabel,
  loaderLabel,
  type ManualLauncher,
  type ManualLauncherRoot,
} from './install-target';
import { fieldClass } from './NewElementDialog';
import { Button } from './ui/Button';
import { WorldBackupsSection } from './WorldBackupsSection';

/** Props of {@link SettingsDialog}. */
export interface SettingsDialogProps {
  /** The Minecraft version the open project (or the default target) uses. */
  mcVersion: string;
  status: MinecraftStatus | null;
  progress: MinecraftProgress | null;
  load(): Promise<AppSettingsView>;
  /** Merges a settings change into the stored settings. */
  save(settings: AppSettingsPatch): Promise<void>;
  /** Shows a folder picker; resolves to the chosen folder or `null`. */
  browse(): Promise<string | null>;
  /** Extracts vanilla assets; resolves to an error message, or `null` on success. */
  extract(): Promise<string | null>;
  onClose(): void;
  /**
   * Every detected game location (ADR 0019), or `null` while they load. When omitted, the
   * Game locations section shows only the official folder override.
   */
  locations?: readonly InstallTargetOption[] | null;
  /** The id of the location installs go to, or `null` when none is chosen. */
  selectedId?: string | null;
  /** Makes the location with this id the install target. */
  onSelectTarget?(id: string): void;
  /** `true` when the stored target no longer exists and the official folder is used instead. */
  targetMissing?: boolean;
  /** Lets the user add a launcher folder (the host shows the folder picker and saves it). */
  onAddLauncherRoot?(kind: ManualLauncher): Promise<void>;
  /** Launcher folders the user added by hand. */
  manualRoots?: readonly ManualLauncherRoot[];
  /** Removes a launcher folder the user added. */
  onRemoveLauncherRoot?(kind: ManualLauncher, path: string): void | Promise<void>;
  /** Which launcher's client jar extraction reads, such as "Prism Launcher — x.y", or `null`. */
  jarSource?: string | null;
  /**
   * The third-party plugin folders found at start-up with their states (ADR 0035 D4). When
   * omitted, the Plugins section lists none.
   */
  plugins?: readonly ExternalPluginState[];
  /** Opens the plugins folder (`<msmHome>/plugins/`, created when missing). */
  onOpenPluginsFolder?: (() => Promise<void>) | undefined;
  /** Main's AI helper services; the "AI helper" section is shown only with them (ADR 0041). */
  ai?: AiPlatform | undefined;
  /** Called after the AI settings or the key changed. */
  onAiChanged?: (() => void) | undefined;
  /** The model the open AI conversation started with, or `null` without one. */
  aiConversationModel?: AiModelId | null;
  /** Main's AI pictures services; the "AI pictures" section is shown only with them (ADR 0093). */
  aiPictures?: AiPicturesPlatform | undefined;
  /** Called after the image service or its key changed. */
  onAiPicturesChanged?: (() => void) | undefined;
  /** Main's world backups (ADR 0102 D3); the "World backups" section is shown only with them. */
  worldBackups?: WorldBackupsPlatform | undefined;
  /**
   * `'ai'`: opened from the AI helper (ADR 0125 D5): the dialog opens scrolled to the helper's
   * section with its key field focused, and keeps it in view while the sections above load,
   * until the user scrolls, clicks or types.
   */
  focus?: 'ai' | undefined;
  /**
   * A line of the settings catalogue (`settings-catalogue.ts`, its `data-setting` id): the
   * dialog opens scrolled to it, focuses its first control and marks it for a moment, and keeps
   * it in view while the sections above load, until the user scrolls, clicks or types.
   */
  focusSetting?: string | undefined;
}

/** How long a line opened by `focusSetting` stays marked, in milliseconds. */
export const SETTING_MARK_MS = 2000;

/** The classes that mark a line opened by `focusSetting`. */
const MARK_CLASSES = ['rounded', 'outline-2', 'outline-offset-2', 'outline-accent'] as const;

/** The motion of the mark, left out under reduced motion. */
const MARK_MOTION = 'transition-[outline-color]';

const prefersReducedMotion = (): boolean =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** The first enabled control of a settings line. */
function firstControl(line: Element): HTMLElement | null {
  return line.querySelector<HTMLElement>(
    'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
  );
}

/** The label of a plugin state in Settings > Plugins. */
export const PLUGIN_STATE_LABELS: Readonly<Record<ExternalPluginState['state'], string>> =
  Object.freeze({ loaded: 'Loaded', refused: 'Refused', failed: 'Failed' });

/** The Settings "Plugins" section (ADR 0035 D4, D5). */
export function PluginsSection(props: {
  plugins: readonly ExternalPluginState[];
  onOpenFolder?: (() => Promise<void>) | undefined;
}) {
  const [error, setError] = useState<string | null>(null);
  const open = async (): Promise<void> => {
    if (props.onOpenFolder === undefined) return;
    setError(null);
    try {
      await props.onOpenFolder();
    } catch (problem) {
      setError(errorText(problem));
    }
  };
  return (
    <section className="flex flex-col gap-1.5" data-testid="settings-plugins" aria-label="Plugins">
      <h3 className="mt-3 font-semibold">Plugins</h3>
      <p className="text-xs text-muted">
        Plugins are code written by third parties. They run sandboxed, without access to your files,
        the network or other projects, but install them only from sources you trust.
      </p>
      {props.plugins.length === 0 ? (
        <p className="text-sm text-muted" data-testid="settings-plugins-empty">
          No plugins installed. Copy a plugin's folder into the plugins folder to add it.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {props.plugins.map((plugin) => (
            <li
              key={plugin.id}
              data-testid={`plugin-${plugin.id}`}
              className="flex flex-col gap-0.5 rounded border border-border p-2"
            >
              <span className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="font-medium">{plugin.name}</span>
                {plugin.version !== '' && <span className="text-muted">{plugin.version}</span>}
                <span className="font-mono text-xs text-muted">{plugin.id}</span>
                <span className={badgeClass} data-testid={`plugin-${plugin.id}-state`}>
                  {PLUGIN_STATE_LABELS[plugin.state]}
                </span>
              </span>
              {plugin.problems.length > 0 && (
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-xs">
                  {plugin.problems.map((problem, index) => (
                    <li
                      key={index}
                      className={problem.severity === 'error' ? 'text-error' : 'text-muted'}
                    >
                      <span className="font-mono">{problem.code}</span>: {problem.message}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">Changes take effect after restarting MCSuperMods.</p>
      <div data-setting="plugins-folder">
        <Button
          data-setting-label
          data-testid="settings-open-plugins"
          disabled={props.onOpenFolder === undefined}
          onClick={() => void open()}
        >
          Open plugins folder
        </Button>
      </div>
      {error !== null && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </section>
  );
}

const ADD_ROOT_BUTTONS: readonly { kind: ManualLauncher; label: string }[] = [
  { kind: 'prism', label: 'Add Prism Launcher folder…' },
  { kind: 'multimc', label: 'Add MultiMC folder…' },
  { kind: 'curseforge', label: 'Add CurseForge folder…' },
];

const badgeClass =
  'inline-flex items-center rounded border border-border bg-bg px-1.5 py-px text-xs leading-4';

const errorText = (problem: unknown): string =>
  problem instanceof Error ? problem.message : String(problem);

/** Lets long paths wrap at any character instead of widening the dialog. */
const pathClass = 'break-all font-mono text-xs [overflow-wrap:anywhere]';

/**
 * A comparison key for a folder path: forward slashes, no trailing slash, and lower case for
 * Windows paths (a drive letter or a UNC prefix), whose file systems ignore case.
 */
export function pathKey(path: string): string {
  let key = path.trim().replace(/\\/g, '/');
  while (key.length > 1 && key.endsWith('/') && !/^[A-Za-z]:\/$/.test(key)) {
    key = key.slice(0, -1);
  }
  return /^[A-Za-z]:/.test(key) || key.startsWith('//') ? key.toLowerCase() : key;
}

/** `true` when `path` is `folder` or lies inside it (both already {@link pathKey}s). */
const within = (path: string, folder: string): boolean =>
  path === folder || path.startsWith(folder.endsWith('/') ? folder : `${folder}/`);

/**
 * The launcher instance whose folder holds `override` (the official launcher folder override),
 * or `null`. An instance's folder is its game folder, plus the folder above it when the game
 * folder is the instance's own `minecraft` or `.minecraft` subfolder.
 */
export function overrideInstance(
  override: string | null,
  locations: readonly InstallTargetOption[] | null | undefined,
): InstallTargetOption | null {
  if (override === null || override.trim() === '' || locations == null) return null;
  const key = pathKey(override);
  for (const location of locations) {
    if (location.launcher === 'official') continue;
    const gameDir = pathKey(location.gameDir);
    const folders = [gameDir];
    const slash = gameDir.lastIndexOf('/');
    const last = gameDir.slice(slash + 1);
    if (slash > 0 && (last === 'minecraft' || last === '.minecraft')) {
      folders.push(gameDir.slice(0, slash));
    }
    if (folders.some((folder) => within(key, folder))) return location;
  }
  return null;
}

/** Says the override belongs to a launcher instance, with a button that selects it. */
function OverrideHint(props: {
  instance: InstallTargetOption;
  onSelect: ((id: string) => void) | undefined;
  testId: string;
}) {
  const { instance } = props;
  return (
    <span className="flex flex-col items-start gap-1 text-xs" data-testid={props.testId}>
      <span>
        This folder belongs to the {launcherLabel(instance.launcher)} instance '
        {instance.displayName}'. Select that instance above instead, and click Use detected here.
      </span>
      {props.onSelect !== undefined && (
        <Button
          className="max-w-full text-left [overflow-wrap:anywhere]"
          data-testid={`${props.testId}-select`}
          onClick={() => props.onSelect?.(instance.id)}
        >
          Select {instance.displayName}
        </Button>
      )}
    </span>
  );
}

/** The radio list of game locations; the checked one is the install target. */
function LocationList(props: {
  locations: readonly InstallTargetOption[] | null;
  selectedId: string | null;
  onSelect: ((id: string) => void) | undefined;
  /** The instance that holds the official folder override, shown on the official row. */
  overrideInstance: InstallTargetOption | null;
}) {
  const baseId = useId();
  if (props.locations === null) {
    return (
      <p className="text-sm text-muted" data-testid="settings-locations-loading">
        Looking for game locations…
      </p>
    );
  }
  if (props.locations.length === 0) {
    return (
      <p className="text-sm text-muted" data-testid="settings-locations-empty">
        No game locations found. Start Minecraft once in your launcher, choose your Minecraft folder
        below, or add a Prism Launcher, MultiMC or CurseForge folder.
      </p>
    );
  }
  return (
    <fieldset
      data-testid="settings-locations"
      data-setting="install-target"
      className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0"
    >
      <legend className="mb-1 text-sm">Install packs into</legend>
      {props.locations.map((location, index) => {
        const detailsId = `${baseId}-${index}`;
        const loader = loaderLabel(location.loader);
        const checked = location.id === props.selectedId;
        return (
          <label
            key={location.id}
            data-testid={`location-row-${location.id}`}
            className={
              'flex cursor-pointer items-start gap-2 rounded border px-2 py-1.5 ' +
              (checked ? 'border-accent bg-bg' : 'border-border')
            }
          >
            <input
              type="radio"
              name="install-target"
              className="mt-1"
              data-testid={`location-select-${location.id}`}
              value={location.id}
              checked={checked}
              disabled={props.onSelect === undefined}
              aria-label={installTargetName(location)}
              aria-describedby={detailsId}
              onChange={() => props.onSelect?.(location.id)}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex min-w-0 flex-wrap items-center gap-1">
                <span className={badgeClass} data-testid={`location-launcher-${location.id}`}>
                  {launcherLabel(location.launcher)}
                </span>
                <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
                  {location.displayName}
                </span>
                {location.mcVersion !== null && (
                  <span className={badgeClass} data-testid={`location-version-${location.id}`}>
                    MC {location.mcVersion}
                  </span>
                )}
                {loader !== null && (
                  <span className={badgeClass} data-testid={`location-loader-${location.id}`}>
                    {loader}
                  </span>
                )}
              </span>
              <span id={detailsId} className="flex min-w-0 flex-col gap-0.5">
                <span
                  className={`${pathClass} text-muted`}
                  data-testid={`location-path-${location.id}`}
                  title={location.gameDir}
                >
                  {location.gameDir}
                </span>
                {location.problems.map((problem) => (
                  <span key={problem} className="text-xs text-error">
                    {problem}
                  </span>
                ))}
                {location.warnings.map((warning) => (
                  <span key={warning} className="text-xs">
                    {warning}
                  </span>
                ))}
                {location.launcher === 'official' && props.overrideInstance !== null && (
                  <OverrideHint
                    instance={props.overrideInstance}
                    onSelect={props.onSelect}
                    testId="location-override-hint"
                  />
                )}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

const PHASE_LABELS: Record<MinecraftProgress['phase'], string> = {
  reading: 'Reading the client jar',
  extracting: 'Unpacking',
  writing: 'Writing files',
  done: 'Done',
};

/**
 * One line describing the asset cache and the installed game version, plus which launcher's
 * client jar extraction reads when the host knows it (`jarSource`).
 */
export function minecraftSummary(
  mcVersion: string,
  status: MinecraftStatus | null,
  jarSource: string | null = null,
): string {
  if (status === null) return 'Checking the Minecraft installation…';
  const jar = jarSource === null ? '' : ` Client jar: ${jarSource}.`;
  if (status.cache !== null) {
    return `Vanilla assets for Minecraft ${mcVersion} are extracted (${status.cache.fileCount} files).${jar}`;
  }
  if (jarSource === null) {
    if (status.minecraftDir === null) return 'No Minecraft folder found.';
    if (status.chosen === null) {
      return `Minecraft ${mcVersion} is not installed in this folder. Start it once in the launcher, then extract.`;
    }
  }
  return `Minecraft ${mcVersion} is installed; its vanilla assets are not extracted yet.${jar}`;
}

/**
 * Settings: game locations (the install target, the official folder override and launcher
 * folders added by hand, ADR 0019), vanilla asset extraction (ADR 0011) and automatic update
 * checks (ADR 0018).
 */
export function SettingsDialog(props: SettingsDialogProps) {
  const { load } = props;
  const [view, setView] = useState<AppSettingsView | null>(null);
  const [folder, setFolder] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoCheck, setAutoCheck] = useState(true);
  const folderId = useId();
  const progressId = useId();
  const autoCheckId = useId();
  const showcaseClipsId = useId();
  const showcaseClips = usePreferences((state) => state.showcaseClips);
  const jarSource = props.jarSource ?? null;
  const manualRoots = props.manualRoots ?? [];
  const saveSettings = props.save;
  const loadAi = useCallback(
    async (): Promise<AiSettings> => (await load()).ai ?? DEFAULT_AI_SETTINGS,
    [load],
  );
  const saveAi = useCallback((ai: AiSettings) => saveSettings({ ai }), [saveSettings]);
  // Opened from the helper: its section is scrolled to the top of the view, and kept there
  // while what is above it loads (the detected folder, the game locations and the status lines
  // move it), until the user scrolls, clicks or types.
  const pinAi = useRef(props.focus === 'ai' && props.ai !== undefined);
  // Opened at a settings line: the same, for the line `focusSetting` names.
  const pinSetting = useRef(props.focusSetting !== undefined);
  const unpin = (): void => {
    pinAi.current = false;
    pinSetting.current = false;
  };
  // The portal mounts the content after the first render: held in state so the effect runs then.
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const rememberSearches = usePreferences((state) => state.rememberSearches);
  const searchHistory = usePreferences((state) => state.searchHistory);
  const rememberSearchesId = useId();
  const [searchesCleared, setSearchesCleared] = useState(false);
  const aiSection = useCallback((node: HTMLElement | null) => {
    if (node === null || !pinAi.current) return;
    const scroll = (): void => {
      if (pinAi.current) node.scrollIntoView?.({ block: 'start' });
    };
    scroll();
    const content = node.parentElement;
    if (content === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(scroll);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const focusSetting = props.focusSetting;
  useEffect(() => {
    if (focusSetting === undefined || content === null) return;
    const reduce = prefersReducedMotion();
    const selector = `[data-setting="${globalThis.CSS?.escape?.(focusSetting) ?? focusSetting}"]`;
    let marked: Element | null = null;
    let focused = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const unmark = (line: Element): void => {
      line.classList.remove(...MARK_CLASSES, MARK_MOTION, 'outline-transparent');
      line.removeAttribute('data-marked');
    };
    const find = (): void => {
      const line = content.querySelector(selector);
      if (line === null) return;
      if (line !== marked) {
        if (marked !== null) unmark(marked);
        marked = line;
        line.classList.add(...MARK_CLASSES);
        if (!reduce) line.classList.add(MARK_MOTION);
        line.setAttribute('data-marked', 'true');
        timers.push(
          setTimeout(() => {
            line.removeAttribute('data-marked');
            if (reduce) {
              unmark(line);
              return;
            }
            line.classList.remove('outline-accent');
            line.classList.add('outline-transparent');
            timers.push(setTimeout(() => unmark(line), 300));
          }, SETTING_MARK_MS),
        );
        line.scrollIntoView?.({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      } else if (pinSetting.current) {
        line.scrollIntoView?.({ block: 'center', behavior: 'auto' });
      }
      if (!focused) {
        const control = firstControl(line);
        if (control !== null) {
          control.focus({ preventScroll: true });
          focused = true;
        }
      }
    };
    find();
    if (!focused) content.focus?.({ preventScroll: true });
    const mutations =
      typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => find());
    mutations?.observe(content, { childList: true, subtree: true, attributes: true });
    const form = content.querySelector('form');
    const sizes =
      typeof ResizeObserver === 'undefined' || form === null ? null : new ResizeObserver(find);
    if (form !== null) sizes?.observe(form);
    return () => {
      mutations?.disconnect();
      sizes?.disconnect();
      for (const timer of timers) clearTimeout(timer);
      if (marked !== null) unmark(marked);
    };
  }, [focusSetting, content]);

  useEffect(() => {
    let live = true;
    load().then(
      (settings) => {
        if (!live) return;
        setView(settings);
        setFolder(settings.minecraftDir ?? '');
        setAutoCheck(settings.updates.autoCheck);
      },
      (problem: unknown) => {
        if (live) setError(problem instanceof Error ? problem.message : String(problem));
      },
    );
    return () => {
      live = false;
    };
  }, [load]);

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const trimmed = folder.trim();
      await props.save({ minecraftDir: trimmed === '' ? null : trimmed });
      setNotice('Saved.');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  };

  const saveAutoCheck = async (next: boolean): Promise<void> => {
    setAutoCheck(next);
    setError(null);
    setNotice(null);
    try {
      await props.save({ updates: { autoCheck: next } });
    } catch (problem) {
      setAutoCheck(!next);
      setError(problem instanceof Error ? problem.message : String(problem));
    }
  };

  const addRoot = async (kind: ManualLauncher): Promise<void> => {
    if (props.onAddLauncherRoot === undefined) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await props.onAddLauncherRoot(kind);
    } catch (problem) {
      setError(errorText(problem));
    } finally {
      setBusy(false);
    }
  };

  const removeRoot = async (root: ManualLauncherRoot): Promise<void> => {
    if (props.onRemoveLauncherRoot === undefined) return;
    setError(null);
    setNotice(null);
    try {
      await props.onRemoveLauncherRoot(root.kind, root.path);
    } catch (problem) {
      setError(errorText(problem));
    }
  };

  const extract = async (): Promise<void> => {
    setError(null);
    setNotice(null);
    const failure = await props.extract();
    if (failure !== null) setError(failure);
    else setNotice('Vanilla assets extracted.');
  };

  const progress = props.progress;
  const status = props.status;
  const canExtract =
    progress === null &&
    status !== null &&
    ((status.chosen !== null && status.minecraftDir !== null) || jarSource !== null);
  const heldBy = overrideInstance(view?.minecraftDir ?? null, props.locations);

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="settings-dialog"
          ref={setContent}
          onOpenAutoFocus={(event) => {
            // The key field (or the line's first control) takes the focus instead of the first field.
            if (props.focus === 'ai' && props.ai !== undefined) event.preventDefault();
            if (props.focusSetting !== undefined) event.preventDefault();
          }}
          onWheel={unpin}
          onPointerDown={unpin}
          onKeyDown={unpin}
          className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[min(94vw,520px)] overflow-x-hidden overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <Dialog.Title className="mb-2 text-base font-semibold">Settings</Dialog.Title>
          <form
            className="flex min-w-0 flex-col gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <h3 className="font-semibold">Game locations</h3>
            {props.targetMissing === true && (
              <p className="text-sm text-error" role="alert" data-testid="settings-target-missing">
                The chosen instance was not found; using the official launcher folder.
              </p>
            )}
            {props.locations !== undefined && (
              <LocationList
                locations={props.locations}
                selectedId={props.selectedId ?? null}
                onSelect={props.onSelectTarget}
                overrideInstance={heldBy}
              />
            )}
            <div className="flex min-w-0 flex-col gap-1.5" data-setting="minecraft-folder">
              <h4 className="mt-1 text-sm font-semibold" data-setting-label>
                Official launcher folder
              </h4>
              <p
                className="text-sm text-muted [overflow-wrap:anywhere]"
                data-testid="settings-detected"
              >
                Detected:{' '}
                {view === null ? '…' : (view.detectedMinecraftDir ?? 'no launcher folder found')}
              </p>
              <label htmlFor={folderId}>
                Use this folder instead (leave empty for the detected one)
              </label>
              <div className="flex min-w-0 gap-1.5">
                <input
                  id={folderId}
                  data-testid="settings-minecraft-folder"
                  className={`${fieldClass} min-w-0 flex-1`}
                  value={folder}
                  spellCheck={false}
                  placeholder={view?.detectedMinecraftDir ?? '/path/to/.minecraft'}
                  onChange={(event) => setFolder(event.target.value)}
                />
                <Button
                  className="shrink-0"
                  onClick={() =>
                    void props.browse().then((path) => {
                      if (path !== null) setFolder(path);
                    })
                  }
                >
                  Browse…
                </Button>
                <Button className="shrink-0" onClick={() => setFolder('')} disabled={folder === ''}>
                  Use detected
                </Button>
              </div>
              {heldBy !== null && (
                <OverrideHint
                  instance={heldBy}
                  onSelect={props.onSelectTarget}
                  testId="settings-override-hint"
                />
              )}
              <div className="flex gap-1.5">
                <Button type="submit" disabled={busy} data-testid="settings-save">
                  Save folder
                </Button>
              </div>
            </div>
            {(props.onAddLauncherRoot !== undefined || manualRoots.length > 0) && (
              <div className="flex min-w-0 flex-col gap-1.5" data-setting="launcher-folders">
                <h4 className="mt-1 text-sm font-semibold" data-setting-label>
                  Other launchers
                </h4>
                {props.onAddLauncherRoot !== undefined && (
                  <>
                    <p className="text-xs text-muted">
                      Prism Launcher and the CurseForge app are found in their usual folders. Add a
                      folder here if yours lives somewhere else, or for MultiMC and PolyMC.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {ADD_ROOT_BUTTONS.map((entry) => (
                        <Button
                          key={entry.kind}
                          data-testid={`settings-add-${entry.kind}`}
                          disabled={busy}
                          onClick={() => void addRoot(entry.kind)}
                        >
                          {entry.label}
                        </Button>
                      ))}
                    </div>
                  </>
                )}
                {manualRoots.length > 0 && (
                  <ul
                    className="m-0 flex list-none flex-col gap-1 p-0"
                    aria-label="Added launcher folders"
                  >
                    {manualRoots.map((root, index) => (
                      <li
                        key={`${root.kind}:${root.path}`}
                        data-testid={`settings-root-${index}`}
                        className="flex items-center gap-1.5"
                      >
                        <span className={badgeClass}>{launcherLabel(root.kind)}</span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className={pathClass} title={root.path}>
                            {root.path}
                          </span>
                          {root.found === 0 && (
                            <span className="text-xs text-muted">
                              No instances found in this folder.
                            </span>
                          )}
                        </span>
                        <Button
                          data-testid={`settings-remove-root-${index}`}
                          aria-label={`Remove ${launcherLabel(root.kind)} folder ${root.path}`}
                          disabled={props.onRemoveLauncherRoot === undefined}
                          onClick={() => void removeRoot(root)}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex min-w-0 flex-col gap-1.5" data-setting="vanilla-assets">
              <h3 className="mt-3 font-semibold" data-setting-label>
                Vanilla assets
              </h3>
              <p className="text-sm" role="status" data-testid="settings-status">
                {minecraftSummary(props.mcVersion, status, jarSource)}
              </p>
              <p className="text-xs text-muted">
                The preview uses models and textures from your own Minecraft client. MSM copies them
                into its cache on this computer and never puts them into exports.
              </p>
              {progress !== null && (
                <div className="flex flex-col gap-0.5">
                  <label htmlFor={progressId} className="text-sm">
                    {PHASE_LABELS[progress.phase]}
                    {progress.total > 1 ? ` (${progress.done} of ${progress.total})` : '…'}
                  </label>
                  <progress
                    id={progressId}
                    data-testid="settings-extract-progress"
                    max={Math.max(progress.total, 1)}
                    value={progress.done}
                    className="w-full"
                  />
                </div>
              )}
              <div className="flex gap-1.5">
                <Button
                  data-testid="settings-extract"
                  disabled={!canExtract}
                  onClick={() => void extract()}
                >
                  {status?.cache != null ? 'Extract again' : 'Extract vanilla assets'}
                </Button>
              </div>
            </div>

            <h3 className="mt-3 font-semibold">Updates</h3>
            <div className="flex items-center gap-1.5" data-setting="auto-update">
              <input
                id={autoCheckId}
                type="checkbox"
                data-testid="settings-auto-update"
                checked={autoCheck}
                disabled={view === null}
                onChange={(event) => void saveAutoCheck(event.target.checked)}
              />
              <label htmlFor={autoCheckId}>Check for updates automatically</label>
            </div>
            <p className="text-xs text-muted">
              The installed Windows app looks for a new release shortly after it starts and
              downloads it in the background. It installs only when you choose Restart to update.
              Help, Check for Updates works either way.
            </p>

            <h3 className="mt-3 font-semibold">Showcase</h3>
            <div className="flex items-center gap-1.5" data-setting="showcase-clips">
              <input
                id={showcaseClipsId}
                type="checkbox"
                data-testid="settings-showcase-clips"
                checked={showcaseClips}
                onChange={(event) =>
                  usePreferences.getState().setShowcaseClips(event.target.checked)
                }
              />
              <label htmlFor={showcaseClipsId}>Play showcase clips</label>
            </div>
            <p className="text-xs text-muted">
              Moving pictures on Home and in New project. Off shows still pictures.
            </p>

            <h3 className="mt-3 font-semibold">Search</h3>
            <div className="flex items-center gap-1.5" data-setting="remember-searches">
              <input
                id={rememberSearchesId}
                type="checkbox"
                data-testid="settings-remember-searches"
                checked={rememberSearches}
                onChange={(event) => {
                  usePreferences.getState().setRememberSearches(event.target.checked);
                  setSearchesCleared(false);
                }}
              />
              <label htmlFor={rememberSearchesId}>Remember my searches</label>
            </div>
            <p className="text-xs text-muted">
              Your recent searches and the results you chose come first next time. They stay on this
              computer. Off forgets them.
            </p>
            <div className="flex flex-wrap items-center gap-1.5" data-setting="clear-searches">
              <Button
                data-setting-label
                data-testid="settings-clear-searches"
                disabled={searchHistory.chosen.length === 0 && searchHistory.searches.length === 0}
                onClick={() => {
                  usePreferences.getState().clearSearchHistory();
                  setSearchesCleared(true);
                }}
              >
                Clear my searches
              </Button>
              {searchesCleared && (
                <span className="text-sm" role="status" data-testid="settings-searches-cleared">
                  Your searches are forgotten.
                </span>
              )}
            </div>

            {props.worldBackups !== undefined && (
              <WorldBackupsSection backups={props.worldBackups} load={load} save={saveSettings} />
            )}

            {props.ai !== undefined && (
              <AiSettingsSection
                ref={aiSection}
                focusKey={props.focus === 'ai'}
                ai={props.ai}
                load={loadAi}
                save={saveAi}
                onChanged={props.onAiChanged}
                conversationModel={props.aiConversationModel ?? null}
              />
            )}

            {props.aiPictures !== undefined && (
              <AiPicturesSettingsSection
                aiPictures={props.aiPictures}
                onChanged={props.onAiPicturesChanged}
              />
            )}

            <PluginsSection
              plugins={props.plugins ?? []}
              onOpenFolder={props.onOpenPluginsFolder}
            />

            {error !== null && (
              <p role="alert" className="whitespace-pre-line text-error">
                {error}
              </p>
            )}
            {notice !== null && <p className="text-sm">{notice}</p>}
            <div className="mt-2 flex justify-end">
              <Dialog.Close asChild>
                <Button data-testid="settings-close">Close</Button>
              </Dialog.Close>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
