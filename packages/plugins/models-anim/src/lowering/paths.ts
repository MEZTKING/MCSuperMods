/**
 * Output paths of geo models and animations, the one place that knows GeckoLib's resource
 * layout (ADR 0029 D2): `assets/<ns>/geckolib/models/<path>.geo.json` and
 * `assets/<ns>/geckolib/animations/<path>.animation.json`. GeckoLib strips the
 * `geckolib/<folder>/` prefix and the suffix to form its lookup key, so the element id is the
 * id a definition names (`mymod:entity/ruby_golem`; B110 findings in ADR 0029).
 *
 * These segments are GeckoLib facts, not Minecraft version facts: they belong to GeckoLib's
 * own resource loader and have not changed with the game version, so they live here rather
 * than in `packages/targets`. If a GeckoLib release moves them, this file changes (ADR 0029
 * Consequences). A copy of the other plugins' id helpers, because `@msm/plugin-api` holds
 * interfaces only.
 */
import type { Json, JsonObject, ResourceLocation } from '@msm/plugin-api';

/** The folder under `assets/<ns>/` GeckoLib reads its resources from. */
export const GECKOLIB_FOLDER = 'geckolib';
/** The geo model folder under {@link GECKOLIB_FOLDER}. */
export const GEO_MODELS_FOLDER = 'models';
/** The animation folder under {@link GECKOLIB_FOLDER}. */
export const ANIMATIONS_FOLDER = 'animations';
/** The file suffix of geo models. */
export const GEO_MODEL_SUFFIX = '.geo.json';
/** The file suffix of animation files. */
export const ANIMATION_SUFFIX = '.animation.json';

/** Thrown by lowering when an element cannot be turned into output files. */
export class ModelsAnimLoweringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelsAnimLoweringError';
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
 * @param id - The element id, such as `example:entity/ruby_golem`.
 * @returns The namespace and path.
 * @throws {@link ModelsAnimLoweringError} If `id` is not a valid resource location.
 */
export function splitResourceLocation(id: ResourceLocation | string): {
  namespace: string;
  path: string;
} {
  const colon = id.indexOf(':');
  const namespace = colon < 0 ? '' : id.slice(0, colon);
  const path = colon < 0 ? '' : id.slice(colon + 1);
  if (!NAMESPACE_PATTERN.test(namespace) || !PATH_PATTERN.test(path)) {
    throw new ModelsAnimLoweringError(
      `Invalid element id ${JSON.stringify(id)}: expected <namespace>:<path> in lower case.`,
    );
  }
  if (hasDotSegment(path)) {
    throw new ModelsAnimLoweringError(
      `Invalid element id ${JSON.stringify(id)}: path segments may not be "." or "..".`,
    );
  }
  return { namespace, path };
}

/** `assets/<namespace>/geckolib/models/<path>.geo.json`. */
export function geoModelPath(namespace: string, path: string): string {
  return `assets/${namespace}/${GECKOLIB_FOLDER}/${GEO_MODELS_FOLDER}/${path}${GEO_MODEL_SUFFIX}`;
}

/** `assets/<namespace>/geckolib/animations/<path>.animation.json`. */
export function animationPath(namespace: string, path: string): string {
  return `assets/${namespace}/${GECKOLIB_FOLDER}/${ANIMATIONS_FOLDER}/${path}${ANIMATION_SUFFIX}`;
}
