/**
 * Lowering of `msm:stat` (ADR 0111 D6). A stub from B526: it lowers to nothing yet and B535 fills
 * it in (the runtime definition and the language key).
 */
import type { Element, OutputFile, Target } from '@msm/plugin-api';

export function lowerStat(_element: Element, _target: Target): OutputFile[] {
  return [];
}
