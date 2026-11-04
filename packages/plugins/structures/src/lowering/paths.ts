/**
 * Output path helpers for structures lowering, a copy of the data pack plugin's helpers
 * (plugins share no internals). Folder names always come from the target
 * (`target.folders.data`), never from this plugin.
 */
import type { DataFolderKey, ResourceLocation, Target } from '@msm/plugin-api';

/** Thrown by lowering when an element cannot be turned into an output file. */
export class StructuresLoweringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StructuresLoweringError';
  }
}

const NAMESPACE_PATTERN = /^[a-z0-9_.-]+$/;
const PATH_PATTERN = /^[a-z0-9_.-]+(\/[a-z0-9_.-]+)*$/;

/**
 * Splits a resource location into its namespace and path, rejecting anything that would not
 * form a safe vanilla resource path (no empty segments, no `..`, lower case only).
 *
 * @param id - The element id, such as `example:gameplay/ruby`.
 * @returns The namespace and path.
 * @throws {@link StructuresLoweringError} If `id` is not a valid resource location.
 */
export function splitResourceLocation(id: ResourceLocation | string): {
  namespace: string;
  path: string;
} {
  const colon = id.indexOf(':');
  const namespace = colon < 0 ? '' : id.slice(0, colon);
  const path = colon < 0 ? '' : id.slice(colon + 1);
  if (!NAMESPACE_PATTERN.test(namespace) || !PATH_PATTERN.test(path)) {
    throw new StructuresLoweringError(
      `Invalid element id ${JSON.stringify(id)}: expected <namespace>:<path> in lower case.`,
    );
  }
  if (path.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new StructuresLoweringError(
      `Invalid element id ${JSON.stringify(id)}: path segments may not be "." or "..".`,
    );
  }
  return { namespace, path };
}

const SUBFOLDER_PATTERN = PATH_PATTERN;

/**
 * The output path of a data file under `data/<namespace>/<folder>[/<subfolder>]/<path><ext>`.
 *
 * @param target - The target supplying the folder name.
 * @param key - Which data folder.
 * @param namespace - The resource namespace.
 * @param path - The resource path without extension.
 * @param extension - The file extension including the dot, `.json` by default.
 * @param subfolder - An optional folder below the target's folder, such as a tag registry.
 * @returns The output-relative path.
 * @throws {@link StructuresLoweringError} If `subfolder` is not a safe relative path.
 */
export function dataPath(
  target: Target,
  key: DataFolderKey,
  namespace: string,
  path: string,
  extension = '.json',
  subfolder?: string,
): string {
  const folder = target.folders.data[key];
  if (subfolder === undefined) return `data/${namespace}/${folder}/${path}${extension}`;
  if (
    !SUBFOLDER_PATTERN.test(subfolder) ||
    subfolder.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new StructuresLoweringError(`Invalid data subfolder ${JSON.stringify(subfolder)}.`);
  }
  return `data/${namespace}/${folder}/${subfolder}/${path}${extension}`;
}
