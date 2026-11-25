/**
 * Modpacks when a mod moves (ADR 0136 D9, B821): which packs hold the mod, the rows from a
 * recorded Modrinth answer, the pack's file after the move, the re-pins riding on the move's undo
 * step as a command effect (a real `CommandStack`), and the part 3 items for what is left.
 * Versions are invented; no network.
 */
import { CommandStack, type Modpack, type UpgradeReport } from '@msm/core';
import { describe, expect, it } from 'vitest';
import {
  defaultPackChoices,
  MODPACK_REPIN_EFFECT,
  ModpackUpgradeCodes,
  modpackRepinEffects,
  modpacksWithProject,
  modRows,
  pinnedHashes,
  planPackMove,
  replayModpackRepins,
  sameFolder,
  withModpackItems,
} from '../../src/renderer/src/modpacks/upgrade';
import { answer, golem, lumen, PROJECT, packView, steady } from './modpack-upgrade-fixture';

function emptyReport(): UpgradeReport {
  return {
    from: { targetId: 'mc-99.1', mcVersion: '99.1' },
    to: { targetId: 'mc-99.2', mcVersion: '99.2' },
    changed: [],
    done: [],
    todo: [],
    players: { rows: [], changes: [], exports: [] },
    added: { total: 0, byKind: {} },
    inGame: { checks: [], standing: ['start-game'] },
    untouched: { total: 0, byArea: {} },
  };
}

describe('modpacks when a mod moves', () => {
  it('finds the remembered packs that list the project, by folder', async () => {
    const holding = packView();
    const other = { ...packView(), root: '/home/me/packs/other', members: [] };
    const found = await modpacksWithProject(
      {
        list: async () => [
          { root: holding.root, name: 'Bright Pack', found: true },
          { root: other.root, name: 'Other', found: true },
          { root: '/gone', name: null, found: false },
          { root: '/broken', name: 'Broken', found: true },
        ],
        read: async (root) => {
          if (root === holding.root) return holding;
          if (root === other.root) return other;
          throw new Error('unreadable');
        },
      },
      `${PROJECT}/`,
    );
    expect(found.map((view) => view.root)).toEqual([holding.root]);
    expect(sameFolder('C:\\Mods\\My_Mod', 'c:/mods/my_mod/')).toBe(true);
    expect(sameFolder('/a/My_Mod', '/a/my_mod')).toBe(false);
  });

  it('reads the rows from the answer: a build, none, already fits; unchecked before asking', () => {
    const mods = [lumen, golem, steady];
    expect(modRows(mods, null).map((row) => row.status)).toEqual([
      'unchecked',
      'unchecked',
      'unchecked',
    ]);
    const rows = modRows(mods, answer);
    expect(rows.map((row) => row.status)).toEqual(['build', 'none', 'build']);
    const [first, , third] = rows;
    expect(first?.status === 'build' && first.next).toMatchObject({
      title: 'Lumen',
      versionId: 'NEWLUMEN',
      sha1: '3'.repeat(40),
    });
    expect(third?.status === 'build' && third.same).toBe(true);
    expect(pinnedHashes([packView(), packView()])).toEqual([lumen.sha1, golem.sha1]);
  });

  it('moves the pack with the re-pins; a mod without a build waits or comes out', () => {
    const view = packView();
    const rows = modRows(view.modpack.mods, answer);
    const choices = defaultPackChoices(view, PROJECT, 'mc-99.1');
    expect(choices.keepOnOld).toBe(false);
    const move = planPackMove(view, rows, 'mc-99.2', choices);
    expect(move.after?.targetId).toBe('mc-99.2');
    expect(move.after?.mods.map((entry) => entry.versionId)).toEqual(['NEWLUMEN', golem.versionId]);
    expect(move.repinned.map((entry) => entry.title)).toEqual(['Lumen']);
    expect(move.waiting).toEqual([golem]);

    const out = planPackMove(view, rows, 'mc-99.2', {
      ...choices,
      remove: new Set([golem.projectId]),
    });
    expect(out.after?.mods.map((entry) => entry.title)).toEqual(['Lumen']);
    expect(out.removed).toEqual([golem]);
    expect(out.waiting).toEqual([]);
  });

  it('keeps the pack on the old version when other members are still on it', () => {
    const view = packView({}, [
      {
        path: '../friend',
        root: '/home/me/packs/friend',
        found: true,
        name: 'Friend',
        targetId: 'mc-99.1',
      },
    ]);
    const choices = defaultPackChoices(view, PROJECT, 'mc-99.1');
    expect(choices.keepOnOld).toBe(true);
    const move = planPackMove(view, modRows(view.modpack.mods, answer), 'mc-99.2', choices);
    expect(move).toMatchObject({ after: null, keptOnOld: true, repinned: [] });
    expect(modpackRepinEffects([move])).toEqual([]);
    const items = withModpackItems(emptyReport(), [move]).todo;
    expect(items.map((entry) => entry.problem.code)).toEqual([ModpackUpgradeCodes.keptOnOld]);
    expect(items[0]?.problem.message).toBe(
      'The modpack Bright Pack stays on Minecraft 99.1, so this mod no longer fits in it.',
    );
  });

  it('lists a mod without a build and a mod not checked under what you need to change', () => {
    const view = packView();
    const checked = planPackMove(
      view,
      modRows(view.modpack.mods, answer),
      'mc-99.2',
      defaultPackChoices(view, PROJECT, 'mc-99.1'),
    );
    const report = withModpackItems(emptyReport(), [checked]);
    expect(report.todo).toHaveLength(1);
    expect(report.todo[0]).toMatchObject({
      source: 'export',
      check: 'manual',
      problem: {
        severity: 'warning',
        code: ModpackUpgradeCodes.noBuild,
        message: 'Golemkit in the modpack Bright Pack has no build for Minecraft 99.2 yet.',
      },
    });
    expect(report.todo[0]?.hint).toContain('keep the pack on Minecraft 99.1');
    const unchecked = planPackMove(
      view,
      modRows(view.modpack.mods, null),
      'mc-99.2',
      defaultPackChoices(view, PROJECT, 'mc-99.1'),
    );
    expect(
      withModpackItems(emptyReport(), [unchecked]).todo.map((entry) => entry.problem.code),
    ).toEqual([ModpackUpgradeCodes.notChecked, ModpackUpgradeCodes.notChecked]);
    const nothing = emptyReport();
    expect(withModpackItems(nothing, [])).toBe(nothing);
  });

  it('writes the re-pins with the move, puts them back on undo and again on redo (one undo step)', async () => {
    const view = packView();
    const move = planPackMove(
      view,
      modRows(view.modpack.mods, answer),
      'mc-99.2',
      defaultPackChoices(view, PROJECT, 'mc-99.1'),
    );
    const effects = modpackRepinEffects([move]);
    expect(effects).toHaveLength(1);
    expect(effects[0]?.type).toBe(MODPACK_REPIN_EFFECT);

    const written: { root: string; modpack: Modpack }[] = [];
    const disk = new Map<string, Modpack>([[view.root, view.modpack]]);
    const pending: Promise<string[]>[] = [];
    const stack = new CommandStack({
      formatVersion: 1,
      name: 'My Mod',
      targets: ['mc-99.1'],
      plugins: [],
      settings: {},
      namespaces: [],
    });
    stack.subscribe((event) => {
      pending.push(
        replayModpackRepins(event, async (root, modpack) => {
          written.push({ root, modpack });
          disk.set(root, modpack);
        }),
      );
    });
    stack.execute({
      id: 'app.upgrade-target',
      label: 'Move to Minecraft 99.2',
      apply(draft) {
        draft.targets = ['mc-99.2'];
      },
      effects,
    });
    await Promise.all(pending);
    expect(disk.get(view.root)?.targetId).toBe('mc-99.2');
    expect(disk.get(view.root)?.mods[0]?.versionId).toBe('NEWLUMEN');

    stack.undo();
    await Promise.all(pending);
    expect(stack.state.targets).toEqual(['mc-99.1']);
    expect(disk.get(view.root)).toEqual(view.modpack);

    stack.redo();
    await Promise.all(pending);
    expect(disk.get(view.root)?.targetId).toBe('mc-99.2');
    expect(written).toHaveLength(3);
  });

  it('says in plain words when a pack could not be written', async () => {
    const view = packView();
    const move = planPackMove(
      view,
      modRows(view.modpack.mods, answer),
      'mc-99.2',
      defaultPackChoices(view, PROJECT, 'mc-99.1'),
    );
    const failures = await replayModpackRepins(
      { type: 'undo', effects: modpackRepinEffects([move]) },
      async () => {
        throw new Error('the folder is read-only');
      },
    );
    expect(failures).toEqual([
      'The modpack Bright Pack could not be put back: the folder is read-only',
    ]);
    expect(await replayModpackRepins({ type: 'execute', effects: [] }, async () => {})).toEqual([]);
  });
});
