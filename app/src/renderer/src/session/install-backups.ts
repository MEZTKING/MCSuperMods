/**
 * The backup a data pack install made (ADR 0102 D3: the install message names it). The
 * session's install result carries only the pack's path, so the platform handed to the
 * session is wrapped here: every `minecraft.installDataPack` answer's `backup` is remembered
 * until the install message takes it. Kept outside `project-session.ts` on purpose.
 *
 * @packageDocumentation
 */

import type { PlatformAdapter, WorldBackupRef } from '../../../shared/platform';

let last: WorldBackupRef | null = null;

/**
 * Returns `platform` with `minecraft.installDataPack` wrapped to remember the backup each
 * install made (or that it made none). Everything else is passed through unchanged.
 */
export function recordInstallBackups<P extends Pick<PlatformAdapter, 'minecraft'>>(platform: P): P {
  const minecraft = platform.minecraft;
  return {
    ...platform,
    minecraft: {
      ...minecraft,
      async installDataPack(worldDir, fileName, data) {
        last = null;
        const result = await minecraft.installDataPack(worldDir, fileName, data);
        last = result.backup ?? null;
        return result;
      },
    },
  };
}

/** The backup the last data pack install made, then forgets it; `null` when none was made. */
export function takeInstallBackup(): WorldBackupRef | null {
  const backup = last;
  last = null;
  return backup;
}

/** The sentence the install message adds for a backup. */
export function backupNote(backup: WorldBackupRef | null): string {
  return backup === null
    ? ''
    : ` The world was backed up first as ${backup.fileName} (Settings, World backups).`;
}
