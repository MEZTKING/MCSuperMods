/**
 * The working form of a template while a processor list runs over it (B638): one cell per template
 * block, `null` once a processor decided the block is not placed (the world's block stays, as the
 * spike B634 saw for `block_ignore`, `block_rot`, `protected_blocks` and the legacy element's air).
 * Also the reading of block states as processor data writes them: a string or `{ id, properties }`;
 * the spike found `{ Name, Properties }` refused by the game on both targets.
 */

import { isObject, propertiesOf, stateString } from '../../features/blocks';
import { withNamespace } from '../../registries';
import type { PieceRotation } from '../api';
import type { Vec3 } from '../boxes';
import { rotateVec, rotationIndex } from '../jigsaw';

/** One template block during processing. */
export interface Cell {
  /** The block's place in the template, before any turn. */
  readonly pos: Vec3;
  /** Its state as a sorted state string. */
  readonly state: string;
  readonly nbt?: unknown;
  /** How far `gravity` moved it up or down. */
  readonly dy: number;
}

/** The cells of a template; `null` for a block a processor left out. */
export type Cells = (Cell | null)[];

/** A state string in one form (namespaced id, properties sorted). */
export function normaliseState(state: string): string {
  const i = state.indexOf('[');
  return stateString(i === -1 ? state : state.slice(0, i), propertiesOf(state));
}

/** Thrown when a list writes a block state the game refuses; the whole list is refused. */
export class RefusedList extends Error {}

/**
 * A block state from processor data: a string (`minecraft:stone`, with or without properties) or
 * `{ id, properties }`. `{ Name, Properties }` is refused (spike B634); anything else is too.
 */
export function readProcessorState(value: unknown, where: string): string {
  if (typeof value === 'string' && value.length > 0) return normaliseState(withNamespace(value));
  if (isObject(value)) {
    if ('Name' in value && !('id' in value)) {
      throw new RefusedList(
        `The game refuses this list: ${where} writes a block state as { Name, Properties }; write it as a name or as { id, properties }.`,
      );
    }
    if (typeof value.id === 'string') {
      const props: Record<string, string> = {};
      if (isObject(value.properties)) {
        for (const [k, v] of Object.entries(value.properties)) props[k] = String(v);
      }
      return stateString(value.id, props);
    }
  }
  throw new RefusedList(`The game refuses this list: ${where} has no block state it can read.`);
}

/** Whether `state` matches `pattern`: the same block, and every property the pattern names equal. */
export function stateMatches(state: string, pattern: string): boolean {
  if (idOfState(state) !== idOfState(pattern)) return false;
  const want = propertiesOf(pattern);
  const have = propertiesOf(state);
  for (const [k, v] of Object.entries(want)) if (have[k] !== v) return false;
  return true;
}

/** The id of a state string. */
export function idOfState(state: string): string {
  const i = state.indexOf('[');
  return i === -1 ? state : state.slice(0, i);
}

/** Where a cell lands in the world. */
export function worldPos(cell: Cell, origin: Vec3, rotation: PieceRotation): Vec3 {
  const r = rotateVec(cell.pos, rotationIndex(rotation));
  return [origin[0] + r[0], origin[1] + r[1] + cell.dy, origin[2] + r[2]];
}

/** Whether a cell differs from what it was (left out, another state, other data, moved). */
export function cellChanged(before: Cell | null, after: Cell | null): boolean {
  if (before === after) return false;
  if (before === null || after === null) return true;
  return before.state !== after.state || before.nbt !== after.nbt || before.dy !== after.dy;
}

/** How many cells differ between two runs of the same template. */
export function countChanged(before: Cells, after: Cells): number {
  let n = 0;
  for (let i = 0; i < before.length; i += 1) {
    if (cellChanged(before[i] ?? null, after[i] ?? null)) n += 1;
  }
  return n;
}
