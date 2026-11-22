/**
 * Functions in Try it (ADR 0120 D8; B601 stub, B606 fills it): run a function line by line, the
 * load and tick tags, and the 10,000-command cap of a tick.
 */

import type { SimLog } from '../types.js';

/** The most commands one tick may run (ADR 0120 D8). */
export const TICK_COMMAND_CAP = 10_000;

/**
 * Runs a function (B606). Stub: says it is only in the game, as Try it does today, and runs
 * nothing.
 */
export function runFunction(id: string, log: SimLog): void {
  log.onlyInMinecraft(`The function ${id} (not yet: Try it does not run functions)`);
}
