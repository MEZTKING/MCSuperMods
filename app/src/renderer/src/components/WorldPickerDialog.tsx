/**
 * Picks a singleplayer world to install a data pack into, or (with `title` and
 * `submitLabel`) to export as a map (ADR 0116 D2). Worlds are listed newest first; the first
 * one, or `initialDir` when listed, starts selected. Each row shows the world name and, in muted text, the folder
 * when it differs. Presentational: the host lists the worlds and installs.
 *
 * @packageDocumentation
 */

import { useEffect, useState } from 'react';
import { Modal } from './NewElementDialog';

/** A world as main lists it (`saves/<dir>/` with a `level.dat`). */
export interface WorldOption {
  /** Folder name under `saves/`. */
  dir: string;
  /** The world name from `level.dat` (`Data.LevelName`), or the folder name. */
  name: string;
  /** ISO 8601 time of the last change. */
  lastModified: string;
}

export interface WorldPickerDialogProps {
  open: boolean;
  worlds: readonly WorldOption[];
  onPick(world: WorldOption): void;
  onClose(): void;
  /** The game location the worlds belong to, such as "Prism Launcher — My Instance". */
  locationName?: string;
  /** The title in place of the data pack install's. */
  title?: string;
  /** The submit button's label; "Install" by default. */
  submitLabel?: string;
  /** The world selected first when it is listed (Play my game's `msm-game-<ns>`). */
  initialDir?: string;
  /** Disables the buttons while the host works. */
  busy?: boolean;
  /** An error from the host, shown above the buttons. */
  error?: string | null;
}

/** Worlds newest first, then by name. */
export function sortWorlds(worlds: readonly WorldOption[]): WorldOption[] {
  return [...worlds].sort(
    (a, b) =>
      (b.lastModified < a.lastModified ? -1 : b.lastModified > a.lastModified ? 1 : 0) ||
      a.name.localeCompare(b.name),
  );
}

function formatTime(iso: string): string {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? iso : new Date(time).toLocaleString('en-GB');
}

export function WorldPickerDialog({
  open,
  worlds,
  onPick,
  onClose,
  locationName,
  title,
  submitLabel,
  initialDir,
  busy,
  error: hostError,
}: WorldPickerDialogProps) {
  const sorted = sortWorlds(worlds);
  const firstDir =
    initialDir !== undefined && sorted.some((world) => world.dir === initialDir)
      ? initialDir
      : (sorted[0]?.dir ?? null);
  const [selected, setSelected] = useState<string | null>(firstDir);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected((current) =>
      current !== null && worlds.some((world) => world.dir === current) ? current : firstDir,
    );
    setError(null);
  }, [open, worlds, firstDir]);

  if (!open) return null;

  return (
    <Modal
      title={
        title ??
        (locationName === undefined
          ? 'Install data pack to world'
          : `Install data pack to a world — ${locationName}`)
      }
      error={error ?? hostError ?? null}
      wide
      testId="world-picker"
      submitLabel={submitLabel ?? 'Install'}
      busy={sorted.length === 0 || busy === true}
      onCancel={onClose}
      onSubmit={() => {
        const world = sorted.find((entry) => entry.dir === selected);
        if (world === undefined) {
          setError('Choose a world.');
          return;
        }
        onPick(world);
      }}
    >
      {sorted.length === 0 ? (
        <p className="text-muted text-sm" data-testid="world-picker-empty">
          {locationName === undefined
            ? 'No worlds found. Create a singleplayer world in Minecraft first.'
            : `No worlds found in ${locationName}. Create a singleplayer world there first.`}
        </p>
      ) : (
        <fieldset className="m-0 flex max-h-80 flex-col gap-1 overflow-auto border-0 p-0">
          <legend className="mb-1">World</legend>
          {sorted.map((world) => (
            <label
              key={world.dir}
              data-testid={`world-row-${world.dir}`}
              className={
                'flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 ' +
                (world.dir === selected ? 'border-accent bg-bg' : 'border-border')
              }
            >
              <input
                type="radio"
                name="world"
                value={world.dir}
                checked={world.dir === selected}
                onChange={() => {
                  setSelected(world.dir);
                  setError(null);
                }}
              />
              <span className="flex min-w-0 flex-col">
                <span
                  className="truncate font-medium"
                  title={world.name}
                  data-testid={`world-name-${world.dir}`}
                >
                  {world.name}
                </span>
                <span className="text-muted text-xs">
                  {world.dir !== world.name && (
                    <span className="font-mono" data-testid={`world-folder-${world.dir}`}>
                      {world.dir} ·{' '}
                    </span>
                  )}
                  Last changed {formatTime(world.lastModified)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </Modal>
  );
}
