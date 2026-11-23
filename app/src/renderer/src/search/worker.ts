/**
 * The search worker (ADR 0124 D3; B660): a Vite module worker in its own chunk, made by
 * `client.ts`. It wires the host (`host.ts`, the only module that imports `@msm/search` at run
 * time) to the worker's messages: build, patch, context, query and cancel in, answers and build
 * timings out. Nothing here runs outside a worker; tests drive `createSearchHost` directly.
 *
 * @packageDocumentation
 */

import type { SearchInbound, SearchOutbound } from './client';
import { createSearchHost } from './host';

interface WorkerScope {
  postMessage(message: SearchOutbound): void;
  onmessage: ((event: { data: SearchInbound }) => void) | null;
}

// Wired only inside a worker.
if (typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined') {
  const scope = globalThis as unknown as WorkerScope;
  const host = createSearchHost((message) => scope.postMessage(message));
  scope.onmessage = (event) => host.receive(event.data);
}
