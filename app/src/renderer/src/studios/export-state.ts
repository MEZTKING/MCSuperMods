/**
 * When Export and Install are available. Errors block export, never save (DESIGN §8, plan D5);
 * the data pack also needs data pack content (ADR 0015).
 *
 * @packageDocumentation
 */

import type { Element, Problem, Project } from '@msm/core';
import type { OutputFile, OutputLayer } from '@msm/plugin-api';
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

/** Lowers one element; throws for elements whose kind cannot lower them. */
export type LowerElement = (element: Element) => readonly Pick<OutputFile, 'layer'>[];

/** The kind every project has, which writes `pack.mcmeta` into both packs. */
const PACK_MCMETA_KIND = 'minecraft:pack_mcmeta';

/**
 * Whether any element of `project` (other than `pack.mcmeta`, which every pack gets) lowers
 * to a file of `layer`. An element that fails to lower counts as content, so its errors
 * still surface when the export runs.
 *
 * @param project - The open project.
 * @param layer - `resourcepack` or `datapack`.
 * @param lower - Lowers one element through its kind.
 */
export function hasLayerOutput(project: Project, layer: OutputLayer, lower: LowerElement): boolean {
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind === PACK_MCMETA_KIND) continue;
      try {
        if (lower(element).some((file) => file.layer === layer)) return true;
      } catch {
        return true;
      }
    }
  }
  return false;
}

/** Shown when a data pack export or install has nothing to package. */
export const NO_DATA_PACK_CONTENT =
  'The project has no data pack content yet. Add a recipe, function, tag or other data element.';

/** Why "Export data pack (.zip)" and "Export both" are disabled, or `null` when enabled. */
export function dataExportDisabledReason(
  hasProject: boolean,
  problems: readonly Problem[],
  hasDataPack: boolean,
): string | null {
  const reason = exportDisabledReason(hasProject, problems);
  if (reason !== null) return reason;
  return hasDataPack ? null : NO_DATA_PACK_CONTENT;
}

/** Why "Install data pack to a world" is disabled, or `null` when it is enabled. */
export function dataInstallDisabledReason(
  hasProject: boolean,
  problems: readonly Problem[],
  status: MinecraftStatus | null,
  hasDataPack: boolean,
): string | null {
  const reason = dataExportDisabledReason(hasProject, problems, hasDataPack);
  if (reason !== null) return reason;
  return installDisabledReason(hasProject, problems, status);
}
