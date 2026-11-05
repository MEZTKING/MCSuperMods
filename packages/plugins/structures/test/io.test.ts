import type { Element, ExporterInput, OutputFile, Problem } from '@msm/plugin-api';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  elementPathFor,
  importStructureFile,
  readNbt,
  type StructureTemplateData,
  schemFromStructureTemplate,
  spongeSchematicExporter,
  spongeSchematicImporter,
  structureNbtExporter,
  structureNbtImporter,
  structureTemplateFromSchem,
  structureTemplateKind,
  structureTemplateToNbt,
  templatePoolKind,
  writeNbt,
} from '../src/index';

const target = (builtInTargets[0] as TargetBundle).target;

const PIECE: StructureTemplateData = {
  size: [2, 1, 1],
  palette: ['minecraft:stone', 'minecraft:jigsaw[orientation=north_up]'],
  blocks: [
    [0, 0, 0, 0],
    [1, 0, 0, 1],
  ],
  jigsaws: [
    {
      pos: [1, 0, 0],
      pool: 'ex:pool',
      name: 'ex:a',
      target: 'ex:b',
      final_state: 'minecraft:stone',
    },
  ],
};

const element = (id: `${string}:${string}`, kind: string, data: unknown): Element => ({
  formatVersion: 1,
  id,
  kind,
  data: data as Element['data'],
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
});

describe('importers', () => {
  it('sanitises file names into element paths', () => {
    expect(elementPathFor('My Hut (1).nbt')).toBe('my_hut_1_');
    expect(elementPathFor('dir/sub/piece.v2.schem')).toBe('piece.v2');
    expect(elementPathFor('???.nbt')).toBe('_');
    expect(elementPathFor('...')).toBe('structure');
  });

  it('imports a vanilla .nbt file into a structure template element', async () => {
    const bytes = writeNbt(structureTemplateToNbt(PIECE, target.dataVersion));
    const result = await structureNbtImporter.import({ name: 'Piece.nbt', bytes }, 'ex');
    expect(result.assets).toEqual([]);
    expect(result.problems).toEqual([]);
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]).toMatchObject({
      id: 'ex:piece',
      kind: 'minecraft:structure_template',
      data: PIECE,
    });
  });

  it('imports a .schem file and reports a newer data version when the target is given', async () => {
    const bytes = writeNbt(schemFromStructureTemplate(PIECE, target.dataVersion + 1).root);
    const plain = await spongeSchematicImporter.import({ name: 'piece.schem', bytes }, 'ex');
    expect(plain.elements[0]?.data).toEqual(PIECE);
    const checked = importStructureFile({ name: 'piece.schem', bytes }, 'ex', 'schem', {
      targetDataVersion: target.dataVersion,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(checked.problems).toEqual([
      expect.objectContaining({
        severity: 'info',
        code: 'structures.newer-data-version',
        elementId: 'ex:piece',
        file: 'piece.schem',
      }),
    ]);
    expect(checked.elements[0]?.meta.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('reports an unreadable file as an error and adds nothing', async () => {
    const result = await structureNbtImporter.import(
      { name: 'broken.nbt', bytes: new Uint8Array([1, 2, 3]) },
      'ex',
    );
    expect(result.elements).toEqual([]);
    expect(result.problems.map((problem) => [problem.code, problem.severity])).toEqual([
      ['structures.import-failed', 'error'],
    ]);
  });
});

function memorySink() {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    sink: { writeFile: async (path: string, bytes: Uint8Array) => void files.set(path, bytes) },
  };
}

function exportInput(files: OutputFile[]): {
  input: ExporterInput;
  written: Map<string, Uint8Array>;
  problems: Problem[];
} {
  const { files: written, sink } = memorySink();
  const problems: Problem[] = [];
  return {
    written,
    problems,
    input: {
      projectName: 'Test',
      target,
      files,
      sink,
      problems: { report: (problem) => void problems.push(problem) },
      meta: { msmVersion: '0.0.0', plugins: ['msm.structures'] },
      options: {},
    },
  };
}

describe('exporters', () => {
  const lowered = [
    ...structureTemplateKind.lower(
      element('ex:houses/hut', structureTemplateKind.id, PIECE),
      target,
    ),
    ...structureTemplateKind.lower(element('other:path', structureTemplateKind.id, PIECE), target),
    ...templatePoolKind.lower(
      element('ex:pool', templatePoolKind.id, templatePoolKind.defaultData),
      target,
    ),
  ];

  it('structure outputs are gzip bytes', () => {
    const nbt = lowered.filter((file) => file.path.endsWith('.nbt'));
    expect(nbt).toHaveLength(2);
    for (const file of nbt) {
      expect(file.contents).toBeInstanceOf(Uint8Array);
      expect([...(file.contents as Uint8Array).slice(0, 2)]).toEqual([0x1f, 0x8b]);
    }
  });

  it('structure-nbt writes <ns>/<path>.nbt for every structure output', async () => {
    const { input, written, problems } = exportInput(lowered);
    await structureNbtExporter.run(input);
    expect([...written.keys()]).toEqual(['ex/houses/hut.nbt', 'other/path.nbt']);
    expect(written.get('ex/houses/hut.nbt')).toEqual(lowered[0]?.contents);
    expect(problems).toEqual([]);
  });

  it('sponge-schematic writes <ns>/<path>.schem Version 3 files', async () => {
    const { input, written, problems } = exportInput(lowered);
    await spongeSchematicExporter.run(input);
    expect([...written.keys()]).toEqual(['ex/houses/hut.schem', 'other/path.schem']);
    const back = structureTemplateFromSchem(
      readNbt(written.get('other/path.schem') as Uint8Array).root,
    );
    expect(back.version).toBe(3);
    expect(back.dataVersion).toBe(target.dataVersion);
    expect(back.data).toEqual(PIECE);
    expect(problems).toEqual([]);
  });

  it('reports when there is nothing to export', async () => {
    const { input, written, problems } = exportInput(
      lowered.filter((f) => !f.path.endsWith('.nbt')),
    );
    await structureNbtExporter.run(input);
    expect(written.size).toBe(0);
    expect(problems.map((problem) => problem.code)).toEqual(['structures.nothing-to-export']);
  });
});
