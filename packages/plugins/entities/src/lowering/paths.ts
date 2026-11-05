/**
 * Output path helpers for entity lowering. Vanilla folder names always come from the target
 * (`target.folders.resource`), never from this plugin; the runtime folder `msm/<ns>/entity/` is
 * fixed by ADR 0028 D1. A copy of the blocks-items helpers, because plugins cannot import each
 * other and `@msm/plugin-api` holds interfaces only.
 */
import type {
  Json,
  JsonObject,
  ResourceFolderKey,
  ResourceLocation,
  Target,
} from '@msm/plugin-api';

/** Thrown by lowering when an element cannot be turned into output files. */
export class EntitiesLoweringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EntitiesLoweringError';
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
 * @param id - The element id, such as `example:ruby_golem`.
 * @returns The namespace and path.
 * @throws {@link EntitiesLoweringError} If `id` is not a valid resource location.
 */
export function splitResourceLocation(id: ResourceLocation | string): {
  namespace: string;
  path: string;
} {
  const colon = id.indexOf(':');
  const namespace = colon < 0 ? '' : id.slice(0, colon);
  const path = colon < 0 ? '' : id.slice(colon + 1);
  if (!NAMESPACE_PATTERN.test(namespace) || !PATH_PATTERN.test(path)) {
    throw new EntitiesLoweringError(
      `Invalid element id ${JSON.stringify(id)}: expected <namespace>:<path> in lower case.`,
    );
  }
  if (hasDotSegment(path)) {
    throw new EntitiesLoweringError(
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

/** The runtime definition path `msm/<namespace>/entity/<path>.json` (ADR 0028 D1). */
export function definitionPath(namespace: string, path: string): string {
  return `msm/${namespace}/entity/${path}.json`;
}

/**
 * The game's description id of a registry entry: `<prefix>.<namespace>.<path>` with every `/`
 * of the path written as `.`, for example `entity.example.mobs.golem`.
 */
export function descriptionKey(prefix: 'entity' | 'item', namespace: string, path: string): string {
  return `${prefix}.${namespace}.${path.replaceAll('/', '.')}`;
}

/** The path of the spawn egg item derived from an entity path: `<path>_spawn_egg`. */
export const spawnEggPath = (path: string): string => `${path}_spawn_egg`;
