/**
 * Golden over the committed sample worldgen project (`fixtures/sample-worldgen`, plan D5 and
 * D9): the library's "Custom biome with a jigsaw structure" starter (`worldgen_pack`) saved
 * as a project with namespace `msm_sample_worldgen`.
 *
 * - The fixture equals the project built from the starter now (like the `examples/` mirror);
 *   `UPDATE_GOLDENS=1` rewrites it.
 * - Every element validates with zero problems, and the plugins' project validators report
 *   nothing on it.
 * - Both packs export with zero problems; the data zip's SHA-256 is pinned per target in two
 *   time zones (`test/fixtures/<target id>/sample-worldgen-data.sha256`).
 * - The zip's structure `.nbt` files read back with the elements' block counts, and the chain
 *   walk (`chain-walk.ts`) resolves every link; it fails on a copy with a pool removed.
 * - A copy with a placed feature moved to another step in a second biome reports exactly one
 *   `worldgen.feature-order` error.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createElement,
  createEmptyProject,
  createMemoryFileSystem,
  type DirEntry,
  ElementKindRegistry,
  loadProject,
  type MemoryFileSystem,
  type ProjectFileSystem,
  registerPlugin,
  saveProject,
} from '@msm/core';
import type { Element, Exporter, Plugin, Project } from '@msm/plugin-api';
import dataPackPlugin from '@msm/plugin-datapack';
import libraryPlugin, { libraryStarters } from '@msm/plugin-library';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import structuresPlugin from '@msm/plugin-structures';
import worldgenPlugin from '@msm/plugin-worldgen';
import {
  createRegistryIndex,
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type RegistryIndex,
  type SchemaIndex,
  validateJson,
} from '@msm/schemas';
import { builtInTargets, readVendoredJson, type TargetBundle } from '@msm/targets';
import { unzipSync, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createZipSink, dataPackExporter, resourcePackExporter, runExport } from '../src/index';
import { chainWalk } from './chain-walk';

const update = process.env.UPDATE_GOLDENS === '1';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, 'fixtures');
const sampleRoot = join(here, '..', '..', '..', 'fixtures', 'sample-worldgen');
const NAMESPACE = 'msm_sample_worldgen';
const PROJECT_NAME = 'MSM Sample Worldgen';
const STARTER = 'worldgen_pack';
const NOW = '2026-11-04T00:00:00.000Z';
/** Files of the fixture that the test does not generate. */
const HAND_WRITTEN = new Set(['README.md']);

/** Two zones on opposite sides of the date line, so a local-time leak changes the bytes. */
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;

/** The app's built-in plugins, in its registration order. */
const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  structuresPlugin,
  worldgenPlugin,
  libraryPlugin,
];
const VALIDATORS = PLUGINS.flatMap((plugin) => plugin.contributes.validators ?? []);

const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);

const meta = { msmVersion: '0.3.0', plugins: ['msm.datapack', 'msm.structures', 'msm.worldgen'] };

// The project -----------------------------------------------------------------------------

/** Builds the starter into a project the way the app's `newProject` does, then saves it. */
async function buildSample(): Promise<MemoryFileSystem> {
  const starter = libraryStarters.find((entry) => entry.id === STARTER);
  if (starter === undefined) throw new Error(`No starter ${STARTER}`);
  const bundle = starter.build({ namespace: NAMESPACE, projectName: PROJECT_NAME });
  const project = createEmptyProject(PROJECT_NAME, {
    targets: [builtInTargets[0]?.target.id as string],
    plugins: PLUGINS.filter((plugin) => (plugin.contributes.elementKinds ?? []).length > 0).map(
      (plugin) => plugin.id,
    ),
  });
  for (const entry of bundle.elements) {
    const ns = entry.id.slice(0, entry.id.indexOf(':'));
    let target = project.namespaces.find((candidate) => candidate.name === ns);
    if (target === undefined) {
      target = { name: ns, elements: [], assets: [] };
      project.namespaces.push(target);
    }
    target.elements.push(
      createElement({
        id: entry.id,
        kind: entry.kind,
        data: structuredClone(entry.data),
        now: () => NOW,
        ...(entry.notes === undefined ? {} : { notes: entry.notes }),
        ...(entry.tags === undefined ? {} : { tags: entry.tags }),
      }),
    );
  }
  expect(bundle.assets).toEqual([]);
  project.namespaces.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const fs = createMemoryFileSystem();
  await saveProject(fs, project, registry);
  return fs;
}

const resolvePath = (path: string): string => join(sampleRoot, ...path.split('/'));
const readOnly = async (): Promise<never> => {
  throw new Error('The sample project is read-only in tests.');
};

/** A read-only file system over the fixture directory. */
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

async function listFiles(root: string, prefix = ''): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(join(root, prefix), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await listFiles(root, path)));
    else if (entry.isFile()) out.push(path);
  }
  return out.sort();
}

async function loadSample(): Promise<Project> {
  const { project, problems } = await loadProject(sampleFs, registry);
  expect(problems).toEqual([]);
  return project;
}

const elementsOf = (project: Project): Element[] =>
  project.namespaces.flatMap((namespace) => namespace.elements);

// Registries --------------------------------------------------------------------------------

/** The project's own ids per registry, as the app's `dataRegistryIds` derives them. */
function projectIds(project: Project): Record<string, string[]> {
  const ids: Record<string, string[]> = {};
  for (const element of elementsOf(project)) {
    if (element.kind === 'minecraft:pack_mcmeta' || element.kind === 'minecraft:lang') continue;
    const name = registry.get(element.kind)?.registry ?? element.kind.replace(/^minecraft:/, '');
    const list = ids[name] ?? [];
    list.push(element.id);
    ids[name] = list;
  }
  for (const list of Object.values(ids)) list.sort();
  return ids;
}

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

interface TargetContext {
  schemaIndex: SchemaIndex;
  registries: RegistryIndex;
  vanilla: Record<string, string[]>;
}

async function contextFor(bundle: TargetBundle, project: Project): Promise<TargetContext> {
  const [symbols, vanilla] = await Promise.all([
    readVendoredJson(bundle, 'vanillaMcdocSymbols', nodeReadFile),
    readVendoredJson(bundle, 'mcmetaRegistries', nodeReadFile),
  ]);
  return {
    schemaIndex: createSchemaIndex(parseVanillaMcdocSymbols(symbols), {
      mcVersion: bundle.target.mcVersion,
    }),
    registries: createRegistryIndex({
      vanilla: vanilla as Record<string, string[]>,
      project: projectIds(project),
    }),
    vanilla: vanilla as Record<string, string[]>,
  };
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

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

// Tests -------------------------------------------------------------------------------------

describe('sample worldgen project', () => {
  it('equals the worldgen_pack starter saved as a project', async () => {
    const generated = (await buildSample()).snapshot();
    if (update) {
      for (const path of await listFiles(sampleRoot)) {
        if (!HAND_WRITTEN.has(path)) await rm(join(sampleRoot, ...path.split('/')));
      }
      await rm(join(sampleRoot, 'content'), { recursive: true, force: true });
      for (const [path, bytes] of Object.entries(generated)) {
        const file = join(sampleRoot, ...path.split('/'));
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, bytes);
      }
    }
    const onDisk = (await listFiles(sampleRoot)).filter((path) => !HAND_WRITTEN.has(path));
    expect(onDisk).toEqual(Object.keys(generated).sort());
    for (const [path, bytes] of Object.entries(generated)) {
      const file = new Uint8Array(await readFile(join(sampleRoot, ...path.split('/'))));
      expect(Buffer.from(file).equals(Buffer.from(bytes)), path).toBe(true);
    }
  });

  it('loads with zero problems and holds the whole chain', async () => {
    const project = await loadSample();
    expect(project.name).toBe(PROJECT_NAME);
    const kinds = new Set(elementsOf(project).map((element) => element.kind));
    for (const kind of [
      'minecraft:worldgen/biome',
      'minecraft:worldgen/feature',
      'minecraft:worldgen/placed_feature',
      'minecraft:worldgen/world_preset',
      'minecraft:tag/worldgen/world_preset',
      'minecraft:tag/worldgen/biome',
      'minecraft:structure_template',
      'minecraft:worldgen/template_pool',
      'minecraft:worldgen/structure',
      'minecraft:worldgen/structure_set',
      'minecraft:worldgen/processor_list',
    ]) {
      expect(kinds.has(kind), kind).toBe(true);
    }
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sample worldgen export (%s)',
  (_id, bundle) => {
    const { target } = bundle;
    let context: TargetContext;

    beforeAll(async () => {
      context = await contextFor(bundle, await loadSample());
    }, 60_000);

    async function exportZip(exporter: Exporter, project?: Project): Promise<Uint8Array> {
      const sink = createZipSink();
      const report = await runExport({
        project: project ?? (await loadSample()),
        registry,
        target,
        schemaIndex: context.schemaIndex,
        registries: context.registries,
        exporter,
        sink,
        readAsset: (namespace, path) => sampleFs.readFile(`assets/${namespace}/${path}`),
        meta,
      });
      expect(report.problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
      expect(report.ok).toBe(true);
      return sink.finish();
    }

    it('validates every element with zero problems', async () => {
      const project = await loadSample();
      const problems: string[] = [];
      for (const element of elementsOf(project)) {
        const kind = registry.get(element.kind);
        if (kind === undefined) throw new Error(`unknown kind ${element.kind}`);
        const node = context.schemaIndex.resolveSchemaRef(kind.schema);
        for (const problem of validateJson(element.data, node, {
          registries: context.registries,
        })) {
          problems.push(`${element.id} ${problem.path} ${problem.code}: ${problem.message}`);
        }
      }
      expect(problems).toEqual([]);
    });

    it('passes every project validator with no problems at all', async () => {
      const elements = elementsOf(await loadSample());
      const found = VALIDATORS.flatMap((validator) =>
        validator.validate({ elements, target, registry: context.registries }),
      );
      expect(found).toEqual([]);
    });

    it('reports exactly one feature-order error when a placed feature changes step in a second biome', async () => {
      const elements = elementsOf(await loadSample());
      const biome = elements.find((element) => element.kind === 'minecraft:worldgen/biome');
      const data = structuredClone(biome?.data) as { features: string[][] };
      const steps = target.worldgen.featureSteps;
      const vegetal = steps.indexOf('vegetal_decoration');
      const moved = `${NAMESPACE}:amber_tree_placed`;
      expect(data.features[vegetal]).toContain(moved);
      data.features[vegetal] = (data.features[vegetal] ?? []).filter((id) => id !== moved);
      data.features[vegetal - 1] = [...(data.features[vegetal - 1] ?? []), moved];
      const copy: Element = {
        ...(biome as Element),
        id: `${NAMESPACE}:amber_woods_copy`,
        data: data as unknown as Element['data'],
      };
      const found = VALIDATORS.flatMap((validator) =>
        validator.validate({
          elements: [...elements, copy],
          target,
          registry: context.registries,
        }),
      ).filter((problem) => problem.severity === 'error');
      expect(found.map((problem) => problem.code)).toEqual(['worldgen.feature-order']);
      expect(found[0]?.elementId).toBe(copy.id);
    });

    it('exports the resource pack with the English names', async () => {
      const files = unzipSync(await exportZip(resourcePackExporter));
      const lang = `assets/${NAMESPACE}/${target.folders.resource.lang}/en_us.json`;
      expect(JSON.parse(new TextDecoder().decode(files[lang]))).toEqual({
        [`biome.${NAMESPACE}.amber_woods`]: 'Amber Woods',
        [`generator.${NAMESPACE}.amber_world`]: 'Amber Woods',
      });
    });

    it('exports structure templates that read back with the same block counts', async () => {
      const project = await loadSample();
      const files = unzipSync(await exportZip(dataPackExporter, project));
      const templates = elementsOf(project).filter(
        (element) => element.kind === 'minecraft:structure_template',
      );
      expect(templates.length).toBe(3);
      const walk = chainWalk(files, target, context.vanilla);
      for (const template of templates) {
        const [namespace, path] = template.id.split(':') as [string, string];
        expect(
          files[`data/${namespace}/${target.folders.data.structure}/${path}.nbt`],
          template.id,
        ).toBeDefined();
        expect(walk.structureBlocks[template.id], template.id).toBe(
          (template.data as { blocks: unknown[] }).blocks.length,
        );
      }
    });

    it('resolves every link of the worldgen chain', async () => {
      const files = unzipSync(await exportZip(dataPackExporter));
      const walk = chainWalk(files, target, context.vanilla);
      expect(walk.errors).toEqual([]);
      const ns = NAMESPACE;
      expect(walk.visited).toEqual(
        [
          `structure ${ns}:hamlet/centre_hut`,
          `structure ${ns}:hamlet/lamp`,
          `structure ${ns}:hamlet/street`,
          `tag/worldgen/biome ${ns}:has_structure/hamlet`,
          `worldgen/biome ${ns}:amber_woods`,
          `worldgen/feature ${ns}:amber_tree`,
          `worldgen/feature ${ns}:rich_copper_ore`,
          `worldgen/placed_feature ${ns}:amber_tree_placed`,
          `worldgen/placed_feature ${ns}:rich_copper_ore_placed`,
          `worldgen/processor_list ${ns}:hamlet/mossy`,
          `worldgen/structure ${ns}:hamlet`,
          `worldgen/structure_set ${ns}:hamlets`,
          `worldgen/template_pool ${ns}:hamlet/centre`,
          `worldgen/template_pool ${ns}:hamlet/decorations`,
          `worldgen/template_pool ${ns}:hamlet/streets`,
          `worldgen/template_pool ${ns}:hamlet/terminators`,
          `worldgen/world_preset ${ns}:amber_world`,
        ].sort(),
      );
    });

    it('fails the chain walk on a copy with a pool removed', async () => {
      const files = unzipSync(await exportZip(dataPackExporter));
      const removed = `data/${NAMESPACE}/${target.folders.data.worldgen}/template_pool/hamlet/terminators.json`;
      expect(files[removed]).toBeDefined();
      const mutated = { ...files };
      delete mutated[removed];
      // The mutated copy still unzips; the walk reports the dangling fallback.
      const walk = chainWalk(unzipSync(zipSync(mutated)), target, context.vanilla);
      expect(walk.errors).toEqual([
        `pool ${NAMESPACE}:hamlet/streets -> worldgen/template_pool ${NAMESPACE}:hamlet/terminators: not in the pack or the vanilla registry`,
      ]);
    });

    describe('data zip', () => {
      const hashFile = join(fixturesRoot, target.id, 'sample-worldgen-data.sha256');
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
            hashes.push(sha256(await exportZip(dataPackExporter)));
          });
        }
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
