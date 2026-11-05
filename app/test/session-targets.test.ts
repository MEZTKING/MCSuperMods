import { createMemoryFileSystem, type Project } from '@msm/core';
import {
  definePlugin,
  type ElementKind,
  type MigrationReport,
  type ProjectStarter,
  type Target,
} from '@msm/plugin-api';
import { builtInTargets, defaultTargetId } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { builtInPlugins } from '../src/renderer/src/plugins/built-in';
import { SessionProblemCodes } from '../src/renderer/src/session/project-session';
import { fakeLibraryPlugin, fakeStarter, newSession } from './session-fixture';

const NOISE_SETTINGS = 'minecraft:worldgen/noise_settings';

const release = builtInTargets.find((entry) => entry.target.id === defaultTargetId)?.target;
const other = builtInTargets.find((entry) => entry.target.id !== defaultTargetId)?.target;
if (release === undefined || other === undefined) throw new Error('Two built-in targets needed.');

/** The other built-in target with its `migrateFrom` replaced. */
function withMigration(migrateFrom: Target['migrateFrom']): Target {
  const target: Target = { ...(other as Target) };
  if (migrateFrom === undefined) delete target.migrateFrom;
  else target.migrateFrom = migrateFrom;
  return target;
}

/** A session over the release target and `next`, with a new project open on the release one. */
async function openWith(next: Target, extra: { plugins?: typeof builtInPlugins } = {}) {
  const fs = createMemoryFileSystem();
  const targets = [{ target: next }, { target: release as Target }];
  const result = newSession(fs, {}, { targets, ...extra });
  expect(await result.session.newProject()).toEqual({ ok: true });
  await result.session.flushValidation();
  return result;
}

function elementIds(project: Project | null): string[] {
  return project?.namespaces.flatMap((namespace) => namespace.elements.map((e) => e.id)) ?? [];
}

describe('ProjectSession: targets (ADR 0037 D4)', () => {
  it('lists the built-in targets as facts, newest first, and defaults to the release one', () => {
    const { session } = newSession(createMemoryFileSystem());
    expect(session.availableTargets.map((target) => target.id)).toEqual(
      builtInTargets.map((entry) => entry.target.id),
    );
    expect(session.availableTargets.some((target) => 'migrateFrom' in target)).toBe(false);
    expect(session.defaultTargetId).toBe(defaultTargetId);
  });

  it('previews and applies the real upgrade, and undo reverts it', async () => {
    const fs = createMemoryFileSystem();
    const { session, calls } = newSession(fs);
    await session.newProject();
    await session.flushValidation();
    const report = await session.upgradeTargetPreview(other.id);
    expect(report.changes).toEqual([]);
    await session.upgradeTarget(other.id, report);
    expect(session.snapshot.project?.targets).toEqual([other.id]);
    expect(session.target.id).toBe(other.id);
    expect(session.snapshot.undoLabel).toBe(`Upgrade target to ${other.id}`);
    // The schema context of the new target was loaded.
    expect(calls.vendoredReads.some((read) => read.startsWith(other.id))).toBe(true);
    expect(session.undo()).toBe(true);
    expect(session.snapshot.project?.targets).toEqual([defaultTargetId]);
    // The project's own target yields an empty report.
    expect(await session.upgradeTargetPreview(defaultTargetId)).toEqual({
      changes: [],
      problems: [],
    });
  });

  it('reports "No migration needed" for a target without the hook', async () => {
    const { session } = await openWith(withMigration(undefined));
    const report = await session.upgradeTargetPreview(other.id);
    expect(report).toEqual({
      changes: [],
      problems: [
        {
          severity: 'info',
          code: SessionProblemCodes.noMigrationNeeded,
          message: 'No migration needed',
        },
      ],
    });
  });

  it('applies update and remove changes with the target as one undo step', async () => {
    const seen: { previous: string; project: string }[] = [];
    const next = withMigration((previous, project) => {
      seen.push({ previous: previous.id, project: project.name });
      return {
        changes: [
          {
            elementId: 'demo:pack',
            description: 'New description',
            data: { pack: { description: 'Upgraded' } },
          },
          { elementId: 'demo:greet', description: 'Removed', kind: 'remove' },
          { elementId: 'demo:gone', description: 'Not in the project', data: {} },
          { elementId: 'demo:pack', description: 'Informational only' },
        ],
        problems: [{ severity: 'warning', code: 'target.no-migration-path', message: 'Check' }],
      };
    });
    const { session } = await openWith(next);
    session.addElement({ id: 'demo:greet', kind: 'minecraft:function', data: { lines: [] } });
    const before = session.snapshot.project;
    const report: MigrationReport = await session.upgradeTargetPreview(next.id);
    expect(seen).toEqual([{ previous: defaultTargetId, project: 'demo' }]);
    expect(report.changes).toHaveLength(4);
    expect(report.problems).toHaveLength(1);
    // The preview applies nothing.
    expect(session.snapshot.project).toBe(before);

    await session.upgradeTarget(next.id, report);
    const after = session.snapshot.project;
    expect(after?.targets).toEqual([next.id]);
    expect(elementIds(after)).toEqual(['demo:pack']);
    expect(after?.namespaces[0]?.elements[0]?.data).toEqual({ pack: { description: 'Upgraded' } });

    expect(session.undo()).toBe(true);
    const undone = session.snapshot.project;
    expect(undone?.targets).toEqual([defaultTargetId]);
    expect(elementIds(undone).sort()).toEqual(['demo:greet', 'demo:pack']);
    expect(undone?.namespaces[0]?.elements.find((e) => e.id === 'demo:pack')?.data).toEqual(
      before?.namespaces[0]?.elements.find((e) => e.id === 'demo:pack')?.data,
    );
    expect(session.redo()).toBe(true);
    expect(session.snapshot.project?.targets).toEqual([next.id]);
  });

  it('refuses an unknown target', async () => {
    const { session } = await openWith(withMigration(undefined));
    await expect(session.upgradeTargetPreview('mc-0.0')).rejects.toThrow('Unknown target');
    await expect(session.upgradeTarget('mc-0.0', { changes: [], problems: [] })).rejects.toThrow(
      'Unknown target',
    );
  });

  it('validates every element again after a target change and after its undo', async () => {
    const { session } = await openWith(withMigration(undefined));
    session.addElement({ id: 'demo:hills', kind: NOISE_SETTINGS });
    await session.flushValidation();
    const unknownField = () =>
      session.snapshot.problems.filter(
        (problem) => problem.elementId === 'demo:hills' && problem.code === 'schema.unknown-field',
      );
    expect(unknownField()).toEqual([]);
    // On a target whose noise settings lack `default_block`, the release data is reported.
    const releaseHasField = 'default_block' in (session.kindDefault(NOISE_SETTINGS) as object);
    await session.upgradeTarget(other.id, { changes: [], problems: [] });
    const otherHasField = 'default_block' in (session.kindDefault(NOISE_SETTINGS) as object);
    // mc-26.3 keeps `default_block`, mc-26.4 dropped it (B156's target fact).
    expect([releaseHasField, otherHasField]).toEqual([true, false]);
    expect(unknownField().map((problem) => problem.path)).toEqual(['/default_block']);
    session.undo();
    await session.flushValidation();
    expect(unknownField()).toEqual([]);
  });
});

describe('ProjectSession: per-target default data (ADR 0036 D8)', () => {
  it('kindDefault follows the open project target and addElement uses it', async () => {
    const { session } = await openWith(withMigration(undefined));
    const releaseDefault = session.kindDefault(NOISE_SETTINGS) as Record<string, unknown>;
    const kind = session.registry.get(NOISE_SETTINGS) as ElementKind;
    expect(releaseDefault).toEqual(await kind.defaultDataFor?.(release));
    await session.upgradeTarget(other.id, { changes: [], problems: [] });
    const otherDefault = session.kindDefault(NOISE_SETTINGS);
    expect(otherDefault).toEqual(await kind.defaultDataFor?.(other));
    session.addElement({ id: 'demo:hills', kind: NOISE_SETTINGS });
    const added = session.snapshot.project?.namespaces[0]?.elements.find(
      (element) => element.id === 'demo:hills',
    );
    expect(added?.data).toEqual(otherDefault);
    // A kind without the hook keeps its defaultData; an unknown kind has none.
    const recipe = session.registry.get('minecraft:recipe');
    expect(session.kindDefault('minecraft:recipe')).toEqual(recipe?.defaultData);
    expect(session.kindDefault('test:unknown')).toBeUndefined();
  });

  it('a defaultDataFor that throws falls back to defaultData', async () => {
    const plugin = definePlugin({
      id: 'test.throwing',
      apiVersion: '^1.0.0',
      contributes: {
        elementKinds: [
          {
            id: 'test:throwing',
            schema: '::java::data::recipe::Recipe',
            folder: 'test_throwing',
            defaultData: { plain: true },
            defaultDataFor: () => {
              throw new Error('boom');
            },
            lower: () => [],
          },
        ],
      },
    });
    const { session } = await openWith(withMigration(undefined), {
      plugins: [...builtInPlugins, plugin],
    });
    expect(session.kindDefault('test:throwing')).toEqual({ plain: true });
  });

  it("creates pack.mcmeta from its kind's defaultDataFor for the chosen target", async () => {
    const pack = definePlugin({
      id: 'test.pack',
      apiVersion: '^1.0.0',
      contributes: {
        elementKinds: [
          {
            id: 'minecraft:pack_mcmeta',
            schema: '::java::pack::Pack',
            folder: 'pack',
            defaultData: { pack: { description: 'plain' } },
            defaultDataFor: (target) => ({ pack: { description: target.id } }),
            lower: () => [],
          },
        ],
      },
    });
    const fs = createMemoryFileSystem();
    const { session } = newSession(fs, {}, { plugins: [pack] });
    expect(await session.newProject({ targetId: other.id })).toEqual({ ok: true });
    expect(session.snapshot.project?.targets).toEqual([other.id]);
    expect(session.snapshot.project?.namespaces[0]?.elements[0]?.data).toEqual({
      pack: { description: other.id },
    });
  });
});

describe('ProjectSession: newProject from the dialog', () => {
  it('builds the starter named by id for the chosen target with the wizard values', async () => {
    const contexts: { target: string; values: unknown }[] = [];
    const starter: ProjectStarter = {
      ...fakeStarter,
      id: 'wizard_starter',
      parameters: [
        { id: 'name', type: 'string', label: 'Name', default: 'Ruby' },
        { id: 'count', type: 'number', label: 'Count', default: 2 },
      ],
      build: (context) => {
        contexts.push({ target: context.target.id, values: context.values });
        return fakeStarter.build(context);
      },
    };
    const plugin = definePlugin({
      ...fakeLibraryPlugin,
      contributes: { ...fakeLibraryPlugin.contributes, projectStarters: [starter] },
    });
    const fs = createMemoryFileSystem();
    const { session } = newSession(fs, {}, { plugins: [...builtInPlugins, plugin] });
    expect(
      await session.newProject({
        starterId: 'wizard_starter',
        targetId: other.id,
        values: { name: 'Amber' },
      }),
    ).toEqual({ ok: true });
    expect(contexts).toEqual([{ target: other.id, values: { name: 'Amber', count: 2 } }]);
    expect(session.snapshot.project?.targets).toEqual([other.id]);
  });

  it('creates a blank project for starterId null and refuses unknown ids before asking', async () => {
    const fs = createMemoryFileSystem();
    const { session, calls } = newSession(fs);
    expect(await session.newProject({ starterId: 'nope' })).toEqual({
      ok: false,
      reason: 'Unknown starter "nope".',
    });
    expect(await session.newProject({ starterId: null, targetId: 'mc-0.0' })).toEqual({
      ok: false,
      reason: 'Unknown target "mc-0.0".',
    });
    expect(calls.pickDirectory).toEqual([]);
    expect(await session.newProject({ starterId: null, values: {} })).toEqual({ ok: true });
    expect(session.snapshot.project?.targets).toEqual([defaultTargetId]);
    expect(elementIds(session.snapshot.project)).toEqual(['demo:pack']);
  });
});
