import { Dialog } from 'radix-ui';
import { useEffect, useId, useState } from 'react';
import type { MinecraftProgress } from '../../../shared/ipc-channels';
import type { AppSettingsPatch, AppSettingsView, MinecraftStatus } from '../../../shared/platform';
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

/** The radio list of game locations; the checked one is the install target. */
function LocationList(props: {
  locations: readonly InstallTargetOption[] | null;
  selectedId: string | null;
  onSelect: ((id: string) => void) | undefined;
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
      className="m-0 flex max-h-64 flex-col gap-1 overflow-auto border-0 p-0"
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
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-1">
                <span className={badgeClass} data-testid={`location-launcher-${location.id}`}>
                  {launcherLabel(location.launcher)}
                </span>
                <span className="font-medium">{location.displayName}</span>
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
              <span id={detailsId} className="flex flex-col gap-0.5">
                <span className="truncate font-mono text-xs text-muted" title={location.gameDir}>
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
  const jarSource = props.jarSource ?? null;
  const manualRoots = props.manualRoots ?? [];

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
          className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[min(94vw,520px)] overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <Dialog.Title className="mb-2 text-base font-semibold">Settings</Dialog.Title>
          <form
            className="flex flex-col gap-1.5"
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
              />
            )}
            <h4 className="mt-1 text-sm font-semibold">Official launcher folder</h4>
            <p className="text-sm text-muted" data-testid="settings-detected">
              Detected:{' '}
              {view === null ? '…' : (view.detectedMinecraftDir ?? 'no launcher folder found')}
            </p>
            <label htmlFor={folderId}>
              Use this folder instead (leave empty for the detected one)
            </label>
            <div className="flex gap-1.5">
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
                onClick={() =>
                  void props.browse().then((path) => {
                    if (path !== null) setFolder(path);
                  })
                }
              >
                Browse…
              </Button>
              <Button onClick={() => setFolder('')} disabled={folder === ''}>
                Use detected
              </Button>
            </div>
            <div className="flex gap-1.5">
              <Button type="submit" disabled={busy} data-testid="settings-save">
                Save folder
              </Button>
            </div>
            {props.onAddLauncherRoot !== undefined && (
              <>
                <h4 className="mt-1 text-sm font-semibold">Other launchers</h4>
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
                      <span className="truncate font-mono text-xs" title={root.path}>
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

            <h3 className="mt-3 font-semibold">Vanilla assets</h3>
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

            <h3 className="mt-3 font-semibold">Updates</h3>
            <div className="flex items-center gap-1.5">
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
