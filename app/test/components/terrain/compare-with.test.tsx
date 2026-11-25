// @vitest-environment happy-dom
/**
 * The world map's compare slot (B819, ADR 0136 D13): with `compareWith`, another session's
 * world (the upgrade report's "Before the move") is drawn in Compare with vanilla's place, from
 * its own files and worker, shown from the start, named by its label and note, and with no jar
 * set up. Without it, Compare with vanilla is as before.
 */
import type { Element, OutputFile, Project, Target } from '@msm/plugin-api';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TerrainClient, type WorkerInbound } from '../../../src/renderer/src/terrain/client';
import {
  forgetVanillaWorldgen,
  type WorldgenKindLike,
  type WorldgenSession,
} from '../../../src/renderer/src/terrain/files';
import { useTerrainView } from '../../../src/renderer/src/terrain/view-store';
import WorldMap, {
  createTerrainSession,
  type TerrainSessionHandle,
} from '../../../src/renderer/src/terrain/WorldMap';
import { fakeEngine, type LocalWorker, localWorker } from './fake-engine';

const ROOT = '/projects/demo';
const FOLDERS = ['dimension_type', 'worldgen/biome', 'worldgen/noise_settings'];

function target(id: string, mcVersion: string): Target {
  return {
    id,
    mcVersion,
    worldgen: { terrainPreview: { dataFolders: FOLDERS, approximate: [] } },
  } as unknown as Target;
}

function element(id: string, kind: string, data: unknown): Element {
  return { id, kind, data, formatVersion: 1, meta: { createdAt: '' } } as Element;
}

function project(targetId: string, elements: Element[]): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    namespaces: [{ namespace: 'demo', elements }],
    plugins: [],
    settings: {},
    targets: [targetId],
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
  ['dimension', 'worldgen/noise_settings', 'worldgen/biome'].map((folder) => [
    `minecraft:${folder}`,
    kind(folder),
  ]),
);

function side(start: Project, on: Target): { worker: LocalWorker; handle: TerrainSessionHandle } {
  const worker = localWorker(fakeEngine().engine);
  const session = {
    snapshot: { project: start as Project | null },
    subscribe: () => () => undefined,
    registry: { get: (id: string) => KINDS.get(id) },
    target: on,
  } satisfies WorldgenSession;
  const handle = createTerrainSession(session, {
    client: new TerrainClient({ createWorker: () => worker.worker }),
    readVanilla: async () => null,
  });
  return { worker, handle };
}

const landOf = (seaLevel: number) =>
  element('demo:land', 'minecraft:worldgen/noise_settings', { sea_level: seaLevel });
const WORLD = element('demo:world', 'minecraft:dimension', {
  type: 'minecraft:overworld',
  generator: {
    type: 'minecraft:noise',
    settings: 'demo:land',
    biome_source: { type: 'minecraft:fixed', biome: 'demo:moor' },
  },
});

type WorldMessage = Extract<WorkerInbound, { type: 'world' }>;
const worlds = (sent: WorkerInbound[]): WorldMessage[] =>
  sent.filter((m): m is WorldMessage => m.type === 'world');

beforeEach(() => {
  forgetVanillaWorldgen();
  useTerrainView.getState().reset();
  useTerrainView.getState().setView(ROOT, { seed: '12', x: 0, z: 0, zoom: 4, mode: 'biomes' });
});
afterEach(cleanup);

describe('the compare slot (B819)', () => {
  it('draws the world before the move in vanilla’s place, from its own files and worker', async () => {
    const before = side(project('old', [landOf(40), WORLD]), target('old', '1.0'));
    const moved = project('new', [landOf(50), WORLD]);
    const after = side(moved, target('new', '2.0'));
    const settle = async (): Promise<void> => {
      for (let i = 0; i < 8; i += 1) {
        await act(async () => {
          await after.worker.flush();
          await before.worker.flush();
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
      }
    };
    render(
      <WorldMap
        session={undefined as unknown as WorldgenSession}
        terrain={after.handle}
        root={ROOT}
        project={moved}
        element={WORLD}
        vanillaReady={false}
        onSetup={() => undefined}
        worlds={null}
        walkIn={false}
        compareWith={{
          label: 'Before the move',
          terrain: before.handle,
          note: 'Your mod as it is now, on Minecraft 1.0.',
        }}
      />,
    );
    await settle();
    const toggle = screen.getByTestId('terrain-compare') as HTMLInputElement;
    // On from the start, and with no jar set up (no banner).
    expect(toggle.checked).toBe(true);
    expect(toggle.disabled).toBe(false);
    expect(toggle.parentElement?.textContent).toContain('Show before the move beside it');
    expect(screen.queryByTestId('terrain-compare-set-up')).toBeNull();
    expect(screen.getByTestId('terrain-compare-view')).toBeTruthy();
    // The before world is the old project's own files, made in its own worker.
    const old = worlds(before.worker.sent).at(-1);
    expect(old?.spec.source).toEqual({ dimension: 'demo:world' });
    expect(old?.spec.seed).toBe('12');
    expect(old?.spec.project['worldgen/noise_settings']?.['demo:land']).toEqual({ sea_level: 40 });
    const now = worlds(after.worker.sent).at(-1);
    expect(now?.spec.project['worldgen/noise_settings']?.['demo:land']).toEqual({ sea_level: 50 });
    const notes = screen.getByTestId('terrain-compare-notes').textContent ?? '';
    expect(notes).toContain('Your mod as it is now, on Minecraft 1.0.');
    expect(notes).not.toContain('Vanilla');
    // It can be switched off.
    fireEvent.click(toggle);
    expect(screen.queryByTestId('terrain-compare-view')).toBeNull();
  });
});
