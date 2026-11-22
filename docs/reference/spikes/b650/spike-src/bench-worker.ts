// B650 spike: the worker side of the round-trip measurement (Node worker_threads).
import { parentPort } from 'node:worker_threads';
import { buildIndex, DEFAULT_OPTIONS, type Index } from './engine.ts';

let index: Index | undefined;
parentPort?.on('message', (msg: { type: string; entries?: never; protect?: string[]; vocab?: { mobWords: string[] } & Record<string, never>; text?: string }) => {
  if (msg.type === 'build') {
    const t0 = performance.now();
    index = buildIndex(msg.entries as never, { ...(msg.vocab as never), mobWords: new Set(msg.vocab?.mobWords) }, new Set(msg.protect), { ...DEFAULT_OPTIONS, v1: true, typo: 'trigram' as const });
    parentPort?.postMessage({ hits: [], ms: 0, built: +(performance.now() - t0).toFixed(1) });
    return;
  }
  const t0 = performance.now();
  const a = index?.search(msg.text ?? '', 'easy', 20);
  parentPort?.postMessage({ hits: a?.hits ?? [], understood: a?.understood, ms: performance.now() - t0 });
});
