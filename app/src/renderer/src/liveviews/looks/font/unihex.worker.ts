/**
 * The font worker (B624): reads a `unihex` zip and answers the glyphs a typed line needs
 * (`unihex.ts`), off the main thread, as the live views worker does its rolls. A Vite module
 * worker in its own chunk, loaded by `unihex-client.ts` with `?worker` only when a font names a
 * `unihex` provider.
 */

import { createUnihexHost, type UnihexAnswer, type UnihexRequest } from './unihex';

interface WorkerScope {
  postMessage(message: UnihexAnswer): void;
  onmessage: ((event: MessageEvent<UnihexRequest>) => void) | null;
}

// Wired only inside a worker; tests call `createUnihexHost` in this thread.
if (typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined') {
  const scope = globalThis as unknown as WorkerScope;
  const answer = createUnihexHost();
  scope.onmessage = (event) => scope.postMessage(answer(event.data));
}
