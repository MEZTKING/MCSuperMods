/**
 * The exported-ids rules (ADR 0102 D4, D5): which ids an export carries, merging, the file
 * format, and the rename and delete warnings with their words. The session's use of them is in
 * `session-exported-ids.test.ts`.
 */
import type { Project } from '@msm/core';
import type { JsonObject } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  deleteWarning,
  type ExportedIdsRecord,
  emptyExportedIds,
  exportedIdsOf,
  exportedIdsWarningText,
  mergeExportedIds,
  parseExportedIds,
  renameWarning,
  serialiseExportedIds,
} from '../src/renderer/src/session/exported-ids';
import { BUILT_IN_KIND_LOOKUP } from '../src/renderer/src/session/schema-context';

function project(
  elements: { id: `${string}:${string}`; kind: string; data?: JsonObject }[],
): Project {
  return {
    formatVersion: 1,
    name: 'Test',
    namespaces: [
      {
        name: 'demo',
        elements: elements.map((element) => ({
          formatVersion: 1,
          data: {},
          meta: { createdAt: '2026-01-01T00:00:00.000Z' },
          ...element,
        })),
        assets: [],
      },
    ],
    targets: ['mc-test'],
    plugins: [],
    settings: {},
  };
}

const sample = project([
  { id: 'demo:ruby_block', kind: 'msm:block' },
  { id: 'demo:tomato', kind: 'msm:block', data: { item: { id: 'demo:tomato_seeds' } } },
  { id: 'demo:acid', kind: 'msm:fluid' },
  { id: 'demo:goblin', kind: 'msm:entity' },
  { id: 'demo:glow', kind: 'msm:effect' },
  { id: 'demo:sharp', kind: 'minecraft:enchantment' },
  { id: 'demo:moon', kind: 'minecraft:dimension' },
  { id: 'demo:ruby_recipe', kind: 'minecraft:recipe' },
]);
const kinds = BUILT_IN_KIND_LOOKUP;
const last = { date: '2026-11-21T10:00:00.000Z', target: 'mc-26.3', via: 'content-jar' } as const;
const elementOf = (id: string) => {
  const element = sample.namespaces[0]?.elements.find((entry) => entry.id === id);
  if (element === undefined) throw new Error(id);
  return element;
};
const jarRecord = (): ExportedIdsRecord =>
  mergeExportedIds(null, exportedIdsOf(sample, kinds, undefined, 'jar'), last);

describe('exportedIdsOf', () => {
  it('lists the world-kept registries of a jar, generated ids included, sorted', () => {
    const ids = exportedIdsOf(sample, kinds, undefined, 'jar');
    expect(ids.block).toEqual(['demo:acid', 'demo:ruby_block', 'demo:tomato']);
    expect(ids.item).toEqual([
      'demo:acid_bucket',
      'demo:goblin_spawn_egg',
      'demo:ruby_block',
      'demo:tomato_seeds',
    ]);
    expect(ids.entity_type).toEqual(['demo:goblin']);
    expect(ids.mob_effect).toEqual(['demo:glow']);
    expect(ids.enchantment).toEqual(['demo:sharp']);
    expect(ids.dimension).toEqual(['demo:moon']);
    // Recipes are not kept in worlds.
    expect(ids.recipe).toBeUndefined();
  });

  it('keeps only data pack registries for a vanilla data pack, none for a resource pack', () => {
    expect(exportedIdsOf(sample, kinds, undefined, 'data-pack')).toEqual({
      dimension: ['demo:moon'],
      enchantment: ['demo:sharp'],
    });
    expect(exportedIdsOf(sample, kinds, undefined, 'resource-pack')).toEqual({});
  });
});

describe('the record file', () => {
  it('merges ids sorted and once, and keeps the last export', () => {
    const first = mergeExportedIds(null, { block: ['demo:b', 'demo:a'] }, last);
    const second = mergeExportedIds(
      first,
      { block: ['demo:c', 'demo:a'], item: ['demo:z'] },
      { ...last, via: 'play' },
    );
    expect(second).toEqual({
      format: 1,
      ids: { block: ['demo:a', 'demo:b', 'demo:c'], item: ['demo:z'] },
      lastExport: { ...last, via: 'play' },
    });
  });

  it('writes sorted keys with 2 spaces and reads it back', () => {
    const record = mergeExportedIds(null, { item: ['demo:x'], block: ['demo:y'] }, last);
    const text = serialiseExportedIds(record);
    expect(text).toBe(
      `${JSON.stringify(
        {
          format: 1,
          ids: { block: ['demo:y'], item: ['demo:x'] },
          lastExport: { date: last.date, target: last.target, via: last.via },
        },
        null,
        2,
      )}\n`,
    );
    expect(parseExportedIds(text)).toEqual(record);
  });

  it('reads a damaged file as empty', () => {
    expect(parseExportedIds('{ not json')).toEqual(emptyExportedIds());
    expect(parseExportedIds('{"ids": {"block": "x", "item": ["demo:a", 3]}}')).toEqual({
      format: 1,
      ids: { item: ['demo:a'] },
    });
  });
});

describe('renameWarning and deleteWarning', () => {
  it('warns for exported ids and what they become', () => {
    const warning = renameWarning(
      jarRecord(),
      sample,
      elementOf('demo:acid'),
      'demo:slime',
      kinds,
      undefined,
    );
    expect(warning?.ids).toEqual([
      { registry: 'block', id: 'demo:acid' },
      { registry: 'fluid', id: 'demo:acid' },
      { registry: 'item', id: 'demo:acid_bucket' },
    ]);
    expect(warning?.becomes).toEqual([
      { registry: 'block', id: 'demo:slime' },
      { registry: 'fluid', id: 'demo:slime' },
      { registry: 'item', id: 'demo:slime_bucket' },
    ]);
  });

  it('leaves out a block item with its own id, which the rename keeps', () => {
    const warning = renameWarning(
      jarRecord(),
      sample,
      elementOf('demo:tomato'),
      'demo:potato',
      kinds,
      undefined,
    );
    expect(warning?.ids).toEqual([{ registry: 'block', id: 'demo:tomato' }]);
  });

  it('does not warn for ids never exported', () => {
    const record = mergeExportedIds(null, { block: ['demo:other'] }, last);
    expect(
      renameWarning(record, sample, elementOf('demo:ruby_block'), 'demo:x', kinds, undefined),
    ).toBeNull();
    expect(
      renameWarning(null, sample, elementOf('demo:ruby_block'), 'demo:x', kinds, undefined),
    ).toBeNull();
    expect(
      deleteWarning(record, sample, [elementOf('demo:ruby_block')], kinds, undefined),
    ).toBeNull();
    // A recipe owns no world-kept id.
    expect(
      deleteWarning(jarRecord(), sample, [elementOf('demo:ruby_recipe')], kinds, undefined),
    ).toBeNull();
  });

  it('warns on delete with every exported id the element owns', () => {
    expect(
      deleteWarning(jarRecord(), sample, [elementOf('demo:goblin')], kinds, undefined)?.ids,
    ).toEqual([
      { registry: 'entity_type', id: 'demo:goblin' },
      { registry: 'item', id: 'demo:goblin_spawn_egg' },
    ]);
  });
});

describe('exportedIdsWarningText', () => {
  const warning = {
    ids: [
      { registry: 'block', id: 'demo:acid' },
      { registry: 'item', id: 'demo:acid_bucket' },
    ],
    becomes: [
      { registry: 'block', id: 'demo:slime' },
      { registry: 'item', id: 'demo:slime_bucket' },
    ],
  };

  it('names the ids that change and what they become', () => {
    const text = exportedIdsWarningText('rename', warning, false, 'Acid');
    expect(text).toContain('demo:acid (block), demo:acid_bucket (item)');
    expect(text).toContain('demo:slime (block), demo:slime_bucket (item)');
    expect(text).toContain('lose the placed blocks, items or mobs');
    expect(text).toContain('Keep the old id, or rename only before anyone has worlds with it.');
    expect(exportedIdsWarningText('delete', warning, false, 'Acid')).toContain(
      'Keep the element, or delete it only before anyone has worlds with it.',
    );
  });

  it('uses plain words without ids in Very easy', () => {
    for (const action of ['rename', 'delete'] as const) {
      const text = exportedIdsWarningText(action, warning, true, 'Acid');
      expect(text).toContain('Acid');
      expect(text).not.toMatch(/[a-z0-9_]+:[a-z0-9_/]+/);
      expect(text).not.toContain(' id');
    }
    expect(exportedIdsWarningText('delete', warning, true, 'Acid')).toContain(
      'You have already played with Acid or shared it. Deleting it here',
    );
  });
});
