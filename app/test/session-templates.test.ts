import { createMemoryFileSystem } from '@msm/core';
import { describe, expect, it } from 'vitest';
import { createCompletionSource } from '../src/renderer/src/studios/completions';
import {
  DATA_PACK_TEMPLATES,
  projectNamespace,
  templateContext,
  templateElementId,
  templatesFor,
} from '../src/renderer/src/studios/templates';
import { newLibrarySession, newSession } from './session-fixture';

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
      'tag_function',
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
    expect(tick.data(templateContext(id, ['demo', 'minecraft'], undefined))).toEqual({
      values: ['demo:tick'],
    });
    expect(projectNamespace('minecraft:tick', ['minecraft', 'zeta'])).toBe('zeta');
    expect(projectNamespace('minecraft:tick')).toBe('my_project');
    expect(projectNamespace('demo:tick')).toBe('demo');
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
        data: template.data(
          templateContext(
            id,
            session.snapshot.project?.namespaces.map((entry) => entry.name) ?? [],
            kind?.defaultData,
          ),
        ),
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

describe('plugin templates (ADR 0020)', () => {
  it('lists plugin templates first and keeps app built-ins only for uncovered kinds', () => {
    const plugin = {
      id: 'plugin_recipe',
      kind: 'minecraft:recipe',
      title: 'Plugin recipe',
      description: 'From a plugin.',
      category: 'Recipes',
      data: () => ({}),
    };
    const ids = templatesFor(
      ['minecraft:recipe', 'minecraft:function', 'example:thing'],
      [plugin, { ...plugin, title: 'Duplicate id' }, { ...plugin, id: 'x', kind: 'example:gone' }],
    ).map((template) => template.id);
    expect(ids).toEqual(['plugin_recipe', 'function', 'kind:example:thing']);
    expect(templatesFor(['example:thing'])[0]?.category).toBe('Other');
  });

  it('takes the session library templates and builds the context the host passes', async () => {
    const { session } = newLibrarySession(createMemoryFileSystem());
    await session.newProject();
    const templates = templatesFor(
      session.registry.all().map((kind) => kind.id),
      session.library.templates,
    );
    const ids = templates.map((template) => template.id);
    expect(ids[0]).toBe('note');
    expect(ids).not.toContain('foreign_recipe');
    expect(ids).toContain('recipe_shaped');
    expect(ids).not.toContain('kind:test:note');
    const note = templates[0];
    if (note === undefined) throw new Error('missing');
    expect(note.data(templateContext('minecraft:x', ['minecraft', 'demo'], undefined))).toEqual({
      text: 'Hello from demo',
    });

    const kindDefault = { values: ['a'] };
    const context = templateContext('demo:block/ore', ['demo'], kindDefault);
    expect(context).toEqual({
      id: 'demo:block/ore',
      namespace: 'demo',
      path: 'block/ore',
      projectNamespace: 'demo',
      namespaces: ['demo'],
      kindDefault: { values: ['a'] },
    });
    expect(context.kindDefault).not.toBe(kindDefault);
  });
});
