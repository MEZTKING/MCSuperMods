/**
 * When Export and Install are available. Errors block export, never save (DESIGN §8, plan D5);
 * the data pack also needs data pack content (ADR 0015). Errors block per pack: an error of an
 * element that lowers only to one layer leaves the other pack's export and install enabled.
 *
 * @packageDocumentation
 */

import type { Element, Problem, Project } from '@msm/core';
import { ExportProblemCodes } from '@msm/exporters';
import type { OutputFile, OutputLayer } from '@msm/plugin-api';
import type { GameLocationView, MinecraftStatus } from '../../../shared/platform';
import type { InstallTargetOption } from '../components/install-target';

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

/** Shown when main found neither a Minecraft folder nor a launcher instance. */
export const NO_INSTALL_TARGET =
  'No Minecraft folder or launcher instance was found. Choose one in Settings.';

/** Location problems that block installs into that location (ADR 0019). */
const BLOCKING_PROBLEMS: ReadonlySet<string> = new Set(['location.game-dir-missing']);

/** The message of the first problem that blocks installs into `location`, or `null`. */
export function blockingProblem(location: GameLocationView): string | null {
  const problem = location.problems.find((entry) => BLOCKING_PROBLEMS.has(entry.code));
  return problem === undefined ? null : problem.message;
}

/**
 * Maps a location from main onto the option the Toolbar and Settings show. Non-installable
 * locations stay selectable; the Install actions then say why they are disabled.
 */
export function installTargetOption(location: GameLocationView): InstallTargetOption {
  return {
    id: location.id,
    launcher: location.ref.launcher,
    displayName: location.displayName,
    mcVersion: location.mcVersion,
    loader: location.loader,
    gameDir: location.gameDir,
    warnings: location.warnings.map((warning) => warning.message),
    problems: location.problems.map((problem) => problem.message),
    installable: blockingProblem(location) === null,
  };
}

/** Why "Install to resourcepacks folder" is disabled, or `null` when it is enabled. */
export function installDisabledReason(
  hasProject: boolean,
  problems: readonly Problem[],
  status: MinecraftStatus | null,
): string | null {
  const reason = exportDisabledReason(hasProject, problems);
  if (reason !== null) return reason;
  if (status === null) return NO_INSTALL_TARGET;
  // A status without the launcher fields predates ADR 0019: only the folder counts then.
  if (status.target === undefined) return status.minecraftDir === null ? NO_INSTALL_TARGET : null;
  if (status.target === null) return NO_INSTALL_TARGET;
  // Version mismatches are warnings and never block (ADR 0019).
  return blockingProblem(status.target);
}

/** Lowers one element; throws for elements whose kind cannot lower them. */
export type LowerElement = (element: Element) => readonly Pick<OutputFile, 'layer'>[];

/** The kind every project has, which writes `pack.mcmeta` into both packs. */
const PACK_MCMETA_KIND = 'minecraft:pack_mcmeta';

/** Every output layer; an element whose layers are unknown counts as all of them. */
const ALL_LAYERS: ReadonlySet<OutputLayer> = new Set<OutputLayer>(['resourcepack', 'datapack']);

/**
 * The layers each element of `project` lowers to, by element id. An element that fails to
 * lower (or lowers to nothing) maps to every layer, so its errors block both packs.
 *
 * @param project - The open project.
 * @param lower - Lowers one element through its kind.
 */
export function elementLayers(
  project: Project,
  lower: LowerElement,
): ReadonlyMap<string, ReadonlySet<OutputLayer>> {
  const layers = new Map<string, ReadonlySet<OutputLayer>>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      let produced: ReadonlySet<OutputLayer>;
      try {
        produced = new Set(lower(element).map((file) => file.layer));
      } catch {
        produced = ALL_LAYERS;
      }
      const known = layers.get(element.id);
      const merged = new Set([...(known ?? []), ...(produced.size === 0 ? ALL_LAYERS : produced)]);
      layers.set(element.id, merged);
    }
  }
  return layers;
}

/**
 * The problems that concern the `layer` pack: problems of elements that lower to it, plus
 * every problem not tied to a known element (load and project problems block both packs).
 *
 * @param problems - The project's live problems.
 * @param layers - {@link elementLayers} of the project.
 * @param layer - `resourcepack` or `datapack`.
 */
export function layerProblems(
  problems: readonly Problem[],
  layers: ReadonlyMap<string, ReadonlySet<OutputLayer>>,
  layer: OutputLayer,
): Problem[] {
  return problems.filter((problem) => {
    if (problem.elementId === undefined) return true;
    const produced = layers.get(problem.elementId);
    return produced === undefined || produced.has(layer);
  });
}

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

/**
 * The export problems shown to the user. Each single-pack export leaves out the other
 * pack's files with an `export.layer-skipped` info; that is expected (the other export or
 * "Both packs" packages them), so it stays in the report but not in the Problems panel.
 */
export function userFacingExportProblems(problems: readonly Problem[]): Problem[] {
  return problems.filter((problem) => problem.code !== ExportProblemCodes.layerSkipped);
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

/**
 * Why "Export Fabric mod jar" is disabled, or `null` when it is enabled. The jar packages
 * every layer (resource, data and `msm`), so every error blocks it.
 */
export function fabricJarExportDisabledReason(
  hasProject: boolean,
  problems: readonly Problem[],
): string | null {
  return exportDisabledReason(hasProject, problems);
}

/**
 * Added to a vanilla pack export's message when the project has `msm` layer content (blocks,
 * items, the mod element): packs cannot carry it.
 */
export const MSM_CONTENT_NOTE =
  'Blocks and items are not part of resource or data packs; use Export Fabric mod jar for them.';
