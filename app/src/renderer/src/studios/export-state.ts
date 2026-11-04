/**
 * When Export and Install are available. Errors block export, never save (DESIGN §8, plan D5).
 *
 * @packageDocumentation
 */

import type { Problem } from '@msm/core';
import type { MinecraftStatus } from '../../../shared/platform';

/** The number of error problems. */
export function errorCount(problems: readonly Problem[]): number {
  return problems.filter((problem) => problem.severity === 'error').length;
}

/** Why "Export resource pack (.zip)" is disabled, or `null` when it is enabled. */
export function exportDisabledReason(
  hasProject: boolean,
  problems: readonly Problem[],
): string | null {
  if (!hasProject) return 'No project is open.';
  const errors = errorCount(problems);
  if (errors > 0) {
    return `Fix ${errors} error${errors === 1 ? '' : 's'} first (see Problems).`;
  }
  return null;
}

/** Why "Install to resourcepacks folder" is disabled, or `null` when it is enabled. */
export function installDisabledReason(
  hasProject: boolean,
  problems: readonly Problem[],
  status: MinecraftStatus | null,
): string | null {
  const reason = exportDisabledReason(hasProject, problems);
  if (reason !== null) return reason;
  if (status?.minecraftDir == null) {
    return 'No Minecraft folder found. Choose one in Settings.';
  }
  return null;
}
