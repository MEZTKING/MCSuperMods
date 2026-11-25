/**
 * Merging the curated half over the generated one, the plan read from it, the curated file's
 * checks, the shape comparison and the inverse plan.
 */
import { describe, expect, it } from 'vitest';
import {
  type CuratedChangeSet,
  canonicalJson,
  compareShapes,
  createMigration,
  curatedErrors,
  dataHash,
  expandPattern,
  idTablesFromChangeSet,
  inversePlan,
  mergeChangeSet,
  parsePointer,
  planFromChangeSet,
  pointer,
} from '../src/index';
import { curated, element, FROM, generated, project, TO, targetWithId, VERSION } from './fixtures';

const merged = mergeChangeSet(generated, curated);

describe('mergeChangeSet', () => {
  it('lays the curated entries over the generated ones, sorted by id', () => {
    const ids = merged.changes.map((c) => c.id);
    expect(ids).toEqual([...ids].sort());
    expect(ids).toContain('players:loader');
    expect(merged.changes.find((c) => c.id === 'players:loader')).toMatchObject({
      source: 'curated',
      handling: 'none',
      sentence: 'Players need the newer loader.',
    });
    expect(
      merged.changes.find((c) => c.id === 'formats:minecraft:resource/gizmo#/colour'),
    ).toMatchObject({
      handling: 'auto',
      source: 'mcdoc',
      inGameCheck: 'Look at each gizmo.',
    });
    expect(merged.additions).toEqual(generated.additions);
    expect(merged.refs).toEqual(generated.refs);
  });

  it('turns a confirmed rename into member-renamed, auto only for the same shape', () => {
    const cog = merged.changes.find((c) => c.id === 'ids:gadget_type/old_cog');
    expect(cog).toMatchObject({ what: 'member-renamed', to: 'new_cog', handling: 'auto' });
    expect(cog?.candidate).toEqual(generated.changes.find((c) => c.id === cog?.id)?.candidate);
    const spring = merged.changes.find((c) => c.id === 'ids:gadget_type/spring');
    expect(spring).toMatchObject({ what: 'member-renamed', to: 'coil', handling: 'manual' });
  });

  it('leaves the generated set as it was', () => {
    expect(generated.changes.find((c) => c.id === 'ids:gadget_type/old_cog')?.what).toBe(
      'member-removed',
    );
  });

  it('refuses an entry that answers nothing', () => {
    expect(() =>
      mergeChangeSet(generated, { from: FROM, to: TO, changes: [{ id: 'ids:nothing/here' }] }),
    ).toThrow(/answers no generated change/);
  });
});

describe('idTablesFromChangeSet and planFromChangeSet', () => {
  it('reads the removed ids, the moved registry, the ids kept elsewhere and the renames', () => {
    expect(idTablesFromChangeSet(merged)).toEqual({
      removed: {
        gadget_type: ['old_cog', 'spring'],
        sound_event: ['old_beep'],
        'tag/gadget': ['shiny'],
      },
      moved: { widget_test: 'widget_test_type' },
      stillRegistered: { gadget_type: { spring: ['gadget'] } },
      renames: [
        { registry: 'gadget_type', from: 'old_cog', to: 'new_cog', sameShape: true },
        {
          registry: 'gadget_type',
          from: 'spring',
          to: 'coil',
          sameShape: false,
          hint: 'use minecraft:coil and give it a length',
        },
      ],
    });
  });

  it('puts the curated steps first, then one id step per removed member', () => {
    const plan = planFromChangeSet(merged, curated, VERSION);
    expect(plan.from).toBe(FROM);
    expect(plan.to).toBe(TO);
    expect(plan.steps.map((s) => `${s.op} ${s.changeId}`)).toEqual([
      'drop formats:minecraft:resource/gizmo#/colour',
      'move formats:minecraft:resource/gizmo#/speed',
      'set formats:minecraft:resource/gizmo#/size',
      'block-state block-states:lamp#glow',
      'rename-id ids:gadget_type/old_cog',
      'rename-id ids:gadget_type/spring',
      'rename-id ids:sound_event/old_beep',
      'rename-id ids:tag/gadget/shiny',
    ]);
    expect(plan.steps[4]).toMatchObject({ apply: true, to: 'new_cog' });
    expect(plan.steps[5]).toMatchObject({ apply: false, to: 'coil', typeOnly: true });
  });
});

describe('curatedErrors', () => {
  it('finds nothing wrong with the fixture', () => {
    expect(curatedErrors(generated, curated)).toEqual([]);
  });

  it('finds a wrong end, an unknown id, a twice-curated id and steps that answer nothing', () => {
    const wrong: CuratedChangeSet = {
      from: FROM,
      to: 'mc-100.0',
      changes: [
        { id: 'ids:nothing/here' },
        { id: 'ids:sound_event/old_beep', handling: 'auto' },
        { id: 'ids:sound_event/old_beep' },
        { id: 'ids:gadget_type/old_cog', rename: { to: 'old_cog', shape: 'same' } },
        { id: 'ids:tag/gadget/shiny', rename: { to: 'glossy', shape: 'none' }, handling: 'auto' },
        {
          id: 'formats:minecraft:resource/gizmo#/size',
          steps: [{ op: 'drop', places: [], field: 'size' }],
        },
        {
          id: 'formats:minecraft:resource/gizmo#/colour',
          steps: [{ op: 'drop', places: [], field: 'color' }],
        },
        {
          id: 'block-states:lamp#glow',
          change: { area: 'block-states', what: 'property-removed', subject: 'lamp' },
        },
      ],
    };
    expect(curatedErrors(generated, wrong)).toEqual([
      'The curated set runs mc-98.0 to mc-100.0; the generated set mc-98.0 to mc-99.0.',
      'ids:nothing/here answers no generated change and has no change of its own.',
      'ids:sound_event/old_beep is handled auto, but no step does it.',
      'ids:sound_event/old_beep is curated twice.',
      'ids:gadget_type/old_cog: renamed to itself.',
      'ids:gadget_type/old_cog: a rename with a shape names the dispatcher that proves it.',
      'ids:tag/gadget/shiny is handled auto, but no step does it.',
      "ids:tag/gadget/shiny: a rename's handling follows its shape; do not set it.",
      'formats:minecraft:resource/gizmo#/size: a drop step cannot answer a field-addedRequired change.',
      'formats:minecraft:resource/gizmo#/colour: drops color, but the change removes /colour.',
      'block-states:lamp#glow is a generated change; curate it, do not write it again.',
    ]);
  });
});

describe('compareShapes', () => {
  it('says same, superset, subset or differs', () => {
    expect(compareShapes(['a', 'b?'], ['b?', 'a'])).toBe('same');
    expect(compareShapes(['a'], ['a', 'base'])).toBe('superset');
    expect(compareShapes(['a', 'b'], ['a'])).toBe('subset');
    expect(compareShapes(['a', 'b'], ['a', 'b?'])).toBe('differs');
  });
});

describe('inversePlan', () => {
  it('moves back exactly what has an exact inverse, and names the rest', () => {
    const plan = planFromChangeSet(merged, curated, VERSION);
    const { plan: back, inexact } = inversePlan(plan, '98.0');
    expect(back.from).toBe(TO);
    expect(back.to).toBe(FROM);
    expect(back.version).toBe('98.0');
    expect(inexact).toEqual(['formats:minecraft:resource/gizmo#/colour']);
    const original = project([
      element('test:g', 'test:gizmo', { speed: 3, motion: {} }),
      element('test:s', 'test:any', {
        state: { Name: 'minecraft:lamp', Properties: { glow: 'yes' } },
        id: 'minecraft:old_cog',
      }),
    ]);
    const forward = createMigration(plan)(targetWithId(FROM), original);
    const moved = structuredClone(original);
    moved.targets = [TO];
    for (const change of forward.changes) {
      const found = moved.namespaces[0]?.elements.find((e) => e.id === change.elementId);
      if (found !== undefined && change.data !== undefined) found.data = change.data;
    }
    const backward = createMigration(back)(targetWithId(TO), moved);
    const restored = structuredClone(moved);
    for (const change of backward.changes) {
      const found = restored.namespaces[0]?.elements.find((e) => e.id === change.elementId);
      if (found !== undefined && change.data !== undefined) found.data = change.data;
    }
    expect(restored.namespaces).toEqual(original.namespaces);
    expect(backward.problems).toEqual([]);
  });

  it('keeps a value the user changed after a set', () => {
    const plan = planFromChangeSet(merged, curated, VERSION);
    const { plan: back } = inversePlan(plan, '98.0');
    const p = project([element('test:g', 'test:gizmo', { size: 5 })], [TO]);
    expect(createMigration(back)(targetWithId(TO), p)).toEqual({ changes: [], problems: [] });
  });
});

describe('pointers and hashes', () => {
  it('escapes and reads pointers, and expands *', () => {
    expect(pointer(['a/b', 'c~d', 0])).toBe('/a~1b/c~0d/0');
    expect(parsePointer('/a~1b/c~0d/0')).toEqual(['a/b', 'c~d', '0']);
    expect(expandPattern({ x: [{ y: 1 }, { y: 2 }], z: 1 }, '/x/*/y')).toEqual([
      ['x', 0, 'y'],
      ['x', 1, 'y'],
    ]);
    expect(expandPattern({ x: 'id' }, '/x/*')).toEqual([]);
  });

  it('hashes data the same whatever the key order', () => {
    expect(canonicalJson({ b: [1, { d: 2, c: 3 }], a: 'x' })).toBe(
      '{"a":"x","b":[1,{"c":3,"d":2}]}',
    );
    expect(dataHash({ a: 1, b: 2 })).toBe(dataHash({ b: 2, a: 1 }));
    expect(dataHash({ a: 1 })).not.toBe(dataHash({ a: 2 }));
    expect(dataHash({ a: 1 })).toMatch(/^[0-9a-f]{14}$/);
  });
});
