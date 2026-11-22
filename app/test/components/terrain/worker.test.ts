import { describe, expect, it } from 'vitest';
import type { WorkerInbound, WorkerOutbound } from '../../../src/renderer/src/terrain/client';
import { createTerrainHost } from '../../../src/renderer/src/terrain/worker';
import { fakeEngine } from './fake-engine';

const FACTS = { dataFolders: [], approximate: [] } as const;
const REGION = { x0: 0, z0: 0, width: 64, depth: 64, step: 4 };

function world(token: number, hash: string, vanillaKey: string | null = null): WorkerInbound {
  return {
    type: 'world',
    token,
    filesHash: hash,
    spec: { project: {}, source: { dimension: 'demo:land' }, seed: '5', facts: FACTS },
    vanillaKey,
  };
}

function biomes(token: number, hash: string, pass: 'coarse' | 'fine'): WorkerInbound {
  return { type: 'biomes', token, filesHash: hash, pass, region: REGION };
}

function setUp() {
  const { engine, calls } = fakeEngine();
  const out: WorkerOutbound[] = [];
  const runs: (() => void)[] = [];
  const host = createTerrainHost(
    engine,
    (message) => out.push(message),
    (run) => runs.push(run),
  );
  const drain = (): void => {
    while (runs.length > 0) runs.shift()?.();
  };
  return { host, out, calls, drain };
}

describe('the terrain worker', () => {
  it('runs worlds first, then coarse passes, then fine ones', () => {
    const { host, out, drain } = setUp();
    host.receive(world(1, 'w1'));
    host.receive(biomes(2, 'w1', 'fine'));
    host.receive(biomes(3, 'w1', 'coarse'));
    drain();
    expect(
      out.map((m) => (m.type === 'answer' ? `${m.answer.token} ${m.answer.pass}` : m.type)),
    ).toEqual(['world', '3 coarse', '2 fine']);
  });

  it('a cancel drops the token’s queued passes', () => {
    const { host, out, drain, calls } = setUp();
    host.receive(world(1, 'w1'));
    host.receive(biomes(2, 'w1', 'coarse'));
    host.receive(biomes(2, 'w1', 'fine'));
    host.receive({ type: 'cancel', token: 2 });
    expect(host.queued).toBe(1);
    drain();
    expect(out.map((m) => m.type)).toEqual(['world']);
    expect(calls.filter((c) => c.fn === 'biomes')).toHaveLength(0);
  });

  it('a new world replaces the old one and what was queued for it', () => {
    const { host, out, drain, calls } = setUp();
    host.receive(world(1, 'w1'));
    host.receive(biomes(2, 'w1', 'coarse'));
    host.receive(world(3, 'w2'));
    drain();
    expect(calls.filter((c) => c.fn === 'world')).toHaveLength(1);
    expect(out).toEqual([expect.objectContaining({ type: 'world', token: 3, filesHash: 'w2' })]);
    // A request for a world that is gone is answered with an error, not a wrong picture.
    host.receive(biomes(4, 'w1', 'fine'));
    drain();
    expect(out[1]).toEqual(
      expect.objectContaining({ type: 'error', token: 4, request: 'biomes', pass: 'fine' }),
    );
  });

  it('keeps vanilla files by key and refuses a world whose files were not sent', () => {
    const { host, out, drain, calls } = setUp();
    host.receive(world(1, 'w1', 'mc-26.3:26.3'));
    drain();
    expect(out[0]).toEqual(expect.objectContaining({ type: 'error', request: 'world' }));
    const files = { 'worldgen/noise': { 'minecraft:a': {} } };
    host.receive({ type: 'vanilla', key: 'mc-26.3:26.3', files });
    host.receive(world(2, 'w2', 'mc-26.3:26.3'));
    drain();
    expect(out[1]).toEqual(expect.objectContaining({ type: 'world', token: 2 }));
    const input = calls.find((c) => c.fn === 'world')?.arg as { files: { vanilla: unknown } };
    expect(input.files.vanilla).toBe(files);
  });

  it('turns the typed seed into the number the engine uses', () => {
    const { host, out, drain } = setUp();
    host.receive(world(1, 'w1'));
    drain();
    const message = out[0] as Extract<WorkerOutbound, { type: 'world' }>;
    expect(message.summary.seed).toBe('5');
    expect(message.summary.unsupported).toHaveLength(1);
  });
});
