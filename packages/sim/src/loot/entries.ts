/**
 * Pool entries (B605): a pool expands its entries into candidates (their conditions tried then),
 * then picks one candidate by weight for each roll (B600 2S1, observed): `alternatives` keeps the
 * first child that passes, `group` every child that passes, `sequence` children until one
 * fails; a `tag` entry with `expand` gives one candidate per member, without it one candidate
 * giving every member; a `loot_table` entry is one candidate that rolls the other table (a list
 * of tables follows the tag rule, about right). `dynamic` and `slots` need a block entity or a
 * container: they stay candidates (so the others' odds are right) and are reported when picked.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import { applyModifier } from './functions.js';
import {
  asNumber,
  asObject,
  check,
  fullId,
  idList,
  type LootFidelity,
  type RollState,
  report,
  tainted,
  typeName,
  use,
  type WorkStack,
} from './state.js';

/** Every pool entry type the evaluator knows, with how close it is to the game. */
export const LOOT_ENTRY_SUPPORT: Readonly<Record<string, LootFidelity>> = {
  alternatives: 'checked',
  dynamic: 'only_in_game',
  empty: 'checked',
  group: 'checked',
  item: 'checked',
  loot_table: 'checked',
  sequence: 'checked',
  slots: 'only_in_game',
  tag: 'checked',
};

/** Rolls a nested table into `out` (given by `table.ts`, to keep the modules apart). */
export type NestedRoll = (state: RollState, table: Json, path: string, out: WorkStack[]) => void;

/** One candidate of a pool roll. */
export interface Candidate {
  readonly entry: JsonObject;
  readonly path: string;
  /** Its conditions (or a parent's) answered unknown. */
  readonly uncertain: boolean;
  /** Makes its stacks, the entry's modifier applied. */
  readonly make: (state: RollState) => WorkStack[];
}

/** The weight of a candidate: weight + quality x luck, whole and at least 0. */
export function candidateWeight(candidate: Candidate, luck: number): number {
  const weight = asNumber(candidate.entry.weight) ?? 1;
  const quality = asNumber(candidate.entry.quality) ?? 0;
  return Math.max(0, Math.floor(weight + quality * luck));
}

/**
 * Expands an entry into candidates; answers whether it passed (for the composite entries).
 * `inherited` is true when a parent's condition answered unknown.
 */
export function expandEntry(
  state: RollState,
  value: Json,
  path: string,
  out: Candidate[],
  roll: NestedRoll,
  inherited = false,
): boolean {
  const entry = asObject(value);
  if (!entry) {
    report(state, 'entry', 'not an object', path, 'not_supported');
    return false;
  }
  let passed = true;
  const unknown =
    tainted(state, () => {
      passed = check(state, entry.condition, `${path}/condition`);
    }) || inherited;
  if (!passed) return false;
  const type = typeName(entry.type);
  const fidelity = LOOT_ENTRY_SUPPORT[type];
  if (fidelity) use(state, 'entry', type, fidelity);
  const push = (make: (state: RollState) => WorkStack[]): void => {
    out.push({
      entry,
      path,
      uncertain: unknown,
      make: (s) => {
        const stacks = make(s);
        applyModifier(s, entry.modifier, stacks, `${path}/modifier`);
        return stacks;
      },
    });
  };
  const stack = (id: string): WorkStack => ({ id, count: 1, uncertain: false });
  switch (type) {
    case 'item': {
      const name = typeof entry.name === 'string' ? fullId(entry.name) : '';
      push(() => (name ? [stack(name)] : []));
      return true;
    }
    case 'empty':
      push(() => []);
      return true;
    case 'tag': {
      const members = idList(state, 'item', entry.items, `${path}/items`);
      if (entry.expand === true) for (const id of members) push(() => [stack(id)]);
      else push(() => members.map(stack));
      return true;
    }
    case 'loot_table': {
      const tables = Array.isArray(entry.value) ? entry.value : [entry.value ?? null];
      const rollAll = (list: readonly Json[], at: (i: number) => string) => (s: RollState) => {
        const made: WorkStack[] = [];
        for (const [i, table] of list.entries()) roll(s, table, at(i), made);
        return made;
      };
      const at = (i: number): string =>
        Array.isArray(entry.value) ? `${path}/value/${i}` : `${path}/value`;
      if (Array.isArray(entry.value) && entry.expand === true) {
        for (const [i, table] of tables.entries()) push(rollAll([table], () => at(i)));
      } else {
        push(rollAll(tables, at));
      }
      return true;
    }
    case 'alternatives':
    case 'group':
    case 'sequence': {
      const children = Array.isArray(entry.children) ? entry.children : [];
      // A composite's own `modifier` (the format allows one) runs after each child's.
      const mine: Candidate[] = entry.modifier === undefined ? out : [];
      let answer = type !== 'alternatives';
      for (const [i, child] of children.entries()) {
        const ok = expandEntry(state, child, `${path}/children/${i}`, mine, roll, unknown);
        if (type === 'alternatives' && ok) {
          answer = true;
          break;
        }
        if (type === 'sequence' && !ok) {
          answer = false;
          break;
        }
      }
      if (mine !== out) {
        for (const candidate of mine) {
          out.push({
            ...candidate,
            make: (s) => {
              const stacks = candidate.make(s);
              applyModifier(s, entry.modifier, stacks, `${path}/modifier`);
              return stacks;
            },
          });
        }
      }
      return answer;
    }
    case 'dynamic':
    case 'slots':
      push((s) => {
        report(s, 'entry', type, path, 'needs_world');
        return [];
      });
      return true;
    default:
      push((s) => {
        report(s, 'entry', type || 'no type', path, 'not_supported');
        return [];
      });
      return true;
  }
}
