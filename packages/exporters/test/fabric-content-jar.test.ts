/**
 * The `fabric-content-jar` exporter (ADR 0026): jar layout, determinism, `fabric.mod.json`
 * synthesised or provided, the nested runtime and its options and errors. Uses the
 * test-local `test:raw` kind.
 */
import { createHash } from 'node:crypto';
import { utf8 } from '@msm/core';
import type { Element, Json, Problem } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  contentJarFileName,
  createFabricContentJarExporter,
  createZipSink,
  type FabricContentJarOptions,
  nestedRuntimePath,
  runExport,
  sanitiseModId,
} from '../src/index';
import { element, fakeAsset, indexesFor, meta, project, raw, testRegistry } from './helpers';

const codes = (problems: Problem[]): string[] => problems.map((problem) => problem.code);
const runtimeJar = utf8.encode('PK fake msm_runtime jar bytes');
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const modelElement = element('test:model', 'ruby:block/ruby_block', {
  parent: 'minecraft:block/cube_all',
  textures: { all: 'ruby:block/ruby_block' },
});
const recipeLike = raw('ruby:tag', {
  path: 'data/ruby/tags/item/gems.json',
  layer: 'datapack',
  json: { values: ['minecraft:diamond'] },
});
const definition = raw('ruby:def', {
  path: 'msm/ruby/block/ruby_block.json',
  layer: 'msm',
  json: { format: 1, type: 'block' },
});
const packMcmeta = raw('ruby:pack', {
  path: 'pack.mcmeta',
  layer: 'datapack',
  json: { pack: { description: 'x', pack_format: 1 } },
});
const modJson = raw('ruby:mod', {
  path: 'fabric.mod.json',
  layer: 'msm',
  json: {
    authors: ['Ada'],
    depends: { fabricloader: '>=0.20.1', msm_runtime: '>=0.4.0' },
    description: 'Rubies.',
    environment: '*',
    id: 'ruby_mod',
    license: 'MIT',
    name: 'Ruby Mod',
    schemaVersion: 1,
    version: '2.3.0',
  },
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'fabric content jar (%s)',
  (_id, bundle) => {
    const { target } = bundle;

    async function exportJar(
      elements: Element[],
      factory: FabricContentJarOptions = { loadRuntimeJar: async () => runtimeJar },
      options: Record<string, Json> = {},
      name = 'Ruby Pack',
      exportTarget = target,
    ) {
      const { schemaIndex, registries } = await indexesFor(bundle);
      const sink = createZipSink();
      const report = await runExport({
        project: project(elements, [], name),
        registry: testRegistry(),
        target: exportTarget,
        schemaIndex,
        registries,
        exporter: createFabricContentJarExporter(factory),
        sink,
        readAsset: fakeAsset,
        meta,
        options,
      });
      const bytes = sink.finish();
      return { report, bytes, entries: unzipSync(bytes) };
    }

    const json = (entries: Record<string, Uint8Array>, path: string): Record<string, Json> =>
      JSON.parse(utf8.decode(entries[path] as Uint8Array)) as Record<string, Json>;

    it('declares its layers and the separate runtime option', () => {
      const exporter = createFabricContentJarExporter();
      expect(exporter).toMatchObject({
        id: 'fabric-content-jar',
        layers: ['resourcepack', 'datapack', 'msm'],
        options: [
          {
            id: 'separateRuntime',
            label: 'Separate runtime (for modpacks)',
            type: 'boolean',
            default: false,
          },
        ],
      });
    });

    it('lays out assets/, data/, msm/, fabric.mod.json and the nested runtime', async () => {
      const { report, entries } = await exportJar([
        modelElement,
        recipeLike,
        definition,
        packMcmeta,
      ]);
      expect(report.ok).toBe(true);
      const runtimePath = nestedRuntimePath(meta.msmVersion);
      expect(Object.keys(entries).sort()).toEqual(
        [
          `assets/ruby/${target.folders.resource.model}/block/ruby_block.json`,
          'data/ruby/tags/item/gems.json',
          'fabric.mod.json',
          'msm/ruby/block/ruby_block.json',
          runtimePath,
          'msm.export.json',
        ].sort(),
      );
      expect(entries[runtimePath]).toEqual(runtimeJar);
      expect(entries['pack.mcmeta']).toBeUndefined();
      expect(codes(report.problems)).toContain('export.outside-jar-folders');
      expect(json(entries, 'msm.export.json')).toMatchObject({
        exporter: 'fabric-content-jar',
        fileCount: 5,
        target: target.id,
      });
    });

    it('writes the same bytes for the same input', async () => {
      const elements = [modelElement, recipeLike, definition];
      const first = await exportJar(elements);
      const second = await exportJar([...elements].reverse());
      expect(sha256(first.bytes)).toBe(sha256(second.bytes));
    });

    it('synthesises fabric.mod.json from the project name and the target', async () => {
      const { report, entries } = await exportJar([definition], undefined, {}, 'Ruby Pack!');
      expect(report.ok).toBe(true);
      const fabric = target.fabric;
      if (fabric === undefined) throw new Error('target lacks Fabric facts');
      expect(json(entries, 'fabric.mod.json')).toEqual({
        depends: {
          'fabric-api': '*',
          fabricloader: `>=${fabric.loader}`,
          minecraft: fabric.minecraftDependency,
          msm_runtime: `>=${meta.msmVersion}`,
        },
        environment: '*',
        id: 'ruby_pack',
        jars: [{ file: nestedRuntimePath(meta.msmVersion) }],
        name: 'Ruby Pack!',
        schemaVersion: 1,
        version: '1.0.0',
      });
    });

    it('falls back to the namespace when the project name gives no mod id', async () => {
      const { entries } = await exportJar([definition], undefined, {}, '123');
      expect(json(entries, 'fabric.mod.json').id).toBe('ruby');
    });

    it('takes fabric.mod.json from the msm layer and adds the jars entry', async () => {
      const { report, entries } = await exportJar([definition, modJson], {
        loadRuntimeJar: async () => runtimeJar,
        runtimeVersion: '0.4.1',
      });
      expect(report.ok).toBe(true);
      const written = json(entries, 'fabric.mod.json');
      expect(written).toMatchObject({
        authors: ['Ada'],
        depends: { fabricloader: '>=0.20.1', msm_runtime: '>=0.4.0' },
        id: 'ruby_mod',
        jars: [{ file: 'META-INF/jars/msm_runtime-0.4.1.jar' }],
        license: 'MIT',
        version: '2.3.0',
      });
      expect(entries['META-INF/jars/msm_runtime-0.4.1.jar']).toEqual(runtimeJar);
    });

    it('omits the runtime and the jars field with separateRuntime', async () => {
      let loads = 0;
      const { report, entries } = await exportJar(
        [definition],
        {
          loadRuntimeJar: async () => {
            loads++;
            return runtimeJar;
          },
        },
        { separateRuntime: true },
      );
      expect(report.ok).toBe(true);
      expect(loads).toBe(0);
      expect(Object.keys(entries).some((path) => path.startsWith('META-INF/'))).toBe(false);
      const written = json(entries, 'fabric.mod.json');
      expect(written.jars).toBeUndefined();
      expect(written.depends).toMatchObject({ msm_runtime: `>=${meta.msmVersion}` });
    });

    it('reports export.runtime-missing when nesting without runtime bytes', async () => {
      for (const factory of [
        {},
        { loadRuntimeJar: async () => undefined },
        {
          loadRuntimeJar: async (): Promise<Uint8Array> => {
            throw new Error('no such file');
          },
        },
      ]) {
        const { report, entries } = await exportJar([definition], factory);
        expect(report.ok).toBe(false);
        expect(codes(report.problems)).toContain('export.runtime-missing');
        expect(Object.keys(entries)).toEqual([]);
      }
    });

    it('reports export.no-fabric-target for a target without Fabric facts', async () => {
      const { fabric: _fabric, ...bare } = target;
      const { report, entries } = await exportJar([definition], undefined, {}, 'Ruby', bare);
      expect(report.ok).toBe(false);
      expect(codes(report.problems)).toContain('export.no-fabric-target');
      expect(Object.keys(entries)).toEqual([]);
    });

    it('rejects lowered files at reserved paths', async () => {
      const nested = raw('ruby:nested', {
        path: 'META-INF/jars/other.jar',
        layer: 'msm',
        text: 'x',
      });
      const { report } = await exportJar([definition, nested]);
      expect(report.ok).toBe(false);
      expect(codes(report.problems)).toContain('export.reserved-path');
    });
  },
);

describe('mod ids', () => {
  it('sanitises free text to a Fabric mod id', () => {
    expect(sanitiseModId('Ruby Pack')).toBe('ruby_pack');
    expect(sanitiseModId('  9 Lives - Cats ')).toBe('lives_-_cats');
    expect(sanitiseModId('x')).toBeUndefined();
    expect(sanitiseModId('123')).toBeUndefined();
    expect(sanitiseModId('a'.repeat(80))).toHaveLength(64);
    expect(contentJarFileName('ruby_pack')).toBe('ruby_pack.jar');
  });
});
