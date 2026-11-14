/**
 * Golden over the committed sample data pack project (`fixtures/sample-datapack`): load it
 * with the real data pack and resource pack plugins, check every function with the offline
 * mcfunction service, export both packs for every built-in target and pin each zip's SHA-256.
 *
 * Zip timestamps use the local-time `Date` constructor (ADR 0013), so each zip is built under
 * two time zones far apart (UTC+14 and UTC-8/-7) and must hash the same in both.
 *
 * With `MSM_SAMPLE_DATAPACK_OUT`, the data pack zip of the selected target is also written to
 * that folder as `<pack file name>`, next to `server-facts.json` (`minecraft`, `zip`) for a
 * headless dedicated server check of the villager trade (see the fixture's README). Without it
 * that test is skipped.
 *
 * The expected hashes live in `test/fixtures/<target id>/sample-datapack-<pack>.sha256`
 * (target ids may not be written in `.ts` files). Change them intentionally only: set
 * `UPDATE_GOLDENS=1` to rewrite them from the current output.
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
import type { Exporter, Problem, Project } from '@msm/plugin-api';
import dataPackPlugin from '@msm/plugin-datapack';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import {
  createRegistryIndex,
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type RegistryIndex,
  type SchemaIndex,
} from '@msm/schemas';
import {
  createMcfunctionService,
  defaultFunctionUri,
  type McfunctionService,
} from '@msm/schemas/mcfunction';
import { builtInTargets, readVendoredJson, type TargetBundle } from '@msm/targets';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  combinedFileNames,
  createZipSink,
  dataPackExporter,
  packFileName,
  resourcePackExporter,
  runExport,
} from '../src/index';
import { defaultTarget, selectedTarget } from './selected-target';

const update = process.env.UPDATE_GOLDENS === '1';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, 'fixtures');
const sampleRoot = join(here, '..', '..', '..', 'fixtures', 'sample-datapack');
const NAMESPACE = 'msm_sample_data';
const PROJECT_NAME = 'MSM Sample Data Pack';

/** Two zones on opposite sides of the date line, so a local-time leak changes the bytes. */
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;

const resolvePath = (path: string): string => join(sampleRoot, ...path.split('/'));
const readOnly = async (): Promise<never> => {
  throw new Error('The sample project is read-only in tests.');
};

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
  writeFile: readOnly,
  mkdirp: readOnly,
  remove: readOnly,
};

const readAsset = async (namespace: string, path: string): Promise<Uint8Array> =>
  sampleFs.readFile(`assets/${namespace}/${path}`);

const meta = { msmVersion: '0.2.0', plugins: ['msm.datapack', 'msm.resourcepack'] };

async function loadSample() {
  const registry = new ElementKindRegistry();
  registerPlugin(registry, dataPackPlugin);
  registerPlugin(registry, resourcePackPlugin);
  const { project, problems } = await loadProject(sampleFs, registry);
  return { project, problems, registry };
}

/** The game always defines these function tags; mcmeta does not list them. */
const SEEDED_FUNCTION_TAGS = ['minecraft:load', 'minecraft:tick'];

/**
 * The ids the project defines per registry, as the app's session declares them: data kinds
 * `minecraft:<registry>` contribute to `<registry>` (tags to `tag/<registry>`).
 */
function projectIds(project: Project): Record<string, string[]> {
  const ids: Record<string, string[]> = {};
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const registry = element.kind.replace(/^minecraft:/, '');
      if (registry === 'pack_mcmeta') continue;
      const list = ids[registry] ?? [];
      list.push(element.id);
      ids[registry] = list;
    }
  }
  ids['tag/function'] = [...new Set([...(ids['tag/function'] ?? []), ...SEEDED_FUNCTION_TAGS])];
  for (const list of Object.values(ids)) list.sort();
  return ids;
}

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);
const readJson = async (bundle: TargetBundle, key: Parameters<typeof readVendoredJson>[1]) =>
  readVendoredJson(bundle, key, nodeReadFile);

interface TargetContext {
  schemaIndex: SchemaIndex;
  registries: RegistryIndex;
  mcfunction: McfunctionService;
  ids: Record<string, string[]>;
}

async function contextFor(bundle: TargetBundle, project: Project): Promise<TargetContext> {
  const [symbols, vanilla, commands, blocks] = await Promise.all([
    readJson(bundle, 'vanillaMcdocSymbols'),
    readJson(bundle, 'mcmetaRegistries'),
    readJson(bundle, 'mcmetaCommands'),
    readJson(bundle, 'mcmetaBlocks'),
  ]);
  const registries = vanilla as Record<string, string[]>;
  const ids = projectIds(project);
  return {
    schemaIndex: createSchemaIndex(parseVanillaMcdocSymbols(symbols), {
      mcVersion: bundle.target.mcVersion,
    }),
    registries: createRegistryIndex({ vanilla: registries, project: ids }),
    mcfunction: await createMcfunctionService(
      { commands, blocks, registries },
      { mcVersion: bundle.target.mcVersion },
    ),
    ids,
  };
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const decode = (bytes: Uint8Array | undefined): string => utf8.decode(bytes as Uint8Array);

/** Runs `body` with `process.env.TZ` set to `zone`, restoring the previous value after. */
async function inTimeZone<T>(zone: string, body: () => Promise<T>): Promise<T> {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return await body();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

describe('sample data pack project', () => {
  it('loads without problems and lists every element', async () => {
    const { project, problems } = await loadSample();
    expect(problems).toEqual([]);
    expect(project.name).toBe(PROJECT_NAME);
    expect(project.plugins).toEqual(['msm.datapack', 'msm.resourcepack']);
    expect(project.targets).toEqual([defaultTarget().target.id]);
    const summary = project.namespaces.map((namespace) => ({
      name: namespace.name,
      elements: namespace.elements.map((element) => `${element.kind} ${element.id}`).sort(),
      assets: namespace.assets.map((asset) => asset.path),
    }));
    expect(summary).toEqual([
      {
        name: 'minecraft',
        elements: [
          'minecraft:tag/function minecraft:load',
          'minecraft:tag/villager_trade minecraft:fletcher/level_1',
        ],
        assets: [],
      },
      {
        name: NAMESPACE,
        elements: [
          `minecraft:advancement ${NAMESPACE}:root`,
          `minecraft:function ${NAMESPACE}:greet`,
          `minecraft:function ${NAMESPACE}:load`,
          `minecraft:item_modifier ${NAMESPACE}:bonus_count`,
          `minecraft:loot_table ${NAMESPACE}:chests/ruby_vault`,
          `minecraft:pack_mcmeta ${NAMESPACE}:pack`,
          `minecraft:predicate ${NAMESPACE}:is_sneaking`,
          `minecraft:recipe ${NAMESPACE}:glowstone_from_gems`,
          `minecraft:recipe ${NAMESPACE}:leather_from_rotten_flesh`,
          `minecraft:recipe ${NAMESPACE}:ruby_block`,
          `minecraft:tag/item ${NAMESPACE}:gems`,
          `minecraft:villager_trade ${NAMESPACE}:fletcher/1/emerald_spectral_arrow`,
        ],
        assets: [],
      },
    ]);
  });

  it('is stored exactly as MSM saves it, so opening and saving it changes nothing', async () => {
    const { project, registry } = await loadSample();
    const memory = createMemoryFileSystem();
    await saveProject(memory, project, registry);
    const saved = Object.entries(memory.snapshot()).filter(([path]) => path.endsWith('.json'));
    // The project file plus one file per element.
    const elementCount = project.namespaces.reduce((n, ns) => n + ns.elements.length, 0);
    expect(saved.length).toBe(elementCount + 1);
    for (const [path, bytes] of saved) {
      const onDisk = await sampleFs.readFile(path);
      expect(utf8.decode(onDisk), path).toBe(utf8.decode(bytes));
    }
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sample data pack export (%s)',
  (_id, bundle) => {
    const { target } = bundle;
    const data = target.folders.data;
    let context: TargetContext;

    beforeAll(async () => {
      const { project } = await loadSample();
      context = await contextFor(bundle, project);
    });

    async function exportZip(exporter: Exporter): Promise<Uint8Array> {
      const { project, registry } = await loadSample();
      const sink = createZipSink();
      const report = await runExport({
        project,
        registry,
        target,
        schemaIndex: context.schemaIndex,
        registries: context.registries,
        exporter,
        sink,
        readAsset,
        meta,
        async validateText(file) {
          if (file.language !== 'mcfunction') return [];
          const source = decode(file.contents as Uint8Array).replace(/\n$/, '');
          const found = await context.mcfunction.check(source, {
            uri: `file:///msm/${file.path}`,
            projectIds: context.ids,
          });
          return found.map(
            (problem): Problem => ({
              severity: problem.severity,
              code: problem.code,
              message: `line ${problem.line + 1}: ${problem.message}`,
              file: file.path,
            }),
          );
        },
      });
      // Zero errors and zero warnings: no unknown ids, no command problems. Only the info
      // that the other pack's layer was left out remains.
      expect(report.problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
      expect(report.problems.map((problem) => problem.code)).toEqual(['export.layer-skipped']);
      expect(report.ok).toBe(true);
      return sink.finish();
    }

    it('checks every function with zero problems', async () => {
      const { project } = await loadSample();
      const functions = project.namespaces.flatMap((namespace) =>
        namespace.elements.filter((element) => element.kind === 'minecraft:function'),
      );
      expect(functions.map((element) => element.id).sort()).toEqual([
        `${NAMESPACE}:greet`,
        `${NAMESPACE}:load`,
      ]);
      for (const element of functions) {
        const [namespace, path] = element.id.split(':') as [string, string];
        const lines = (element.data as { lines: string[] }).lines;
        const found = await context.mcfunction.check(lines.join('\n'), {
          uri: defaultFunctionUri(namespace, path, data.function),
          projectIds: context.ids,
        });
        expect(found, element.id).toEqual([]);
      }
    });

    it('exports every data pack file the in-game check needs', async () => {
      const files = unzipSync(await exportZip(dataPackExporter));
      const ns = `data/${NAMESPACE}`;
      expect(Object.keys(files).sort()).toEqual(
        [
          `${ns}/${data.advancement}/root.json`,
          `${ns}/${data.function}/greet.mcfunction`,
          `${ns}/${data.function}/load.mcfunction`,
          `${ns}/${data.item_modifier}/bonus_count.json`,
          `${ns}/${data.loot_table}/chests/ruby_vault.json`,
          `${ns}/${data.predicate}/is_sneaking.json`,
          `${ns}/${data.recipe}/glowstone_from_gems.json`,
          `${ns}/${data.recipe}/leather_from_rotten_flesh.json`,
          `${ns}/${data.recipe}/ruby_block.json`,
          `${ns}/${data.tags}/item/gems.json`,
          `${ns}/${data.villager_trade}/fletcher/1/emerald_spectral_arrow.json`,
          `data/minecraft/${data.tags}/function/load.json`,
          `data/minecraft/${data.tags}/${data.villager_trade}/fletcher/level_1.json`,
          'msm.export.json',
          'pack.mcmeta',
        ].sort(),
      );
      expect(decode(files[`${ns}/${data.function}/greet.mcfunction`])).toMatch(
        /^# Run with \/function msm_sample_data:greet\nsay Hello/,
      );
      expect(JSON.parse(decode(files[`data/minecraft/${data.tags}/function/load.json`]))).toEqual({
        values: [`${NAMESPACE}:load`],
      });
      // The trade joins vanilla's novice fletcher tag: no replace, so the vanilla trades stay
      // (ADR 0060 D5).
      expect(
        JSON.parse(
          decode(files[`data/minecraft/${data.tags}/${data.villager_trade}/fletcher/level_1.json`]),
        ),
      ).toEqual({ values: [`${NAMESPACE}:fletcher/1/emerald_spectral_arrow`] });
      const mcmeta = JSON.parse(decode(files['pack.mcmeta'])) as { pack: Record<string, unknown> };
      expect(mcmeta.pack.description).toBe('MCSuperMods sample: /function msm_sample_data:greet');
      expect(packFileName(PROJECT_NAME, target)).toBe(`msm-sample-data-pack-${target.id}.zip`);
      expect(combinedFileNames(PROJECT_NAME, target)).toEqual({
        resources: `msm-sample-data-pack-${target.id}-resources.zip`,
        data: `msm-sample-data-pack-${target.id}-data.zip`,
      });
    });

    it('exports a resource pack holding only its pack.mcmeta and manifest', async () => {
      const files = unzipSync(await exportZip(resourcePackExporter));
      expect(Object.keys(files).sort()).toEqual(['msm.export.json', 'pack.mcmeta']);
    });

    const outDir = process.env.MSM_SAMPLE_DATAPACK_OUT;
    it.runIf(outDir !== undefined && bundle === selectedTarget())(
      'writes the data pack zip for the headless server check',
      async () => {
        const zip = await exportZip(dataPackExporter);
        const name = packFileName(PROJECT_NAME, target);
        await mkdir(outDir as string, { recursive: true });
        await writeFile(join(outDir as string, name), zip);
        await writeFile(
          join(outDir as string, 'server-facts.json'),
          `${JSON.stringify({ minecraft: target.mcVersion, zip: name }, null, 2)}\n`,
        );
      },
    );

    describe.each([
      ['data', dataPackExporter],
      ['resources', resourcePackExporter],
    ] as const)('%s zip', (pack, exporter) => {
      const hashFile = join(fixturesRoot, target.id, `sample-datapack-${pack}.sha256`);
      const savedZone = process.env.TZ;
      afterAll(() => {
        expect(process.env.TZ).toBe(savedZone);
      });

      it('has the recorded SHA-256 in two time zones', async () => {
        const offsets: number[] = [];
        const hashes: string[] = [];
        for (const zone of TIME_ZONES) {
          await inTimeZone(zone, async () => {
            offsets.push(new Date(2000, 0, 1).getTimezoneOffset());
            hashes.push(sha256(await exportZip(exporter)));
          });
        }
        // The zone change took effect, and it did not change the bytes.
        expect(new Set(offsets).size).toBe(TIME_ZONES.length);
        expect(new Set(hashes).size).toBe(1);
        const actual = hashes[0] as string;
        if (update) {
          await mkdir(dirname(hashFile), { recursive: true });
          await writeFile(hashFile, `${actual}\n`);
        }
        const expected = (await readFile(hashFile, 'utf8')).trim();
        expect(actual).toBe(expected);
      });
    });
  },
);
