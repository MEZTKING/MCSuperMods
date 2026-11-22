/**
 * The surface condition `hole` (ADR 0119 D3; plan brief B581): true in a column whose surface
 * depth is 0 or less, where no surface layer would be laid. The surface depth is the one
 * `stone_depth` adds with `add_surface_depth` (the world's `minecraft:surface` noise and a small
 * random part per column), a whole number in the game (`surface-depth.ts`). Learned by
 * observation on the worldgen parity fixture's `condition_hole` dimension (B581; the type has no
 * fields): over 300 columns every hole column has a depth below 1 before the fraction is dropped,
 * and no other column has; the top four blocks then match in 100 % of columns.
 */

import { MaterialCondition, type MaterialRuleContext } from 'deepslate/worldgen';
import type { ConditionType } from '../rules';

/** `hole`: the column's surface depth is at most 0. */
export class Hole extends MaterialCondition {
  compile(context: MaterialRuleContext): () => boolean {
    return () => context.surfaceDepth <= 0;
  }
}

export const hole: ConditionType = {
  type: 'hole',
  parse: () => new Hole(),
};
