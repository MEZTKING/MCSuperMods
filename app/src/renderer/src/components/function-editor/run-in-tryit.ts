/**
 * **Run in Try it** (B613, ADR 0120 D8): from the Function editor to Try it, which then runs the
 * function at the player. The element is left (as the Try it button does), Try it opens, and the
 * run waits here until Try it's area has the project's files as they are now: the area takes it
 * (`tryit/session-source.ts` `TryItArea`) after its next files and runs it at its next tick, once
 * the load functions have run, as the game runs `/function` after `/reload`.
 *
 * Light on purpose: the shell's stores only, so the editor does not load the simulation.
 *
 * @packageDocumentation
 */

import { useUiStore } from '../../store/ui-store';
import { useTryItStore } from '../../tryit/tryit-store';

/** A function Try it is asked to run. */
export interface FunctionRunRequest {
  readonly id: string;
  /** Macro values as the game's `/function` takes them (`{n:7,item:"emerald"}`), if any. */
  readonly values?: string;
}

let waiting: FunctionRunRequest[] = [];

/** Asks Try it to run a function and opens it. */
export function runInTryIt(id: string, values?: string): void {
  const trimmed = values?.trim() ?? '';
  waiting.push(trimmed === '' ? { id } : { id, values: trimmed });
  useUiStore.getState().select(null);
  useTryItStore.getState().openView();
}

/** The runs asked for and not taken yet, oldest first; they are taken (Try it's area). */
export function takeFunctionRuns(): FunctionRunRequest[] {
  const taken = waiting;
  waiting = [];
  return taken;
}
