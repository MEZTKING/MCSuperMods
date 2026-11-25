// @vitest-environment happy-dom
/**
 * The upgrade report's part "Mods in this pack" (ADR 0136 D9, B821): nothing reaches Modrinth
 * before Check my mods; one batched check gives a row per mod (a build, none, already fits); a
 * mod without a build moves with the pack and is listed under "What you need to change"; offline
 * is said plainly; the pack can stay on the old version. Recorded answers, invented versions.
 */
import type { UpgradeReport } from '@msm/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ModpackMods,
  type ModpackModsProps,
} from '../../src/renderer/src/components/upgrade/parts/ModpackMods';
import UpgradeReportView from '../../src/renderer/src/components/upgrade/UpgradeReportView';
import { type PackMove, withModpackItems } from '../../src/renderer/src/modpacks/upgrade';
import type { ModrinthModUpdate } from '../../src/shared/platform';
import { answer, PROJECT, packView, steady } from './modpack-upgrade-fixture';
import { expectPlain } from './plain-sweep';

afterEach(cleanup);

const from = { targetId: 'mc-99.1', mcVersion: '99.1' };
const to = { targetId: 'mc-99.2', mcVersion: '99.2' };

function report(): UpgradeReport {
  return {
    from,
    to,
    changed: [],
    done: [],
    todo: [],
    players: { rows: [], changes: [], exports: [] },
    added: { total: 0, byKind: {} },
    inGame: { checks: [], standing: ['start-game'] },
    untouched: { total: 0, byArea: {} },
  };
}

function setup(
  over: {
    view?: ReturnType<typeof packView>;
    checkMods?: (sha1s: string[], gameVersion: string) => Promise<ModrinthModUpdate[]>;
  } = {},
) {
  const view = over.view ?? packView();
  const service = {
    list: vi.fn(async () => [{ root: view.root, name: view.modpack.name, found: true }]),
    read: vi.fn(async () => view),
    checkMods: vi.fn(over.checkMods ?? (async () => answer)),
  };
  let moves: readonly PackMove[] = [];
  const props: ModpackModsProps = {
    modpacks: service,
    projectRoot: PROJECT,
    from,
    to,
    onMovesChange: (next) => {
      moves = next;
    },
  };
  const result = render(<ModpackMods {...props} />);
  return { service, view, result, moves: () => moves };
}

describe('ModpackMods', () => {
  it('asks Modrinth nothing before the click, then once for every mod', async () => {
    const { service, moves } = setup();
    expect((await screen.findByTestId('upgrade-modpack-intro')).textContent).toContain(
      'This mod is in the modpack Bright Pack.',
    );
    expect(screen.getByTestId('upgrade-modpack-0-mod-0-text').textContent).toContain(
      'Lumen is not checked yet.',
    );
    expect(service.checkMods).not.toHaveBeenCalled();
    // Before a check the pack would move with its pins as they are, each listed as not checked.
    expect(moves()[0]?.unchecked.map((mod) => mod.title)).toEqual(['Lumen', 'Golemkit']);

    await userEvent.click(screen.getByTestId('upgrade-modpack-check'));
    await waitFor(() =>
      expect(screen.getByTestId('upgrade-modpack-0-mod-0').getAttribute('data-status')).toBe(
        'build',
      ),
    );
    expect(service.checkMods).toHaveBeenCalledTimes(1);
    expect(service.checkMods).toHaveBeenCalledWith(['1'.repeat(40), '2'.repeat(40)], '99.2');
    expect(screen.getByTestId('upgrade-modpack-0-mod-0-text').textContent).toContain(
      'Lumen has a build for Minecraft 99.2. It is updated when you move.',
    );
    expect(screen.getByTestId('upgrade-modpack-0-mod-1-text').textContent).toContain(
      'Golemkit has no build for Minecraft 99.2 yet.',
    );
    expect(screen.getByTestId('upgrade-modpack-0-summary').textContent).toContain(
      'Bright Pack moves to Minecraft 99.2 with this mod. 1 mod is updated to the build for Minecraft 99.2 in the same step as the move, and Undo puts it back. 1 mod is listed under What you need to change.',
    );
    expect(screen.getByTestId('upgrade-modpack-play').textContent).toContain(
      'The next time you press Play, MCSuperMods makes a new instance for Minecraft 99.2 and leaves the one for Minecraft 99.1 as it is.',
    );
    expect(screen.getByTestId('upgrade-modpack-check').textContent).toContain(
      'Check my mods again',
    );
    expectPlain(document.body);
    const move = moves()[0];
    expect(move?.after?.targetId).toBe('mc-99.2');
    expect(move?.repinned.map((mod) => mod.versionId)).toEqual(['NEWLUMEN']);
    expect(move?.waiting.map((mod) => mod.title)).toEqual(['Golemkit']);
  });

  it('moves a pack with a mod lacking a build, listed under what you need to change', async () => {
    const { moves } = setup();
    await userEvent.click(await screen.findByTestId('upgrade-modpack-check'));
    await screen.findByTestId('upgrade-modpack-0-mod-1-wait');
    render(
      <UpgradeReportView
        report={withModpackItems(report(), moves())}
        project={null}
        ids={false}
        made={false}
        testVersion={false}
      />,
    );
    const todo = screen.getByTestId('upgrade-part-todo');
    expect(within(todo).getByText('What you need to change')).toBeTruthy();
    expect(screen.getByTestId('upgrade-todo-0-text').textContent).toContain(
      'Golemkit in the modpack Bright Pack has no build for Minecraft 99.2 yet.',
    );
    expect(screen.getByTestId('upgrade-todo-0-hint').textContent).toContain(
      'How: Wait for one and press Check my mods again, take it out of the pack, or keep the pack on Minecraft 99.1.',
    );

    // Taken out instead: nothing is left to change, and the pack loses it.
    await userEvent.click(screen.getByTestId('upgrade-modpack-0-mod-1-remove'));
    await waitFor(() => expect(moves()[0]?.removed.map((mod) => mod.title)).toEqual(['Golemkit']));
    expect(moves()[0]?.after?.mods.map((mod) => mod.title)).toEqual(['Lumen']);
    expect(withModpackItems(report(), moves()).todo).toEqual([]);
    expect(screen.getByTestId('upgrade-modpack-0-summary').textContent).toContain(
      '1 mod will be taken out of the pack.',
    );
  });

  it('says plainly when Modrinth cannot be reached, and leaves every mod unchecked', async () => {
    const { moves } = setup({
      checkMods: async () => {
        throw new Error('Modrinth could not be reached: fetch failed');
      },
    });
    await userEvent.click(await screen.findByTestId('upgrade-modpack-check'));
    expect((await screen.findByTestId('upgrade-modpack-offline')).textContent).toContain(
      'MCSuperMods could not reach Modrinth, so your mods were not checked. Make sure you are online and press Check my mods again.',
    );
    expect(screen.getByTestId('upgrade-modpack-0-mod-0-text').textContent).toContain(
      'Lumen could not be checked.',
    );
    expect(moves()[0]?.unchecked).toHaveLength(2);
    expectPlain(document.body);
  });

  it('keeps the pack on the old version when other mods in it are still there', async () => {
    const view = packView({ mods: [steady] }, [
      {
        path: '../friend',
        root: '/home/me/packs/friend',
        found: true,
        name: 'Friend Mod',
        targetId: 'mc-99.1',
      },
    ]);
    const { moves } = setup({ view });
    expect((await screen.findByTestId('upgrade-modpack-0-others')).textContent).toContain(
      '1 other mod in it, Friend Mod, is still made for Minecraft 99.1. Moving the pack means moving it too.',
    );
    expect(screen.getByTestId('upgrade-modpack-0-stays') as HTMLInputElement).toHaveProperty(
      'checked',
      true,
    );
    expect(screen.getByTestId('upgrade-modpack-0-summary').textContent).toContain(
      'Bright Pack stays on Minecraft 99.1 and is not changed.',
    );
    expect(moves()[0]?.after).toBeNull();
    await userEvent.click(screen.getByTestId('upgrade-modpack-check'));
    await waitFor(() =>
      expect(screen.getByTestId('upgrade-modpack-0-mod-0-text').textContent).toContain(
        'Steady already works with Minecraft 99.2.',
      ),
    );
    await userEvent.click(screen.getByTestId('upgrade-modpack-0-moves'));
    await waitFor(() => expect(moves()[0]?.after?.targetId).toBe('mc-99.2'));
    expect(moves()[0]?.repinned).toEqual([]);
  });

  it('shows nothing when the mod is in no modpack, and shows ids only under More options', async () => {
    const view = { ...packView(), members: [] };
    const empty = setup({ view });
    await waitFor(() => expect(empty.service.read).toHaveBeenCalled());
    expect(screen.queryByTestId('upgrade-part-modpack')).toBeNull();
    cleanup();

    const withIds = packView();
    const service = {
      list: async () => [{ root: withIds.root, name: 'Bright Pack', found: true }],
      read: async () => withIds,
      checkMods: async () => answer,
    };
    const { ReportContext } = await import(
      '../../src/renderer/src/components/upgrade/parts/shared'
    );
    render(
      <ReportContext.Provider
        value={{
          project: null,
          ids: true,
          mcVersion: '99.2',
          versionOf: () => '99.2',
          made: false,
        }}
      >
        <ModpackMods modpacks={service} projectRoot={PROJECT} from={from} to={to} />
      </ReportContext.Provider>,
    );
    expect((await screen.findByTestId('upgrade-modpack-0-mod-0-raw')).textContent).toContain(
      'LUMEN001 OLDLUMEN lumen-old.jar',
    );
  });
});
