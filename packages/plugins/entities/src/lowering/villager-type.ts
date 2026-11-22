/**
 * Lowering of `msm:villager_type` (ADR 0107 D5). A stub from B526: it lowers to nothing yet and
 * B530 fills it in (the runtime definition, the biome tag and the texture paths).
 */
import type { Element, OutputFile, TargetFacts } from '@msm/plugin-api';

export function lowerVillagerType(_element: Element, _target: TargetFacts): OutputFile[] {
  return [];
}
