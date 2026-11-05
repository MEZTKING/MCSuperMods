import { createMemoryFileSystem, type Problem } from '@msm/core';
import { definePlugin, type Importer, type Plugin } from '@msm/plugin-api';
import {
  type StructureTemplateData,
  structureTemplateToNbt,
  writeNbt,
} from '@msm/plugin-structures';
import { describe, expect, it } from 'vitest';
import { builtInPlugins } from '../src/renderer/src/plugins/built-in';
import { SessionProblemCodes } from '../src/renderer/src/session/project-session';
import { defaultTarget, newSession } from './session-fixture';

/** Imports a `.fake` file as a function element; throws for `boom.fake`. */
const fakeImporter: Importer = {
  id: 'fake-function',
  displayName: 'Fake function (.fake)',
  extensions: ['fake'],
  async import(file, namespace) {
    if (file.name === 'boom.fake') throw new Error('Unreadable.');
    return {
      elements: [
        {
          formatVersion: 1,
          id: `${namespace}:fake`,
          kind: 'minecraft:function',
          data: { lines: ['say fake'] },
          meta: { createdAt: '2020-01-01T00:00:00.000Z' },
        },
      ],
      assets: [],
      problems: [],
    };
  },
};

const testPlugin: Plugin = definePlugin({
  id: 'test.replace',
  apiVersion: '^0.7.0',
  contributes: { importers: [fakeImporter] },
});

async function openSession() {
  const { session } = newSession(
    createMemoryFileSystem(),
    {},
    { plugins: [...builtInPlugins, testPlugin] },
  );
  await session.newProject();
  return session;
}

const piece = (block: string, size: [number, number, number]): StructureTemplateData => ({
  size,
  palette: [block],
  blocks: [[0, 0, 0, 0]],
});

const nbtOf = (data: StructureTemplateData, dataVersion = defaultTarget.dataVersion) =>
  writeNbt(structureTemplateToNbt(data, dataVersion));

const codes = (problems: readonly Problem[]) => problems.map((problem) => problem.code);

const dataOf = (session: Awaited<ReturnType<typeof openSession>>, id: string) =>
  session.snapshot.project?.namespaces
    .flatMap((namespace) => namespace.elements)
    .find((element) => element.id === id);

describe('ProjectSession.replaceElementFromFile', () => {
  it('replaces a structure template in place as one undo step', async () => {
    const session = await openSession();
    session.addElement({
      id: 'demo:hut',
      kind: 'minecraft:structure_template',
      data: piece('minecraft:stone', [1, 1, 1]) as never,
    });
    const before = dataOf(session, 'demo:hut');
    const result = await session.replaceElementFromFile('demo:hut', {
      name: 'Other Name.nbt',
      data: nbtOf(piece('minecraft:oak_planks', [2, 1, 1])),
    });
    expect(result).toEqual({ replaced: true, problems: [] });
    const after = dataOf(session, 'demo:hut');
    expect(after?.data).toMatchObject({ size: [2, 1, 1], palette: ['minecraft:oak_planks'] });
    // The id and metadata are kept; nothing else was added.
    expect(after?.meta).toEqual(before?.meta);
    expect(
      session.snapshot.project?.namespaces
        .flatMap((namespace) => namespace.elements)
        .filter((element) => element.kind === 'minecraft:structure_template')
        .map((element) => element.id),
    ).toEqual(['demo:hut']);
    expect(session.snapshot.undoLabel).toBe('Replace demo:hut from Other Name.nbt');
    session.undo();
    expect(dataOf(session, 'demo:hut')?.data).toEqual(before?.data);
  });

  it('passes the importer problems through, such as a newer data version', async () => {
    const session = await openSession();
    session.addElement({ id: 'demo:hut', kind: 'minecraft:structure_template' });
    const result = await session.replaceElementFromFile('demo:hut', {
      name: 'hut.nbt',
      data: nbtOf(piece('minecraft:stone', [1, 1, 1]), defaultTarget.dataVersion + 1),
    });
    expect(result.replaced).toBe(true);
    expect(codes(result.problems)).toEqual(['structures.newer-data-version']);
  });

  it('changes nothing for an unsupported, failing or wrong-kind file', async () => {
    const session = await openSession();
    session.addElement({ id: 'demo:hut', kind: 'minecraft:structure_template' });
    const before = dataOf(session, 'demo:hut')?.data;
    const label = session.snapshot.undoLabel;
    const unsupported = await session.replaceElementFromFile('demo:hut', {
      name: 'notes.txt',
      data: new Uint8Array([1]),
    });
    const failed = await session.replaceElementFromFile('demo:hut', {
      name: 'broken.nbt',
      data: new Uint8Array([1, 2, 3]),
    });
    const thrown = await session.replaceElementFromFile('demo:hut', {
      name: 'boom.fake',
      data: new Uint8Array(),
    });
    const wrongKind = await session.replaceElementFromFile('demo:hut', {
      name: 'piece.fake',
      data: new Uint8Array(),
    });
    expect(unsupported.replaced).toBe(false);
    expect(codes(unsupported.problems)).toEqual([SessionProblemCodes.importUnsupported]);
    expect(failed.replaced).toBe(false);
    expect(failed.problems.some((problem) => problem.severity === 'error')).toBe(true);
    expect(thrown).toEqual({
      replaced: false,
      problems: [expect.objectContaining({ code: SessionProblemCodes.importFailed })],
    });
    expect(wrongKind).toEqual({
      replaced: false,
      problems: [expect.objectContaining({ code: SessionProblemCodes.importKindMismatch })],
    });
    expect(dataOf(session, 'demo:hut')?.data).toEqual(before);
    expect(session.snapshot.undoLabel).toBe(label);
  });

  it('throws for an unknown element', async () => {
    const session = await openSession();
    await expect(
      session.replaceElementFromFile('demo:nothing', { name: 'a.nbt', data: new Uint8Array() }),
    ).rejects.toThrow(/no element demo:nothing/);
  });
});
