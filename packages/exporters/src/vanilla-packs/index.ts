/**
 * The `vanilla-packs` exporters: a resource pack (`vanilla-packs`, Phase 1) and a data pack
 * (`vanilla-packs-data`, Phase 2), both built by {@link createVanillaPacksExporter}.
 *
 * A combined export is not a third exporter. Each exporter packages one layer set and writes
 * its own `msm.export.json`, so the host runs both exporters, each into its own zip sink, and
 * names the two archives with {@link combinedFileNames} (ADR 0015).
 *
 * @packageDocumentation
 */

import type { Exporter, JsonObject, OutputFile, OutputLayer, Target } from '@msm/plugin-api';
import { outputFileBytes } from '../contents';
import { EXPORT_MANIFEST_FILE, exportManifest } from '../manifest';
import { ExportProblemCodes } from '../problem-codes';
import { comparePaths } from '../zip';

/** The pack metadata file at the root of a pack. */
export const PACK_MCMETA_FILE = 'pack.mcmeta';

/** Which vanilla pack an exporter builds. */
export type VanillaPackKind = 'resource' | 'data';

/** The schema a synthesised `pack.mcmeta` is written against. */
const PACK_MCMETA_SCHEMA = '::java::pack::Pack';

function packMcmeta(projectName: string, target: Target, pack: VanillaPackKind): JsonObject {
  const { major, minor } = target.packFormats[pack];
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
 * The `pack.mcmeta` written into a resource pack when the project has none, built from the
 * target's resource pack format. Field set checked against `::java::pack::Pack` in the
 * vendored schema.
 *
 * @param projectName - Used as the pack description.
 * @param target - Supplies the resource pack format.
 */
export function defaultResourcePackMcmeta(projectName: string, target: Target): JsonObject {
  return packMcmeta(projectName, target, 'resource');
}

/**
 * The `pack.mcmeta` written into a data pack when the project has none, built from the
 * target's data pack format. Same field set as {@link defaultResourcePackMcmeta}.
 *
 * @param projectName - Used as the pack description.
 * @param target - Supplies the data pack format.
 */
export function defaultDataPackMcmeta(projectName: string, target: Target): JsonObject {
  return packMcmeta(projectName, target, 'data');
}

/** The project name in lower case with runs of other characters replaced by `-`. */
function slug(projectName: string): string {
  const value = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return value === '' ? 'pack' : value;
}

/**
 * The archive file name for one pack: `<slug>-<target id>.zip` for a resource pack and
 * `<slug>-<target id>-data.zip` for a data pack, where the slug is the project name in lower
 * case with runs of other characters replaced by `-` (`pack` when empty).
 *
 * @param projectName - The project's name.
 * @param target - The target exported for.
 * @param pack - Which pack; `resource` when omitted.
 */
export function packFileName(
  projectName: string,
  target: Target,
  pack: VanillaPackKind = 'resource',
): string {
  const suffix = pack === 'data' ? '-data' : '';
  return `${slug(projectName)}-${target.id}${suffix}.zip`;
}

/**
 * The two archive names of a combined export, written side by side into one folder:
 * `<slug>-<target id>-resources.zip` and `<slug>-<target id>-data.zip`. The resource zip is
 * renamed from {@link packFileName}'s form so the pair reads clearly.
 *
 * @param projectName - The project's name.
 * @param target - The target exported for.
 */
export function combinedFileNames(
  projectName: string,
  target: Target,
): { resources: string; data: string } {
  const base = `${slug(projectName)}-${target.id}`;
  return { resources: `${base}-resources.zip`, data: `${base}-data.zip` };
}

const PACKS: Record<VanillaPackKind, { id: string; displayName: string; layer: OutputLayer }> = {
  resource: { id: 'vanilla-packs', displayName: 'Vanilla packs', layer: 'resourcepack' },
  data: { id: 'vanilla-packs-data', displayName: 'Vanilla data pack', layer: 'datapack' },
};

/**
 * Builds a vanilla pack exporter. It writes every file of its layer (`resourcepack` or
 * `datapack`) in path order (JSON with `stableStringify`, bytes as-is), synthesises
 * `pack.mcmeta` from the target's matching pack format when no file has that path, and
 * writes `msm.export.json` last. A file at the manifest's path is reported as
 * `export.reserved-path` and not written.
 *
 * @param pack - `resource` (id `vanilla-packs`) or `data` (id `vanilla-packs-data`).
 */
export function createVanillaPacksExporter(pack: VanillaPackKind): Exporter {
  const { id, displayName, layer } = PACKS[pack];
  return {
    id,
    displayName,
    layers: [layer],
    async run(input) {
      const files: OutputFile[] = [];
      for (const file of input.files) {
        if (file.layer !== layer) continue;
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
          contents: packMcmeta(input.projectName, input.target, pack),
          layer,
          schema: PACK_MCMETA_SCHEMA,
        });
      }
      files.sort((a, b) => comparePaths(a.path, b.path));
      for (const file of files) {
        await input.sink.writeFile(file.path, outputFileBytes(file));
      }
      const manifest = exportManifest({
        target: input.target,
        meta: input.meta,
        exporterId: id,
        fileCount: files.length,
      });
      await input.sink.writeFile(
        EXPORT_MANIFEST_FILE,
        outputFileBytes({ path: EXPORT_MANIFEST_FILE, contents: manifest, layer }),
      );
    },
  };
}

/** The resource pack exporter (id `vanilla-packs`, layer `resourcepack`). */
export const resourcePackExporter: Exporter = createVanillaPacksExporter('resource');

/** The data pack exporter (id `vanilla-packs-data`, layer `datapack`). */
export const dataPackExporter: Exporter = createVanillaPacksExporter('data');

/** Alias of {@link resourcePackExporter}, kept from Phase 1. */
export const vanillaPacksExporter: Exporter = resourcePackExporter;
