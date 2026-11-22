// @vitest-environment happy-dom
/**
 * B585's views in the preview panel over a fake engine: the Value map, the Scatter, the carver's
 * line, structure markers and Compare with vanilla; and the files the views read (biome
 * additions, the feature facts).
 */
import type { Element, OutputFile, Project, Target } from '@msm/plugin-api';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TerrainClient, type WorkerInbound } from '../../../src/renderer/src/terrain/client';
import {
  ADDITIONS_FOLDER,
  additionAndId,
  factsOf,
  forgetVanillaWorldgen,
  TerrainFiles,
  type WorldgenKindLike,
  type WorldgenSession,
} from '../../../src/renderer/src/terrain/files';
import { useTerrainView } from '../../../src/renderer/src/terrain/view-store';
import WorldMap, {
  CARVER_WORDS,
  createTerrainSession,
  type TerrainSessionHandle,
} from '../../../src/renderer/src/terrain/WorldMap';
import type { VanillaWorldgenFiles } from '../../../src/shared/platform';
import { fakeEngine, type LocalWorker, localWorker } from './fake-engine';

const ROOT = '/projects/demo';
const FOLDERS = [
  'dimension_type',
  'worldgen/biome',
  'worldgen/noise_settings',
  'worldgen/density_function',
  'worldgen/noise',
  'worldgen/feature',
  'worldgen/placed_feature',
  'worldgen/structure_set',
];

function target(): Target {
  return {
    id: 'mc-26.3',
    mcVersion: '26.3',
    worldgen: {
      featureSteps: ['underground_ores', 'vegetal_decoration'],
      vanillaFeatureOrder: { vegetal_decoration: ['minecraft:flower_default'] },
      terrainPreview: { dataFolders: FOLDERS, approximate: ['end'] },
    },
  } as unknown as Target;
}

function element(id: string, kind: string, data: unknown): Element {
  return { id, kind, data, formatVersion: 1, meta: { createdAt: '' } } as Element;
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

function kind(folder: string): WorldgenKindLike {
  return {
    folder,
    lower(e: Element): OutputFile[] {
      const [ns, path] = e.id.split(':') as [string, string];
      if (folder === 'biome_addition') {
        return [{ path: `msm/${ns}/biome_addition/${path}.json`, contents: e.data, layer: 'msm' }];
      }
      return [{ path: `data/${ns}/${folder}/${path}.json`, contents: e.data, layer: 'datapack' }];
    },
  };
}

function fakeSession(start: Project) {
  const kinds = new Map<string, WorldgenKindLike>(
    [
      'dimension',
      'worldgen/noise_settings',
      'worldgen/biome',
      'worldgen/density_function',
      'worldgen/noise',
      'worldgen/feature',
      'worldgen/placed_feature',
      'worldgen/carver',
      'worldgen/structure_set',
    ].map((folder) => [`minecraft:${folder}`, kind(folder)]),
  );
  kinds.set('msm:biome_addition', kind('biome_addition'));
  const session = {
    snapshot: { project: start as Project | null },
    subscribe: () => () => undefined,
    registry: { get: (id: string) => kinds.get(id) },
    target: target(),
  } satisfies WorldgenSession;
  return session;
}

interface Rig {
  readonly local: LocalWorker;
  readonly compare: LocalWorker;
  readonly handle: TerrainSessionHandle;
  readonly compareClient: TerrainClient;
}

function rig(start: Project, vanilla: VanillaWorldgenFiles | null): Rig {
  const local = localWorker(fakeEngine().engine);
  const compare = localWorker(fakeEngine().engine);
  const client = new TerrainClient({ createWorker: () => local.worker });
  const compareClient = new TerrainClient({ createWorker: () => compare.worker });
  const handle = createTerrainSession(fakeSession(start), {
    client,
    readVanilla: async () => vanilla,
  });
  return { local, compare, handle, compareClient };
}

async function settle(r: Rig, rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await r.local.flush();
      await r.compare.flush();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function show(r: Rig, start: Project, chosen: Element, setup: () => void = () => undefined) {
  return render(
    <WorldMap
      session={undefined as unknown as WorldgenSession}
      terrain={r.handle}
      root={ROOT}
      project={start}
      element={chosen}
      vanillaReady={false}
      onSetup={setup}
      worlds={null}
      compareClient={r.compareClient}
    />,
  );
}

type SampleMessage = Extract<WorkerInbound, { pass: 'coarse' | 'fine' }>;
type WorldMessage = Extract<WorkerInbound, { type: 'world' }>;
const samples = (sent: WorkerInbound[], type: string): SampleMessage[] =>
  sent.filter((m): m is SampleMessage => m.type === type);
const worlds = (sent: WorkerInbound[]): WorldMessage[] =>
  sent.filter((m): m is WorldMessage => m.type === 'world');

const VANILLA: VanillaWorldgenFiles = {
  version: '26.3',
  files: {
    'worldgen/noise_settings': { 'minecraft:overworld': { sea_level: 63 } },
    'worldgen/world_preset': { 'minecraft:normal': { dimensions: {} } },
  },
  fileCount: 2,
  resolvedBiomeLists: null,
};

const LAND = element('demo:land', 'minecraft:worldgen/noise_settings', { sea_level: 40 });
const WORLD = element('demo:world', 'minecraft:dimension', {
  type: 'minecraft:overworld',
  generator: {
    type: 'minecraft:noise',
    settings: 'demo:land',
    biome_source: { type: 'minecraft:fixed', biome: 'demo:moor' },
  },
});
const HEIGHT = element('demo:height', 'minecraft:worldgen/density_function', 0.5);
const BUMPS = element('demo:bumps', 'minecraft:worldgen/noise', {
  base_amplitude: 1,
  base_octave: -4,
  octave_count: 1,
  amplitude_modifiers: [1],
});
const FLOWERS = element('demo:flowers', 'minecraft:worldgen/placed_feature', {
  feature: 'demo:flower',
  placement: [],
});
const CAVES = element('demo:caves', 'minecraft:worldgen/carver', {});
const HUTS = element('demo:huts', 'minecraft:worldgen/structure_set', {
  placement: { type: 'minecraft:random_spread', salt: 1, spacing: 8, separation: 2 },
  structures: [{ structure: 'demo:hut', weight: 1 }],
});
const MORE = element('demo:more', 'msm:biome_addition', {
  format: 1,
  biomes: ['demo:moor'],
  features: [{ feature: 'demo:flowers', step: 'vegetal_decoration' }],
});

beforeEach(() => {
  forgetVanillaWorldgen();
  useTerrainView.getState().reset();
  useTerrainView.getState().setView(ROOT, { seed: '12', x: 0, z: 0, zoom: 4, mode: 'biomes' });
});
afterEach(cleanup);

describe('the Value map', () => {
  it('draws a density function on its own, coarse then fine, from above', async () => {
    const start = project([HEIGHT]);
    const r = rig(start, null);
    show(r, start, HEIGHT);
    await settle(r);
    expect(screen.getByTestId('value-map')).toBeTruthy();
    expect(screen.getByTestId('terrain-preview-tag').textContent).toBe('Preview');
    const values = samples(r.local.sent, 'values');
    expect(values.map((m) => m.pass)).toEqual(['coarse', 'fine']);
    expect(values[1]?.fn).toBe('demo:height');
    expect(values[1]?.region).toMatchObject({ step: 4, width: 1024, depth: 1024, y: 64 });
    // The plain world's final density is the function itself.
    const world = worlds(r.local.sent).at(-1);
    const settings = world?.spec.project['worldgen/noise_settings']?.['msm_preview:value'] as {
      noise_router: { final_density: unknown };
    };
    expect(settings.noise_router.final_density).toBe('demo:height');
    expect(screen.getByTestId('terrain-value-state').dataset.pass).toBe('fine');
    const notes = screen.getByTestId('terrain-notes').textContent ?? '';
    // The fake engine reports `minecraft:bandlands` in `demo:land`.
    expect(notes).toContain('This world uses bandlands (in demo:land)');
    expect(notes).toContain('Blue is below 0 and orange above');
  });

  it('cuts from the side and moves the height of the slice', async () => {
    const start = project([HEIGHT]);
    const r = rig(start, null);
    show(r, start, HEIGHT);
    await settle(r);
    fireEvent.change(screen.getByTestId('terrain-value-y'), { target: { value: '10' } });
    await settle(r);
    expect(samples(r.local.sent, 'values').at(-1)?.region).toMatchObject({ y: 10 });
    fireEvent.click(screen.getByTestId('terrain-value-mode-cut'));
    await settle(r);
    expect(samples(r.local.sent, 'values').at(-1)?.region).toMatchObject({
      axis: 'x',
      at: 0,
      from: -512,
      to: 512,
      yStep: 2,
    });
  });

  it('draws a noise alone with the noise inline', async () => {
    const start = project([BUMPS]);
    const r = rig(start, null);
    show(r, start, BUMPS);
    await settle(r);
    expect(samples(r.local.sent, 'values').at(-1)?.fn).toEqual({
      type: 'minecraft:noise',
      noise: 'demo:bumps',
      xz_scale: 1,
      y_scale: 1,
    });
    expect(screen.getByTestId('terrain-notes').textContent).toContain(
      'The noise alone, at a scale of 1 on every axis.',
    );
  });
});

describe('the Scatter', () => {
  it('asks for the patch as land and as land with features', async () => {
    const start = project([FLOWERS]);
    const r = rig(start, null);
    show(r, start, FLOWERS);
    await settle(r);
    expect(screen.getByTestId('scatter')).toBeTruthy();
    const columns = samples(r.local.sent, 'columns');
    expect(columns.map((m) => m.stage).sort()).toEqual(['features', 'surface']);
    expect(columns[0]?.region).toEqual({
      x0: -16,
      z0: -16,
      y0: -64,
      sizeX: 48,
      sizeY: 192,
      sizeZ: 48,
    });
    // The plain biome lists the placed feature in the target's vegetal step (index 1 here).
    const world = worlds(r.local.sent).at(-1);
    const biome = world?.spec.project['worldgen/biome']?.['msm_preview:scatter'] as {
      features: string[][];
    };
    expect(biome.features).toEqual([[], ['demo:flowers']]);
    expect(world?.spec.facts.featureSteps).toEqual(['underground_ores', 'vegetal_decoration']);
    expect(screen.getByTestId('terrain-scatter-count').textContent).toContain('Nothing was placed');
    expect(screen.getByTestId('terrain-notes').textContent).toContain(
      'Trees, plants and ores are about right here; the game places them exactly.',
    );
  });

  it('switches a biome addition off and on', async () => {
    const moor = element('demo:moor', 'minecraft:worldgen/biome', { features: [] });
    const start = project([MORE, moor, FLOWERS]);
    const r = rig(start, null);
    show(r, start, MORE);
    await settle(r);
    const on = worlds(r.local.sent).at(-1);
    expect(on?.spec.project[ADDITIONS_FOLDER]).toHaveProperty('demo:more');
    expect(screen.getByTestId('terrain-notes').textContent).toContain('in demo:moor');
    fireEvent.click(screen.getByTestId('terrain-addition-toggle'));
    await settle(r);
    const off = worlds(r.local.sent).at(-1);
    expect(off?.spec.project[ADDITIONS_FOLDER]).not.toHaveProperty('demo:more');
    expect(screen.getByTestId('terrain-notes').textContent).toContain('The addition is off.');
  });
});

describe('the carver', () => {
  it('says its caves show only in the game', async () => {
    const start = project([CAVES]);
    const r = rig(start, null);
    show(r, start, CAVES);
    expect(screen.getByTestId('terrain-carver').textContent).toContain(CARVER_WORDS);
  });
});

describe('the map: markers and Compare with vanilla', () => {
  it('marks where a structure may start', async () => {
    const start = project([LAND, WORLD, HUTS]);
    const r = rig(start, null);
    show(r, start, WORLD);
    await settle(r);
    fireEvent.click(screen.getByTestId('terrain-markers-toggle'));
    await settle(r);
    const count = Number(screen.getByTestId('terrain-state').dataset.markers);
    // Spacing 8 chunks over a view of 64 chunks a side: one start in each 8 by 8 cell.
    expect(count).toBeGreaterThanOrEqual(49);
    expect(screen.getByTestId('terrain-markers').textContent).toContain(
      'in this view where a structure may start.',
    );
    expect(screen.getByTestId('terrain-notes').textContent).toContain(
      'Markers show where a structure may start',
    );
  });

  it('is off with the set-up banner when no jar is set up', async () => {
    const start = project([LAND, WORLD]);
    const r = rig(start, null);
    let opened = 0;
    show(r, start, WORLD, () => {
      opened += 1;
    });
    await settle(r);
    const toggle = screen.getByTestId('terrain-compare') as HTMLInputElement;
    expect(toggle.disabled).toBe(true);
    expect(toggle.checked).toBe(false);
    const banner = screen.getByTestId('terrain-compare-set-up');
    expect(banner.textContent).toContain("Compare with vanilla needs Minecraft's own land files.");
    fireEvent.click(banner.querySelector('button') as HTMLButtonElement);
    expect(opened).toBe(1);
    expect(r.compare.sent).toEqual([]);
  });

  it("draws vanilla's overworld of the same seed beside the map, in its own worker", async () => {
    const start = project([LAND, WORLD]);
    const r = rig(start, VANILLA);
    show(r, start, WORLD);
    await settle(r);
    expect(screen.queryByTestId('terrain-compare-set-up')).toBeNull();
    fireEvent.click(screen.getByTestId('terrain-compare'));
    await settle(r);
    expect(screen.getByTestId('terrain-compare-view')).toBeTruthy();
    const world = worlds(r.compare.sent).at(-1);
    expect(world?.spec.source).toEqual({
      preset: 'minecraft:normal',
      dimension: 'minecraft:overworld',
    });
    expect(world?.spec.seed).toBe('12');
    // Vanilla's files only: the project's are not laid over them.
    expect(world?.spec.project).toEqual({});
    expect(samples(r.compare.sent, 'biomes').map((m) => m.pass)).toEqual(['coarse', 'fine']);
    expect(screen.getByTestId('terrain-compare-state').dataset.pass).toBe('fine');
    const notes = screen.getByTestId('terrain-compare-notes').textContent ?? '';
    expect(notes).toContain("Vanilla's overworld, from your own Minecraft files");
    expect(notes).toContain(
      'Carved caves, buildings and the land shaped around them show only in the game.',
    );
    // The project's map kept its own world.
    expect(worlds(r.local.sent).every((m) => m.spec.project.dimension !== undefined)).toBe(true);
  });
});

describe('the files B585 wires', () => {
  it('passes the feature facts and the biome additions', async () => {
    const session = fakeSession(project([MORE, LAND]));
    expect(additionAndId('msm/demo/biome_addition/more.json')).toEqual({
      folder: ADDITIONS_FOLDER,
      id: 'demo:more',
    });
    expect(additionAndId('data/demo/worldgen/biome/more.json')).toBeNull();
    const facts = factsOf(session.target);
    expect(facts.featureSteps).toEqual(['underground_ores', 'vegetal_decoration']);
    expect(facts.featureOrder).toEqual({ vegetal_decoration: ['minecraft:flower_default'] });
    let state: unknown = null;
    const files = new TerrainFiles(session, {
      onFiles: (next) => {
        state = next;
      },
      readVanilla: async () => null,
    });
    await files.refresh();
    const map = (state as { project: Record<string, Record<string, unknown>> }).project;
    expect(map[ADDITIONS_FOLDER]?.['demo:more']).toEqual(MORE.data);
    expect(map['worldgen/noise_settings']).toHaveProperty('demo:land');
    files.dispose();
  });
});
