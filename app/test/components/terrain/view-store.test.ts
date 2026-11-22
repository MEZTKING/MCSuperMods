import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'msm.terrain-view.v1';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

async function load(initial: Record<string, string> = {}) {
  const storage = memoryStorage(initial);
  vi.stubGlobal('localStorage', storage);
  vi.resetModules();
  const module = await import('../../../src/renderer/src/terrain/view-store');
  return { ...module, storage };
}

beforeEach(() => vi.unstubAllGlobals());

describe('the terrain view store', () => {
  it('makes a view with a random seed once per project and keeps it', async () => {
    const { useTerrainView, storage } = await load();
    const first = useTerrainView.getState().viewFor('/projects/a');
    expect(first).toEqual(expect.objectContaining({ x: 0, z: 0, zoom: 4, mode: 'biomes' }));
    expect(first.seed).toMatch(/^-?\d+$/);
    expect(useTerrainView.getState().viewFor('/projects/a')).toBe(first);
    const stored = JSON.parse(storage.data.get(KEY) ?? '{}') as { projects: unknown[] };
    expect(stored.projects).toEqual([['/projects/a', first]]);
  });

  it('keeps the seed, position, zoom and mode per project across a restart', async () => {
    const first = await load();
    first.useTerrainView
      .getState()
      .setView('/projects/a', { seed: 'islands', x: 120, z: -64, zoom: 16, mode: 'side_cut' });
    first.useTerrainView.getState().setView('/projects/b', { seed: '7' });
    const saved = first.storage.data.get(KEY) ?? '';

    const again = await load({ [KEY]: saved });
    expect(again.useTerrainView.getState().views.get('/projects/a')).toEqual({
      seed: 'islands',
      x: 120,
      z: -64,
      zoom: 16,
      mode: 'side_cut',
    });
    expect(again.useTerrainView.getState().views.get('/projects/b')?.seed).toBe('7');
  });

  it('refuses values that are not a view and survives broken storage', async () => {
    const broken = await load({ [KEY]: '{not json' });
    expect(broken.useTerrainView.getState().views.size).toBe(0);
    const { useTerrainView, readView } = await load({
      [KEY]: JSON.stringify({
        projects: [
          ['/a', { seed: '1', x: 1.6, z: 2, zoom: 3, mode: 'other' }],
          ['/b', { seed: 5, x: 0, z: 0 }],
          'junk',
        ],
      }),
    });
    expect([...useTerrainView.getState().views.keys()]).toEqual(['/a']);
    expect(useTerrainView.getState().views.get('/a')).toEqual({
      seed: '1',
      x: 2,
      z: 2,
      zoom: 4,
      mode: 'biomes',
    });
    expect(readView({ seed: '1', x: Number.NaN, z: 0 })).toBeNull();
    useTerrainView.getState().setView('/a', { x: Number.POSITIVE_INFINITY });
    expect(useTerrainView.getState().views.get('/a')?.x).toBe(2);
  });

  it(`keeps the last projects only`, async () => {
    const { useTerrainView, MAX_PROJECTS } = await load();
    for (let i = 0; i <= MAX_PROJECTS; i += 1) {
      useTerrainView.getState().setView(`/p${i}`, { seed: String(i) });
    }
    const views = useTerrainView.getState().views;
    expect(views.size).toBe(MAX_PROJECTS);
    expect(views.has('/p0')).toBe(false);
    expect(views.has(`/p${MAX_PROJECTS}`)).toBe(true);
  });

  it('randomSeed gives a signed 64-bit number', async () => {
    const { randomSeed } = await load();
    expect(randomSeed(() => 0)).toBe('0');
    expect(randomSeed(() => 0.999999999)).toMatch(/^-\d+$/);
    const n = BigInt(randomSeed());
    expect(n >= -(2n ** 63n) && n < 2n ** 63n).toBe(true);
  });
});
