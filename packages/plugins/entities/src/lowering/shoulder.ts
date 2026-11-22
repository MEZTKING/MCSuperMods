/**
 * Lowering of the `msm:shoulder_riding` entity component (ADR 0098 D4, as amended after the
 * B469 spike: the pet is perched at its owner's shoulder, not a passenger; ADR 0109 D2: either
 * shoulder). Lowering writes the component with its one field, `sides` (`left`, `right` or
 * `either`, named by the player's view), when the element sets it to a string, and as an empty
 * object otherwise, dropping anything else the element holds; the shoulder offset, the cooldown,
 * the side vanilla's parrots leave free and the events that make the pet jump down are the
 * runtime's. Nothing is written to packs.
 */
import type { JsonObject } from '@msm/plugin-api';
import { isRecord } from './paths';

/** Component name of shoulder pets. */
export const SHOULDER_COMPONENT = 'msm:shoulder_riding';
/** The widest hitbox, in blocks, that may sit on a shoulder (ADR 0098 D4). */
export const SHOULDER_MAX_WIDTH = 0.7;
/** The shoulder sides of ADR 0109 D2; absent means `either`. */
export const SHOULDER_SIDES = Object.freeze(['left', 'right', 'either'] as const);

/**
 * The runtime form of an `msm:shoulder_riding` component: `{ sides }` when the component names
 * a side, else `{}`.
 *
 * @param component - The component as the element holds it; absent gives `{}`.
 */
export function shoulderDefinition(component: JsonObject = {}): JsonObject {
  return typeof component.sides === 'string' ? { sides: component.sides } : {};
}

/** Applies {@link shoulderDefinition} to a definition's components in place. */
export function lowerShoulderComponent(components: JsonObject): void {
  const shoulder = components[SHOULDER_COMPONENT];
  if (isRecord(shoulder)) components[SHOULDER_COMPONENT] = shoulderDefinition(shoulder);
}
