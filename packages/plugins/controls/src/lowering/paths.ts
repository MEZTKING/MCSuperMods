/**
 * Output path helpers of `@msm/plugin-controls`. The runtime folders `msm/<ns>/key_bind/` and
 * `msm/<ns>/hud/` are fixed by ADR 0088 D3 and ADR 0089 D1 (the scanner kinds `key_bind` and
 * `hud`); vanilla folder names (the language folder, the textures folder) come from the target.
 * A copy of the other plugins' helpers, because `@msm/plugin-api` holds interfaces only.
 */
import type { Json, JsonObject, OutputFile, ResourceLocation, TargetFacts } from '@msm/plugin-api';

/** Thrown by lowering when an element cannot be turned into output files. */
export class ControlsLoweringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ControlsLoweringError';
  }
}

const NAMESPACE_PATTERN = /^[a-z0-9_.-]+$/;
const PATH_PATTERN = /^[a-z0-9_.-]+(\/[a-z0-9_.-]+)*$/;

const hasDotSegment = (path: string): boolean =>
  path.split('/').some((segment) => segment === '.' || segment === '..');

/** True for a JSON object (not an array, not `null`). */
export const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A non-empty string, or undefined. */
export const nonEmptyString = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/**
 * Splits a resource location into its namespace and path, rejecting anything that would not
 * form a safe resource path (no empty segments, no `..`, lower case only).
 *
 * @throws {@link ControlsLoweringError} If `id` is not a valid resource location.
 */
export function splitResourceLocation(id: ResourceLocation | string): {
  namespace: string;
  path: string;
} {
  const colon = id.indexOf(':');
  const namespace = colon < 0 ? '' : id.slice(0, colon);
  const path = colon < 0 ? '' : id.slice(colon + 1);
  if (!NAMESPACE_PATTERN.test(namespace) || !PATH_PATTERN.test(path) || hasDotSegment(path)) {
    throw new ControlsLoweringError(
      `Invalid element id ${JSON.stringify(id)}: expected <namespace>:<path> in lower case.`,
    );
  }
  return { namespace, path };
}

/** A runtime definition folder of this plugin under `msm/<namespace>/`. */
export type ControlsDefinitionFolder = 'key_bind' | 'hud';

/** The runtime definition path `msm/<namespace>/<folder>/<path>.json`. */
export function definitionPath(
  folder: ControlsDefinitionFolder,
  namespace: string,
  path: string,
): string {
  return `msm/${namespace}/${folder}/${path}.json`;
}

/** The language file names are written to. */
export const DISPLAY_NAME_LANGUAGE = 'en_us';
/** Schema of vanilla language files. */
export const LANG_SCHEMA = '::java::assets::lang::Lang';

/**
 * Keys of `assets/<namespace>/<lang folder>/en_us.json`, declared `merge: 'object'` so every
 * element's names land in the same file (ADR 0027).
 */
export function langFile(
  target: TargetFacts,
  namespace: string,
  entries: Readonly<Record<string, string>>,
): OutputFile {
  return {
    path: `assets/${namespace}/${target.folders.resource.lang}/${DISPLAY_NAME_LANGUAGE}.json`,
    contents: { ...entries },
    layer: 'resourcepack',
    schema: LANG_SCHEMA,
    merge: 'object',
  };
}
