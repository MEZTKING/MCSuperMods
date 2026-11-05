/**
 * Output path helpers for blocks and items lowering. Vanilla folder names always come from the
 * target (`target.folders.resource`, `target.folders.data`), never from this plugin; the
 * runtime folders (`msm/<ns>/block/`, `msm/<ns>/item/`) are fixed by ADR 0025 D1. A copy of the
 * other plugins' helpers, because `@msm/plugin-api` holds interfaces only.
 */
import type {
  DataFolderKey,
  Json,
  JsonObject,
  ResourceFolderKey,
  ResourceLocation,
  Target,
} from '@msm/plugin-api';

/** Thrown by lowering when an element cannot be turned into output files. */
export class BlocksItemsLoweringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlocksItemsLoweringError';
  }
}

const NAMESPACE_PATTERN = /^[a-z0-9_.-]+$/;
const PATH_PATTERN = /^[a-z0-9_.-]+(\/[a-z0-9_.-]+)*$/;

const hasDotSegment = (path: string): boolean =>
  path.split('/').some((segment) => segment === '.' || segment === '..');

/** True for a JSON object (not an array, not `null`). */
export const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Splits a resource location into its namespace and path, rejecting anything that would not
 * form a safe resource path (no empty segments, no `..`, lower case only).
 *
 * @param id - The element id, such as `example:ruby_ore`.
 * @returns The namespace and path.
 * @throws {@link BlocksItemsLoweringError} If `id` is not a valid resource location.
 */
export function splitResourceLocation(id: ResourceLocation | string): {
  namespace: string;
  path: string;
} {
  const colon = id.indexOf(':');
  const namespace = colon < 0 ? '' : id.slice(0, colon);
  const path = colon < 0 ? '' : id.slice(colon + 1);
  if (!NAMESPACE_PATTERN.test(namespace) || !PATH_PATTERN.test(path)) {
    throw new BlocksItemsLoweringError(
      `Invalid element id ${JSON.stringify(id)}: expected <namespace>:<path> in lower case.`,
    );
  }
  if (hasDotSegment(path)) {
    throw new BlocksItemsLoweringError(
      `Invalid element id ${JSON.stringify(id)}: path segments may not be "." or "..".`,
    );
  }
  return { namespace, path };
}

/** `assets/<namespace>/<folder>/<path>.json`, the folder taken from the target. */
export function assetPath(
  target: Target,
  key: Exclude<ResourceFolderKey, 'sounds_file'>,
  namespace: string,
  path: string,
): string {
  return `assets/${namespace}/${target.folders.resource[key]}/${path}.json`;
}

/** `data/<namespace>/<folder>/<path>.json`, the folder taken from the target. */
export function dataPath(
  target: Target,
  key: DataFolderKey,
  namespace: string,
  path: string,
): string {
  return `data/${namespace}/${target.folders.data[key]}/${path}.json`;
}

/** The runtime definition path `msm/<namespace>/<block|item>/<path>.json` (ADR 0025 D1). */
export function definitionPath(kind: 'block' | 'item', namespace: string, path: string): string {
  return `msm/${namespace}/${kind}/${path}.json`;
}

/**
 * The game's description id of a registry entry: `<prefix>.<namespace>.<path>` with every `/`
 * of the path written as `.`, for example `block.example.ores.ruby`.
 */
export function descriptionKey(prefix: 'block' | 'item', namespace: string, path: string): string {
  return `${prefix}.${namespace}.${path.replaceAll('/', '.')}`;
}
