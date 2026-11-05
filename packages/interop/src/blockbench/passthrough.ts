/**
 * Pass-through of Blockbench's own Bedrock exports (ADR 0029 D3): `.geo.json` and
 * `.animation.json` files are checked for `format_version` and their top-level keys and
 * returned unchanged.
 */
import type { Json, JsonObject, Problem } from '@msm/plugin-api';

/** What {@link checkGeoJson} and {@link checkAnimationJson} return. */
export interface PassThroughResult {
  /** The parsed file, unchanged; absent when it is not a geometry or animation file. */
  data?: JsonObject;
  /** `blockbench.*` problems found. */
  problems: Problem[];
}

function isObj(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True for `1.12.0` to `1.21.x`: the geometry versions GeckoLib 5 and Blockbench 5 write. */
function knownGeoVersion(version: string): boolean {
  const match = /^1\.(\d+)\.\d+$/.exec(version);
  if (!match) return false;
  const minor = Number(match[1]);
  return minor >= 12 && minor <= 21;
}

const KNOWN_ANIMATION_VERSIONS = new Set(['1.8.0', '1.10.0']);

function unknownKeys(json: JsonObject, allowed: readonly string[], what: string): Problem[] {
  const extra = Object.keys(json).filter((key) => !allowed.includes(key));
  if (extra.length === 0) return [];
  return [
    {
      severity: 'warning',
      code: 'blockbench.unknown-key',
      message: `The ${what} file has unexpected top-level keys: ${extra.join(', ')}.`,
    },
  ];
}

/**
 * Checks a parsed `.geo.json` file: a string `format_version` and a non-empty
 * `minecraft:geometry` array. Legacy pre-1.12 files (`geometry.<name>` keys) are refused.
 *
 * @param json - The parsed file.
 * @returns The file unchanged (when it is a geometry file) and the problems found:
 *   `blockbench.invalid-geometry` (error), `blockbench.unknown-format-version` and
 *   `blockbench.unknown-key` (warnings).
 */
export function checkGeoJson(json: Json): PassThroughResult {
  if (!isObj(json) || typeof json.format_version !== 'string') {
    return invalid('blockbench.invalid-geometry', 'The file has no string "format_version".');
  }
  const geometries = json['minecraft:geometry'];
  if (!Array.isArray(geometries) || geometries.length === 0) {
    return invalid(
      'blockbench.invalid-geometry',
      'The file has no "minecraft:geometry" array; export it from Blockbench as Bedrock geometry 1.12.0 or later.',
    );
  }
  const problems: Problem[] = [];
  if (!knownGeoVersion(json.format_version)) {
    problems.push({
      severity: 'warning',
      code: 'blockbench.unknown-format-version',
      message: `Geometry format ${json.format_version} is not one GeckoLib is known to read (1.12.0 to 1.21.x).`,
    });
  }
  problems.push(...unknownKeys(json, ['format_version', 'minecraft:geometry'], 'geometry'));
  return { data: json, problems };
}

/**
 * Checks a parsed `.animation.json` file: a string `format_version` and an `animations`
 * object.
 *
 * @param json - The parsed file.
 * @returns The file unchanged (when it is an animation file) and the problems found:
 *   `blockbench.invalid-animation` (error), `blockbench.unknown-format-version` and
 *   `blockbench.unknown-key` (warnings).
 */
export function checkAnimationJson(json: Json): PassThroughResult {
  if (!isObj(json) || typeof json.format_version !== 'string') {
    return invalid('blockbench.invalid-animation', 'The file has no string "format_version".');
  }
  if (!isObj(json.animations)) {
    return invalid('blockbench.invalid-animation', 'The file has no "animations" object.');
  }
  const problems: Problem[] = [];
  if (!KNOWN_ANIMATION_VERSIONS.has(json.format_version)) {
    problems.push({
      severity: 'warning',
      code: 'blockbench.unknown-format-version',
      message: `Animation format ${json.format_version} is not 1.8.0 or 1.10.0.`,
    });
  }
  problems.push(...unknownKeys(json, ['format_version', 'animations'], 'animation'));
  return { data: json, problems };
}

function invalid(code: string, message: string): PassThroughResult {
  return { problems: [{ severity: 'error', code, message }] };
}
