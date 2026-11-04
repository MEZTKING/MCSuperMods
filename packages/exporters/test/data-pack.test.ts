/**
 * The data pack exporter, combined export names and the `validateText` hook. Uses the
 * test-local `test:raw` kind, so these tests do not depend on `@msm/plugin-datapack`.
 */
import { utf8 } from '@msm/core';
import type { OutputFile, Problem } from '@msm/plugin-api';
import { validateJson } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import {
  combinedFileNames,
  createMemorySink,
  createVanillaPacksExporter,
  createZipSink,
  dataPackExporter,
  defaultDataPackMcmeta,
  defaultResourcePackMcmeta,
  type ExportRequest,
  packFileName,
  resourcePackExporter,
  runExport,
  vanillaPacksExporter,
} from '../src/index';
import { element, fakeAsset, indexesFor, meta, project, raw, testRegistry } from './helpers';

const codes = (problems: Problem[]): string[] => problems.map((problem) => problem.code);
const errors = (problems: Problem[]): Problem[] =>
  problems.filter((problem) => problem.severity === 'error');
const text = (bytes: Uint8Array | undefined): string => utf8.decode(bytes as Uint8Array);

const greet = raw('ruby:greet', {
  path: 'data/ruby/function/greet.mcfunction',
  layer: 'datapack',
  text: 'say hello\n',
  language: 'mcfunction',
});
const tick = raw('ruby:tick', {
  path: 'data/ruby/function/tick.mcfunction',
  layer: 'datapack',
  text: 'function ruby:greet\n',
  language: 'mcfunction',
});

describe('vanilla pack exporters', () => {
  it('builds both exporters from the factory', () => {
    expect(resourcePackExporter).toMatchObject({ id: 'vanilla-packs', layers: ['resourcepack'] });
    expect(dataPackExporter).toMatchObject({ id: 'vanilla-packs-data', layers: ['datapack'] });
    expect(vanillaPacksExporter).toBe(resourcePackExporter);
    expect(createVanillaPacksExporter('data')).toMatchObject({
      id: 'vanilla-packs-data',
      layers: ['datapack'],
    });
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'data pack export (%s)',
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
        exporter: dataPackExporter,
        readAsset: fakeAsset,
        meta,
        ...overrides,
        sink: createMemorySink(),
      };
    }

    const recipe = raw('ruby:ruby_block', {
      path: 'data/ruby/recipe/ruby_block.json',
      layer: 'datapack',
      json: { type: 'minecraft:crafting_shapeless', ingredients: ['ruby:ruby'] },
    });
    const model = element('test:model', 'ruby:block/ruby', {
      parent: 'minecraft:block/cube_all',
      textures: { all: 'ruby:block/ruby' },
    });

    it('writes only datapack files, synthesises pack.mcmeta from the data format and skips resource files with an info', async () => {
      const req = await request({
        project: project(
          [recipe, model, greet],
          [{ path: 'textures/block/ruby.png', mediaType: 'image/png' }],
        ),
        validateText: async () => [],
      });
      const report = await runExport(req);
      expect(errors(report.problems)).toEqual([]);
      expect(report.ok).toBe(true);
      expect(report.files).toEqual([
        'data/ruby/function/greet.mcfunction',
        'data/ruby/recipe/ruby_block.json',
        'pack.mcmeta',
        'msm.export.json',
      ]);
      expect(report.problems).toEqual([
        expect.objectContaining({
          code: 'export.layer-skipped',
          severity: 'info',
          message:
            '2 resourcepack file(s) are not packaged by Vanilla data pack and were left out.',
        }),
      ]);
      const written = req.sink.files();
      expect(JSON.parse(text(written.get('pack.mcmeta')))).toEqual(
        defaultDataPackMcmeta('Ruby Pack', target),
      );
      expect(text(written.get('data/ruby/function/greet.mcfunction'))).toBe('say hello\n');
      expect(written.has(`assets/ruby/${models}/block/ruby.json`)).toBe(false);
      const manifest = JSON.parse(text(written.get('msm.export.json')));
      expect(manifest).toMatchObject({ exporter: 'vanilla-packs-data', fileCount: 3 });
    });

    it('synthesises a data pack.mcmeta that satisfies the pack schema and uses the data format', async () => {
      const { schemaIndex } = await indexesFor(bundle);
      const mcmeta = defaultDataPackMcmeta('Ruby Pack', target);
      expect(validateJson(mcmeta, schemaIndex.resolve('::java::pack::Pack'))).toEqual([]);
      const { major, minor } = target.packFormats.data;
      expect(mcmeta).toEqual({
        pack: {
          description: 'Ruby Pack',
          max_format: [major, minor],
          min_format: [major, minor],
          pack_format: major,
        },
      });
    });

    it('keeps a data-layer pack.mcmeta the project lowers and ignores the resource one', async () => {
      const dataMcmeta = {
        pack: { description: 'Data', pack_format: target.packFormats.data.major },
      };
      const resourceMcmeta = {
        pack: { description: 'Resources', pack_format: target.packFormats.resource.major },
      };
      const req = await request({
        project: project([
          raw('ruby:pack_data', {
            path: 'pack.mcmeta',
            layer: 'datapack',
            json: dataMcmeta,
            schema: '::java::pack::Pack',
          }),
          raw('ruby:pack_resource', {
            path: 'pack.mcmeta',
            layer: 'resourcepack',
            json: resourceMcmeta,
            schema: '::java::pack::Pack',
          }),
        ]),
      });
      const report = await runExport(req);
      expect(report.ok).toBe(true);
      expect(JSON.parse(text(req.sink.files().get('pack.mcmeta')))).toEqual(dataMcmeta);

      const resourceReq = await request({
        project: req.project,
        exporter: resourcePackExporter,
      });
      const resourceReport = await runExport(resourceReq);
      expect(resourceReport.ok).toBe(true);
      expect(JSON.parse(text(resourceReq.sink.files().get('pack.mcmeta')))).toEqual(resourceMcmeta);
    });

    it('refuses a datapack file at the manifest path', async () => {
      const req = await request({
        project: project([raw('ruby:m', { path: 'msm.export.json', layer: 'datapack', json: {} })]),
      });
      const report = await runExport(req);
      expect(report.ok).toBe(false);
      expect(codes(errors(report.problems))).toEqual(['export.reserved-path']);
      expect(JSON.parse(text(req.sink.files().get('msm.export.json'))).exporter).toBe(
        'vanilla-packs-data',
      );
    });

    it('calls validateText once per language file, in path order', async () => {
      const seen: OutputFile[] = [];
      const validateText = vi.fn(async (file: OutputFile) => {
        seen.push(file);
        return [];
      });
      const req = await request({ project: project([tick, recipe, greet]), validateText });
      const report = await runExport(req);
      expect(report.ok).toBe(true);
      expect(validateText).toHaveBeenCalledTimes(2);
      expect(seen.map((file) => [file.path, file.language])).toEqual([
        ['data/ruby/function/greet.mcfunction', 'mcfunction'],
        ['data/ruby/function/tick.mcfunction', 'mcfunction'],
      ]);
      expect(text(seen[0]?.contents as Uint8Array)).toBe('say hello\n');
      expect(report.problems).toEqual([]);
    });

    it('blocks on a validateText error and writes nothing', async () => {
      const req = await request({
        project: project([greet, tick]),
        validateText: async (file) =>
          file.path.endsWith('tick.mcfunction')
            ? [
                {
                  severity: 'error',
                  code: 'mcfunction.parse',
                  message: 'Expected a float',
                  path: '/lines/0',
                  range: { start: 9, end: 10 },
                },
              ]
            : [],
      });
      const report = await runExport(req);
      expect(report.ok).toBe(false);
      expect(report.files).toEqual([]);
      expect(req.sink.files().size).toBe(0);
      expect(report.problems).toEqual([
        {
          severity: 'error',
          code: 'mcfunction.parse',
          message: 'Expected a float',
          file: 'data/ruby/function/tick.mcfunction',
          path: '/lines/0',
          range: { start: 9, end: 10 },
        },
      ]);
    });

    it('passes validateText warnings through and exports', async () => {
      const warning: Problem = {
        severity: 'warning',
        code: 'mcfunction.lint.undeclaredSymbol',
        message: 'Cannot find function "ruby:missing"',
        file: 'elsewhere.mcfunction',
      };
      const req = await request({
        project: project([greet]),
        validateText: async () => [warning],
      });
      const report = await runExport(req);
      expect(report.ok).toBe(true);
      expect(report.problems).toEqual([warning]);
      expect(report.files).toContain('data/ruby/function/greet.mcfunction');
    });

    it('reports one language-unchecked info per language when validateText is absent', async () => {
      const other = raw('ruby:other', {
        path: 'data/ruby/other/x.txt',
        layer: 'datapack',
        text: 'x',
        language: 'other',
      });
      const req = await request({ project: project([tick, other, greet]) });
      const report = await runExport(req);
      expect(report.ok).toBe(true);
      expect(report.problems).toEqual([
        expect.objectContaining({
          severity: 'info',
          code: 'export.language-unchecked',
          message:
            '2 mcfunction file(s) were exported without being checked: no mcfunction checker is available.',
        }),
        expect.objectContaining({ severity: 'info', code: 'export.language-unchecked' }),
      ]);
      expect(report.problems[1]?.message).toMatch(/^1 other file/);
    });

    it('turns a throwing validateText into export.text-validation-failed', async () => {
      const req = await request({
        project: project([greet]),
        validateText: async () => {
          throw new Error('service unavailable');
        },
      });
      const report = await runExport(req);
      expect(report.ok).toBe(false);
      expect(report.problems).toEqual([
        {
          severity: 'error',
          code: 'export.text-validation-failed',
          file: 'data/ruby/function/greet.mcfunction',
          message:
            'data/ruby/function/greet.mcfunction could not be checked as mcfunction: service unavailable',
        },
      ]);
      expect(req.sink.files().size).toBe(0);
    });

    it('does not check language files of layers the exporter skips', async () => {
      const validateText = vi.fn(async () => []);
      const req = await request({
        project: project([greet]),
        exporter: resourcePackExporter,
        validateText,
      });
      const report = await runExport(req);
      expect(report.ok).toBe(true);
      expect(validateText).not.toHaveBeenCalled();
      expect(codes(report.problems)).toEqual(['export.layer-skipped']);
    });

    it('writes byte-identical data zips across runs', async () => {
      const zip = async (): Promise<Uint8Array> => {
        const req = await request({ project: project([recipe, greet]) });
        const zipSink = createZipSink();
        const report = await runExport({ ...req, sink: zipSink, validateText: async () => [] });
        expect(report.ok).toBe(true);
        return zipSink.finish();
      };
      const first = await zip();
      expect(await zip()).toEqual(first);
      expect(Object.keys(unzipSync(first))).toEqual([
        'data/ruby/function/greet.mcfunction',
        'data/ruby/recipe/ruby_block.json',
        'msm.export.json',
        'pack.mcmeta',
      ]);
    });

    it('names the data archive and the combined pair', () => {
      expect(packFileName('Ruby Pack!', target)).toBe(`ruby-pack-${target.id}.zip`);
      expect(packFileName('Ruby Pack!', target, 'resource')).toBe(`ruby-pack-${target.id}.zip`);
      expect(packFileName('Ruby Pack!', target, 'data')).toBe(`ruby-pack-${target.id}-data.zip`);
      expect(packFileName('', target, 'data')).toBe(`pack-${target.id}-data.zip`);
      expect(combinedFileNames('Ruby Pack!', target)).toEqual({
        resources: `ruby-pack-${target.id}-resources.zip`,
        data: `ruby-pack-${target.id}-data.zip`,
      });
      expect(combinedFileNames('', target).data).toBe(packFileName('', target, 'data'));
    });

    it('keeps the resource pack.mcmeta helper on the resource format', () => {
      const resource = defaultResourcePackMcmeta('x', target) as { pack: { pack_format: number } };
      expect(resource.pack.pack_format).toBe(target.packFormats.resource.major);
    });
  },
);
