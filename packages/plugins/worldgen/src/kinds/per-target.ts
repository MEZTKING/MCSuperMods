/**
 * Per-target starting data (ADR 0036 D8). Noise settings are the one worldgen kind with no
 * data valid on every built-in target: `default_block` is required where the field exists and
 * an unknown field where a target's schema removed it. The target says which through
 * `target.worldgen.noiseSettingsDefaultBlock` (absent means the field exists); the plugin
 * never names a version.
 */
import type { Json, TargetFacts } from '@msm/plugin-api';

/** Whether noise settings on `target` have the (required) `default_block` field. */
export function noiseSettingsHaveDefaultBlock(target: TargetFacts): boolean {
  return target.worldgen.noiseSettingsDefaultBlock !== false;
}

/**
 * `data` (noise settings that carry `default_block`) shaped for `target`: a deep copy, without
 * `default_block` where the target's noise settings have no such field.
 *
 * @param data - Noise settings with `default_block`, as the release target requires.
 * @param target - The facts of the target the data is for.
 * @returns A fresh copy valid for `target`.
 */
export function noiseSettingsFor(data: Json, target: TargetFacts): Json {
  const copy = structuredClone(data);
  if (
    !noiseSettingsHaveDefaultBlock(target) &&
    typeof copy === 'object' &&
    copy !== null &&
    !Array.isArray(copy)
  ) {
    delete copy.default_block;
  }
  return copy;
}
