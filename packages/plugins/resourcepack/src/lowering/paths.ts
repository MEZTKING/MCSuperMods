/**
 * Output path helpers for resource pack lowering. Folder names always come from the target
 * (`target.folders.resource`), never from this plugin.
 */
import type { ResourceFolderKey, ResourceLocation, Target } from '@msm/plugin-api';

/** Thrown by lowering when an element id cannot be turned into an output path. */
export class ResourcePackLoweringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResourcePackLoweringError';
  }
}

const NAMESPACE_PATTERN = /^[a-z0-9_.-]+$/;
const PATH_PATTERN = /^[a-z0-9_.-]+(\/[a-z0-9_.-]+)*$/;

/**
 * Splits a resource location into its namespace and path, rejecting anything that would not
 * form a safe vanilla resource path (no empty segments, no `..`, lower-case only).
 *
 * @param id - The element id, such as `example:block/ruby_ore`.
 * @returns The namespace and path.
 * @throws {@link ResourcePackLoweringError} If `id` is not a valid resource location.
 */
export function splitResourceLocation(id: ResourceLocation | string): {
  namespace: string;
  path: string;
} {
  const colon = id.indexOf(':');
  const namespace = colon < 0 ? '' : id.slice(0, colon);
  const path = colon < 0 ? '' : id.slice(colon + 1);
  if (!NAMESPACE_PATTERN.test(namespace) || !PATH_PATTERN.test(path)) {
    throw new ResourcePackLoweringError(
      `Invalid element id ${JSON.stringify(id)}: expected <namespace>:<path> in lower case.`,
    );
  }
  if (path.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new ResourcePackLoweringError(
      `Invalid element id ${JSON.stringify(id)}: path segments may not be "." or "..".`,
    );
  }
  return { namespace, path };
}

/**
 * The output path of a JSON resource under `assets/<namespace>/<folder>/<path>.json`.
 *
 * For `sounds_file`, which names a file rather than a folder, `path` is ignored and the result
 * is `assets/<namespace>/<file>`.
 *
 * @param target - The target supplying the folder name.
 * @param key - Which resource folder.
 * @param namespace - The resource namespace.
 * @param path - The resource path without extension.
 * @returns The output-relative path.
 */
export function assetPath(
  target: Target,
  key: ResourceFolderKey,
  namespace: string,
  path: string,
): string {
  const folder = target.folders.resource[key];
  if (key === 'sounds_file') return `assets/${namespace}/${folder}`;
  return `assets/${namespace}/${folder}/${path}.json`;
}
