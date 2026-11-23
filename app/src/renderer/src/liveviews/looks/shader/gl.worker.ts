/**
 * The shader worker (ADR 0121 D8; B629): compiles shaders and runs a shader program or a post
 * effect on MSM's test picture on one OffscreenCanvas WebGL 2 context, off the main thread
 * (B619 3S9: one still frame, 18 to 554 ms under SwiftShader). A Vite module worker in its own
 * chunk, loaded by `gl-client.ts` with `?worker` only when a shader or post effect view opens.
 * A newer job stops the one running between passes.
 */

import { createGlHost, type GlAnswer, type GlJob } from './gl-jobs';

interface WorkerScope {
  postMessage(message: GlAnswer, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<GlJob>) => void) | null;
}

function context(): WebGL2RenderingContext | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const canvas = new OffscreenCanvas(1, 1);
  return canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    stencil: false,
  }) as WebGL2RenderingContext | null;
}

/** The pixel buffers of an answer, handed over rather than copied. */
function transfers(answer: GlAnswer): Transferable[] {
  if (!answer.webgl || !answer.run.ran) return [];
  return [answer.run.before.data.buffer, answer.run.after.data.buffer] as Transferable[];
}

// Wired only inside a worker; tests call `createGlHost` in this thread.
if (typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined') {
  const scope = globalThis as unknown as WorkerScope;
  const host = createGlHost(context);
  let running: { cancelled: boolean } | null = null;
  let chain: Promise<void> = Promise.resolve();
  scope.onmessage = (event) => {
    if (running !== null) running.cancelled = true;
    const cancel = { cancelled: false };
    running = cancel;
    chain = chain.then(async () => {
      const answer = await host(event.data, cancel);
      if (running === cancel) running = null;
      scope.postMessage(answer, transfers(answer));
    });
  };
}
