/**
 * Pure helpers of the Entity Studio (B118) for `msm:entity` element data (ADR 0028): the six
 * AI goal types of format v1 with their fields and runtime defaults, new goals and spawns,
 * and the project's geo models, animation sets, animation names and textures that the
 * pickers offer. No React, no session.
 *
 * The goal table is a fact of the MSM format, which is version-independent (it lives in
 * `@msm/schemas`, not in a target); vanilla choices (categories, placements, heightmaps,
 * rules) are read from the schema.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import { asObject } from '../blocks-items/blocks-items-model';

type JsonObject = { [key: string]: Json };

/** The kind ids the Studio reads. */
export const GEO_MODEL_KIND = 'msm:geo_model';
export const ANIMATION_KIND = 'msm:animation';

/** One field of an AI goal. */
export interface GoalField {
  key: string;
  label: string;
  /** `float`: a number; `bool`: a checkbox; `ids`: a list of entity type ids. */
  type: 'float' | 'bool' | 'ids';
  /** The value the runtime uses when the field is absent (ADR 0028). */
  defaultValue?: Json;
  /** Whether the field must be set (the `ids` lists of `flee` and `follow`). */
  required?: boolean;
}

/** One AI goal type of format v1. */
export interface GoalSpec {
  type: string;
  label: string;
  fields: readonly GoalField[];
}

/** The six goal types of format v1 with their fields and defaults (ADR 0028 D3). */
export const GOALS: readonly GoalSpec[] = Object.freeze([
  {
    type: 'wander',
    label: 'Wander',
    fields: [
      { key: 'speed', label: 'Speed', type: 'float', defaultValue: 1 },
      { key: 'avoid_water', label: 'Avoid water', type: 'bool', defaultValue: true },
    ],
  },
  {
    type: 'look_at_player',
    label: 'Look at player',
    fields: [{ key: 'distance', label: 'Distance', type: 'float', defaultValue: 8 }],
  },
  { type: 'look_around', label: 'Look around', fields: [] },
  {
    type: 'melee_attack',
    label: 'Melee attack',
    fields: [
      { key: 'speed', label: 'Speed', type: 'float', defaultValue: 1 },
      { key: 'targets', label: 'Targets', type: 'ids' },
      { key: 'must_see', label: 'Target must be in sight', type: 'bool', defaultValue: true },
      { key: 'retaliate', label: 'Fights back when hurt', type: 'bool', defaultValue: false },
    ],
  },
  {
    type: 'flee',
    label: 'Flee',
    fields: [
      { key: 'from', label: 'Runs from', type: 'ids', required: true },
      { key: 'distance', label: 'Distance', type: 'float', defaultValue: 6 },
      { key: 'speed', label: 'Speed', type: 'float', defaultValue: 1 },
      { key: 'sprint_speed', label: 'Sprint speed', type: 'float', defaultValue: 1.2 },
    ],
  },
  {
    type: 'follow',
    label: 'Follow',
    fields: [
      { key: 'entities', label: 'Follows', type: 'ids', required: true },
      { key: 'speed', label: 'Speed', type: 'float', defaultValue: 1 },
      { key: 'stop_distance', label: 'Stop distance', type: 'float', defaultValue: 2 },
      { key: 'range', label: 'Range', type: 'float', defaultValue: 16 },
    ],
  },
] satisfies GoalSpec[]);

/** The spec of goal `type`, or `undefined` for an unknown type. */
export function goalSpec(type: Json | undefined): GoalSpec | undefined {
  return GOALS.find((spec) => spec.type === type);
}

/** The id lists a new goal starts with: players, the common choice. */
const NEW_GOAL_IDS: readonly string[] = Object.freeze(['minecraft:player']);

/**
 * A new goal of `type`: the type plus `minecraft:player` in its entity list (`targets`,
 * `from` or `entities`), so a fresh goal is valid and does something. Other fields stay
 * absent, so the runtime defaults apply.
 */
export function newGoal(type: string): JsonObject {
  const goal: JsonObject = { type };
  for (const field of goalSpec(type)?.fields ?? []) {
    if (field.type === 'ids') goal[field.key] = [...NEW_GOAL_IDS];
  }
  return goal;
}

/** The goals of `data` (`components.msm:ai_goals.goals`), or `[]`. */
export function goalsOf(data: Json | undefined): Json[] {
  const goals = asObject(asObject(asObject(data).components)['msm:ai_goals']).goals;
  return Array.isArray(goals) ? goals : [];
}

/** The natural spawn a new "Spawns naturally" tick writes: overworld biomes, weight 10, 1–3. */
export function newSpawn(): JsonObject {
  return { biomes: ['#minecraft:is_overworld'], weight: 10, min_group: 1, max_group: 3 };
}

/** The ids of the project's elements of `kind`, sorted. */
export function elementIdsOfKind(project: Project, kind: string): string[] {
  return project.namespaces
    .flatMap((namespace) => namespace.elements)
    .filter((element) => element.kind === kind)
    .map((element) => element.id)
    .sort();
}

/** The project element with id `id` and kind `kind`, or `undefined`. */
function elementOf(project: Project, id: string, kind: string): Element | undefined {
  for (const namespace of project.namespaces) {
    const found = namespace.elements.find((entry) => entry.id === id && entry.kind === kind);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * The animation names of the `msm:animation` element `id` (the keys of its `animations`), in
 * file order; `[]` when there is no such element.
 */
export function animationNames(project: Project, id: Json | undefined): string[] {
  if (typeof id !== 'string' || id === '') return [];
  const element = elementOf(project, id, ANIMATION_KIND);
  return element === undefined ? [] : Object.keys(asObject(asObject(element.data).animations));
}

/**
 * The texture ids of the project's PNG assets under `textures/`: `assets/<ns>/textures/a/b.png`
 * is `<ns>:a/b`. Sorted.
 */
export function projectTextureIds(project: Project): string[] {
  const out: string[] = [];
  for (const namespace of project.namespaces) {
    for (const asset of namespace.assets) {
      if (!asset.path.startsWith('textures/') || !asset.path.endsWith('.png')) continue;
      out.push(`${namespace.name}:${asset.path.slice('textures/'.length, -'.png'.length)}`);
    }
  }
  return out.sort();
}
