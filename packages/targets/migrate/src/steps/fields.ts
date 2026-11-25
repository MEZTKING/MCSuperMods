/**
 * The field steps: drop, move and set (ADR 0136 D3), applied to one element's data.
 *
 * @packageDocumentation
 */

import type { Json, MigrationDetail } from '@msm/plugin-api';
import type { FieldStep } from '../types';
import {
  expandPattern,
  isObject,
  type JsonObject,
  parsePointer,
  pointer,
  type Segment,
  valueAt,
} from '../walk';

/** What a field step did to one element. */
export interface FieldOutcome {
  /** The data after the step: the same object as given when nothing changed. */
  data: Json;
  details: MigrationDetail[];
  /** Moves that could not be made because the place they go to is taken, by pointer. */
  blocked: { path: string; to: string }[];
}

function sameJson(a: Json | undefined, b: Json | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Applies `step` to the data of an element of `kind`. `data` is cloned before the first change
 * (pass `owned` when the caller already holds a clone).
 */
export function applyFieldStep(
  step: FieldStep,
  kind: string,
  data: Json,
  owned: boolean,
): FieldOutcome {
  const outcome: FieldOutcome = { data, details: [], blocked: [] };
  let mine = owned;
  const writable = (): Json => {
    if (!mine) {
      outcome.data = structuredClone(outcome.data);
      mine = true;
    }
    return outcome.data;
  };
  for (const place of step.places) {
    if (place.kind !== kind) continue;
    for (const at of expandPattern(outcome.data, place.at)) {
      const target = valueAt(outcome.data, at);
      if (!isObject(target)) continue;
      if (step.op === 'drop') {
        if (!Object.hasOwn(target, step.field)) continue;
        const before = target[step.field] as Json;
        if (step.ifValue !== undefined && !sameJson(before, step.ifValue)) continue;
        delete (valueAt(writable(), at) as JsonObject)[step.field];
        outcome.details.push({
          op: 'drop',
          path: pointer([...at, step.field]),
          before,
          changeId: step.changeId,
        });
      } else if (step.op === 'set') {
        if (Object.hasOwn(target, step.field)) continue;
        (valueAt(writable(), at) as JsonObject)[step.field] = structuredClone(step.value);
        outcome.details.push({
          op: 'set',
          path: pointer([...at, step.field]),
          after: structuredClone(step.value),
          changeId: step.changeId,
        });
      } else {
        const from = parsePointer(step.from);
        const to = parsePointer(step.to);
        const fromParent = valueAt(target, from.slice(0, -1));
        const fromKey = from[from.length - 1];
        if (fromKey === undefined || !isObject(fromParent) || !Object.hasOwn(fromParent, fromKey)) {
          continue;
        }
        const toParent = valueAt(target, to.slice(0, -1));
        const toKey = to[to.length - 1];
        const fromPath: Segment[] = [...at, ...from];
        const toPath: Segment[] = [...at, ...to];
        if (toKey === undefined || !isObject(toParent) || Object.hasOwn(toParent, toKey)) {
          outcome.blocked.push({ path: pointer(fromPath), to: pointer(toPath) });
          continue;
        }
        const value = fromParent[fromKey] as Json;
        const root = writable();
        delete (valueAt(root, fromPath.slice(0, -1)) as JsonObject)[fromKey];
        (valueAt(root, toPath.slice(0, -1)) as JsonObject)[toKey] = value;
        outcome.details.push({
          op: 'move',
          path: pointer(toPath),
          from: pointer(fromPath),
          before: structuredClone(value),
          after: structuredClone(value),
          changeId: step.changeId,
        });
      }
    }
  }
  return outcome;
}
