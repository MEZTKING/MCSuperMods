// B650 spike: the Web Worker side of the Electron run (bundled by esbuild into one file).
import { runBench } from './bench-core.ts';

self.onmessage = (e: MessageEvent) => {
  const t0 = performance.now();
  const input = e.data;
  const received = performance.now() - t0;
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  const out = runBench(input, mem ? () => mem.usedJSHeapSize : undefined);
  self.postMessage({ received, heapMB: mem ? +(mem.usedJSHeapSize / 1e6).toFixed(1) : null, ...out });
};
