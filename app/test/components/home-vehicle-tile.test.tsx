// @vitest-environment happy-dom
/**
 * Home's "Make a vehicle" tile (ADR 0091 D4): its heading, words and flows, the "What kind?"
 * picker it opens (the Creator with just the Car, Tank, Plane and Boat cards), and that a flow
 * made with its untouched defaults leaves the project with no problems.
 */
import type { Project } from '@msm/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type CreatorCreated,
  CreatorDialog,
} from '../../src/renderer/src/components/creator/CreatorDialog';
import { MakeTiles } from '../../src/renderer/src/components/home/MakeTiles';
import {
  MAKE_TILES,
  shownTiles,
  TILE_GROUPS,
  VEHICLE_FLOW_IDS,
} from '../../src/renderer/src/components/home/tiles';
import type { ProjectSession } from '../../src/renderer/src/session/project-session';
import { aiSession } from './ai-fixtures';

afterEach(cleanup);

const vehicleTile = () => MAKE_TILES.find((tile) => tile.id === 'vehicle');

function renderPicker(session: ProjectSession, onCreated = vi.fn()) {
  render(
    <CreatorDialog
      session={session}
      project={session.snapshot.project as Project}
      namespaces={['demo']}
      edit={null}
      flowIds={VEHICLE_FLOW_IDS}
      folders={session.target.folders.resource}
      readProjectAsset={(namespace, path) => session.readAsset(namespace, path).catch(() => null)}
      vanilla={null}
      onClose={vi.fn()}
      onCreated={onCreated}
      newSetId={() => 'set-1'}
      webgl={false}
      debounceMs={5}
    />,
  );
  return { onCreated, user: userEvent.setup() };
}

describe('Make a vehicle tile (ADR 0091 D4)', () => {
  it('sits under its own Vehicles heading after Creatures and offers the four flows', () => {
    const groups = TILE_GROUPS.map((group) => group.id as string);
    expect(groups.indexOf('vehicles')).toBe(groups.indexOf('creatures') + 1);
    expect(TILE_GROUPS.find((group) => group.id === 'vehicles')?.title).toBe('Vehicles');
    expect(vehicleTile()).toEqual({
      id: 'vehicle',
      label: 'Make a vehicle',
      sentence: 'Cars, tanks, planes and boats you can drive.',
      group: 'vehicles',
      action: {
        type: 'flows',
        flowIds: ['vehicle-car', 'vehicle-tank', 'vehicle-plane', 'vehicle-boat'],
      },
    });
  });

  it('names only Creator flows of the library, and no ids in its words', async () => {
    const { default: library } = await import('@msm/plugin-library');
    const flows = new Map(
      (library.contributes.projectStarters ?? []).map((starter) => [starter.id, starter]),
    );
    expect(VEHICLE_FLOW_IDS.map((id) => flows.get(id)?.title)).toEqual([
      'Car',
      'Tank',
      'Plane',
      'Boat',
    ]);
    for (const id of VEHICLE_FLOW_IDS) expect(flows.get(id)?.creator, id).toBeDefined();
    const tile = vehicleTile();
    expect(`${tile?.label} ${tile?.sentence}`).not.toMatch(/[a-z]+[:_-][a-z]/);
  });

  it('shows the flows that are available and hides itself when none is', () => {
    const all = shownTiles({ flowAvailable: () => true, rules: true, ai: true });
    expect(all.find((entry) => entry.tile.id === 'vehicle')?.flowIds).toEqual(VEHICLE_FLOW_IDS);
    const some = shownTiles({
      flowAvailable: (id) => id !== 'vehicle-plane',
      rules: true,
      ai: true,
    });
    expect(some.find((entry) => entry.tile.id === 'vehicle')?.flowIds).toEqual([
      'vehicle-car',
      'vehicle-tank',
      'vehicle-boat',
    ]);
    const none = shownTiles({
      flowAvailable: (id) => !id.startsWith('vehicle-'),
      rules: true,
      ai: true,
    });
    expect(none.map((entry) => entry.tile.id)).not.toContain('vehicle');
  });

  it('draws the tile under its heading and runs it when clicked', async () => {
    const onTile = vi.fn();
    render(
      <MakeTiles
        tiles={shownTiles({ flowAvailable: () => true, rules: true, ai: true })}
        onTile={onTile}
      />,
    );
    const group = screen.getByTestId('home-group-vehicles');
    expect(within(group).getByText('Vehicles')).toBeTruthy();
    const tile = within(group).getByTestId('home-tile-vehicle');
    expect(tile.textContent).toContain('Make a vehicle');
    expect(tile.querySelector('svg')).not.toBeNull();
    await userEvent.setup().click(tile);
    expect(onTile).toHaveBeenCalledWith(
      expect.objectContaining({
        tile: expect.objectContaining({ id: 'vehicle' }),
        flowIds: VEHICLE_FLOW_IDS,
      }),
    );
  });

  it('opens a "What kind?" picker with only Car, Tank, Plane and Boat', async () => {
    const { session } = await aiSession();
    renderPicker(session);
    const cards = screen.getAllByTestId(/^creator-flow-/);
    expect(cards.map((card) => card.dataset.testid)).toEqual(
      VEHICLE_FLOW_IDS.map((id) => `creator-flow-${id}`),
    );
    expect(cards.map((card) => card.querySelector('span')?.textContent)).toEqual([
      'Car',
      'Tank',
      'Plane',
      'Boat',
    ]);
  });

  it.each([
    ['vehicle-car', 'Car', 'car_name', 'Racing Car', 'demo:racing_car'],
    ['vehicle-tank', 'Tank', 'tank_name', 'Battle Tank', 'demo:battle_tank'],
    ['vehicle-plane', 'Plane', 'plane_name', 'Biplane', 'demo:biplane'],
    ['vehicle-boat', 'Boat', 'boat_name', 'Motorboat', 'demo:motorboat'],
  ])(
    'makes %s from the defaults, name first, with no problems',
    async (flowId, title, field, name, id) => {
      const { session } = await aiSession();
      const { user, onCreated } = renderPicker(session);
      await user.click(screen.getByTestId(`creator-flow-${flowId}`));
      const fields = await screen.findAllByTestId(/^param-[a-z_]+$/);
      expect(fields[0]?.dataset.testid).toBe(`param-${field}`);
      expect((fields[0] as HTMLInputElement).value).toBe(name);
      await waitFor(() =>
        expect((screen.getByTestId('creator-create') as HTMLButtonElement).disabled).toBe(false),
      );
      await user.click(screen.getByTestId('creator-create'));
      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      const result = onCreated.mock.calls[0]?.[0] as CreatorCreated;
      expect(result.label).toBe(`Create ${title}`);
      expect(result.created).toContain(id);
      await session.flushValidation();
      expect(session.snapshot.problems).toEqual([]);
    },
  );
});
