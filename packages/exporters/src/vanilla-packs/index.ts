/**
 * The `vanilla-packs` exporter: a resource pack (Phase 1). The data pack layer follows in
 * Phase 2.
 *
 * @packageDocumentation
 */

import type { Exporter, JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { outputFileBytes } from '../contents';
import { EXPORT_MANIFEST_FILE, exportManifest } from '../manifest';
import { ExportProblemCodes } from '../problem-codes';
import { comparePaths } from '../zip';

/** The pack metadata file at the root of a pack. */
export const PACK_MCMETA_FILE = 'pack.mcmeta';

/**
 * The `pack.mcmeta` written when the project has none, built from the target's resource
 * pack format. Field set checked against `::java::pack::Pack` in the vendored schema.
 *
 * @param projectName - Used as the pack description.
 * @param target - Supplies the resource pack format.
 */
export function defaultResourcePackMcmeta(projectName: string, target: Target): JsonObject {
  const { major, minor } = target.packFormats.resource;
  return {
    pack: {
      description: projectName,
      max_format: [major, minor],
      min_format: [major, minor],
      pack_format: major,
    },
  };
}

/**
 * The archive file name for a pack: `<slug>-<target id>.zip`, where the slug is the project
 * name in lower case with runs of other characters replaced by `-` (`pack` when empty).
 *
 * @param projectName - The project's name.
 * @param target - The target exported for.
 */
export function packFileName(projectName: string, target: Target): string {
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug === '' ? 'pack' : slug}-${target.id}.zip`;
}

/**
 * Writes every `resourcepack` file in path order (JSON with `stableStringify`), synthesises
 * `pack.mcmeta` from the target when no file has that path, and writes `msm.export.json`
 * last. A file at the manifest's path is reported as `export.reserved-path` and not written.
 */
export const vanillaPacksExporter: Exporter = {
  id: 'vanilla-packs',
  displayName: 'Vanilla packs',
  layers: ['resourcepack'],
  async run(input) {
    const files: OutputFile[] = [];
    for (const file of input.files) {
      if (file.layer !== 'resourcepack') continue;
      if (file.path === EXPORT_MANIFEST_FILE) {
        input.problems.report({
          severity: 'error',
          code: ExportProblemCodes.reservedPath,
          file: file.path,
          message: `${EXPORT_MANIFEST_FILE} is written by the exporter; the lowered file at that path was not exported.`,
        });
        continue;
      }
      files.push(file);
    }
    if (!files.some((file) => file.path === PACK_MCMETA_FILE)) {
      files.push({
        path: PACK_MCMETA_FILE,
        contents: defaultResourcePackMcmeta(input.projectName, input.target),
        layer: 'resourcepack',
        schema: '::java::pack::Pack',
      });
    }
    files.sort((a, b) => comparePaths(a.path, b.path));
    for (const file of files) {
      await input.sink.writeFile(file.path, outputFileBytes(file));
    }
    const manifest = exportManifest({
      target: input.target,
      meta: input.meta,
      exporterId: vanillaPacksExporter.id,
      fileCount: files.length,
    });
    await input.sink.writeFile(
      EXPORT_MANIFEST_FILE,
      outputFileBytes({ path: EXPORT_MANIFEST_FILE, contents: manifest, layer: 'resourcepack' }),
    );
  },
};
