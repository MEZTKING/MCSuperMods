// @vitest-environment happy-dom

import type { Project } from '@msm/plugin-api';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeneratedGroundPanel, GroundPicker } from '../../../src/renderer/src/tryit/GroundPicker';
import {
  defaultGeneratedSource,
  describeGround,
  GENERATED_WORDS,
  GROUND_CHOICES,
  type GroundChoice,
  generatedNotes,
  generatedSources,
  generatedStripLine,
  NO_GENERATED_HERE,
  NO_GENERATED_SOURCE,
  terrainViewKey,
} from '../../../src/renderer/src/tryit/grounds';
import type { GeneratedGroundState } from '../../../src/renderer/src/tryit/session-source';
import TryItView from '../../../src/renderer/src/tryit/TryItView';
import { useTryItStore } from '../../../src/renderer/src/tryit/tryit-store';
import { fakeSession } from './tryit-fixture';

afterEach(() => {
  cleanup();
  useTryItStore.getState().reset();
});

function project(): Project {
  return {
    formatVersion: 1,
    name: 'Worlds',
    namespaces: [
      {
        namespace: 'demo',
        elements: [
          { id: 'demo:islands', kind: 'minecraft:dimension', data: {} },
          {
            id: 'demo:my_type',
            kind: 'minecraft:worldgen/world_preset',
            data: { dimensions: { 'minecraft:overworld': {}, 'demo:caves': {} } },
          },
          { id: 'demo:ruby', kind: 'msm:block', data: {} },
        ],
      },
    ],
  } as unknown as Project;
}

const SUMMARY = {
  generator: 'noise' as const,
  minY: -64,
  height: 384,
  seaLevel: 63,
  biomesKnown: true,
  seed: '42',
  unsupported: [],
  ms: 10,
};

function state(patch: Partial<GeneratedGroundState> = {}): GeneratedGroundState {
  return {
    status: 'ready',
    stage: 'features',
    asking: null,
    reason: 'new',
    window: { x0: -16, y0: 54, z0: -16, sizeX: 48, sizeY: 32, sizeZ: 48 },
    summary: SUMMARY,
    notes: [GENERATED_WORDS.aboutRight, GENERATED_WORDS.carved],
    error: null,
    times: { terrain: 300, surface: 420, features: 900 },
    editMs: null,
    runs: 1,
    ...patch,
  };
}

describe('My world generation in the grounds list (B584)', () => {
  it('is the fifth ground, in plain words', () => {
    const entry = GROUND_CHOICES.find((choice) => choice.kind === 'generated');
    expect(entry).toEqual({
      kind: 'generated',
      label: 'My world generation',
      line: 'The land your own world makes, around where you stand.',
    });
    // The games grounds (B558) follow it.
    expect(GROUND_CHOICES.map((choice) => choice.kind).indexOf('generated')).toBe(4);
  });

  it('lists the project’s dimensions, then each world type’s dimensions', () => {
    const sources = generatedSources(project());
    expect(sources.map((source) => source.label)).toEqual([
      'Islands',
      'Overworld of My type',
      'Caves of My type',
    ]);
    expect(sources[2]?.ids).toBe('demo:caves of demo:my_type');
    expect(sources[1]?.source).toEqual({
      preset: 'demo:my_type',
      dimension: 'minecraft:overworld',
    });
    expect(defaultGeneratedSource(sources, 'demo:my_type')?.key).toBe(
      'preset:demo:my_type:minecraft:overworld',
    );
    expect(defaultGeneratedSource(sources, 'demo:ruby')?.key).toBe('dimension:demo:islands');
    expect(defaultGeneratedSource([], null)).toBeNull();
    expect(generatedSources(null)).toEqual([]);
    expect(terrainViewKey('/p', null)).toBe('/p');
    expect(terrainViewKey(null, project())).toBe('unsaved:Worlds');
  });

  it('notes what is about right and left out, by the target’s facts', () => {
    const base = {
      facts: {
        dataFolders: [],
        approximate: ['end', 'biome_layout'] as ('end' | 'biome_layout')[],
      },
      summary: SUMMARY,
      end: false,
      climate: true,
      columnNotes: [
        {
          kind: 'feature' as const,
          type: 'about_right',
          where: 'features',
          drawnInstead: GENERATED_WORDS.aboutRight,
        },
        {
          kind: 'feature' as const,
          type: 'minecraft:geode',
          where: 'minecraft:amethyst_geode',
          drawnInstead: 'Nothing: geodes are not drawn in the preview yet.',
        },
      ],
      cutAtTop: true,
      problems: [],
    };
    const notes = generatedNotes(base);
    expect(notes[0]).toBe(GENERATED_WORDS.aboutRight);
    expect(notes).toContain(GENERATED_WORDS.carved);
    expect(notes).toContain(GENERATED_WORDS.shaped);
    expect(notes).toContain(GENERATED_WORDS.borders);
    expect(notes).toContain(GENERATED_WORDS.cut);
    expect(notes).not.toContain(GENERATED_WORDS.end);
    expect(notes.filter((line) => line === GENERATED_WORDS.aboutRight)).toHaveLength(1);
    expect(notes).toContain(
      'This world uses geode (in minecraft:amethyst_geode), which the preview cannot work out yet. Nothing: geodes are not drawn in the preview yet.',
    );
    const end = generatedNotes({ ...base, end: true, summary: { ...SUMMARY, biomesKnown: false } });
    expect(end).toContain(GENERATED_WORDS.end);
    expect(end).not.toContain(GENERATED_WORDS.borders);
    expect(end).toContain(GENERATED_WORDS.biomes);
    expect(generatedStripLine(end)).toBe(`${GENERATED_WORDS.strip} ${GENERATED_WORDS.end}`);
  });

  it('the picker gathers a world, the seed and a place', async () => {
    const sources = generatedSources(project());
    const onApply = vi.fn(async (_choice: GroundChoice) => {});
    render(
      <GroundPicker
        initial="generated"
        hasChanges={false}
        worlds={null}
        texturesFolder="textures"
        generated={{ sources, initial: sources[0] ?? null, seed: '42', centre: { x: 100, z: -7 } }}
        onApply={onApply}
        onClose={() => {}}
      />,
    );
    const panel = screen.getByTestId('tryit-generated');
    const radios = within(panel).getAllByTestId('tryit-generated-source');
    expect(radios).toHaveLength(3);
    fireEvent.click(radios[2] as HTMLElement);
    expect((screen.getByTestId('tryit-generated-x') as HTMLInputElement).value).toBe('100');
    fireEvent.change(screen.getByTestId('tryit-generated-z'), { target: { value: '30' } });
    fireEvent.click(screen.getByTestId('tryit-ground-apply'));
    await vi.waitFor(() => expect(onApply).toHaveBeenCalled());
    const choice = onApply.mock.calls[0]?.[0] as Extract<GroundChoice, { kind: 'generated' }>;
    expect(choice.kind).toBe('generated');
    expect(choice.world.source).toEqual({ preset: 'demo:my_type', dimension: 'demo:caves' });
    expect(choice.seed).toBe('42');
    expect(choice.centre).toEqual({ x: 100, z: 30 });
    expect(describeGround(choice)).toBe('Caves of My type, seed 42');
  });

  it('the picker says when the project has no world to walk in', () => {
    render(
      <GroundPicker
        initial="generated"
        hasChanges={false}
        worlds={null}
        texturesFolder="textures"
        generated={{ sources: [], initial: null, seed: '1', centre: { x: 0, z: 0 } }}
        onApply={async () => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('tryit-generated-none').textContent).toBe(NO_GENERATED_SOURCE);
    fireEvent.click(screen.getByTestId('tryit-ground-apply'));
    expect(screen.getByTestId('tryit-ground-error').textContent).toBe(NO_GENERATED_SOURCE);
  });

  it('the side panel moves the window, recentres, shows the map and the notes', () => {
    const onMove = vi.fn();
    const onAroundMe = vi.fn();
    const onShowOnMap = vi.fn();
    render(
      <GeneratedGroundPanel
        state={state()}
        onMove={onMove}
        onAroundMe={onAroundMe}
        onShowOnMap={onShowOnMap}
      />,
    );
    expect(screen.getByTestId('terrain-preview-tag').textContent).toBe('Preview');
    fireEvent.click(screen.getByText('Move up'));
    fireEvent.click(screen.getByText('Move down'));
    fireEvent.click(screen.getByText('Make the land around me'));
    fireEvent.click(screen.getByText('Show on the map'));
    expect(onMove.mock.calls).toEqual([[1], [-1]]);
    expect(onAroundMe).toHaveBeenCalledOnce();
    expect(onShowOnMap).toHaveBeenCalledOnce();
    expect(screen.getByTestId('tryit-generated-window').textContent).toBe(
      'X -16 to 31, Z -16 to 31, heights 54 to 85.',
    );
    expect(screen.getByTestId('tryit-generated-notes').textContent).toContain(
      GENERATED_WORDS.aboutRight,
    );
    const readout = screen.getByTestId('tryit-generated-state');
    expect(readout.dataset.terrainMs).toBe('300');
    expect(readout.dataset.featuresMs).toBe('900');
  });

  it('the side panel shows the stage arriving, and the set-up banner without the jar', () => {
    const onSetUp = vi.fn();
    const { rerender } = render(
      <GeneratedGroundPanel
        state={state({ status: 'drawing', asking: 'surface', stage: 'terrain' })}
        onMove={() => {}}
        onAroundMe={() => {}}
        onSetUp={onSetUp}
      />,
    );
    expect(screen.getByTestId('tryit-generated-status').textContent).toBe('Laying the surface…');
    expect((screen.getByTestId('tryit-generated-up') as HTMLButtonElement).disabled).toBe(true);
    rerender(
      <GeneratedGroundPanel
        state={state({ status: 'needsSetUp', window: null, stage: null })}
        onMove={() => {}}
        onAroundMe={() => {}}
        onSetUp={onSetUp}
      />,
    );
    fireEvent.click(screen.getByText('Set up Minecraft folder'));
    expect(onSetUp).toHaveBeenCalledOnce();
  });
});

describe('My world generation in Try it', () => {
  it('is offered on the first-run card and in the picker, and says when this window cannot make land', async () => {
    useTryItStore.setState({ cardSeen: false });
    const fake = fakeSession();
    render(
      <TryItView
        session={fake.session}
        root="/projects/demo"
        vanilla={null}
        readProjectAsset={async () => null}
        playAvailable
        onPlay={() => {}}
        onTestInMinecraft={() => {}}
        worlds={null}
        webgl={false}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('tryit-state')).toBeTruthy());
    const button = await screen.findByTestId('tryit-card-ground-generated');
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    expect(button.textContent).toBe('My world generation…');
    fireEvent.click(button);
    const picker = screen.getByTestId('tryit-grounds');
    expect(within(picker).getByTestId('tryit-ground-generated').getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(within(picker).getByTestId('tryit-generated').textContent).toBe(NO_GENERATED_HERE);
    fireEvent.click(within(picker).getByTestId('tryit-ground-apply'));
    expect(within(picker).getByTestId('tryit-ground-error').textContent).toBe(NO_GENERATED_HERE);
    expect(screen.queryByTestId('tryit-generated-strip')).toBeNull();
  });
});
