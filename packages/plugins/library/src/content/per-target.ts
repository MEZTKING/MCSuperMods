/**
 * Per-target data shapes the library's bundles read from target facts (ADR 0036 D8), never
 * from a version literal. The worldgen plugin's noise settings kind does the same for new
 * elements and its template; the library does not import that plugin (ADR 0020), so the rule
 * is repeated here.
 */
import type { Json, TargetFacts } from '@msm/plugin-api';

/** Whether noise settings on `target` have the (required) `default_block` field. */
export function noiseSettingsHaveDefaultBlock(target: TargetFacts): boolean {
  return target.worldgen.noiseSettingsDefaultBlock !== false;
}

/**
 * Noise settings `data` (with `default_block`) shaped for `target`: a deep copy, without
 * `default_block` where the target's noise settings have no such field.
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
