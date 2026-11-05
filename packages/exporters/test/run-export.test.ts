import { utf8 } from '@msm/core';
import type { Exporter, ExporterInput, Json, Problem } from '@msm/plugin-api';
import { validateJson } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  createMemorySink,
  defaultResourcePackMcmeta,
  type ExportRequest,
  exportManifest,
  packFileName,
  resolveExporterOptions,
  runExport,
  vanillaPacksExporter,
} from '../src/index';
import { element, fakeAsset, indexesFor, meta, project, raw, testRegistry } from './helpers';

const codes = (problems: Problem[]): string[] => problems.map((problem) => problem.code);
const errors = (problems: Problem[]): Problem[] =>
  problems.filter((problem) => problem.severity === 'error');
const text = (bytes: Uint8Array | undefined): string => utf8.decode(bytes as Uint8Array);

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'runExport (%s)',
  (_id, bundle) => {
    const { target } = bundle;
    const models = target.folders.resource.model;

    async function request(
      overrides: Partial<ExportRequest> & Pick<ExportRequest, 'project'>,
    ): Promise<ExportRequest & { sink: ReturnType<typeof createMemorySink> }> {
      const { schemaIndex, registries } = await indexesFor(bundle);
      return {
        registry: testRegistry(),
        target,
        schemaIndex,
        registries,
        exporter: vanillaPacksExporter,
        readAsset: fakeAsset,
        meta,
        ...overrides,
        sink: createMemorySink(),
      };
    }

    const rubyModel = element('test:model', 'ruby:block/ruby', {
      parent: 'minecraft:block/cube_all',
      textures: { all: 'ruby:block/ruby' },
    });

    it('exports a valid project, synthesising pack.mcmeta and writing the manifest last', async () => {
      const req = await request({
        project: project(
          [rubyModel],
          [{ path: 'textures/block/ruby.png', mediaType: 'image/png' }],
        ),
      });
      const report = await runExport(req);
      expect(errors(report.problems)).toEqual([]);
      expect(report.ok).toBe(true);
      expect(report.files).toEqual([
        `assets/ruby/${models}/block/ruby.json`,
        'assets/ruby/textures/block/ruby.png',
        'pack.mcmeta',
        'msm.export.json',
      ]);
      const written = req.sink.files();
      expect(JSON.parse(text(written.get('pack.mcmeta')))).toEqual(
        defaultResourcePackMcmeta('Ruby Pack', target),
      );
      expect(text(written.get('assets/ruby/textures/block/ruby.png'))).toBe(
        'asset ruby/textures/block/ruby.png',
      );
      expect(text(written.get(`assets/ruby/${models}/block/ruby.json`))).toBe(
        '{\n  "parent": "minecraft:block/cube_all",\n  "textures": {\n    "all": "ruby:block/ruby"\n  }\n}\n',
      );
    });

    it('writes the manifest without timestamps', async () => {
      const req = await request({ project: project([rubyModel]) });
      await runExport(req);
      const manifest = JSON.parse(text(req.sink.files().get('msm.export.json')));
      expect(manifest).toEqual(
        exportManifest({ target, meta, exporterId: 'vanilla-packs', fileCount: 2 }),
      );
      expect(manifest).toEqual({
        exporter: 'vanilla-packs',
        fileCount: 2,
        formatVersion: 1,
        minecraft: target.mcVersion,
        msmVersion: '0.1.0',
        plugins: ['msm.resourcepack'],
        target: target.id,
      });
    });

    it('sorts and de-duplicates plugins in the manifest', () => {
      const manifest = exportManifest({
        target,
        meta: { msmVersion: '1', plugins: ['b', 'a', 'b'] },
        exporterId: 'x',
        fileCount: 0,
      });
      expect(manifest.plugins).toEqual(['a', 'b']);
    });

    it('synthesises a pack.mcmeta that satisfies the pack schema', async () => {
      const { schemaIndex } = await indexesFor(bundle);
      const problems = validateJson(
        defaultResourcePackMcmeta('Ruby Pack', target),
        schemaIndex.resolve('::java::pack::Pack'),
      );
      expect(problems).toEqual([]);
    });

    it('keeps a pack.mcmeta the project lowers', async () => {
      const mcmeta = {
        pack: { description: 'Custom', pack_format: target.packFormats.resource.major },
      };
      const req = await request({
        project: project([
          raw('ruby:pack', {
            path: 'pack.mcmeta',
            layer: 'resourcepack',
            json: mcmeta,
            schema: '::java::pack::Pack',
          }),
        ]),
      });
      const report = await runExport(req);
      expect(report.ok).toBe(true);
      expect(JSON.parse(text(req.sink.files().get('pack.mcmeta')))).toEqual(mcmeta);
    });

    it('blocks on invalid lowered JSON and writes nothing', async () => {
      const req = await request({
        project: project([element('test:model', 'ruby:block/bad', { parent: 5 })]),
      });
      const report = await runExport(req);
      expect(report.ok).toBe(false);
      expect(report.files).toEqual([]);
      expect(req.sink.files().size).toBe(0);
      const [problem] = errors(report.problems);
      expect(problem).toMatchObject({
        code: 'schema.type-mismatch',
        file: `assets/ruby/${models}/block/bad.json`,
        path: '/parent',
      });
    });

    it('blocks on bytes that are not JSON when a schema is named', async () => {
      const req = await request({
        project: project([
          raw('ruby:x', {
            path: 'assets/ruby/lang/x.json',
            layer: 'resourcepack',
            text: '{',
            schema: 'resource:lang',
          }),
        ]),
      });
      const report = await runExport(req);
      expect(report.ok).toBe(false);
      expect(codes(errors(report.problems))).toEqual(['export.invalid-json']);
    });

    it('validates JSON bytes against the named schema', async () => {
      const req = await request({
        project: project([
          raw('ruby:x', {
            path: 'assets/ruby/lang/x.json',
            layer: 'resourcepack',
            text: '{"a":1}',
            schema: 'resource:lang',
          }),
        ]),
      });
      const report = await runExport(req);
      expect(report.ok).toBe(false);
      expect(errors(report.problems)[0]?.code).toMatch(/^schema\./);
    });

    it('blocks on an unknown schema', async () => {
      const req = await request({
        project: project([
          raw('ruby:x', {
            path: 'assets/ruby/x.json',
            layer: 'resourcepack',
            json: {},
            schema: '::no::Such',
          }),
        ]),
      });
      const report = await runExport(req);
      expect(report.ok).toBe(false);
      expect(codes(errors(report.problems))).toEqual(['export.unknown-schema']);
    });

    it.each(['../escape.json', '/abs.json', 'assets\\x.json', 'assets//x.json', 'assets/./x.json'])(
      'rejects the unsafe output path %j',
      async (path) => {
        const req = await request({
          project: project([raw('ruby:x', { path, layer: 'resourcepack', json: {} })]),
        });
        const report = await runExport(req);
        expect(report.ok).toBe(false);
        expect(report.problems).toContainEqual(
          expect.objectContaining({ code: 'export.unsafe-path', file: path, severity: 'error' }),
        );
        expect(req.sink.files().size).toBe(0);
      },
    );

    it('passes allowed assets through and skips the rest', async () => {
      const req = await request({
        project: project(
          [],
          [
            { path: 'textures/item/ruby.png', mediaType: 'image/png' },
            { path: 'sounds/ruby/chime.ogg', mediaType: 'audio/ogg' },
            { path: 'font/ruby.json', mediaType: 'application/json' },
            { path: 'texts/credits.txt', mediaType: 'text/plain' },
            { path: 'models/block/raw.json', mediaType: 'application/json' },
            { path: 'readme.txt', mediaType: 'text/plain' },
          ],
        ),
      });
      const report = await runExport(req);
      expect(report.ok).toBe(true);
      expect(report.files).toEqual([
        'assets/ruby/font/ruby.json',
        'assets/ruby/sounds/ruby/chime.ogg',
        'assets/ruby/texts/credits.txt',
        'assets/ruby/textures/item/ruby.png',
        'pack.mcmeta',
        'msm.export.json',
      ]);
      const skipped = report.problems.filter((problem) => problem.code === 'export.asset-skipped');
      expect(skipped.map((problem) => [problem.severity, problem.file])).toEqual([
        ['info', 'assets/ruby/models/block/raw.json'],
        ['info', 'assets/ruby/readme.txt'],
      ]);
    });

    it('blocks when an asset cannot be read or has an unsafe path', async () => {
      const req = await request({
        project: project(
          [],
          [
            { path: 'textures/missing.png', mediaType: 'image/png' },
            { path: 'textures/../../escape.png', mediaType: 'image/png' },
          ],
        ),
        readAsset: async (_ns, path) => {
          throw new Error(`no such file ${path}`);
        },
      });
      const report = await runExport(req);
      expect(report.ok).toBe(false);
      expect(codes(errors(report.problems)).sort()).toEqual([
        'export.asset-read-failed',
        'export.unsafe-path',
      ]);
      expect(req.sink.files().size).toBe(0);
    });

    it('reports a conflict between a lowered file and an asset', async () => {
      const req = await request({
        project: project(
          [
            raw('ruby:x', {
              path: 'assets/ruby/textures/block/ruby.png',
              layer: 'resourcepack',
              text: 'x',
            }),
          ],
          [{ path: 'textures/block/ruby.png', mediaType: 'image/png' }],
        ),
      });
      const report = await runExport(req);
      expect(report.ok).toBe(false);
      expect(report.problems).toContainEqual(
        expect.objectContaining({
          code: 'export.conflict',
          file: 'assets/ruby/textures/block/ruby.png',
        }),
      );
    });

    it('reports lowering conflicts and unknown kinds from the lowering driver', async () => {
      const req = await request({
        project: project([
          raw('ruby:a', { path: 'assets/ruby/x.json', layer: 'resourcepack', json: {} }),
          raw('ruby:b', { path: 'assets/ruby/x.json', layer: 'resourcepack', json: {} }),
          element('test:missing', 'ruby:c', {}),
        ]),
      });
      const report = await runExport(req);
      expect(report.ok).toBe(false);
      expect(codes(errors(report.problems)).sort()).toEqual([
        'lowering.conflict',
        'lowering.unknown-kind',
      ]);
      expect(req.sink.files().size).toBe(0);
    });

    it('merges mergeable lowered files and validates the merged file', async () => {
      const lang = `assets/ruby/${target.folders.resource.lang}/en_us.json`;
      const schema = '::java::assets::lang::Lang';
      const req = await request({
        project: project([
          raw('ruby:b', {
            path: lang,
            layer: 'resourcepack',
            json: { 'item.ruby.b': 'B' },
            schema,
            merge: 'object',
          }),
          raw('ruby:a', {
            path: lang,
            layer: 'resourcepack',
            json: { 'item.ruby.a': 'A' },
            schema,
            merge: 'object',
          }),
        ]),
      });
      const report = await runExport(req);
      expect(errors(report.problems)).toEqual([]);
      expect(report.ok).toBe(true);
      expect(JSON.parse(text(req.sink.files().get(lang)))).toEqual({
        'item.ruby.a': 'A',
        'item.ruby.b': 'B',
      });
      const captured: ExporterInput[] = [];
      const capture: Exporter = {
        id: 'capture',
        displayName: 'Capture',
        layers: ['resourcepack'],
        async run(input) {
          captured.push(input);
        },
      };
      const second = await runExport({ ...req, exporter: capture });
      expect(second.ok).toBe(true);
      const file = captured[0]?.files.find((entry) => entry.path === lang);
      expect(file?.contents).toEqual({ 'item.ruby.a': 'A', 'item.ruby.b': 'B' });
      expect(file?.merge).toBe('object');
    });

    it('blocks the export on a merge conflict', async () => {
      const tag = `data/ruby/${target.folders.data.tags}/block/x.json`;
      const req = await request({
        exporter: { ...vanillaPacksExporter, layers: ['datapack'] },
        project: project([
          raw('ruby:a', {
            path: 'assets/ruby/x.json',
            layer: 'resourcepack',
            json: { k: 'a' },
            merge: 'object',
          }),
          raw('ruby:b', {
            path: 'assets/ruby/x.json',
            layer: 'resourcepack',
            json: { k: 'b' },
            merge: 'object',
          }),
          raw('ruby:c', { path: tag, layer: 'datapack', json: { values: [] }, merge: 'tag' }),
          raw('ruby:d', { path: tag, layer: 'datapack', json: { values: [] } }),
        ]),
      });
      const report = await runExport(req);
      expect(report.ok).toBe(false);
      expect(codes(errors(report.problems))).toEqual([
        'lowering.merge-conflict',
        'lowering.conflict',
      ]);
      expect(req.sink.files().size).toBe(0);
    });

    it('passes exporter options with defaults filled in', async () => {
      const captured: Record<string, Json>[] = [];
      const optioned: Exporter = {
        id: 'optioned',
        displayName: 'Optioned',
        layers: ['resourcepack'],
        options: [
          { id: 'separateRuntime', label: 'Separate runtime', type: 'boolean', default: false },
          { id: 'compress', label: 'Compress', type: 'boolean', default: true },
          { id: 'verbose', label: 'Verbose', type: 'boolean', default: false },
        ],
        async run(input) {
          captured.push(input.options);
        },
      };
      const plain: Exporter = {
        id: 'plain',
        displayName: 'Plain',
        layers: ['resourcepack'],
        async run(input) {
          captured.push(input.options);
        },
      };
      await runExport(await request({ project: project([]), exporter: optioned }));
      await runExport(
        await request({
          project: project([]),
          exporter: optioned,
          options: { separateRuntime: true, compress: 'yes', unknown: true },
        }),
      );
      await runExport(await request({ project: project([]), exporter: plain, options: { a: 1 } }));
      expect(captured).toEqual([
        { separateRuntime: false, compress: true, verbose: false },
        { separateRuntime: true, compress: true, verbose: false },
        {},
      ]);
    });

    it('resolves exporter options directly', () => {
      expect(resolveExporterOptions(undefined)).toEqual({});
      expect(
        resolveExporterOptions(
          [{ id: 'a', label: 'A', description: 'An option.', type: 'boolean', default: true }],
          { a: false },
        ),
      ).toEqual({ a: false });
    });

    it('leaves out files of layers the exporter does not package', async () => {
      const req = await request({
        project: project([
          raw('ruby:d', {
            path: 'data/ruby/recipe/x.json',
            layer: 'datapack',
            json: { nonsense: true },
            schema: '::no::Such',
          }),
        ]),
      });
      const report = await runExport(req);
      expect(report.ok).toBe(true);
      expect(report.files).toEqual(['pack.mcmeta', 'msm.export.json']);
      expect(report.problems).toEqual([
        expect.objectContaining({ code: 'export.layer-skipped', severity: 'info' }),
      ]);
    });

    it('refuses a lowered file at the manifest path', async () => {
      const req = await request({
        project: project([
          raw('ruby:m', { path: 'msm.export.json', layer: 'resourcepack', json: {} }),
        ]),
      });
      const report = await runExport(req);
      expect(report.ok).toBe(false);
      expect(codes(errors(report.problems))).toEqual(['export.reserved-path']);
      const manifest = JSON.parse(text(req.sink.files().get('msm.export.json')));
      expect(manifest.exporter).toBe('vanilla-packs');
    });

    it('turns an exporter throw into export.failed', async () => {
      const broken: Exporter = {
        id: 'broken',
        displayName: 'Broken',
        layers: ['resourcepack'],
        async run(input) {
          await input.sink.writeFile('first.txt', new Uint8Array());
          throw new Error('disk full');
        },
      };
      const req = await request({ project: project([]), exporter: broken });
      const report = await runExport(req);
      expect(report.ok).toBe(false);
      expect(report.files).toEqual(['first.txt']);
      expect(report.problems).toEqual([
        expect.objectContaining({ code: 'export.failed', message: 'Broken failed: disk full' }),
      ]);
    });

    it('treats an exporter writing to an unsafe path as a failure', async () => {
      const escaping: Exporter = {
        id: 'escaping',
        displayName: 'Escaping',
        layers: ['resourcepack'],
        async run(input) {
          await input.sink.writeFile('../outside.txt', new Uint8Array());
        },
      };
      const req = await request({ project: project([]), exporter: escaping });
      const report = await runExport(req);
      expect(report.ok).toBe(false);
      expect(codes(report.problems)).toEqual(['export.failed']);
      expect(req.sink.files().size).toBe(0);
    });

    it('names the archive after the project and target', () => {
      expect(packFileName('Ruby Pack!', target)).toBe(`ruby-pack-${target.id}.zip`);
      expect(packFileName('  ', target)).toBe(`pack-${target.id}.zip`);
    });
  },
);
