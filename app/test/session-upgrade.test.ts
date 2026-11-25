/**
 * The upgrade dry run and the kept copy (ADR 0136 D4, D6, D7; B816): the report of a real
 * move to the next built-in target, from `fixtures/sample-worldgen`, the move as one undo step
 * with the copy kept in `.msm/upgrades/`, moving back through the saved report, two hops, the
 * cache and the After moving list.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryFileSystem, type MemoryFileSystem } from '@msm/core';
import type { Json, Project, Target } from '@msm/plugin-api';
import { builtInTargets, defaultTargetId } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { DryRunCancelled, textTouches } from '../src/renderer/src/session/upgrade/dry-run';
import {
  KEPT_UPGRADES,
  UPGRADE_COPY_DIR,
  UPGRADES_DIR,
} from '../src/renderer/src/session/upgrade/saved-report';
import { newSession } from './session-fixture';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const NOISE_SETTINGS = 'minecraft:worldgen/noise_settings';
const DEFAULT_BLOCK = 'formats:minecraft:resource/worldgen/noise_settings#/default_block';
const SPELEOTHEM = 'ids:worldgen/feature_type/large_dripstone';

const release = builtInTargets.find((entry) => entry.target.id === defaultTargetId)?.target;
const next = builtInTargets.find((entry) => entry.target.previous === defaultTargetId)?.target;
if (release === undefined || next === undefined) {
  throw new Error('A release target and the target after it are needed.');
}

/** Every file of a folder, by project-relative path. */
async function readFolder(folder: string, prefix = ''): Promise<Record<string, Uint8Array>> {
  const out: Record<string, Uint8Array> = {};
  for (const entry of await readdir(join(folder, prefix), { withFileTypes: true })) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(out, await readFolder(folder, path));
    else out[path] = new Uint8Array(await readFile(join(folder, path)));
  }
  return out;
}

async function openFixture(name: string) {
  const files = await readFolder(join(repoRoot, 'fixtures', name));
  const fs = createMemoryFileSystem(files);
  const opened = newSession(fs, {}, { validationDelay: 0 });
  expect(await opened.session.loadSnapshot(`/fixtures/${name}`)).toEqual({ ok: true });
  await opened.session.flushValidation();
  return { ...opened, fs, files };
}

function dataOf(project: Project | null, id: string): Json | undefined {
  for (const namespace of project?.namespaces ?? []) {
    for (const element of namespace.elements) if (element.id === id) return element.data;
  }
  return undefined;
}

async function listUpgrades(fs: MemoryFileSystem): Promise<string[]> {
  if (!(await fs.exists(UPGRADES_DIR))) return [];
  return (await fs.readDir(UPGRADES_DIR)).map((entry) => entry.name).sort();
}

const LARGE_DRIPSTONE = {
  type: 'minecraft:large_dripstone',
  floor_to_ceiling_search_range: 30,
  column_radius: { type: 'minecraft:uniform', min_inclusive: 3, max_inclusive: 19 },
  height_scale: { type: 'minecraft:uniform', min_inclusive: 0.4, max_inclusive: 2 },
  max_column_radius_to_cave_height_ratio: 0.33,
  stalactite_bluntness: { type: 'minecraft:uniform', min_inclusive: 0.3, max_inclusive: 0.9 },
  stalagmite_bluntness: { type: 'minecraft:uniform', min_inclusive: 0.4, max_inclusive: 1 },
  wind_speed: { type: 'minecraft:uniform', min_inclusive: 0, max_inclusive: 0.3 },
  min_radius_for_wind: 4,
  min_bluntness_for_wind: 0.6,
};

describe('ProjectSession: the upgrade dry run (ADR 0136 D4)', () => {
  it('reports sample-worldgen moved to the next target: default_block changed for you, no new problem, in time', async () => {
    const { session } = await openFixture('sample-worldgen');
    // sample-worldgen has no noise settings of its own: one made on the release target holds
    // default_block, which the next target drops.
    session.addElement({ id: 'msm_sample_worldgen:hills', kind: NOISE_SETTINGS });
    expect(dataOf(session.snapshot.project, 'msm_sample_worldgen:hills')).toHaveProperty(
      'default_block',
    );
    await session.flushValidation();
    const started = performance.now();
    const dry = await session.upgradeReport(next.id);
    const wall = Math.round(performance.now() - started);
    console.log(
      `B816 dry run of sample-worldgen (${release.id} to ${next.id}): ${wall} ms wall, phases ${JSON.stringify(dry.timings)}`,
    );
    expect(wall).toBeLessThan(5000);

    expect(dry.direction).toBe('up');
    expect(dry.hops).toEqual([{ from: release.id, to: next.id, direction: 'up' }]);
    const done = dry.report.done.find((item) => item.elementId === 'msm_sample_worldgen:hills');
    expect(done?.kind).toBe('update');
    expect(done?.changeIds).toContain(DEFAULT_BLOCK);
    expect(done?.details).toContainEqual(
      expect.objectContaining({ op: 'drop', path: '/default_block', changeId: DEFAULT_BLOCK }),
    );
    expect(dry.report.changed.find((item) => item.change.id === DEFAULT_BLOCK)?.elementIds).toEqual(
      ['msm_sample_worldgen:hills'],
    );
    // No new problem on the next target.
    expect(dry.report.todo).toEqual([]);
    expect(dry.moved.targets).toEqual([next.id]);
    expect(dataOf(dry.moved, 'msm_sample_worldgen:hills')).not.toHaveProperty('default_block');
    expect(dry.filesAfter.length).toBeGreaterThan(0);
    // Parts 4 to 6 and the seventh line are there.
    expect(dry.report.players.rows.find((row) => row.fact === 'minecraft')).toEqual({
      fact: 'minecraft',
      before: release.mcVersion,
      after: next.mcVersion,
      changed: true,
    });
    expect(dry.report.added.total).toBeGreaterThan(0);
    expect(dry.report.inGame.standing).toContain('start-game');
    expect(dry.report.untouched.total).toBeGreaterThan(0);
    // The project itself is not changed.
    expect(session.snapshot.project?.targets).toEqual([release.id]);
    expect(dataOf(session.snapshot.project, 'msm_sample_worldgen:hills')).toHaveProperty(
      'default_block',
    );

    // Warm: the same state answers from the cache, a new state runs again.
    expect(await session.upgradeReport(next.id)).toBe(dry);
    session.setElementData('msm_sample_worldgen:hills', {
      ...(dataOf(session.snapshot.project, 'msm_sample_worldgen:hills') as object),
      sea_level: 40,
    });
    const warmStart = performance.now();
    const again = await session.upgradeReport(next.id);
    console.log(
      `B816 warm dry run of sample-worldgen: ${Math.round(performance.now() - warmStart)} ms wall`,
    );
    expect(again).not.toBe(dry);
    session.dispose();
  });

  it('lists the large dripstone feature under what you need to change, with element and path', async () => {
    const { session } = await openFixture('sample-worldgen');
    session.addElement({
      id: 'msm_sample_worldgen:spikes',
      kind: 'minecraft:worldgen/feature',
      data: LARGE_DRIPSTONE,
    });
    const dry = await session.upgradeReport(next.id);
    const item = dry.report.todo.find(
      (entry) => entry.problem.elementId === 'msm_sample_worldgen:spikes',
    );
    expect(item).toMatchObject({
      source: 'migration',
      changeId: SPELEOTHEM,
      targetId: next.id,
      check: 'value',
      value: 'minecraft:large_dripstone',
      problem: { elementId: 'msm_sample_worldgen:spikes', path: '/type' },
    });
    expect(item?.hint).toContain('large_speleothem');
    expect(dry.report.changed.find((entry) => entry.change.id === SPELEOTHEM)?.places).toEqual([
      { elementId: 'msm_sample_worldgen:spikes', path: '/type' },
    ]);

    // After the move the item is open until the feature's type changes.
    await session.upgradeTarget(next.id, dry.migration);
    await session.savedUpgradeReports();
    const open = session.openUpgradeItems();
    expect(open?.upgrade.to.targetId).toBe(next.id);
    expect(open?.items.map((entry) => entry.id)).toContain(item?.id);
    session.setElementData('msm_sample_worldgen:spikes', {
      ...LARGE_DRIPSTONE,
      type: 'minecraft:ore',
    });
    await session.flushValidation();
    expect(session.openUpgradeItems()?.items.map((entry) => entry.id)).not.toContain(item?.id);
    session.dispose();
  });

  it('ties a removed id inside a function line to its change (the text token search)', async () => {
    const { session } = await openFixture('sample-worldgen');
    session.addElement({
      id: 'msm_sample_worldgen:pour',
      kind: 'minecraft:function',
      data: { lines: ['setblock ~ ~ ~ minecraft:flowing_lava'] },
    });
    const project = session.snapshot.project as Project;
    const changes = next.changes;
    if (changes === undefined) throw new Error('The next target has no change set.');
    expect(textTouches([changes], project)).toContainEqual({
      targetId: next.id,
      changeId: 'ids:fluid/flowing_lava',
      elementId: 'msm_sample_worldgen:pour',
      path: '/lines/0',
    });
    const dry = await session.upgradeReport(next.id);
    expect(
      dry.report.changed.find((entry) => entry.change.id === 'ids:fluid/flowing_lava')?.elementIds,
    ).toEqual(['msm_sample_worldgen:pour']);
    expect(dry.report.todo).toContainEqual(
      expect.objectContaining({
        source: 'migration',
        changeId: 'ids:fluid/flowing_lava',
        problem: expect.objectContaining({
          code: 'target.removed-id-in-text',
          elementId: 'msm_sample_worldgen:pour',
          path: '/lines/0',
        }),
      }),
    );
    session.dispose();
  });

  it('cancels a dry run when the project changes under it', async () => {
    const { session } = await openFixture('sample-worldgen');
    const running = session.upgradeReport(next.id);
    session.addElement({ id: 'msm_sample_worldgen:hills', kind: NOISE_SETTINGS });
    await expect(running).rejects.toBeInstanceOf(DryRunCancelled);
    // A caller can stop waiting with its own signal.
    const controller = new AbortController();
    const waiting = session.upgradeReport(next.id, { signal: controller.signal });
    controller.abort();
    await expect(waiting).rejects.toBeInstanceOf(DryRunCancelled);
    const done = await session.upgradeReport(next.id);
    expect(done.report.done.map((item) => item.elementId)).toEqual(['msm_sample_worldgen:hills']);
    session.dispose();
  });
});

describe('ProjectSession: the move and the kept copy (ADR 0136 D6, D7)', () => {
  it('moves as one undo step and keeps a byte-equal copy of the project as it was', async () => {
    const { session, fs, files } = await openFixture('sample-worldgen');
    const before = session.snapshot.project;
    const dry = await session.upgradeReport(next.id);
    const outcome = await session.upgradeTarget(next.id, dry.migration);
    expect(outcome.saveError).toBeUndefined();
    expect(session.snapshot.project?.targets).toEqual([next.id]);
    expect(session.snapshot.undoLabel).toBe(`Upgrade target to ${next.id}`);

    const saved = outcome.saved;
    if (saved === undefined) throw new Error('Nothing was saved.');
    expect(saved.folder.startsWith(`${UPGRADES_DIR}/${release.id}-to-${next.id}-`)).toBe(true);
    // Only the project file and content/, each byte for byte the project's own file.
    const copied = saved.files;
    const own = Object.keys(files).filter(
      (path) => path === 'msm.project.json' || path.startsWith('content/'),
    );
    expect([...copied].sort()).toEqual([...own].sort());
    for (const path of copied) {
      const bytes = await fs.readFile(`${saved.folder}/${UPGRADE_COPY_DIR}/${path}`);
      expect(Buffer.from(bytes).equals(Buffer.from(files[path] as Uint8Array)), path).toBe(true);
    }
    const listed = await session.savedUpgradeReports();
    expect(listed[0]?.folder).toBe(saved.folder);
    expect(listed[0]?.report).toEqual(dry.report);
    expect(listed[0]?.migration).toEqual(dry.migration);

    // One undo puts target and data back.
    expect(session.undo()).toBe(true);
    expect(session.snapshot.project).toEqual(before);
    session.dispose();
  });

  it('moves back with the saved report, putting back what the move up dropped, and keeps three', async () => {
    const { session, fs } = await openFixture('sample-worldgen');
    session.addElement({ id: 'msm_sample_worldgen:hills', kind: NOISE_SETTINGS });
    const original = dataOf(session.snapshot.project, 'msm_sample_worldgen:hills');
    for (let round = 0; round < 2; round++) {
      const up = await session.upgradeTargetPreview(next.id);
      expect(up.reverses?.map((reverse) => reverse.path)).toEqual(['/default_block']);
      await session.upgradeTarget(next.id, up);
      expect(dataOf(session.snapshot.project, 'msm_sample_worldgen:hills')).not.toHaveProperty(
        'default_block',
      );
      const down = await session.upgradeReport(release.id);
      expect(down.direction).toBe('down');
      expect(down.inverted?.restored).toContainEqual(
        expect.objectContaining({ op: 'put-back', path: '/default_block' }),
      );
      expect(down.inverted?.notRestored).toEqual([]);
      await session.upgradeTarget(release.id, down.migration);
      expect(session.snapshot.project?.targets).toEqual([release.id]);
      expect(dataOf(session.snapshot.project, 'msm_sample_worldgen:hills')).toEqual(original);
    }
    // Four moves, the three newest kept.
    expect(await listUpgrades(fs)).toHaveLength(KEPT_UPGRADES);
    const saved = await session.savedUpgradeReports();
    expect(saved.map((entry) => `${entry.from.targetId}>${entry.to.targetId}`)).toEqual([
      `${next.id}>${release.id}`,
      `${release.id}>${next.id}`,
      `${next.id}>${release.id}`,
    ]);
    session.dispose();
  });

  it('moves back without a saved report honestly: nothing put back, said so', async () => {
    const { session } = await openFixture('sample-worldgen');
    await session.upgradeTarget(next.id, { changes: [], problems: [] }, { keepCopy: false });
    const back = await session.upgradeTargetPreview(release.id);
    expect(back.problems.map((problem) => problem.code)).toEqual(['upgrade.no-saved-report']);
    session.dispose();
  });

  it('runs two hops in order and merges them into one step', async () => {
    const seen: string[] = [];
    const middle: Target = {
      ...(next as Target),
      migrateFrom: (from, project) => {
        seen.push(`${from.id}>${next.id}:${project.targets[0]}`);
        return {
          changes: [{ elementId: 'demo:pack', description: 'First', data: { step: 1 } }],
          problems: [],
        };
      },
    };
    const top: Target = {
      ...(next as Target),
      id: 'mc-top',
      previous: next.id,
      migrateFrom: (from, project) => {
        const data = dataOf(project, 'demo:pack') as { step: number };
        seen.push(`${from.id}>mc-top:${project.targets[0]}:${data.step}`);
        return {
          changes: [{ elementId: 'demo:pack', description: 'Second', data: { step: 2 } }],
          problems: [],
        };
      },
    };
    const fs = createMemoryFileSystem();
    const { session } = newSession(
      fs,
      {},
      { targets: [{ target: top }, { target: middle }, { target: release as Target }] },
    );
    await session.newProject();
    const report = await session.upgradeTargetPreview('mc-top');
    expect(seen).toEqual([
      `${release.id}>${next.id}:${release.id}`,
      `${next.id}>mc-top:${next.id}:1`,
    ]);
    expect(report.changes).toEqual([
      expect.objectContaining({ elementId: 'demo:pack', data: { step: 2 } }),
    ]);
    session.dispose();
  });
});
