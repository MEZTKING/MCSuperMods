/**
 * Block state changes, from mcmeta's `blocks.json` (block id without namespace to
 * `[properties: name -> values, defaults: name -> value]`).
 *
 * Blocks added and removed are not listed here: they are members of the `block` registry, so
 * the registry diff already has them (a removed block as `member-removed`, a new one as an
 * addition).
 *
 * @packageDocumentation
 */

import { makeChange, sortedStrings } from './change.ts';
import type { TargetChange } from './types.ts';

/** `blocks.json`. */
export type BlockStates = Record<string, [Record<string, string[]>, Record<string, string>]>;

/**
 * Diffs the states of the blocks present in both: a property added (`none`: its default
 * applies) or removed (`manual`), its values changed (`manual` when one went away), its
 * default changed (`manual`: a state written without that property now means another state).
 */
export function diffBlocks(before: BlockStates, after: BlockStates): TargetChange[] {
  const changes: TargetChange[] = [];
  for (const block of sortedStrings(Object.keys(before))) {
    const next = after[block];
    if (next === undefined) continue;
    const [propsA, defaultsA] = before[block] as BlockStates[string];
    const [propsB, defaultsB] = next;
    const base = { area: 'block-states', subject: block, source: 'blocks' } as const;
    for (const prop of sortedStrings(Object.keys(propsB))) {
      if (prop in propsA) continue;
      changes.push(
        makeChange({
          ...base,
          what: 'property-added',
          field: prop,
          to: [...(propsB[prop] ?? [])],
          handling: 'none',
        }),
      );
    }
    for (const prop of sortedStrings(Object.keys(propsA))) {
      const valuesA = propsA[prop] ?? [];
      const valuesB = propsB[prop];
      if (valuesB === undefined) {
        changes.push(
          makeChange({
            ...base,
            what: 'property-removed',
            field: prop,
            from: [...valuesA],
            handling: 'manual',
          }),
        );
        continue;
      }
      const lost = valuesA.some((v) => !valuesB.includes(v));
      const gained = valuesB.some((v) => !valuesA.includes(v));
      if (lost || gained) {
        changes.push(
          makeChange({
            ...base,
            what: 'values-changed',
            field: prop,
            from: [...valuesA],
            to: [...valuesB],
            handling: lost ? 'manual' : 'none',
          }),
        );
      } else if (defaultsA[prop] !== undefined && defaultsA[prop] !== defaultsB[prop]) {
        changes.push(
          makeChange({
            ...base,
            what: 'default-changed',
            field: prop,
            from: defaultsA[prop] as string,
            ...(defaultsB[prop] === undefined ? {} : { to: defaultsB[prop] }),
            handling: 'manual',
          }),
        );
      }
    }
  }
  return changes;
}
