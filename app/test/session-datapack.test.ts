import { createMemoryFileSystem, type Json, type Problem } from '@msm/core';
import { unzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import type { McfunctionChecker } from '../src/renderer/src/session/mcfunction-problems';
import {
  functionIdOfOutput,
  mcfunctionProjectIds,
  projectObjectives,
} from '../src/renderer/src/session/mcfunction-problems';
import { SessionProblemCodes } from '../src/renderer/src/session/project-session';
import { dataRegistryIds, projectRegistryIds } from '../src/renderer/src/session/schema-context';
import { defaultTarget, newSession, nodeMcfunctionChecker } from './session-fixture';

let checker: McfunctionChecker;

beforeAll(async () => {
  checker = await nodeMcfunctionChecker();
});

async function dataProject(options: { checker?: McfunctionChecker | null } = {}) {
  const fs = createMemoryFileSystem();
  const mcfunction = options.checker === null ? undefined : (options.checker ?? checker);
  const { session, calls } = newSession(fs, {}, mcfunction === undefined ? {} : { mcfunction });
  await session.newProject();
  return { fs, session, calls };
}

const errors = (problems: readonly Problem[]) =>
  problems.filter((problem) => problem.severity === 'error');

const decoder = new TextDecoder();

describe('ProjectSession: data pack kinds', () => {
  it('registers the data pack plugin', async () => {
    const { session } = await dataProject();
    expect(session.registry.get('minecraft:function')).toBeDefined();
    expect(session.registry.get('minecraft:tag/item')).toBeDefined();
    expect(session.snapshot.project?.plugins).toContain('msm.datapack');
  });

  it('adds an element in a missing namespace in one undo step', async () => {
    const { session } = await dataProject();
    session.addElement({
      id: 'minecraft:tick',
      kind: 'minecraft:tag/function',
      data: { values: ['demo:tick'] },
    });
    expect(session.snapshot.project?.namespaces.map((namespace) => namespace.name)).toEqual([
      'demo',
      'minecraft',
    ]);
    expect(session.snapshot.undoLabel).toBe('Add minecraft:tick');
    session.undo();
    expect(session.snapshot.project?.namespaces.map((namespace) => namespace.name)).toEqual([
      'demo',
    ]);
  });

  it('collects data pack registry ids and seeds the vanilla function tags', async () => {
    const { session } = await dataProject();
    session.addElement({ id: 'demo:greet', kind: 'minecraft:function' });
    session.addElement({ id: 'demo:ruby', kind: 'minecraft:recipe' });
    session.addElement({ id: 'demo:gems', kind: 'minecraft:tag/item' });
    const project = session.snapshot.project;
    if (project === null) throw new Error('no project');
    expect(dataRegistryIds(project)).toEqual({
      function: ['demo:greet'],
      recipe: ['demo:ruby'],
      'tag/item': ['demo:gems'],
    });
    expect(mcfunctionProjectIds(project)['tag/function']).toEqual([
      'minecraft:load',
      'minecraft:tick',
    ]);
    const registries = (await session.schemas()).registries(project);
    expect(registries.has('function', '#minecraft:tick')).toBe(true);
    expect(registries.has('function', '#minecraft:load')).toBe(true);
    expect(registries.has('function', 'demo:greet')).toBe(true);
    expect(registries.has('item', '#demo:gems')).toBe(true);
  });
});

describe('ProjectSession: sound event ids', () => {
  it('declares every event key of a sounds element as a sound_event id', async () => {
    const { session } = await dataProject();
    session.addElement({
      id: 'demo:sounds',
      kind: 'minecraft:sounds',
      data: {
        'music_disc.my_song': { sounds: [{ name: 'minecraft:records/cat', stream: true }] },
        'block.ping': { sounds: ['minecraft:random/orb'] },
      },
    });
    session.addElement({
      id: 'demo:my_song',
      kind: 'minecraft:jukebox_song',
      data: {
        sound_event: 'demo:music_disc.my_song',
        description: 'My Song',
        length_in_seconds: 10,
        comparator_output: 1,
      },
    });
    await session.flushValidation();
    const project = session.snapshot.project;
    if (project === null) throw new Error('no project');
    expect(projectRegistryIds(project).sound_event).toEqual([
      'demo:block.ping',
      'demo:music_disc.my_song',
    ]);
    const registries = (await session.schemas()).registries(project);
    expect(registries.has('sound_event', 'demo:music_disc.my_song')).toBe(true);
    expect(session.problemsFor('demo:my_song')).toEqual([]);
  });
});

describe('ProjectSession: live mcfunction problems', () => {
  it('reports a parse error at /lines/1 and clears it when fixed', async () => {
    const { session } = await dataProject();
    session.addElement({
      id: 'demo:greet',
      kind: 'minecraft:function',
      data: { lines: ['say hello', 'tp @s 1 2'] },
    });
    await session.flushValidation();
    // Spyglass reports a missing float as two parse errors at the same spot.
    const found = errors(session.problemsFor('demo:greet'));
    expect(found.length).toBeGreaterThan(0);
    for (const problem of found) {
      expect(problem).toMatchObject({
        severity: 'error',
        code: 'mcfunction.parse',
        elementId: 'demo:greet',
        path: '/lines/1',
        range: { start: 9, end: 9 },
      });
    }
    expect(session.problemsFor('demo:greet')).toEqual(found);

    session.setElementValue('demo:greet', '/lines/1', 'say fixed');
    await session.flushValidation();
    expect(session.problemsFor('demo:greet')).toEqual([]);
  });

  it('declares project functions and warns about unknown ones', async () => {
    const { session } = await dataProject();
    session.addElement({ id: 'demo:other', kind: 'minecraft:function' });
    session.addElement({
      id: 'demo:greet',
      kind: 'minecraft:function',
      data: { lines: ['function demo:other', 'function demo:missing'] },
    });
    await session.flushValidation();
    const problems = session.problemsFor('demo:greet');
    expect(errors(problems)).toEqual([]);
    expect(problems.map((problem) => problem.path)).toEqual(['/lines/1']);
    expect(problems[0]?.severity).toBe('warning');
  });

  it('reports a failing checker as a warning on the function', async () => {
    const failing: McfunctionChecker = {
      check: async () => {
        throw new Error('service down');
      },
    };
    const { session } = await dataProject({ checker: failing });
    session.addElement({ id: 'demo:greet', kind: 'minecraft:function' });
    await session.flushValidation();
    expect(session.problemsFor('demo:greet')).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: SessionProblemCodes.mcfunctionUnavailable,
        message: expect.stringContaining('service down'),
      }),
    ]);
  });

  it('passes the function uri and the project ids to the checker', async () => {
    const seen: { source: string; uri: string; projectIds: Record<string, string[]> }[] = [];
    const recording: McfunctionChecker = {
      check: async (source, options) => {
        seen.push({ source, ...options });
        return [];
      },
    };
    const { session } = await dataProject({ checker: recording });
    session.addElement({
      id: 'demo:sub/greet',
      kind: 'minecraft:function',
      data: { lines: ['say a', 'say b'] },
    });
    await session.flushValidation();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      source: 'say a\nsay b',
      uri: `file:///msm/data/demo/${defaultTarget.folders.data.function}/sub/greet.mcfunction`,
    });
    expect(seen[0]?.projectIds.function).toEqual(['demo:sub/greet']);
  });

  it('declares scoreboard objectives created in any project function', async () => {
    const { session } = await dataProject();
    session.addElement({
      id: 'demo:load',
      kind: 'minecraft:function',
      data: {
        lines: [
          '# scoreboard objectives add ignored dummy',
          'scoreboard objectives add jumps minecraft.custom:minecraft.jump',
        ],
      },
    });
    session.addElement({
      id: 'demo:tick',
      kind: 'minecraft:function',
      data: { lines: ['execute as @a[scores={jumps=1..}] run scoreboard players reset @s jumps'] },
    });
    await session.flushValidation();
    const project = session.snapshot.project;
    if (project === null) throw new Error('no project');
    expect(projectObjectives(project)).toEqual(['jumps']);
    expect(mcfunctionProjectIds(project).objective).toEqual(['jumps']);
    expect(session.problemsFor('demo:tick')).toEqual([]);
    expect(session.problemsFor('demo:load')).toEqual([]);
    // The export gate declares them too.
    const result = await session.exportPack('data', 'zip');
    expect(result.problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('warns about an objective no project function creates', async () => {
    const { session } = await dataProject();
    session.addElement({
      id: 'demo:tick',
      kind: 'minecraft:function',
      data: { lines: ['scoreboard players reset @s nowhere'] },
    });
    await session.flushValidation();
    const project = session.snapshot.project;
    if (project === null) throw new Error('no project');
    expect(mcfunctionProjectIds(project).objective).toBeUndefined();
    expect(session.problemsFor('demo:tick').map((problem) => problem.code)).toEqual([
      'mcfunction.lint.undeclaredSymbol',
    ]);
  });

  it('skips the checker without one: schema problems only', async () => {
    const { session } = await dataProject({ checker: null });
    session.addElement({
      id: 'demo:greet',
      kind: 'minecraft:function',
      data: { lines: ['bogus command here'] },
    });
    await session.flushValidation();
    expect(session.problemsFor('demo:greet')).toEqual([]);
  });
});

describe('ProjectSession: data pack export', () => {
  it('exports a data zip with the function and a data-format pack.mcmeta', async () => {
    const { session, calls } = await dataProject();
    session.addElement({
      id: 'demo:greet',
      kind: 'minecraft:function',
      data: { lines: ['say hello'] },
    });
    const result = await session.exportPack('data', 'zip');
    expect(errors(result.problems)).toEqual([]);
    expect(result.ok).toBe(true);
    const fileName = `demo-${defaultTarget.id}-data.zip`;
    expect(result.location).toBe(`/exports/${fileName}`);
    expect(calls.saved.map((entry) => entry.defaultName)).toEqual([fileName]);
    const zip = unzipSync(calls.saved[0]?.data ?? new Uint8Array());
    const fn = `data/demo/${defaultTarget.folders.data.function}/greet.mcfunction`;
    expect(Object.keys(zip)).toContain(fn);
    expect(decoder.decode(zip[fn])).toBe('say hello\n');
    const mcmeta = JSON.parse(decoder.decode(zip['pack.mcmeta'])) as {
      pack: { pack_format?: number; min_format?: Json };
    };
    expect(JSON.stringify(mcmeta)).toContain(String(defaultTarget.packFormats.data.major));
    expect(Object.keys(zip).some((path) => path.startsWith('assets/'))).toBe(false);
    expect(result.problems.some((problem) => problem.code === 'export.language-unchecked')).toBe(
      false,
    );
  });

  it('blocks the export when a function has errors', async () => {
    const { session, calls } = await dataProject();
    session.addElement({
      id: 'demo:greet',
      kind: 'minecraft:function',
      data: { lines: ['say hello', 'tp @s 1 2'] },
    });
    const result = await session.exportPack('data', 'zip');
    expect(result.ok).toBe(false);
    expect(calls.saved).toEqual([]);
    const blocking = errors(result.problems);
    expect(blocking.length).toBeGreaterThan(0);
    expect(blocking.some((problem) => problem.path === '/lines/1')).toBe(true);
    expect(blocking.every((problem) => problem.elementId === 'demo:greet')).toBe(true);
  });

  it('passes warnings and reports unchecked functions without a checker', async () => {
    const { session } = await dataProject({ checker: null });
    session.addElement({ id: 'demo:greet', kind: 'minecraft:function' });
    const result = await session.exportPack('data', 'zip');
    expect(result.ok).toBe(true);
    expect(result.problems.map((problem) => problem.code)).toContain('export.language-unchecked');
  });

  it('keeps exportResourcePack("zip") on the resource pack', async () => {
    const { session, calls } = await dataProject();
    session.addElement({ id: 'demo:greet', kind: 'minecraft:function' });
    const result = await session.exportResourcePack('zip');
    expect(result.ok).toBe(true);
    expect(calls.saved[0]?.defaultName).toBe(`demo-${defaultTarget.id}.zip`);
    const zip = unzipSync(calls.saved[0]?.data ?? new Uint8Array());
    expect(Object.keys(zip).some((path) => path.startsWith('data/'))).toBe(false);
  });

  it('maps a lowered function path back to its element', () => {
    const folder = defaultTarget.folders.data.function;
    expect(functionIdOfOutput(`data/demo/${folder}/a/b.mcfunction`, defaultTarget)).toBe(
      'demo:a/b',
    );
    expect(functionIdOfOutput('data/demo/recipe/a.json', defaultTarget)).toBeUndefined();
  });
});

describe('ProjectSession: references and rename', () => {
  async function referencingProject() {
    const { session, fs } = await dataProject();
    session.addElement({ id: 'demo:greet', kind: 'minecraft:function' });
    session.addElement({
      id: 'demo:main',
      kind: 'minecraft:function',
      data: { lines: ['function demo:greet', 'say demo:greeting stays'] },
    });
    session.addElement({
      id: 'minecraft:load',
      kind: 'minecraft:tag/function',
      data: { values: ['demo:greet'] },
    });
    session.addElement({
      id: 'demo:ruby',
      kind: 'minecraft:recipe',
      data: {
        type: 'minecraft:crafting_shapeless',
        category: 'misc',
        ingredients: ['minecraft:diamond'],
        // An item that happens to share the function's id: a different registry.
        result: { id: 'demo:greet', count: 1 },
      },
    });
    session.addElement({
      id: 'demo:root',
      kind: 'minecraft:advancement',
      data: {
        criteria: { requirement: { trigger: 'minecraft:tick' } },
        rewards: { function: 'demo:greet', recipes: ['demo:ruby'] },
      },
    });
    await session.flushValidation();
    return { session, fs };
  }

  it('finds schema and text references', async () => {
    const { session } = await referencingProject();
    const to = session.references.to('demo:greet');
    expect(to.map((reference) => [reference.from, reference.path, reference.registry])).toEqual([
      ['demo:main', '/lines/0', ''],
      ['demo:root', '/rewards/function', 'function'],
      ['demo:ruby', '/result/id', 'item'],
      ['minecraft:load', '/values/0', 'function'],
    ]);
    expect(session.references.to('demo:greet', 'function')).toHaveLength(2);
    expect(session.references.from('demo:root').map((reference) => reference.to)).toEqual([
      'minecraft:tick',
      'demo:greet',
      'demo:ruby',
    ]);
  });

  it('renames a function and rewrites its references in one undo step', async () => {
    const { session } = await referencingProject();
    const before = session.snapshot.project;
    session.renameElement('demo:greet', 'demo:hello');
    const elements = new Map(
      (session.snapshot.project?.namespaces ?? []).flatMap((namespace) =>
        namespace.elements.map((element) => [element.id, element.data] as const),
      ),
    );
    expect(elements.has('demo:greet')).toBe(false);
    expect(elements.has('demo:hello')).toBe(true);
    expect(elements.get('demo:main')).toEqual({
      lines: ['function demo:hello', 'say demo:greeting stays'],
    });
    expect(elements.get('minecraft:load')).toEqual({ values: ['demo:hello'] });
    expect(elements.get('demo:root')).toMatchObject({
      rewards: { function: 'demo:hello', recipes: ['demo:ruby'] },
    });
    // The item id in the recipe is another registry and stays.
    expect(elements.get('demo:ruby')).toMatchObject({ result: { id: 'demo:greet' } });
    expect(session.snapshot.undoLabel).toBe('Rename demo:greet to demo:hello');

    session.undo();
    expect(session.snapshot.project).toEqual(before);
  });

  it('renames a recipe referenced by an advancement', async () => {
    const { session } = await referencingProject();
    session.renameElement('demo:ruby', 'demo:ruby_shard');
    const root = session.snapshot.project?.namespaces
      .flatMap((namespace) => namespace.elements)
      .find((element) => element.id === 'demo:root');
    expect(root?.data).toMatchObject({ rewards: { recipes: ['demo:ruby_shard'] } });
  });

  it('reports a rename onto an existing id as a problem instead of throwing', async () => {
    const { session } = await referencingProject();
    const before = session.snapshot.project;
    expect(() => session.renameElement('demo:greet', 'demo:main')).not.toThrow();
    expect(session.snapshot.project).toBe(before);
    expect(session.snapshot.problems).toContainEqual(
      expect.objectContaining({ code: 'refs.rename-conflict', elementId: 'demo:greet' }),
    );
    session.setElementValue('demo:main', '/lines/1', 'say ok');
    expect(
      session.snapshot.problems.some((problem) => problem.code === 'refs.rename-conflict'),
    ).toBe(false);
    expect(() => session.renameElement('demo:nope', 'demo:x')).toThrow();
  });

  it('saves the renamed element at its new path', async () => {
    const { session, fs } = await referencingProject();
    await session.save();
    session.renameElement('demo:greet', 'demo:hello');
    await session.save();
    const files = fs.list();
    expect(files).toContain('content/demo/function/hello.json');
    expect(files).not.toContain('content/demo/function/greet.json');
  });
});
