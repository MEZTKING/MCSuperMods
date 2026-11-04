/**
 * Cross-plugin check of the library's starters and examples (ADR 0020, plan D6): every
 * bundle is built into a project the way the app's session does it (`newProject`), saved,
 * reloaded with the real resource pack, data pack and library plugins, validated element by
 * element with the project's own registry ids, and exported as a resource pack and a data
 * pack with every function checked by the offline mcfunction service. Zero problems
 * (errors or warnings, so no unknown ids) are allowed, for every built-in target.
 *
 * The `examples/` folder at the repository root mirrors the library as ordinary MSM
 * projects: `examples/all-kinds/` (every per-kind example in one project) and
 * `examples/starters/<starter id>/` (each content starter). It is a golden: set
 * `UPDATE_GOLDENS=1` to rewrite it from the current library.
 */
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createElement,
  createEmptyProject,
  createMemoryFileSystem,
  ElementKindRegistry,
  isProjectRelativePath,
  loadProject,
  type MemoryFileSystem,
  type Project,
  type ProjectFileSystem,
  registerPlugin,
  saveProject,
  utf8,
} from '@msm/core';
import type {
  ContentBundle,
  ExampleProject,
  Exporter,
  Json,
  Plugin,
  Problem,
  ProjectStarter,
} from '@msm/plugin-api';
import dataPackPlugin from '@msm/plugin-datapack';
import libraryPlugin, { kindExamples, libraryExamples, libraryStarters } from '@msm/plugin-library';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import {
  createRegistryIndex,
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type RegistryIndex,
  type SchemaIndex,
  validateJson,
} from '@msm/schemas';
import { createMcfunctionService, type McfunctionService } from '@msm/schemas/mcfunction';
import { builtInTargets, readVendoredJson, type TargetBundle } from '@msm/targets';
import { beforeAll, describe, expect, it } from 'vitest';
import { createZipSink, dataPackExporter, resourcePackExporter, runExport } from '../src/index';

const update = process.env.UPDATE_GOLDENS === '1';

const here = dirname(fileURLToPath(import.meta.url));
const examplesRoot = join(here, '..', '..', '..', 'examples');

/** The app's built-in plugins, in its registration order. */
const PLUGINS: readonly Plugin[] = [resourcePackPlugin, dataPackPlugin, libraryPlugin];
const PACK_KIND = 'minecraft:pack_mcmeta';
const NOW = '2026-11-04T00:00:00.000Z';
const DEFAULT_TARGET = builtInTargets[0]?.target.id as string;

/** The content starters mirrored under `examples/starters/`. */
const MIRRORED_STARTERS = ['custom_ore', 'recipe_pack', 'music_disc', 'function_starter'];

function kindRegistry(): ElementKindRegistry {
  const registry = new ElementKindRegistry();
  for (const plugin of PLUGINS) registerPlugin(registry, plugin);
  return registry;
}

const registry = kindRegistry();

// Building projects as the app's session does -----------------------------------------------

interface BuiltProject {
  fs: MemoryFileSystem;
  project: Project;
}

/**
 * Builds a new project from bundles the way `ProjectSession.newProject` does: the default
 * target, the plugins that contribute kinds, a namespace, the bundles' elements (plus a
 * default `pack` element when none is given) and their assets, then saves it.
 */
async function buildProject(
  name: string,
  namespace: string,
  bundles: readonly ContentBundle[],
): Promise<BuiltProject> {
  const project = createEmptyProject(name, {
    targets: [DEFAULT_TARGET],
    plugins: PLUGINS.filter((plugin) => (plugin.contributes.elementKinds ?? []).length > 0).map(
      (plugin) => plugin.id,
    ),
  });
  project.namespaces.push({ name: namespace, elements: [], assets: [] });
  const entries = bundles.flatMap((bundle) => bundle.elements);
  if (!entries.some((entry) => entry.kind === PACK_KIND)) {
    const data = structuredClone(registry.get(PACK_KIND)?.defaultData ?? {}) as Json;
    entries.unshift({ id: `${namespace}:pack`, kind: PACK_KIND, data });
  }
  const fs = createMemoryFileSystem();
  const seen = new Set<string>();
  for (const entry of entries) {
    expect(registry.get(entry.kind), `${entry.id} kind ${entry.kind}`).toBeDefined();
    expect(seen.has(entry.id), `duplicate element ${entry.id}`).toBe(false);
    seen.add(entry.id);
    const element = createElement({
      id: entry.id,
      kind: entry.kind,
      data: structuredClone(entry.data),
      now: () => NOW,
      ...(entry.notes === undefined ? {} : { notes: entry.notes }),
      ...(entry.tags === undefined ? {} : { tags: entry.tags }),
    });
    const ns = entry.id.slice(0, entry.id.indexOf(':'));
    let target = project.namespaces.find((candidate) => candidate.name === ns);
    if (target === undefined) {
      target = { name: ns, elements: [], assets: [] };
      project.namespaces.push(target);
    }
    target.elements.push(element);
  }
  const assetPaths = new Set<string>();
  for (const bundle of bundles) {
    for (const asset of bundle.assets) {
      const key = `${asset.namespace}/${asset.path}`;
      expect(assetPaths.has(key), `duplicate asset ${key}`).toBe(false);
      assetPaths.add(key);
      const file = `assets/${key}`;
      await fs.mkdirp(file.slice(0, file.lastIndexOf('/')));
      await fs.writeFile(file, asset.bytes);
      let target = project.namespaces.find((candidate) => candidate.name === asset.namespace);
      if (target === undefined) {
        target = { name: asset.namespace, elements: [], assets: [] };
        project.namespaces.push(target);
      }
      target.assets.push({ path: asset.path, mediaType: 'image/png' });
    }
  }
  project.namespaces.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  await saveProject(fs, project, registry);
  return { fs, project };
}

/** Saves and reloads a built project, expecting zero load problems. */
async function reload(fs: ProjectFileSystem): Promise<Project> {
  const { project, problems } = await loadProject(fs, registry);
  expect(problems).toEqual([]);
  return project;
}

// Registry ids, as the app's schema context derives them --------------------------------------

const DATA_REGISTRY_KINDS = new Set([
  'advancement',
  'banner_pattern',
  'chat_type',
  'damage_type',
  'dialog',
  'dimension_type',
  'enchantment',
  'function',
  'item_modifier',
  'jukebox_song',
  'loot_table',
  'painting_variant',
  'predicate',
  'recipe',
  'trim_material',
  'trim_pattern',
]);

/** The game always defines these function tags; mcmeta does not list them. */
const SEEDED = { 'tag/function': ['load', 'tick'] };

function between(path: string, prefix: string, suffix: string): string | undefined {
  if (!path.startsWith(prefix) || !path.endsWith(suffix)) return undefined;
  const middle = path.slice(prefix.length, path.length - suffix.length);
  return middle === '' ? undefined : middle;
}

/** A copy of the app's `projectRegistryIds` (the app cannot be imported here). */
function projectRegistryIds(project: Project): Record<string, string[]> {
  const ids: Record<string, string[]> = { model: [], sound: [], texture: [] };
  const add = (registry: string, id: string): void => {
    const list = ids[registry] ?? [];
    list.push(id);
    ids[registry] = list;
  };
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const name = element.kind.replace(/^minecraft:/, '');
      if (name === 'model') add('model', element.id);
      else if (DATA_REGISTRY_KINDS.has(name) || name.startsWith('tag/')) add(name, element.id);
    }
    for (const asset of namespace.assets) {
      const texture = between(asset.path, 'textures/', '.png');
      if (texture !== undefined) add('texture', `${namespace.name}:${texture}`);
      const sound = between(asset.path, 'sounds/', '.ogg');
      if (sound !== undefined) add('sound', `${namespace.name}:${sound}`);
    }
  }
  for (const list of Object.values(ids)) list.sort();
  return ids;
}

// Per-target context --------------------------------------------------------------------------

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

interface TargetContext {
  schemaIndex: SchemaIndex;
  vanilla: Record<string, string[]>;
  mcfunction: McfunctionService;
}

async function contextFor(bundle: TargetBundle): Promise<TargetContext> {
  const read = (key: Parameters<typeof readVendoredJson>[1]) =>
    readVendoredJson(bundle, key, nodeReadFile);
  const [symbols, registries, commands, blocks] = await Promise.all([
    read('vanillaMcdocSymbols'),
    read('mcmetaRegistries'),
    read('mcmetaCommands'),
    read('mcmetaBlocks'),
  ]);
  const vanilla = { ...(registries as Record<string, string[]>) };
  for (const [name, ids] of Object.entries(SEEDED)) {
    vanilla[name] = [...new Set([...(vanilla[name] ?? []), ...ids])];
  }
  return {
    schemaIndex: createSchemaIndex(parseVanillaMcdocSymbols(symbols), {
      mcVersion: bundle.target.mcVersion,
    }),
    vanilla,
    mcfunction: await createMcfunctionService(
      { commands, blocks, registries: registries as Record<string, string[]> },
      { mcVersion: bundle.target.mcVersion },
    ),
  };
}

/** Problems of every element, validated like the app's Problems panel does. */
function elementProblems(
  project: Project,
  schemaIndex: SchemaIndex,
  registries: RegistryIndex,
): string[] {
  const out: string[] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const kind = registry.get(element.kind);
      if (kind === undefined) {
        out.push(`${element.id}: unknown kind ${element.kind}`);
        continue;
      }
      const hidden = kind.hiddenPaths ?? [];
      const node = schemaIndex.resolveSchemaRef(kind.schema);
      for (const problem of validateJson(element.data, node, { registries })) {
        if (hidden.some((path) => problem.path === path || problem.path.startsWith(`${path}/`))) {
          continue;
        }
        out.push(`${element.id} ${problem.path} ${problem.code}: ${problem.message}`);
      }
    }
  }
  return out;
}

const meta = { msmVersion: '0.2.1', plugins: ['msm.resourcepack', 'msm.datapack'] };

async function exportProblems(
  bundle: TargetBundle,
  context: TargetContext,
  fs: ProjectFileSystem,
  project: Project,
  registries: RegistryIndex,
  ids: Record<string, string[]>,
  exporter: Exporter,
): Promise<{ problems: Problem[]; ok: boolean; files: string[] }> {
  const report = await runExport({
    project,
    registry,
    target: bundle.target,
    schemaIndex: context.schemaIndex,
    registries,
    exporter,
    sink: createZipSink(),
    readAsset: (namespace, path) => fs.readFile(`assets/${namespace}/${path}`),
    meta,
    async validateText(file) {
      if (file.language !== 'mcfunction') return [];
      const source = utf8.decode(file.contents as Uint8Array).replace(/\n$/, '');
      const found = await context.mcfunction.check(source, {
        uri: `file:///msm/${file.path}`,
        projectIds: ids,
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
  return { problems: report.problems, ok: report.ok, files: report.files };
}

/** Builds, reloads, validates and exports one project; expects zero problems throughout. */
async function checkProject(
  bundle: TargetBundle,
  context: TargetContext,
  built: BuiltProject,
): Promise<{ resourceFiles: string[]; dataFiles: string[] }> {
  const project = await reload(built.fs);
  const ids = projectRegistryIds(project);
  const registries = createRegistryIndex({ vanilla: context.vanilla, project: ids });
  expect(elementProblems(project, context.schemaIndex, registries)).toEqual([]);
  const results: string[][] = [];
  for (const exporter of [resourcePackExporter, dataPackExporter]) {
    const report = await exportProblems(
      bundle,
      context,
      built.fs,
      project,
      registries,
      ids,
      exporter,
    );
    expect(report.problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
    expect(report.ok).toBe(true);
    results.push(report.files);
  }
  return { resourceFiles: results[0] ?? [], dataFiles: results[1] ?? [] };
}

// Mirror -------------------------------------------------------------------------------------

interface MirrorProject {
  folder: string;
  build(): Promise<BuiltProject>;
}

function starterById(id: string): ProjectStarter {
  const starter = libraryStarters.find((entry) => entry.id === id);
  if (starter === undefined) throw new Error(`No starter ${id}`);
  return starter;
}

const MIRROR: readonly MirrorProject[] = [
  {
    folder: 'all-kinds',
    build: () =>
      buildProject(
        'MSM Examples',
        'msm_examples',
        kindExamples.map((example) =>
          example.build({ namespace: 'msm_examples', projectName: 'MSM Examples' }),
        ),
      ),
  },
  ...MIRRORED_STARTERS.map((id) => ({
    folder: `starters/${id}`,
    build: () => {
      const starter = starterById(id);
      return buildProject(starter.title, 'msm_starter', [
        starter.build({ namespace: 'msm_starter', projectName: starter.title }),
      ]);
    },
  })),
];

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

/** A read-only file system over a mirror folder. */
function diskFs(root: string): ProjectFileSystem {
  const resolve = (path: string): string => join(root, ...path.split('/'));
  const readOnly = async (): Promise<never> => {
    throw new Error('The examples mirror is read-only in tests.');
  };
  return {
    readFile: async (path) => new Uint8Array(await readFile(resolve(path))),
    async readDir(path) {
      const entries = await readdir(resolve(path), { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() || entry.isDirectory())
        .map((entry) => ({ name: entry.name, kind: entry.isDirectory() ? 'directory' : 'file' }));
    },
    async exists(path) {
      try {
        await stat(resolve(path));
        return true;
      } catch {
        return false;
      }
    },
    writeFile: readOnly,
    mkdirp: readOnly,
    remove: readOnly,
  };
}

// Tests --------------------------------------------------------------------------------------

describe('library bundles', () => {
  it('registers with the other built-in plugins and uses only registered kinds', () => {
    const kinds = new Set(registry.all().map((kind) => kind.id));
    for (const entry of [...libraryStarters, ...libraryExamples]) {
      for (const kind of entry.requiresKinds)
        expect(kinds.has(kind), `${entry.id} ${kind}`).toBe(true);
    }
  });

  it('has one per-kind example for every registered kind', () => {
    const kinds = registry
      .all()
      .map((kind) => kind.id)
      .sort();
    expect(kindExamples.map((example: ExampleProject) => example.kind).sort()).toEqual(kinds);
  });

  it('builds assets the app accepts: lower-case names inside a folder, valid PNGs', () => {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (const entry of [...libraryStarters, ...libraryExamples]) {
      const bundle = entry.build({ namespace: 'demo', projectName: 'Demo' });
      for (const asset of bundle.assets) {
        const slash = asset.path.lastIndexOf('/');
        expect(slash, asset.path).toBeGreaterThan(0);
        expect(isProjectRelativePath(asset.path.slice(0, slash)), asset.path).toBe(true);
        expect(asset.path.slice(slash + 1), asset.path).toMatch(/^[a-z0-9_.-]+\.png$/);
        expect(asset.path.startsWith('textures/'), asset.path).toBe(true);
        expect([...asset.bytes.subarray(0, 8)], asset.path).toEqual(png);
      }
    }
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'library content (%s)',
  (_id, bundle) => {
    let context: TargetContext;

    beforeAll(async () => {
      context = await contextFor(bundle);
    }, 60_000);

    it.each(libraryStarters.map((starter) => [starter.id, starter] as const))(
      'starter %s loads, validates and exports with zero problems',
      async (_starterId, starter) => {
        const built = await buildProject('Library Test', 'demo', [
          starter.build({ namespace: 'demo', projectName: 'Library Test' }),
        ]);
        const files = await checkProject(bundle, context, built);
        if (starter.layers.includes('resourcepack') && starter.category !== 'blank') {
          expect(files.resourceFiles.some((path) => path.startsWith('assets/'))).toBe(true);
        }
        if (starter.layers.includes('datapack') && starter.category !== 'blank') {
          expect(files.dataFiles.some((path) => path.startsWith('data/'))).toBe(true);
        }
      },
    );

    it.each(libraryExamples.map((example) => [example.id, example] as const))(
      'example %s loads, validates and exports with zero problems',
      async (_exampleId, example) => {
        const bundleData = example.build({ namespace: 'demo', projectName: 'Library Test' });
        for (const entry of bundleData.elements) {
          expect(entry.tags, entry.id).toContain('example');
        }
        expect(bundleData.elements.some((entry) => (entry.notes ?? '').length > 0)).toBe(true);
        const built = await buildProject('Library Test', 'demo', [bundleData]);
        await checkProject(bundle, context, built);
      },
    );

    it('the Custom ore starter reskins emerald ore (ADR 0020, D4)', async () => {
      const built = await buildProject('Ore', 'demo', [
        starterById('custom_ore').build({ namespace: 'demo', projectName: 'Ore' }),
      ]);
      const { resourceFiles, dataFiles } = await checkProject(bundle, context, built);
      const resource = bundle.target.folders.resource;
      const data = bundle.target.folders.data;
      expect(resourceFiles).toEqual(
        expect.arrayContaining([
          `assets/demo/${resource.textures}/block/ruby_ore.png`,
          `assets/minecraft/${resource.block_definition}/emerald_ore.json`,
          `assets/minecraft/${resource.item_definition}/emerald.json`,
          `assets/minecraft/${resource.lang}/en_us.json`,
          'pack.mcmeta',
        ]),
      );
      expect(dataFiles).toEqual(
        expect.arrayContaining([
          `data/minecraft/${data.loot_table}/blocks/emerald_ore.json`,
          `data/demo/${data.recipe}/ruby_block.json`,
          `data/demo/${data.advancement}/root.json`,
          `data/demo/${data.advancement}/get_ruby.json`,
          'pack.mcmeta',
        ]),
      );
    });

    it.each(MIRROR.map((entry) => [entry.folder, entry] as const))(
      'mirror project %s loads, validates and exports with zero problems',
      async (_folder, entry) => {
        await checkProject(bundle, context, await entry.build());
      },
    );
  },
);

describe('examples/ mirror', () => {
  it.each(MIRROR.map((entry) => [entry.folder, entry] as const))(
    '%s equals the generated project',
    async (folder, entry) => {
      const root = join(examplesRoot, ...folder.split('/'));
      const { fs } = await entry.build();
      const generated = fs.snapshot();
      if (update) {
        await rm(root, { recursive: true, force: true });
        for (const [path, bytes] of Object.entries(generated)) {
          const file = join(root, ...path.split('/'));
          await mkdir(dirname(file), { recursive: true });
          await writeFile(file, bytes);
        }
      }
      expect(await listFiles(root)).toEqual(Object.keys(generated).sort());
      for (const [path, bytes] of Object.entries(generated)) {
        const onDisk = new Uint8Array(await readFile(join(root, ...path.split('/'))));
        expect(Buffer.from(onDisk).equals(Buffer.from(bytes)), path).toBe(true);
      }
      // It opens in the app as it is, with zero load problems.
      await reload(diskFs(root));
    },
  );
});
