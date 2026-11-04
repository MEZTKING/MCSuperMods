import { createMemoryFileSystem } from '@msm/core';
import { describe, expect, it } from 'vitest';
import { createCompletionSource } from '../src/renderer/src/studios/completions';
import {
  DATA_PACK_TEMPLATES,
  projectNamespace,
  templateElementId,
  templatesFor,
} from '../src/renderer/src/studios/templates';
import { newSession } from './session-fixture';

async function openSession() {
  const fs = createMemoryFileSystem();
  const { session } = newSession(fs);
  await session.newProject();
  return session;
}

describe('data pack templates', () => {
  it('has the Phase 2 template ids', () => {
    expect(DATA_PACK_TEMPLATES.map((template) => template.id)).toEqual([
      'recipe_shaped',
      'recipe_shapeless',
      'recipe_smelting',
      'loot_table_block',
      'advancement',
      'predicate',
      'item_modifier',
      'function',
      'function_tick',
      'function_load',
      'tag_item',
      'tag_block',
    ]);
  });

  it('offers them for the registered kinds and keeps the generic fallback', async () => {
    const session = await openSession();
    const templates = templatesFor(session.registry.all().map((kind) => kind.id));
    const ids = templates.map((template) => template.id);
    for (const template of DATA_PACK_TEMPLATES) expect(ids).toContain(template.id);
    expect(ids).toContain('kind:minecraft:tag/entity_type');
    expect(ids).not.toContain('kind:minecraft:recipe');
  });

  it('points the tick and load tags at the project namespace', () => {
    const tick = DATA_PACK_TEMPLATES.find((template) => template.id === 'function_tick');
    if (tick === undefined) throw new Error('missing');
    expect(tick).toMatchObject({
      kind: 'minecraft:tag/function',
      defaultName: 'tick',
      defaultNamespace: 'minecraft',
    });
    const id = templateElementId(tick, tick.defaultNamespace ?? '', tick.defaultName ?? '');
    expect(id).toBe('minecraft:tick');
    expect(tick.data(id, undefined, { namespaces: ['demo', 'minecraft'] })).toEqual({
      values: ['demo:tick'],
    });
    expect(projectNamespace('minecraft:tick', { namespaces: ['minecraft', 'zeta'] })).toBe('zeta');
    expect(projectNamespace('minecraft:tick')).toBe('my_project');
  });

  it('produces data the current target validates without errors or unknown ids', async () => {
    const session = await openSession();
    // The functions the tick and load tags run.
    session.addElement({ id: 'demo:tick', kind: 'minecraft:function' });
    session.addElement({ id: 'demo:load', kind: 'minecraft:function' });
    const created: string[] = [];
    for (const template of DATA_PACK_TEMPLATES) {
      const namespace = template.defaultNamespace ?? 'demo';
      const name = template.defaultName ?? `sample_${template.id}`;
      const id = templateElementId(template, namespace, name);
      const kind = session.registry.get(template.kind);
      expect(kind, template.kind).toBeDefined();
      session.addElement({
        id,
        kind: template.kind,
        data: template.data(id, kind?.defaultData, {
          namespaces: session.snapshot.project?.namespaces.map((entry) => entry.name) ?? [],
        }),
      });
      created.push(id);
    }
    await session.flushValidation();
    const problems = session.snapshot.problems.filter(
      (problem) =>
        problem.elementId !== undefined &&
        (problem.severity === 'error' || problem.code === 'schema.unknown-id'),
    );
    expect(problems).toEqual([]);
    expect(created).toContain('demo:blocks/sample_loot_table_block');
  });

  it('accepts #minecraft:tick and #minecraft:load in a function tag', async () => {
    const session = await openSession();
    session.addElement({
      id: 'demo:all',
      kind: 'minecraft:tag/function',
      data: { values: ['#minecraft:tick', '#minecraft:load'] },
    });
    await session.flushValidation();
    expect(session.problemsFor('demo:all')).toEqual([]);
  });
});

describe('data pack completions', () => {
  it('suggests project functions, tags and kind ids', async () => {
    const session = await openSession();
    session.addElement({ id: 'demo:greet', kind: 'minecraft:function' });
    session.addElement({ id: 'demo:gems', kind: 'minecraft:tag/item' });
    session.addElement({ id: 'demo:ruby', kind: 'minecraft:recipe' });
    const project = session.snapshot.project;
    if (project === null) throw new Error('no project');
    const source = createCompletionSource(project, (await session.schemas()).registries(project));

    expect(source.projectIds('function', '')).toEqual(['demo:greet']);
    expect(source.projectIds('tag/item', 'ge')).toEqual(['demo:gems']);
    expect(source.projectIds('minecraft:recipe', '')).toEqual(['demo:ruby']);
    expect(source.projectIds('loot_table', '')).toEqual([]);
    expect(source.projectIds('element', 'demo:')).toEqual([
      'demo:gems',
      'demo:greet',
      'demo:pack',
      'demo:ruby',
    ]);

    expect(source.suggest('function', 'demo:')).toEqual(['demo:greet']);
    expect(source.suggest('tag/item', '#demo')).toEqual(['#demo:gems']);
    expect(source.suggest('item', '#demo:')).toEqual(['#demo:gems']);
    const vanillaTags = source.suggest('item', '#');
    expect(vanillaTags.length).toBeGreaterThan(1);
    expect(vanillaTags.every((id) => id.startsWith('#'))).toBe(true);
    expect(source.suggest('tag/function', '#minecraft:t')).toEqual(['#minecraft:tick']);
  });
});
