/**
 * The engine's first seam (ADR 0119 D3): types the target has and deepslate lacks. B578's parser
 * and rule fronts read these lists; B581 fills them. The entry shapes below are placeholders that
 * B578 fixes.
 */

import type { WorldgenFiles } from '../api';

/** One density function type the engine adds to deepslate's parser. */
export interface DensityFunctionExtension {
  readonly type: string;
}

/** One surface rule type the engine adds to deepslate's rule front. */
export interface RuleExtension {
  readonly type: string;
}

/** One surface condition type the engine adds to deepslate's rule front. */
export interface ConditionExtension {
  readonly type: string;
}

export const densityFunctionTypes: readonly DensityFunctionExtension[] = [];
export const ruleTypes: readonly RuleExtension[] = [];
export const conditionTypes: readonly ConditionExtension[] = [];

/** The flat generator (B581); `null` until then, and the world reports it as unsupported. */
export const flatGenerator: ((files: WorldgenFiles) => unknown) | null = null;
