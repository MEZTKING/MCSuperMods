/**
 * Golden over the committed particles project (`fixtures/sample-particles`, ADRs 0080 and 0081
 * D6 (d), plan B358): namespace `msm_sample_particles`, an `msm:mod` and every way a project
 * can show a particle, each different enough for a parity test to tell apart:
 *
 * - three particle types (`msm:particle`) drawn from the project's own frames
 *   (`textures/particle/<name>_0..3.png`, the library's particle patterns): `spark` (four frames
 *   played once over its life (`age`), glows in the dark, floats up with gravity -0.02, fades
 *   out), `petal` (a random frame, falls with gravity 0.4, spins 6 degrees a tick, stops on
 *   blocks) and `bubble` (see-through, fades in and out, `always_show` so it is drawn far away
 *   and with Particles: Minimal);
 * - two blocks with `msm:ambient_particles` (drawn by the client only): `spark_lamp` (sparks
 *   over its top) and `ember_vent` (orange vanilla dust through an options object, moving up with
 *   `velocity`); `states` is covered by the runtime's GameTests, not here;
 * - three items: `spark_wand` (`msm:on_use` sends 20 sparks with `motion`), `dust_wand`
 *   (`msm:on_use` sends a dust options object) and `petal_charm` (`msm:while_held` every 20
 *   ticks sends petals with `force`);
 * - the effect `glimmer`, whose `particle` is `bubble`;
 * - the function `burst` (`particle msm_sample_particles:spark ~ ~1 ~ 0.5 0.5 0.5 0 30`, then a
 *   `say` line);
 * - the script `particles` (on `block.interact` with the spark lamp: `world.spawnParticle` with
 *   `petal` and with a block options object, then a log line).
 *
 * Pictures are the library's placeholder pictures (`placeholderPng`); none is vanilla's.
 *
 * - The fixture equals the project built from {@link SAMPLE_ELEMENTS} and {@link SAMPLE_ASSETS}
 *   now; `UPDATE_GOLDENS=1` rewrites it (the README is hand-written).
 * - Every element validates with zero problems, the plugins' project validators report nothing
 *   on every target, the function passes the offline mcfunction checker and the script
 *   type-checks against the generated typings.
 * - The content jar exports with zero errors and warnings, holds the definitions (valid), the
 *   particle descriptions and frames, the script as JavaScript, and its SHA-256 is pinned per
 *   target in two time zones (`test/fixtures/<target id>/sample-particles-jar.sha256`).
 * - The vanilla data pack (vanilla pack safety, ADR 0066) keeps the function with
 *   `export.mod-only-function` and leaves out the two blocks' loot tables with
 *   `export.mod-only-reference`; the vanilla resource pack keeps the descriptions and frames.
 * - With `MSM_RUNTIME_JAR` (a built `msm_runtime` jar for the selected target) and
 *   `MSM_SAMPLE_PARTICLES_OUT` (a folder), the jar is also exported with the real runtime nested
 *   and written to that folder as `msm_sample_particles.jar`, next to `fabric-facts.json` for
 *   `tools/run-fabric-server`. Without them that test is skipped.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
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
  utf8,
} from '@msm/core';
import type { Element, Json, Plugin, Problem, Project } from '@msm/plugin-api';
import blocksItemsPlugin, { blockGeneratedModelIds, blockItemIdOf } from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import { COLOURS as LIBRARY_COLOURS, placeholderPng, type Rgb } from '@msm/plugin-library';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import scriptingPlugin, { MSM_RUNTIME_TYPINGS } from '@msm/plugin-scripting';
import {
  createRegistryIndex,
  createSchemaIndex,
  MSM_SCHEMA_REFS,
  parseVanillaMcdocSymbols,
  type RegistryIndex,
  type SchemaIndex,
  validateJson,
} from '@msm/schemas';
import { createMcfunctionService, type McfunctionService } from '@msm/schemas/mcfunction';
import { builtInTargets, readVendoredJson, type TargetBundle } from '@msm/targets';
import { unzipSync } from 'fflate';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createFabricContentJarExporter,
  createMemorySink,
  createZipSink,
  dataPackExporter,
  type FabricContentJarOptions,
  MOD_ONLY_FUNCTION,
  MOD_ONLY_REFERENCE,
  modOnlyIdsOf,
  nestedRuntimePath,
  resourcePackExporter,
  runExport,
  type ScriptTranspileResult,
  vanillaSafeExporter,
} from '../src/index';
import { defaultTarget, selectedTarget } from './selected-target';

const update = process.env.UPDATE_GOLDENS === '1';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, 'fixtures');
const sampleRoot = join(here, '..', '..', '..', 'fixtures', 'sample-particles');
const NAMESPACE = 'msm_sample_particles';
const PROJECT_NAME = 'MSM Sample Particles';
const NOW = '2026-11-14T00:00:00.000Z';
/** Files of the fixture that the test does not generate. */
const HAND_WRITTEN = new Set(['README.md']);

/** Two zones on opposite sides of the date line, so a local-time leak changes the bytes. */
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;

/** The plugins the sample needs, in the app's registration order. */
const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  blocksItemsPlugin,
  scriptingPlugin,
];
const VALIDATORS = PLUGINS.flatMap((plugin) => plugin.contributes.validators ?? []);

const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);

const meta = {
  msmVersion: '1.4.0',
  plugins: ['msm.blocks-items', 'msm.datapack', 'msm.scripting'],
};
const stubRuntimeJar = utf8.encode('PK stub msm_runtime jar for the sample-particles golden');

/** The transpiler of ADR 0031 D2: TypeScript to ES5 CommonJS; syntax errors as problems. */
function typescriptTranspile(source: string, name: string): ScriptTranspileResult {
  const output = ts.transpileModule(source, {
    fileName: name,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES5,
      module: ts.ModuleKind.CommonJS,
      downlevelIteration: true,
      ignoreDeprecations: '6.0',
    },
  });
  const diagnostics = (output.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (diagnostics.length > 0) {
    return {
      problems: diagnostics.map((diagnostic) => ({
        severity: 'error',
        code: 'scripting.syntax',
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        file: name,
      })),
    };
  }
  return { js: output.outputText };
}

// The project -----------------------------------------------------------------------------

interface SampleElement {
  id: string;
  kind: string;
  data: Json;
}

interface SampleAsset {
  /** Path under the namespace's assets, such as `textures/particle/spark_0.png`. */
  path: string;
  bytes: Uint8Array;
}

type JsonRecord = { [key: string]: Json };
type Pattern = Parameters<typeof placeholderPng>[0];

const ns = (path: string): string => `${NAMESPACE}:${path}`;

/** Frames per particle (the library's particle patterns draw four). */
const FRAMES = 4;

const COLOURS = {
  spark: LIBRARY_COLOURS.amber,
  petal: [236, 140, 186] as Rgb,
  bubble: LIBRARY_COLOURS.frost,
  lamp: LIBRARY_COLOURS.amber,
  vent: LIBRARY_COLOURS.slate,
  wand: LIBRARY_COLOURS.violet,
  dust: LIBRARY_COLOURS.sapphire,
} as const satisfies Record<string, Rgb>;

const SPARK = ns('spark');
const PETAL = ns('petal');
const BUBBLE = ns('bubble');
const SPARK_LAMP = ns('spark_lamp');
const EMBER_VENT = ns('ember_vent');
const SPARK_WAND = ns('spark_wand');
const DUST_WAND = ns('dust_wand');
const PETAL_CHARM = ns('petal_charm');
const GLIMMER = ns('glimmer');
const BURST = ns('burst');
const SCRIPT = ns('particles');

/** The frame sprite ids of a particle: `<ns>:<name>_0` to `_3`. */
const frames = (name: string): string[] =>
  Array.from({ length: FRAMES }, (_, frame) => ns(`${name}_${frame}`));

/** The frame pictures of a particle, drawn with a library particle pattern. */
const frameAssets = (name: string, pattern: Pattern, colour: Rgb): SampleAsset[] =>
  Array.from({ length: FRAMES }, (_, frame) => ({
    path: `textures/particle/${name}_${frame}.png`,
    bytes: placeholderPng(pattern, { colour, frame }),
  }));

const texture = (path: string, pattern: Pattern, colour: Rgb): SampleAsset => ({
  path: `textures/${path}.png`,
  bytes: placeholderPng(pattern, { colour }),
});

/** The burst function's particle line (the parity test counts its 30 particles). */
const BURST_LINE = `particle ${SPARK} ~ ~1 ~ 0.5 0.5 0.5 0 30`;
const BURST_SAY = 'say A burst of 30 sparks.';

/** The orange dust of the ember vent and the blue dust of the dust wand (options objects). */
const EMBER_DUST = { type: 'minecraft:dust', color: [1, 0.45, 0.1], scale: 1.2 };
const BLUE_DUST = { type: 'minecraft:dust', color: [0.3, 0.7, 1], scale: 2 };

const SPARK_WAND_USED = ns('spark_wand_used');
const DUST_WAND_USED = ns('dust_wand_used');
const PETAL_CHARM_HELD = ns('petal_charm_held');

const PARTICLES: readonly SampleElement[] = [
  {
    id: SPARK,
    kind: 'msm:particle',
    data: {
      format: 1,
      textures: frames('spark'),
      animation: 'age',
      lifetime: { min: 16, max: 24 },
      size: 0.15,
      gravity: -0.02,
      emissive: true,
      fade: 'out',
    },
  },
  {
    id: PETAL,
    kind: 'msm:particle',
    data: {
      format: 1,
      textures: frames('petal'),
      animation: 'random',
      lifetime: 60,
      size: 0.12,
      gravity: 0.4,
      spin: 6,
      collision: true,
    },
  },
  {
    id: BUBBLE,
    kind: 'msm:particle',
    data: {
      format: 1,
      textures: frames('bubble'),
      animation: 'loop',
      frame_ticks: 5,
      lifetime: 40,
      size: 0.25,
      gravity: -0.05,
      translucent: true,
      fade: 'in_out',
      always_show: true,
    },
  },
];

/** A cube block model over `block/<name>`. */
const blockModel = (name: string): SampleElement => ({
  id: ns(`block/${name}`),
  kind: 'minecraft:model',
  data: { parent: 'minecraft:block/cube_all', textures: { all: ns(`block/${name}`) } },
});

/** A flat item model over `item/<name>`. */
const itemModel = (name: string): SampleElement => ({
  id: ns(`item/${name}`),
  kind: 'minecraft:model',
  data: { parent: 'minecraft:item/generated', textures: { layer0: ns(`item/${name}`) } },
});

const IMPORT = 'import { msm } from "msm:runtime";';

const SCRIPT_LINES = [
  IMPORT,
  '',
  `// block.interact: a player uses the spark lamp with the main hand. Petals fall from above it,`,
  '// and pieces of the lamp itself (a block options object) burst around it.',
  'msm.events.on("block.interact", (e) => {',
  '  if (e.hand !== "main") return;',
  `  if (e.block.id !== "${SPARK_LAMP}") return;`,
  `  e.world.spawnParticle("${PETAL}", e.block.pos.offset(0.5, 1.5, 0.5), { count: 8, spread: 0.3 });`,
  `  e.world.spawnParticle({ type: "minecraft:block", block_state: "${SPARK_LAMP}" }, e.block.pos.offset(0.5, 0.5, 0.5), { count: 16, spread: 0.4 });`,
  '  msm.log.info("block.interact: " + e.player.name + " used the spark lamp at " + e.block.pos);',
  '});',
];

const SAMPLE_ELEMENTS: readonly SampleElement[] = [
  {
    id: ns('mod'),
    kind: 'msm:mod',
    data: {
      mod_id: NAMESPACE,
      version: '1.0.0',
      name: PROJECT_NAME,
      description:
        'Sample particles: three particle types of its own, two blocks that show particles by themselves, three items that send them, an effect, a function and a script.',
      authors: ['MCSuperMods'],
      licence: 'MIT',
    },
  },
  ...PARTICLES,
  {
    id: SPARK_LAMP,
    kind: 'msm:block',
    data: {
      format: 1,
      display_name: 'Spark Lamp',
      model: ns('block/spark_lamp'),
      sound_type: 'glass',
      loot: 'self',
      item: { creative_tab: 'minecraft:functional_blocks' },
      components: {
        'msm:breakable': { hardness: 0.3, resistance: 0.3 },
        'msm:light_emitter': { level: 10 },
        'msm:ambient_particles': {
          particle: SPARK,
          chance: 0.5,
          count: 2,
          offset: [0.5, 1.05, 0.5],
          spread: [0.3, 0.05, 0.3],
        },
      },
    },
  },
  blockModel('spark_lamp'),
  {
    id: EMBER_VENT,
    kind: 'msm:block',
    data: {
      format: 1,
      display_name: 'Ember Vent',
      model: ns('block/ember_vent'),
      sound_type: 'stone',
      loot: 'self',
      item: { creative_tab: 'minecraft:functional_blocks' },
      components: {
        'msm:breakable': { hardness: 1.5, resistance: 6, tool: 'pickaxe' },
        'msm:ambient_particles': {
          particle: EMBER_DUST,
          chance: 0.8,
          count: 3,
          offset: [0.5, 1.05, 0.5],
          spread: [0.25, 0, 0.25],
          velocity: [0, 0.08, 0],
        },
      },
    },
  },
  blockModel('ember_vent'),
  {
    id: SPARK_WAND,
    kind: 'msm:item',
    data: {
      format: 1,
      display_name: 'Spark Wand',
      model: ns('item/spark_wand'),
      max_stack_size: 1,
      creative_tab: 'minecraft:tools_and_utilities',
      components: { 'msm:on_use': { event: SPARK_WAND_USED, cooldown_ticks: 10 } },
      events: {
        [SPARK_WAND_USED]: {
          actions: [
            {
              type: 'spawn_particle',
              particle: SPARK,
              count: 20,
              spread: 0.3,
              motion: [0, 0.2, 0],
            },
          ],
        },
      },
    },
  },
  itemModel('spark_wand'),
  {
    id: DUST_WAND,
    kind: 'msm:item',
    data: {
      format: 1,
      display_name: 'Dust Wand',
      model: ns('item/dust_wand'),
      max_stack_size: 1,
      creative_tab: 'minecraft:tools_and_utilities',
      components: { 'msm:on_use': { event: DUST_WAND_USED, cooldown_ticks: 10 } },
      events: {
        [DUST_WAND_USED]: {
          actions: [{ type: 'spawn_particle', particle: BLUE_DUST, count: 40, spread: 0.6 }],
        },
      },
    },
  },
  itemModel('dust_wand'),
  {
    id: PETAL_CHARM,
    kind: 'msm:item',
    data: {
      format: 1,
      display_name: 'Petal Charm',
      model: ns('item/petal_charm'),
      max_stack_size: 1,
      creative_tab: 'minecraft:tools_and_utilities',
      components: { 'msm:while_held': { event: PETAL_CHARM_HELD, interval_ticks: 20 } },
      events: {
        [PETAL_CHARM_HELD]: {
          actions: [
            { type: 'spawn_particle', particle: PETAL, count: 6, spread: 0.4, force: true },
          ],
        },
      },
    },
  },
  itemModel('petal_charm'),
  {
    id: GLIMMER,
    kind: 'msm:effect',
    data: {
      format: 1,
      display_name: 'Glimmer',
      category: 'beneficial',
      color: (COLOURS.bubble[0] << 16) | (COLOURS.bubble[1] << 8) | COLOURS.bubble[2],
      particle: BUBBLE,
    },
  },
  {
    id: BURST,
    kind: 'minecraft:function',
    data: { lines: [BURST_LINE, BURST_SAY] },
  },
  { id: SCRIPT, kind: 'msm:script', data: { lines: SCRIPT_LINES } },
];

const SAMPLE_ASSETS: readonly SampleAsset[] = [
  ...frameAssets('spark', 'particle_spark', COLOURS.spark),
  ...frameAssets('petal', 'particle_leaf', COLOURS.petal),
  ...frameAssets('bubble', 'particle_orb', COLOURS.bubble),
  texture('block/spark_lamp', 'polished_stone', COLOURS.lamp),
  texture('block/ember_vent', 'ore', COLOURS.vent),
  texture('item/spark_wand', 'spear', COLOURS.wand),
  texture('item/dust_wand', 'spear', COLOURS.dust),
  texture('item/petal_charm', 'gem', COLOURS.petal),
];

const nameOf = (id: string): string => id.split(':')[1] as string;
const ofKind = (kind: string): string[] =>
  SAMPLE_ELEMENTS.filter((entry) => entry.kind === kind).map((entry) => nameOf(entry.id));
const PARTICLE_NAMES = ofKind('msm:particle');
const BLOCK_NAMES = ofKind('msm:block');
const ITEM_NAMES = ofKind('msm:item');
const SCRIPTS = SAMPLE_ELEMENTS.filter((entry) => entry.kind === 'msm:script');

/** What the runtime registers: two blocks, their two items and the three items. */
const EXPECTED_BLOCKS = BLOCK_NAMES.length;
const EXPECTED_ITEMS = BLOCK_NAMES.length + ITEM_NAMES.length;

/** Builds the sample into a project the way the app's `newProject` does, then saves it. */
async function buildSample(): Promise<MemoryFileSystem> {
  const project = createEmptyProject(PROJECT_NAME, {
    targets: [defaultTarget().target.id],
    plugins: PLUGINS.filter((plugin) => (plugin.contributes.elementKinds ?? []).length > 0).map(
      (plugin) => plugin.id,
    ),
  });
  const namespace = {
    name: NAMESPACE,
    elements: [] as Element[],
    assets: [] as { path: string; mediaType: string }[],
  };
  for (const entry of SAMPLE_ELEMENTS) {
    namespace.elements.push(
      createElement({
        id: entry.id as Element['id'],
        kind: entry.kind,
        data: structuredClone(entry.data),
        now: () => NOW,
      }),
    );
  }
  const fs = createMemoryFileSystem();
  for (const asset of SAMPLE_ASSETS) {
    const file = `assets/${NAMESPACE}/${asset.path}`;
    await fs.mkdirp(file.slice(0, file.lastIndexOf('/')));
    await fs.writeFile(file, asset.bytes);
    namespace.assets.push({ path: asset.path, mediaType: 'image/png' });
  }
  project.namespaces.push(namespace);
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

const dataOf = (project: Project, id: string): JsonRecord =>
  elementsOf(project).find((element) => element.id === id)?.data as JsonRecord;

/**
 * Type-checks the scripts against the generated typings with `lib.es5` only, as
 * `sample-script.golden.test.ts` does.
 */
function typeCheckScripts(scripts: readonly SampleElement[]): string[] {
  const libDir = dirname(createRequire(import.meta.url).resolve('typescript/lib/lib.es5.d.ts'));
  const files = new Map<string, string>([['/msm-runtime.d.ts', MSM_RUNTIME_TYPINGS]]);
  for (const entry of scripts) {
    files.set(
      `/script/${nameOf(entry.id)}.ts`,
      `${(entry.data as { lines: string[] }).lines.join('\n')}\n`,
    );
  }
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
  host.directoryExists = (name) => name === '/' || name === '/script' || name.startsWith(libDir);
  host.readFile = (fileName) => files.get(fileName);
  const program = ts.createProgram([...files.keys()], options, host);
  return ts.getPreEmitDiagnostics(program).map((d) => {
    const where = d.file === undefined ? '' : `${d.file.fileName}: `;
    return `${where}${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`;
  });
}

// Registries and checkers -------------------------------------------------------------------

/**
 * The project's own ids per registry, as the app derives them: element ids under their kind's
 * registry (`particle_type` for `msm:particle`, `mob_effect` for `msm:effect`), each block's
 * item and generated models, and the textures of the namespace's PNG assets.
 */
function projectIds(project: Project): Record<string, string[]> {
  const ids: Record<string, string[]> = {};
  const add = (name: string, id: string): void => {
    ids[name] = [...(ids[name] ?? []), id];
  };
  for (const element of elementsOf(project)) {
    const name = registry.get(element.kind)?.registry;
    if (name === undefined) {
      if (element.kind.startsWith('minecraft:'))
        add(element.kind.slice('minecraft:'.length), element.id);
      continue;
    }
    add(name, element.id);
    if (element.kind === 'msm:block') {
      const itemId = blockItemIdOf(element.id, element.data);
      if (itemId !== undefined) add('item', itemId);
      for (const id of blockGeneratedModelIds(element.id, element.data as Json)) add('model', id);
    }
  }
  for (const namespace of project.namespaces) {
    for (const asset of namespace.assets) {
      const match = /^textures\/(.+)\.png$/.exec(asset.path);
      if (match !== null) add('texture', `${namespace.name}:${match[1]}`);
    }
  }
  for (const [name, list] of Object.entries(ids)) ids[name] = [...new Set(list)].sort();
  return ids;
}

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

interface TargetContext {
  schemaIndex: SchemaIndex;
  registries: RegistryIndex;
  mcfunction: McfunctionService;
  functionIds: Record<string, string[]>;
  ids: Record<string, string[]>;
}

async function contextFor(bundle: TargetBundle, project: Project): Promise<TargetContext> {
  const read = (key: Parameters<typeof readVendoredJson>[1]) =>
    readVendoredJson(bundle, key, nodeReadFile);
  const [symbols, vanilla, commands, blocks] = await Promise.all([
    read('vanillaMcdocSymbols'),
    read('mcmetaRegistries'),
    read('mcmetaCommands'),
    read('mcmetaBlocks'),
  ]);
  const ids = projectIds(project);
  return {
    schemaIndex: createSchemaIndex(parseVanillaMcdocSymbols(symbols), {
      mcVersion: bundle.target.mcVersion,
    }),
    registries: createRegistryIndex({
      vanilla: vanilla as Record<string, string[]>,
      project: ids,
    }),
    mcfunction: await createMcfunctionService(
      { commands, blocks, registries: vanilla as Record<string, string[]> },
      { mcVersion: bundle.target.mcVersion },
    ),
    functionIds: {
      block: ids.block ?? [],
      function: ids.function ?? [],
      particle_type: ids.particle_type ?? [],
      'tag/function': ['minecraft:load', 'minecraft:tick'],
    },
    ids,
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

/** The `version` of the `fabric.mod.json` inside a mod jar. */
function jarModVersion(jar: Uint8Array): string {
  const files = unzipSync(jar, { filter: (file) => file.name === 'fabric.mod.json' });
  const modJson = files['fabric.mod.json'];
  if (modJson === undefined) throw new Error('The runtime jar has no fabric.mod.json');
  const version = (JSON.parse(utf8.decode(modJson)) as { version?: unknown }).version;
  if (typeof version !== 'string') throw new Error('The runtime fabric.mod.json has no version');
  return version;
}

// Tests -------------------------------------------------------------------------------------

describe('sample particles project', () => {
  it('equals SAMPLE_ELEMENTS and SAMPLE_ASSETS saved as a project', async () => {
    const generated = (await buildSample()).snapshot();
    if (update) {
      for (const path of await listFiles(sampleRoot)) {
        if (!HAND_WRITTEN.has(path)) await rm(join(sampleRoot, ...path.split('/')));
      }
      await rm(join(sampleRoot, 'content'), { recursive: true, force: true });
      await rm(join(sampleRoot, 'assets'), { recursive: true, force: true });
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

  it('loads with zero problems and has every way of showing a particle ADR 0081 D6 names', async () => {
    const project = await loadSample();
    expect(project.name).toBe(PROJECT_NAME);
    expect(PARTICLE_NAMES).toEqual(['spark', 'petal', 'bubble']);
    expect(dataOf(project, SPARK)).toMatchObject({
      animation: 'age',
      emissive: true,
      gravity: -0.02,
      fade: 'out',
    });
    expect((dataOf(project, SPARK).textures as string[]).length).toBe(FRAMES);
    expect(dataOf(project, PETAL)).toMatchObject({
      animation: 'random',
      gravity: 0.4,
      spin: 6,
      collision: true,
    });
    expect(dataOf(project, BUBBLE)).toMatchObject({
      translucent: true,
      fade: 'in_out',
      always_show: true,
    });
    const ambient = (id: string): JsonRecord =>
      (dataOf(project, id).components as JsonRecord)['msm:ambient_particles'] as JsonRecord;
    expect(ambient(SPARK_LAMP).particle).toBe(SPARK);
    expect(ambient(EMBER_VENT)).toMatchObject({ particle: EMBER_DUST, velocity: [0, 0.08, 0] });
    const action = (id: string, event: string): JsonRecord =>
      ((dataOf(project, id).events as JsonRecord)[event] as { actions: JsonRecord[] })
        .actions[0] as JsonRecord;
    expect(action(SPARK_WAND, SPARK_WAND_USED)).toMatchObject({
      particle: SPARK,
      count: 20,
      motion: [0, 0.2, 0],
    });
    expect(action(DUST_WAND, DUST_WAND_USED).particle).toEqual(BLUE_DUST);
    expect(action(PETAL_CHARM, PETAL_CHARM_HELD)).toMatchObject({ particle: PETAL, force: true });
    expect((dataOf(project, PETAL_CHARM).components as JsonRecord)['msm:while_held']).toMatchObject(
      { interval_ticks: 20 },
    );
    expect(dataOf(project, GLIMMER).particle).toBe(BUBBLE);
    expect(dataOf(project, BURST).lines).toEqual([BURST_LINE, BURST_SAY]);
    const source = (dataOf(project, SCRIPT).lines as string[]).join('\n');
    expect(source).toContain(`spawnParticle("${PETAL}"`);
    expect(source).toContain(`block_state: "${SPARK_LAMP}"`);
    const kinds = new Set(elementsOf(project).map((element) => element.kind));
    expect([...kinds].sort()).toEqual([
      'minecraft:function',
      'minecraft:model',
      'msm:block',
      'msm:effect',
      'msm:item',
      'msm:mod',
      'msm:particle',
      'msm:script',
    ]);
    expect(project.namespaces[0]?.assets.map((asset) => asset.path).sort()).toEqual(
      SAMPLE_ASSETS.map((asset) => asset.path).sort(),
    );
  });

  it('type-checks the script against the typings', () => {
    expect(typeCheckScripts(SCRIPTS)).toEqual([]);
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sample particles export (%s)',
  (_id, bundle) => {
    const { target } = bundle;
    let context: TargetContext;

    beforeAll(async () => {
      context = await contextFor(bundle, await loadSample());
    }, 120_000);

    async function validateText(file: { language?: string; contents: unknown; path: string }) {
      if (file.language !== 'mcfunction') return [];
      const source = utf8.decode(file.contents as Uint8Array).replace(/\n$/, '');
      const found = await context.mcfunction.check(source, {
        uri: `file:///msm/${file.path}`,
        projectIds: context.functionIds,
      });
      return found.map(
        (problem): Problem => ({
          severity: problem.severity,
          code: problem.code,
          message: `line ${problem.line + 1}: ${problem.message}`,
          file: file.path,
        }),
      );
    }

    async function exportJar(
      factory: FabricContentJarOptions = { loadRuntimeJar: async () => stubRuntimeJar },
    ): Promise<Uint8Array> {
      const sink = createZipSink();
      const report = await runExport({
        project: await loadSample(),
        registry,
        target,
        schemaIndex: context.schemaIndex,
        registries: context.registries,
        exporter: createFabricContentJarExporter({
          ...factory,
          transpileScript: async (source, name) => typescriptTranspile(source, name),
        }),
        sink,
        readAsset: (namespace, path) => sampleFs.readFile(`assets/${namespace}/${path}`),
        meta,
        validateText,
      });
      expect(report.problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
      expect(report.ok).toBe(true);
      return sink.finish();
    }

    it('validates every element with zero problems', async () => {
      const problems: string[] = [];
      for (const element of elementsOf(await loadSample())) {
        const kind = registry.get(element.kind);
        if (kind === undefined) throw new Error(`unknown kind ${element.kind}`);
        const hidden = kind.hiddenPaths ?? [];
        const node = context.schemaIndex.resolveSchemaRef(kind.schema);
        for (const problem of validateJson(element.data, node, {
          registries: context.registries,
        })) {
          if (hidden.some((path) => problem.path === path || problem.path.startsWith(`${path}/`))) {
            continue;
          }
          problems.push(`${element.id} ${problem.path} ${problem.code}: ${problem.message}`);
        }
      }
      expect(problems).toEqual([]);
    });

    it('passes every project validator with no problems at all', async () => {
      const elements = elementsOf(await loadSample());
      const found = (
        await Promise.all(
          VALIDATORS.map((validator) =>
            validator.validate({ elements, target, registry: context.registries }),
          ),
        )
      ).flat();
      expect(found).toEqual([]);
    });

    it('holds the definitions (valid), the descriptions, the frames and the script', async () => {
      const files = unzipSync(await exportJar());
      const paths = Object.keys(files).sort();
      const resource = target.folders.resource;
      const data = target.folders.data;
      const descriptionFolder = target.particles?.descriptionFolder ?? 'particles';
      const textureFolder = target.particles?.textureFolder ?? 'particle';
      const definitions: [string, string][] = [
        ...PARTICLE_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/particle/${name}.json`,
          MSM_SCHEMA_REFS.particleDefinition,
        ]),
        ...BLOCK_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/block/${name}.json`,
          MSM_SCHEMA_REFS.blockDefinition,
        ]),
        ...ITEM_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/item/${name}.json`,
          MSM_SCHEMA_REFS.itemDefinition,
        ]),
        [`msm/${NAMESPACE}/effect/glimmer.json`, MSM_SCHEMA_REFS.effectDefinition],
      ];
      expect(paths.filter((path) => path.startsWith('msm/'))).toEqual(
        [
          ...definitions.map(([path]) => path),
          ...SCRIPTS.map((entry) => `msm/${NAMESPACE}/script/${nameOf(entry.id)}.js`),
        ].sort(),
      );
      expect(paths.filter((path) => path.endsWith('.ts'))).toEqual([]);
      for (const path of [
        'fabric.mod.json',
        'msm.export.json',
        `assets/${NAMESPACE}/${resource.lang}/en_us.json`,
        `data/${NAMESPACE}/${data.function}/burst.mcfunction`,
        ...BLOCK_NAMES.map((name) => `assets/${NAMESPACE}/blockstates/${name}.json`),
        ...BLOCK_NAMES.map((name) => `data/${NAMESPACE}/${data.loot_table}/blocks/${name}.json`),
      ]) {
        expect(paths, path).toContain(path);
      }
      expect(paths).not.toContain('pack.mcmeta');

      const json = (path: string): Json => JSON.parse(utf8.decode(files[path] as Uint8Array));
      const problems: string[] = [];
      for (const [path, ref] of definitions) {
        for (const problem of validateJson(json(path), context.schemaIndex.resolveSchemaRef(ref), {
          registries: context.registries,
        })) {
          problems.push(`${path} ${problem.path} ${problem.code}: ${problem.message}`);
        }
      }
      expect(problems).toEqual([]);

      // Each particle: its description lists its frames, and every frame picture is there.
      expect(
        paths.filter((path) => path.startsWith(`assets/${NAMESPACE}/${descriptionFolder}/`)),
      ).toEqual(
        PARTICLE_NAMES.map((name) => `assets/${NAMESPACE}/${descriptionFolder}/${name}.json`)
          .slice()
          .sort(),
      );
      for (const name of PARTICLE_NAMES) {
        expect(json(`assets/${NAMESPACE}/${descriptionFolder}/${name}.json`), name).toEqual({
          textures: frames(name),
        });
        for (let frame = 0; frame < FRAMES; frame++) {
          expect(paths).toContain(
            `assets/${NAMESPACE}/textures/${textureFolder}/${name}_${frame}.png`,
          );
        }
      }
      // The definition keeps the knobs as written; the ambient options object and the action
      // forms reach the runtime unchanged.
      expect(json(`msm/${NAMESPACE}/particle/bubble.json`)).toMatchObject({
        format: 1,
        always_show: true,
        fade: 'in_out',
      });
      const vent = json(`msm/${NAMESPACE}/block/ember_vent.json`) as JsonRecord;
      expect((vent.components as JsonRecord)['msm:ambient_particles']).toMatchObject({
        particle: EMBER_DUST,
      });
      const wand = JSON.stringify(json(`msm/${NAMESPACE}/item/spark_wand.json`));
      expect(wand).toContain('"motion":[0,0.2,0]');
      expect(JSON.stringify(json(`msm/${NAMESPACE}/item/petal_charm.json`))).toContain(
        '"force":true',
      );
      expect(json(`msm/${NAMESPACE}/effect/glimmer.json`)).toMatchObject({ particle: BUBBLE });
      expect(
        utf8.decode(files[`data/${NAMESPACE}/${data.function}/burst.mcfunction`] as Uint8Array),
      ).toBe(`${BURST_LINE}\n${BURST_SAY}\n`);
      const js = utf8.decode(files[`msm/${NAMESPACE}/script/particles.js`] as Uint8Array);
      expect(js).toContain('require("msm:runtime")');
      expect(js).toContain(`spawnParticle("${PETAL}"`);

      const lang = json(`assets/${NAMESPACE}/${resource.lang}/en_us.json`) as JsonRecord;
      for (const name of BLOCK_NAMES)
        expect(lang[`block.${NAMESPACE}.${name}`], name).toBeDefined();
      for (const name of ITEM_NAMES) expect(lang[`item.${NAMESPACE}.${name}`], name).toBeDefined();

      const modJson = json('fabric.mod.json') as { id: string; depends: Record<string, string> };
      expect(modJson.id).toBe(NAMESPACE);
      expect(modJson.depends.msm_runtime).toBe(`>=${meta.msmVersion}`);
      const runtimePath = nestedRuntimePath(meta.msmVersion);
      expect(files[runtimePath]).toEqual(stubRuntimeJar);
      expect(paths.filter((path) => path.startsWith('META-INF/jars/'))).toEqual([runtimePath]);
    });

    it('keeps the function with a warning and leaves out the loot tables in the vanilla data pack', async () => {
      const project = await loadSample();
      const modOnly = modOnlyIdsOf(context.ids);
      const sink = createMemorySink();
      const report = await runExport({
        project,
        registry,
        target,
        schemaIndex: context.schemaIndex,
        registries: context.registries,
        exporter: vanillaSafeExporter(dataPackExporter, modOnly),
        sink,
        readAsset: (namespace, path) => sampleFs.readFile(`assets/${namespace}/${path}`),
        meta,
        validateText,
      });
      const data = target.folders.data;
      const safety: ReadonlySet<string> = new Set([MOD_ONLY_REFERENCE, MOD_ONLY_FUNCTION]);
      expect(
        report.problems.filter(
          (problem) => problem.severity !== 'info' && !safety.has(problem.code),
        ),
      ).toEqual([]);
      expect(report.ok).toBe(true);
      expect([...sink.files().keys()].sort()).toEqual(
        [
          'pack.mcmeta',
          'msm.export.json',
          // The ember vent needs a pickaxe: the vanilla tag, with the block as an optional entry.
          `data/minecraft/${data.tags}/block/mineable/pickaxe.json`,
          `data/${NAMESPACE}/${data.function}/burst.mcfunction`,
        ].sort(),
      );
      const flagged = (code: string): string[] =>
        report.problems
          .filter((problem) => problem.code === code)
          .map((problem) => problem.file ?? '')
          .sort();
      expect(flagged(MOD_ONLY_REFERENCE)).toEqual(
        BLOCK_NAMES.map(
          (name) => `data/${NAMESPACE}/${data.loot_table}/blocks/${name}.json`,
        ).sort(),
      );
      expect(flagged(MOD_ONLY_FUNCTION)).toEqual([
        `data/${NAMESPACE}/${data.function}/burst.mcfunction`,
      ]);
      const warning = report.problems.find((problem) => problem.code === MOD_ONLY_FUNCTION);
      expect(warning?.message).toContain(SPARK);
    });

    it('keeps the descriptions and frames in the vanilla resource pack', async () => {
      const sink = createMemorySink();
      const report = await runExport({
        project: await loadSample(),
        registry,
        target,
        schemaIndex: context.schemaIndex,
        registries: context.registries,
        exporter: resourcePackExporter,
        sink,
        readAsset: (namespace, path) => sampleFs.readFile(`assets/${namespace}/${path}`),
        meta,
      });
      expect(report.problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
      const paths = [...sink.files().keys()];
      const descriptionFolder = target.particles?.descriptionFolder ?? 'particles';
      const textureFolder = target.particles?.textureFolder ?? 'particle';
      for (const name of PARTICLE_NAMES) {
        expect(paths).toContain(`assets/${NAMESPACE}/${descriptionFolder}/${name}.json`);
        expect(paths).toContain(`assets/${NAMESPACE}/textures/${textureFolder}/${name}_0.png`);
      }
      expect(paths.some((path) => path.startsWith('msm/'))).toBe(false);
    });

    describe('content jar', () => {
      const hashFile = join(fixturesRoot, target.id, 'sample-particles-jar.sha256');
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
            hashes.push(sha256(await exportJar()));
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

    const runtimeJarPath = process.env.MSM_RUNTIME_JAR;
    const outDir = process.env.MSM_SAMPLE_PARTICLES_OUT;
    it.runIf(runtimeJarPath !== undefined && outDir !== undefined && bundle === selectedTarget())(
      'writes the jar with the real runtime for the headless server check',
      async () => {
        const fabric = target.fabric;
        if (fabric === undefined) throw new Error(`${target.id} has no Fabric facts`);
        const runtimeJar = new Uint8Array(await readFile(runtimeJarPath as string));
        const runtimeVersion = jarModVersion(runtimeJar);
        const jar = await exportJar({ loadRuntimeJar: async () => runtimeJar, runtimeVersion });
        await mkdir(outDir as string, { recursive: true });
        await writeFile(join(outDir as string, `${NAMESPACE}.jar`), jar);
        const facts = {
          expectBlocks: EXPECTED_BLOCKS,
          expectEntities: 0,
          expectItems: EXPECTED_ITEMS,
          expectScripts: SCRIPTS.length,
          fabricApi: fabric.api,
          java: target.java,
          loader: fabric.loader,
          minecraft: target.mcVersion,
          runtimeVersion,
        };
        await writeFile(
          join(outDir as string, 'fabric-facts.json'),
          `${JSON.stringify(facts, null, 2)}\n`,
        );
        expect(unzipSync(jar)[nestedRuntimePath(runtimeVersion)]).toEqual(runtimeJar);
      },
      120_000,
    );
  },
);
