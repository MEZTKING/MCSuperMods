import type { Element, OutputFile, Project, Target } from '@msm/plugin-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  folderAndId,
  forgetVanillaWorldgen,
  TERRAIN_DEBOUNCE_MS,
  TerrainFiles,
  type TerrainFilesState,
  type WorldgenKindLike,
  type WorldgenSession,
} from '../../../src/renderer/src/terrain/files';
import type { VanillaWorldgenFiles } from '../../../src/shared/platform';

const FOLDERS = [
  'dimension_type',
  'tags/worldgen/biome',
  'worldgen/biome',
  'worldgen/noise_settings',
];

function target(withFact = true): Target {
  return {
    id: 'mc-26.3',
    mcVersion: '26.3',
    worldgen: withFact ? { terrainPreview: { dataFolders: FOLDERS, approximate: ['end'] } } : {},
  } as unknown as Target;
}

function kind(folder: string, counter: { n: number }): WorldgenKindLike {
  return {
    folder,
    lower(element: Element): OutputFile[] {
      counter.n += 1;
      const [ns, path] = element.id.split(':') as [string, string];
      return [
        {
          path: `data/${ns}/${folder}/${path}.json`,
          contents: element.data,
          layer: 'datapack',
        },
      ];
    },
  };
}

function element(id: string, kindId: string, data: unknown): Element {
  return { id, kind: kindId, data, formatVersion: 1, meta: { createdAt: '' } } as Element;
}

function project(elements: Element[]): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    namespaces: [{ namespace: 'demo', elements }],
    plugins: [],
    settings: {},
    targets: ['mc-26.3'],
  } as unknown as Project;
}

function fakeSession(start: Project, t: Target = target()) {
  const counter = { n: 0 };
  const kinds = new Map<string, WorldgenKindLike>([
    ['minecraft:dimension', kind('dimension', counter)],
    ['minecraft:worldgen/noise_settings', kind('worldgen/noise_settings', counter)],
    ['minecraft:worldgen/biome', kind('worldgen/biome', counter)],
    ['minecraft:tag/worldgen/biome', kind('tags/worldgen/biome', counter)],
    ['minecraft:recipe', kind('recipe', counter)],
  ]);
  const listeners = new Set<(s: { project: Project | null }) => void>();
  const session = {
    snapshot: { project: start as Project | null },
    subscribe(listener: (s: { project: Project | null }) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    registry: { get: (id: string) => kinds.get(id) },
    target: t,
  } satisfies WorldgenSession;
  const edit = (next: Project): void => {
    session.snapshot = { project: next };
    for (const listener of listeners) listener(session.snapshot);
  };
  return { session, counter, edit };
}

const VANILLA: VanillaWorldgenFiles = {
  version: '26.3',
  files: { 'worldgen/noise_settings': { 'minecraft:overworld': { sea_level: 63 } } },
  fileCount: 1,
  resolvedBiomeLists: null,
};

const DIM = element('demo:land', 'minecraft:dimension', { type: 'demo:land_type' });
const NOISE = element('demo:land', 'minecraft:worldgen/noise_settings', { sea_level: 40 });
const BIOME = element('demo:moor', 'minecraft:worldgen/biome', { temperature: 0.4 });
const TAG = element('demo:moors', 'minecraft:tag/worldgen/biome', { values: ['demo:moor'] });
const RECIPE = element('demo:cake', 'minecraft:recipe', { type: 'crafting_shaped' });

beforeEach(() => forgetVanillaWorldgen());
afterEach(() => vi.useRealTimers());

describe('TerrainFiles', () => {
  it('lowers the worldgen elements into folder keys and ids, beside vanilla', async () => {
    const { session } = fakeSession(project([DIM, NOISE, BIOME, TAG, RECIPE]));
    const read = vi.fn(async () => VANILLA);
    const handed: TerrainFilesState[] = [];
    const files = new TerrainFiles(session, { onFiles: (s) => handed.push(s), readVanilla: read });
    const state = await files.refresh();
    expect(state?.project).toEqual({
      dimension: { 'demo:land': { type: 'demo:land_type' } },
      'worldgen/noise_settings': { 'demo:land': { sea_level: 40 } },
      'worldgen/biome': { 'demo:moor': { temperature: 0.4 } },
      'tags/worldgen/biome': { 'demo:moors': { values: ['demo:moor'] } },
    });
    expect(state?.vanilla).toBe(VANILLA.files);
    expect(state?.vanillaKey).toBe('mc-26.3:26.3');
    expect(state?.needsSetUp).toBe(false);
    expect(state?.facts).toEqual({ dataFolders: FOLDERS, approximate: ['end'] });
    expect(read).toHaveBeenCalledWith('26.3');
    expect(handed).toHaveLength(1);
    files.dispose();
  });

  it('an edit to one element re-lowers that element only', async () => {
    vi.useFakeTimers();
    const { session, counter, edit } = fakeSession(project([DIM, NOISE, BIOME, TAG]));
    const handed: TerrainFilesState[] = [];
    const files = new TerrainFiles(session, {
      onFiles: (s) => handed.push(s),
      readVanilla: async () => VANILLA,
    });
    await files.refresh();
    expect(counter.n).toBe(4);
    const firstHash = handed[0]?.filesHash;

    // A new project object in which only the biome changed; the others keep their objects.
    const moor = element('demo:moor', 'minecraft:worldgen/biome', { temperature: 0.9 });
    edit(project([DIM, NOISE, moor, TAG]));
    await vi.advanceTimersByTimeAsync(TERRAIN_DEBOUNCE_MS);
    expect(counter.n).toBe(5);
    expect(files.lowerings).toBe(5);
    expect(handed).toHaveLength(2);
    expect(handed[1]?.filesHash).not.toBe(firstHash);
    expect(handed[1]?.project['worldgen/biome']).toEqual({ 'demo:moor': { temperature: 0.9 } });

    // Equal data in fresh objects (as an undo can give) is not lowered again, nor handed on.
    edit(project([{ ...DIM }, { ...NOISE }, { ...moor }, { ...TAG }]));
    await vi.advanceTimersByTimeAsync(TERRAIN_DEBOUNCE_MS);
    expect(counter.n).toBe(5);
    expect(handed).toHaveLength(2);
    files.dispose();
  });

  it(`waits ${TERRAIN_DEBOUNCE_MS} ms after the last edit`, async () => {
    vi.useFakeTimers();
    const { session, counter, edit } = fakeSession(project([BIOME]));
    const files = new TerrainFiles(session, {
      onFiles: () => undefined,
      readVanilla: async () => VANILLA,
    });
    await files.refresh();
    for (const t of [0.1, 0.2, 0.3]) {
      edit(project([element('demo:moor', 'minecraft:worldgen/biome', { temperature: t })]));
      await vi.advanceTimersByTimeAsync(TERRAIN_DEBOUNCE_MS - 50);
    }
    expect(counter.n).toBe(1);
    await vi.advanceTimersByTimeAsync(50);
    expect(counter.n).toBe(2);
    files.dispose();
  });

  it('reads vanilla once per version, but asks again after a null answer', async () => {
    const { session } = fakeSession(project([BIOME]));
    let answer: VanillaWorldgenFiles | null = null;
    const read = vi.fn(async () => answer);
    const a = new TerrainFiles(session, { onFiles: () => undefined, readVanilla: read });
    const first = await a.refresh();
    expect(first?.vanilla).toBeNull();
    expect(first?.needsSetUp).toBe(true);
    answer = VANILLA;
    const b = new TerrainFiles(session, { onFiles: () => undefined, readVanilla: read });
    expect((await b.refresh())?.needsSetUp).toBe(false);
    const c = new TerrainFiles(session, { onFiles: () => undefined, readVanilla: read });
    await c.refresh();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('a target without the fact draws project files only, without the banner', async () => {
    const { session } = fakeSession(project([DIM, BIOME]), target(false));
    const read = vi.fn(async () => VANILLA);
    const files = new TerrainFiles(session, { onFiles: () => undefined, readVanilla: read });
    const state = await files.refresh();
    expect(read).not.toHaveBeenCalled();
    expect(state?.needsSetUp).toBe(false);
    expect(state?.vanilla).toBeNull();
    expect(Object.keys(state?.project ?? {})).toEqual(['dimension']);
  });

  it('a lowering that throws is named, and the rest still come', async () => {
    const { session } = fakeSession(project([DIM]));
    const broken: WorldgenKindLike = {
      folder: 'worldgen/biome',
      lower: () => {
        throw new Error('cannot lower');
      },
    };
    const registry = session.registry;
    const withBroken = {
      ...session,
      registry: {
        get: (id: string) => (id === 'minecraft:worldgen/biome' ? broken : registry.get(id)),
      },
    };
    withBroken.snapshot = { project: project([DIM, BIOME]) };
    const files = new TerrainFiles(withBroken, {
      onFiles: () => undefined,
      readVanilla: async () => VANILLA,
    });
    const state = await files.refresh();
    expect(state?.problems).toEqual([{ elementId: 'demo:moor', message: 'cannot lower' }]);
    expect(state?.project).toEqual({ dimension: { 'demo:land': { type: 'demo:land_type' } } });
  });
});

describe('folderAndId', () => {
  it('takes the longest folder and makes a namespaced id', () => {
    const folders = ['worldgen/biome', 'tags/worldgen/biome', 'dimension'];
    expect(folderAndId('data/demo/tags/worldgen/biome/cold/moors.json', folders)).toEqual({
      folder: 'tags/worldgen/biome',
      id: 'demo:cold/moors',
    });
    expect(folderAndId('data/demo/worldgen/biome/moor.json', folders)).toEqual({
      folder: 'worldgen/biome',
      id: 'demo:moor',
    });
    expect(folderAndId('data/demo/recipe/cake.json', folders)).toBeNull();
    expect(folderAndId('assets/demo/models/x.json', folders)).toBeNull();
  });
});
