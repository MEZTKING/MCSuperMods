// @vitest-environment happy-dom
/**
 * The live map outside the preview panel (B587): a session held in memory that hands on each new
 * project, the element's own map, a world of the project that uses the element (Seen in), the
 * line when none does, and the built-in kinds it lowers with.
 */
import type { Element, OutputFile, Project, Target } from '@msm/plugin-api';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TerrainClient, type WorkerInbound } from '../../../src/renderer/src/terrain/client';
import {
  forgetVanillaWorldgen,
  TERRAIN_DEBOUNCE_MS,
  type WorldgenKindLike,
} from '../../../src/renderer/src/terrain/files';
import LiveMap, {
  builtInKinds,
  hostElement,
  MemoryWorldgenSession,
  projectHosts,
} from '../../../src/renderer/src/terrain/LiveMap';
import { useTerrainView } from '../../../src/renderer/src/terrain/view-store';
import WorldMap, {
  createTerrainSession,
  type TerrainSessionHandle,
} from '../../../src/renderer/src/terrain/WorldMap';
import { useTryItStore } from '../../../src/renderer/src/tryit/tryit-store';
import { fakeEngine, type LocalWorker, localWorker } from './fake-engine';

const ROOT = '/projects/demo';
const FOLDERS = [
  'dimension_type',
  'worldgen/biome',
  'worldgen/noise_settings',
  'worldgen/placed_feature',
  'worldgen/world_preset',
];

const TARGET = {
  id: 'mc-26.3',
  mcVersion: '26.3',
  worldgen: { terrainPreview: { dataFolders: FOLDERS, approximate: [] } },
} as unknown as Target;

function element(id: string, kind: string, data: unknown): Element {
  return { id, kind, data, formatVersion: 1, meta: { createdAt: '' } } as Element;
}

function project(elements: Element[]): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    namespaces: [{ name: 'demo', elements, assets: [] }],
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
      return [{ path: `data/${ns}/${folder}/${path}.json`, contents: e.data, layer: 'datapack' }];
    },
  };
}

const KINDS = new Map<string, WorldgenKindLike>(
  ['dimension', 'dimension_type', ...FOLDERS.filter((f) => f !== 'dimension_type')].map(
    (folder) => [`minecraft:${folder}`, kind(folder)],
  ),
);

const LAND = element('demo:land', 'minecraft:worldgen/noise_settings', { sea_level: 40 });
const MOOR = element('demo:moor', 'minecraft:worldgen/biome', {
  temperature: 0.4,
  features: [[], ['demo:heather']],
});
const HEATHER = element('demo:heather', 'minecraft:worldgen/placed_feature', {
  feature: 'minecraft:oak',
  placement: [],
});
const LONELY = element('demo:lonely', 'minecraft:worldgen/placed_feature', {
  feature: 'minecraft:oak',
  placement: [],
});
const world = (id: string, seaLevelSettings = 'demo:land') =>
  element(id, 'minecraft:dimension', {
    type: 'minecraft:overworld',
    generator: {
      type: 'minecraft:noise',
      settings: seaLevelSettings,
      biome_source: { type: 'minecraft:fixed', biome: 'demo:moor' },
    },
  });

interface Rig {
  readonly local: LocalWorker;
  readonly session: MemoryWorldgenSession;
  readonly handle: TerrainSessionHandle;
}

function rig(start: Project): Rig {
  const { engine } = fakeEngine();
  const local = localWorker(engine);
  const client = new TerrainClient({ createWorker: () => local.worker });
  const session = new MemoryWorldgenSession(start, TARGET, { get: (id) => KINDS.get(id) });
  const handle = createTerrainSession(session, {
    client,
    readVanilla: async () => null,
    debounceMs: TERRAIN_DEBOUNCE_MS,
  });
  return { local, session, handle };
}

async function settle(local: LocalWorker, rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await local.flush();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

const worlds = (sent: WorkerInbound[]) =>
  sent.filter((m): m is Extract<WorkerInbound, { type: 'world' }> => m.type === 'world');

beforeEach(() => {
  forgetVanillaWorldgen();
  useTerrainView.getState().reset();
  useTerrainView.getState().setView(ROOT, { seed: '12', x: 0, z: 0, zoom: 4, mode: 'biomes' });
});
afterEach(cleanup);

describe('MemoryWorldgenSession', () => {
  it('hands on a new project to its listeners, and nothing for the same one', () => {
    const start = project([LAND]);
    const session = new MemoryWorldgenSession(start, TARGET, { get: () => undefined });
    const seen: (Project | null)[] = [];
    session.subscribe((snapshot) => seen.push(snapshot.project));
    session.set(start, TARGET);
    expect(seen).toHaveLength(0);
    const next = project([LAND, MOOR]);
    session.set(next, TARGET);
    expect(seen).toEqual([next]);
    expect(session.snapshot.project).toBe(next);
  });

  it('lowers with the built-in kinds: every worldgen kind the map reads is there', () => {
    const kinds = builtInKinds();
    for (const id of [
      'minecraft:dimension',
      'minecraft:dimension_type',
      'minecraft:worldgen/world_preset',
      'minecraft:worldgen/noise_settings',
      'minecraft:worldgen/biome',
      'minecraft:worldgen/placed_feature',
    ]) {
      expect(kinds.get(id)?.folder, id).toBeTypeOf('string');
    }
    expect(builtInKinds()).toBe(kinds);
  });
});

describe('projectHosts and hostElement', () => {
  it('finds the project worlds that use an element, and their elements', () => {
    const own = world('demo:world');
    const start = project([LAND, MOOR, HEATHER, own]);
    const files = {
      dimension: { 'demo:world': own.data },
      'worldgen/biome': { 'demo:moor': MOOR.data },
    };
    const hosts = projectHosts(HEATHER, files);
    expect(hosts.map((h) => h.key)).toEqual(['dimension:demo:world']);
    expect(hostElement(start, hosts[0] as never)).toBe(own);
    expect(projectHosts(LONELY, files)).toEqual([]);
  });
});

describe('LiveMap', () => {
  it("draws the element's own world and redraws when the project held in memory changes", async () => {
    const own = world('demo:world');
    const start = project([LAND, MOOR, own]);
    const r = rig(start);
    const view = (p: Project) => (
      <LiveMap
        owner="creator"
        project={p}
        target={TARGET}
        element={own}
        mode="element"
        root={ROOT}
        vanillaReady={false}
        onSetup={() => undefined}
        testId="live"
        terrain={r.handle}
      />
    );
    const shown = render(view(start));
    await settle(r.local);
    expect(screen.getByTestId('live')).toBeTruthy();
    expect(screen.getByTestId('terrain-preview-tag').textContent).toBe('Preview');
    expect(screen.getByTestId('terrain-notes')).toBeTruthy();
    const before = worlds(r.local.sent).length;
    expect(before).toBeGreaterThan(0);
    // An answer changes the world: the session gets the new project, the map a new world.
    const next = project([
      element('demo:land', 'minecraft:worldgen/noise_settings', { sea_level: 70 }),
      MOOR,
      own,
    ]);
    r.session.set(next, TARGET);
    shown.rerender(view(next));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, TERRAIN_DEBOUNCE_MS + 20));
    });
    await settle(r.local);
    expect(worlds(r.local.sent).length).toBeGreaterThan(before);
  });

  it('shows a world that uses a placed feature, with Seen in for more than one', async () => {
    const first = world('demo:world');
    const second = world('demo:other');
    const start = project([LAND, MOOR, HEATHER, first, second]);
    const r = rig(start);
    const hostsSeen: (string | null)[] = [];
    render(
      <LiveMap
        owner="studio"
        project={start}
        target={TARGET}
        element={HEATHER}
        mode="host"
        root={ROOT}
        vanillaReady={false}
        onSetup={() => undefined}
        onHost={(key) => hostsSeen.push(key)}
        testId="live"
        terrain={r.handle}
      />,
    );
    await settle(r.local);
    const seenIn = screen.getByTestId('live-seen-in') as HTMLSelectElement;
    expect([...seenIn.options].map((o) => o.value)).toEqual([
      'dimension:demo:world',
      'dimension:demo:other',
    ]);
    expect(hostsSeen.at(-1)).toBe('dimension:demo:world');
    fireEvent.change(seenIn, { target: { value: 'dimension:demo:other' } });
    await settle(r.local);
    expect(hostsSeen.at(-1)).toBe('dimension:demo:other');
    expect(screen.getByTestId('terrain-preview-tag')).toBeTruthy();
  });

  it('says so when no world of the project uses the element', async () => {
    const start = project([LAND, MOOR, HEATHER, LONELY, world('demo:world')]);
    const r = rig(start);
    render(
      <LiveMap
        owner="studio"
        project={start}
        target={TARGET}
        element={LONELY}
        mode="host"
        root={ROOT}
        vanillaReady={false}
        onSetup={() => undefined}
        testId="live"
        terrain={r.handle}
      />,
    );
    await settle(r.local);
    expect(screen.getByTestId('live-none').textContent).toContain(
      'No world of yours uses this yet',
    );
  });

  it('leaves Walk in it to the line outside the preview panel', async () => {
    const own = world('demo:world');
    const start = project([LAND, MOOR, own]);
    const r = rig(start);
    render(
      <LiveMap
        owner="studio"
        project={start}
        target={TARGET}
        element={own}
        mode="element"
        root={ROOT}
        vanillaReady={false}
        onSetup={() => undefined}
        testId="live"
        terrain={r.handle}
      />,
    );
    await settle(r.local);
    expect(screen.getByTestId('terrain-preview-tag')).toBeTruthy();
    expect(screen.queryByTestId('terrain-walk-in')).toBeNull();
  });
});

describe("the preview panel map's Walk in it", () => {
  it('opens Try it on My world generation over the world shown, keeping the view', async () => {
    useTryItStore.getState().reset();
    const own = world('demo:world');
    const start = project([LAND, MOOR, own]);
    const r = rig(start);
    render(
      <WorldMap
        session={r.session}
        terrain={r.handle}
        root={ROOT}
        project={start}
        element={own}
        vanillaReady={false}
        onSetup={() => undefined}
        worlds={null}
      />,
    );
    await settle(r.local);
    fireEvent.click(screen.getByTestId('terrain-walk-in'));
    const tryIt = useTryItStore.getState();
    expect(tryIt.open).toBe(true);
    expect(tryIt.groundRequest).toEqual({ kind: 'generated', sourceKey: 'dimension:demo:world' });
    expect(useTerrainView.getState().views.get(ROOT)?.seed).toBe('12');
  });

  it('is not offered for a plain world made around an element', async () => {
    const start = project([LAND, MOOR]);
    const r = rig(start);
    render(
      <WorldMap
        session={r.session}
        terrain={r.handle}
        root={ROOT}
        project={start}
        element={LAND}
        vanillaReady={false}
        onSetup={() => undefined}
        worlds={null}
      />,
    );
    await settle(r.local);
    expect(screen.getByTestId('terrain-preview-tag')).toBeTruthy();
    expect(screen.queryByTestId('terrain-walk-in')).toBeNull();
  });
});
