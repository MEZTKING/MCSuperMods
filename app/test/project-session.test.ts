import { createMemoryFileSystem, type MemoryFileSystem, utf8 } from '@msm/core';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { builtInPlugins } from '../src/renderer/src/plugins/built-in';
import {
  defaultElementData,
  namespaceFromFolderName,
} from '../src/renderer/src/session/element-defaults';
import {
  type ContentBundleBuilder,
  SessionProblemCodes,
} from '../src/renderer/src/session/project-session';
import {
  defaultTarget,
  fakeExample,
  fakeStarter,
  newLibrarySession,
  newSession,
} from './session-fixture';

/** Every built-in plugin that contributes element kinds: what a new project lists. */
const KIND_PLUGIN_IDS = builtInPlugins
  .filter((plugin) => (plugin.contributes.elementKinds ?? []).length > 0)
  .map((plugin) => plugin.id);

async function openSaved(fs: MemoryFileSystem) {
  const { session, calls } = newSession(fs);
  expect(await session.openProject()).toEqual({ ok: true });
  await session.flushValidation();
  return { session, calls };
}

describe('ProjectSession: projects', () => {
  it('creates a new project with the default target, plugin, namespace and pack.mcmeta', async () => {
    const fs = createMemoryFileSystem();
    const { session } = newSession(fs);
    expect(await session.newProject()).toEqual({ ok: true });
    const project = session.snapshot.project;
    expect(project?.name).toBe('demo');
    expect(project?.targets).toEqual([defaultTarget.id]);
    expect(project?.plugins).toEqual(KIND_PLUGIN_IDS);
    expect(project?.plugins).toEqual([
      'msm.resourcepack',
      'msm.datapack',
      'msm.structures',
      'msm.worldgen',
      'msm.blocks-items',
      'msm.models-anim',
      'msm.entities',
      'msm.scripting',
    ]);
    expect(project?.plugins).not.toContain('msm.library');
    expect(project?.namespaces.map((namespace) => namespace.name)).toEqual(['demo']);
    const pack = project?.namespaces[0]?.elements[0];
    expect(pack?.id).toBe('demo:pack');
    expect(pack?.kind).toBe('minecraft:pack_mcmeta');
    expect(session.snapshot.dirty).toBe(false);
    expect(fs.list()).toContain('content/demo/pack/pack.json');

    await session.flushValidation();
    // The pack formats are hidden and owned by lowering, so they are not reported.
    expect(session.snapshot.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
  });

  it('derives the first namespace from the folder name', async () => {
    expect(namespaceFromFolderName('My Pack!')).toBe('my_pack');
    expect(namespaceFromFolderName('---')).toBe('my_project');
    const { session } = newSession(createMemoryFileSystem(), { directory: '/x/Ruby Tools 2' });
    await session.newProject();
    expect(session.snapshot.project?.namespaces[0]?.name).toBe('ruby_tools_2');
    expect(session.snapshot.project?.namespaces[0]?.elements[0]?.id).toBe('ruby_tools_2:pack');
  });

  it('creates, edits, saves and reloads a project', async () => {
    const fs = createMemoryFileSystem();
    const { session } = newSession(fs);
    await session.newProject();
    session.addElement({ id: 'demo:block/ruby_block', kind: 'minecraft:model' });
    session.setElementValue('demo:block/ruby_block', '/ambientocclusion', false);
    expect(session.snapshot.dirty).toBe(true);
    await session.save();
    expect(session.snapshot.dirty).toBe(false);
    expect(fs.list()).toContain('content/demo/model/block/ruby_block.json');

    const { session: reloaded } = await openSaved(fs);
    expect(reloaded.snapshot.project).toEqual(session.snapshot.project);
  });

  it('deletes a removed element file on the next save (manifest kept)', async () => {
    const fs = createMemoryFileSystem();
    const { session } = newSession(fs);
    await session.newProject();
    session.addElement({ id: 'demo:block/a', kind: 'minecraft:model' });
    await session.save();
    expect(fs.list()).toContain('content/demo/model/block/a.json');
    session.removeElement('demo:block/a');
    await session.save();
    expect(fs.list()).not.toContain('content/demo/model/block/a.json');
  });

  it('tracks dirty state and labels through undo and redo', async () => {
    const { session } = newSession(createMemoryFileSystem());
    await session.newProject();
    const seen: boolean[] = [];
    session.subscribe((snapshot) => seen.push(snapshot.dirty));

    session.addNamespace('extra');
    expect(session.snapshot.undoLabel).toBe('Add namespace "extra"');
    expect(session.undo()).toBe(true);
    expect(session.snapshot.dirty).toBe(false);
    expect(session.snapshot.redoLabel).toBe('Add namespace "extra"');
    expect(session.redo()).toBe(true);
    expect(session.snapshot.dirty).toBe(true);
    expect(seen).toEqual([true, false, true]);
  });

  it('coalesces typing into one undo step', async () => {
    const { session } = newSession(createMemoryFileSystem());
    await session.newProject();
    session.addElement({ id: 'demo:en_us', kind: 'minecraft:lang' });
    for (const text of ['R', 'Ru', 'Rub', 'Ruby']) {
      session.setElementValue('demo:en_us', '/block.demo.ruby', text, {
        coalesce: 'typing:/block.demo.ruby',
      });
    }
    session.undo();
    expect(
      session.snapshot.project?.namespaces[0]?.elements.find((e) => e.id === 'demo:en_us')?.data,
    ).toEqual({});
  });

  it('asks before discarding unsaved changes', async () => {
    const { session, calls } = newSession(createMemoryFileSystem(), { discard: false });
    await session.newProject();
    session.addNamespace('extra');
    expect(await session.openProject()).toEqual({ ok: false, cancelled: true });
    expect(calls.confirms).toHaveLength(1);
    expect(session.snapshot.project?.namespaces).toHaveLength(2);
  });

  it('rejects unknown kinds and sounds files not named <ns>:sounds', async () => {
    const { session } = newSession(createMemoryFileSystem());
    await session.newProject();
    expect(() => session.addElement({ id: 'demo:x', kind: 'demo:nope' })).toThrow(/Unknown/);
    expect(() => session.addElement({ id: 'demo:noises', kind: 'minecraft:sounds' })).toThrow(
      /demo:sounds/,
    );
    session.addElement({ id: 'demo:sounds', kind: 'minecraft:sounds' });
  });
});

describe('ProjectSession: element defaults', () => {
  it('replaces placeholders with ids in the element namespace', async () => {
    const { session } = newSession(createMemoryFileSystem());
    await session.newProject();
    session.addElement({ id: 'demo:ruby_block_model', kind: 'minecraft:model' });
    session.addElement({ id: 'demo:ruby_block', kind: 'minecraft:block_definition' });
    session.addElement({ id: 'demo:ruby', kind: 'minecraft:item_definition' });
    const data = (id: string, kind: string) =>
      session.snapshot.project?.namespaces[0]?.elements.find((e) => e.id === id && e.kind === kind)
        ?.data;
    expect(data('demo:ruby_block_model', 'minecraft:model')).toEqual({
      parent: 'minecraft:block/cube_all',
      textures: { all: 'demo:block/ruby_block_model' },
    });
    expect(data('demo:ruby_block', 'minecraft:block_definition')).toEqual({
      variants: { '': { model: 'demo:block/ruby_block' } },
    });
    expect(data('demo:ruby', 'minecraft:item_definition')).toEqual({
      model: { type: 'model', model: 'demo:item/ruby' },
    });
  });

  it('keeps an existing block/ or item/ prefix', () => {
    expect(
      defaultElementData('minecraft:model', 'demo:item/ruby', {
        textures: { all: '<set by the app>' },
      }),
    ).toEqual({ textures: { all: 'demo:item/ruby' } });
  });
});

describe('ProjectSession: live problems', () => {
  it('reports schema errors after an edit and clears them when fixed', async () => {
    const { session } = newSession(createMemoryFileSystem());
    await session.newProject();
    session.addElement({ id: 'demo:block/ruby_block', kind: 'minecraft:model' });
    await session.flushValidation();
    expect(
      session.problemsFor('demo:block/ruby_block').filter((p) => p.severity === 'error'),
    ).toEqual([]);

    session.setElementValue('demo:block/ruby_block', '/ambientocclusion', 'yes');
    await session.flushValidation();
    const errors = session
      .problemsFor('demo:block/ruby_block')
      .filter((problem) => problem.severity === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      elementId: 'demo:block/ruby_block',
      path: '/ambientocclusion',
      code: 'schema.type-mismatch',
    });

    session.setElementValue('demo:block/ruby_block', '/ambientocclusion', true);
    await session.flushValidation();
    expect(
      session.problemsFor('demo:block/ruby_block').filter((p) => p.severity === 'error'),
    ).toEqual([]);
  });

  // 20 s: under a full parallel turbo run the debounced validation can take more than the default 5 s.
  it('validates after the debounce without an explicit flush', async () => {
    const { session } = newSession(createMemoryFileSystem());
    await session.newProject();
    await session.flushValidation();
    session.addElement({
      id: 'demo:block/bad',
      kind: 'minecraft:model',
      data: { ambientocclusion: 3 },
    });
    expect(session.problemsFor('demo:block/bad')).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await session.flushValidation();
    expect(session.problemsFor('demo:block/bad').some((p) => p.severity === 'error')).toBe(true);
  }, 20_000);

  it('drops problems of removed elements', async () => {
    const { session } = newSession(createMemoryFileSystem());
    await session.newProject();
    session.addElement({ id: 'demo:block/bad', kind: 'minecraft:model', data: { parent: 1 } });
    await session.flushValidation();
    expect(session.problemsFor('demo:block/bad').length).toBeGreaterThan(0);
    session.removeElement('demo:block/bad');
    expect(session.problemsFor('demo:block/bad')).toEqual([]);
  });

  it('warns about unknown model ids and re-checks when the project defines one', async () => {
    const { session } = newSession(createMemoryFileSystem());
    await session.newProject();
    session.addElement({ id: 'demo:ruby_block', kind: 'minecraft:block_definition' });
    await session.flushValidation();
    const warnings = () =>
      session
        .problemsFor('demo:ruby_block')
        .filter((problem) => problem.code === 'schema.unknown-id');
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toMatchObject({ severity: 'warning', path: '/variants//model' });
    // Adding the model changes the project's ids, so the untouched definition is re-checked.
    session.addElement({ id: 'demo:block/ruby_block', kind: 'minecraft:model' });
    await session.flushValidation();
    expect(warnings()).toEqual([]);
  });

  it('loads schemas once per target through the platform', async () => {
    const { session, calls } = newSession(createMemoryFileSystem());
    await session.newProject();
    const first = await session.schemas();
    const second = await session.schemas();
    expect(second).toBe(first);
    expect(first.target.id).toBe(defaultTarget.id);
    expect(calls.vendoredReads.sort()).toEqual([
      `${defaultTarget.id}:mcmetaRegistries`,
      `${defaultTarget.id}:vanillaMcdocSymbols`,
    ]);
  });

  it('falls back to the default target with a warning for an unknown target', async () => {
    const fs = createMemoryFileSystem();
    const { session } = newSession(fs);
    await session.newProject();
    const text = utf8.decode(await fs.readFile('msm.project.json'));
    await fs.writeFile(
      'msm.project.json',
      utf8.encode(text.replace(JSON.stringify(defaultTarget.id), '"mc-0.0"')),
    );
    const { session: reopened } = await openSaved(fs);
    expect(reopened.snapshot.problems.map((problem) => problem.code)).toContain(
      SessionProblemCodes.unknownTarget,
    );
    expect((await reopened.schemas()).target.id).toBe(defaultTarget.id);
  });
});

describe('ProjectSession: save with files that failed to load (ADR 0012)', () => {
  async function projectWithBrokenFile() {
    const fs = createMemoryFileSystem();
    const { session } = newSession(fs);
    await session.newProject();
    await fs.writeFile('content/demo/model/broken.json', utf8.encode('{ nope'));
    return fs;
  }

  it('saves, leaves the broken file untouched and keeps its problem', async () => {
    const fs = await projectWithBrokenFile();
    const { session } = await openSaved(fs);
    expect(session.skippedFileCount).toBe(1);
    const fileProblem = session.snapshot.problems.find(
      (problem) => problem.file === 'content/demo/model/broken.json',
    );
    expect(fileProblem?.severity).toBe('error');

    session.addElement({ id: 'demo:block/ok', kind: 'minecraft:model' });
    await session.save();
    expect(fs.list()).toContain('content/demo/model/broken.json');
    expect(utf8.decode(await fs.readFile('content/demo/model/broken.json'))).toBe('{ nope');
    expect(fs.list()).toContain('content/demo/model/block/ok.json');
    expect(session.snapshot.problems).toContain(fileProblem);
  });

  it('warns when a new element would be saved over a file that failed to load', async () => {
    const fs = await projectWithBrokenFile();
    const { session } = await openSaved(fs);
    session.addElement({ id: 'demo:broken', kind: 'minecraft:model' });
    const warning = session.snapshot.problems.find(
      (problem) => problem.code === SessionProblemCodes.overwritesSkippedFile,
    );
    expect(warning).toMatchObject({
      severity: 'warning',
      elementId: 'demo:broken',
      file: 'content/demo/model/broken.json',
    });
    await session.save();
    // The file is now the session's own; its load problem and the warning are gone.
    expect(session.snapshot.problems.filter((problem) => problem.file !== undefined)).toEqual([]);
    expect(session.skippedFileCount).toBe(0);
  });
});

describe('ProjectSession: install and combined delivery', () => {
  async function dataProject() {
    const fs = createMemoryFileSystem();
    const { session, platform } = newSession(fs);
    expect(await session.newProject()).toEqual({ ok: true });
    session.addElement({
      id: 'demo:greet',
      kind: 'minecraft:function',
      data: { lines: ['say hello'] },
    });
    return { session, platform };
  }

  it('installs the data pack into the chosen world', async () => {
    const { session, platform } = await dataProject();
    const installs: { worldDir: string; fileName: string; data: Uint8Array }[] = [];
    platform.minecraft.installDataPack = async (worldDir, fileName, data) => {
      installs.push({ worldDir, fileName, data });
      return { path: `/minecraft/saves/${worldDir}/datapacks/${fileName}` };
    };
    const result = await session.installDataPack('My World');
    expect(result.ok).toBe(true);
    const fileName = `demo-${defaultTarget.id}-data.zip`;
    expect(installs.map((entry) => [entry.worldDir, entry.fileName])).toEqual([
      ['My World', fileName],
    ]);
    expect(result.location).toBe(`/minecraft/saves/My World/datapacks/${fileName}`);
    const zip = unzipSync(installs[0]?.data ?? new Uint8Array());
    expect(Object.keys(zip)).toContain(
      `data/demo/${defaultTarget.folders.data.function}/greet.mcfunction`,
    );
  });

  it('refuses a data pack install without a world', async () => {
    const { session } = await dataProject();
    await expect(session.exportPack('data', 'install')).rejects.toThrow(/world/);
  });

  it('writes both packs into the picked folder with the combined names', async () => {
    const { session, platform } = await dataProject();
    const calls: string[] = [];
    const written: { folder: string; names: string[]; files: Record<string, Uint8Array> } = {
      folder: '',
      names: [],
      files: {},
    };
    platform.exports.pickFolder = async () => {
      calls.push('pick');
      return '/exports/both';
    };
    platform.exports.writeFiles = async (folder, files) => {
      calls.push('write');
      written.folder = folder;
      written.names = files.map((file) => file.name);
      for (const file of files) written.files[file.name] = file.data;
      return { paths: files.map((file) => `${folder}/${file.name}`) };
    };
    const result = await session.exportPack('resource', 'combined');
    expect(result.ok).toBe(true);
    expect(result.location).toBe('/exports/both');
    expect(calls).toEqual(['pick', 'write']);
    const base = `demo-${defaultTarget.id}`;
    expect(written.names).toEqual([`${base}-resources.zip`, `${base}-data.zip`]);
    const data = Object.keys(unzipSync(written.files[`${base}-data.zip`] ?? new Uint8Array()));
    const resources = Object.keys(
      unzipSync(written.files[`${base}-resources.zip`] ?? new Uint8Array()),
    );
    expect(data.some((path) => path.endsWith('greet.mcfunction'))).toBe(true);
    expect(resources.some((path) => path.startsWith('data/'))).toBe(false);
    expect(result.problems.some((problem) => problem.code === 'export.layer-skipped')).toBe(false);
  });

  it('asks for no folder when a pack is blocked, and reports a cancelled pick', async () => {
    const { session, platform } = await dataProject();
    let picks = 0;
    platform.exports.pickFolder = async () => {
      picks += 1;
      return null;
    };
    const cancelled = await session.exportPack('data', 'combined');
    expect(cancelled.cancelled).toBe(true);
    expect(picks).toBe(1);
    session.setElementData('demo:greet', { lines: 3 });
    const blocked = await session.exportPack('data', 'combined');
    expect(blocked.ok).toBe(false);
    expect(picks).toBe(1);
  });

  it('returns the number of rewritten references from a rename', async () => {
    const { session } = await dataProject();
    session.addElement({
      id: 'demo:main',
      kind: 'minecraft:function',
      data: { lines: ['function demo:greet', 'say demo:greet'] },
    });
    expect(session.renameElement('demo:greet', 'demo:hello')).toEqual({
      renamed: true,
      references: 2,
    });
    expect(session.renameElement('demo:hello', 'demo:main')).toEqual({
      renamed: false,
      references: 0,
    });
  });
});

describe('ProjectSession: game locations (ADR 0019)', () => {
  const prism = { launcher: 'prism', root: '/home/me/prism', instance: 'My-Instance' } as const;

  it('lists locations for the current target', async () => {
    const locations = {
      locations: [
        {
          ref: prism,
          id: 'prism:My-Instance',
          displayName: 'My Instance',
          mcVersion: '9.9-msm-test',
          loader: null,
          gameDir: '/home/me/prism/instances/My-Instance/minecraft',
          modsDir: null,
          problems: [],
          warnings: [{ code: 'location.version-mismatch', message: 'Mismatch.' }],
        },
      ],
      selected: 'prism:My-Instance',
    };
    const { session, calls } = newSession(createMemoryFileSystem(), { locations });
    expect(await session.newProject()).toEqual({ ok: true });
    expect(await session.listLocations()).toEqual(locations);
    expect(calls.locationReads).toEqual([defaultTarget.mcVersion]);
  });

  it('stores the install target through settings and clears it with null', async () => {
    const { session, calls } = newSession(createMemoryFileSystem());
    await session.setInstallTarget(prism);
    await session.setInstallTarget(null);
    expect(calls.settingsSets).toEqual([{ installTarget: prism }, { installTarget: null }]);
  });

  it('merges launcher folders into the settings', async () => {
    const { session, calls } = newSession(createMemoryFileSystem());
    const launchers = { prismDataDirs: ['/opt/prism'], multimcRoots: [], curseForgeRoots: [] };
    await session.setSettings({ launchers });
    expect(calls.settingsSets).toEqual([{ launchers }]);
  });
});

describe('ProjectSession: library (ADR 0020)', () => {
  const starterIds = ['demo:greet', 'demo:item/ruby', 'demo:pack', 'minecraft:load'];

  it('collects templates, starters and examples the registered kinds support', () => {
    const { session } = newLibrarySession(createMemoryFileSystem());
    // The built-in plugins contribute library content too; assert only the fakes.
    const templateIds = session.library.templates.map((template) => template.id);
    expect(templateIds).toContain('note');
    expect(templateIds).not.toContain('foreign_recipe');
    const starterIds = session.library.starters.map((starter) => starter.id);
    expect(starterIds).toContain('test_starter');
    expect(starterIds).not.toContain('needs_missing');
    const exampleIds = session.library.examples.map((example) => example.id);
    expect(exampleIds).toContain('test_example');
    expect(exampleIds).not.toContain('needs_missing');
    const builtIn = newSession(createMemoryFileSystem()).session.library;
    expect(builtIn.templates.map((template) => template.id)).not.toContain('note');
    expect(builtIn.starters.map((starter) => starter.id)).not.toContain('test_starter');
    expect(builtIn.examples.map((example) => example.id)).not.toContain('test_example');
  });

  it('keeps the blank project when no starter is given, without the library in plugins', async () => {
    const { session } = newSession(createMemoryFileSystem());
    await session.newProject({});
    expect(session.snapshot.project?.plugins).toEqual(KIND_PLUGIN_IDS);
    expect(session.snapshot.project?.plugins).not.toContain('msm.library');
    expect(session.snapshot.canUndo).toBe(false);
  });

  it('creates a project from a starter with its assets, a pack and zero problems', async () => {
    const fs = createMemoryFileSystem();
    const { session } = newLibrarySession(fs);
    expect(await session.newProject({ starter: fakeStarter })).toEqual({ ok: true });
    const project = session.snapshot.project;
    expect(project?.namespaces.map((namespace) => namespace.name)).toEqual(['demo', 'minecraft']);
    const ids = project?.namespaces.flatMap((namespace) => namespace.elements.map((e) => e.id));
    expect(ids).toEqual(starterIds);
    const model = project?.namespaces[0]?.elements.find((e) => e.id === 'demo:item/ruby');
    expect(model?.meta.notes).toMatch(/flat item model/);
    expect(model?.meta.tags).toEqual(['example', 'models']);
    expect(project?.namespaces[0]?.assets).toEqual([
      { path: 'textures/item/ruby.png', mediaType: 'image/png' },
    ]);
    expect(fs.list()).toContain('assets/demo/textures/item/ruby.png');
    expect(session.snapshot.dirty).toBe(false);
    expect(session.snapshot.canUndo).toBe(false);

    await session.flushValidation();
    expect(session.snapshot.problems).toEqual([]);

    const { session: reloaded } = newLibrarySession(fs);
    expect(await reloaded.openProject()).toEqual({ ok: true });
    await reloaded.flushValidation();
    expect(reloaded.snapshot.project).toEqual(project);
    expect(reloaded.snapshot.problems).toEqual([]);
  });

  it('keeps a pack.mcmeta the bundle brings and reports a bundle that fails to build', async () => {
    const withPack: ContentBundleBuilder = {
      title: 'With pack',
      build: () => ({
        elements: [
          {
            id: 'demo:pack',
            kind: 'minecraft:pack_mcmeta',
            data: { pack: { description: 'Mine' } },
          },
        ],
        assets: [],
      }),
    };
    const { session } = newSession(createMemoryFileSystem());
    expect(await session.newProject({ bundle: withPack })).toEqual({ ok: true });
    const pack = session.snapshot.project?.namespaces[0]?.elements;
    expect(pack?.map((element) => element.data)).toEqual([{ pack: { description: 'Mine' } }]);

    const fs = createMemoryFileSystem();
    const broken = newSession(fs).session;
    const outcome = await broken.newProject({
      bundle: {
        title: 'Broken',
        build: () => ({ elements: [{ id: 'demo:x', kind: 'test:missing', data: {} }], assets: [] }),
      },
    });
    expect(outcome).toEqual({
      ok: false,
      reason: 'Could not build "Broken": Unknown element kind "test:missing" for demo:x.',
    });
    expect(broken.snapshot.project).toBeNull();
    expect(fs.list()).toEqual([]);
  });

  it('copies an example into the open project as one undo step', async () => {
    const fs = createMemoryFileSystem();
    const { session } = newLibrarySession(fs);
    await session.newProject();
    const result = await session.addBundle(fakeExample, { namespace: 'gems' });
    expect(result).toEqual({
      added: ['gems:block/ruby_ore'],
      duplicates: [],
      assets: ['gems:textures/block/ruby_ore.png'],
      skippedAssets: [],
    });
    expect(session.snapshot.undoLabel).toBe('Copy example Ore block model');
    expect(session.snapshot.project?.namespaces.map((namespace) => namespace.name)).toEqual([
      'demo',
      'gems',
    ]);
    expect(fs.list()).toContain('assets/gems/textures/block/ruby_ore.png');
    await session.flushValidation();
    expect(session.snapshot.problems).toEqual([]);

    expect(session.undo()).toBe(true);
    await session.flushAssetFiles();
    expect(session.snapshot.project?.namespaces.map((namespace) => namespace.name)).toEqual([
      'demo',
    ]);
    expect(fs.list()).not.toContain('assets/gems/textures/block/ruby_ore.png');
    expect(session.snapshot.canUndo).toBe(false);

    expect(session.redo()).toBe(true);
    await session.flushAssetFiles();
    expect(fs.list()).toContain('assets/gems/textures/block/ruby_ore.png');
  });

  it('reports duplicates instead of throwing and adds nothing twice', async () => {
    const { session } = newLibrarySession(createMemoryFileSystem());
    await session.newProject();
    await session.addBundle(fakeExample, { namespace: 'demo' });
    const again = await session.addBundle(fakeExample, { namespace: 'demo', label: 'Again' });
    expect(again).toEqual({
      added: [],
      duplicates: ['demo:block/ruby_ore'],
      assets: [],
      skippedAssets: ['demo:textures/block/ruby_ore.png'],
    });
    expect(session.snapshot.undoLabel).toBe('Copy example Ore block model');
    await expect(session.addBundle(fakeExample, { namespace: 'Bad Name' })).rejects.toThrow(
      /Invalid namespace/,
    );
  });

  it('rejects bundle assets that are not valid PNG textures', async () => {
    const { session } = newLibrarySession(createMemoryFileSystem());
    await session.newProject();
    const bad: ContentBundleBuilder = {
      title: 'Bad',
      build: () => ({
        elements: [],
        assets: [{ namespace: 'demo', path: 'textures/item/x.png', bytes: new Uint8Array(4) }],
      }),
    };
    await expect(session.addBundle(bad, { namespace: 'demo' })).rejects.toThrow(/x\.png/);
    expect(session.snapshot.canUndo).toBe(false);
  });
});

describe('ProjectSession: recent projects', () => {
  const recentEntry = (root: string, exists = true) => ({
    root,
    name: root.slice(root.lastIndexOf('/') + 1),
    openedAt: '2026-01-01T00:00:00.000Z',
    exists,
  });

  it('opens a listed recent project like Open and refuses one that is not listed', async () => {
    const fs = createMemoryFileSystem();
    const first = newSession(fs);
    await first.session.newProject();
    await first.session.save();
    const { session, calls } = newSession(fs, { recent: [recentEntry('/projects/demo')] });
    expect(await session.recentProjects()).toEqual([recentEntry('/projects/demo')]);
    expect(await session.openRecent('/projects/demo')).toEqual({ ok: true });
    expect(session.snapshot.root).toBe('/projects/demo');
    expect(session.snapshot.project?.name).toBe('demo');
    expect(calls.openRecent).toEqual(['/projects/demo']);

    const other = newSession(fs, { recent: [recentEntry('/projects/demo')] });
    expect(await other.session.openRecent('/elsewhere/evil')).toEqual({
      ok: false,
      reason: '/elsewhere/evil is not in the recent projects list.',
    });
    expect(other.session.snapshot.project).toBeNull();
  });

  it('asks before discarding unsaved changes and keeps the project when cancelled', async () => {
    const fs = createMemoryFileSystem();
    const { session, calls } = newSession(fs, {
      discard: false,
      recent: [recentEntry('/projects/demo')],
    });
    await session.newProject();
    session.addNamespace('extra');
    expect(session.snapshot.dirty).toBe(true);
    expect(await session.openRecent('/projects/demo')).toEqual({ ok: false, cancelled: true });
    expect(calls.confirms).toEqual(['The current project has unsaved changes. Discard them?']);
    expect(calls.openRecent).toEqual([]);
    expect(session.snapshot.dirty).toBe(true);
    expect(session.snapshot.project?.namespaces.map((namespace) => namespace.name)).toContain(
      'extra',
    );
  });

  it('removes and clears recent entries through the platform', async () => {
    const { session } = newSession(createMemoryFileSystem(), {
      recent: [recentEntry('/a/one'), recentEntry('/a/two', false)],
    });
    await session.removeRecentProject('/a/two');
    expect((await session.recentProjects()).map((entry) => entry.root)).toEqual(['/a/one']);
    await session.clearRecentProjects();
    expect(await session.recentProjects()).toEqual([]);
  });
});
