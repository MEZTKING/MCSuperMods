/**
 * Golden over the committed kitchen-sink mod project (`fixtures/sample-mod`, ADR 0026 D6):
 * an `msm:mod`, three `msm:block` and four `msm:item` elements covering every Phase 4
 * component and all six actions, a function and a loot table, namespace `msm_sample_mod`.
 *
 * - The fixture equals the project built from {@link SAMPLE_ELEMENTS} now; `UPDATE_GOLDENS=1`
 *   rewrites it (the README is hand-written).
 * - Every element validates with zero problems, the plugins' project validators report
 *   nothing, and every function passes the offline mcfunction checker.
 * - The content jar exports with zero problems and a stub runtime jar; its SHA-256 is pinned
 *   per target in two time zones (`test/fixtures/<target id>/sample-mod-jar.sha256`).
 * - The jar holds the expected `msm/` definitions, and each validates against the MSM
 *   definition schema with zero problems.
 * - With `MSM_RUNTIME_JAR` (a built `msm_runtime` jar) and `MSM_SAMPLE_MOD_OUT` (a folder),
 *   the jar is also exported with the real runtime nested and written to that folder as
 *   `msm_sample_mod.jar`, next to `fabric-facts.json` for `tools/run-fabric-server` (CI's
 *   `engine-mod` job). Without them that test is skipped.
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
  utf8,
} from '@msm/core';
import type { Element, Json, Plugin, Problem, Project, Target } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import resourcePackPlugin from '@msm/plugin-resourcepack';
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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createFabricContentJarExporter,
  createZipSink,
  type FabricContentJarOptions,
  runExport,
} from '../src/index';

const update = process.env.UPDATE_GOLDENS === '1';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, 'fixtures');
const sampleRoot = join(here, '..', '..', '..', 'fixtures', 'sample-mod');
const NAMESPACE = 'msm_sample_mod';
const PROJECT_NAME = 'MSM Sample Mod';
const NOW = '2026-11-05T00:00:00.000Z';
/** Files of the fixture that the test does not generate. */
const HAND_WRITTEN = new Set(['README.md']);

/** Two zones on opposite sides of the date line, so a local-time leak changes the bytes. */
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;

/** The plugins the sample needs, in the app's registration order. */
const PLUGINS: readonly Plugin[] = [resourcePackPlugin, dataPackPlugin, blocksItemsPlugin];
const VALIDATORS = PLUGINS.flatMap((plugin) => plugin.contributes.validators ?? []);

const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);

const meta = { msmVersion: '0.4.0', plugins: ['msm.blocks-items', 'msm.datapack'] };
const stubRuntimeJar = utf8.encode('PK stub msm_runtime jar for the sample-mod golden');

// The project -----------------------------------------------------------------------------

interface SampleElement {
  id: string;
  kind: string;
  data: Json;
}

const ns = (path: string): string => `${NAMESPACE}:${path}`;

/**
 * The kitchen sink. Between them the blocks and items use every component (`msm:breakable`,
 * `msm:light_emitter`, `msm:on_interact`, `msm:on_step`, `msm:redstone`, `msm:food`,
 * `msm:tool`, `msm:durability`, `msm:on_use`) and every action (`play_sound`,
 * `spawn_particle`, `run_function`, `set_block_state`, `give_item`, `trigger_event`). Models
 * are vanilla ones, so the fixture needs no textures.
 */
const SAMPLE_ELEMENTS: readonly SampleElement[] = [
  {
    id: ns('mod'),
    kind: 'msm:mod',
    data: {
      mod_id: NAMESPACE,
      version: '1.0.0',
      name: PROJECT_NAME,
      description: 'Kitchen-sink sample: every block and item component and every action.',
      authors: ['MCSuperMods'],
      licence: 'MIT',
    },
  },
  {
    id: ns('ruby_ore'),
    kind: 'msm:block',
    data: {
      format: 1,
      model: 'minecraft:block/redstone_ore',
      display_name: 'Ruby Ore',
      loot: ns('blocks/ruby_ore_rich'),
      sound_type: 'stone',
      item: { creative_tab: 'minecraft:natural_blocks', max_stack_size: 64, rarity: 'common' },
      components: {
        'msm:breakable': { hardness: 3, resistance: 3, tool: 'pickaxe', min_tier: 'iron' },
        'msm:light_emitter': { level: 7 },
        'msm:on_interact': { event: ns('shimmer') },
      },
      events: {
        [ns('shimmer')]: {
          actions: [
            { type: 'play_sound', sound: 'minecraft:block.amethyst_block.chime', volume: 1 },
            { type: 'spawn_particle', particle: 'minecraft:glow', count: 12, spread: 0.4 },
            { type: 'run_function', function: ns('ruby/shimmer') },
          ],
        },
      },
    },
  },
  {
    id: ns('chime_block'),
    kind: 'msm:block',
    data: {
      format: 1,
      model: 'minecraft:block/note_block',
      display_name: 'Chime Block',
      loot: 'self',
      sound_type: 'wood',
      item: { creative_tab: 'minecraft:redstone_blocks', max_stack_size: 16, rarity: 'uncommon' },
      components: {
        'msm:breakable': { hardness: 0.8, tool: 'axe', min_tier: 'copper', requires_tool: false },
        'msm:redstone': { emit: 0, on_powered: ns('wake'), on_unpowered: ns('sleep') },
        'msm:on_step': { event: ns('wake'), cooldown_ticks: 20 },
      },
      events: {
        [ns('wake')]: {
          actions: [
            { type: 'play_sound', sound: 'minecraft:block.note_block.bell', pitch: 1.5 },
            { type: 'set_block_state', state: 'minecraft:glowstone', offset: [0, 1, 0] },
          ],
        },
        [ns('sleep')]: {
          actions: [
            { type: 'set_block_state', state: 'minecraft:air', offset: [0, 1, 0] },
            { type: 'trigger_event', event: ns('chime') },
          ],
        },
        [ns('chime')]: {
          actions: [{ type: 'play_sound', sound: 'minecraft:block.note_block.chime', pitch: 0.8 }],
        },
      },
    },
  },
  {
    id: ns('glow_stone'),
    kind: 'msm:block',
    data: {
      format: 1,
      model: 'minecraft:block/glowstone',
      display_name: 'Glow Stone',
      loot: 'self',
      sound_type: 'glass',
      item: false,
      components: {
        'msm:breakable': { hardness: 2, tool: 'shovel', min_tier: 'netherite' },
        'msm:light_emitter': { level: 15 },
      },
    },
  },
  {
    id: ns('ruby'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/emerald',
      display_name: 'Ruby',
      max_stack_size: 64,
      rarity: 'uncommon',
      creative_tab: 'minecraft:ingredients',
    },
  },
  {
    id: ns('ruby_wand'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/blaze_rod',
      display_name: 'Ruby Wand',
      rarity: 'epic',
      creative_tab: 'minecraft:tools_and_utilities',
      components: {
        'msm:tool': { type: 'sword', tier: 'gold' },
        'msm:durability': { max: 32 },
        'msm:on_use': { event: ns('zap'), cooldown_ticks: 10 },
      },
      events: {
        [ns('zap')]: {
          actions: [
            { type: 'give_item', item: ns('ruby'), count: 2 },
            { type: 'spawn_particle', particle: 'minecraft:electric_spark', count: 5, speed: 0.1 },
            { type: 'trigger_event', event: ns('zap_sound') },
          ],
        },
        [ns('zap_sound')]: {
          actions: [{ type: 'play_sound', sound: 'minecraft:entity.lightning_bolt.impact' }],
        },
      },
    },
  },
  {
    id: ns('ruby_pickaxe'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/diamond_pickaxe',
      display_name: 'Ruby Pickaxe',
      rarity: 'rare',
      creative_tab: 'minecraft:tools_and_utilities',
      components: { 'msm:tool': { type: 'pickaxe', tier: 'diamond' } },
    },
  },
  {
    id: ns('ruby_apple'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/apple',
      display_name: 'Ruby Apple',
      max_stack_size: 16,
      creative_tab: 'minecraft:food_and_drinks',
      components: {
        'msm:food': { nutrition: 4, saturation: 0.6, can_always_eat: true },
        'msm:on_use': { event: ns('crunch') },
      },
      events: {
        [ns('crunch')]: {
          actions: [
            { type: 'spawn_particle', particle: 'minecraft:happy_villager', count: 8 },
            { type: 'run_function', function: ns('ruby/shimmer') },
          ],
        },
      },
    },
  },
  {
    id: ns('ruby/shimmer'),
    kind: 'minecraft:function',
    data: {
      lines: [
        '# Run by the ruby ore and the ruby apple (run_function action).',
        'particle minecraft:end_rod ~ ~1 ~ 0.3 0.3 0.3 0.02 10',
        'say The ruby shimmers.',
      ],
    },
  },
  {
    id: ns('blocks/ruby_ore_rich'),
    kind: 'minecraft:loot_table',
    data: {
      type: 'minecraft:block',
      pools: [
        {
          rolls: 1,
          bonus_rolls: 0,
          entries: [
            {
              type: 'minecraft:item',
              name: ns('ruby'),
              modifier: {
                type: 'minecraft:set_count',
                count: { type: 'minecraft:uniform', min: 1, max: 3 },
              },
            },
          ],
          condition: { type: 'minecraft:survives_explosion' },
        },
      ],
      random_sequence: ns('blocks/ruby_ore_rich'),
    },
  },
];

/** Blocks registered by the runtime, and items (block items plus stand-alone items). */
const EXPECTED_BLOCKS = SAMPLE_ELEMENTS.filter((entry) => entry.kind === 'msm:block');
const EXPECTED_ITEM_COUNT =
  EXPECTED_BLOCKS.filter((entry) => (entry.data as { item?: Json }).item !== false).length +
  SAMPLE_ELEMENTS.filter((entry) => entry.kind === 'msm:item').length;

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

/**
 * The project's own ids per registry. A block's item shares the block's id, so block ids
 * (with a block item) are item ids too.
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
  mcfunction: McfunctionService;
  functionIds: Record<string, string[]>;
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
      function: ids.function ?? [],
      loot_table: ids.loot_table ?? [],
      'tag/function': ['minecraft:load', 'minecraft:tick'],
    },
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

describe('sample mod project', () => {
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

  it('loads with zero problems and covers every component and action', async () => {
    const project = await loadSample();
    expect(project.name).toBe(PROJECT_NAME);
    const text = JSON.stringify(elementsOf(project).map((element) => element.data));
    for (const component of [
      'msm:breakable',
      'msm:light_emitter',
      'msm:on_interact',
      'msm:on_step',
      'msm:redstone',
      'msm:food',
      'msm:tool',
      'msm:durability',
      'msm:on_use',
    ]) {
      expect(text.includes(`"${component}"`), component).toBe(true);
    }
    for (const action of [
      'play_sound',
      'spawn_particle',
      'run_function',
      'set_block_state',
      'give_item',
      'trigger_event',
    ]) {
      expect(text.includes(`"type":"${action}"`), action).toBe(true);
    }
    const kinds = new Set(elementsOf(project).map((element) => element.kind));
    expect([...kinds].sort()).toEqual([
      'minecraft:function',
      'minecraft:loot_table',
      'msm:block',
      'msm:item',
      'msm:mod',
    ]);
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sample mod export (%s)',
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
        exporter: createFabricContentJarExporter(factory),
        sink,
        readAsset: (namespace, path) => sampleFs.readFile(`assets/${namespace}/${path}`),
        meta,
        async validateText(file) {
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
        },
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
      const found = VALIDATORS.flatMap((validator) =>
        validator.validate({ elements, target, registry: context.registries }),
      );
      expect(found).toEqual([]);
    });

    it('holds the expected files, and every msm definition validates', async () => {
      const files = unzipSync(await exportJar());
      const paths = Object.keys(files).sort();
      const definitions = paths.filter((path) => path.startsWith('msm/'));
      expect(definitions).toEqual(
        [
          ...EXPECTED_BLOCKS.map(
            (entry) => `msm/${NAMESPACE}/block/${entry.id.split(':')[1]}.json`,
          ),
          ...SAMPLE_ELEMENTS.filter((entry) => entry.kind === 'msm:item').map(
            (entry) => `msm/${NAMESPACE}/item/${entry.id.split(':')[1]}.json`,
          ),
        ].sort(),
      );
      for (const path of [
        'fabric.mod.json',
        'msm.export.json',
        `data/${NAMESPACE}/${target.folders.data.function}/ruby/shimmer.mcfunction`,
        `data/${NAMESPACE}/${target.folders.data.loot_table}/blocks/ruby_ore_rich.json`,
        `data/${NAMESPACE}/${target.folders.data.loot_table}/blocks/chime_block.json`,
        `assets/${NAMESPACE}/${target.folders.resource.lang}/en_us.json`,
      ]) {
        expect(paths, path).toContain(path);
      }
      expect(paths.filter((path) => path.startsWith('META-INF/jars/'))).toEqual([
        `META-INF/jars/msm_runtime-${meta.msmVersion}.jar`,
      ]);
      expect(paths).not.toContain('pack.mcmeta');

      const problems: string[] = [];
      for (const path of definitions) {
        const ref = path.includes('/block/')
          ? MSM_SCHEMA_REFS.blockDefinition
          : MSM_SCHEMA_REFS.itemDefinition;
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
        jars: { file: string }[];
      };
      expect(modJson.id).toBe(NAMESPACE);
      expect(modJson.depends.msm_runtime).toBe(`>=${meta.msmVersion}`);
      expect(modJson.jars).toEqual([{ file: `META-INF/jars/msm_runtime-${meta.msmVersion}.jar` }]);
    });

    describe('content jar', () => {
      const hashFile = join(fixturesRoot, target.id, 'sample-mod-jar.sha256');
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
    const outDir = process.env.MSM_SAMPLE_MOD_OUT;
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
          expectItems: EXPECTED_ITEM_COUNT,
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
