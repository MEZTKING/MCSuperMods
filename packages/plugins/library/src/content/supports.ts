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

/**
 * Whether `target` can build a Fabric mod jar (it has {@link TargetFacts.fabric} facts). Mobs
 * with `renderer` `auto` need only that: GeckoLib draws them where the target has it, the
 * runtime's own renderer elsewhere (ADR 0072 D6), so mob starters, flows and examples use this
 * gate unless they need a GeckoLib-only feature such as Molang.
 */
export function hasFabric(target: TargetFacts): boolean {
  return target.fabric !== undefined;
}
