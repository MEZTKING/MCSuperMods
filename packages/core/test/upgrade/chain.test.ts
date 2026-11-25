import type { Json, MigrationReport, Project, Target } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  applyMigration,
  elementDataHash,
  findElement,
  invert,
  migrationChain,
  runChain,
  UpgradeProblemCodes,
} from '../../src/index';
import {
  allTargets,
  DEFAULT_BLOCK_CHANGE,
  fixtureProject,
  ORE_CHANGE,
  targetA,
  targetB,
  targetC,
} from './stand-ins';

const empty: MigrationReport = { changes: [], problems: [] };

function steps(from: string, to: string) {
  const chain = migrationChain(allTargets, from, to);
  if (!chain.ok) throw new Error(`no chain: ${chain.reason}`);
  return chain.steps;
}

function dataOf(project: Project, id: string): Json | undefined {
  return findElement(project, id as never)?.data;
}

function setData(project: Project, id: string, data: Json): Project {
  const copy = structuredClone(project);
  const element = findElement(copy, id as never);
  if (element === undefined) throw new Error(id);
  element.data = data;
  return copy;
}

describe('migrationChain', () => {
  it('follows previous links up and down', () => {
    const up = migrationChain(allTargets, 'mc-a', 'mc-c');
    expect(up.ok && up.steps.map((s) => [s.from.id, s.to.id, s.direction])).toEqual([
      ['mc-a', 'mc-b', 'up'],
      ['mc-b', 'mc-c', 'up'],
    ]);
    const down = migrationChain(allTargets, 'mc-c', 'mc-a');
    expect(down.ok && down.steps.map((s) => [s.from.id, s.to.id, s.direction])).toEqual([
      ['mc-c', 'mc-b', 'down'],
      ['mc-b', 'mc-a', 'down'],
    ]);
    expect(migrationChain(allTargets, 'mc-b', 'mc-b')).toEqual({ ok: true, steps: [] });
  });

  it('says when there is no path or no such target', () => {
    expect(migrationChain(allTargets, 'mc-b', 'mc-side')).toEqual({ ok: false, reason: 'no-path' });
    expect(migrationChain(allTargets, 'mc-a', 'mc-zz')).toEqual({
      ok: false,
      reason: 'unknown-target',
      targetId: 'mc-zz',
    });
    const loop: Target[] = [
      { ...targetA, previous: 'mc-b' },
      { ...targetB, previous: 'mc-a' },
      { ...targetC, previous: 'mc-c' },
    ];
    expect(migrationChain(loop, 'mc-a', 'mc-c')).toEqual({ ok: false, reason: 'no-path' });
  });
});

describe('runChain', () => {
  it('equals two single moves through a stand-in third target', () => {
    const project = fixtureProject();
    const original = structuredClone(project);
    const chained = runChain(project, steps('mc-a', 'mc-c'));
    expect(project).toEqual(original);

    const first = targetB.migrateFrom?.(targetA, project) ?? empty;
    const once = applyMigration(project, first, 'mc-b');
    const second = targetC.migrateFrom?.(targetB, once) ?? empty;
    const twice = applyMigration(once, second, 'mc-c');

    expect(chained.project).toEqual(twice);
    expect(chained.project.targets).toEqual(['mc-c']);
    // The merged report applied once (one undo step) gives the same project.
    expect(applyMigration(project, chained.report, 'mc-c')).toEqual(twice);
    expect(chained.hops.map((hop) => [hop.from, hop.to, hop.report.changes.length])).toEqual([
      ['mc-a', 'mc-b', 1],
      ['mc-b', 'mc-c', 2],
    ]);
  });

  it('merges one change per element with the details in order', () => {
    const run = runChain(fixtureProject(), steps('mc-a', 'mc-c'));
    expect(run.report.changes.map((change) => change.elementId)).toEqual(['fx:land', 'fx:veins']);
    const land = run.report.changes[0];
    expect(land?.details?.map((detail) => [detail.op, detail.path])).toEqual([
      ['drop', '/default_block'],
      ['drop', '/disable_mob_generation'],
    ]);
    expect(land?.data).toEqual({ sea_level: 63 });
    expect(run.report.problems.map((problem) => problem.code)).toEqual(['target.removed-id']);
    expect(run.report.inGameChecks).toEqual([{ changeId: ORE_CHANGE, check: 'Find an ore vein.' }]);
  });

  it('keeps every dropped value with the hash of the moved element', () => {
    const run = runChain(fixtureProject(), steps('mc-a', 'mc-c'));
    const hash = elementDataHash(dataOf(run.project, 'fx:land') as Json);
    expect(run.report.reverses).toEqual([
      {
        elementId: 'fx:land',
        path: '/default_block',
        value: { Name: 'minecraft:stone' },
        afterHash: hash,
      },
      { elementId: 'fx:land', path: '/disable_mob_generation', value: false, afterHash: hash },
    ]);
  });

  it('runs nothing on a down hop', () => {
    const moved = runChain(fixtureProject(), steps('mc-a', 'mc-c')).project;
    const back = runChain(moved, steps('mc-c', 'mc-a'));
    expect(back.report).toEqual(empty);
    expect(back.project.targets).toEqual(['mc-a']);
  });
});

describe('elementDataHash', () => {
  it('ignores key order and sees any change', () => {
    expect(elementDataHash({ a: 1, b: [1, 2] })).toBe(elementDataHash({ b: [1, 2], a: 1 }));
    expect(elementDataHash({ a: 1 })).not.toBe(elementDataHash({ a: 2 }));
    expect(elementDataHash({ a: 1 })).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('invert', () => {
  it('puts default_block back after one move', () => {
    const project = fixtureProject();
    const up = runChain(project, steps('mc-a', 'mc-b'));
    const back = runChain(up.project, steps('mc-b', 'mc-a'));
    const result = invert(back.report, up.report, up.project);
    expect(result.notRestored).toEqual([]);
    expect(result.edited).toEqual([]);
    expect(result.restored).toEqual([
      {
        elementId: 'fx:land',
        path: '/default_block',
        op: 'put-back',
        changeId: DEFAULT_BLOCK_CHANGE,
      },
    ]);
    expect(applyMigration(up.project, result.report, 'mc-a')).toEqual(project);
  });

  it('undoes a two-hop chain, renames included, to the original', () => {
    const project = fixtureProject();
    const up = runChain(project, steps('mc-a', 'mc-c'));
    const result = invert(empty, up.report, up.project);
    expect(result.notRestored).toEqual([]);
    expect(result.restored.map((entry) => [entry.elementId, entry.op, entry.path])).toEqual([
      ['fx:veins', 'undo-rename-id', '/type'],
      ['fx:land', 'put-back', '/disable_mob_generation'],
      ['fx:land', 'put-back', '/default_block'],
    ]);
    expect(applyMigration(up.project, result.report, 'mc-a')).toEqual(project);
  });

  it('puts a value back into an element edited since, and reports the edit', () => {
    const project = fixtureProject();
    const up = runChain(project, steps('mc-a', 'mc-b'));
    const edited = setData(up.project, 'fx:land', { disable_mob_generation: false, sea_level: 64 });
    const result = invert(empty, up.report, edited);
    expect(result.edited).toEqual(['fx:land']);
    expect(result.restored).toHaveLength(1);
    expect(result.report.problems).toEqual([
      expect.objectContaining({ code: UpgradeProblemCodes.editedSinceMove, elementId: 'fx:land' }),
    ]);
    const back = applyMigration(edited, result.report, 'mc-a');
    expect(dataOf(back, 'fx:land')).toEqual({
      default_block: { Name: 'minecraft:stone' },
      disable_mob_generation: false,
      sea_level: 64,
    });
  });

  it('does not overwrite a place that is taken', () => {
    const up = runChain(fixtureProject(), steps('mc-a', 'mc-b'));
    const taken = setData(up.project, 'fx:land', {
      default_block: { Name: 'minecraft:dirt' },
      disable_mob_generation: false,
      sea_level: 63,
    });
    const result = invert(empty, up.report, taken);
    expect(result.restored).toEqual([]);
    expect(result.notRestored).toEqual([
      {
        elementId: 'fx:land',
        path: '/default_block',
        reason: 'place-taken',
        changeId: DEFAULT_BLOCK_CHANGE,
      },
    ]);
    expect(result.report.changes).toEqual([]);
    expect(result.edited).toEqual(['fx:land']);
    expect(result.report.problems).toEqual([
      expect.objectContaining({ code: UpgradeProblemCodes.notRestored, path: '/default_block' }),
      expect.objectContaining({ code: UpgradeProblemCodes.editedSinceMove, elementId: 'fx:land' }),
    ]);
  });

  it('lists a value whose element is gone', () => {
    const up = runChain(fixtureProject(), steps('mc-a', 'mc-b'));
    const gone = structuredClone(up.project);
    for (const namespace of gone.namespaces) {
      namespace.elements = namespace.elements.filter((element) => element.id !== 'fx:land');
    }
    const result = invert(empty, up.report, gone);
    expect(result.notRestored).toEqual([
      {
        elementId: 'fx:land',
        path: '/default_block',
        reason: 'element-gone',
        changeId: DEFAULT_BLOCK_CHANGE,
      },
    ]);
    expect(result.report.changes).toEqual([]);
  });

  it('does not undo a rename the user changed since', () => {
    const up = runChain(fixtureProject(), steps('mc-a', 'mc-c'));
    const changed = setData(up.project, 'fx:veins', {
      type: 'minecraft:scatter',
      config: { size: 9 },
    });
    const result = invert(empty, up.report, changed);
    expect(result.notRestored).toEqual([
      { elementId: 'fx:veins', path: '/type', reason: 'changed-since', changeId: ORE_CHANGE },
    ]);
    const back = applyMigration(changed, result.report, 'mc-a');
    expect(dataOf(back, 'fx:veins')).toEqual({ type: 'minecraft:scatter', config: { size: 9 } });
  });

  it('undoes a move and a set', () => {
    const project = fixtureProject();
    const moved = setData(project, 'fx:land', { inner: { level: 63 }, required: 1 });
    const saved: MigrationReport = {
      changes: [
        {
          elementId: 'fx:land',
          kind: 'update',
          description: 'Moved.',
          data: { level: 63, required: 1 },
          details: [
            {
              op: 'move',
              from: '/inner/level',
              path: '/level',
              before: 63,
              after: 63,
              changeId: 'm',
            },
            { op: 'set', path: '/required', after: 1, changeId: 's' },
          ],
        },
      ],
      problems: [],
    };
    const now = applyMigration(moved, saved);
    const result = invert(empty, saved, now);
    // The emptied parent object stays gone, so the move cannot go back: listed, not forced.
    expect(result.notRestored).toEqual([
      { elementId: 'fx:land', path: '/level', reason: 'parent-gone', changeId: 'm' },
    ]);
    expect(result.restored).toEqual([
      { elementId: 'fx:land', path: '/required', op: 'undo-set', changeId: 's' },
    ]);
    const withParent = setData(now, 'fx:land', { level: 63, required: 1, inner: {} });
    const again = invert(empty, saved, withParent);
    expect(again.notRestored).toEqual([]);
    expect(dataOf(applyMigration(withParent, again.report), 'fx:land')).toEqual({
      inner: { level: 63 },
    });
  });

  it('says so when there is no saved report', () => {
    const up = runChain(fixtureProject(), steps('mc-a', 'mc-b'));
    const result = invert(empty, undefined, up.project);
    expect(result.noRecord).toBe(true);
    expect(result.report.changes).toEqual([]);
    expect(result.report.problems.map((problem) => problem.code)).toEqual([
      UpgradeProblemCodes.noSavedReport,
    ]);
  });

  it('lists an element the move removed', () => {
    const project = fixtureProject();
    const saved: MigrationReport = {
      changes: [{ elementId: 'fx:pillar', kind: 'remove', description: 'Removed.' }],
      problems: [],
    };
    const result = invert(empty, saved, applyMigration(project, saved));
    expect(result.notRestored).toEqual([{ elementId: 'fx:pillar', reason: 'removed' }]);
  });
});
