/**
 * Cross-plugin check of the library's starters and examples (ADR 0020, plan D6): every
 * bundle is built into a project the way the app's session does it (`newProject`), saved,
 * reloaded with the real built-in plugins (resource pack, data pack, structures, worldgen,
 * blocks and items, entities, models and animations, scripting, library), validated element by element
 * with the project's own registry ids, and exported as a resource pack and a data pack with
 * every function checked by the offline mcfunction service; projects with `msm:` elements are
 * also exported as a Fabric mod jar (separate runtime, so no runtime or GeckoLib jar is
 * needed; the Custom mob starter is also exported with stub runtime and GeckoLib jars
 * nested). Projects with scripts export with a stub `transpileScript` that returns the source
 * unchanged, and every library script is parsed and type-checked against the generated
 * `msm-runtime.d.ts` with the real `typescript` package. Zero problems (errors or warnings, so
 * no unknown ids) are allowed, for every built-in target.
 *
 * The `examples/` folder at the repository root mirrors the library as ordinary MSM
 * projects: `examples/all-kinds/` (every per-kind example in one project),
 * `examples/blocks-items/` (the blocks and items behaviour examples), `examples/entities/`
 * (the entity behaviour examples), `examples/scripts/` (the script behaviour examples) and
 * `examples/starters/<starter id>/` (each content starter). It is a golden: set
 * `UPDATE_GOLDENS=1` to rewrite it from the current library.
 */
import { readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
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
  requireSyncResult,
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
  TargetFacts,
} from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import entitiesPlugin from '@msm/plugin-entities';
import libraryPlugin, {
  behaviourExamples,
  entityBehaviourExamples,
  kindExamples,
  libraryExamples,
  libraryStarters,
  scriptBehaviourExamples,
} from '@msm/plugin-library';
import modelsAnimPlugin from '@msm/plugin-models-anim';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import scriptingPlugin, { MSM_RUNTIME_TYPINGS } from '@msm/plugin-scripting';
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
import {
  collectProjectObjectives,
  createMcfunctionService,
  type McfunctionService,
} from '@msm/schemas/mcfunction';
import {
  builtInTargets,
  defaultTargetId,
  readVendoredJson,
  type TargetBundle,
  targetById,
} from '@msm/targets';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import { nestedGeckolibPath } from '../src/fabric-content-jar/index';
import {
  createFabricContentJarExporter,
  createMemorySink,
  dataPackExporter,
  nestedRuntimePath,
  resourcePackExporter,
  runExport,
} from '../src/index';

const update = process.env.UPDATE_GOLDENS === '1';

const here = dirname(fileURLToPath(import.meta.url));
const examplesRoot = join(here, '..', '..', '..', 'examples');

/** The app's built-in plugins, in its registration order. */
const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  structuresPlugin,
  worldgenPlugin,
  blocksItemsPlugin,
  entitiesPlugin,
  modelsAnimPlugin,
  scriptingPlugin,
  libraryPlugin,
];
const PACK_KIND = 'minecraft:pack_mcmeta';
const NOW = '2026-11-04T00:00:00.000Z';
/** The target new projects get: the newest release target (ADR 0037 D4). */
const DEFAULT_TARGET = defaultTargetId;
const DEFAULT_BUNDLE = targetById(DEFAULT_TARGET) as TargetBundle;

/** Whether a starter or example is offered on `target` (`supports`, ADR 0036 D4). */
const supported = (entry: ProjectStarter | ExampleProject, target: TargetFacts): boolean =>
  entry.supports?.(target) ?? true;

/**
 * Builds a library starter or example for a target (the default target unless given), with
 * every parameter at its default as the host passes them (ADR 0036). Built-ins build
 * synchronously.
 */
function buildEntry(
  entry: ProjectStarter | ExampleProject,
  namespace: string,
  projectName: string,
  target: TargetFacts = DEFAULT_BUNDLE.target,
): ContentBundle {
  const parameters = 'parameters' in entry ? (entry.parameters ?? []) : [];
  const values = Object.fromEntries(
    parameters.map((parameter) => [parameter.id, parameter.default]),
  );
  return requireSyncResult(entry.build({ namespace, projectName, target, values }), entry.id);
}

/** The content starters mirrored under `examples/starters/`. */
const MIRRORED_STARTERS = [
  'custom_ore',
  'recipe_pack',
  'music_disc',
  'function_starter',
  'custom_biome',
  'jigsaw_structure',
  'worldgen_pack',
  'custom_mob',
  'scripted_ore',
];

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

/** Resource pack kinds whose element ids are not data registry ids (as in the app). */
const NON_DATA_KINDS = new Set([
  'minecraft:block_definition',
  'minecraft:item_definition',
  'minecraft:lang',
  'minecraft:model',
  'minecraft:pack_mcmeta',
  'minecraft:sounds',
]);

/**
 * A copy of the app's `projectRegistryIds` (the app cannot be imported here): a registered
 * kind's ids go to `ElementKind.registry`, else to the kind id without `minecraft:`; a kind
 * of another namespace counts only with a plain registry name (no `:`). An element in the
 * `block` registry also registers its block item under the same id (any `item` but `false`),
 * so its id goes to `item` too. An element in the `entity_type` registry with a spawn egg
 * (any `spawn_egg` but `false`) registers the item `<id>_spawn_egg`, and an egg with a
 * texture also gets the generated item model `<ns>:item/<path>_spawn_egg` (as lowering
 * writes it). `msm:script` has no registry, so script ids register nothing.
 */
function projectRegistryIds(project: Project): Record<string, string[]> {
  const ids: Record<string, string[]> = { model: [], sound: [], sound_event: [], texture: [] };
  const add = (name: string, id: string): void => {
    const list = ids[name] ?? [];
    list.push(id);
    ids[name] = list;
  };
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const kind = registry.get(element.kind);
      const name = kind?.registry ?? element.kind.replace(/^minecraft:/, '');
      if (name.includes(':')) continue;
      if (
        name === 'block' &&
        typeof element.data === 'object' &&
        element.data !== null &&
        (element.data as { item?: unknown }).item !== false
      ) {
        add('item', element.id);
      }
      if (name === 'entity_type' && typeof element.data === 'object' && element.data !== null) {
        const egg = (element.data as { spawn_egg?: unknown }).spawn_egg;
        if (egg !== undefined && egg !== false) {
          add('item', `${element.id}_spawn_egg`);
          const texture = (egg as { texture?: unknown }).texture;
          if (typeof texture === 'string' && texture !== '') {
            const path = element.id.slice(element.id.indexOf(':') + 1);
            add('model', `${namespace.name}:item/${path}_spawn_egg`);
          }
        }
      }
      if (name === 'model') add('model', element.id);
      else if (name === 'sounds' && typeof element.data === 'object' && element.data !== null) {
        for (const key of Object.keys(element.data)) {
          if (key !== '') add('sound_event', `${namespace.name}:${key}`);
        }
      } else if (
        DATA_REGISTRY_KINDS.has(name) ||
        name.startsWith('tag/') ||
        (kind !== undefined && !NON_DATA_KINDS.has(element.kind))
      ) {
        add(name, element.id);
      }
    }
    for (const asset of namespace.assets) {
      const texture = between(asset.path, 'textures/', '.png');
      if (texture !== undefined) add('texture', `${namespace.name}:${texture}`);
      const sound = between(asset.path, 'sounds/', '.ogg');
      if (sound !== undefined) add('sound', `${namespace.name}:${sound}`);
    }
  }
  for (const [registry, list] of Object.entries(ids)) ids[registry] = [...new Set(list)].sort();
  return ids;
}

/**
 * The ids the app's mcfunction checker declares (`mcfunctionProjectIds`): the data pack
 * registries, the seeded function tags and, under `objective`, the scoreboard objectives any
 * project function creates.
 */
function mcfunctionIds(project: Project, ids: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [registry, list] of Object.entries(ids)) {
    if (DATA_REGISTRY_KINDS.has(registry) || registry.startsWith('tag/')) out[registry] = list;
  }
  out['tag/function'] = [
    ...new Set([...(out['tag/function'] ?? []), 'minecraft:load', 'minecraft:tick']),
  ].sort();
  const sources: string[] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const lines = (element.data as { lines?: unknown }).lines;
      if (element.kind === 'minecraft:function' && Array.isArray(lines)) {
        sources.push(lines.filter((line) => typeof line === 'string').join('\n'));
      }
    }
  }
  const objective = collectProjectObjectives(sources);
  if (objective.length > 0) out.objective = objective;
  return out;
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

/** Every built-in plugin's project validators, as the app's session runs them. */
const VALIDATORS = PLUGINS.flatMap((plugin) => plugin.contributes.validators ?? []);

/** The problems of every validator over the project's elements. */
function validatorProblems(
  project: Project,
  target: TargetBundle['target'],
  registries: RegistryIndex,
): Problem[] {
  const elements = project.namespaces.flatMap((namespace) => namespace.elements);
  return VALIDATORS.flatMap((validator) =>
    requireSyncResult(validator.validate({ elements, target, registry: registries }), validator.id),
  );
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
  options: Record<string, Json> = {},
): Promise<{
  problems: Problem[];
  ok: boolean;
  files: string[];
  contents: Map<string, Uint8Array>;
}> {
  const functionIds = mcfunctionIds(project, ids);
  const sink = createMemorySink();
  const report = await runExport({
    project,
    registry,
    target: bundle.target,
    schemaIndex: context.schemaIndex,
    registries,
    exporter,
    sink,
    readAsset: (namespace, path) => fs.readFile(`assets/${namespace}/${path}`),
    meta,
    options,
    async validateText(file) {
      if (file.language !== 'mcfunction') return [];
      const source = utf8.decode(file.contents as Uint8Array).replace(/\n$/, '');
      const found = await context.mcfunction.check(source, {
        uri: `file:///msm/${file.path}`,
        projectIds: functionIds,
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
  return { problems: report.problems, ok: report.ok, files: report.files, contents: sink.files() };
}

/** Stand-ins for the runtime and GeckoLib jars, nested only by the Custom mob starter test. */
const STUB_RUNTIME_JAR = utf8.encode('PK stub msm_runtime jar');
const STUB_GECKOLIB_JAR = utf8.encode('PK stub GeckoLib jar');

/**
 * A stand-in for the host's TypeScript transpiler (ADR 0031 D5): it returns the source
 * unchanged, so the test needs no transpiler options. It is spread into the exporter options
 * so the test also compiles against an exporter without the hook.
 */
const stubTranspiler = {
  transpileScript: async (source: string, _name: string): Promise<{ js: string }> => ({
    js: source,
  }),
};

/**
 * The Fabric mod jar exporter. Most exports set `separateRuntime`, so nothing is nested; the
 * stub loaders serve the Custom mob starter test, which nests both jars.
 */
const contentJarExporter = createFabricContentJarExporter({
  loadRuntimeJar: async () => STUB_RUNTIME_JAR,
  loadGeckolibJar: async () => STUB_GECKOLIB_JAR,
  ...stubTranspiler,
});

/** Whether a project has elements of `msm:` kinds, which only the Fabric mod jar carries. */
const hasMsmElements = (project: Project): boolean =>
  project.namespaces.some((namespace) =>
    namespace.elements.some((element) => element.kind.startsWith('msm:')),
  );

/**
 * Builds, reloads, validates and exports one project; expects zero problems throughout.
 * `jarFiles` is empty for a project without `msm:` elements.
 */
async function checkProject(
  bundle: TargetBundle,
  context: TargetContext,
  built: BuiltProject,
): Promise<{ resourceFiles: string[]; dataFiles: string[]; jarFiles: string[] }> {
  const project = await reload(built.fs);
  const ids = projectRegistryIds(project);
  const registries = createRegistryIndex({ vanilla: context.vanilla, project: ids });
  expect(elementProblems(project, context.schemaIndex, registries)).toEqual([]);
  const validated = validatorProblems(project, bundle.target, registries);
  expect(validated.filter((problem) => problem.severity === 'error')).toEqual([]);
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
  let jarFiles: string[] = [];
  if (hasMsmElements(project)) {
    const report = await exportProblems(
      bundle,
      context,
      built.fs,
      project,
      registries,
      ids,
      contentJarExporter,
      { separateRuntime: true },
    );
    expect(report.problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
    expect(report.ok).toBe(true);
    jarFiles = report.files;
  }
  return { resourceFiles: results[0] ?? [], dataFiles: results[1] ?? [], jarFiles };
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
        kindExamples.map((example) => buildEntry(example, 'msm_examples', 'MSM Examples')),
      ),
  },
  {
    folder: 'blocks-items',
    build: () =>
      buildProject(
        'MSM Blocks and Items Examples',
        'msm_examples',
        behaviourExamples.map((example) =>
          buildEntry(example, 'msm_examples', 'MSM Blocks and Items Examples'),
        ),
      ),
  },
  {
    folder: 'entities',
    build: () =>
      buildProject(
        'MSM Entity Examples',
        'msm_examples',
        entityBehaviourExamples.map((example) =>
          buildEntry(example, 'msm_examples', 'MSM Entity Examples'),
        ),
      ),
  },
  {
    folder: 'scripts',
    build: () =>
      buildProject(
        'MSM Script Examples',
        'msm_examples',
        scriptBehaviourExamples.map((example) =>
          buildEntry(example, 'msm_examples', 'MSM Script Examples'),
        ),
      ),
  },
  ...MIRRORED_STARTERS.map((id) => ({
    folder: `starters/${id}`,
    build: () => {
      const starter = starterById(id);
      return buildProject(starter.title, 'msm_starter', [
        buildEntry(starter, 'msm_starter', starter.title),
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

// Scripts ------------------------------------------------------------------------------------

/** Every `msm:script` of the library's starters and examples, as `[label, source]`. */
function libraryScripts(): [string, string][] {
  const out: [string, string][] = [];
  for (const entry of [...libraryStarters, ...libraryExamples]) {
    for (const element of buildEntry(entry, 'demo', 'Demo').elements) {
      if (element.kind !== 'msm:script') continue;
      const lines = (element.data as { lines: string[] }).lines;
      out.push([`${entry.id} ${element.id}`, `${lines.join('\n')}\n`]);
    }
  }
  return out;
}

/** The syntax errors TypeScript reports for `source`. */
function syntaxErrors(source: string): string[] {
  const file = ts.createSourceFile('script.ts', source, ts.ScriptTarget.Latest, true);
  return (file as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics.map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, '\n'),
  );
}

/**
 * Type-checks `script` against the generated typings with `lib.es5` only, as the scripting
 * plugin's own template test does.
 */
function typeCheck(script: string): string[] {
  const libDir = dirname(createRequire(import.meta.url).resolve('typescript/lib/lib.es5.d.ts'));
  const files = new Map<string, string>([
    ['/msm-runtime.d.ts', MSM_RUNTIME_TYPINGS],
    ['/script.ts', script],
  ]);
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2018,
    module: ts.ModuleKind.CommonJS,
    lib: ['lib.es5.d.ts'],
    types: [],
  };
  const host = ts.createCompilerHost(options);
  host.getDefaultLibLocation = () => libDir;
  host.getSourceFile = (fileName, languageVersion) => {
    const text =
      files.get(fileName) ?? readFileSync(join(libDir, fileName.split('/').pop() ?? ''), 'utf8');
    return ts.createSourceFile(fileName, text, languageVersion);
  };
  host.fileExists = (fileName) => files.has(fileName) || fileName.startsWith(libDir);
  host.readFile = (fileName) => files.get(fileName);
  const program = ts.createProgram(['/msm-runtime.d.ts', '/script.ts'], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
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

  it('has scripts in the Scripted ore starter and the three script examples', () => {
    expect(libraryScripts().map(([label]) => label)).toEqual([
      'scripted_ore demo:ore_glow',
      'scripted_ore demo:ruby_block_guard',
      'scripted_ore demo:welcome',
      'example_msm_script demo:lodestone_compass',
      'example_msm_script_schedule demo:amethyst_spiral',
      'example_msm_script_action demo:chime_handler',
    ]);
  });

  it.each(libraryScripts())('script %s parses and type-checks against the typings', (_, source) => {
    expect(syntaxErrors(source)).toEqual([]);
    expect(typeCheck(source)).toEqual([]);
  });

  it('builds assets the app accepts: lower-case names inside a folder, valid PNGs', () => {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (const entry of [...libraryStarters, ...libraryExamples]) {
      const bundle = buildEntry(entry, 'demo', 'Demo');
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

    const starters = libraryStarters.filter((starter) => supported(starter, bundle.target));
    const examples = libraryExamples.filter((example) => supported(example, bundle.target));

    it('hides the entries that need GeckoLib on a target without it', () => {
      const withEntities = [...libraryStarters, ...libraryExamples].filter((entry) =>
        entry.requiresKinds.includes('msm:entity'),
      );
      expect(withEntities.map((entry) => entry.id)).toContain('custom_mob');
      for (const entry of withEntities) {
        expect(supported(entry, bundle.target), entry.id).toBe(
          bundle.target.geckolib !== undefined,
        );
      }
      expect(starters.some((starter) => starter.id === 'custom_mob')).toBe(
        bundle.target.geckolib !== undefined,
      );
    });

    it.each(starters.map((starter) => [starter.id, starter] as const))(
      'starter %s loads, validates and exports with zero problems',
      async (_starterId, starter) => {
        const built = await buildProject('Library Test', 'demo', [
          buildEntry(starter, 'demo', 'Library Test', bundle.target),
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

    it.each(examples.map((example) => [example.id, example] as const))(
      'example %s loads, validates and exports with zero problems',
      async (_exampleId, example) => {
        const bundleData = buildEntry(example, 'demo', 'Library Test', bundle.target);
        for (const entry of bundleData.elements) {
          expect(entry.tags, entry.id).toContain('example');
        }
        expect(bundleData.elements.some((entry) => (entry.notes ?? '').length > 0)).toBe(true);
        const built = await buildProject('Library Test', 'demo', [bundleData]);
        await checkProject(bundle, context, built);
      },
    );

    it('the Custom ore starter adds a real ruby ore, ruby and block of ruby (ADR 0025)', async () => {
      const built = await buildProject('Ore', 'demo', [
        buildEntry(starterById('custom_ore'), 'demo', 'Ore', bundle.target),
      ]);
      const { resourceFiles, dataFiles, jarFiles } = await checkProject(bundle, context, built);
      const resource = bundle.target.folders.resource;
      const data = bundle.target.folders.data;
      const assets = [
        `assets/demo/${resource.textures}/block/ruby_ore.png`,
        `assets/demo/${resource.textures}/block/ruby_block.png`,
        `assets/demo/${resource.textures}/item/ruby.png`,
        `assets/demo/${resource.block_definition}/ruby_ore.json`,
        `assets/demo/${resource.block_definition}/ruby_block.json`,
        `assets/demo/${resource.item_definition}/ruby_ore.json`,
        `assets/demo/${resource.item_definition}/ruby_block.json`,
        `assets/demo/${resource.item_definition}/ruby.json`,
        `assets/demo/${resource.lang}/en_us.json`,
      ];
      const datafiles = [
        `data/demo/${data.loot_table}/blocks/ruby_ore.json`,
        `data/demo/${data.loot_table}/blocks/ruby_block.json`,
        `data/demo/${data.recipe}/ruby_block_from_rubies.json`,
        `data/demo/${data.recipe}/ruby_from_block.json`,
        `data/demo/${data.recipe}/ruby_from_smelting.json`,
        `data/demo/${data.advancement}/root.json`,
        `data/demo/${data.advancement}/get_ruby.json`,
        `data/minecraft/${data.tags}/block/mineable/pickaxe.json`,
        `data/minecraft/${data.tags}/block/needs_iron_tool.json`,
      ];
      expect(resourceFiles).toEqual(expect.arrayContaining([...assets, 'pack.mcmeta']));
      expect(dataFiles).toEqual(expect.arrayContaining([...datafiles, 'pack.mcmeta']));
      // Nothing is overridden in the minecraft namespace of the resource pack any more.
      expect(resourceFiles.some((path) => path.startsWith('assets/minecraft/'))).toBe(false);
      // The vanilla packs leave the runtime definitions out; the mod jar carries everything.
      for (const files of [resourceFiles, dataFiles]) {
        expect(files.some((path) => path.startsWith('msm/'))).toBe(false);
        expect(files).not.toContain('fabric.mod.json');
      }
      expect(jarFiles).toEqual(
        expect.arrayContaining([
          ...assets,
          ...datafiles,
          'msm/demo/block/ruby_ore.json',
          'msm/demo/block/ruby_block.json',
          'msm/demo/item/ruby.json',
          'fabric.mod.json',
        ]),
      );
      expect(jarFiles).not.toContain('pack.mcmeta');
    });

    it('the Scripted ore starter exports its scripts in the Fabric mod jar only (ADRs 0031, 0032)', async () => {
      const built = await buildProject('Scripted', 'demo', [
        buildEntry(starterById('scripted_ore'), 'demo', 'Scripted', bundle.target),
      ]);
      const { resourceFiles, dataFiles, jarFiles } = await checkProject(bundle, context, built);
      for (const files of [resourceFiles, dataFiles]) {
        expect(files.some((path) => path.startsWith('msm/'))).toBe(false);
      }
      const scripts = ['ore_glow', 'ruby_block_guard', 'welcome'];
      // With the exporter's transpileScript hook (B136) the jar holds `.js`; without it, `.ts`.
      const extension = jarFiles.includes('msm/demo/script/ore_glow.js') ? 'js' : 'ts';
      expect(jarFiles).toEqual(
        expect.arrayContaining([
          ...scripts.map((name) => `msm/demo/script/${name}.${extension}`),
          'msm/demo/block/ruby_ore.json',
          'msm/demo/block/ruby_block.json',
          'msm/demo/item/ruby.json',
          'fabric.mod.json',
        ]),
      );
      if (extension === 'js') {
        expect(jarFiles.filter((path) => path.endsWith('.ts'))).toEqual([]);
      }

      const project = await reload(built.fs);
      const ids = projectRegistryIds(project);
      const registries = createRegistryIndex({ vanilla: context.vanilla, project: ids });
      const report = await exportProblems(
        bundle,
        context,
        built.fs,
        project,
        registries,
        ids,
        contentJarExporter,
        { separateRuntime: true },
      );
      const json = (path: string): Record<string, unknown> =>
        JSON.parse(utf8.decode(report.contents.get(path) as Uint8Array));
      expect(json('msm/demo/block/ruby_block.json')).toMatchObject({
        components: { 'msm:on_step': { event: 'demo:ruby_block_step', cooldown_ticks: 20 } },
        events: {
          'demo:ruby_block_step': { actions: [{ type: 'run_script', handler: 'demo:guard' }] },
        },
      });
      const guard = utf8.decode(
        report.contents.get(`msm/demo/script/ruby_block_guard.${extension}`) as Uint8Array,
      );
      expect(guard).toContain('msm.actions.define("demo:guard"');
    });

    it.runIf(bundle.target.geckolib !== undefined)(
      'the Custom mob starter adds an animated Ruby Golem; the jar nests runtime and GeckoLib (ADRs 0028, 0029)',
      async () => {
        const built = await buildProject('Mob', 'demo', [
          buildEntry(starterById('custom_mob'), 'demo', 'Mob', bundle.target),
        ]);
        const { resourceFiles, dataFiles, jarFiles } = await checkProject(bundle, context, built);
        const resource = bundle.target.folders.resource;
        const data = bundle.target.folders.data;
        const assets = [
          `assets/demo/${resource.textures}/entity/ruby_golem.png`,
          `assets/demo/${resource.textures}/item/ruby_golem_spawn_egg.png`,
          'assets/demo/geckolib/models/entity/ruby_golem.geo.json',
          'assets/demo/geckolib/animations/entity/ruby_golem_animations.animation.json',
          `assets/demo/${resource.item_definition}/ruby_golem_spawn_egg.json`,
          `assets/demo/${resource.model}/item/ruby_golem_spawn_egg.json`,
          `assets/demo/${resource.lang}/en_us.json`,
        ];
        const datafiles = [
          `data/demo/${data.loot_table}/entities/ruby_golem.json`,
          `data/demo/${data.function}/golem/death.mcfunction`,
        ];
        expect(resourceFiles).toEqual(expect.arrayContaining([...assets, 'pack.mcmeta']));
        expect(dataFiles).toEqual(expect.arrayContaining([...datafiles, 'pack.mcmeta']));
        expect(jarFiles).toEqual(
          expect.arrayContaining([
            ...assets,
            ...datafiles,
            'msm/demo/entity/ruby_golem.json',
            'fabric.mod.json',
          ]),
        );
        expect(jarFiles.some((path) => path.startsWith('META-INF/jars/'))).toBe(false);

        // Nested: the stub runtime and GeckoLib jars go into META-INF/jars/.
        const geckolib = bundle.target.geckolib;
        if (geckolib === undefined) throw new Error(`${bundle.target.id} lacks GeckoLib facts`);
        const project = await reload(built.fs);
        const ids = projectRegistryIds(project);
        const registries = createRegistryIndex({ vanilla: context.vanilla, project: ids });
        const nested = await exportProblems(
          bundle,
          context,
          built.fs,
          project,
          registries,
          ids,
          contentJarExporter,
        );
        expect(nested.problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
        expect(nested.ok).toBe(true);
        const geckolibPath = nestedGeckolibPath(geckolib);
        const runtimePath = nestedRuntimePath(meta.msmVersion);
        expect(nested.contents.get(geckolibPath)).toEqual(STUB_GECKOLIB_JAR);
        expect(nested.contents.get(runtimePath)).toEqual(STUB_RUNTIME_JAR);
        const json = (path: string): Record<string, unknown> =>
          JSON.parse(utf8.decode(nested.contents.get(path) as Uint8Array));
        const modJson = json('fabric.mod.json');
        expect(modJson).toMatchObject({
          id: 'demo',
          depends: { [geckolib.modId]: geckolib.dependency },
        });
        expect(modJson.jars).toEqual(
          expect.arrayContaining([{ file: runtimePath }, { file: geckolibPath }]),
        );
        expect(json('msm/demo/entity/ruby_golem.json')).toMatchObject({
          format: 1,
          category: 'creature',
          loot_table: 'demo:entities/ruby_golem',
          spawn_egg: {},
          components: {
            'msm:animated_model': {
              model: 'demo:entity/ruby_golem',
              animations: 'demo:entity/ruby_golem_animations',
              texture: 'demo:entity/ruby_golem',
            },
          },
        });
        expect(json(`assets/demo/${resource.lang}/en_us.json`)).toMatchObject({
          'entity.demo.ruby_golem': 'Ruby Golem',
          'item.demo.ruby_golem_spawn_egg': 'Ruby Golem Spawn Egg',
        });
      },
    );

    // The mirror projects are written for the default target (their `targets`), so they are
    // checked against it only.
    it
      .runIf(bundle.target.id === DEFAULT_TARGET)
      .each(MIRROR.map((entry) => [entry.folder, entry] as const))(
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
