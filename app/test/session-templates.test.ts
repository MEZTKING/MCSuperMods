import { createMemoryFileSystem, requireSyncResult } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { dataPackTemplates } from '@msm/plugin-datapack';
import { describe, expect, it } from 'vitest';
import { createCompletionSource } from '../src/renderer/src/studios/completions';
import {
  projectNamespace,
  templateContext,
  templateElementId,
  templatesFor,
} from '../src/renderer/src/studios/templates';
import { newLibrarySession, newSession } from './session-fixture';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

async function openSession() {
  const fs = createMemoryFileSystem();
  const { session } = newSession(fs);
  await session.newProject();
  return session;
}

describe('data pack templates (from the data pack plugin)', () => {
  it('keeps the Phase 2 template ids', () => {
    expect(dataPackTemplates.map((template) => template.id)).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });

  it('offers them for the registered kinds and keeps the generic fallback', async () => {
    const session = await openSession();
    const kinds = session.registry.all().map((kind) => kind.id);
    const templates = templatesFor(kinds, dataPackTemplates);
    const ids = templates.map((template) => template.id);
    for (const template of dataPackTemplates) expect(ids).toContain(template.id);
    expect(ids).not.toContain('kind:minecraft:recipe');
    // Without plugin templates every kind falls back to its generic entry.
    expect(templatesFor(kinds).map((template) => template.id)).toEqual(
      kinds.map((kind) => `kind:${kind}`),
    );
  });

  it('points the tick and load tags at the project namespace', () => {
    const tick = dataPackTemplates.find((template) => template.id === 'function_tick');
    if (tick === undefined) throw new Error('missing');
    expect(tick).toMatchObject({
      kind: 'minecraft:tag/function',
      defaultName: 'tick',
      defaultNamespace: 'minecraft',
    });
    const id = templateElementId(tick, tick.defaultNamespace ?? '', tick.defaultName ?? '');
    expect(id).toBe('minecraft:tick');
    expect(tick.data(templateContext(id, ['demo', 'minecraft'], undefined, target))).toEqual({
      values: ['demo:tick'],
    });
    expect(projectNamespace('minecraft:tick', ['minecraft', 'zeta'])).toBe('zeta');
    expect(projectNamespace('minecraft:tick')).toBe('my_project');
    expect(projectNamespace('demo:tick')).toBe('demo');
  });

  it('produces data the current target validates without errors or unknown ids', async () => {
    const session = await openSession();
    // The load and tick function templates create the functions the tick and load tags run;
    // a template whose default name is already taken gets a sample name.
    const created: string[] = [];
    for (const template of dataPackTemplates) {
      const namespace = template.defaultNamespace ?? 'demo';
      const name = template.defaultName ?? `sample_${template.id}`;
      let id = templateElementId(template, namespace, name);
      if (created.includes(id))
        id = templateElementId(template, namespace, `sample_${template.id}`);
      const kind = session.registry.get(template.kind);
      expect(kind, template.kind).toBeDefined();
      session.addElement({
        id,
        kind: template.kind,
        data: requireSyncResult(
          template.data(
            templateContext(
              id,
              session.snapshot.project?.namespaces.map((entry) => entry.name) ?? [],
              kind?.defaultData,
              session.target,
            ),
          ),
          template.id,
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
  it('lists plugin templates first and a generic entry for uncovered kinds', () => {
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
    expect(ids).toEqual(['plugin_recipe', 'kind:minecraft:function', 'kind:example:thing']);
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
    expect(ids).toContain('note');
    expect(ids).not.toContain('foreign_recipe');
    expect(ids).toContain('recipe_shaped');
    expect(ids).toContain('block_model');
    expect(ids).not.toContain('kind:test:note');
    expect(new Set(ids).size).toBe(ids.length);
    for (const template of templates) expect(template.category, template.id).not.toBe('');
    // An unknown (third-party) kind still gets the generic fallback.
    const withUnknown = templatesFor(
      [...session.registry.all().map((kind) => kind.id), 'example:thing'],
      session.library.templates,
    );
    expect(withUnknown.at(-1)).toMatchObject({ id: 'kind:example:thing', category: 'Other' });
    const note = templates.find((template) => template.id === 'note');
    if (note === undefined) throw new Error('missing');
    expect(
      note.data(templateContext('minecraft:x', ['minecraft', 'demo'], undefined, session.target)),
    ).toEqual({
      text: 'Hello from demo',
    });

    const kindDefault = { values: ['a'] };
    const context = templateContext('demo:block/ore', ['demo'], kindDefault, target);
    expect(context).toEqual({
      id: 'demo:block/ore',
      namespace: 'demo',
      path: 'block/ore',
      projectNamespace: 'demo',
      namespaces: ['demo'],
      kindDefault: { values: ['a'] },
      target,
    });
    expect(context.kindDefault).not.toBe(kindDefault);
  });
});
