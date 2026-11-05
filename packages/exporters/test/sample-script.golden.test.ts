/**
 * Golden over the committed scripting sample (`fixtures/sample-script`, ADRs 0031 and 0032):
 * an `msm:mod`, one block and one item copied from the sample mod and renamed, one script per
 * event of ADR 0032 D2 (each logging with `msm.log.info`), an action handler script called by
 * the block's `run_script` action, and a `util` module that two scripts load with
 * `require("./util")`; namespace `msm_sample_script`.
 *
 * - The fixture equals the project built from {@link SAMPLE_ELEMENTS} now; `UPDATE_GOLDENS=1`
 *   rewrites it (the README is hand-written).
 * - Every element validates with zero problems, the plugins' project validators report
 *   nothing, and every script parses and type-checks against the generated typings.
 * - The content jar exports with zero problems, a stub runtime jar and the real `typescript`
 *   transpiler (ADR 0031 D2 options); its SHA-256 is pinned per target in two time zones
 *   (`test/fixtures/<target id>/sample-script-jar.sha256`).
 * - Every `msm/<ns>/script/*.js` is present (no `.ts`), parses as ES5, and holds no `class`,
 *   `async`, `let`, `const`, arrow or `for...of` tokens (TypeScript's scanner).
 * - With `MSM_RUNTIME_JAR` and `MSM_SAMPLE_SCRIPT_OUT`, the jar is also exported with the real
 *   runtime nested and written to that folder as `msm_sample_script.jar`, next to
 *   `fabric-facts.json` for `tools/run-fabric-server` (`expectScripts` included; CI's
 *   `engine-mod` job). Without them that test is skipped.
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
import type { Element, Json, Plugin, Project, Target } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
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
import { builtInTargets, readVendoredJson, type TargetBundle } from '@msm/targets';
import { unzipSync } from 'fflate';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createFabricContentJarExporter,
  createZipSink,
  type FabricContentJarOptions,
  runExport,
  SCRIPT_RUNTIME_MINIMUM,
  type ScriptTranspileResult,
} from '../src/index';

const update = process.env.UPDATE_GOLDENS === '1';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, 'fixtures');
const sampleRoot = join(here, '..', '..', '..', 'fixtures', 'sample-script');
const NAMESPACE = 'msm_sample_script';
const PROJECT_NAME = 'MSM Sample Script';
const NOW = '2026-11-05T00:00:00.000Z';
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

// 0.6.0: the first runtime that runs scripts (ADR 0032 D4), so `depends` and the nested
// runtime's file name agree.
const meta = {
  msmVersion: '0.6.0',
  plugins: ['msm.blocks-items', 'msm.datapack', 'msm.scripting'],
};
const stubRuntimeJar = utf8.encode('PK stub msm_runtime jar for the sample-script golden');

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

const ns = (path: string): string => `${NAMESPACE}:${path}`;
const IMPORT = 'import { msm } from "msm:runtime";';

/** A script element from its source lines. */
const script = (path: string, lines: string[]): SampleElement => ({
  id: ns(path),
  kind: 'msm:script',
  data: { lines },
});

/**
 * One script per game event of ADR 0032 D2, each logging with `msm.log.info`; the action
 * handler `spark` that the block's `run_script` action calls; and `util`, which
 * `on_server_started` and `spark_handler` load with `require("./util")` (TypeScript's
 * CommonJS output of their `import ... from "./util"`).
 */
const SCRIPTS: readonly SampleElement[] = [
  script('util', [
    '// Shared helpers. Scripts that import this file load it with require("./util"); the',
    '// runtime evaluates it once, so this line is logged once.',
    IMPORT,
    '',
    `export const MOD = "${NAMESPACE}";`,
    '',
    'export function id(path: string): string {',
    '  return MOD + ":" + path;',
    '}',
    '',
    'msm.log.info("util loaded");',
  ]),
  script('on_block_interact', [
    IMPORT,
    '',
    '// block.interact: a player uses the spark ore with the main hand.',
    'msm.events.on("block.interact", (e) => {',
    `  if (e.block.id !== "${ns('spark_ore')}" || e.hand !== "main") return;`,
    '  msm.log.info("block.interact: " + e.player.name + " used spark ore at " + e.block.pos);',
    '});',
  ]),
  script('on_block_break', [
    IMPORT,
    '',
    '// block.break: a player breaks the spark ore.',
    'msm.events.on("block.break", (e) => {',
    `  if (e.block.id !== "${ns('spark_ore')}") return;`,
    '  msm.log.info("block.break: " + e.player.name + " broke spark ore at " + e.block.pos);',
    '});',
  ]),
  script('on_item_use', [
    IMPORT,
    '',
    '// item.use: a player uses a spark gem.',
    'msm.events.on("item.use", (e) => {',
    `  if (e.item.id !== "${ns('spark_gem')}") return;`,
    '  msm.log.info("item.use: " + e.player.name + " used " + e.item.count + " spark gem(s)");',
    '});',
  ]),
  script('on_entity_interact', [
    IMPORT,
    '',
    '// entity.interact: a player uses an entity (fires once per hand).',
    'msm.events.on("entity.interact", (e) => {',
    '  if (e.hand !== "main") return;',
    '  msm.log.info("entity.interact: " + e.player.name + " used " + e.entity.type);',
    '});',
  ]),
  script('on_entity_hurt', [
    IMPORT,
    '',
    '// entity.hurt: an entity other than a player is hurt by a player.',
    'msm.events.on("entity.hurt", (e) => {',
    '  if (e.entity.isPlayer || e.attacker === undefined || !e.attacker.isPlayer) return;',
    '  msm.log.info("entity.hurt: " + e.entity.type + " took " + e.amount + " from " + e.attacker.name);',
    '});',
  ]),
  script('on_entity_death', [
    IMPORT,
    '',
    '// entity.death: an entity other than a player is killed by a player.',
    'msm.events.on("entity.death", (e) => {',
    '  if (e.entity.isPlayer || e.attacker === undefined || !e.attacker.isPlayer) return;',
    '  msm.log.info("entity.death: " + e.attacker.name + " killed " + e.entity.type);',
    '});',
  ]),
  script('on_player_join', [
    IMPORT,
    '',
    '// player.join: greets the player and logs the join.',
    'msm.events.on("player.join", (e) => {',
    '  e.player.sendMessage("MSM Sample Script is loaded. Use the spark ore.");',
    '  msm.log.info("player.join: " + e.player.name);',
    '});',
  ]),
  script('on_server_started', [
    IMPORT,
    'import { id } from "./util";',
    '',
    '// server.started: logs once the server has started; uses the util module.',
    'msm.events.on("server.started", (e) => {',
    '  msm.log.info("server.started: runtime " + msm.version + " in " + e.world.dimension + ", handler " + id("spark"));',
    '});',
  ]),
  script('on_server_tick', [
    IMPORT,
    '',
    '// server.tick: runs every tick (costly), so this script logs only the first one.',
    'var logged = false;',
    'msm.events.on("server.tick", (e) => {',
    '  if (logged) return;',
    '  logged = true;',
    '  msm.log.info("server.tick: first tick " + e.tick);',
    '});',
  ]),
  script('spark_handler', [
    IMPORT,
    'import { id } from "./util";',
    '',
    `// The action handler that the spark ore's run_script action calls (event ${ns('spark')}).`,
    `msm.actions.define("${ns('spark')}", (e) => {`,
    '  msm.log.info("action " + id("spark") + ": " + e.owner + " " + e.event + " at " + e.pos);',
    '  if (e.player !== undefined) {',
    '    e.player.give(id("spark_gem"), 1);',
    '  }',
    '});',
  ]),
];

/** The mod, a block and an item from the sample mod (renamed), and the scripts. */
const SAMPLE_ELEMENTS: readonly SampleElement[] = [
  {
    id: ns('mod'),
    kind: 'msm:mod',
    data: {
      mod_id: NAMESPACE,
      version: '1.0.0',
      name: PROJECT_NAME,
      description: 'Scripting sample: one script per game event, an action handler and require.',
      authors: ['MCSuperMods'],
      licence: 'MIT',
    },
  },
  {
    id: ns('spark_ore'),
    kind: 'msm:block',
    data: {
      format: 1,
      model: 'minecraft:block/redstone_ore',
      display_name: 'Spark Ore',
      loot: 'self',
      sound_type: 'stone',
      item: { creative_tab: 'minecraft:natural_blocks', max_stack_size: 64, rarity: 'common' },
      components: {
        'msm:breakable': { hardness: 3, resistance: 3, tool: 'pickaxe', min_tier: 'iron' },
        'msm:light_emitter': { level: 7 },
        'msm:on_interact': { event: ns('spark') },
      },
      events: {
        [ns('spark')]: {
          actions: [
            { type: 'play_sound', sound: 'minecraft:block.amethyst_block.chime', volume: 1 },
            { type: 'run_script', handler: ns('spark') },
          ],
        },
      },
    },
  },
  {
    id: ns('spark_gem'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/emerald',
      display_name: 'Spark Gem',
      max_stack_size: 64,
      rarity: 'uncommon',
      creative_tab: 'minecraft:ingredients',
    },
  },
  ...SCRIPTS,
];

const EXPECTED_BLOCKS = SAMPLE_ELEMENTS.filter((entry) => entry.kind === 'msm:block');
const EXPECTED_ITEM_COUNT =
  EXPECTED_BLOCKS.filter((entry) => (entry.data as { item?: Json }).item !== false).length +
  SAMPLE_ELEMENTS.filter((entry) => entry.kind === 'msm:item').length;
const scriptPathOf = (entry: SampleElement): string =>
  `msm/${NAMESPACE}/script/${entry.id.split(':')[1]}.js`;

/** Builds the sample into a project the way the app's `newProject` does, then saves it. */
async function buildSample(): Promise<MemoryFileSystem> {
  const project = createEmptyProject(PROJECT_NAME, {
    targets: [builtInTargets[0]?.target.id as string],
    plugins: PLUGINS.filter((plugin) => (plugin.contributes.elementKinds ?? []).length > 0).map(
      (plugin) => plugin.id,
    ),
  });
  const namespace = { name: NAMESPACE, elements: [] as Element[], assets: [] };
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
  project.namespaces.push(namespace);
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

// Registries and checkers -------------------------------------------------------------------

/** The project's own ids per registry; a block with an item is an item id too. */
function projectIds(project: Project): Record<string, string[]> {
  const ids: Record<string, string[]> = {};
  const add = (name: string, id: string): void => {
    ids[name] = [...(ids[name] ?? []), id];
  };
  for (const element of elementsOf(project)) {
    const name = registry.get(element.kind)?.registry;
    if (name === undefined) continue;
    add(name, element.id);
    if (element.kind === 'msm:block' && (element.data as { item?: Json }).item !== false) {
      add('item', element.id);
    }
  }
  for (const [name, list] of Object.entries(ids)) ids[name] = [...new Set(list)].sort();
  return ids;
}

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

interface TargetContext {
  schemaIndex: SchemaIndex;
  registries: RegistryIndex;
}

async function contextFor(bundle: TargetBundle, project: Project): Promise<TargetContext> {
  const read = (key: Parameters<typeof readVendoredJson>[1]) =>
    readVendoredJson(bundle, key, nodeReadFile);
  const [symbols, vanilla] = await Promise.all([
    read('vanillaMcdocSymbols'),
    read('mcmetaRegistries'),
  ]);
  return {
    schemaIndex: createSchemaIndex(parseVanillaMcdocSymbols(symbols), {
      mcVersion: bundle.target.mcVersion,
    }),
    registries: createRegistryIndex({
      vanilla: vanilla as Record<string, string[]>,
      project: projectIds(project),
    }),
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

/**
 * Type-checks every script together (so `./util` resolves) against the generated typings
 * with `lib.es5` only, as `library.test.ts` checks the library's scripts.
 */
function typeCheckScripts(scripts: readonly SampleElement[]): string[] {
  const libDir = dirname(createRequire(import.meta.url).resolve('typescript/lib/lib.es5.d.ts'));
  const files = new Map<string, string>([['/msm-runtime.d.ts', MSM_RUNTIME_TYPINGS]]);
  for (const entry of scripts) {
    files.set(
      `/script/${entry.id.split(':')[1]}.ts`,
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

/** Tokens TypeScript's ES5 output never contains; Rhino 1.9.2 does not parse some of them. */
const NOT_ES5 = new Map<ts.SyntaxKind, string>([
  [ts.SyntaxKind.ClassKeyword, 'class'],
  [ts.SyntaxKind.AsyncKeyword, 'async'],
  [ts.SyntaxKind.AwaitKeyword, 'await'],
  [ts.SyntaxKind.LetKeyword, 'let'],
  [ts.SyntaxKind.ConstKeyword, 'const'],
  [ts.SyntaxKind.EqualsGreaterThanToken, '=>'],
  [ts.SyntaxKind.NoSubstitutionTemplateLiteral, 'template literal'],
  [ts.SyntaxKind.TemplateHead, 'template literal'],
]);

/** Tokens that end a `for...of` binding (`x`, `[a, b]`, `{ a }`). */
const AFTER_BINDING = new Set([
  ts.SyntaxKind.Identifier,
  ts.SyntaxKind.CloseBracketToken,
  ts.SyntaxKind.CloseBraceToken,
]);

/**
 * The ES5 problems of a transpiled script: parse errors as ES5, the tokens of {@link NOT_ES5},
 * and `for (... of ...)` (an `of` keyword inside a `for` header), found with the scanner.
 */
function es5Problems(js: string): string[] {
  const problems: string[] = [];
  const file = ts.createSourceFile('script.js', js, ts.ScriptTarget.ES5, true, ts.ScriptKind.JS);
  for (const diagnostic of (file as unknown as { parseDiagnostics: ts.Diagnostic[] })
    .parseDiagnostics) {
    problems.push(`parse: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
  }
  const scanner = ts.createScanner(ts.ScriptTarget.ES5, true, ts.LanguageVariant.Standard, js);
  let forDepth = -1;
  let depth = 0;
  let previous = ts.SyntaxKind.Unknown;
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    const name = NOT_ES5.get(token);
    if (name !== undefined) problems.push(`${name} at ${scanner.getTokenStart()}`);
    if (token === ts.SyntaxKind.OpenParenToken) {
      if (previous === ts.SyntaxKind.ForKeyword && forDepth < 0) forDepth = depth;
      depth++;
    } else if (token === ts.SyntaxKind.CloseParenToken) {
      depth--;
      if (depth === forDepth) forDepth = -1;
    } else if (
      token === ts.SyntaxKind.OfKeyword &&
      forDepth >= 0 &&
      depth === forDepth + 1 &&
      AFTER_BINDING.has(previous)
    ) {
      problems.push(`for...of at ${scanner.getTokenStart()}`);
    }
    previous = token;
  }
  return problems;
}

// Tests -------------------------------------------------------------------------------------

describe('sample script project', () => {
  it('equals SAMPLE_ELEMENTS saved as a project', async () => {
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

  it('has one script per game event, an action handler and a require between scripts', async () => {
    const project = await loadSample();
    expect(project.name).toBe(PROJECT_NAME);
    const scripts = elementsOf(project).filter((element) => element.kind === 'msm:script');
    expect(scripts.length).toBe(SCRIPTS.length);
    const text = scripts.map((element) => (element.data as { lines: string[] }).lines.join('\n'));
    for (const event of [
      'block.interact',
      'block.break',
      'item.use',
      'entity.interact',
      'entity.hurt',
      'entity.death',
      'player.join',
      'server.started',
      'server.tick',
    ]) {
      const handlers = text.filter((source) => source.includes(`msm.events.on("${event}"`));
      expect(handlers.length, event).toBe(1);
      expect(handlers[0]?.includes('msm.log.info('), event).toBe(true);
    }
    expect(text.filter((source) => source.includes('msm.actions.define(')).length).toBe(1);
    expect(text.filter((source) => source.includes('from "./util"')).length).toBe(2);
    const blockData = JSON.stringify(
      elementsOf(project).find((element) => element.kind === 'msm:block')?.data,
    );
    expect(blockData).toContain(`{"handler":"${ns('spark')}","type":"run_script"}`);
  });

  it('parses and type-checks every script against the typings', () => {
    expect(typeCheckScripts(SCRIPTS)).toEqual([]);
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sample script export (%s)',
  (_id, bundle) => {
    const { target } = bundle;
    let context: TargetContext;

    beforeAll(async () => {
      context = await contextFor(bundle, await loadSample());
    }, 120_000);

    async function exportJar(
      factory: FabricContentJarOptions = { loadRuntimeJar: async () => stubRuntimeJar },
      exportTarget: Target = target,
    ): Promise<Uint8Array> {
      const sink = createZipSink();
      const report = await runExport({
        project: await loadSample(),
        registry,
        target: exportTarget,
        schemaIndex: context.schemaIndex,
        registries: context.registries,
        exporter: createFabricContentJarExporter({
          ...factory,
          transpileScript: async (source, name) => typescriptTranspile(source, name),
        }),
        sink,
        readAsset: (namespace, path) => sampleFs.readFile(`assets/${namespace}/${path}`),
        meta,
        validateText: async () => [],
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

    it('holds the definitions and every script as ES5 JavaScript', async () => {
      const files = unzipSync(await exportJar());
      const paths = Object.keys(files).sort();
      expect(paths.filter((path) => path.startsWith('msm/'))).toEqual(
        [
          `msm/${NAMESPACE}/block/spark_ore.json`,
          `msm/${NAMESPACE}/item/spark_gem.json`,
          ...SCRIPTS.map(scriptPathOf),
        ].sort(),
      );
      expect(paths.filter((path) => path.endsWith('.ts'))).toEqual([]);
      expect(paths.filter((path) => path.startsWith('META-INF/jars/'))).toEqual([
        `META-INF/jars/msm_runtime-${meta.msmVersion}.jar`,
      ]);
      for (const entry of SCRIPTS) {
        const js = utf8.decode(files[scriptPathOf(entry)] as Uint8Array);
        expect(es5Problems(js), scriptPathOf(entry)).toEqual([]);
        expect(js, scriptPathOf(entry)).toContain('require("msm:runtime")');
      }
      for (const name of ['on_server_started', 'spark_handler']) {
        const js = utf8.decode(files[`msm/${NAMESPACE}/script/${name}.js`] as Uint8Array);
        expect(js, name).toContain('require("./util")');
      }

      const problems: string[] = [];
      for (const [path, ref] of [
        [`msm/${NAMESPACE}/block/spark_ore.json`, MSM_SCHEMA_REFS.blockDefinition],
        [`msm/${NAMESPACE}/item/spark_gem.json`, MSM_SCHEMA_REFS.itemDefinition],
      ] as const) {
        const value = JSON.parse(utf8.decode(files[path] as Uint8Array)) as Json;
        for (const problem of validateJson(value, context.schemaIndex.resolveSchemaRef(ref), {
          registries: context.registries,
        })) {
          problems.push(`${path} ${problem.path} ${problem.code}: ${problem.message}`);
        }
      }
      expect(problems).toEqual([]);

      const modJson = JSON.parse(utf8.decode(files['fabric.mod.json'] as Uint8Array)) as {
        id: string;
        depends: Record<string, string>;
      };
      expect(modJson.id).toBe(NAMESPACE);
      expect(modJson.depends.msm_runtime).toBe(`>=${meta.msmVersion}`);
      expect(modJson.depends.msm_runtime).toBe(`>=${SCRIPT_RUNTIME_MINIMUM}`);
    });

    it('rejects an ES5 problem in the scanner check (self-test)', () => {
      expect(es5Problems('for (var x of y) {}\nclass A {}\nvar f = () => 1;')).toEqual([
        'for...of at 11',
        'class at 20',
        '=> at 42',
      ]);
      expect(es5Problems('for (var i = 0; i < of.length; i++) {}')).toEqual([]);
    });

    describe('content jar', () => {
      const hashFile = join(fixturesRoot, target.id, 'sample-script-jar.sha256');
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
    const outDir = process.env.MSM_SAMPLE_SCRIPT_OUT;
    const isFirstTarget = bundle === builtInTargets[0];
    it.runIf(runtimeJarPath !== undefined && outDir !== undefined && isFirstTarget)(
      'writes the jar with the real runtime for the headless server check',
      async () => {
        const runtimeJar = new Uint8Array(await readFile(runtimeJarPath as string));
        const runtimeVersion = jarModVersion(runtimeJar);
        const jar = await exportJar({ loadRuntimeJar: async () => runtimeJar, runtimeVersion });
        const fabric = target.fabric;
        if (fabric === undefined) throw new Error(`${target.id} has no Fabric facts`);
        await mkdir(outDir as string, { recursive: true });
        await writeFile(join(outDir as string, `${NAMESPACE}.jar`), jar);
        const facts = {
          expectBlocks: EXPECTED_BLOCKS.length,
          expectEntities: 0,
          expectItems: EXPECTED_ITEM_COUNT,
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
        expect(unzipSync(jar)[`META-INF/jars/msm_runtime-${runtimeVersion}.jar`]).toEqual(
          runtimeJar,
        );
      },
    );
  },
);
