/**
 * The engine over an invented version step (`test/fixtures.ts`): every step type, one update per
 * element with its details, reverses for dropped values, in-game checks, the text search and the
 * plain-text kinds.
 */
import type { MigrationReport } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  createMigration,
  dataHash,
  MigrationProblemCodes,
  mergeChangeSet,
  planFromChangeSet,
} from '../src/index';
import { curated, element, FROM, generated, project, TO, targetWithId, VERSION } from './fixtures';

const merged = mergeChangeSet(generated, curated);
const plan = planFromChangeSet(merged, curated, VERSION);
const migrate = createMigration(plan);
const previous = targetWithId(FROM);

function run(...elements: Parameters<typeof element>[]): MigrationReport {
  const p = project(elements.map((args) => element(...args)));
  const before = structuredClone(p);
  const report = migrate(previous, p);
  expect(p, 'the project is never changed').toEqual(before);
  return report;
}

describe('createMigration', () => {
  it('needs nothing on the newer target and warns from an unknown one', () => {
    const p = project([element('test:a', 'test:gizmo', { colour: 'red' })], [TO]);
    expect(migrate(targetWithId(TO), p)).toEqual({ changes: [], problems: [] });
    const report = migrate(targetWithId('mc-1.0'), p);
    expect(report.changes).toEqual([]);
    expect(report.problems).toMatchObject([
      { severity: 'warning', code: MigrationProblemCodes.noMigrationPath },
    ]);
    expect(report.problems[0]?.message).toContain('mc-1.0');
  });

  it('gives an untouched project an empty report, with no optional parts', () => {
    expect(run(['test:a', 'test:other', { colour: 'red', id: 'minecraft:fine' }])).toEqual({
      changes: [],
      problems: [],
    });
  });

  it('drops, moves and sets fields as one update with a detail each, and keeps the dropped value', () => {
    const report = run(['test:g', 'test:gizmo', { colour: { r: 1 }, speed: 3, motion: {} }]);
    expect(report.problems).toEqual([]);
    expect(report.changes).toHaveLength(1);
    const change = report.changes[0];
    expect(change?.data).toEqual({ motion: { speed: 3 }, size: 1 });
    expect(change?.details).toEqual([
      {
        op: 'drop',
        path: '/colour',
        before: { r: 1 },
        changeId: 'formats:minecraft:resource/gizmo#/colour',
        sentence: 'Gizmos have no colour any more.',
      },
      {
        op: 'move',
        path: '/motion/speed',
        from: '/speed',
        before: 3,
        after: 3,
        changeId: 'formats:minecraft:resource/gizmo#/speed',
      },
      { op: 'set', path: '/size', after: 1, changeId: 'formats:minecraft:resource/gizmo#/size' },
    ]);
    expect(change?.description).toBe(
      `Removed /colour, which gizmos no longer have; Moved /speed to /motion/speed; Set /size to 1 for Minecraft ${VERSION}.`,
    );
    expect(report.reverses).toEqual([
      {
        elementId: 'test:g',
        path: '/colour',
        value: { r: 1 },
        afterHash: dataHash({ motion: { speed: 3 }, size: 1 }),
      },
    ]);
    expect(report.inGameChecks).toEqual([
      {
        changeId: 'formats:minecraft:resource/gizmo#/colour',
        check: 'Look at each gizmo.',
        elementIds: ['test:g'],
      },
    ]);
  });

  it('reaches places through * and skips a place that holds an id', () => {
    const report = run([
      'test:m',
      'test:machine',
      { parts: { a: { gizmo: { colour: 'red' } }, b: { gizmo: 'test:shared' }, c: { gizmo: {} } } },
    ]);
    expect(report.changes[0]?.data).toEqual({
      parts: { a: { gizmo: {} }, b: { gizmo: 'test:shared' }, c: { gizmo: {} } },
    });
    expect(report.changes[0]?.details?.map((d) => d.path)).toEqual(['/parts/a/gizmo/colour']);
  });

  it('does not move onto a value that is there, and says so', () => {
    const report = run(['test:g', 'test:gizmo', { speed: 3, motion: { speed: 4 }, size: 2 }]);
    expect(report.changes).toEqual([]);
    expect(report.problems).toMatchObject([
      {
        severity: 'warning',
        code: MigrationProblemCodes.fieldNotMoved,
        elementId: 'test:g',
        path: '/speed',
      },
    ]);
  });

  it('renames a block state property and its values, in objects and in strings', () => {
    const report = run([
      'test:s',
      'test:any',
      {
        state: { Name: 'minecraft:lamp', Properties: { glow: 'yes', facing: 'up' } },
        other: { Name: 'minecraft:torch', Properties: { glow: 'yes' } },
        text: 'lamp[facing=up,glow=no]',
      },
    ]);
    expect(report.changes[0]?.data).toEqual({
      state: { Name: 'minecraft:lamp', Properties: { lit: 'true', facing: 'up' } },
      other: { Name: 'minecraft:torch', Properties: { glow: 'yes' } },
      text: 'lamp[facing=up,lit=false]',
    });
    expect(report.changes[0]?.details?.map((d) => [d.op, d.path])).toEqual([
      ['move', '/state/Properties/lit'],
      ['set', '/state/Properties/lit'],
      ['set', '/text'],
    ]);
  });

  it('applies only the confirmed same-shape rename and reports every other removed id', () => {
    const report = run([
      'test:ids',
      'test:any',
      {
        a: 'minecraft:old_cog',
        b: ['old_cog', '#minecraft:shiny', 'minecraft:old_beep'],
        type: 'minecraft:spring',
        feature: 'minecraft:spring',
        moved: 'minecraft:anything_in_widget_test',
        other: 'mymod:old_cog',
      },
    ]);
    expect(report.changes).toHaveLength(1);
    expect(report.changes[0]?.data).toMatchObject({
      a: 'minecraft:new_cog',
      b: ['minecraft:new_cog', '#minecraft:shiny', 'minecraft:old_beep'],
      type: 'minecraft:spring',
      feature: 'minecraft:spring',
    });
    expect(report.changes[0]?.details).toEqual([
      {
        op: 'rename-id',
        path: '/a',
        before: 'minecraft:old_cog',
        after: 'minecraft:new_cog',
        changeId: 'ids:gadget_type/old_cog',
        sentence: 'The old cog is now the new cog.',
      },
      {
        op: 'rename-id',
        path: '/b/0',
        before: 'old_cog',
        after: 'minecraft:new_cog',
        changeId: 'ids:gadget_type/old_cog',
        sentence: 'The old cog is now the new cog.',
      },
    ]);
    expect(report.changes[0]?.description).toBe(
      `Renamed minecraft:old_cog → minecraft:new_cog, minecraft:old_cog → minecraft:new_cog for Minecraft ${VERSION}.`,
    );
    expect(report.problems.map((p) => [p.severity, p.code, p.path])).toEqual([
      ['error', MigrationProblemCodes.removedId, '/b/1'],
      ['error', MigrationProblemCodes.removedId, '/b/2'],
      ['error', MigrationProblemCodes.removedId, '/type'],
    ]);
    expect(report.problems[0]?.message).toBe(
      `#minecraft:shiny was removed from the registry tag/gadget in Minecraft ${VERSION}.`,
    );
    expect(report.problems[2]?.message).toBe(
      `minecraft:spring was removed from the registry gadget_type in Minecraft ${VERSION}; use minecraft:coil and give it a length.`,
    );
    expect(report.inGameChecks).toEqual([
      { changeId: 'ids:gadget_type/old_cog', check: 'Turn each cog.', elementIds: ['test:ids'] },
    ]);
  });

  it('reports ids inside function lines, scripts and other text as warnings, never rewriting them', () => {
    const lines = [
      'playsound minecraft:old_beep master @a',
      'execute if entity @s[type=#minecraft:shiny] run say minecraft:old_cog.',
      'place feature minecraft:spring',
    ];
    const report = run(
      ['test:fn', 'minecraft:function', { lines }],
      ['test:script', 'msm:script', { source: 'world.play("minecraft:old_beep");\nlet x = 1;' }],
    );
    expect(report.changes).toEqual([]);
    expect(report.problems.map((p) => [p.elementId, p.severity, p.code, p.path])).toEqual([
      ['test:fn', 'warning', MigrationProblemCodes.removedIdInText, '/lines/0'],
      ['test:fn', 'warning', MigrationProblemCodes.removedIdInText, '/lines/1'],
      ['test:fn', 'warning', MigrationProblemCodes.removedIdInText, '/lines/1'],
      ['test:script', 'warning', MigrationProblemCodes.removedIdInText, '/source'],
    ]);
    expect(report.problems[2]?.message).toContain('minecraft:old_cog');
    expect(report.problems[3]?.message).toContain('(line 1, column 13)');
    expect(report.problems[3]?.message).toContain('does not change text');
  });

  it('skips plain-text kinds, and a plan can name its own', () => {
    expect(run(['test:en_us', 'minecraft:lang', { 'item.x': 'minecraft:old_beep' }])).toEqual({
      changes: [],
      problems: [],
    });
    const custom = createMigration({ ...plan, plainTextKinds: ['test:notes'] });
    const p = project([
      element('test:n', 'test:notes', { text: 'minecraft:old_beep' }),
      element('test:en_us', 'minecraft:lang', { 'item.x': 'minecraft:old_beep' }),
    ]);
    expect(custom(previous, p).problems.map((x) => x.elementId)).toEqual(['test:en_us']);
  });

  it('reports a removed id at its place after the field steps, and none inside a dropped value', () => {
    const report = run([
      'test:g',
      'test:gizmo',
      { colour: 'minecraft:old_beep', speed: 'minecraft:old_beep', motion: {}, size: 1 },
    ]);
    expect(report.problems.map((p) => p.path)).toEqual(['/motion/speed']);
  });
});
