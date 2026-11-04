import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { utf8 } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  createMemorySink,
  createZipSink,
  type ExportRequest,
  runExport,
  vanillaPacksExporter,
} from '../src/index';
import { element, fakeAsset, indexesFor, meta, project, testRegistry } from './helpers';

/** Set `UPDATE_GOLDENS=1` to rewrite the expected files from the current output. */
const update = process.env.UPDATE_GOLDENS === '1';

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const goldenProject = project(
  [
    element('test:model', 'ruby:block/ruby_block', {
      parent: 'minecraft:block/cube_all',
      textures: { all: 'ruby:block/ruby_block' },
    }),
    element('test:model', 'ruby:item/ruby', {
      parent: 'minecraft:item/generated',
      textures: { layer0: 'ruby:item/ruby' },
    }),
    element('test:lang', 'ruby:en_us', {
      'block.ruby.ruby_block': 'Block of Ruby',
      'item.ruby.ruby': 'Ruby',
    }),
  ],
  [
    { path: 'textures/block/ruby_block.png', mediaType: 'image/png' },
    { path: 'textures/item/ruby.png', mediaType: 'image/png' },
    { path: 'sounds/ruby/chime.ogg', mediaType: 'audio/ogg' },
  ],
);

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'vanilla-packs golden (%s)',
  (_id, bundle) => {
    const expectedRoot = join(fixturesRoot, bundle.target.id, 'vanilla-packs', 'expected');

    async function exportTo<S extends ExportRequest['sink']>(sink: S) {
      const { schemaIndex, registries } = await indexesFor(bundle);
      const report = await runExport({
        project: goldenProject,
        registry: testRegistry(),
        target: bundle.target,
        schemaIndex,
        registries,
        exporter: vanillaPacksExporter,
        sink,
        readAsset: fakeAsset,
        meta,
      });
      expect(report.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
      expect(report.ok).toBe(true);
      return report;
    }

    it('matches the expected files', async () => {
      const sink = createMemorySink();
      await exportTo(sink);
      const actual = sink.files();

      if (update) {
        await rm(expectedRoot, { recursive: true, force: true });
        for (const [path, bytes] of actual) {
          const file = join(expectedRoot, ...path.split('/'));
          await mkdir(dirname(file), { recursive: true });
          await writeFile(file, bytes);
        }
      }

      const expectedPaths = await listFiles(expectedRoot);
      expect([...actual.keys()].sort()).toEqual(expectedPaths);
      for (const path of expectedPaths) {
        const expected = await readFile(join(expectedRoot, ...path.split('/')));
        expect(utf8.decode(actual.get(path) as Uint8Array), path).toBe(utf8.decode(expected));
      }
    });

    it('produces identical zips on repeated exports, with the same files', async () => {
      const first = createZipSink();
      const second = createZipSink();
      await exportTo(first);
      await exportTo(second);
      const zip = first.finish();
      expect(second.finish()).toEqual(zip);

      const memory = createMemorySink();
      await exportTo(memory);
      const unzipped = unzipSync(zip);
      expect(Object.keys(unzipped).sort()).toEqual([...memory.files().keys()].sort());
      for (const [path, bytes] of memory.files()) expect(unzipped[path]).toEqual(bytes);
    });
  },
);
