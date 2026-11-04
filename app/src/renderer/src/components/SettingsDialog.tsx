import { Dialog } from 'radix-ui';
import { useEffect, useId, useState } from 'react';
import type { MinecraftProgress } from '../../../shared/ipc-channels';
import type { AppSettingsPatch, AppSettingsView, MinecraftStatus } from '../../../shared/platform';
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
}

const PHASE_LABELS: Record<MinecraftProgress['phase'], string> = {
  reading: 'Reading the client jar',
  extracting: 'Unpacking',
  writing: 'Writing files',
  done: 'Done',
};

/** One line describing the asset cache and the installed game version. */
export function minecraftSummary(mcVersion: string, status: MinecraftStatus | null): string {
  if (status === null) return 'Checking the Minecraft installation…';
  if (status.minecraftDir === null) return 'No Minecraft folder found.';
  if (status.cache !== null) {
    return `Vanilla assets for Minecraft ${mcVersion} are extracted (${status.cache.fileCount} files).`;
  }
  if (status.chosen === null) {
    return `Minecraft ${mcVersion} is not installed in this folder. Start it once in the launcher, then extract.`;
  }
  return `Minecraft ${mcVersion} is installed; its vanilla assets are not extracted yet.`;
}

/**
 * Settings: the Minecraft folder, vanilla asset extraction (ADR 0011) and automatic update
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

  const extract = async (): Promise<void> => {
    setError(null);
    setNotice(null);
    const failure = await props.extract();
    if (failure !== null) setError(failure);
    else setNotice('Vanilla assets extracted.');
  };

  const progress = props.progress;
  const canExtract =
    progress === null && props.status?.chosen != null && props.status.minecraftDir !== null;

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
          className="fixed top-1/2 left-1/2 z-50 w-[min(94vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <Dialog.Title className="mb-2 text-base font-semibold">Settings</Dialog.Title>
          <form
            className="flex flex-col gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <h3 className="font-semibold">Minecraft folder</h3>
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

            <h3 className="mt-3 font-semibold">Vanilla assets</h3>
            <p className="text-sm" role="status" data-testid="settings-status">
              {minecraftSummary(props.mcVersion, props.status)}
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
                {props.status?.cache != null ? 'Extract again' : 'Extract vanilla assets'}
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
