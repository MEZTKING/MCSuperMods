import { useCallback, useEffect, useId, useState } from 'react';
import type {
  AppSettingsPatch,
  AppSettingsView,
  WorldBackupGroup,
  WorldBackupList,
  WorldBackupSettings,
  WorldBackupsPlatform,
} from '../../../shared/platform';
import { fieldClass } from './NewElementDialog';
import { Button } from './ui/Button';

/** The defaults main uses when the settings hold none (ADR 0102 D1). */
const DEFAULT_BACKUPS: WorldBackupSettings = { beforeInstall: true, keep: 5 };

/** The most backups per world the field accepts (mirrors `WORLD_BACKUPS_KEEP_MAX`). */
export const BACKUPS_KEEP_MAX = 50;

const errorText = (problem: unknown): string =>
  problem instanceof Error ? problem.message : String(problem);

/** `2026-11-21_10-05-09(-2).zip` as `2026-11-21 10:05:09`; other names as they are. */
export function backupLabel(fileName: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})(?:-(\d+))?\.zip$/.exec(fileName);
  if (match === null) return fileName;
  const [, day, hours, minutes, seconds, extra] = match;
  return `${day} ${hours}:${minutes}:${seconds}${extra === undefined ? '' : ` (${extra})`}`;
}

/** A byte count as `512 bytes`, `12.3 KB` or `4.5 MB`. */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Props of {@link WorldBackupsSection}. */
export interface WorldBackupsSectionProps {
  backups: WorldBackupsPlatform;
  load(): Promise<AppSettingsView>;
  save(settings: AppSettingsPatch): Promise<void>;
}

/**
 * The Settings "World backups" section (ADR 0102 D3): the backups folder with Open folder,
 * the two settings, and every world's backups with Restore (beside the world, never over it).
 */
export function WorldBackupsSection(props: WorldBackupsSectionProps) {
  const { backups, load, save } = props;
  const [settings, setSettings] = useState<WorldBackupSettings | null>(null);
  const [keepText, setKeepText] = useState('');
  const [list, setList] = useState<WorldBackupList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const beforeId = useId();
  const keepId = useId();

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setList(await backups.list());
    } catch (problem) {
      setError(errorText(problem));
    }
  }, [backups]);

  useEffect(() => {
    let live = true;
    load().then(
      (view) => {
        if (!live) return;
        const stored = view.backups ?? DEFAULT_BACKUPS;
        setSettings(stored);
        setKeepText(String(stored.keep));
      },
      (problem: unknown) => {
        if (live) setError(errorText(problem));
      },
    );
    void refresh();
    return () => {
      live = false;
    };
  }, [load, refresh]);

  const store = async (next: WorldBackupSettings): Promise<void> => {
    const previous = settings;
    setSettings(next);
    setError(null);
    setNotice(null);
    try {
      await save({ backups: next });
    } catch (problem) {
      setSettings(previous);
      if (previous !== null) setKeepText(String(previous.keep));
      setError(errorText(problem));
    }
  };

  const storeKeep = (): void => {
    if (settings === null) return;
    const value = Number(keepText);
    if (!Number.isInteger(value) || value < 1 || value > BACKUPS_KEEP_MAX) {
      setKeepText(String(settings.keep));
      setError(`Backups to keep per world must be a whole number from 1 to ${BACKUPS_KEEP_MAX}.`);
      return;
    }
    if (value !== settings.keep) void store({ ...settings, keep: value });
  };

  const openFolder = async (): Promise<void> => {
    setError(null);
    try {
      await backups.openFolder();
    } catch (problem) {
      setError(errorText(problem));
    }
  };

  const restore = async (group: WorldBackupGroup, fileName: string): Promise<void> => {
    const key = `${group.location}/${group.worldDir}/${fileName}`;
    setRestoring(key);
    setError(null);
    setNotice(null);
    try {
      const restored = await backups.restore({
        location: group.location,
        worldDir: group.worldDir,
        fileName,
      });
      setNotice(
        `Restored as the world folder "${restored.dir}" beside "${group.worldDir}". Your world was not changed. In Minecraft it shows in the world list with the same name.`,
      );
    } catch (problem) {
      setError(errorText(problem));
    } finally {
      setRestoring(null);
    }
  };

  return (
    <section
      className="flex flex-col gap-1.5"
      data-testid="settings-world-backups"
      aria-label="World backups"
    >
      <h3 className="mt-3 font-semibold">World backups</h3>
      <p className="text-xs text-muted">
        Before MCSuperMods installs a data pack into one of your worlds, it saves a copy of the
        whole world as a zip. Backups stay on this computer.
      </p>
      <div className="flex min-w-0 items-center gap-1.5" data-setting="backups-folder">
        <span className="shrink-0 text-sm" data-setting-label>
          Backups folder
        </span>
        <span
          className="min-w-0 flex-1 break-all font-mono text-xs [overflow-wrap:anywhere]"
          data-testid="settings-backups-folder"
        >
          {list?.folder ?? '…'}
        </span>
        <Button
          className="shrink-0"
          data-testid="settings-backups-open"
          onClick={() => void openFolder()}
        >
          Open folder
        </Button>
      </div>
      <div className="flex items-center gap-1.5" data-setting="backups-before-install">
        <input
          id={beforeId}
          type="checkbox"
          data-testid="settings-backups-before-install"
          checked={settings?.beforeInstall ?? true}
          disabled={settings === null}
          onChange={(event) => {
            if (settings !== null) {
              void store({ ...settings, beforeInstall: event.target.checked });
            }
          }}
        />
        <label htmlFor={beforeId}>Back up a world before installing into it</label>
      </div>
      <div className="flex items-center gap-1.5" data-setting="backups-keep">
        <label htmlFor={keepId}>Backups to keep per world</label>
        <input
          id={keepId}
          type="number"
          min={1}
          max={BACKUPS_KEEP_MAX}
          step={1}
          data-testid="settings-backups-keep"
          className={`${fieldClass} w-20`}
          value={keepText}
          disabled={settings === null}
          onChange={(event) => setKeepText(event.target.value)}
          onBlur={storeKeep}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              storeKeep();
            }
          }}
        />
      </div>
      <p className="text-xs text-muted">
        The oldest backups of a world are deleted once a new one is made. Restore unpacks a backup
        beside the world as a new world folder; it never replaces the world itself.
      </p>
      {list !== null && list.groups.length === 0 && (
        <p className="text-sm text-muted" data-testid="settings-backups-empty">
          No world backups yet.
        </p>
      )}
      {list !== null && list.groups.length > 0 && (
        <div className="flex flex-col gap-1.5" data-setting="backups-restore">
          <h4 className="mt-1 text-sm font-semibold" data-setting-label>
            Restore a backup
          </h4>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="World backups list">
            {list.groups.map((group, groupIndex) => (
              <li
                key={`${group.location}/${group.worldDir}`}
                data-testid={`backup-group-${groupIndex}`}
                className="flex flex-col gap-0.5 rounded border border-border p-2"
              >
                <span className="text-sm">
                  <span className="font-medium">{group.worldDir}</span>
                  <span className="text-muted"> in {group.locationName}</span>
                </span>
                {!group.available && (
                  <span className="text-xs text-muted">
                    This game folder was not found, so Restore is off. The zips are still in the
                    backups folder.
                  </span>
                )}
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {group.backups.map((backup, index) => {
                    const key = `${group.location}/${group.worldDir}/${backup.fileName}`;
                    return (
                      <li
                        key={backup.fileName}
                        data-testid={`backup-${groupIndex}-${index}`}
                        className="flex items-center gap-1.5 text-sm"
                      >
                        <span className="flex-1">
                          {backupLabel(backup.fileName)}{' '}
                          <span className="text-xs text-muted">{sizeLabel(backup.size)}</span>
                        </span>
                        <Button
                          data-testid={`backup-restore-${groupIndex}-${index}`}
                          aria-label={`Restore ${group.worldDir} from ${backupLabel(backup.fileName)}`}
                          disabled={!group.available || restoring !== null}
                          onClick={() => void restore(group, backup.fileName)}
                        >
                          {restoring === key ? 'Restoring…' : 'Restore'}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error !== null && (
        <p role="alert" className="text-sm text-error" data-testid="settings-backups-error">
          {error}
        </p>
      )}
      {notice !== null && (
        <p className="text-sm" role="status" data-testid="settings-backups-notice">
          {notice}
        </p>
      )}
    </section>
  );
}
