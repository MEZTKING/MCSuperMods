export async function start(): Promise<unknown> {
  const [{ default: Worker }, panel, vocab] = await Promise.all([import('./worker?worker'), import('./SearchPanel'), import('./vocab-2000')]);
  const w = new Worker();
  w.postMessage({ type: 'build', entries: [], vocab: vocab.VOCAB, protect: [] });
  return panel;
}
