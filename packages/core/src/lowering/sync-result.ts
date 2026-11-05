/**
 * A guard for call sites that need a contribution function's result synchronously (ADR 0036).
 *
 * @packageDocumentation
 */

import type { MaybePromise } from '@msm/plugin-api';
import { isPromiseLike } from './lower-project';

/**
 * Thrown by {@link requireSyncResult} when a contribution function returned a Promise where
 * the caller needs a value at once.
 */
export class AsyncResultError extends Error {
  /**
   * @param what - What returned the Promise, for example `kind "sample:greeting" lower`.
   */
  constructor(what: string) {
    super(`${what} returned a Promise, but this step needs its result synchronously.`);
    this.name = 'AsyncResultError';
  }
}

/**
 * Returns the value a contribution function (`lower`, `data`, `build`, `validate`) returned,
 * or throws {@link AsyncResultError} when it returned a Promise. Built-in plugins always
 * return values; a host step that cannot wait (a render-time preview, a synchronous check)
 * uses this guard and reports the error, while the steps that can wait await the result
 * (for lowering, {@link lowerProjectAsync}). A rejected Promise is observed, so it never
 * surfaces as an unhandled rejection.
 *
 * @param value - The function's result.
 * @param what - What produced it, for the error message.
 * @returns The value.
 * @throws {@link AsyncResultError} If `value` is a Promise.
 */
export function requireSyncResult<T>(value: MaybePromise<T>, what: string): T {
  if (isPromiseLike(value)) {
    Promise.resolve(value).catch(() => undefined);
    throw new AsyncResultError(what);
  }
  return value;
}
