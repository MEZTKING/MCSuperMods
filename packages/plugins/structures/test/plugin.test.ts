import type { Json } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, { structureKinds } from '../src/index';
import { blockingProblems, indexesFor } from './support';

describe('@msm/plugin-structures', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.structures');
    expect(plugin.apiVersion).toBe('^0.8.0');
    expect(Object.isFrozen(plugin)).toBe(true);
  });

  it('contributes the five kinds, two importers, two exporters and five validators', () => {
    expect(plugin.contributes.elementKinds?.map((kind) => kind.id)).toEqual([
      'minecraft:structure_template',
      'minecraft:worldgen/template_pool',
      'minecraft:worldgen/structure',
      'minecraft:worldgen/structure_set',
      'minecraft:worldgen/processor_list',
    ]);
    expect(plugin.contributes.importers?.map((entry) => [entry.id, entry.extensions])).toEqual([
      ['structure-nbt', ['nbt']],
      ['sponge-schematic', ['schem']],
    ]);
    expect(plugin.contributes.exporters?.map((entry) => entry.id)).toEqual([
      'structure-nbt',
      'sponge-schematic',
    ]);
    expect(plugin.contributes.validators?.map((entry) => entry.id)).toEqual([
      'msm.structures.set-spacing',
      'msm.structures.unplaced-structure',
      'msm.structures.pool-empty',
      'msm.structures.jigsaw-target-missing',
      'msm.structures.template-too-large',
    ]);
  });

  it('puts structure template ids in the structure registry, with a structure preview', () => {
    const [template, ...json] = structureKinds;
    expect(template).toMatchObject({
      schema: 'msm:structure_template',
      folder: 'structure',
      registry: 'structure',
      previewKind: 'structure',
    });
    for (const kind of json) {
      expect(kind.registry).toBeUndefined();
      expect(kind.folder).toBe(kind.id.slice('minecraft:'.length));
      expect(kind.schema).toBe(`resource:${kind.folder}`);
    }
  });

  it.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
    'default data of every kind validates and lowers for %s',
    async (_id, bundle) => {
      const indexes = await indexesFor(bundle);
      for (const kind of structureKinds) {
        const data = kind.defaultData as Json;
        expect(blockingProblems(indexes, kind.schema, data), kind.id).toEqual([]);
        const files = kind.lower(
          {
            formatVersion: 1,
            id: 'demo:sample',
            kind: kind.id,
            data,
            meta: { createdAt: '2026-01-01T00:00:00.000Z' },
          },
          bundle.target,
        );
        expect(files, kind.id).toHaveLength(1);
        const [file] = files;
        if (file !== undefined && !(file.contents instanceof Uint8Array)) {
          expect(blockingProblems(indexes, file.schema ?? '', file.contents), kind.id).toEqual([]);
        }
      }
    },
  );
});
