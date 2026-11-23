// @vitest-environment happy-dom
import type { Element, OutputFile, Project, Target } from '@msm/plugin-api';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forbiddenIn } from '../../../src/renderer/src/components/ai/ai-words';
import { PlainContext } from '../../../src/renderer/src/components/ui/MoreOptions';
import {
  type MapRegion,
  TerrainClient,
  type WorkerInbound,
} from '../../../src/renderer/src/terrain/client';
import {
  forgetVanillaWorldgen,
  TERRAIN_DEBOUNCE_MS,
  type WorldgenKindLike,
  type WorldgenSession,
} from '../../../src/renderer/src/terrain/files';
import { useTerrainView } from '../../../src/renderer/src/terrain/view-store';
import WorldMap, {
  createTerrainSession,
  type TerrainSessionHandle,
} from '../../../src/renderer/src/terrain/WorldMap';
import type { TerrainEngine } from '../../../src/renderer/src/terrain/worker';
import type { VanillaWorldgenFiles } from '../../../src/shared/platform';
import { fakeEngine, type LocalWorker, localWorker } from './fake-engine';

const ROOT = '/projects/demo';
const FOLDERS = ['dimension_type', 'worldgen/biome', 'worldgen/noise_settings'];

function target(approximate: ('end' | 'biome_layout')[] = ['end']): Target {
  return {
    id: 'mc-26.3',
    mcVersion: '26.3',
    worldgen: { terrainPreview: { dataFolders: FOLDERS, approximate } },
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
      return [{ path: `data/${ns}/${folder}/${path}.json`, contents: e.data, layer: 'datapack' }];
    },
  };
}

function fakeSession(start: Project, t: Target = target()) {
  const kinds = new Map<string, WorldgenKindLike>(
    [
      'dimension',
      'worldgen/noise_settings',
      'worldgen/biome',
      'worldgen/material_rule',
      'worldgen/world_preset',
    ].map((folder) => [`minecraft:${folder}`, kind(folder)]),
  );
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
  return { session, edit };
}

/**
 * The fake engine, but a world names what it cannot find: the dimension's noise settings when
 * neither the project nor vanilla has them (as the real engine's walker does).
 */
function engineWithFiles(): ReturnType<typeof fakeEngine> {
  const base = fakeEngine();
  const engine: TerrainEngine = {
    ...base.engine,
    createTerrainWorld(input) {
      const world = base.engine.createTerrainWorld(input);
      const source = input.source as { dimension: string };
      const dimension = input.files.project.dimension?.[source.dimension] as
        | { generator?: { settings?: string } }
        | undefined;
      const settings = dimension?.generator?.settings;
      const known =
        settings === undefined ||
        input.files.project['worldgen/noise_settings']?.[settings] !== undefined ||
        input.files.vanilla?.['worldgen/noise_settings']?.[settings] !== undefined;
      const missing = known
        ? []
        : [
            {
              kind: 'file' as const,
              type: `worldgen/noise_settings/${settings}`,
              where: source.dimension,
              drawnInstead: 'Nothing: the file is missing.',
            },
          ];
      return { ...world, unsupported: () => [...world.unsupported(), ...missing] };
    },
  };
  return { engine, calls: base.calls };
}

const OWN_LAND = element('demo:land', 'minecraft:worldgen/noise_settings', { sea_level: 40 });
const OWN_WORLD = element('demo:world', 'minecraft:dimension', {
  type: 'minecraft:overworld',
  generator: {
    type: 'minecraft:noise',
    settings: 'demo:land',
    biome_source: { type: 'minecraft:fixed', biome: 'demo:moor' },
  },
});
const VANILLA_WORLD = element('demo:vanilla', 'minecraft:dimension', {
  type: 'minecraft:overworld',
  generator: {
    type: 'minecraft:noise',
    settings: 'minecraft:overworld',
    biome_source: { type: 'minecraft:fixed', biome: 'minecraft:plains' },
  },
});
const MOOR = element('demo:moor', 'minecraft:worldgen/biome', { temperature: 0.4 });

const VANILLA: VanillaWorldgenFiles = {
  version: '26.3',
  files: { 'worldgen/noise_settings': { 'minecraft:overworld': { sea_level: 63 } } },
  fileCount: 1,
  resolvedBiomeLists: null,
};

interface Rig {
  readonly local: LocalWorker;
  readonly handle: TerrainSessionHandle;
  readonly edit: (next: Project) => void;
  readonly calls: ReturnType<typeof fakeEngine>['calls'];
}

function rig(start: Project, vanilla: VanillaWorldgenFiles | null): Rig {
  const { engine, calls } = engineWithFiles();
  const local = localWorker(engine);
  const client = new TerrainClient({ createWorker: () => local.worker });
  const { session, edit } = fakeSession(start);
  const handle = createTerrainSession(session, { client, readVanilla: async () => vanilla });
  return { local, handle, edit, calls };
}

async function settle(local: LocalWorker, rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await local.flush();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function show(
  r: Rig,
  start: Project,
  chosen: Element,
  setup: () => void = () => undefined,
  plain = true,
) {
  return render(
    <PlainContext.Provider value={plain}>
      <WorldMap
        session={undefined as unknown as WorldgenSession}
        terrain={r.handle}
        root={ROOT}
        project={start}
        element={chosen}
        vanillaReady={false}
        onSetup={setup}
        worlds={null}
      />
    </PlainContext.Provider>,
  );
}

type SampleMessage = Extract<WorkerInbound, { pass: 'coarse' | 'fine' }>;
const biomeRequests = (sent: WorkerInbound[]): SampleMessage[] =>
  sent.filter((m): m is SampleMessage => m.type === 'biomes');

beforeEach(() => {
  forgetVanillaWorldgen();
  useTerrainView.getState().reset();
  useTerrainView.getState().setView(ROOT, { seed: '12', x: 0, z: 0, zoom: 4, mode: 'biomes' });
});
afterEach(cleanup);

describe('WorldMap', () => {
  it('draws a world of project files without the jar, coarse then fine', async () => {
    const start = project([OWN_LAND, OWN_WORLD, MOOR]);
    const r = rig(start, null);
    show(r, start, OWN_WORLD);
    await settle(r.local);
    expect(screen.queryByTestId('terrain-set-up')).toBeNull();
    const requests = biomeRequests(r.local.sent);
    expect(requests.map((m) => m.pass)).toEqual(['coarse', 'fine']);
    const fine = requests[1]?.region as MapRegion;
    expect(fine.step).toBe(4);
    // 256 pixels at 4 blocks a pixel, widened to aligned corners.
    expect(fine.width).toBe(256 * 4 + 64);
    expect(fine.x0).toBe(-512);
    const readout = screen.getByTestId('terrain-state');
    expect(readout.dataset.pass).toBe('fine');
    expect(readout.dataset.banner).toBe('no');
    expect(screen.getByTestId('terrain-preview-tag').textContent).toBe('Preview');
  });

  it('shows the set-up banner for a world that names a vanilla file without the jar', async () => {
    const start = project([VANILLA_WORLD]);
    const r = rig(start, null);
    let opened = 0;
    show(r, start, VANILLA_WORLD, () => {
      opened += 1;
    });
    await settle(r.local);
    const banner = screen.getByTestId('terrain-set-up');
    expect(banner.textContent).toContain(
      "This world uses Minecraft's own land files. Set up your Minecraft folder to see it here.",
    );
    expect(biomeRequests(r.local.sent)).toHaveLength(0);
    expect(screen.queryByTestId('terrain-map')).toBeNull();
    fireEvent.click(screen.getByText('Set up Minecraft folder'));
    expect(opened).toBe(1);
  });

  it('draws the same world once the jar is there', async () => {
    const start = project([VANILLA_WORLD]);
    const r = rig(start, VANILLA);
    show(r, start, VANILLA_WORLD);
    await settle(r.local);
    expect(screen.queryByTestId('terrain-set-up')).toBeNull();
    expect(biomeRequests(r.local.sent).length).toBeGreaterThan(0);
  });

  it('lists what the engine could not work out, and the approximate parts, in the notes', async () => {
    const start = project([OWN_LAND, OWN_WORLD, MOOR]);
    const r = rig(start, null);
    show(r, start, OWN_WORLD);
    await settle(r.local);
    const notes = screen.getByTestId('terrain-notes').textContent ?? '';
    // The fake engine reports `minecraft:bandlands` in `demo:land`.
    expect(notes).toContain('This world uses bandlands (in land)');
    expect(notes).toContain('left flat');
    expect(notes).toContain('Carved caves and buildings show only in the game.');
    // Not the End and not a climate world: no "about right" line on this target.
    expect(notes).not.toContain('about right');
  });

  it('an edit asks the worker for a coarse pass when the debounce ends', async () => {
    const start = project([OWN_LAND, OWN_WORLD, MOOR]);
    const r = rig(start, null);
    show(r, start, OWN_WORLD);
    await settle(r.local);
    const before = r.local.sent.length;
    const coarseAsked = (): boolean => {
      const after = r.local.sent.slice(before);
      return (
        after.some((m) => m.type === 'world') &&
        biomeRequests(after).some((m) => m.pass === 'coarse')
      );
    };
    // The debounce is timed on a fake clock: under a loaded machine wall-clock timers fire late,
    // so the test steps the clock itself and nothing here depends on how fast the machine is.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const edited = element('demo:land', 'minecraft:worldgen/noise_settings', { sea_level: 50 });
      act(() => r.edit(project([edited, OWN_WORLD, MOOR])));
      // Nothing is asked before the debounce ends, however long the work in between takes.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(TERRAIN_DEBOUNCE_MS - 1);
        await r.local.flush();
      });
      expect(r.local.sent.length).toBe(before);
      // The last millisecond: the files are read again and the coarse pass is asked, with no
      // more waiting than the zero-delay steps the work itself takes.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      for (let i = 0; i < 20 && !coarseAsked(); i += 1) {
        await act(async () => {
          await r.local.flush();
          await vi.advanceTimersByTimeAsync(0);
        });
      }
    } finally {
      vi.useRealTimers();
    }
    expect(coarseAsked()).toBe(true);
    const world = r.local.sent.slice(before).find((m) => m.type === 'world');
    expect(
      (world as Extract<WorkerInbound, { type: 'world' }>).spec.project['worldgen/noise_settings'],
    ).toEqual({ 'demo:land': { sea_level: 50 } });
  });

  it('pans and zooms with the keyboard on the focused map', async () => {
    const start = project([OWN_LAND, OWN_WORLD, MOOR]);
    const r = rig(start, null);
    show(r, start, OWN_WORLD);
    await settle(r.local);
    const map = screen.getByTestId('terrain-map');
    map.focus();
    fireEvent.keyDown(map, { key: 'ArrowRight' });
    expect(useTerrainView.getState().views.get(ROOT)?.x).toBe(16 * 4);
    fireEvent.keyDown(map, { key: 'ArrowDown', shiftKey: true });
    expect(useTerrainView.getState().views.get(ROOT)?.z).toBe(64 * 4);
    fireEvent.keyDown(map, { key: '+' });
    expect(useTerrainView.getState().views.get(ROOT)?.zoom).toBe(1);
    fireEvent.keyDown(map, { key: '-' });
    fireEvent.keyDown(map, { key: '-' });
    expect(useTerrainView.getState().views.get(ROOT)?.zoom).toBe(16);
    fireEvent.keyDown(map, { key: 'Home' });
    expect(useTerrainView.getState().views.get(ROOT)).toMatchObject({ x: 0, z: 0 });
    await settle(r.local);
    // The last view asked for a map at 16 blocks a pixel around spawn.
    const last = biomeRequests(r.local.sent).at(-1)?.region as MapRegion;
    expect(last.step).toBe(16);
    expect(last.x0).toBe(-2048);
  });

  it('shades Height from a coarser grid first, then twice as fine in bands', async () => {
    useTerrainView.getState().setView(ROOT, { mode: 'height' });
    const start = project([OWN_LAND, OWN_WORLD, MOOR]);
    const r = rig(start, null);
    show(r, start, OWN_WORLD);
    await settle(r.local, 12);
    const heights = r.calls
      .filter((c) => c.fn === 'heights')
      .map((c) => (c.region as MapRegion).step);
    // Step 16 (coarse 64, then 16), then four bands at step 8 (each coarse 32, then 8).
    expect(heights.slice(0, 2)).toEqual([64, 16]);
    expect(heights.filter((s) => s === 8)).toHaveLength(4);
    expect(screen.getByTestId('terrain-notes').textContent).toContain(
      'Height is shaded from one sample every 8 blocks.',
    );
  });

  it('shows a biome inside the worlds that use it, lit, with its share and Find it', async () => {
    const start = project([OWN_LAND, OWN_WORLD, MOOR]);
    const r = rig(start, null);
    show(r, start, MOOR);
    await settle(r.local);
    const picker = screen.getByTestId('terrain-host') as HTMLSelectElement;
    expect([...picker.options].map((o) => o.textContent)).toEqual([
      'World',
      "A plain world: this biome everywhere on the overworld's land",
    ]);
    // The fake engine's map is all plains: the moor covers none of it.
    expect(screen.getByTestId('terrain-share').textContent).toBe(
      'This biome covers 0 % of the view.',
    );
    fireEvent.click(screen.getByTestId('terrain-find'));
    expect(
      screen.getByText('Not in this view. Zoom out or move the map to look further.'),
    ).toBeTruthy();
  });

  it('labels the End and a climate world as the target says', async () => {
    const end = element('demo:end', 'minecraft:dimension', {
      type: 'minecraft:the_end',
      generator: {
        type: 'minecraft:noise',
        settings: 'demo:land',
        biome_source: { type: 'minecraft:the_end' },
      },
    });
    const start = project([OWN_LAND, end]);
    const r = rig(start, null);
    show(r, start, end);
    await settle(r.local);
    expect(screen.getByTestId('terrain-notes').textContent).toContain(
      'The End is about right here.',
    );
  });
});

/** Every readable string of `root` that Very easy forbids (text, attributes, input values). */
function leaksIn(root: HTMLElement): string[] {
  const texts: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.parentElement?.closest('style, script') != null) continue;
    const text = node.textContent?.trim() ?? '';
    if (text !== '') texts.push(text);
  }
  for (const entry of root.querySelectorAll('*')) {
    for (const attribute of ['placeholder', 'title', 'aria-label', 'alt']) {
      const value = entry.getAttribute(attribute);
      if (value !== null && value.trim() !== '') texts.push(value);
    }
  }
  return texts
    .map((text) => ({ text, found: forbiddenIn(text).filter((hit) => !/^\d+:\d+$/.test(hit)) }))
    .filter((entry) => entry.found.length > 0)
    .map((entry) => `${entry.found.join(', ')} in "${entry.text}"`);
}

describe('WorldMap in plain words (ADR 0083 D3, ADR 0130 D2)', () => {
  const PRESET = element('demo:islands', 'minecraft:worldgen/world_preset', {
    dimensions: {
      'minecraft:overworld': OWN_WORLD.data,
      'minecraft:the_nether': OWN_WORLD.data,
      'demo:sky': OWN_WORLD.data,
    },
  });
  const SKY = element('demo:sky', 'minecraft:dimension', {
    ...(OWN_WORLD.data as object),
    display_name: 'Sky Realm',
  });

  it('names a world type’s dimensions in words, never by id', async () => {
    const start = project([OWN_LAND, MOOR, SKY, PRESET]);
    const r = rig(start, null);
    const { container } = show(r, start, PRESET);
    await settle(r.local);
    const picker = screen.getByTestId('terrain-host') as HTMLSelectElement;
    expect([...picker.options].map((o) => o.textContent)).toEqual([
      'The Overworld',
      'The Nether',
      'Sky Realm',
    ]);
    expect(leaksIn(container)).toEqual([]);
  });

  it('names the worlds a biome is seen in, never by id', async () => {
    const start = project([OWN_LAND, OWN_WORLD, MOOR]);
    const r = rig(start, null);
    const { container } = show(r, start, MOOR);
    await settle(r.local);
    const picker = screen.getByTestId('terrain-host') as HTMLSelectElement;
    expect(picker.options[0]?.textContent).toBe('World');
    expect(leaksIn(container)).toEqual([]);
  });

  it('keeps the ids inside a More options', async () => {
    const start = project([OWN_LAND, MOOR, SKY, PRESET]);
    const r = rig(start, null);
    show(r, start, PRESET, () => undefined, false);
    await settle(r.local);
    const picker = screen.getByTestId('terrain-host') as HTMLSelectElement;
    expect(picker.options[0]?.textContent).toBe('minecraft:overworld');
  });
});
