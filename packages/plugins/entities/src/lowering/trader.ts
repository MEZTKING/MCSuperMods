/**
 * Lowering of the `msm:trader` entity component (ADR 0098 D1). The component passes through to
 * the runtime definition; lowering writes the target's trade sound
 * (`target.entities.tradeSounds.yes`) when `trade_sound` is absent, so the version fact stays in
 * `packages/targets` and the runtime reads one shape. The fields of ADR 0107 D1 to D3
 * (`reputation`, `demand`, `work_site`) pass through unchanged, their defaults the runtime's
 * (vanilla's numbers). Nothing else is written: the trade sets a trader names are ADR 0060
 * elements (or vanilla's) and lower on their own.
 */
import type { JsonObject, TargetFacts } from '@msm/plugin-api';
import { isRecord } from './paths';

/** Component name of trading mobs. */
export const TRADER_COMPONENT = 'msm:trader';

/**
 * The runtime form of an `msm:trader` component: a copy with `trade_sound` set to the target's
 * trade sound when it is absent and the target has trade sounds.
 *
 * @param component - The component as the element holds it.
 * @param target - The target supplying `entities.tradeSounds`.
 * @returns A new object; the input is not changed.
 */
export function traderDefinition(component: JsonObject, target: TargetFacts): JsonObject {
  const definition = structuredClone(component);
  const sound = target.entities?.tradeSounds?.yes;
  if (definition.trade_sound === undefined && sound !== undefined) {
    definition.trade_sound = sound;
  }
  return definition;
}

/**
 * Applies {@link traderDefinition} to a runtime entity definition's components in place, when
 * the definition has an `msm:trader` object.
 */
export function lowerTraderComponent(components: JsonObject, target: TargetFacts): void {
  const trader = components[TRADER_COMPONENT];
  if (isRecord(trader)) components[TRADER_COMPONENT] = traderDefinition(trader, target);
}
