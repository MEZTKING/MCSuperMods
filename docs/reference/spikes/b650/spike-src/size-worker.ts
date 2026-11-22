import { buildIndex, DEFAULT_OPTIONS, type Index } from './engine.ts';

let index: Index | undefined;
self.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === 'build') index = buildIndex(msg.entries, msg.vocab, new Set(msg.protect), DEFAULT_OPTIONS);
  else self.postMessage(index?.search(msg.text, 'easy', 20).hits.map((h) => ({ id: h.entry.id, score: h.score })));
};
