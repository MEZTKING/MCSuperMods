/**
 * The `fabric-content-jar` exporter (ADR 0026): jar layout, determinism, `fabric.mod.json`
 * synthesised or provided, the nested runtime and its options and errors, and GeckoLib for
 * projects with entities (ADR 0029 D4). Uses the test-local `test:raw` kind.
 */
import { createHash } from 'node:crypto';
import { utf8 } from '@msm/core';
import type { Element, Json, Problem } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { needsGeckolib, nestedGeckolibPath } from '../src/fabric-content-jar/index';
import {
  contentJarFileName,
  createFabricContentJarExporter,
  createZipSink,
  defaultFabricModJson,
  ExportProblemCodes,
  type FabricContentJarOptions,
  FabricContentJarProblemCodes,
  nestedRuntimePath,
  RESERVED_MOD_IDS,
  runExport,
  sanitiseModId,
} from '../src/index';
import { element, fakeAsset, indexesFor, meta, project, raw, testRegistry } from './helpers';

const codes = (problems: Problem[]): string[] => problems.map((problem) => problem.code);
const runtimeJar = utf8.encode('PK fake msm_runtime jar bytes');
const geckolibJar = utf8.encode('PK fake GeckoLib jar bytes');
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
const entityDefinition = raw('ruby:entity', {
  path: 'msm/ruby/entity/glow_golem.json',
  layer: 'msm',
  json: { format: 1, type: 'entity' },
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
            label: 'Separate runtime and GeckoLib (for modpacks)',
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

    describe('GeckoLib for entities', () => {
      const facts = () => {
        const geckolib = target.geckolib;
        if (geckolib === undefined) throw new Error('target lacks GeckoLib facts');
        return geckolib;
      };
      const both: FabricContentJarOptions = {
        loadRuntimeJar: async () => runtimeJar,
        loadGeckolibJar: async () => geckolibJar,
      };

      it('leaves a project without entities unchanged and never loads GeckoLib', async () => {
        let loads = 0;
        const elements = [modelElement, recipeLike, definition];
        const plain = await exportJar(elements);
        const withLoader = await exportJar(elements, {
          loadRuntimeJar: async () => runtimeJar,
          loadGeckolibJar: async () => {
            loads++;
            return geckolibJar;
          },
        });
        expect(loads).toBe(0);
        expect(sha256(withLoader.bytes)).toBe(sha256(plain.bytes));
        const written = json(withLoader.entries, 'fabric.mod.json');
        expect(Object.keys(written.depends as Record<string, Json>)).not.toContain(facts().modId);
        expect(withLoader.entries[nestedGeckolibPath(facts())]).toBeUndefined();
      });

      it('depends on and nests GeckoLib when the project has entities', async () => {
        const geckolib = facts();
        const { report, entries } = await exportJar([definition, entityDefinition], both);
        expect(report.ok).toBe(true);
        const geckolibPath = nestedGeckolibPath(geckolib);
        expect(geckolibPath).toBe(`META-INF/jars/${geckolib.fileName}`);
        expect(entries[geckolibPath]).toEqual(geckolibJar);
        expect(entries[nestedRuntimePath(meta.msmVersion)]).toEqual(runtimeJar);
        const written = json(entries, 'fabric.mod.json');
        expect(written.depends).toMatchObject({
          [geckolib.modId]: geckolib.dependency,
          msm_runtime: `>=${meta.msmVersion}`,
        });
        expect(written.jars).toEqual([
          { file: nestedRuntimePath(meta.msmVersion) },
          { file: geckolibPath },
        ]);
        expect(json(entries, 'msm.export.json')).toMatchObject({ fileCount: 5 });
      });

      it('completes a provided fabric.mod.json with GeckoLib', async () => {
        const geckolib = facts();
        const { report, entries } = await exportJar([entityDefinition, modJson], both);
        expect(report.ok).toBe(true);
        const written = json(entries, 'fabric.mod.json');
        expect(written).toMatchObject({
          depends: {
            fabricloader: '>=0.20.1',
            [geckolib.modId]: geckolib.dependency,
            msm_runtime: '>=0.4.0',
          },
          id: 'ruby_mod',
        });
        expect(written.jars).toContainEqual({ file: nestedGeckolibPath(geckolib) });
      });

      it('writes the same bytes for the same input', async () => {
        const first = await exportJar([definition, entityDefinition], both);
        const second = await exportJar([entityDefinition, definition], both);
        expect(sha256(first.bytes)).toBe(sha256(second.bytes));
      });

      it('only depends on GeckoLib with separateRuntime', async () => {
        const geckolib = facts();
        let loads = 0;
        const { report, entries } = await exportJar(
          [entityDefinition],
          {
            loadGeckolibJar: async () => {
              loads++;
              return geckolibJar;
            },
          },
          { separateRuntime: true },
        );
        expect(report.ok).toBe(true);
        expect(loads).toBe(0);
        expect(Object.keys(entries).some((path) => path.startsWith('META-INF/'))).toBe(false);
        const written = json(entries, 'fabric.mod.json');
        expect(written.jars).toBeUndefined();
        expect(written.depends).toMatchObject({
          [geckolib.modId]: geckolib.dependency,
          msm_runtime: `>=${meta.msmVersion}`,
        });
      });

      it('reports export.geckolib-missing when nesting without GeckoLib bytes', async () => {
        const geckolib = facts();
        for (const factory of [
          { loadRuntimeJar: async () => runtimeJar },
          { loadRuntimeJar: async () => runtimeJar, loadGeckolibJar: async () => undefined },
          {
            loadRuntimeJar: async () => runtimeJar,
            loadGeckolibJar: async () => new Uint8Array(),
          },
          {
            loadRuntimeJar: async () => runtimeJar,
            loadGeckolibJar: async (): Promise<Uint8Array> => {
              throw new Error('offline');
            },
          },
        ]) {
          const { report, entries } = await exportJar([entityDefinition], factory);
          expect(report.ok).toBe(false);
          const problem = report.problems.find(
            (entry) => entry.code === ExportProblemCodes.geckolibMissing,
          );
          expect(problem).toMatchObject({ severity: 'error', code: 'export.geckolib-missing' });
          expect(problem?.message).toBe(
            `GeckoLib ${geckolib.version} is needed for animated entities; connect to the internet once so MCSuperMods can download it.`,
          );
          expect(Object.keys(entries)).toEqual([]);
        }
      });

      it('reports export.no-geckolib-target for a target without GeckoLib facts', async () => {
        const { geckolib: _geckolib, ...bare } = target;
        const { report, entries } = await exportJar([entityDefinition], both, {}, 'Ruby', bare);
        expect(report.ok).toBe(false);
        expect(codes(report.problems)).toContain('export.no-geckolib-target');
        expect(Object.keys(entries)).toEqual([]);
        const plain = await exportJar([definition], both, {}, 'Ruby', bare);
        expect(plain.report.ok).toBe(true);
      });
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

  it('prefixes a reserved id with mod_ (ADR 0026 D2)', () => {
    expect(RESERVED_MOD_IDS).toEqual([
      'minecraft',
      'java',
      'fabricloader',
      'fabric-api',
      'msm_runtime',
    ]);
    expect(sanitiseModId('Minecraft')).toBe('mod_minecraft');
    expect(sanitiseModId('Java')).toBe('mod_java');
    expect(sanitiseModId('fabricloader')).toBe('mod_fabricloader');
    expect(sanitiseModId('Fabric-API')).toBe('mod_fabric-api');
    expect(sanitiseModId('MSM Runtime')).toBe('mod_msm_runtime');
    expect(sanitiseModId('minecraft_plus')).toBe('minecraft_plus');
    const fabric = builtInTargets.find((bundle) => bundle.target.fabric !== undefined)?.target
      .fabric;
    if (fabric === undefined) throw new Error('No built-in target has Fabric facts.');
    const json = defaultFabricModJson({
      projectName: 'Java',
      files: [],
      fabric,
      runtimeVersion: '1.0.0',
    });
    expect(json.id).toBe('mod_java');
    expect(json.name).toBe('Java');
    const fromNamespace = defaultFabricModJson({
      projectName: '!!!',
      files: [
        { path: 'data/minecraft/x.json', contents: {}, layer: 'datapack' },
        { path: 'msm/java/item/a.json', contents: {}, layer: 'msm' },
      ],
      fabric,
      runtimeVersion: '1.0.0',
    });
    expect(fromNamespace.id).toBe('mod_java');
  });
});

describe('needsGeckolib', () => {
  it('is true only for msm-layer entity definitions', () => {
    expect(needsGeckolib([])).toBe(false);
    expect(needsGeckolib([{ path: 'msm/ruby/block/a.json', contents: {}, layer: 'msm' }])).toBe(
      false,
    );
    expect(
      needsGeckolib([{ path: 'data/ruby/entity/a.json', contents: {}, layer: 'datapack' }]),
    ).toBe(false);
    expect(
      needsGeckolib([{ path: 'msm/ruby/entity/mobs/a.json', contents: {}, layer: 'msm' }]),
    ).toBe(true);
  });
});

describe('problem codes', () => {
  it('keeps the content jar codes in ExportProblemCodes under the old alias', () => {
    expect(FabricContentJarProblemCodes).toEqual({
      noFabricTarget: ExportProblemCodes.noFabricTarget,
      runtimeMissing: ExportProblemCodes.runtimeMissing,
      invalidModJson: ExportProblemCodes.invalidModJson,
      outsideJarFolders: ExportProblemCodes.outsideJarFolders,
    });
    expect(ExportProblemCodes.noFabricTarget).toBe('export.no-fabric-target');
    expect(ExportProblemCodes.outsideJarFolders).toBe('export.outside-jar-folders');
    expect(ExportProblemCodes.geckolibMissing).toBe('export.geckolib-missing');
    expect(ExportProblemCodes.noGeckolibTarget).toBe('export.no-geckolib-target');
  });
});
