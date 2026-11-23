/**
 * A potion's colour as the game mixes it (B625): each effect that shows particles adds its
 * effect's colour, weighted by its level (amplifier + 1); the sum is divided by the total weight
 * per channel, in whole numbers. With no such effect the bottle keeps the item definition's
 * `default` tint. A project effect's colour is its `msm:effect` element's `color`; Minecraft's
 * own effects keep their colours in the game's code, not in any file, so they are named and left
 * out of the mix rather than guessed.
 */

import type { Json, Project } from '@msm/plugin-api';

/** The item definition's default potion tint in both targets' jars (`-13083194`). */
export const DEFAULT_POTION_TINT = 0x385dc6;

/** The kind of project effects. */
const EFFECT_KIND = 'msm:effect';

type JsonObject = { [key: string]: Json };
const asObject = (value: Json | undefined): JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};

const full = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

/** What {@link potionColour} found. */
export interface PotionColour {
  /** The mixed colour, `0xRRGGBB`, or `null` when no effect's colour is known. */
  readonly colour: number | null;
  /** The effects that coloured it (project effects). */
  readonly mixed: readonly string[];
  /** The effects whose colour only the game knows (Minecraft's own, or a missing one). */
  readonly unknown: readonly string[];
  /** Whether some effect shows particles at all (else the bottle keeps its default tint). */
  readonly anyVisible: boolean;
}

/** The colour of the project's effect `id`, or `undefined` when it is not a project effect. */
export function projectEffectColour(project: Project, id: string): number | undefined {
  const wanted = full(id);
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind !== EFFECT_KIND || full(element.id) !== wanted) continue;
      const colour = asObject(element.data).color;
      return typeof colour === 'number' ? colour : undefined;
    }
  }
  return undefined;
}

/** The potion's colour from its data's `effects`; see the module comment. */
export function potionColour(project: Project, data: Json | undefined): PotionColour {
  const effects = asObject(data).effects;
  let red = 0;
  let green = 0;
  let blue = 0;
  let total = 0;
  const mixed: string[] = [];
  const unknown: string[] = [];
  let anyVisible = false;
  for (const raw of Array.isArray(effects) ? effects : []) {
    const effect = asObject(raw);
    if (effect.show_particles === false) continue;
    if (typeof effect.id !== 'string' || effect.id === '') continue;
    anyVisible = true;
    const colour = projectEffectColour(project, effect.id);
    if (colour === undefined) {
      if (!unknown.includes(effect.id)) unknown.push(effect.id);
      continue;
    }
    const weight = (typeof effect.amplifier === 'number' ? Math.max(0, effect.amplifier) : 0) + 1;
    red += weight * ((colour >> 16) & 0xff);
    green += weight * ((colour >> 8) & 0xff);
    blue += weight * (colour & 0xff);
    total += weight;
    if (!mixed.includes(effect.id)) mixed.push(effect.id);
  }
  const colour =
    total === 0
      ? null
      : (Math.floor(red / total) << 16) |
        (Math.floor(green / total) << 8) |
        Math.floor(blue / total);
  return { colour, mixed, unknown, anyVisible };
}
