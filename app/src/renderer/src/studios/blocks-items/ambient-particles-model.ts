/**
 * Pure helpers of the Block Studio's "Ambient particles" section (ADR 0081 D2; format
 * `msm:ambient_particles`, ADR 0080 D6): which block types take it (every type but `portal`),
 * a new component, "Where" (centre, top or the whole block as `offset` and `spread`), and the
 * "Only when" state rows. No React, no session.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { isJsonObject } from '../../forms/pointer';

type JsonObject = { [key: string]: Json };

/** The component's path in a block's data. */
export const AMBIENT_PATH: readonly string[] = Object.freeze([
  'components',
  'msm:ambient_particles',
]);

/** Whether a block of `type` takes ambient particles (a portal has its own `particles`). */
export function takesAmbientParticles(type: string | undefined): boolean {
  return type !== 'portal';
}

/** A new component: the project's first particle, or an empty id for the user to fill. */
export function newAmbientParticles(projectParticles: readonly string[]): JsonObject {
  return { particle: projectParticles[0] ?? '' };
}

/** Where the particles appear, as `offset` and `spread` presets. */
export type AmbientWhere = 'centre' | 'top' | 'whole' | 'custom';

/** The presets offered by "Where", in order. */
export const AMBIENT_WHERE: readonly AmbientWhere[] = Object.freeze([
  'centre',
  'top',
  'whole',
  'custom',
]);

/** "Where" in the section's words. */
export const AMBIENT_WHERE_LABELS: Readonly<Record<AmbientWhere, string>> = Object.freeze({
  centre: 'Centre',
  top: 'Top',
  whole: 'Whole block',
  custom: 'Custom (offset and spread below)',
});

type Triple = readonly [number, number, number];

/** The `offset` and `spread` each preset writes (`undefined`: the default). */
const PRESETS: Readonly<
  Record<Exclude<AmbientWhere, 'custom'>, { offset?: Triple; spread?: Triple }>
> = Object.freeze({
  centre: { spread: [0, 0, 0] },
  top: { offset: [0.5, 1, 0.5], spread: [0.5, 0, 0.5] },
  whole: {},
});

/** The component's defaults (ADR 0080 D6). */
export const DEFAULT_OFFSET: Triple = [0.5, 0.5, 0.5];
export const DEFAULT_SPREAD: Triple = [0.5, 0.5, 0.5];

/** The triple at `value`, or `fallback` when it is not three numbers. */
export function tripleOf(value: Json | undefined, fallback: Triple): Triple {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number')
    ? (value as unknown as Triple)
    : fallback;
}

function same(a: Triple, b: Triple): boolean {
  return a.every((value, index) => value === b[index]);
}

/** The "Where" of a component from its `offset` and `spread`. */
export function ambientWhere(component: Json | undefined): AmbientWhere {
  const object = isJsonObject(component) ? component : {};
  const offset = tripleOf(object.offset, DEFAULT_OFFSET);
  const spread = tripleOf(object.spread, DEFAULT_SPREAD);
  for (const key of ['centre', 'top', 'whole'] as const) {
    const preset = PRESETS[key];
    if (
      same(offset, preset.offset ?? DEFAULT_OFFSET) &&
      same(spread, preset.spread ?? DEFAULT_SPREAD)
    ) {
      return key;
    }
  }
  return 'custom';
}

/** The component with `where` applied (`custom` keeps the current numbers). */
export function withAmbientWhere(component: Json | undefined, where: AmbientWhere): JsonObject {
  const { offset, spread, ...rest } = isJsonObject(component) ? component : {};
  if (where === 'custom') {
    return {
      ...rest,
      offset: offset ?? [...DEFAULT_OFFSET],
      spread: spread ?? [...DEFAULT_SPREAD],
    };
  }
  const preset = PRESETS[where];
  return {
    ...rest,
    ...(preset.offset === undefined ? {} : { offset: [...preset.offset] }),
    ...(preset.spread === undefined ? {} : { spread: [...preset.spread] }),
  };
}

/**
 * A triple field after setting `axis` to `next`: `undefined` (the default) once it equals
 * `fallback`.
 */
export function tripleWith(
  current: Json | undefined,
  axis: number,
  next: number,
  fallback: Triple,
): Json | undefined {
  const parts = [...tripleOf(current, fallback)];
  parts[axis] = next;
  return same(parts as unknown as Triple, fallback) ? undefined : parts;
}

/** One "Only when" row: a block state property and the value it must have. */
export interface StateRow {
  property: string;
  value: string;
}

/** The rows of `states`, in written order. */
export function stateRows(component: Json | undefined): StateRow[] {
  const states = isJsonObject(component) ? component.states : undefined;
  if (!isJsonObject(states)) return [];
  return Object.entries(states).map(([property, value]) => ({
    property,
    value: typeof value === 'string' ? value : String(value),
  }));
}

/** `states` of `rows` (rows without a property are left out); `undefined` with none. */
export function statesOf(rows: readonly StateRow[]): Json | undefined {
  const out: JsonObject = {};
  for (const row of rows) {
    const property = row.property.trim();
    if (property !== '') out[property] = row.value.trim();
  }
  return Object.keys(out).length === 0 ? undefined : out;
}
