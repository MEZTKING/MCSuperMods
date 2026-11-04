/**
 * Golden over the committed sample project (`fixtures/sample-resourcepack`): load it with the
 * real resource pack plugin, export it for every built-in target and pin the zip's SHA-256.
 *
 * The expected hash for each target lives in `test/fixtures/<target id>/sample-project.sha256`
 * (target ids may not be written in `.ts` files). Change it intentionally only: set
 * `UPDATE_GOLDENS=1` to rewrite it from the current output.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createMemoryFileSystem,
  type DirEntry,
  ElementKindRegistry,
  loadProject,
  type ProjectFileSystem,
  registerPlugin,
  saveProject,
  utf8,
} from '@msm/core';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import { builtInTargets } from '@msm/targets';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createZipSink, packFileName, runExport, vanillaPacksExporter } from '../src/index';
import { indexesFor, meta } from './helpers';

const update = process.env.UPDATE_GOLDENS === '1';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, 'fixtures');
const sampleRoot = join(here, '..', '..', '..', 'fixtures', 'sample-resourcepack');

const resolvePath = (path: string): string => join(sampleRoot, ...path.split('/'));

/** A read-only file system over the sample project directory. */
const sampleFs: ProjectFileSystem = {
  readFile: async (path) => new Uint8Array(await readFile(resolvePath(path))),
  async readDir(path) {
    const entries = await readdir(resolvePath(path), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() || entry.isDirectory())
      .map(
        (entry): DirEntry => ({
          name: entry.name,
          kind: entry.isDirectory() ? 'directory' : 'file',
        }),
      );
  },
  async exists(path) {
    try {
      await stat(resolvePath(path));
      return true;
    } catch {
      return false;
    }
  },
  writeFile: async () => {
    throw new Error('The sample project is read-only in tests.');
  },
  mkdirp: async () => {
    throw new Error('The sample project is read-only in tests.');
  },
  remove: async () => {
    throw new Error('The sample project is read-only in tests.');
  },
};

const readAsset = async (namespace: string, path: string): Promise<Uint8Array> =>
  sampleFs.readFile(`assets/${namespace}/${path}`);

async function loadSample() {
  const registry = new ElementKindRegistry();
  registerPlugin(registry, resourcePackPlugin);
  const { project, problems } = await loadProject(sampleFs, registry);
  return { project, problems, registry };
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

describe('sample resource pack project', () => {
  it('loads without problems and lists every element and asset', async () => {
    const { project, problems } = await loadSample();
    expect(problems).toEqual([]);
    expect(project.plugins).toEqual(['msm.resourcepack']);
    expect(project.targets).toEqual([builtInTargets[0]?.target.id]);
    const summary = project.namespaces.map((namespace) => ({
      name: namespace.name,
      elements: namespace.elements.map((element) => `${element.kind} ${element.id}`),
      assets: namespace.assets.map((asset) => asset.path),
    }));
    expect(summary).toEqual([
      {
        name: 'minecraft',
        elements: ['minecraft:item_definition minecraft:stick'],
        assets: [],
      },
      {
        name: 'msm_sample',
        elements: [
          'minecraft:model msm_sample:block/ruby_block',
          'minecraft:lang msm_sample:en_us',
          'minecraft:model msm_sample:item/ruby',
          'minecraft:pack_mcmeta msm_sample:pack',
          'minecraft:item_definition msm_sample:ruby',
          'minecraft:block_definition msm_sample:ruby_block',
        ],
        assets: ['textures/block/ruby_block.png', 'textures/item/ruby.png'],
      },
    ]);
  });
  it('is stored exactly as MSM saves it, so opening and saving it changes nothing', async () => {
    const { project, registry } = await loadSample();
    const memory = createMemoryFileSystem();
    await saveProject(memory, project, registry);
    const saved = Object.entries(memory.snapshot()).filter(([path]) => path.endsWith('.json'));
    expect(saved.length).toBeGreaterThan(0);
    for (const [path, bytes] of saved) {
      const onDisk = await sampleFs.readFile(path);
      expect(utf8.decode(onDisk), path).toBe(utf8.decode(bytes));
    }
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sample resource pack export (%s)',
  (_id, bundle) => {
    const target = bundle.target;
    const hashFile = join(fixturesRoot, target.id, 'sample-project.sha256');

    async function exportZip(): Promise<Uint8Array> {
      const { project, registry } = await loadSample();
      const { schemaIndex, registries } = await indexesFor(bundle);
      const sink = createZipSink();
      const report = await runExport({
        project,
        registry,
        target,
        schemaIndex,
        registries,
        exporter: vanillaPacksExporter,
        sink,
        readAsset,
        meta,
      });
      expect(report.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
      expect(report.ok).toBe(true);
      return sink.finish();
    }

    it('exports every file the in-game check needs', async () => {
      const zip = await exportZip();
      const folders = target.folders.resource;
      expect(Object.keys(unzipSync(zip)).sort()).toEqual(
        [
          `assets/minecraft/${folders.item_definition}/stick.json`,
          `assets/msm_sample/${folders.block_definition}/ruby_block.json`,
          `assets/msm_sample/${folders.item_definition}/ruby.json`,
          `assets/msm_sample/${folders.lang}/en_us.json`,
          `assets/msm_sample/${folders.model}/block/ruby_block.json`,
          `assets/msm_sample/${folders.model}/item/ruby.json`,
          `assets/msm_sample/${folders.textures}/block/ruby_block.png`,
          `assets/msm_sample/${folders.textures}/item/ruby.png`,
          'msm.export.json',
          'pack.mcmeta',
        ].sort(),
      );
      expect(packFileName('MSM Sample Resource Pack', target)).toBe(
        `msm-sample-resource-pack-${target.id}.zip`,
      );
    });

    it('points the vanilla stick at the sample ruby model', async () => {
      const files = unzipSync(await exportZip());
      const stick = files[`assets/minecraft/${target.folders.resource.item_definition}/stick.json`];
      expect(stick).toBeDefined();
      expect(JSON.parse(new TextDecoder().decode(stick))).toEqual({
        model: { model: 'msm_sample:item/ruby', type: 'minecraft:model' },
      });
    });

    it('produces a zip whose SHA-256 matches the recorded golden', async () => {
      const actual = sha256(await exportZip());
      if (update) {
        await mkdir(dirname(hashFile), { recursive: true });
        await writeFile(hashFile, `${actual}\n`);
      }
      const expected = (await readFile(hashFile, 'utf8')).trim();
      expect(actual).toBe(expected);
    });
  },
);
