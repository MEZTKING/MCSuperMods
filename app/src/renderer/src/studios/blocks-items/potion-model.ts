/**
 * Pure helpers of the Potion Studio (ADR 0063 D9): the registry ids a potion adds, its brewing
 * chain as readable steps, the item names it gets and the new potion "Make a potion" adds for
 * an effect. The lowering facts (variant ids, steps, names) come from the plugin's package
 * root, so the Studio shows exactly what the export writes. No React, no session.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project, ResourceLocation } from '@msm/core';
import type { JsonObject } from '@msm/plugin-api';
import {
  type BrewingStep,
  DEFAULT_BREWING_BASE,
  DEFAULT_LONG_REAGENT,
  DEFAULT_STRONG_REAGENT,
  potionBrewingSteps,
  potionName,
  potionNameKeys,
  potionVariantIds,
} from '@msm/plugin-blocks-items';
import { humanise } from '../worldgen/worldgen-model';
import { asObject, EFFECT_KIND } from './blocks-items-model';
import { effectDisplayName } from './effect-model';

/** Kind id of potions (ADR 0063 D1). */
export const POTION_KIND = 'msm:potion';

export { DEFAULT_BREWING_BASE, DEFAULT_LONG_REAGENT, DEFAULT_STRONG_REAGENT };

/** The most effects a potion may have (`effects @ 1..8`). */
export const MAX_POTION_EFFECTS = 8;

/** Ticks per second. */
export const TICKS_PER_SECOND = 20;

/** The duration of a new effect row and of a potion "Make a potion" adds: 3 minutes. */
export const NEW_EFFECT_DURATION = 3600;

/** The ingredient "Make a potion" picks when no other project potion uses it. */
export const MAKE_POTION_REAGENT = 'minecraft:amethyst_shard';

/** The words shown for each brewing bottle. */
export const BOTTLE_LABELS: Readonly<Record<BrewingStep['inputBottle'], string>> = Object.freeze({
  potion: 'Potion',
  splash_potion: 'Splash Potion',
  lingering_potion: 'Lingering Potion',
});

/** The registry ids of `element` (its own, `long_` and `strong_`), or its id when unreadable. */
export function potionIds(element: Element): string[] {
  try {
    return potionVariantIds(element);
  } catch {
    return [element.id];
  }
}

/** The brewing steps the export writes for `element`; none when its data is unreadable. */
export function brewingSteps(element: Element): BrewingStep[] {
  try {
    return potionBrewingSteps(element);
  } catch {
    return [];
  }
}

/** The name shown for a potion: its `display_name`, else its path made readable. */
export function potionDisplayName(element: Element): string {
  const name = asObject(element.data).display_name;
  if (typeof name === 'string' && name.trim() !== '') return name;
  return humanise(element.id);
}

/** The game name part of the potion (`name`, else `<ns>.<path>`); `''` when unreadable. */
export function potionNameKey(element: Element): string {
  try {
    return potionName(element);
  } catch {
    return '';
  }
}

/** The four item names (potion, splash, lingering, arrow) with their language keys. */
export function potionItemNames(element: Element): { key: string; text: string }[] {
  const name = potionNameKey(element);
  if (name === '') return [];
  return Object.entries(potionNameKeys(name, potionDisplayName(element))).map(([key, text]) => ({
    key,
    text: String(text),
  }));
}

/** A potion id in words: `minecraft:awkward` is "Awkward", a project id its path. */
function potionWords(id: string): string {
  return humanise(id);
}

/** One brewing step in words: "Potion (Awkward) + Amethyst Shard -> Potion (Frost Bite)". */
export function stepSummary(step: BrewingStep): { input: string; reagent: string; output: string } {
  return {
    input: `${BOTTLE_LABELS[step.inputBottle]} (${potionWords(step.input)})`,
    reagent: humanise(step.reagent.replace(/^#/, '')),
    output: `${BOTTLE_LABELS[step.outputBottle]} (${potionWords(step.output)})`,
  };
}

/** The duration of `ticks` in words: "3:00" (minutes and seconds) or "0.5 s". */
export function durationText(ticks: Json | undefined): string {
  if (typeof ticks !== 'number' || ticks <= 0) return '';
  const seconds = ticks / TICKS_PER_SECOND;
  if (seconds < 1) return `${seconds} s`;
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** The first effect's duration of potion data, or {@link NEW_EFFECT_DURATION}. */
export function firstDuration(data: Json | undefined): number {
  const effects = asObject(data).effects;
  const first = Array.isArray(effects) ? asObject(effects[0]).duration_ticks : undefined;
  return typeof first === 'number' && first >= 1 ? first : NEW_EFFECT_DURATION;
}

/** The `long` a newly ticked "Longer version" gets: twice the first effect's time. */
export function newLongVersion(data: Json | undefined): JsonObject {
  return { duration_ticks: firstDuration(data) * 2 };
}

/** The `strong` a newly ticked "Stronger version" gets: level II for half the time. */
export function newStrongVersion(data: Json | undefined): JsonObject {
  return { amplifier: 1, duration_ticks: Math.max(1, Math.floor(firstDuration(data) / 2)) };
}

/** Every id of the project's elements, of any kind. */
function elementIds(project: Project): Set<string> {
  return new Set(project.namespaces.flatMap((ns) => ns.elements.map((element) => element.id)));
}

/** The base and ingredient pairs project potions already brew from (`base|reagent`). */
function usedBrewingPairs(project: Project): Set<string> {
  const pairs = new Set<string>();
  for (const element of project.namespaces.flatMap((ns) => ns.elements)) {
    if (element.kind !== POTION_KIND) continue;
    const brewing = asObject(asObject(element.data).brewing);
    if (typeof brewing.reagent !== 'string') continue;
    const base = typeof brewing.base === 'string' ? brewing.base : DEFAULT_BREWING_BASE;
    pairs.add(`${base}|${brewing.reagent}`);
  }
  return pairs;
}

/**
 * The element "Make a potion" adds for `effect` (an `msm:effect` element): id
 * `<effect id>_potion` (or `_potion_2`, … when taken; element ids are unique across kinds),
 * the effect's display name, the effect for {@link NEW_EFFECT_DURATION} ticks and, when no
 * other project potion brews from it, an awkward potion plus {@link MAKE_POTION_REAGENT}.
 */
export function newPotionFor(
  project: Project,
  effect: Element,
): { id: ResourceLocation; kind: string; data: JsonObject } {
  if (effect.kind !== EFFECT_KIND) throw new Error(`${effect.id} is not a status effect.`);
  const taken = elementIds(project);
  let id = `${effect.id}_potion`;
  for (let n = 2; taken.has(id); n++) id = `${effect.id}_potion_${n}`;
  const data: JsonObject = {
    format: 1,
    display_name: effectDisplayName(effect),
    effects: [{ id: effect.id, duration_ticks: NEW_EFFECT_DURATION }],
  };
  if (!usedBrewingPairs(project).has(`${DEFAULT_BREWING_BASE}|${MAKE_POTION_REAGENT}`)) {
    data.brewing = { reagent: MAKE_POTION_REAGENT };
  }
  return { id: id as ResourceLocation, kind: POTION_KIND, data };
}

/** The ids of the project's potions and their versions, sorted. */
export function projectPotions(project: Project | null | undefined): string[] {
  if (project === null || project === undefined) return [];
  return project.namespaces
    .flatMap((namespace) => namespace.elements)
    .filter((element) => element.kind === POTION_KIND)
    .flatMap((element) => potionIds(element))
    .sort();
}
