/**
 * Moving back (ADR 0136 D7, B820): `fixtures/sample-worldgen` moved up and back is the project
 * it was; a thing edited in between is reported and not overwritten; a move up with no saved
 * record moves back with the honest list of what cannot be put back; two moves saved one at a
 * time are undone one after the other; with no record, the newer version's confirmed renames
 * are renamed back from its change set.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryFileSystem, migrationChain } from '@msm/core';
import type {
  Json,
  MigrationChange,
  MigrationReport,
  Project,
  Target,
  TargetChangeSet,
} from '@msm/plugin-api';
import { builtInTargets, defaultTargetId } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { moveBack, moveBackParts } from '../src/renderer/src/session/upgrade/move-back';
import { newSession } from './session-fixture';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const NOISE_SETTINGS = 'minecraft:worldgen/noise_settings';
const DEFAULT_BLOCK = 'formats:minecraft:resource/worldgen/noise_settings#/default_block';
const HILLS = 'msm_sample_worldgen:hills';
const SEA_LEVEL = 'formats:minecraft:resource/worldgen/noise_settings#/sea_level';

const release = builtInTargets.find((entry) => entry.target.id === defaultTargetId)?.target;
const next = builtInTargets.find((entry) => entry.target.previous === defaultTargetId)?.target;
if (release === undefined || next === undefined) {
  throw new Error('A release target and the target after it are needed.');
}

async function readFolder(folder: string, prefix = ''): Promise<Record<string, Uint8Array>> {
  const out: Record<string, Uint8Array> = {};
  for (const entry of await readdir(join(folder, prefix), { withFileTypes: true })) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(out, await readFolder(folder, path));
    else out[path] = new Uint8Array(await readFile(join(folder, path)));
  }
  return out;
}

async function openWorldgen(
  sessionOptions: Parameters<typeof newSession>[2] = {},
  vendoredAs: Readonly<Record<string, string>> = {},
) {
  const files = await readFolder(join(repoRoot, 'fixtures', 'sample-worldgen'));
  const opened = newSession(
    createMemoryFileSystem(files),
    {},
    {
      validationDelay: 0,
      ...sessionOptions,
    },
  );
  // A stand-in target reads the vendored data of the target it was made from.
  const read = opened.platform.targets.readVendored;
  opened.platform.targets.readVendored = (targetId, key) =>
    read(vendoredAs[targetId] ?? targetId, key);
  expect(await opened.session.loadSnapshot('/fixtures/sample-worldgen')).toEqual({ ok: true });
  // sample-worldgen has no noise settings of its own: one made on the release target holds
  // default_block, which the next target drops.
  opened.session.addElement({ id: HILLS, kind: NOISE_SETTINGS });
  await opened.session.flushValidation();
  return opened;
}

type JsonObject = { [key: string]: Json };

function dataOf(project: Project | null, id: string): Json | undefined {
  for (const namespace of project?.namespaces ?? []) {
    for (const element of namespace.elements) if (element.id === id) return element.data;
  }
  return undefined;
}

describe('Moving back (ADR 0136 D7)', () => {
  it('moves a worldgen fixture up and back to the project it was', async () => {
    const { session } = await openWorldgen();
    const original = structuredClone(session.snapshot.project);
    const up = await session.upgradeReport(next.id);
    await session.upgradeTarget(next.id, up.migration, { upgradeReport: up.report });
    expect(dataOf(session.snapshot.project, HILLS)).not.toHaveProperty('default_block');

    const down = await session.upgradeReport(release.id);
    expect(down.direction).toBe('down');
    expect(down.inverted?.segments).toEqual([
      expect.objectContaining({ from: next.id, to: release.id, noRecord: false }),
    ]);
    expect(down.inverted?.notRestored).toEqual([]);
    expect(down.inverted?.edited).toEqual([]);
    expect(down.inverted?.unrecorded).toEqual([]);
    await session.upgradeTarget(release.id, down.migration, { upgradeReport: down.report });
    expect(session.snapshot.project).toEqual(original);
    session.dispose();
  });

  it('reports a thing edited in between and does not overwrite it', async () => {
    const { session } = await openWorldgen();
    const up = await session.upgradeReport(next.id);
    await session.upgradeTarget(next.id, up.migration, { upgradeReport: up.report });
    // Edited after the move: the dropped field written again with another value.
    const moved = dataOf(session.snapshot.project, HILLS) as JsonObject;
    session.setElementData(HILLS, { ...moved, default_block: { Name: 'minecraft:deepslate' } });
    await session.flushValidation();

    const down = await session.upgradeReport(release.id);
    expect(down.inverted?.edited).toEqual([HILLS]);
    expect(down.inverted?.notRestored).toEqual([
      expect.objectContaining({ elementId: HILLS, path: '/default_block', reason: 'place-taken' }),
    ]);
    expect(down.migration.problems.map((problem) => problem.code)).toEqual(
      expect.arrayContaining(['upgrade.not-restored', 'upgrade.edited-since-move']),
    );
    await session.upgradeTarget(release.id, down.migration);
    expect(dataOf(session.snapshot.project, HILLS)).toMatchObject({
      default_block: { Name: 'minecraft:deepslate' },
    });
    session.dispose();
  });

  it('moves a project moved up with no saved record back with the honest list', async () => {
    const { session } = await openWorldgen();
    const up = await session.upgradeReport(next.id);
    // As a move made before MCSuperMods kept them: no copy, no record.
    await session.upgradeTarget(next.id, up.migration, { keepCopy: false });
    expect(await session.savedUpgradeReports()).toEqual([]);

    const down = await session.upgradeReport(release.id);
    const inverted = down.inverted;
    expect(inverted?.noRecord).toBe(true);
    expect(inverted?.segments).toEqual([{ from: next.id, to: release.id, noRecord: true }]);
    expect(inverted?.restored).toEqual([]);
    // The changes the move made by itself, each with the things it may have touched.
    const unrecorded = inverted?.unrecorded ?? [];
    expect(unrecorded.find((entry) => entry.change.id === DEFAULT_BLOCK)).toMatchObject({
      targetId: next.id,
      elementIds: [HILLS],
    });
    expect(unrecorded.every((entry) => entry.change.handling === 'auto')).toBe(true);
    expect(down.migration.problems.map((problem) => problem.code)).toEqual([
      'upgrade.no-saved-report',
    ]);
    // Nothing is invented: the field stays away.
    await session.upgradeTarget(release.id, down.migration);
    expect(session.snapshot.project?.targets).toEqual([release.id]);
    expect(dataOf(session.snapshot.project, HILLS)).not.toHaveProperty('default_block');
    session.dispose();
  });

  it('undoes two moves saved one at a time, one after the other', async () => {
    // A third target after the next one that drops sea_level from noise settings.
    const top: Target = {
      ...(next as Target),
      id: 'mc-top',
      previous: next.id,
      changes: {
        from: next.id,
        to: 'mc-top',
        refs: { from: { mcdoc: 'a', mcmeta: 'a' }, to: { mcdoc: 'b', mcmeta: 'b' } },
        changes: [
          {
            id: SEA_LEVEL,
            area: 'formats',
            what: 'field-removed',
            registry: 'minecraft:resource',
            subject: 'minecraft:resource/worldgen/noise_settings',
            field: '/sea_level',
            handling: 'auto',
            source: 'curated',
          },
        ],
        additions: {},
      },
      migrateFrom: (_from, project) => {
        const changes: MigrationChange[] = [];
        const reverses: NonNullable<MigrationReport['reverses']> = [];
        for (const namespace of project.namespaces) {
          for (const element of namespace.elements) {
            const data = element.data as JsonObject;
            if (element.kind !== NOISE_SETTINGS || !('sea_level' in data)) continue;
            const { sea_level: before, ...rest } = data;
            changes.push({
              elementId: element.id,
              kind: 'update',
              description: 'Removed sea_level.',
              data: rest,
              details: [
                { op: 'drop', path: '/sea_level', before: before as Json, changeId: SEA_LEVEL },
              ],
            });
            reverses.push({
              elementId: element.id,
              path: '/sea_level',
              value: before as Json,
              afterHash: '',
            });
          }
        }
        return { changes, problems: [], reverses };
      },
    };
    const { session } = await openWorldgen(
      { targets: [{ target: top }, { target: next as Target }, { target: release as Target }] },
      { 'mc-top': next.id },
    );
    const original = structuredClone(session.snapshot.project);
    for (const id of [next.id, 'mc-top']) {
      const up = await session.upgradeReport(id);
      const outcome = await session.upgradeTarget(id, up.migration, { upgradeReport: up.report });
      expect(outcome.saveError).toBeUndefined();
    }
    const moved = dataOf(session.snapshot.project, HILLS);
    expect(moved).not.toHaveProperty('default_block');
    expect(moved).not.toHaveProperty('sea_level');
    expect(
      (await session.savedUpgradeReports()).map((s) => `${s.from.targetId}>${s.to.targetId}`),
    ).toEqual([`${next.id}>mc-top`, `${release.id}>${next.id}`]);

    const down = await session.upgradeReport(release.id);
    expect(down.hops).toHaveLength(2);
    expect(down.inverted?.segments.map((s) => [s.from, s.to, s.noRecord])).toEqual([
      ['mc-top', next.id, false],
      [next.id, release.id, false],
    ]);
    expect(down.inverted?.restored.map((entry) => entry.path)).toEqual([
      '/sea_level',
      '/default_block',
    ]);
    // Each saved move is checked against the project as the part before left it: not edited.
    expect(down.inverted?.edited).toEqual([]);
    await session.upgradeTarget(release.id, down.migration);
    expect(session.snapshot.project).toEqual(original);
    session.dispose();
  });
});

describe('The modpacks re-pinned with the move (B821, wired by B820)', () => {
  it('writes the packs with the move, puts them back on undo, and warns when one cannot be written', async () => {
    const { session, platform } = await openWorldgen();
    const before = {
      formatVersion: 1 as const,
      name: 'Pack',
      version: '1.0.0',
      targetId: release.id,
      projects: [],
      mods: [],
    };
    const after = { ...before, targetId: next.id };
    const writes: string[] = [];
    let fail = false;
    platform.modpacks = {
      write: async (root: string, modpack: { targetId: string }) => {
        if (fail) throw new Error('disk full');
        writes.push(`${root}:${modpack.targetId}`);
        return {} as never;
      },
    } as unknown as NonNullable<typeof platform.modpacks>;
    const up = await session.upgradeReport(next.id);
    await session.upgradeTarget(next.id, up.migration, {
      keepCopy: false,
      effects: [{ type: 'app.modpack-repin', data: { root: '/packs/a', before, after } }],
    });
    await session.flushAssetFiles();
    expect(writes).toEqual([`/packs/a:${next.id}`]);
    expect(session.undo()).toBe(true);
    await session.flushAssetFiles();
    expect(writes).toEqual([`/packs/a:${next.id}`, `/packs/a:${release.id}`]);
    fail = true;
    expect(session.redo()).toBe(true);
    await session.flushAssetFiles();
    expect(session.snapshot.problems).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'modpack.repin-failed',
        message: expect.stringContaining('disk full'),
      }),
    );
    session.dispose();
  });
});

describe('moveBack without a record (B815 suggestion)', () => {
  const changeSet: TargetChangeSet = {
    from: 'mc-old',
    to: 'mc-new',
    refs: { from: { mcdoc: 'a', mcmeta: 'a' }, to: { mcdoc: 'b', mcmeta: 'b' } },
    changes: [
      {
        id: 'ids:tag/item/old_logs',
        area: 'ids',
        what: 'member-renamed',
        registry: 'tag/item',
        subject: 'tag/item/old_logs',
        from: 'old_logs',
        to: 'new_logs',
        handling: 'auto',
        source: 'curated',
      },
      {
        id: 'ids:item/maybe',
        area: 'ids',
        what: 'member-renamed',
        registry: 'item',
        subject: 'item/maybe',
        from: 'maybe',
        to: 'perhaps',
        handling: 'manual',
        source: 'curated',
      },
    ],
    additions: {},
  };
  const { previous: _none, ...base } = release as Target;
  const old: Target = { ...base, id: 'mc-old' };
  const newer: Target = {
    ...(release as Target),
    id: 'mc-new',
    previous: 'mc-old',
    changes: changeSet,
  };
  const project: Project = {
    formatVersion: 1,
    targets: ['mc-new'],
    namespaces: [
      {
        id: 'demo',
        elements: [
          {
            id: 'demo:recipe',
            kind: 'minecraft:recipe',
            data: {
              ingredient: '#minecraft:new_logs',
              result: { id: 'minecraft:perhaps' },
              note: 'uses #minecraft:new_logs',
            },
          },
        ],
      },
    ],
  } as unknown as Project;

  it('renames back only the renames the move made by itself, as whole strings', () => {
    const chain = migrationChain([newer, old], 'mc-new', 'mc-old');
    if (!chain.ok) throw new Error('No chain.');
    expect(moveBackParts([newer, old], chain.steps, [])).toHaveLength(1);
    const result = moveBack(project, [newer, old], chain.steps, []);
    expect(result.noRecord).toBe(true);
    expect(result.restored).toEqual([
      {
        elementId: 'demo:recipe',
        path: '/ingredient',
        op: 'undo-rename-id',
        changeId: 'ids:tag/item/old_logs',
      },
    ]);
    expect(result.report.changes).toEqual([
      expect.objectContaining({
        elementId: 'demo:recipe',
        data: {
          ingredient: '#minecraft:old_logs',
          result: { id: 'minecraft:perhaps' },
          note: 'uses #minecraft:new_logs',
        },
      }),
    ]);
    expect(result.unrecorded).toEqual([]);
  });
});
