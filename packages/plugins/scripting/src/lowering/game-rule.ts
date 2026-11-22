/**
 * Lowering of `msm:game_rule` (ADR 0111 D5). A stub from B526: it lowers to nothing yet and B535
 * fills it in (the runtime definition and the language keys).
 */
import type { Element, OutputFile, Target } from '@msm/plugin-api';

export function lowerGameRule(_element: Element, _target: Target): OutputFile[] {
  return [];
}
