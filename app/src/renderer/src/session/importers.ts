/**
 * The host side of the `importers` contribution point (DESIGN §7, ADR 0021): the registered
 * plugins' importers, chosen by file extension, plus target-aware entry points for importers
 * whose result depends on the target. `Importer.import` receives no target, so for the
 * structure importers the host calls `@msm/plugin-structures`' public `importStructureFile`
 * with the target's data version (the `structures.newer-data-version` check). Host importers
 * (ADR 0029 D3: the Blockbench importer from `@msm/interop`, which plugins may not depend on)
 * are listed after the plugins' importers under {@link HOST_IMPORTER_PLUGIN_ID}.
 *
 * @packageDocumentation
 */

import { blockbenchImporter } from '@msm/interop';
import type { ImportedFile, Importer, ImportResult, Plugin, Target } from '@msm/plugin-api';
import {
  importStructureFile,
  spongeSchematicImporter,
  structureNbtImporter,
} from '@msm/plugin-structures';

/** Imports one file for a target. */
export type TargetAwareImport = (
  file: ImportedFile,
  namespace: string,
  target: Target,
) => Promise<ImportResult>;

/**
 * Target-aware replacements for registered importers, keyed by the importer object itself, so
 * a different importer that happens to share an id is never replaced.
 */
export type TargetImporters = ReadonlyMap<Importer, TargetAwareImport>;

/** The built-in target-aware importers: the two structure importers. */
export const BUILT_IN_TARGET_IMPORTERS: TargetImporters = new Map<Importer, TargetAwareImport>([
  [
    structureNbtImporter,
    async (file, namespace, target) =>
      importStructureFile(file, namespace, 'nbt', { targetDataVersion: target.dataVersion }),
  ],
  [
    spongeSchematicImporter,
    async (file, namespace, target) =>
      importStructureFile(file, namespace, 'schem', { targetDataVersion: target.dataVersion }),
  ],
]);

/** The `pluginId` of importers the host supplies itself rather than a plugin. */
export const HOST_IMPORTER_PLUGIN_ID = 'host';

/** The id of the Blockbench importer (`.bbmodel`, `.geo.json`, `.animation.json`). */
export const BLOCKBENCH_IMPORTER_ID = blockbenchImporter.id;

/** The built-in host importers: the Blockbench importer (ADR 0029 D3). */
export const BUILT_IN_HOST_IMPORTERS: readonly Importer[] = Object.freeze([blockbenchImporter]);

/** One registered importer, ready to run. */
export interface RegisteredImporter {
  pluginId: string;
  importer: Importer;
  /** Runs the importer, through its target-aware replacement when there is one. */
  run(file: ImportedFile, namespace: string, target: Target): Promise<ImportResult>;
}

/**
 * Every importer of `plugins`, in plugin order, then the host importers. The first importer
 * with a given id wins.
 *
 * @param plugins - The registered plugins.
 * @param targetImporters - Target-aware replacements.
 * @param hostImporters - Importers the host supplies (pluginId {@link HOST_IMPORTER_PLUGIN_ID}).
 */
export function collectImporters(
  plugins: readonly Plugin[],
  targetImporters: TargetImporters = BUILT_IN_TARGET_IMPORTERS,
  hostImporters: readonly Importer[] = BUILT_IN_HOST_IMPORTERS,
): RegisteredImporter[] {
  const seen = new Set<string>();
  const out: RegisteredImporter[] = [];
  const add = (pluginId: string, importer: Importer): void => {
    if (seen.has(importer.id)) return;
    seen.add(importer.id);
    const aware = targetImporters.get(importer);
    out.push({
      pluginId,
      importer,
      run: (file, namespace, target) =>
        aware === undefined ? importer.import(file, namespace) : aware(file, namespace, target),
    });
  };
  for (const plugin of plugins) {
    for (const importer of plugin.contributes.importers ?? []) add(plugin.id, importer);
  }
  for (const importer of hostImporters) add(HOST_IMPORTER_PLUGIN_ID, importer);
  return out;
}

/** Whether `entry` is the Blockbench importer. */
export function isBlockbenchImporter(entry: RegisteredImporter): boolean {
  return entry.importer.id === BLOCKBENCH_IMPORTER_ID;
}

/** The lower-case extension of a file name without the dot, or `''`. */
export function fileExtension(name: string): string {
  const base = name.replace(/^.*[\\/]/, '');
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase();
}

/** The first importer that accepts `name`'s extension. */
export function importerFor(
  importers: readonly RegisteredImporter[],
  name: string,
): RegisteredImporter | undefined {
  const extension = fileExtension(name);
  if (extension === '') return undefined;
  return importers.find((entry) =>
    entry.importer.extensions.some((accepted) => accepted.toLowerCase() === extension),
  );
}

/** A file picker filter, as `platform.dialogs.pickFiles` takes it. */
export interface ImporterFileFilter {
  name: string;
  extensions: string[];
}

/**
 * The file picker filters for `importers`: one with every accepted extension first (when
 * there is more than one importer), then one per importer.
 */
export function importerFileFilters(
  importers: readonly RegisteredImporter[],
  allLabel = 'All supported files',
): ImporterFileFilter[] {
  const each = importers.map((entry) => ({
    name: entry.importer.displayName,
    extensions: [...entry.importer.extensions],
  }));
  if (each.length <= 1) return each;
  const all = [...new Set(each.flatMap((filter) => filter.extensions))];
  return [{ name: allLabel, extensions: all }, ...each];
}
