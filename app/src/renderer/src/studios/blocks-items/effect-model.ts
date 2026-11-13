/**
 * Pure helpers of the Effect Studio (ADR 0055): the icon's fixed asset path, the display name,
 * the category's name colour, new stat changes, and the per-level summary the live preview
 * shows. No React, no session.
 *
 * Choices (categories, operations) are read from the schema by the Studio; the lists here are
 * only fallbacks of the MSM format (`EffectCategory` and `AttributeOperation` in
 * `definition.mcdoc`), which is version-independent.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import { humanise } from '../worldgen/worldgen-model';
import { asObject } from './blocks-items-model';

/** The size of an effect icon in pixels (ADR 0055 D2). */
export const EFFECT_ICON_SIZE = 18;

/** The categories of format v1 (`EffectCategory`). */
export const EFFECT_CATEGORIES: readonly string[] = Object.freeze([
  'beneficial',
  'harmful',
  'neutral',
]);

/** The attribute modifier operations of format v1 (`AttributeOperation`). */
export const ATTRIBUTE_OPERATIONS: readonly string[] = Object.freeze([
  'add_value',
  'add_multiplied_base',
  'add_multiplied_total',
]);

/** The words shown for each operation. */
export const OPERATION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  add_value: 'Add',
  add_multiplied_base: 'Add % of base',
  add_multiplied_total: 'Multiply total by 1 + %',
});

/**
 * The colour of an effect's name in tooltips per category, as the game's `MobEffectCategory`
 * formats it: blue for beneficial and neutral, red for harmful (verify in game).
 */
export const CATEGORY_NAME_COLOURS: Readonly<Record<string, string>> = Object.freeze({
  beneficial: '#5555ff',
  harmful: '#ff5555',
  neutral: '#5555ff',
});

/** A new stat change: 10 % faster movement per level, as a starting point. */
export const NEW_MODIFIER: Readonly<{ attribute: string; amount: number; operation: string }> =
  Object.freeze({
    attribute: 'minecraft:movement_speed',
    amount: 0.1,
    operation: 'add_multiplied_total',
  });

/** The default tick interval of `msm:on_tick` (`OnEffectTick.interval_ticks`). */
export const DEFAULT_TICK_INTERVAL = 20;

/** Where an effect's icon lives: its namespace, its path in the namespace and the asset path. */
export function effectIconPath(effectId: string): {
  namespace: string;
  path: string;
  assetPath: string;
} {
  const colon = effectId.indexOf(':');
  const namespace = colon < 0 ? 'minecraft' : effectId.slice(0, colon);
  const path = `textures/mob_effect/${effectId.slice(colon + 1)}.png`;
  return { namespace, path, assetPath: `assets/${namespace}/${path}` };
}

/** Whether the project has the icon texture of effect `effectId`. */
export function hasEffectIcon(project: Project, effectId: string): boolean {
  const { namespace, path } = effectIconPath(effectId);
  return (
    project.namespaces
      .find((entry) => entry.name === namespace)
      ?.assets.some((asset) => asset.path === path) ?? false
  );
}

/** The name shown for an effect: its `display_name`, else its path made readable. */
export function effectDisplayName(element: Element): string {
  const name = asObject(element.data).display_name;
  if (typeof name === 'string' && name.trim() !== '') return name;
  return humanise(element.id);
}

/** The tooltip colour of `category`'s name; beneficial's for an unknown category. */
export function categoryColour(category: Json | undefined): string {
  return (
    (typeof category === 'string' ? CATEGORY_NAME_COLOURS[category] : undefined) ??
    (CATEGORY_NAME_COLOURS.beneficial as string)
  );
}

/** A number without trailing float noise (`0.30000000000000004` is `0.3`). */
function tidy(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * One stat change at `level` (1 is level I) in words: the attribute, then the amount times
 * the level, as vanilla scales it; percentages for the multiplying operations.
 */
export function modifierSummary(modifier: Json, level: number): string {
  const entry = asObject(modifier);
  const attribute = typeof entry.attribute === 'string' ? humanise(entry.attribute) : '(no stat)';
  const amount = typeof entry.amount === 'number' ? entry.amount * level : 0;
  const sign = amount < 0 ? '-' : '+';
  const magnitude = Math.abs(amount);
  switch (entry.operation) {
    case 'add_multiplied_base':
      return `${attribute} ${sign}${tidy(magnitude * 100)}% of base`;
    case 'add_multiplied_total':
      return `${attribute} ${sign}${tidy(magnitude * 100)}%`;
    default:
      return `${attribute} ${sign}${tidy(magnitude)}`;
  }
}

/**
 * Ticks between two `msm:on_tick` firings at `level` (1 is level I), as the runtime counts
 * them (ADR 0055 D3): `interval_ticks` (default 20), divided by the level when
 * `faster_per_level` is set, at least 1. `undefined` without a tick trigger.
 */
export function tickInterval(onTick: Json | undefined, level: number): number | undefined {
  if (onTick === undefined) return undefined;
  const tick = asObject(onTick);
  const interval =
    typeof tick.interval_ticks === 'number' && tick.interval_ticks >= 1
      ? Math.floor(tick.interval_ticks)
      : DEFAULT_TICK_INTERVAL;
  return tick.faster_per_level === true ? Math.max(1, Math.floor(interval / level)) : interval;
}
