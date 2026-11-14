// @vitest-environment happy-dom

import { QUICK_PRESETS } from '@msm/sim';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  describeGround,
  parseCentre,
  useGroundPresets,
  worldErrorText,
} from '../../../src/renderer/src/tryit/grounds';
import TryItView, { NO_VANILLA_GROUND_TEXT } from '../../../src/renderer/src/tryit/TryItView';
import { useTryItStore } from '../../../src/renderer/src/tryit/tryit-store';
import type {
  TryItWorldArea,
  TryItWorldInfo,
  TryItWorldsPlatform,
} from '../../../src/shared/platform';
import { fakeSession, NS } from './tryit-fixture';

beforeEach(() => {
  globalThis.localStorage?.clear();
  useGroundPresets.getState().reload();
  useTryItStore.getState().reset();
  useTryItStore.setState({ cardSeen: false, smaller: null });
});

afterEach(() => {
  cleanup();
  useTryItStore.getState().reset();
});

const world = (overrides: Partial<TryItWorldInfo>): TryItWorldInfo => ({
  id: 'official/Home',
  name: 'Home',
  folder: 'Home',
  gameFolder: { id: 'official', name: 'Minecraft', selected: true },
  lastPlayed: '2026-11-01T10:00:00.000Z',
  versionName: '26.3',
  dataVersion: 4440,
  readable: true,
  icon: null,
  ...overrides,
});

/** A fake world area: stone below y 5, a gold block on top at the centre, one modded block. */
function fakeArea(): TryItWorldArea {
  const palette = ['minecraft:air', 'minecraft:stone', 'minecraft:gold_block', 'othermod:thing'];
  const blocks = new Uint16Array(48 * 32 * 48);
  for (let y = 0; y < 5; y += 1) {
    for (let z = 0; z < 48; z += 1) {
      for (let x = 0; x < 48; x += 1) blocks[(y * 48 + z) * 48 + x] = 1;
    }
  }
  blocks[(5 * 48 + 24) * 48 + 24] = 2;
  blocks[(5 * 48 + 2) * 48 + 2] = 3;
  return {
    format: 1,
    world: 'Home',
    dataVersion: 4440,
    origin: { x: 76, y: 60, z: -24 },
    size: { x: 48, y: 32, z: 48 },
    palette,
    blocks,
    skipped: { blockEntities: 2, entities: 1, missingChunks: 0 },
    warnings: ['Not brought in: 2 block entities and 1 entity.'],
  };
}

function view(worlds: TryItWorldsPlatform | null = null) {
  const fake = fakeSession();
  return render(
    <TryItView
      session={fake.session}
      root="/projects/demo"
      vanilla={null}
      readProjectAsset={async () => null}
      vanillaBlockIds={async () => ['minecraft:stone', 'minecraft:sand', 'minecraft:dirt']}
      playAvailable
      onPlay={() => {}}
      onTestInMinecraft={() => {}}
      onSetUpVanilla={() => {}}
      worlds={worlds}
      webgl={false}
    />,
  );
}

const readout = () => screen.getByTestId('tryit-state');
const press = (code: string) =>
  act(() => {
    fireEvent.keyDown(screen.getByTestId('tryit-canvas'), { code });
    fireEvent.keyUp(screen.getByTestId('tryit-canvas'), { code });
  });

async function ready(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('tryit-state')).toBeTruthy());
}

describe('Try it grounds', () => {
  it('starts on the grid and loads the flat world from the first-run card', async () => {
    view();
    await ready();
    expect(readout().dataset.ground).toBe('grid');
    expect(screen.queryByTestId('tryit-ground-no-vanilla')).toBeNull();
    const card = screen.getByTestId('tryit-card');
    expect(within(card).getByTestId('tryit-card-grounds').textContent).toContain('Start on:');
    fireEvent.click(within(card).getByTestId('tryit-card-ground-flat'));
    await waitFor(() => expect(readout().dataset.ground).toBe('flat'));
    expect(readout().dataset.blocks).toBe(String(4 * 48 * 48));
    // The player stands on the grass at the centre.
    expect(readout().dataset.position).toBe('24.50 4.00 24.50');
    expect(screen.getByTestId('tryit-ground-current').textContent).toBe('Flat world');
    // Without the client jar, Minecraft's blocks are plain cubes, and the view says so.
    expect(screen.getByTestId('tryit-ground-no-vanilla').textContent).toContain(
      NO_VANILLA_GROUND_TEXT,
    );
    // Placing still works on the grass.
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    expect(readout().dataset.pointed).toBe('minecraft:grass_block');
    press('Digit3');
    press('KeyC');
    await waitFor(() => expect(readout().dataset.blocks).toBe(String(4 * 48 * 48 + 1)));
    expect(readout().dataset.pointed).toBe(`${NS}:ruby_block`);
  });

  it('shows the picker states and asks before replacing a changed area', async () => {
    view();
    await ready();
    fireEvent.click(screen.getByTestId('tryit-card-close'));
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    press('Digit3');
    press('KeyC');
    await waitFor(() => expect(readout().dataset.blocks).toBe('1'));

    fireEvent.click(screen.getByTestId('tryit-ground-change'));
    const picker = screen.getByTestId('tryit-grounds');
    expect(within(picker).getByTestId('tryit-ground-grid').getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(within(picker).queryByTestId('tryit-quick')).toBeNull();
    fireEvent.click(within(picker).getByTestId('tryit-ground-quick'));
    expect(within(picker).getByTestId('tryit-quick')).toBeTruthy();
    // Presets fill the form.
    fireEvent.click(within(picker).getByTestId('tryit-quick-preset-island'));
    expect((within(picker).getByTestId('tryit-quick-shape') as HTMLSelectElement).value).toBe(
      'island',
    );
    expect((within(picker).getByTestId('tryit-quick-water') as HTMLInputElement).checked).toBe(
      true,
    );
    expect(within(picker).getAllByTestId('tryit-quick-layer')).toHaveLength(4);
    expect(within(picker).getByTestId('tryit-quick-layer-2-block').textContent).toContain(
      '(stretches)',
    );
    // A layer more, a new seed, then a typed seed.
    fireEvent.click(within(picker).getByTestId('tryit-quick-add-layer'));
    expect(within(picker).getAllByTestId('tryit-quick-layer')).toHaveLength(5);
    const seed = within(picker).getByTestId('tryit-quick-seed') as HTMLInputElement;
    fireEvent.click(within(picker).getByTestId('tryit-quick-new-seed'));
    fireEvent.change(seed, { target: { value: '42' } });
    expect(seed.value).toBe('42');
    // The layer's block comes from the ThingPicker.
    fireEvent.click(within(picker).getByTestId('tryit-quick-layer-0-block'));
    const sand = await screen.findByText('Sand');
    fireEvent.click(sand);
    await waitFor(() =>
      expect(
        within(picker).getByTestId('tryit-quick-layer-0-block').getAttribute('data-block'),
      ).toBe('minecraft:sand'),
    );

    // Something was placed: "Use this ground" asks first, and "Keep my area" keeps it.
    fireEvent.click(within(picker).getByTestId('tryit-ground-apply'));
    expect(within(picker).getByTestId('tryit-ground-confirm').textContent).toContain(
      'the blocks you placed',
    );
    fireEvent.click(within(picker).getByTestId('tryit-ground-confirm-no'));
    expect(readout().dataset.ground).toBe('grid');
    fireEvent.click(within(picker).getByTestId('tryit-ground-apply'));
    fireEvent.click(within(picker).getByTestId('tryit-ground-confirm-yes'));
    await waitFor(() => expect(readout().dataset.ground).toBe('quick'));
    expect(screen.queryByTestId('tryit-grounds')).toBeNull();
    expect(screen.getByTestId('tryit-ground-current').textContent).toBe(
      'Quick world: Island in water, seed 42',
    );
    expect(Number(readout().dataset.blocks)).toBeGreaterThan(20_000);
  });

  it('saves my own preset in the preferences, not the project', async () => {
    view();
    await ready();
    fireEvent.click(screen.getByTestId('tryit-ground-change'));
    fireEvent.click(screen.getByTestId('tryit-ground-quick'));
    fireEvent.click(screen.getByTestId('tryit-quick-preset-hills'));
    fireEvent.click(screen.getByTestId('tryit-quick-save'));
    fireEvent.change(screen.getByTestId('tryit-quick-save-name'), {
      target: { value: 'My hills' },
    });
    fireEvent.click(screen.getByTestId('tryit-quick-save-confirm'));
    expect(screen.getByTestId('tryit-quick-user-preset').dataset.name).toBe('My hills');
    const stored = JSON.parse(
      globalThis.localStorage.getItem('msm.tryit.groundPresets.v1') ?? '[]',
    );
    const hills = QUICK_PRESETS.find((preset) => preset.id === 'hills')?.options;
    expect(stored).toEqual([{ name: 'My hills', options: hills }]);
    useGroundPresets.getState().reload();
    expect(useGroundPresets.getState().presets.map((preset) => preset.name)).toEqual(['My hills']);
  });

  it('loads an area of my world from the bridge, greying out unreadable worlds', async () => {
    const readArea = vi.fn(async () => fakeArea());
    const worlds: TryItWorldsPlatform = {
      listWorlds: async () => [
        world({}),
        world({
          id: 'official/Old',
          name: 'Old',
          folder: 'Old',
          versionName: '1.16.5',
          dataVersion: 2586,
          readable: false,
        }),
      ],
      readArea,
    };
    view(worlds);
    await ready();
    fireEvent.click(screen.getByTestId('tryit-card-ground-world'));
    const items = await screen.findAllByTestId('tryit-world-item');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Home'),
      expect.stringContaining('Old'),
    ]);
    expect((items[1] as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('tryit-world-unreadable').textContent).toBe(
      'Saved by Minecraft 1.16.5. Open it once in Minecraft 1.18 or later.',
    );
    expect(items[0]?.getAttribute('aria-pressed')).toBe('true');
    // A typed centre.
    fireEvent.click(screen.getByTestId('tryit-world-centre-xz'));
    fireEvent.change(screen.getByTestId('tryit-world-x'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('tryit-world-z'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByTestId('tryit-ground-apply'));
    expect(screen.getByTestId('tryit-ground-error').textContent).toBe(
      'Type whole numbers for X and Z.',
    );
    fireEvent.change(screen.getByTestId('tryit-world-z'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('tryit-ground-apply'));
    await waitFor(() => expect(readout().dataset.ground).toBe('world'));
    expect(readArea).toHaveBeenCalledWith({ worldId: 'official/Home', centre: { x: 100, z: 0 } });
    // Stone and the gold block are in; the other mod's block is left out with a line.
    expect(readout().dataset.blocks).toBe(String(5 * 48 * 48 + 1));
    expect(readout().dataset.position).toBe('24.50 6.00 24.50');
    expect(screen.getByTestId('tryit-ground-current').textContent).toBe('Home, around X 100, Z 0');
    const log = screen.getByTestId('tryit-log').textContent ?? '';
    expect(log).toContain('Copied an area of Home: X 76 to 123, Z -24 to 23, heights 60 to 91.');
    expect(log).toContain('Not brought in: 2 block entities and 1 entity.');
    expect(log).toContain('othermod:thing');
  });

  it('shows a failed read in plain words and keeps the area', async () => {
    const worlds: TryItWorldsPlatform = {
      listWorlds: async () => [world({})],
      readArea: async () => {
        throw new Error(
          "Error invoking remote method 'msm:v1:tryit:readArea': Error: tryit.read-failed: Could not read region/r.0.0.mca.",
        );
      },
    };
    view(worlds);
    await ready();
    fireEvent.click(screen.getByTestId('tryit-card-ground-world'));
    await screen.findAllByTestId('tryit-world-item');
    fireEvent.click(screen.getByTestId('tryit-ground-apply'));
    await waitFor(() =>
      expect(screen.getByTestId('tryit-ground-error').textContent).toBe(
        'Could not read region/r.0.0.mca.',
      ),
    );
    expect(readout().dataset.ground).toBe('grid');
    expect(screen.getByTestId('tryit-grounds')).toBeTruthy();
  });

  it('says so when no worlds can be read', async () => {
    view(null);
    await ready();
    fireEvent.click(screen.getByTestId('tryit-card-ground-world'));
    expect(screen.getByTestId('tryit-world').textContent).toContain(
      'Your worlds cannot be read in this window.',
    );
  });
});

describe('grounds helpers', () => {
  it('describes choices and reads centres and errors', () => {
    expect(describeGround({ kind: 'flat' })).toBe('Flat world');
    expect(
      describeGround({
        kind: 'quick',
        options: (QUICK_PRESETS[1] as (typeof QUICK_PRESETS)[number]).options,
        preset: 'Island',
      }),
    ).toBe('Quick world: Island, seed 7');
    expect(parseCentre('10', '-20')).toEqual({ x: 10, z: -20 });
    expect(parseCentre('1.5', '0')).toBe('Type whole numbers for X and Z.');
    expect(parseCentre('40000000', '0')).toContain('30,000,000');
    expect(worldErrorText(new Error('tryit.old-format: Open it in 1.18.'))).toBe(
      'Open it in 1.18.',
    );
    expect(worldErrorText('plain')).toBe('plain');
  });
});
