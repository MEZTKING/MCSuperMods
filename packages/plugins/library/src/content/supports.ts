/**
 * `supports` gates shared by starters and examples (ADR 0036 D4).
 */
import type { TargetFacts } from '@msm/plugin-api';

/**
 * Whether `target` has a GeckoLib build: animated entities need GeckoLib in the content jar,
 * so starters and examples with entities are hidden on targets without it (ADR 0037).
 */
export function hasGeckolib(target: TargetFacts): boolean {
  return target.geckolib !== undefined;
}
