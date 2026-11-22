/**
 * The live views worker (ADR 0120 D12; B601 stub, B608 builds it): a Vite module worker in its own
 * chunk, loaded by `client.ts` with `?worker`. The evaluators of `@msm/sim` (loot odds, tags,
 * predicates) will run here, so nothing heavy is sampled on the main thread. The stub answers
 * every request "not yet".
 */

import type { LiveViewAnswer, LiveViewRequest } from './client';

/** Answers one request (a function of the request, so a test can call it in Node). */
export function answerRequest(request: LiveViewRequest): LiveViewAnswer | null {
  return request.kind === 'cancel' ? null : { token: request.token, kind: 'not_yet' };
}

interface WorkerScope {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<LiveViewRequest>) => void) | null;
}

// Wired only inside a worker; tests import the module in Node and call `answerRequest`.
if (typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined') {
  const scope = globalThis as unknown as WorkerScope;
  scope.onmessage = (event) => {
    const answer = answerRequest(event.data);
    if (answer !== null) scope.postMessage(answer);
  };
}
