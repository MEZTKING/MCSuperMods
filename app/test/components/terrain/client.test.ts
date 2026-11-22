import { describe, expect, it } from 'vitest';
import {
  COARSE_FACTOR,
  coarseRegion,
  type MapRegion,
  stableKey,
  type TerrainAnswer,
  TerrainClient,
  type WorldSpec,
} from '../../../src/renderer/src/terrain/client';
import { fakeEngine, localWorker } from './fake-engine';

const FACTS = { dataFolders: ['worldgen/noise_settings'], approximate: [] } as const;
const REGION: MapRegion = { x0: 0, z0: 0, width: 256, depth: 256, step: 4 };

function spec(seed = '12', vanilla: WorldSpec['files']['vanilla'] = null): WorldSpec {
  return {
    files: { vanilla, project: { dimension: { 'demo:land': { type: 'demo:land' } } } },
    source: { dimension: 'demo:land' },
    seed,
    facts: FACTS,
  };
}

function setUp(options: Parameters<typeof fakeEngine>[0] = {}) {
  const { engine, calls } = fakeEngine(options);
  const local = localWorker(engine);
  const client = new TerrainClient({ createWorker: () => local.worker });
  return { client, local, calls };
}

describe('TerrainClient', () => {
  it('makes the world in the worker and answers coarse, then fine', async () => {
    const { client, local, calls } = setUp();
    const world = client.setWorld(spec(), 'files-1', null);
    const passes: TerrainAnswer[] = [];
    const done = client.sample('map', { type: 'biomes', region: REGION }, (a) => passes.push(a));
    await local.flush();
    const summary = await world;
    expect(summary.seed).toBe('12');
    expect(summary.unsupported.map((u) => u.type)).toEqual(['minecraft:bandlands']);
    const final = await done;
    expect(passes.map((a) => a.pass)).toEqual(['coarse', 'fine']);
    expect(final).toBe(passes[1]);
    // The coarse pass asks for every 4th column.
    const biomeCalls = calls.filter((c) => c.fn === 'biomes');
    expect(biomeCalls.map((c) => (c.region as MapRegion).step)).toEqual([4 * COARSE_FACTOR, 4]);
    const sizes = passes.map((a) => (a.data as { cells: Uint16Array }).cells.length);
    expect(sizes).toEqual([16 * 16, 64 * 64]);
  });

  it('transfers the typed arrays rather than copying them', async () => {
    const { client, local } = setUp();
    void client.setWorld(spec(), 'files-1', null);
    const done = client.sample('map', { type: 'heights', region: REGION });
    await local.flush();
    const final = await done;
    const answers = local.answered.filter((a) => a.message.type === 'answer');
    expect(answers).toHaveLength(2);
    for (const { message, transfer } of answers) {
      const data = (message as { answer: TerrainAnswer }).answer.data as Int16Array;
      expect(transfer).toEqual([data.buffer]);
    }
    expect(final?.data).toBeInstanceOf(Int16Array);
  });

  it('a newer request in a lane cancels the older one', async () => {
    const { client, local, calls } = setUp();
    void client.setWorld(spec(), 'files-1', null);
    const seen: string[] = [];
    const first = client.sample('map', { type: 'biomes', region: REGION }, (a) =>
      seen.push(`first ${a.pass}`),
    );
    const second = client.sample('map', { type: 'biomes', region: { ...REGION, x0: 512 } }, (a) =>
      seen.push(`second ${a.pass}`),
    );
    await local.flush();
    expect(await first).toBeNull();
    expect((await second)?.pass).toBe('fine');
    expect(seen).toEqual(['second coarse', 'second fine']);
    expect(local.sent.some((m) => m.type === 'cancel')).toBe(true);
    // The cancelled request never reached the engine.
    expect(
      calls.filter((c) => c.fn === 'biomes').every((c) => (c.region as MapRegion).x0 === 512),
    ).toBe(true);
  });

  it('another lane is not cancelled', async () => {
    const { client, local } = setUp();
    void client.setWorld(spec(), 'files-1', null);
    const map = client.sample('map', { type: 'biomes', region: REGION });
    const cut = client.sample('cut', {
      type: 'slice',
      region: { axis: 'x', at: 0, from: -128, to: 128, step: 1, yStep: 1 },
    });
    await local.flush();
    expect(await map).not.toBeNull();
    expect(await cut).not.toBeNull();
  });

  it('drops the answer of a job that was already running when it was cancelled', async () => {
    const { client, local } = setUp();
    void client.setWorld(spec(), 'files-1', null);
    await local.flush();
    const seen: string[] = [];
    const older = client.sample('map', { type: 'biomes', region: REGION }, (a) =>
      seen.push(`older ${a.pass}`),
    );
    // The older coarse pass runs; its answer is still on the way when the newer request comes.
    await local.runOne();
    const newer = client.sample('map', { type: 'biomes', region: { ...REGION, x0: 128 } }, (a) =>
      seen.push(`newer ${a.pass}`),
    );
    await local.flush();
    expect(await older).toBeNull();
    expect(await newer).not.toBeNull();
    expect(seen).toEqual(['newer coarse', 'newer fine']);
    expect(local.answered.filter((a) => a.message.type === 'answer')).toHaveLength(3);
  });

  it('the cache answers a repeated view without the worker', async () => {
    const { client, local } = setUp();
    void client.setWorld(spec(), 'files-1', null);
    const first = client.sample('map', { type: 'biomes', region: REGION });
    await local.flush();
    const answer = await first;
    const posted = client.posted;
    const sent = local.sent.length;
    const passes: TerrainAnswer[] = [];
    const again = await client.sample('map', { type: 'biomes', region: REGION }, (a) =>
      passes.push(a),
    );
    expect(again).toBe(answer);
    expect(passes).toEqual([answer]);
    expect(client.posted).toBe(posted);
    expect(local.sent.length).toBe(sent);
  });

  it('a cached coarse pass is shown at once and only the fine pass is asked', async () => {
    const { client, local } = setUp();
    void client.setWorld(spec(), 'files-1', null);
    // A lane cancelled after the coarse answer keeps the coarse pass in the cache.
    const passes: TerrainAnswer[] = [];
    void client.sample('map', { type: 'biomes', region: REGION }, (a) => {
      passes.push(a);
      if (a.pass === 'coarse') client.cancel('map');
    });
    await local.flush();
    expect(passes.map((a) => a.pass)).toEqual(['coarse']);
    const before = client.posted;
    const seen: string[] = [];
    const again = client.sample('map', { type: 'biomes', region: REGION }, (a) =>
      seen.push(a.pass),
    );
    expect(seen).toEqual(['coarse']);
    await local.flush();
    expect((await again)?.pass).toBe('fine');
    expect(client.posted - before).toBe(1);
  });

  it('a new seed is a new world: older work is cancelled and the cache does not answer', async () => {
    const { client, local, calls } = setUp();
    void client.setWorld(spec('12'), 'files-1', null);
    const old = client.sample('map', { type: 'biomes', region: REGION });
    const world = client.setWorld(spec('13'), 'files-1', null);
    expect(await old).toBeNull();
    const next = client.sample('map', { type: 'biomes', region: REGION });
    await local.flush();
    expect((await world).seed).toBe('13');
    expect(await next).not.toBeNull();
    // Only the newest world was made; the first was replaced while queued.
    expect(calls.filter((c) => c.fn === 'world')).toHaveLength(1);
  });

  it('the same world is not sent twice', async () => {
    const { client, local } = setUp();
    const a = client.setWorld(spec(), 'files-1', null);
    const b = client.setWorld(spec(), 'files-1', null);
    expect(b).toBe(a);
    await local.flush();
    expect(local.sent.filter((m) => m.type === 'world')).toHaveLength(1);
  });

  it('sends vanilla files once per key, and the world names them', async () => {
    const vanilla = { 'worldgen/noise_settings': { 'minecraft:overworld': { sea_level: 63 } } };
    const { client, local, calls } = setUp();
    void client.setWorld(spec('1', vanilla), 'files-1', 'mc-26.3:26.3');
    await local.flush();
    void client.setWorld(spec('2', vanilla), 'files-2', 'mc-26.3:26.3');
    await local.flush();
    expect(local.sent.filter((m) => m.type === 'vanilla')).toHaveLength(1);
    const worlds = local.sent.filter((m) => m.type === 'world');
    expect(worlds.map((m) => (m as { vanillaKey: string | null }).vanillaKey)).toEqual([
      'mc-26.3:26.3',
      'mc-26.3:26.3',
    ]);
    const inputs = calls.filter((c) => c.fn === 'world').map((c) => c.arg) as {
      files: { vanilla: unknown };
      seed: bigint;
    }[];
    expect(inputs.map((i) => i.files.vanilla)).toEqual([vanilla, vanilla]);
    expect(inputs.map((i) => i.seed)).toEqual([1n, 2n]);
  });

  it('rejects when the engine cannot make the world or draw a part', async () => {
    const broken = setUp({ failWorld: true });
    const world = broken.client.setWorld(spec(), 'files-1', null);
    await broken.local.flush();
    await expect(world).rejects.toThrow('bad noise settings');
    expect(broken.client.worldHash).toBeNull();

    const failing = setUp({ failBiomes: true });
    void failing.client.setWorld(spec(), 'files-1', null);
    const sample = failing.client.sample('map', { type: 'biomes', region: REGION });
    await failing.local.flush();
    await expect(sample).rejects.toThrow('no biomes here');
  });

  it('the ground asks for one pass and passes its stage; heights name their map', async () => {
    const { client, local, calls } = setUp();
    void client.setWorld(spec(), 'files-1', null);
    const window = { x0: 0, z0: 0, y0: 40, sizeX: 48, sizeY: 32, sizeZ: 48 };
    const ground = client.sample('ground', { type: 'columns', region: window, stage: 'surface' });
    const floor = client.sample('floor', { type: 'heights', region: REGION, fn: 'ocean_floor' });
    await local.flush();
    expect((await ground)?.pass).toBe('fine');
    expect(await floor).not.toBeNull();
    expect(calls.filter((c) => c.fn === 'columns').map((c) => c.arg)).toEqual(['surface']);
    expect(calls.filter((c) => c.fn === 'heights').map((c) => c.arg)).toEqual([
      'ocean_floor',
      'ocean_floor',
    ]);
  });

  it('dispose stops the worker and answers later requests with null', async () => {
    const { client, local } = setUp();
    void client.setWorld(spec(), 'files-1', null);
    await local.flush();
    client.dispose();
    await local.flush();
    expect(local.terminated).toBe(true);
    expect(await client.sample('map', { type: 'biomes', region: REGION })).toBeNull();
  });
});

describe('helpers', () => {
  it('coarseRegion takes every 4th column and leaves a window alone', () => {
    expect(coarseRegion(REGION)).toEqual({ ...REGION, step: 16 });
    const cut = { axis: 'z' as const, at: 3, from: 0, to: 256, step: 1, yStep: 2 };
    expect(coarseRegion(cut)).toEqual({ ...cut, step: 4 });
    const window = { x0: 0, z0: 0, y0: 0, sizeX: 48, sizeY: 32, sizeZ: 48 };
    expect(coarseRegion(window)).toBe(window);
  });

  it('stableKey sorts keys and skips undefined', () => {
    expect(stableKey({ b: 1, a: [true, null], c: undefined, d: 5n })).toBe(
      '{"a":[true,null],"b":1,"d":5n}',
    );
  });
});
