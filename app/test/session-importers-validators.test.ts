import { createMemoryFileSystem, type Element, type Problem } from '@msm/core';
import { blockbenchImporter } from '@msm/interop';
import {
  definePlugin,
  type Exporter,
  type Importer,
  type Plugin,
  type ProjectValidator,
} from '@msm/plugin-api';
import {
  type StructureTemplateData,
  structureTemplateToNbt,
  writeNbt,
} from '@msm/plugin-structures';
import { describe, expect, it } from 'vitest';
import { builtInPlugins } from '../src/renderer/src/plugins/built-in';
import {
  BLOCKBENCH_IMPORTER_ID,
  collectImporters,
  fileExtension,
  HOST_IMPORTER_PLUGIN_ID,
  importerFileFilters,
  importerFor,
  isBlockbenchImporter,
} from '../src/renderer/src/session/importers';
import { SessionProblemCodes } from '../src/renderer/src/session/project-session';
import {
  blockingValidatorErrors,
  changedKinds,
  collectValidators,
  ValidatorProblemCodes,
  validatorsFor,
} from '../src/renderer/src/session/validator-problems';
import { defaultTarget, newSession } from './session-fixture';

/** Turns `<name>.fake` into a function element `<ns>:<name>` whose one line is the text. */
const fakeImporter: Importer = {
  id: 'fake-function',
  displayName: 'Fake function (.fake)',
  extensions: ['fake'],
  async import(file, namespace) {
    const name = file.name.replace(/\.fake$/i, '').toLowerCase();
    if (name === 'boom') throw new Error('Unreadable.');
    const element: Element = {
      formatVersion: 1,
      id: `${namespace}:${name}`,
      kind: 'minecraft:function',
      data: { lines: [new TextDecoder().decode(file.bytes)] },
      meta: { createdAt: '2020-01-01T00:00:00.000Z' },
    };
    return {
      elements: [element],
      assets: [],
      problems: [
        { severity: 'info', code: 'fake.note', message: `Read ${file.name}.`, file: file.name },
      ],
    };
  },
};

/** An error for every function whose id ends in `bad`; throws for `explode`. */
const fakeValidator: ProjectValidator = {
  id: 'test.no-bad-functions',
  kinds: ['minecraft:function'],
  validate: ({ elements, registry }) => {
    if (elements.some((element) => element.id.endsWith(':explode'))) throw new Error('Kaboom.');
    return elements
      .filter((element) => element.kind === 'minecraft:function' && element.id.endsWith('bad'))
      .map((element) => ({
        severity: 'error',
        code: 'test.bad-function',
        elementId: element.id,
        path: '/lines',
        message: `${element.id} is bad (known: ${registry.has('function', element.id)}).`,
      }));
  },
};

/** Writes one text file per function element, named `<ns>/<path>.nbt`. */
const fakeExporter: Exporter = {
  id: 'test-structures',
  displayName: 'Test files',
  layers: ['datapack'],
  async run(input) {
    for (const file of input.files) {
      const match = /^data\/([^/]+)\/function\/(.+)\.mcfunction$/.exec(file.path);
      if (match === null) continue;
      await input.sink.writeFile(`${match[1]}/${match[2]}.nbt`, new Uint8Array([1, 2, 3]));
    }
  },
};

const testPlugin: Plugin = definePlugin({
  id: 'test.fakes',
  apiVersion: '^0.7.0',
  contributes: {
    importers: [fakeImporter],
    validators: [fakeValidator],
    exporters: [fakeExporter],
  },
});

const encode = (text: string) => new TextEncoder().encode(text);

async function openSession(options: { plugins?: readonly Plugin[] } = {}) {
  const fs = createMemoryFileSystem();
  const { session, platform } = newSession(
    fs,
    {},
    { plugins: options.plugins ?? [...builtInPlugins, testPlugin] },
  );
  const writes: { folder: string; names: string[] }[] = [];
  let picks = 0;
  platform.exports = {
    pickFolder: async () => {
      picks += 1;
      return '/exports/picked';
    },
    writeFiles: async (folder, files) => {
      writes.push({ folder, names: files.map((file) => file.name) });
      return { paths: files.map((file) => `${folder}/${file.name}`) };
    },
    runtimeJar: async () => null,
    geckolibJar: async () => null,
  };
  await session.newProject();
  return { session, fs, writes, picks: () => picks };
}

const codes = (problems: readonly Problem[]) => problems.map((problem) => problem.code);

describe('importer helpers', () => {
  it('picks importers by lower-case extension and builds picker filters', () => {
    const importers = collectImporters(builtInPlugins, undefined, []);
    expect(importers.map((entry) => entry.importer.id)).toEqual([
      'structure-nbt',
      'sponge-schematic',
    ]);
    expect(fileExtension('C:\\dir\\Hut.NBT')).toBe('nbt');
    expect(fileExtension('.nbt')).toBe('');
    expect(importerFor(importers, 'hut.SCHEM')?.importer.id).toBe('sponge-schematic');
    expect(importerFor(importers, 'hut.json')).toBeUndefined();
    expect(importerFileFilters(importers)).toEqual([
      { name: 'All supported files', extensions: ['nbt', 'schem'] },
      { name: 'Structure template (.nbt)', extensions: ['nbt'] },
      { name: 'Sponge schematic (.schem)', extensions: ['schem'] },
    ]);
  });

  it('registers the Blockbench importer as a host importer after the plugin importers', () => {
    const importers = collectImporters(builtInPlugins);
    expect(importers.map((entry) => [entry.pluginId, entry.importer.id])).toEqual([
      ['msm.structures', 'structure-nbt'],
      ['msm.structures', 'sponge-schematic'],
      [HOST_IMPORTER_PLUGIN_ID, BLOCKBENCH_IMPORTER_ID],
    ]);
    expect(importers.filter(isBlockbenchImporter)).toHaveLength(1);
    for (const name of ['Golem.bbmodel', 'golem.geo.json', 'golem.animation.json', 'x.JSON']) {
      expect(importerFor(importers, name)?.importer.id).toBe('blockbench');
    }
    expect(importerFor(importers, 'hut.nbt')?.importer.id).toBe('structure-nbt');
    // A plugin importer with the same id wins over the host's.
    const shadow = { ...blockbenchImporter, displayName: 'Plugin Blockbench' };
    const plugin = definePlugin({
      id: 'test.shadow',
      apiVersion: '^0.7.0',
      contributes: { importers: [shadow] },
    });
    const shadowed = collectImporters([plugin]);
    expect(shadowed.map((entry) => entry.importer.displayName)).toEqual(['Plugin Blockbench']);
  });
});

/** A minimal Bedrock geometry file as Blockbench exports it. */
const GEO_JSON = {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: { identifier: 'geometry.golem', texture_width: 64, texture_height: 64 },
      bones: [
        {
          name: 'body',
          pivot: [0, 0, 0],
          cubes: [{ origin: [-4, 0, -4], size: [8, 8, 8], uv: [0, 0] }],
        },
      ],
    },
  ],
};

/** A minimal animation file as Blockbench exports it. */
const ANIMATION_JSON = {
  format_version: '1.8.0',
  animations: {
    idle: { loop: true, animation_length: 1, bones: { body: { rotation: [0, 0, 0] } } },
  },
};

describe('ProjectSession.importFiles with the Blockbench host importer', () => {
  it('imports .geo.json and .animation.json as one undo step and refuses other .json', async () => {
    const { session } = await openSession({ plugins: builtInPlugins });
    const result = await session.importFiles(
      [
        { name: 'Golem.geo.json', data: encode(JSON.stringify(GEO_JSON)) },
        { name: 'golem.animation.json', data: encode(JSON.stringify(ANIMATION_JSON)) },
        { name: 'notes.json', data: encode('{}') },
      ],
      'demo',
    );
    expect(result.imported).toEqual(['demo:entity/golem', 'demo:entity/golem_animations']);
    expect(codes(result.problems.filter((problem) => problem.severity === 'error'))).toEqual([
      'blockbench.not-a-model',
    ]);
    const kinds = () =>
      session.snapshot.project?.namespaces[0]?.elements
        .filter((element) => element.id.startsWith('demo:entity/'))
        .map((element) => element.kind) ?? [];
    expect(kinds()).toEqual(['msm:geo_model', 'msm:animation']);
    expect(session.snapshot.undoLabel).toBe('Import 2 files');
    session.undo();
    expect(kinds()).toEqual([]);
  });
});

describe('ProjectSession.importFiles', () => {
  it('imports two files as one undo step and reports the importer problems', async () => {
    const { session } = await openSession();
    const result = await session.importFiles(
      [
        { name: 'One.fake', data: encode('say one') },
        { name: 'two.FAKE', data: encode('say two') },
      ],
      'demo',
    );
    expect(result.imported).toEqual(['demo:one', 'demo:two']);
    expect(codes(result.problems)).toEqual(['fake.note', 'fake.note']);
    expect(session.snapshot.undoLabel).toBe('Import 2 files');
    const ids = () =>
      session.snapshot.project?.namespaces.flatMap((ns) => ns.elements.map((e) => e.id)) ?? [];
    expect(ids()).toEqual(expect.arrayContaining(['demo:one', 'demo:two']));
    session.undo();
    expect(ids()).not.toContain('demo:one');
    expect(ids()).not.toContain('demo:two');
  });

  it('skips and reports duplicate ids, unsupported files and failing importers', async () => {
    const { session } = await openSession();
    await session.importFiles([{ name: 'one.fake', data: encode('say one') }], 'demo');
    const result = await session.importFiles(
      [
        { name: 'one.fake', data: encode('say again') },
        { name: 'three.fake', data: encode('say three') },
        { name: 'three.fake', data: encode('say three again') },
        { name: 'notes.txt', data: encode('x') },
        { name: 'boom.fake', data: encode('x') },
      ],
      'demo',
    );
    expect(result.imported).toEqual(['demo:three']);
    const problems = result.problems.filter((problem) => problem.code !== 'fake.note');
    expect(codes(problems)).toEqual([
      SessionProblemCodes.importUnsupported,
      SessionProblemCodes.importFailed,
      SessionProblemCodes.importDuplicateId,
      SessionProblemCodes.importDuplicateId,
    ]);
    expect(problems.map((problem) => problem.elementId ?? problem.file)).toEqual([
      'notes.txt',
      'boom.fake',
      'demo:one',
      'demo:three',
    ]);
    // The original element was kept.
    const one = session.snapshot.project?.namespaces[0]?.elements.find((e) => e.id === 'demo:one');
    expect(one?.data).toEqual({ lines: ['say one'] });
  });

  it('creates a missing namespace in the same undo step and adds nothing for no elements', async () => {
    const { session } = await openSession();
    const none = await session.importFiles([{ name: 'a.txt', data: encode('x') }], 'demo');
    expect(none.imported).toEqual([]);
    expect(session.snapshot.canUndo).toBe(false);
    await session.importFiles([{ name: 'piece.fake', data: encode('say hi') }], 'extra');
    expect(session.snapshot.undoLabel).toBe('Import 1 file');
    session.undo();
    expect(session.snapshot.project?.namespaces.map((ns) => ns.name)).toEqual(['demo']);
    await expect(session.importFiles([], 'Bad Name')).rejects.toThrow(/namespace/);
  });

  it('imports a structure file for the current target and reports a newer data version', async () => {
    const { session } = await openSession({ plugins: builtInPlugins });
    const piece: StructureTemplateData = {
      size: [1, 1, 1],
      palette: ['minecraft:stone'],
      blocks: [[0, 0, 0, 0]],
    };
    const current = writeNbt(structureTemplateToNbt(piece, defaultTarget.dataVersion));
    const newer = writeNbt(structureTemplateToNbt(piece, defaultTarget.dataVersion + 1));
    const result = await session.importFiles(
      [
        { name: 'Hut.nbt', data: current },
        { name: 'future.nbt', data: newer },
      ],
      'demo',
    );
    expect(result.imported).toEqual(['demo:hut', 'demo:future']);
    expect(result.problems).toEqual([
      expect.objectContaining({
        severity: 'info',
        code: 'structures.newer-data-version',
        elementId: 'demo:future',
      }),
    ]);
  });
});

describe('ProjectSession validators', () => {
  it('collects validators and runs those whose kinds changed', () => {
    const all = collectValidators([...builtInPlugins, testPlugin]);
    expect(all.some((entry) => entry.validator.id === 'test.no-bad-functions')).toBe(true);
    expect(validatorsFor(all, new Set(['minecraft:function'])).map((e) => e.pluginId)).toEqual([
      'test.fakes',
    ]);
    expect(changedKinds(null, null)).toEqual(new Set());
  });

  it('merges validator problems, blocks the export and clears them on undo', async () => {
    const { session } = await openSession();
    session.addElement({
      id: 'demo:bad',
      kind: 'minecraft:function',
      data: { lines: ['say hi'] },
    });
    await session.flushValidation();
    const problem = session.snapshot.problems.find((entry) => entry.code === 'test.bad-function');
    expect(problem).toMatchObject({ severity: 'error', elementId: 'demo:bad', path: '/lines' });
    // The validator saw the session's registry index, which knows the project's functions.
    expect(problem?.message).toContain('known: true');
    expect(session.problemsFor('demo:bad').map((entry) => entry.code)).toContain(
      'test.bad-function',
    );

    const blocked = await session.exportPack('data', 'zip');
    expect(blocked.ok).toBe(false);
    expect(codes(blocked.problems)[0]).toBe('test.bad-function');
    // The resource pack does not hold the function, so it still exports.
    expect((await session.exportPack('resource', 'zip')).ok).toBe(true);

    session.undo();
    await session.flushValidation();
    expect(codes(session.snapshot.problems)).not.toContain('test.bad-function');
    expect((await session.exportPack('resource', 'zip')).ok).toBe(true);
  });

  it('reports a throwing validator as a warning', async () => {
    const { session } = await openSession();
    session.addElement({ id: 'demo:explode', kind: 'minecraft:function' });
    await session.flushValidation();
    expect(session.snapshot.problems).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: ValidatorProblemCodes.failed }),
    );
  });

  it('blocks only on errors of elements in the exported layers', () => {
    const project = {
      name: 'p',
      namespaces: [
        {
          name: 'demo',
          assets: [],
          elements: [
            {
              formatVersion: 1,
              id: 'demo:a' as const,
              kind: 'k',
              data: {},
              meta: { createdAt: '' },
            },
          ],
        },
      ],
    } as unknown as Parameters<typeof blockingValidatorErrors>[1];
    const problems: Problem[] = [
      { severity: 'error', code: 'x', message: 'project-wide' },
      { severity: 'error', code: 'y', message: 'element', elementId: 'demo:a' },
      { severity: 'warning', code: 'z', message: 'warn' },
    ];
    const lowerData = () => [{ layer: 'datapack' as const }];
    expect(codes(blockingValidatorErrors(problems, project, lowerData, ['datapack']))).toEqual([
      'x',
      'y',
    ]);
    expect(codes(blockingValidatorErrors(problems, project, lowerData, ['resourcepack']))).toEqual([
      'x',
    ]);
  });
});

describe('ProjectSession.runPluginExporter', () => {
  it('writes the exporter files into the picked folder', async () => {
    const { session, writes, picks } = await openSession();
    session.addElement({ id: 'demo:hello', kind: 'minecraft:function', data: { lines: ['say'] } });
    const result = await session.runPluginExporter('test-structures');
    expect(result.ok).toBe(true);
    expect(result.location).toBe('/exports/picked');
    expect(picks()).toBe(1);
    expect(writes).toEqual([{ folder: '/exports/picked', names: ['demo/hello.nbt'] }]);
  });

  it('writes into a given folder, and asks nothing when there is nothing to write', async () => {
    const { session, writes, picks } = await openSession();
    const empty = await session.runPluginExporter('structure-nbt');
    expect(empty.ok).toBe(true);
    expect(empty.location).toBeUndefined();
    expect(codes(empty.problems)).toContain('structures.nothing-to-export');
    session.addElement({
      id: 'demo:hut',
      kind: 'minecraft:structure_template',
      data: { size: [1, 1, 1], palette: ['minecraft:stone'], blocks: [[0, 0, 0, 0]] },
    });
    const nbt = await session.runPluginExporter('structure-nbt', '/exports/chosen');
    expect(nbt.ok).toBe(true);
    const schem = await session.runPluginExporter('sponge-schematic', '/exports/chosen');
    expect(schem.ok).toBe(true);
    expect(picks()).toBe(0);
    expect(writes).toEqual([
      { folder: '/exports/chosen', names: ['demo/hut.nbt'] },
      { folder: '/exports/chosen', names: ['demo/hut.schem'] },
    ]);
  });

  it('refuses unknown exporters and is blocked by validator errors', async () => {
    const { session, writes, picks } = await openSession();
    const unknown = await session.runPluginExporter('nope');
    expect(unknown.ok).toBe(false);
    expect(codes(unknown.problems)).toEqual([SessionProblemCodes.unknownExporter]);
    session.addElement({ id: 'demo:bad', kind: 'minecraft:function', data: { lines: ['say'] } });
    const blocked = await session.runPluginExporter('test-structures');
    expect(blocked.ok).toBe(false);
    expect(picks()).toBe(0);
    expect(writes).toEqual([]);
  });
});
