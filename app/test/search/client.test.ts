/**
 * The search client (B660): answers come back whole from slim hits, the newest query wins, and
 * the engine moves to the main thread when no worker can be made or the worker fails to load,
 * with everything sent so far sent again.
 */

import type { SearchEntry } from '@msm/search';
import { describe, expect, it } from 'vitest';
import {
  SearchClient,
  type SearchInbound,
  type SearchOutbound,
  type SearchResult,
  type SearchWorkerLike,
  type StaticSpec,
} from '../../src/renderer/src/search/client';
import { createSearchHost } from '../../src/renderer/src/search/host';

const entry = (id: string, title: string, words: string[] = []): SearchEntry => ({
  id,
  source: 'flow',
  title,
  words,
  available: true,
  action: { type: 'flow', starter: id },
  preview: { type: 'flow', starter: id },
});

const SPEC: StaticSpec = {
  targetId: 'test',
  entries: [
    entry('flow:lamp', 'Glowing lamp', ['light']),
    entry('flow:boat', 'Rowing boat', ['water']),
    entry('flow:kite', 'Paper kite', ['sky']),
  ],
  vocabulary: [],
  protect: [],
  plugins: [],
  flows: {},
};

/** The first hit of an answer: a Best match, else the first row of the first section. */
const first = (answer: SearchResult | null): SearchEntry | undefined =>
  (answer?.best[0] ?? answer?.sections[0]?.hits[0])?.entry;

/** A worker double running a real host a turn later, as a worker would. */
function inProcessWorker(sent: SearchInbound[] = []): SearchWorkerLike {
  const worker: SearchWorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(message) {
      sent.push(message);
      setTimeout(() => host.receive(structuredClone(message)), 0);
    },
    terminate() {
      worker.onmessage = null;
    },
  };
  const host = createSearchHost((message) =>
    setTimeout(() => worker.onmessage?.({ data: structuredClone(message) }), 0),
  );
  return worker;
}

describe('the search client', () => {
  it('answers with whole hits from the entries it sent', async () => {
    const client = new SearchClient({ createWorker: () => inProcessWorker() });
    client.setStatic(SPEC);
    const result = await client.query({ text: 'lamp', mode: 'easy' });
    expect(client.where).toBe('worker');
    expect(first(result)).toEqual(SPEC.entries[0]);
    expect(typeof result?.ms).toBe('number');
    expect(client.entry('flow:boat')?.title).toBe('Rowing boat');
    client.dispose();
  });

  it('lets the newest query win and cancels the older', async () => {
    const sent: SearchInbound[] = [];
    const client = new SearchClient({ createWorker: () => inProcessWorker(sent) });
    client.setStatic(SPEC);
    const older = client.query({ text: 'lamp', mode: 'easy' });
    const second = client.query({ text: 'boat', mode: 'easy' });
    expect(await older).toBeNull();
    const answer = await second;
    expect(first(answer)?.id).toBe('flow:boat');
    expect(sent.filter((message) => message.type === 'cancel')).toHaveLength(1);
    client.dispose();
  });

  it('answers on the main thread when no worker can be made', async () => {
    const client = new SearchClient({
      createWorker: () => {
        throw new Error('no workers here');
      },
    });
    client.setStatic(SPEC);
    const answer = await client.query({ text: 'kite', mode: 'easy' });
    expect(client.where).toBe('main');
    expect(first(answer)?.id).toBe('flow:kite');
    client.dispose();
  });

  it('sends everything again to the main thread when the worker fails to load', async () => {
    const received: SearchInbound[] = [];
    let failing: SearchWorkerLike | null = null;
    const client = new SearchClient({
      createWorker: () => {
        failing = {
          onmessage: null,
          onerror: null,
          postMessage: () => undefined,
          terminate: () => undefined,
        };
        return failing;
      },
      createFallback: async (post) => {
        const host = createSearchHost(post);
        return {
          receive(message) {
            received.push(message);
            host.receive(message);
          },
        };
      },
    });
    client.setStatic(SPEC);
    client.setLayer('project', [entry('project:element:a:raft', 'Log raft', ['water'])]);
    client.patchLayer('project', [entry('project:element:a:sled', 'Snow sled')], []);
    client.setContext({ inMod: ['flow:boat'] });
    const pending = client.query({ text: 'sled', mode: 'easy' });
    (failing as SearchWorkerLike | null)?.onerror?.(new Error('failed to load'));
    const answer = await pending;
    expect(client.where).toBe('main');
    expect(first(answer)?.id).toBe('project:element:a:sled');
    expect(received.map((message) => message.type)).toEqual([
      'static',
      'layer',
      'context',
      'query',
    ]);
    const layer = received[1] as Extract<SearchInbound, { type: 'layer' }>;
    expect(layer.entries.map((item) => item.id).sort()).toEqual([
      'project:element:a:raft',
      'project:element:a:sled',
    ]);
    client.dispose();
  });

  it('reports builds and resolves nothing after dispose', async () => {
    const client = new SearchClient({ createWorker: () => inProcessWorker() });
    const builds: string[] = [];
    client.onBuilt((built) => builds.push(`${built.layer}:${built.entries}`));
    client.setStatic(SPEC);
    await client.query({ text: 'boat', mode: 'easy' });
    expect(builds).toEqual(['static:3']);
    client.dispose();
    expect(await client.query({ text: 'boat', mode: 'easy' })).toBeNull();
  });

  it('drops hits whose entries it does not hold', async () => {
    const client = new SearchClient({
      createWorker: () => {
        const worker: SearchWorkerLike = {
          onmessage: null,
          onerror: null,
          postMessage(message) {
            if (message.type !== 'query') return;
            const reply: SearchOutbound = {
              type: 'answer',
              token: message.token,
              ms: 1,
              answer: {
                understood: { chips: [] },
                best: [
                  { id: 'flow:lamp', score: 2, why: [] },
                  { id: 'flow:gone', score: 1, why: [] },
                ],
                sections: [],
                confident: true,
              },
            };
            setTimeout(() => worker.onmessage?.({ data: reply }), 0);
          },
          terminate: () => undefined,
        };
        return worker;
      },
    });
    client.setStatic(SPEC);
    const answer = await client.query({ text: 'anything', mode: 'easy' });
    expect(answer?.best.map((hit) => hit.entry.id)).toEqual(['flow:lamp']);
    client.dispose();
  });
});
