// @vitest-environment happy-dom
/**
 * The Creator's Map tab (B587, ADR 0119 D11): a world or dimension flow opens on the live map of
 * the world its answers make, drawn from the bundle laid over the project in memory; a new answer
 * hands the map a new project. The real Islands flow goes through the memory session's built-in
 * kinds and `TerrainFiles` to the files the engine reads, and a changed answer changes them.
 */
import type { Project, ResourceLocation } from '@msm/core';
import type { ContentBundle, Json, ProjectStarter, Target } from '@msm/plugin-api';
import { libraryStarters } from '@msm/plugin-library';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bundleWorld,
  CREATOR_MAP_TAB,
  CreatorPreview,
} from '../../src/renderer/src/components/creator/CreatorPreview';
import type { CreatorTab } from '../../src/renderer/src/components/creator/creator-model';
import { bundlePreviewProject } from '../../src/renderer/src/preview/bundle-source';
import { TerrainFiles, type TerrainFilesState } from '../../src/renderer/src/terrain/files';
import { hostsFor } from '../../src/renderer/src/terrain/hosts';
import { builtInKinds, MemoryWorldgenSession } from '../../src/renderer/src/terrain/LiveMap';

const shown: Record<string, unknown>[] = [];

vi.mock('../../src/renderer/src/terrain/LiveMap', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/renderer/src/terrain/LiveMap')>();
  return {
    ...real,
    default: (props: Record<string, unknown>) => {
      shown.push(props);
      return <div data-testid="creator-map-stub" />;
    },
  };
});

afterEach(() => {
  cleanup();
  shown.length = 0;
});

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target as Target;

function islands(values: Record<string, Json> = {}): ContentBundle {
  const flow = libraryStarters.find((entry) => entry.id === 'world-islands') as ProjectStarter;
  const defaults = Object.fromEntries(
    (flow.parameters ?? []).map((parameter) => [parameter.id, parameter.default]),
  );
  return flow.build({
    namespace: 'demo',
    projectName: 'Worlds',
    target,
    values: { ...defaults, ...values },
  }) as ContentBundle;
}

const project = {
  formatVersion: 1,
  name: 'Demo',
  namespaces: [{ name: 'demo', elements: [], assets: [] }],
  plugins: [],
  settings: {},
  targets: [target.id],
} as unknown as Project;

const props = {
  revision: 1,
  plan: null,
  project,
  folders: { textures: 'textures', models: 'models', blockstates: 'blockstates' } as never,
  readProjectAsset: async () => null,
  vanilla: null,
  overwrite: new Set<string>(),
  onOverwriteChange: vi.fn(),
  webgl: false,
};

describe('bundleWorld', () => {
  it('names the world preset of a world flow, a dimension otherwise, else nothing', () => {
    const bundle = islands();
    const preset = bundle.elements.find((e) => e.kind === 'minecraft:worldgen/world_preset');
    expect(bundleWorld(bundle)).toEqual({
      kind: 'minecraft:worldgen/world_preset',
      id: preset?.id,
    });
    const dimension = {
      elements: [{ id: 'demo:moon' as ResourceLocation, kind: 'minecraft:dimension', data: {} }],
      assets: [],
    } as ContentBundle;
    expect(bundleWorld(dimension)).toEqual({ kind: 'minecraft:dimension', id: 'demo:moon' });
    expect(bundleWorld({ elements: [], assets: [] })).toBeNull();
  });
});

describe('the Map tab', () => {
  it('opens on the Map and draws the bundle in memory, following each answer', async () => {
    const onTabChange = vi.fn();
    const first = islands();
    const view = (bundle: ContentBundle, tab: string) => (
      <CreatorPreview
        {...props}
        bundle={bundle}
        tab={tab as CreatorTab}
        onTabChange={onTabChange}
      />
    );
    const shownView = render(view(first, 'elements'));
    expect(screen.getByTestId('creator-tab-map').textContent).toBe(CREATOR_MAP_TAB.label);
    expect(onTabChange).toHaveBeenCalledWith('map');
    shownView.rerender(view(first, 'map'));
    expect(screen.getByTestId('creator-map')).toBeTruthy();
    expect(await screen.findByTestId('creator-map-stub')).toBeTruthy();
    const firstProps = shown.at(-1) as {
      owner: string;
      mode: string;
      project: Project;
      element: { id: string; kind: string };
      vanillaReady: boolean;
    };
    expect(firstProps.owner).toBe('creator');
    expect(firstProps.mode).toBe('element');
    expect(firstProps.element.kind).toBe('minecraft:worldgen/world_preset');
    expect(firstProps.vanillaReady).toBe(false);
    // The bundle is laid over the project in memory; the project itself is untouched.
    const ids = firstProps.project.namespaces.flatMap((ns) => ns.elements.map((e) => e.id));
    expect(ids).toContain(firstProps.element.id);
    expect(project.namespaces[0]?.elements).toHaveLength(0);
    // A new answer: a new project handed to the map, and the tab is not switched again.
    const calls = onTabChange.mock.calls.length;
    const second = islands({ sea: 'lots' });
    shownView.rerender(view(second, 'map'));
    await act(async () => undefined);
    const secondProps = shown.at(-1) as { project: Project };
    expect(secondProps.project).not.toBe(firstProps.project);
    expect(onTabChange.mock.calls.length).toBe(calls);
  });

  it('has no Map tab for a flow that makes no world', () => {
    render(
      <CreatorPreview
        {...props}
        bundle={{ elements: [], assets: [] }}
        tab="elements"
        onTabChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('creator-tab-map')).toBeNull();
  });
});

describe("the Creator's memory session", () => {
  it('lowers the Islands flow with the built-in kinds into the files the map reads, and an answer changes them', async () => {
    const session = new MemoryWorldgenSession(
      bundlePreviewProject(project, islands()),
      target,
      builtInKinds(),
    );
    const states: TerrainFilesState[] = [];
    const files = new TerrainFiles(session, {
      onFiles: (state) => states.push(state),
      readVanilla: async () => null,
      debounceMs: 1,
    });
    const first = await files.refresh();
    expect(first).not.toBeNull();
    const state = first as TerrainFilesState;
    expect(state.problems).toEqual([]);
    const presets = Object.keys(state.project['worldgen/world_preset'] ?? {});
    expect(presets).toHaveLength(1);
    const presetId = presets[0] as string;
    const hosts = hostsFor(
      { kind: 'minecraft:worldgen/world_preset', id: presetId, data: null },
      state.project,
      null,
    );
    expect(hosts.map((host) => host.source)).toContainEqual({
      preset: presetId,
      dimension: 'minecraft:overworld',
    });
    session.set(bundlePreviewProject(project, islands({ sea: 'lots' })), target);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(states.length).toBe(2);
    expect(states[1]?.filesHash).not.toBe(state.filesHash);
    files.dispose();
  });
});
