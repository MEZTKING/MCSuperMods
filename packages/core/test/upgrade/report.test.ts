import type { MigrationReport, Problem, Project, TargetChangeSet } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  buildUpgradeReport,
  createElement,
  createEmptyProject,
  findElement,
  mapProblemThroughMigration,
  matchChanges,
  migrationChain,
  newProblems,
  openItems,
  problemKey,
  runChain,
} from '../../src/index';
import {
  allTargets,
  changeSetB,
  changeSetC,
  DEFAULT_BLOCK_CHANGE,
  fixtureProject,
  MOB_GENERATION_CHANGE,
  OLD_BLOCK_CHANGE,
  ORE_CHANGE,
  targetA,
  targetB,
  targetC,
} from './stand-ins';

const problem = (code: string, extra: Partial<Problem> = {}): Problem => ({
  severity: 'error',
  code,
  message: `${code} message`,
  ...extra,
});

function dryRun(to: string) {
  const project = fixtureProject();
  const chain = migrationChain(allTargets, 'mc-a', to);
  if (!chain.ok) throw new Error(chain.reason);
  const run = runChain(project, chain.steps);
  const changeSets = chain.steps.flatMap((step) =>
    step.to.changes === undefined ? [] : [step.to.changes],
  );
  return { project, run, changeSets };
}

describe('problem identity', () => {
  it('ignores message and severity', () => {
    const a = problem('x.y', { elementId: 'fx:a', path: '/p' });
    expect(problemKey(a)).toBe(problemKey({ ...a, message: 'other words', severity: 'warning' }));
    expect(problemKey(a)).not.toBe(problemKey({ ...a, path: '/q' }));
  });

  it('maps a path through a move and drops it under a drop', () => {
    const migration: MigrationReport = {
      changes: [
        {
          elementId: 'fx:a',
          description: 'd',
          data: {},
          details: [
            { op: 'move', from: '/old', path: '/new/place', changeId: 'm' },
            { op: 'drop', path: '/gone', changeId: 'd' },
          ],
        },
        { elementId: 'fx:b', kind: 'remove', description: 'r' },
      ],
      problems: [],
    };
    expect(
      mapProblemThroughMigration(problem('c', { elementId: 'fx:a', path: '/old/0' }), migration)
        ?.path,
    ).toBe('/new/place/0');
    expect(
      mapProblemThroughMigration(problem('c', { elementId: 'fx:a', path: '/oldish' }), migration)
        ?.path,
    ).toBe('/oldish');
    expect(
      mapProblemThroughMigration(problem('c', { elementId: 'fx:a', path: '/gone/x' }), migration),
    ).toBeUndefined();
    expect(
      mapProblemThroughMigration(problem('c', { elementId: 'fx:b', path: '/x' }), migration),
    ).toBeUndefined();
    expect(
      newProblems(
        [problem('c', { elementId: 'fx:a', path: '/old' })],
        [problem('c', { elementId: 'fx:a', path: '/new/place' })],
        migration,
      ),
    ).toEqual([]);
    expect(
      newProblems(
        [problem('c', { elementId: 'fx:a', path: '/old' })],
        [problem('c', { elementId: 'fx:a', path: '/new/place' })],
      ),
    ).toHaveLength(1);
  });

  it('counts warnings, ignores info and counts repeats', () => {
    const before = [problem('a', { elementId: 'fx:a' })];
    const after = [
      problem('a', { elementId: 'fx:a', message: 'now with a version in it' }),
      problem('a', { elementId: 'fx:a' }),
      problem('w', { severity: 'warning', elementId: 'fx:a' }),
      problem('i', { severity: 'info', elementId: 'fx:a' }),
    ];
    expect(newProblems(before, after).map((p) => p.code)).toEqual(['a', 'w']);
  });
});

describe('matchChanges', () => {
  it('finds whole ids, dispatcher fields and skips plain text', () => {
    const touches = matchChanges([changeSetB, changeSetC], fixtureProject());
    expect(touches.map((t) => [t.changeId, t.elementId, t.path])).toEqual([
      [DEFAULT_BLOCK_CHANGE, 'fx:land', '/default_block'],
      [OLD_BLOCK_CHANGE, 'fx:pillar', '/block'],
      [MOB_GENERATION_CHANGE, 'fx:land', '/disable_mob_generation'],
      [ORE_CHANGE, 'fx:veins', '/type'],
    ]);
  });

  it('finds block states, removed types and commands', () => {
    const project: Project = createEmptyProject('p', { targets: ['mc-a'] });
    const now = () => '2026-01-01T00:00:00.000Z';
    project.namespaces.push({
      name: 'fx',
      assets: [],
      elements: [
        createElement({
          id: 'fx:jukebox',
          kind: 'msm:structure_piece',
          data: {
            blocks: [
              { Name: 'minecraft:jukebox', Properties: { has_record: 'false', old_prop: 'x' } },
              { Name: 'jukebox' },
            ],
          },
          now,
        }),
        createElement({
          id: 'fx:density',
          kind: 'minecraft:worldgen/density_function',
          data: { argument: { type: 'minecraft:gone_fn', x: 1 } },
          now,
        }),
        createElement({
          id: 'fx:tick',
          kind: 'minecraft:function',
          data: { lines: ['say hi', 'oldcmd run me'] },
          now,
        }),
        createElement({
          id: 'fx:text',
          kind: 'minecraft:function',
          data: { lines: ['say oldcmd is fine'] },
          now,
        }),
      ],
    });
    const set: TargetChangeSet = {
      ...changeSetB,
      changes: [
        {
          id: 'b:1',
          area: 'block-states',
          what: 'property-removed',
          subject: 'jukebox',
          field: 'old_prop',
          handling: 'manual',
          source: 'blocks',
        },
        {
          id: 'b:2',
          area: 'block-states',
          what: 'default-changed',
          subject: 'jukebox',
          field: 'has_record',
          handling: 'none',
          source: 'blocks',
        },
        {
          id: 'b:3',
          area: 'block-states',
          what: 'property-added',
          subject: 'jukebox',
          field: 'mode',
          handling: 'none',
          source: 'blocks',
        },
        {
          id: 'f:1',
          area: 'formats',
          what: 'type-removed',
          registry: 'minecraft:density_function',
          subject: 'minecraft:density_function/gone_fn',
          handling: 'manual',
          source: 'mcdoc',
        },
        {
          id: 'c:1',
          area: 'commands',
          what: 'root-removed',
          subject: 'oldcmd',
          handling: 'manual',
          source: 'commands',
        },
      ],
    };
    expect(matchChanges([set], project).map((t) => [t.changeId, t.elementId, t.path])).toEqual([
      ['b:1', 'fx:jukebox', '/blocks/0/Properties/old_prop'],
      ['b:2', 'fx:jukebox', '/blocks/1'],
      ['f:1', 'fx:density', '/argument'],
      ['c:1', 'fx:tick', '/lines/1'],
    ]);
  });
});

describe('buildUpgradeReport', () => {
  it('names each change once with its elements, and counts what touches nothing', () => {
    const { project, run, changeSets } = dryRun('mc-c');
    const report = buildUpgradeReport({
      changeSets,
      migration: run.report,
      problemsBefore: [],
      problemsAfter: [],
      factsBefore: targetA,
      factsAfter: targetC,
      project,
      moved: run.project,
    });
    expect(report.from).toEqual({ targetId: 'mc-a', mcVersion: 'a' });
    expect(report.to).toEqual({ targetId: 'mc-c', mcVersion: 'c' });
    expect(report.changed.map((item) => [item.targetId, item.change.id, item.elementIds])).toEqual([
      ['mc-b', DEFAULT_BLOCK_CHANGE, ['fx:land']],
      ['mc-b', OLD_BLOCK_CHANGE, ['fx:pillar']],
      ['mc-c', MOB_GENERATION_CHANGE, ['fx:land']],
      ['mc-c', ORE_CHANGE, ['fx:veins']],
    ]);
    // Found by the details and by the matcher: one place each, not two.
    expect(report.changed[0]?.places).toEqual([{ elementId: 'fx:land', path: '/default_block' }]);
    const ids = report.changed.map((item) => item.change.id);
    expect(new Set(ids).size).toBe(ids.length);

    // The change that touches nothing is counted and listed nowhere else.
    expect(report.untouched).toEqual({ total: 2, byArea: { ids: 1, formats: 1 } });
    const text = JSON.stringify({ ...report, untouched: undefined });
    expect(text).not.toContain('unused_thing');
    expect(text).not.toContain('new_option');

    expect(report.done.map((item) => [item.elementId, item.kind, item.changeIds])).toEqual([
      ['fx:land', 'update', [DEFAULT_BLOCK_CHANGE, MOB_GENERATION_CHANGE]],
      ['fx:veins', 'update', [ORE_CHANGE]],
    ]);
    expect(report.todo).toEqual([
      expect.objectContaining({
        source: 'migration',
        changeId: OLD_BLOCK_CHANGE,
        targetId: 'mc-b',
        hint: 'Use another block.',
        check: 'value',
        value: 'minecraft:old_block',
      }),
    ]);
    expect(report.players.changes.map((entry) => entry.change.id)).toEqual([
      'packs:data_pack_version',
    ]);
    expect(report.added).toEqual({ total: 6, byKind: { 'ids:block': 4, 'ids:item': 2 } });
    expect(report.inGame.checks).toEqual([
      { changeId: ORE_CHANGE, check: 'Find an ore vein.' },
      {
        changeId: DEFAULT_BLOCK_CHANGE,
        check: 'Walk in the world and look at the ground.',
        elementIds: ['fx:land'],
      },
    ]);
    expect(report.inGame.standing).toEqual(['start-game', 'open-world', 'look-at-changes']);
  });

  it('puts new problems in part 3 and export gaps in part 4', () => {
    const { project, run, changeSets } = dryRun('mc-b');
    const before = [problem('schema.x', { elementId: 'fx:veins', path: '/config' })];
    const after = [
      problem('schema.x', { elementId: 'fx:veins', path: '/config', message: 'Same, other words' }),
      problem('schema.unknown-key', {
        severity: 'warning',
        elementId: 'fx:land',
        path: '/sea_level',
      }),
      problem('export.no-geckolib-target', { severity: 'warning' }),
    ];
    const report = buildUpgradeReport({
      changeSets,
      migration: run.report,
      problemsBefore: before,
      problemsAfter: after,
      factsBefore: targetA,
      factsAfter: targetB,
      project,
      moved: run.project,
    });
    expect(report.todo.map((item) => [item.source, item.problem.code, item.check])).toEqual([
      ['migration', 'target.removed-id', 'value'],
      ['validation', 'schema.unknown-key', 'problem'],
      ['export', 'export.no-geckolib-target', 'problem'],
    ]);
    expect(report.players.exports.map((p) => p.code)).toEqual(['export.no-geckolib-target']);
    const rows = Object.fromEntries(report.players.rows.map((row) => [row.fact, row]));
    expect(rows.minecraft).toEqual({ fact: 'minecraft', before: 'a', after: 'b', changed: true });
    expect(rows['data-pack-format']).toEqual({
      fact: 'data-pack-format',
      before: '1',
      after: '2.1',
      changed: true,
    });
    expect(rows.java).toEqual({ fact: 'java', before: '25', after: '25', changed: false });
    expect(rows['java-project']).toEqual({
      fact: 'java-project',
      before: false,
      after: false,
      changed: false,
    });
  });

  it('says little for a mod nothing touches', () => {
    const project = createEmptyProject('Empty', { targets: ['mc-a'] });
    const chain = migrationChain(allTargets, 'mc-a', 'mc-b');
    if (!chain.ok) throw new Error(chain.reason);
    const run = runChain(project, chain.steps);
    const report = buildUpgradeReport({
      changeSets: [changeSetB],
      migration: run.report,
      problemsBefore: [],
      problemsAfter: [],
      factsBefore: targetA,
      factsAfter: targetB,
      project,
    });
    expect(report.changed).toEqual([]);
    expect(report.done).toEqual([]);
    expect(report.todo).toEqual([]);
    expect(report.untouched.total).toBe(4);
    expect(report.inGame.standing).toEqual(['start-game', 'open-world']);
  });
});

describe('openItems', () => {
  it('closes items by their own checks', () => {
    const { project, run, changeSets } = dryRun('mc-b');
    const fresh = problem('schema.unknown-key', {
      severity: 'warning',
      elementId: 'fx:land',
      path: '/sea_level',
    });
    const report = buildUpgradeReport({
      changeSets,
      migration: {
        ...run.report,
        problems: [
          ...run.report.problems,
          problem('target.no-migration-path', { severity: 'warning' }),
        ],
      },
      problemsBefore: [],
      problemsAfter: [fresh],
      factsBefore: targetA,
      factsAfter: targetB,
      project,
      moved: run.project,
    });
    expect(report.todo.map((item) => item.check)).toEqual(['value', 'manual', 'problem']);
    expect(openItems(report, [fresh], run.project)).toHaveLength(3);

    // The user replaces the removed block and fixes the field; ticks the manual item.
    const fixed = structuredClone(run.project);
    const pillar = findElement(fixed, 'fx:pillar');
    if (pillar === undefined) throw new Error('pillar');
    pillar.data = { block: 'minecraft:new_block', name: 'Pillar' };
    const manual = report.todo[1]?.id ?? '';
    expect(openItems(report, [fresh], fixed).map((item) => item.check)).toEqual([
      'manual',
      'problem',
    ]);
    expect(openItems(report, [], fixed, new Set([manual]))).toEqual([]);
  });
});
