/**
 * Golden over the committed game modes project (`fixtures/sample-game-modes`, ADRs 0113 to 0117,
 * ADR 0117 D5, plan B559): namespace `msm_sample_game_modes`, made with the library's game flows
 * as the Creator makes them, plus what the flows cannot add on their own:
 *
 * - **Skyblock** (default answers): the void World Type `sky_survival`, its start island placed
 *   once at the first join with the spawn on its grass, the chest's loot table, the wandering
 *   trader's sky trades and their tag entry, two recipes and the goals tab. Edited: the new
 *   player also gets a kit of three bread (the flow puts everything in the chest).
 * - **One block** (breaks a phase 10, else the defaults): only its `msm:one_block`, moved to
 *   12 66 4 beside the island (the Skyblock's world setup is the project's one; a project has one
 *   world setup).
 * - **Arena game** (default answers): the red and blue teams, the `points` objective on the
 *   sidebar, the five-minute `round` timer on the boss bar whose end runs `round_end`, the arena
 *   template at height 100 and its area with a reset, and the `start` and `round_end` functions.
 * - A second area, `sky_survival/island`, over the start island, whose reset places the island
 *   again (hand-made: no flow makes an area over the Skyblock island).
 * - **Lucky block** (default answers): the block, its drawn picture and model, the recipe, the
 *   prizes, the surprise hut and the rule book that picks one outcome when it is broken.
 * - The rule book `arena_rules` (hand-made, Rules 3, ADR 0115): a player entering the arena joins
 *   the red team, every player gets a point when the round ends, and every player is told when
 *   the one block reaches its second phase. These go through the function bridge (B553), so they
 *   need the Fabric mod jar export.
 *
 * As the app does (ADR 0082 D9), the project is expanded before validating and exporting, and the
 * mcfunction checker is told the ids the games lowering writes (`gamesGeneratedIds`, B551b), the
 * bridge's functions (`rulesGeneratedIds`) and has calls of the bridge's command masked (B557
 * follow-up, `maskProjectCommands` in the app).
 *
 * - The fixture equals the project built from the flows now; `UPDATE_GOLDENS=1` rewrites it (the
 *   README is hand-written).
 * - Every element validates with zero problems, the expansion has none and the plugins'
 *   validators report nothing above info on every target.
 * - The content jar exports with zero errors and warnings; its SHA-256 is pinned per target.
 * - The vanilla data pack exports with only the vanilla pack safety rule's warnings (the lucky
 *   block's files) and holds every games function; the resource pack has nothing of the rules.
 * - With `MSM_RUNTIME_JAR` and `MSM_SAMPLE_GAME_MODES_OUT`, for the selected target, the folder
 *   gets `msm_sample_game_modes.jar` (the real runtime nested) and `fabric-facts.json` for
 *   `tools/run-fabric-server`, the vanilla data pack `msm_sample_game_modes.zip` with
 *   `packs.json` for `vanilla-packs.ts`, and `msm_sample_game_modes_pack.jar`: the same vanilla
 *   data pack as a Fabric mod of its own (no runtime), for the parity GameTests "as a vanilla
 *   pack", without the bridge functions the game drops at load anyway.
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
  expandProject,
  loadProject,
  type MemoryFileSystem,
  type ProjectFileSystem,
  registerPlugin,
  saveProject,
  utf8,
} from '@msm/core';
import type {
  ContentBundle,
  ContentBundleElement,
  Element,
  Json,
  Plugin,
  Problem,
  Project,
  ResourceLocation,
  TargetFacts,
} from '@msm/plugin-api';
import blocksItemsPlugin, { blockGeneratedModelIds, blockItemIdOf } from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import gamesPlugin, { gamesGeneratedIds } from '@msm/plugin-games';
import { libraryStarters } from '@msm/plugin-library';
import modelsAnimPlugin from '@msm/plugin-models-anim';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import rulesPlugin, {
  generatedScript,
  RULES_KIND,
  ruleScriptPath,
  rulesGeneratedIds,
} from '@msm/plugin-rules';
import scriptingPlugin, { findHandlerDefinitions } from '@msm/plugin-scripting';
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
import { createMcfunctionService, type McfunctionService } from '@msm/schemas/mcfunction';
import { builtInTargets, readVendoredJson, type TargetBundle } from '@msm/targets';
import { unzipSync, zipSync } from 'fflate';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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

vi.setConfig({ testTimeout: 60_000 });

const update = process.env.UPDATE_GOLDENS === '1';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, 'fixtures');
const sampleRoot = join(here, '..', '..', '..', 'fixtures', 'sample-game-modes');
const NAMESPACE = 'msm_sample_game_modes';
const PROJECT_NAME = 'MSM Sample Game Modes';
const NOW = '2026-11-23T00:00:00.000Z';
/** Files of the fixture that the test does not generate. */
const HAND_WRITTEN = new Set(['README.md']);
/** Two zones on opposite sides of the date line, so a local-time leak changes the bytes. */
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;

/** The plugins the sample needs, in the app's registration order (rules after scripting). */
const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  structuresPlugin,
  worldgenPlugin,
  blocksItemsPlugin,
  modelsAnimPlugin,
  scriptingPlugin,
  rulesPlugin,
  gamesPlugin,
];
const VALIDATORS = PLUGINS.flatMap((plugin) => plugin.contributes.validators ?? []);

const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);

const meta = {
  msmVersion: '1.5.4',
  plugins: ['msm.blocks-items', 'msm.datapack', 'msm.games', 'msm.rules', 'msm.structures'],
};
const stubRuntimeJar = utf8.encode('PK stub msm_runtime jar for the sample-game-modes golden');

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

// The project -------------------------------------------------------------------------------

type JsonRecord = { [key: string]: Json };

const ns = (path: string): ResourceLocation => `${NAMESPACE}:${path}`;

/** Ids the parity tests (`SampleGameModesParityTest`) name. */
const SAMPLE_IDS = Object.freeze({
  worldSetup: ns('sky_survival'),
  island: ns('sky_survival/island'),
  islandArea: ns('sky_survival/home_island'),
  chest: ns('sky_survival/start_chest'),
  goals: ns('sky_survival/goals/root'),
  oneBlock: ns('one_block/magic_block'),
  red: ns('arena/red'),
  blue: ns('arena/blue'),
  points: ns('arena/points'),
  round: ns('arena/round'),
  arena: ns('arena/arena'),
  arenaBuild: ns('arena/arena_build'),
  start: ns('arena/start'),
  roundEnd: ns('arena/round_end'),
  luckyBlock: ns('lucky_block'),
  luckyRules: ns('lucky_block_rules'),
  arenaRules: ns('arena_rules'),
});

/** Where the one block goes: beside the island's corner, in the empty sky (see the README). */
const ONE_BLOCK_AT = [12, 66, 4] as const;
/** The island's box: the Skyblock flow's classic island, its corner at 0 64 0. */
const ISLAND_FROM = [0, 64, 0] as const;
const ISLAND_TO = [9, 72, 9] as const;

/** One flow's bundle with `values` over its defaults, as the Creator builds it. */
async function flow(id: string, values: Record<string, Json> = {}): Promise<ContentBundle> {
  const starter = libraryStarters.find((entry) => entry.id === id);
  if (starter === undefined) throw new Error(`no starter ${id}`);
  const defaults: Record<string, Json> = {};
  for (const parameter of starter.parameters ?? []) {
    if ('default' in parameter && parameter.default !== undefined) {
      defaults[parameter.id] = parameter.default as Json;
    }
  }
  return starter.build({
    namespace: NAMESPACE,
    projectName: PROJECT_NAME,
    target: defaultTarget().target,
    values: { ...defaults, ...values },
  });
}

/** The hand-made rule book on the games pieces (Rules 3, ADR 0115 D4, D5). */
const ARENA_RULES: Json = {
  counters: [],
  format: 1,
  rules: [
    {
      do: [{ step: 'join_team', team: SAMPLE_IDS.red }],
      key: 'join_red',
      name: 'Players who walk into the arena join the red team',
      when: { subject: SAMPLE_IDS.arena, trigger: 'area_entered' },
    },
    {
      do: [{ amount: 1, objective: SAMPLE_IDS.points, step: 'add_to_score', who: 'every_player' }],
      key: 'round_point',
      name: 'Everyone gets a point when the round ends',
      when: { subject: SAMPLE_IDS.round, trigger: 'timer_ended' },
    },
    {
      do: [{ step: 'show_message', text: ['Underground at last!'], who: 'every_player' }],
      key: 'phase_two',
      name: 'Say so when the one block goes underground',
      when: { options: { phase: 2 }, subject: SAMPLE_IDS.oneBlock, trigger: 'one_block_broken' },
    },
  ],
};

/** The elements and assets of the sample, from the flows, in the order the Creator adds them. */
async function sampleBundle(): Promise<ContentBundle> {
  const skyblock = await flow('skyblock');
  const oneBlock = await flow('one-block', { breaks: 10 });
  const arena = await flow('arena-game');
  const lucky = await flow('lucky-block');

  const elements: ContentBundleElement[] = [];
  const seen = new Set<string>();
  const add = (entry: ContentBundleElement): void => {
    // A flow added to an open project leaves out what the project already has (its `pack`).
    if (seen.has(entry.id)) return;
    seen.add(entry.id);
    elements.push(structuredClone(entry));
  };
  for (const entry of skyblock.elements) {
    if (entry.id === SAMPLE_IDS.worldSetup) {
      const data = structuredClone(entry.data) as JsonRecord;
      (data.new_player as JsonRecord).items = [{ count: 3, item: 'minecraft:bread' }];
      add({
        ...entry,
        data,
        notes: `${entry.notes ?? ''} Each new player also gets a kit of three bread, once (added to the flow's answers for the fixture).`,
      });
    } else add(entry);
  }
  for (const entry of oneBlock.elements) {
    if (entry.kind !== 'msm:one_block') continue;
    const data = structuredClone(entry.data) as JsonRecord;
    data.at = [...ONE_BLOCK_AT];
    add({
      ...entry,
      data,
      notes: `The magic block at ${ONE_BLOCK_AT.join(' ')}, beside the start island in the empty sky: each time it is broken it turns into a block of its phase, picked by weight (plains, underground, deep dark, nether, ocean, end), 10 breaks a phase, now and then a chest of loot of the phase or a mob on top. The name of each phase shows in chat when it starts, and after the last phase the first comes again. Made by the One block flow; only the block is kept (the Skyblock's world setup is the project's one) and it is moved off the island.`,
    });
  }
  for (const entry of arena.elements) add(entry);
  add({
    id: SAMPLE_IDS.islandArea,
    kind: 'msm:area',
    data: {
      dimension: 'minecraft:overworld',
      from: [...ISLAND_FROM],
      name: 'Home island',
      reset: { structures: [{ at: [...ISLAND_FROM], structure: SAMPLE_IDS.island }] },
      to: [...ISLAND_TO],
    },
    notes:
      "The start island's box. Resetting it removes the mobs and items on it and places the island again, as it was at the start (its chest refills once more). It also knows when players walk on or off.",
  });
  for (const entry of lucky.elements) add(entry);
  add({
    id: SAMPLE_IDS.arenaRules,
    kind: RULES_KIND,
    data: ARENA_RULES,
    notes:
      'Rules on the games pieces: a player who walks into the arena joins the red team, every player gets a point when the round ends, and every player is told when the one block reaches its second phase. They reach the games functions through the function bridge, so they need the Fabric mod jar export.',
  });
  return { elements, assets: [...skyblock.assets, ...lucky.assets] };
}

/** Builds the sample into a project the way the app's `newProject` does, then saves it. */
async function buildSample(): Promise<MemoryFileSystem> {
  const bundle = await sampleBundle();
  const project = createEmptyProject(PROJECT_NAME, {
    targets: [defaultTarget().target.id],
    plugins: PLUGINS.filter((plugin) => (plugin.contributes.elementKinds ?? []).length > 0).map(
      (plugin) => plugin.id,
    ),
  });
  // Elements go into the namespace of their id, as the app adds a bundle (the sky trades' tag
  // entry is `minecraft:wandering_trader/common`).
  const namespaces = new Map<string, Project['namespaces'][number]>();
  const namespaceOf = (name: string) => {
    let found = namespaces.get(name);
    if (found === undefined) {
      found = { name, elements: [], assets: [] };
      namespaces.set(name, found);
    }
    return found;
  };
  const namespace = namespaceOf(NAMESPACE);
  for (const entry of bundle.elements) {
    namespaceOf(entry.id.slice(0, entry.id.indexOf(':'))).elements.push(
      createElement({
        id: entry.id as Element['id'],
        kind: entry.kind,
        data: structuredClone(entry.data),
        now: () => NOW,
        ...(entry.notes === undefined ? {} : { notes: entry.notes }),
        ...(entry.tags === undefined ? {} : { tags: entry.tags }),
      }),
    );
  }
  const fs = createMemoryFileSystem();
  for (const asset of bundle.assets) {
    const file = `assets/${asset.namespace}/${asset.path}`;
    await fs.mkdirp(file.slice(0, file.lastIndexOf('/')));
    await fs.writeFile(file, asset.bytes);
    namespace.assets.push({ path: asset.path, mediaType: 'image/png' });
  }
  project.namespaces.push(...namespaces.values());
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

/** The project as the app's session validates and exports it: expanded, with no problems. */
async function expandSample(target: TargetFacts): Promise<Project> {
  const expansion = await expandProject(await loadSample(), PLUGINS, target);
  expect(expansion.problems).toEqual([]);
  return expansion.project;
}

const elementsOf = (project: Project): Element[] =>
  project.namespaces.flatMap((namespace) => namespace.elements);

const dataOf = (project: Project, id: string): JsonRecord =>
  elementsOf(project).find((element) => element.id === id)?.data as JsonRecord;

/** The generated script lines of every rule book of an expanded project, by book id. */
function ruleScripts(expanded: Project): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const element of elementsOf(expanded)) {
    if (element.kind !== RULES_KIND) continue;
    const lines = generatedScript(element.data);
    if (lines !== undefined) out.set(element.id, lines);
  }
  return out;
}

/** The bridge's functions and command of every expanded rule book (B557 follow-up). */
function bridgeOf(expanded: Project): { function: string[]; command: string[] } {
  const functions = new Set<string>();
  const commands = new Set<string>();
  for (const element of elementsOf(expanded)) {
    if (element.kind !== RULES_KIND) continue;
    const ids = rulesGeneratedIds(element.data);
    for (const id of ids.function) functions.add(id);
    for (const literal of ids.command) commands.add(literal);
  }
  return { function: [...functions].sort(), command: [...commands].sort() };
}

/**
 * `problems` without the `scripting.unknown-handler` warnings for handlers a generated rule
 * script defines, as the app's session drops them (B371).
 */
function withoutRuleHandlers(problems: readonly Problem[], expanded: Project): Problem[] {
  const defined = new Set<string>();
  for (const lines of ruleScripts(expanded).values()) {
    for (const definition of findHandlerDefinitions(lines)) defined.add(definition.handler);
  }
  return problems.filter(
    (problem) =>
      problem.code !== 'scripting.unknown-handler' ||
      ![...defined].some((handler) => problem.message.includes(`"${handler}"`)),
  );
}

/**
 * The app's `maskProjectCommands` (B557 follow-up, `app/src/renderer/src/session/
 * mcfunction-problems.ts`), repeated here as `@msm/exporters` may not import the app: each call
 * of a project command (at a line's start or after `run`) and the rest of its line becomes `say`
 * and filler, or `list` for a bare literal, so the vanilla checker accepts it.
 */
function maskProjectCommands(source: string, literals: readonly string[]): string {
  if (literals.length === 0) return source;
  const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const call = new RegExp(`(^\\s*/?|\\brun\\s+)(${literals.map(escaped).join('|')})(?=\\s|$)`);
  return source
    .split('\n')
    .map((line) => {
      if (/^\s*[#$]/.test(line)) return line;
      const match = call.exec(line);
      if (match === null) return line;
      const start = match.index + (match[1] as string).length;
      const rest = line.slice(start + (match[2] as string).length).trim();
      const filler = 'x'.repeat(Math.max(1, line.length - start - 4));
      return `${line.slice(0, start)}${rest === '' ? 'list' : `say ${filler}`}`;
    })
    .join('\n');
}

// Registries and checkers -------------------------------------------------------------------

/**
 * The project's own ids per registry, as the app derives them: element ids under their kind's
 * registry, the block's item and generated models, the namespace's textures, the ids the games
 * lowering writes (B551b, its checker categories included) and the bridge's functions of the
 * expanded rule books (B557 follow-up).
 */
function projectIds(project: Project, expanded: Project): Record<string, string[]> {
  const ids: Record<string, string[]> = {};
  const add = (name: string, id: string): void => {
    ids[name] = [...(ids[name] ?? []), id];
  };
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      for (const [category, list] of Object.entries(gamesGeneratedIds(element))) {
        for (const id of list) add(category, id);
      }
      const name = registry.get(element.kind)?.registry;
      if (name === undefined) {
        if (element.kind.startsWith('minecraft:'))
          add(element.kind.slice('minecraft:'.length), element.id);
        continue;
      }
      if (name.includes(':') || element.kind === 'minecraft:pack_mcmeta') continue;
      add(name, element.id);
      if (element.kind === 'msm:block') {
        const itemId = blockItemIdOf(element.id, element.data);
        if (itemId !== undefined) add('item', itemId);
        for (const id of blockGeneratedModelIds(element.id, element.data as Json)) add('model', id);
      }
    }
    for (const asset of namespace.assets) {
      const match = /^textures\/(.+)\.png$/.exec(asset.path);
      if (match !== null) add('texture', `${namespace.name}:${match[1]}`);
    }
  }
  for (const id of bridgeOf(expanded).function) add('function', id);
  for (const [name, list] of Object.entries(ids)) ids[name] = [...new Set(list)].sort();
  return ids;
}

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

interface TargetContext {
  schemaIndex: SchemaIndex;
  registries: RegistryIndex;
  mcfunction: McfunctionService;
  checkerIds: Record<string, string[]>;
  commands: string[];
  ids: Record<string, string[]>;
}

async function contextFor(bundle: TargetBundle): Promise<TargetContext> {
  const read = (key: Parameters<typeof readVendoredJson>[1]) =>
    readVendoredJson(bundle, key, nodeReadFile);
  const [symbols, vanilla, commands, blocks] = await Promise.all([
    read('vanillaMcdocSymbols'),
    read('mcmetaRegistries'),
    read('mcmetaCommands'),
    read('mcmetaBlocks'),
  ]);
  const expanded = await expandSample(bundle.target);
  const ids = projectIds(await loadSample(), expanded);
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
    checkerIds: {
      ...ids,
      'tag/function': [
        ...new Set([...(ids['tag/function'] ?? []), 'minecraft:load', 'minecraft:tick']),
      ].sort(),
    },
    commands: bridgeOf(expanded).command,
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

/** The games functions every target's data pack must hold, by id path under the namespace. */
const GAMES_FUNCTIONS = [
  'msm_games/world_setup/load',
  'msm_games/world_setup/start',
  'msm_games/world_setup/first_join',
  'msm_games/one_block/one_block/magic_block/next',
  'msm_games/timer/arena/round/start',
  'msm_games/timer/arena/round/end',
  'msm_games/area/arena/arena/reset',
  'msm_games/area/sky_survival/home_island/reset',
  'msm_games/team/arena/red/load',
  'msm_games/objective/arena/points/load',
] as const;

// Tests -------------------------------------------------------------------------------------

describe('sample game modes project', () => {
  it('equals the flows saved as a project', async () => {
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

  it('loads with zero problems and has every games kind and the rule books', async () => {
    const project = await loadSample();
    expect(project.name).toBe(PROJECT_NAME);
    const ofKind = (kind: string): string[] =>
      elementsOf(project)
        .filter((element) => element.kind === kind)
        .map((element) => element.id)
        .sort();
    expect(ofKind('msm:world_setup')).toEqual([SAMPLE_IDS.worldSetup]);
    expect(ofKind('msm:one_block')).toEqual([SAMPLE_IDS.oneBlock]);
    expect(ofKind('msm:team')).toEqual([SAMPLE_IDS.blue, SAMPLE_IDS.red]);
    expect(ofKind('msm:objective')).toEqual([SAMPLE_IDS.points]);
    expect(ofKind('msm:timer')).toEqual([SAMPLE_IDS.round]);
    expect(ofKind('msm:area')).toEqual([SAMPLE_IDS.arena, SAMPLE_IDS.islandArea].sort());
    expect(ofKind(RULES_KIND)).toEqual([SAMPLE_IDS.arenaRules, SAMPLE_IDS.luckyRules]);
    expect(ofKind('msm:block')).toEqual([SAMPLE_IDS.luckyBlock]);
    const setup = dataOf(project, SAMPLE_IDS.worldSetup);
    expect(setup.goals).toBe(SAMPLE_IDS.goals);
    expect((setup.start as JsonRecord).at).toEqual([0, 64, 0]);
    expect(dataOf(project, SAMPLE_IDS.oneBlock).at).toEqual([...ONE_BLOCK_AT]);
    expect(dataOf(project, SAMPLE_IDS.points).display).toBe('sidebar');
    // Both areas have a reset.
    for (const area of [SAMPLE_IDS.arena, SAMPLE_IDS.islandArea]) {
      expect((dataOf(project, area).reset as JsonRecord).structures, area).toBeDefined();
    }
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sample game modes export (%s)',
  (_id, bundle) => {
    const { target } = bundle;
    let context: TargetContext;

    beforeAll(async () => {
      context = await contextFor(bundle);
    }, 120_000);

    async function validateText(file: { language?: string; contents: unknown; path: string }) {
      if (file.language !== 'mcfunction') return [];
      const source = maskProjectCommands(
        utf8.decode(file.contents as Uint8Array).replace(/\n$/, ''),
        context.commands,
      );
      const found = await context.mcfunction.check(source, {
        uri: `file:///msm/${file.path}`,
        projectIds: context.checkerIds,
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
        project: await expandSample(target),
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

    /** The vanilla data pack as the app exports it, with the safety rule's report. */
    async function exportDataPack() {
      const sink = createMemorySink();
      const report = await runExport({
        project: await expandSample(target),
        registry,
        target,
        schemaIndex: context.schemaIndex,
        registries: context.registries,
        exporter: vanillaSafeExporter(
          dataPackExporter,
          modOnlyIdsOf(context.ids, context.commands),
        ),
        sink,
        readAsset: (namespace, path) => sampleFs.readFile(`assets/${namespace}/${path}`),
        meta,
        validateText,
      });
      return { report, files: sink.files() };
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

    it('expands with no problems and passes every validator with nothing above info', async () => {
      const expanded = await expandSample(target);
      const elements = elementsOf(expanded);
      const found = (
        await Promise.all(
          VALIDATORS.map((validator) =>
            validator.validate({ elements, target, registry: context.registries }),
          ),
        )
      ).flat();
      expect(
        withoutRuleHandlers(found, expanded).filter((problem) => problem.severity !== 'info'),
      ).toEqual([]);
      // Both books become scripts; the arena book also lowers the bridge.
      expect([...ruleScripts(expanded).keys()].sort()).toEqual([
        SAMPLE_IDS.arenaRules,
        SAMPLE_IDS.luckyRules,
      ]);
      expect(bridgeOf(expanded)).toEqual({
        function: [
          ns('msm_rules/signal/area/arena/arena/entered'),
          ns('msm_rules/signal/one_block/one_block/magic_block/broken/2'),
          ns('msm_rules/signal/timer/arena/round/ended'),
        ],
        command: [`msm_signal_${NAMESPACE}`],
      });
    });

    it('exports the content jar with the games functions, the bridge and both scripts', async () => {
      const files = unzipSync(await exportJar());
      const paths = Object.keys(files).sort();
      const fn = target.folders.data.function;
      for (const path of GAMES_FUNCTIONS) {
        expect(paths, path).toContain(`data/${NAMESPACE}/${fn}/${path}.mcfunction`);
      }
      for (const id of [SAMPLE_IDS.arenaRules, SAMPLE_IDS.luckyRules]) {
        expect(paths, id).toContain(ruleScriptPath(id).replace(/\.ts$/, '.js'));
      }
      expect(paths).toContain(`msm/${NAMESPACE}/command/msm_signal.json`);
      expect(paths).toContain(`msm/${NAMESPACE}/block/lucky_block.json`);
      expect(paths).toContain(
        `data/${NAMESPACE}/${fn}/msm_rules/signal/timer/arena/round/ended.mcfunction`,
      );
      const modJson = JSON.parse(utf8.decode(files['fabric.mod.json'] as Uint8Array)) as {
        id: string;
      };
      expect(modJson.id).toBe(NAMESPACE);
      expect(files[nestedRuntimePath(meta.msmVersion)]).toEqual(stubRuntimeJar);
    });

    it('exports the vanilla data pack with every games function and none of the lucky block', async () => {
      const { report, files } = await exportDataPack();
      const safety: ReadonlySet<string> = new Set([MOD_ONLY_REFERENCE, MOD_ONLY_FUNCTION]);
      expect(
        report.problems.filter(
          (problem) => problem.severity !== 'info' && !safety.has(problem.code),
        ),
      ).toEqual([]);
      expect(report.ok).toBe(true);
      const paths = [...files.keys()];
      const fn = target.folders.data.function;
      for (const path of GAMES_FUNCTIONS) {
        expect(paths, path).toContain(`data/${NAMESPACE}/${fn}/${path}.mcfunction`);
      }
      expect(paths.some((path) => path.startsWith('msm/'))).toBe(false);
      // The lucky block's recipe names its mod-only item and is left out.
      expect(paths).not.toContain(
        `data/${NAMESPACE}/${target.folders.data.recipe}/lucky_block_from_gold.json`,
      );
    });

    it('leaves the rules out of the vanilla resource pack', async () => {
      const sink = createMemorySink();
      const report = await runExport({
        project: await expandSample(target),
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
      expect(paths.some((path) => path.startsWith('msm/') || path.includes('/script/'))).toBe(
        false,
      );
      expect(paths).toContain(`assets/${NAMESPACE}/${target.folders.resource.lang}/en_us.json`);
    });

    describe('content jar', () => {
      const hashFile = join(fixturesRoot, target.id, 'sample-game-modes-jar.sha256');
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
    const outDir = process.env.MSM_SAMPLE_GAME_MODES_OUT;
    it.runIf(runtimeJarPath !== undefined && outDir !== undefined && bundle === selectedTarget())(
      'writes the content jar, the vanilla data pack and the pack as a mod for the server checks',
      async () => {
        const fabric = target.fabric;
        if (fabric === undefined) throw new Error(`${target.id} has no Fabric facts`);
        const out = outDir as string;
        const runtimeJar = new Uint8Array(await readFile(runtimeJarPath as string));
        const runtimeVersion = jarModVersion(runtimeJar);
        const jar = await exportJar({ loadRuntimeJar: async () => runtimeJar, runtimeVersion });
        await mkdir(out, { recursive: true });
        await writeFile(join(out, `${NAMESPACE}.jar`), jar);
        const facts = {
          expectBlocks: 1,
          expectItems: 1,
          expectScripts: 2,
          fabricApi: fabric.api,
          java: target.java,
          loader: fabric.loader,
          minecraft: target.mcVersion,
          runtimeVersion,
        };
        await writeFile(join(out, 'fabric-facts.json'), `${JSON.stringify(facts, null, 2)}\n`);
        expect(unzipSync(jar)[nestedRuntimePath(runtimeVersion)]).toEqual(runtimeJar);

        // The vanilla data pack, as the app exports it, for vanilla-packs.ts.
        const { report, files } = await exportDataPack();
        expect(report.ok).toBe(true);
        const zip = createZipSink();
        for (const [path, bytes] of files) await zip.writeFile(path, bytes);
        await writeFile(join(out, `${NAMESPACE}.zip`), zip.finish());
        const flagged = (code: string) =>
          report.problems.filter((problem) => problem.code === code).map((p) => p.file ?? '');
        // The bridge's functions call the mod jar's command: the game drops them at load and
        // the hook tags keep loading through their optional entries (ADR 0115 D5).
        const bridge = bridgeOf(await expandSample(target)).function;
        const packs = {
          minecraft: target.mcVersion,
          packs: [
            {
              zip: `${NAMESPACE}.zip`,
              source: 'fixtures/sample-game-modes',
              mod: true,
              leftOut: flagged(MOD_ONLY_REFERENCE).length,
              skippedFunctions: [
                ...new Set([
                  ...flagged(MOD_ONLY_FUNCTION)
                    .map((file) => /^data\/([^/]+)\/[^/]+\/(.+)\.mcfunction$/.exec(file))
                    .map((match) => (match === null ? '' : `${match[1]}:${match[2]}`)),
                  ...bridge,
                ]),
              ].sort(),
            },
          ],
        };
        await writeFile(join(out, 'packs.json'), `${JSON.stringify(packs, null, 2)}\n`);

        // The same data pack as a Fabric mod of its own, for the parity GameTests: the GameTest
        // server makes its own world, so a world's datapacks folder is not read. The bridge's
        // functions are left out (the game drops them at load anyway, which the run would
        // report as a load failure).
        const fn = target.folders.data.function;
        const bridgeFiles = new Set(
          bridge.map((id) => {
            const colon = id.indexOf(':');
            return `data/${id.slice(0, colon)}/${fn}/${id.slice(colon + 1)}.mcfunction`;
          }),
        );
        const modFiles: Record<string, Uint8Array> = {
          'fabric.mod.json': utf8.encode(
            `${JSON.stringify(
              {
                schemaVersion: 1,
                id: `${NAMESPACE}_pack`,
                version: '1.0.0',
                name: `${PROJECT_NAME} (vanilla data pack)`,
                description:
                  "The fixture's vanilla data pack as a mod, for the parity GameTests (B559).",
                environment: '*',
                depends: { fabricloader: '*', minecraft: '*' },
              },
              null,
              2,
            )}\n`,
          ),
        };
        for (const [path, bytes] of files) {
          if (path.startsWith('data/') && !bridgeFiles.has(path)) modFiles[path] = bytes;
        }
        await writeFile(
          join(out, `${NAMESPACE}_pack.jar`),
          zipSync(modFiles, { mtime: new Date(1980, 0, 1) }),
        );
      },
      120_000,
    );
  },
);
