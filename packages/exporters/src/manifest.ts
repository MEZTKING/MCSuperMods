/**
 * `msm.export.json`: the manifest written into every export.
 *
 * @packageDocumentation
 */

import type { ExporterInput, JsonObject, Target } from '@msm/plugin-api';

/** The manifest's path at the export root. */
export const EXPORT_MANIFEST_FILE = 'msm.export.json';

/** Version of the manifest format. */
export const EXPORT_MANIFEST_FORMAT_VERSION = 1;

/**
 * Builds the export manifest. It holds no timestamps, so identical inputs give identical
 * bytes. Plugin ids are de-duplicated and sorted.
 *
 * @param input - The target, host facts, exporter id and the number of files exported
 *   (excluding the manifest itself).
 * @returns The manifest as JSON.
 */
export function exportManifest(input: {
  target: Target;
  meta: ExporterInput['meta'];
  exporterId: string;
  fileCount: number;
}): JsonObject {
  const plugins = [...new Set(input.meta.plugins)].sort();
  return {
    exporter: input.exporterId,
    fileCount: input.fileCount,
    formatVersion: EXPORT_MANIFEST_FORMAT_VERSION,
    minecraft: input.target.mcVersion,
    msmVersion: input.meta.msmVersion,
    plugins,
    target: input.target.id,
  };
}
