/**
 * Lowering of the `msm:shoulder_riding` entity component (ADR 0098 D4, as amended after the
 * B469 spike: the pet is perched at its owner's shoulder, not a passenger). The component has no
 * fields, so lowering writes it as an empty object whatever the element holds; the shoulder
 * offset, the cooldown and the events that make the pet jump down are the runtime's. Nothing is
 * written to packs.
 */
import type { JsonObject } from '@msm/plugin-api';
import { isRecord } from './paths';

/** Component name of shoulder pets. */
export const SHOULDER_COMPONENT = 'msm:shoulder_riding';
/** The widest hitbox, in blocks, that may sit on a shoulder (ADR 0098 D4). */
export const SHOULDER_MAX_WIDTH = 0.7;

/** The runtime form of an `msm:shoulder_riding` component: always `{}`. */
export function shoulderDefinition(): JsonObject {
  return {};
}

/** Applies {@link shoulderDefinition} to a definition's components in place. */
export function lowerShoulderComponent(components: JsonObject): void {
  if (isRecord(components[SHOULDER_COMPONENT])) {
    components[SHOULDER_COMPONENT] = shoulderDefinition();
  }
}
