/**
 * Output path helpers for worldgen lowering. Folder names always come from the target
 * (`target.folders.data`), never from this plugin; the registry subfolder below
 * `folders.data.worldgen` is the kind's registry name. A copy of the data pack plugin's helper,
 * because `@msm/plugin-api` holds interfaces only (ADR 0022).
 */
import type { DataFolderKey, ResourceLocation, Target } from '@msm/plugin-api';

/** Thrown by lowering when an element cannot be turned into an output file. */
export class WorldgenLoweringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorldgenLoweringError';
  }
}

const NAMESPACE_PATTERN = /^[a-z0-9_.-]+$/;
const PATH_PATTERN = /^[a-z0-9_.-]+(\/[a-z0-9_.-]+)*$/;

const hasDotSegment = (path: string): boolean =>
  path.split('/').some((segment) => segment === '.' || segment === '..');

/**
 * Splits a resource location into its namespace and path, rejecting anything that would not
 * form a safe vanilla resource path (no empty segments, no `..`, lower case only).
 *
 * @param id - The element id, such as `example:forest/ruby_grove`.
 * @returns The namespace and path.
 * @throws {@link WorldgenLoweringError} If `id` is not a valid resource location.
 */
export function splitResourceLocation(id: ResourceLocation | string): {
  namespace: string;
  path: string;
} {
  const colon = id.indexOf(':');
  const namespace = colon < 0 ? '' : id.slice(0, colon);
  const path = colon < 0 ? '' : id.slice(colon + 1);
  if (!NAMESPACE_PATTERN.test(namespace) || !PATH_PATTERN.test(path)) {
    throw new WorldgenLoweringError(
      `Invalid element id ${JSON.stringify(id)}: expected <namespace>:<path> in lower case.`,
    );
  }
  if (hasDotSegment(path)) {
    throw new WorldgenLoweringError(
      `Invalid element id ${JSON.stringify(id)}: path segments may not be "." or "..".`,
    );
  }
  return { namespace, path };
}

/**
 * The output path of a data file under `data/<namespace>/<folder>[/<subfolder>]/<path>.json`.
 *
 * @param target - The target supplying the folder name.
 * @param key - Which data folder.
 * @param namespace - The resource namespace.
 * @param path - The resource path without extension.
 * @param subfolder - An optional folder below the target's folder, such as a worldgen registry.
 * @returns The output-relative path.
 * @throws {@link WorldgenLoweringError} If `subfolder` is not a safe relative path.
 */
export function dataPath(
  target: Target,
  key: DataFolderKey,
  namespace: string,
  path: string,
  subfolder?: string,
): string {
  const folder = target.folders.data[key];
  if (subfolder === undefined) return `data/${namespace}/${folder}/${path}.json`;
  if (!PATH_PATTERN.test(subfolder) || hasDotSegment(subfolder)) {
    throw new WorldgenLoweringError(`Invalid data subfolder ${JSON.stringify(subfolder)}.`);
  }
  return `data/${namespace}/${folder}/${subfolder}/${path}.json`;
}
