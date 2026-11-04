/**
 * Passes project assets (textures, sounds, fonts, texts) through to the export.
 *
 * @packageDocumentation
 */

import {
  isProjectRelativePath,
  type OutputFile,
  type Problem,
  type Project,
} from '@msm/plugin-api';
import { ExportProblemCodes } from './problem-codes';
import { comparePaths } from './zip';

/**
 * The first path segments of assets that are copied into the resource pack. Anything else is
 * reported as `export.asset-skipped` (info) and left out.
 */
export const EXPORTED_ASSET_FOLDERS: readonly string[] = Object.freeze([
  'textures',
  'sounds',
  'font',
  'texts',
]);

/**
 * The schema reference given to texture animation sidecars (`*.png.mcmeta`), so the export
 * gate validates them like lowered JSON.
 */
export const TEXTURE_META_SCHEMA = 'resource:texture_meta';

/** True for a texture animation sidecar such as `textures/block/lava.png.mcmeta`. */
export function isTextureMetaPath(path: string): boolean {
  return path.startsWith('textures/') && path.endsWith('.png.mcmeta');
}

/**
 * Reads every exportable project asset and returns it as a `resourcepack` output file at
 * `assets/<namespace>/<asset path>`, in namespace and then path order. Texture animation
 * sidecars (`.png.mcmeta` files under `textures/`) carry `schema: 'resource:texture_meta'`,
 * so the validation gate checks them; only project-authored sidecars are exported.
 *
 * Assets outside {@link EXPORTED_ASSET_FOLDERS} yield an `export.asset-skipped` info; an
 * unsafe asset path yields an `export.unsafe-path` error and a failed read an
 * `export.asset-read-failed` error, and neither contributes a file.
 *
 * @param project - The project whose assets are exported.
 * @param readAsset - Reads one asset's bytes, given its namespace and asset path.
 * @returns The asset files and the problems found.
 */
export async function assetOutputFiles(
  project: Project,
  readAsset: (namespace: string, path: string) => Promise<Uint8Array>,
): Promise<{ files: OutputFile[]; problems: Problem[] }> {
  const files: OutputFile[] = [];
  const problems: Problem[] = [];
  const namespaces = [...project.namespaces].sort((a, b) => comparePaths(a.name, b.name));
  for (const namespace of namespaces) {
    const assets = [...namespace.assets].sort((a, b) => comparePaths(a.path, b.path));
    for (const asset of assets) {
      const outputPath = `assets/${namespace.name}/${asset.path}`;
      if (!isProjectRelativePath(asset.path) || !isProjectRelativePath(outputPath)) {
        problems.push({
          severity: 'error',
          code: ExportProblemCodes.unsafePath,
          file: outputPath,
          message: `Asset ${JSON.stringify(asset.path)} in namespace ${namespace.name} does not have a safe relative path.`,
        });
        continue;
      }
      const folder = asset.path.split('/')[0] as string;
      if (!EXPORTED_ASSET_FOLDERS.includes(folder) || !asset.path.includes('/')) {
        problems.push({
          severity: 'info',
          code: ExportProblemCodes.assetSkipped,
          file: outputPath,
          message: `Asset ${asset.path} in namespace ${namespace.name} is not under ${EXPORTED_ASSET_FOLDERS.map((f) => `${f}/`).join(', ')} and was not exported.`,
        });
        continue;
      }
      let contents: Uint8Array;
      try {
        contents = await readAsset(namespace.name, asset.path);
      } catch (error) {
        problems.push({
          severity: 'error',
          code: ExportProblemCodes.assetReadFailed,
          file: outputPath,
          message: `Could not read asset ${asset.path} in namespace ${namespace.name}: ${error instanceof Error ? error.message : String(error)}`,
        });
        continue;
      }
      const file: OutputFile = { path: outputPath, contents, layer: 'resourcepack' };
      if (isTextureMetaPath(asset.path)) file.schema = TEXTURE_META_SCHEMA;
      files.push(file);
    }
  }
  return { files, problems };
}
