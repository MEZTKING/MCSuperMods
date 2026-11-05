/**
 * Output path helpers for script lowering. The runtime folder `msm/<ns>/script/` is fixed by
 * ADR 0032 D3. A copy of the other plugins' helpers, because plugins cannot import each other
 * and `@msm/plugin-api` holds interfaces only.
 */
import type { Json, JsonObject, ResourceLocation } from '@msm/plugin-api';

/** Thrown by lowering when an element cannot be turned into output files. */
export class ScriptingLoweringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScriptingLoweringError';
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
 * @param id - The element id, such as `example:ore_glow`.
 * @returns The namespace and path.
 * @throws {@link ScriptingLoweringError} If `id` is not a valid resource location.
 */
export function splitResourceLocation(id: ResourceLocation | string): {
  namespace: string;
  path: string;
} {
  const colon = id.indexOf(':');
  const namespace = colon < 0 ? '' : id.slice(0, colon);
  const path = colon < 0 ? '' : id.slice(colon + 1);
  if (!NAMESPACE_PATTERN.test(namespace) || !PATH_PATTERN.test(path)) {
    throw new ScriptingLoweringError(
      `Invalid element id ${JSON.stringify(id)}: expected <namespace>:<path> in lower case.`,
    );
  }
  if (hasDotSegment(path)) {
    throw new ScriptingLoweringError(
      `Invalid element id ${JSON.stringify(id)}: path segments may not be "." or "..".`,
    );
  }
  return { namespace, path };
}

/** The script source path `msm/<namespace>/script/<path>.ts` (ADR 0032 D3). */
export function scriptPath(namespace: string, path: string): string {
  return `msm/${namespace}/script/${path}.ts`;
}
