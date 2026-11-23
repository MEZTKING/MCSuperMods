/**
 * Lowering of `msm:kit` (ADR 0132 D3): one function, `<ns>:msm_games/kit/<path>/give`, that
 * clears the player first if the kit says so and gives its items, armour, off hand and
 * effects. B721 stub: a kit lowers to nothing until B724.
 */
import type { Element, OutputFile, TargetFacts } from '@msm/plugin-api';

/** Lowers one kit; no files until B724. */
export function lowerKit(_element: Element, _target: TargetFacts): OutputFile[] {
  return [];
}
