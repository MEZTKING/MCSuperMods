/**
 * The sulfur cube archetype's numbers and one hit's path (B627; the plan's batch 3 table: "a
 * bounce drawn from its numbers"). Pure: no DOM.
 *
 * The archetype names its knockback (`knockback_modifiers.horizontal_power`, `vertical_power`) and
 * attribute modifiers (`bounciness`, `friction_modifier`, `air_drag_modifier` among them). The
 * path is worked out by MSM with ordinary mob movement (gravity 0.08 blocks per tick, vertical
 * drag 0.98, air drag 0.91 and ground drag 0.546 per tick) changed by those attributes; the
 * cube's own movement rules are the game's, so the path is About right. Attribute bases are taken
 * as 0 for bounciness and 1 for the two modifiers (verify at implementation).
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';

type JsonObject = { [key: string]: Json };
const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: Json | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** An attribute's value after the archetype's modifiers, as the game adds them up. */
export function attributeValue(data: Json | undefined, attribute: string, base: number): number {
  const list =
    isObject(data) && Array.isArray(data.attribute_modifiers) ? data.attribute_modifiers : [];
  const wanted = attribute.includes(':') ? attribute : `minecraft:${attribute}`;
  let added = base;
  let multipliedBase = 0;
  let multipliedTotal = 1;
  for (const entry of list) {
    if (!isObject(entry) || typeof entry.attribute !== 'string') continue;
    const name = entry.attribute.includes(':') ? entry.attribute : `minecraft:${entry.attribute}`;
    if (name !== wanted) continue;
    const amount = num(entry.amount, 0);
    if (entry.operation === 'add_multiplied_base') multipliedBase += amount;
    else if (entry.operation === 'add_multiplied_total') multipliedTotal *= 1 + amount;
    else added += amount;
  }
  return (added + base * multipliedBase) * multipliedTotal;
}

/** The numbers the path is drawn from. */
export interface BounceNumbers {
  readonly horizontal: number;
  readonly vertical: number;
  readonly bounciness: number;
  readonly friction: number;
  readonly airDrag: number;
}

/** The archetype's numbers for the path. */
export function bounceNumbers(data: Json | undefined): BounceNumbers {
  const knockback =
    isObject(data) && isObject(data.knockback_modifiers) ? data.knockback_modifiers : {};
  return {
    horizontal: num(knockback.horizontal_power, 0),
    vertical: num(knockback.vertical_power, 0),
    bounciness: Math.max(0, Math.min(1, attributeValue(data, 'bounciness', 0))),
    friction: Math.max(0, attributeValue(data, 'friction_modifier', 1)),
    airDrag: Math.max(0, attributeValue(data, 'air_drag_modifier', 1)),
  };
}

const GRAVITY = 0.08;
const VERTICAL_DRAG = 0.98;
const AIR_DRAG = 0.91;
const GROUND_DRAG = 0.546;

/** One hit's path: positions in blocks, a point per tick, until it stops or 100 ticks pass. */
export function bouncePath(numbers: BounceNumbers, ticks = 100): { x: number; y: number }[] {
  let x = 0;
  let y = 0;
  let vx = numbers.horizontal;
  let vy = numbers.vertical;
  let onGround = vy <= 0;
  const out = [{ x, y }];
  for (let tick = 0; tick < ticks; tick += 1) {
    x += vx;
    y += vy;
    if (y <= 0) {
      y = 0;
      const bounce = -vy * numbers.bounciness;
      vy = bounce > GRAVITY ? bounce : 0;
      onGround = vy === 0;
    } else onGround = false;
    if (!onGround) {
      vy = (vy - GRAVITY) * VERTICAL_DRAG;
      vx *= Math.max(0, 1 - (1 - AIR_DRAG) * numbers.airDrag);
    } else {
      vx *= Math.max(0, 1 - (1 - GROUND_DRAG) * numbers.friction);
    }
    out.push({ x, y });
    if (onGround && Math.abs(vx) < 0.003) break;
  }
  return out;
}

/** How many times the path leaves the ground after landing. */
export function bounceCount(path: readonly { x: number; y: number }[]): number {
  let count = 0;
  for (let index = 2; index < path.length; index += 1) {
    const before = path[index - 2]?.y ?? 0;
    const at = path[index - 1]?.y ?? 0;
    const after = path[index]?.y ?? 0;
    if (at === 0 && before > 0 && after > 0) count += 1;
  }
  return count;
}
