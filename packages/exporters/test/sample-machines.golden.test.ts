/**
 * Golden over the committed machines project (`fixtures/sample-machines`, ADRs 0074–0076, plan
 * B323): an `msm:mod` and nine `msm:block` elements, one per container layout and machine
 * power, namespace `msm_sample_machines`:
 *
 * - `crate`: `directional`, `msm:container` chest of 3 rows (27 slots), with the open front;
 *   `on_open` and `on_close` say a line. The loot crate is this block placed by the function
 *   `place_loot_crate` with the loot table `chests/crate_loot` (fills on the first open).
 * - `small_crate`: `horizontal`, chest of 1 row (9 slots), its lid towards the player.
 * - `keep_crate`: `directional`, chest of 3 rows with `keep_contents` (the shulker box menu and
 *   the keep-contents loot table) and the chest's open and close sounds.
 * - `hopper_box`: `pillar`, the hopper layout (5 slots), `comparator: false`.
 * - `dispenser_box`: `directional`, the dispenser layout (3 by 3).
 * - `holder`: `block`, layout `none` with one slot (no screen, put in and take out); `on_open`
 *   (each use) says a line.
 * - `grinder`: `horizontal`, a `fuel` machine with its own four recipes (an item, a count of
 *   two, a tag ingredient, experience), `default_time` 40; `on_start` and `on_finish` say a line.
 * - `fast_furnace`: `horizontal`, `minecraft:smelting` at `speed` 2 (no recipes of its own);
 *   `on_finish` says a line.
 * - `redstone_grinder`: `horizontal`, a `redstone` machine that takes the grinder's recipes,
 *   in the blast furnace menu, with `lit_light` 15 and the `progress` comparator; `on_finish`
 *   says a line.
 *
 * Textures are the library's placeholder pictures (`placeholderPng`), as the Storage crate
 * and Machine flows draw them.
 *
 * - The fixture equals the project built from {@link SAMPLE_ELEMENTS} and {@link SAMPLE_ASSETS}
 *   now; `UPDATE_GOLDENS=1` rewrites it (the README is hand-written).
 * - Every element validates with zero problems, the plugins' project validators report nothing
 *   on every target, and the functions pass the offline mcfunction checker.
 * - The content jar exports with zero errors and warnings, holds the definitions (valid), the
 *   machine recipes, the keep-contents loot table and the state models, and its SHA-256 is
 *   pinned per target in two time zones (`test/fixtures/<target id>/sample-machines-jar.sha256`).
 * - The vanilla data pack (through the vanilla pack safety rule, ADR 0066) keeps the functions
 *   and the crate's chest loot table and leaves out the machine recipes and the blocks' loot
 *   tables with `export.mod-only-reference`; `place_loot_crate` is kept with
 *   `export.mod-only-function`.
 * - With `MSM_RUNTIME_JAR` (a built `msm_runtime` jar for the selected target) and
 *   `MSM_SAMPLE_MACHINES_OUT` (a folder), the jar is also exported with the real runtime nested
 *   and written to that folder as `msm_sample_machines.jar`, next to `fabric-facts.json` for
 *   `tools/run-fabric-server`. Without them that test is skipped.
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
import type { Element, Json, Plugin, Problem, Project } from '@msm/plugin-api';
import blocksItemsPlugin, { blockGeneratedModelIds, blockItemIdOf } from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import { COLOURS as LIBRARY_COLOURS, placeholderPng, type Rgb } from '@msm/plugin-library';
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
  createMemorySink,
  createZipSink,
  dataPackExporter,
  type FabricContentJarOptions,
  MOD_ONLY_FUNCTION,
  MOD_ONLY_REFERENCE,
  modOnlyIdsOf,
  nestedRuntimePath,
  runExport,
  vanillaSafeExporter,
} from '../src/index';
import { defaultTarget, selectedTarget } from './selected-target';

const update = process.env.UPDATE_GOLDENS === '1';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, 'fixtures');
const sampleRoot = join(here, '..', '..', '..', 'fixtures', 'sample-machines');
const NAMESPACE = 'msm_sample_machines';
const PROJECT_NAME = 'MSM Sample Machines';
const NOW = '2026-11-14T00:00:00.000Z';
/** Files of the fixture that the test does not generate. */
const HAND_WRITTEN = new Set(['README.md']);

/** Two zones on opposite sides of the date line, so a local-time leak changes the bytes. */
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;

/** The plugins the sample needs, in the app's registration order (`msm:mod` is blocks-items'). */
const PLUGINS: readonly Plugin[] = [resourcePackPlugin, dataPackPlugin, blocksItemsPlugin];
const VALIDATORS = PLUGINS.flatMap((plugin) => plugin.contributes.validators ?? []);

const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);

const meta = { msmVersion: '1.4.0', plugins: ['msm.blocks-items', 'msm.datapack'] };
const stubRuntimeJar = utf8.encode('PK stub msm_runtime jar for the sample-machines golden');

// The project -----------------------------------------------------------------------------

interface SampleElement {
  id: string;
  kind: string;
  data: Json;
}

interface SampleAsset {
  /** Path under the namespace's assets, such as `textures/block/x.png`. */
  path: string;
  bytes: Uint8Array;
}

type JsonRecord = { [key: string]: Json };
type Pattern = Parameters<typeof placeholderPng>[0];

const ns = (path: string): string => `${NAMESPACE}:${path}`;

/** The function an event runs: `say/<name>`, which says {@link SAY_LINES}`[name]`. */
const SAY_LINES = {
  crate_opened: 'The crate is opened.',
  crate_closed: 'The crate is closed.',
  holder_used: 'The holder is used.',
  grinder_started: 'The grinder starts.',
  grinder_finished: 'The grinder finishes.',
  fast_furnace_finished: 'The fast furnace finishes.',
  redstone_grinder_finished: 'The redstone grinder finishes.',
} as const;
type SayName = keyof typeof SAY_LINES;

const sayFunction = (name: SayName): string => ns(`say/${name}`);
/** The event id `<ns>:<name>` and its definition, which runs `say/<name>`. */
const sayEvent = (name: SayName): [string, Json] => [
  ns(name),
  { actions: [{ type: 'run_function', function: sayFunction(name) }] },
];

/** The loot crate's table: fixed contents, so a parity test can count them. */
const CRATE_LOOT = ns('chests/crate_loot');
const LOOT_CRATE_FUNCTION = ns('place_loot_crate');

const COLOURS = {
  wood: LIBRARY_COLOURS.wood,
  violet: LIBRARY_COLOURS.violet,
  slate: LIBRARY_COLOURS.slate,
  ruby: LIBRARY_COLOURS.ruby,
  amber: LIBRARY_COLOURS.amber,
  frost: LIBRARY_COLOURS.frost,
} as const satisfies Record<string, Rgb>;

const texture = (path: string, pattern: Pattern, colour: Rgb): SampleAsset => ({
  path: `textures/block/${path}.png`,
  bytes: placeholderPng(pattern, { colour }),
});
const blockTexture = (path: string): string => ns(`block/${path}`);

/** A barrel's breaking: mined faster with an axe, dropped by hand. */
const WOODEN: JsonRecord = { hardness: 2.5, resistance: 2.5, tool: 'axe', requires_tool: false };
/** A furnace's breaking: needs a pickaxe to drop. */
const STONE: JsonRecord = { hardness: 3.5, resistance: 3.5, tool: 'pickaxe' };

interface BlockInput {
  name: string;
  display: string;
  type?: 'horizontal' | 'directional' | 'pillar';
  sound: string;
  tab: string;
  breakable: JsonRecord;
  /** The pictures of a typed block. */
  textures?: JsonRecord;
  /** The model of a `block` type block. */
  model?: string;
  component: ['msm:container' | 'msm:machine', JsonRecord];
  recipes?: Json[];
  events?: SayName[];
}

function block(input: BlockInput): SampleElement {
  const [componentId, component] = input.component;
  return {
    id: ns(input.name),
    kind: 'msm:block',
    data: {
      format: 1,
      display_name: input.display,
      ...(input.type === undefined ? {} : { type: input.type }),
      sound_type: input.sound,
      loot: 'self',
      item: { creative_tab: input.tab },
      ...(input.model === undefined ? {} : { model: input.model }),
      ...(input.textures === undefined ? {} : { textures: input.textures }),
      components: { 'msm:breakable': { ...input.breakable }, [componentId]: component },
      ...(input.recipes === undefined ? {} : { recipes: input.recipes }),
      ...(input.events === undefined
        ? {}
        : { events: Object.fromEntries(input.events.map((name) => sayEvent(name))) }),
    },
  };
}

const FUNCTIONAL = 'minecraft:functional_blocks';

/** A front, its open or lit front, sides and top for a horizontal or directional block. */
function frontTextures(
  name: string,
  state: 'front_open' | 'front_lit',
  sides: Pattern,
  colour: Rgb,
): { textures: JsonRecord; assets: SampleAsset[] } {
  const lit = state === 'front_lit';
  const front = lit ? 'block_front' : 'trapdoor';
  const assets = [
    texture(name, sides, colour),
    texture(`${name}_front`, front, colour),
    texture(`${name}_${state}`, 'block_front', lit ? COLOURS.amber : colour),
  ];
  const textures: JsonRecord = {
    front: blockTexture(`${name}_front`),
    [state]: blockTexture(`${name}_${state}`),
  };
  if (lit) {
    assets.push(texture(`${name}_top`, 'polished_stone', colour));
    textures.side = blockTexture(name);
    textures.top = blockTexture(`${name}_top`);
  } else {
    textures.all = blockTexture(name);
  }
  return { textures, assets };
}

const crateLook = frontTextures('crate', 'front_open', 'planks', COLOURS.wood);
const keepCrateLook = frontTextures('keep_crate', 'front_open', 'planks', COLOURS.violet);
const dispenserLook = frontTextures('dispenser_box', 'front_open', 'stone', COLOURS.slate);
const grinderLook = frontTextures('grinder', 'front_lit', 'plain', COLOURS.slate);
const furnaceLook = frontTextures('fast_furnace', 'front_lit', 'bricks', COLOURS.ruby);
const redstoneLook = frontTextures('redstone_grinder', 'front_lit', 'plain', COLOURS.ruby);

/** The small crate turns its lid (front) towards the player; the same pictures as a crate. */
const SMALL_CRATE_ASSETS: SampleAsset[] = [
  texture('small_crate', 'planks', COLOURS.wood),
  texture('small_crate_front', 'trapdoor', COLOURS.wood),
  texture('small_crate_front_open', 'block_front', COLOURS.wood),
];

const HOPPER_BOX_ASSETS: SampleAsset[] = [
  texture('hopper_box', 'pillar_side', COLOURS.slate),
  texture('hopper_box_end', 'pillar_top', COLOURS.slate),
];

const HOLDER_ASSETS: SampleAsset[] = [texture('holder', 'polished_stone', COLOURS.frost)];
/** The holder is a plain `block`: its own cube model over its one picture. */
const HOLDER_MODEL = ns('block/holder');

const GRINDER = ns('grinder');

/** The grinder's own recipes (its recipe type is its id). */
const GRINDER_RECIPES: Json[] = [
  { ingredient: 'minecraft:cobblestone', result: 'minecraft:gravel' },
  { ingredient: 'minecraft:gravel', result: 'minecraft:flint', time: 20, experience: 1 },
  { ingredient: 'minecraft:bone', result: { id: 'minecraft:bone_meal', count: 4 } },
  {
    name: 'string_from_wool',
    ingredient: '#minecraft:wool',
    count: 2,
    result: { id: 'minecraft:string', count: 4 },
  },
];
/** The recipe files' names under `recipe/grinder/`, in order. */
const GRINDER_RECIPE_NAMES = ['gravel', 'flint', 'bone_meal', 'string_from_wool'];

const BLOCKS: readonly SampleElement[] = [
  block({
    name: 'crate',
    display: 'Sample Crate',
    type: 'directional',
    sound: 'wood',
    tab: FUNCTIONAL,
    breakable: WOODEN,
    textures: crateLook.textures,
    component: [
      'msm:container',
      { layout: 'chest', rows: 3, on_open: ns('crate_opened'), on_close: ns('crate_closed') },
    ],
    events: ['crate_opened', 'crate_closed'],
  }),
  block({
    name: 'small_crate',
    display: 'Sample Small Crate',
    type: 'horizontal',
    sound: 'wood',
    tab: FUNCTIONAL,
    breakable: WOODEN,
    textures: {
      front: blockTexture('small_crate_front'),
      front_open: blockTexture('small_crate_front_open'),
      side: blockTexture('small_crate'),
      top: blockTexture('small_crate'),
    },
    component: ['msm:container', { layout: 'chest', rows: 1 }],
  }),
  block({
    name: 'keep_crate',
    display: 'Sample Keeping Crate',
    type: 'directional',
    sound: 'wood',
    tab: FUNCTIONAL,
    breakable: WOODEN,
    textures: keepCrateLook.textures,
    component: [
      'msm:container',
      {
        layout: 'chest',
        rows: 3,
        keep_contents: true,
        open_sound: 'minecraft:block.chest.open',
        close_sound: 'minecraft:block.chest.close',
      },
    ],
  }),
  block({
    name: 'hopper_box',
    display: 'Sample Hopper Box',
    type: 'pillar',
    sound: 'metal',
    tab: FUNCTIONAL,
    breakable: { hardness: 3, resistance: 4.8, tool: 'pickaxe' },
    textures: { side: blockTexture('hopper_box'), end: blockTexture('hopper_box_end') },
    component: ['msm:container', { layout: 'hopper', comparator: false }],
  }),
  block({
    name: 'dispenser_box',
    display: 'Sample Dispenser Box',
    type: 'directional',
    sound: 'stone',
    tab: FUNCTIONAL,
    breakable: STONE,
    textures: dispenserLook.textures,
    component: ['msm:container', { layout: 'dispenser' }],
  }),
  block({
    name: 'holder',
    display: 'Sample Holder',
    sound: 'stone',
    tab: FUNCTIONAL,
    breakable: STONE,
    model: HOLDER_MODEL,
    component: ['msm:container', { layout: 'none', size: 1, on_open: ns('holder_used') }],
    events: ['holder_used'],
  }),
  block({
    name: 'grinder',
    display: 'Sample Grinder',
    type: 'horizontal',
    sound: 'stone',
    tab: FUNCTIONAL,
    breakable: STONE,
    textures: grinderLook.textures,
    component: [
      'msm:machine',
      {
        power: 'fuel',
        default_time: 40,
        on_start: ns('grinder_started'),
        on_finish: ns('grinder_finished'),
      },
    ],
    recipes: GRINDER_RECIPES,
    events: ['grinder_started', 'grinder_finished'],
  }),
  block({
    name: 'fast_furnace',
    display: 'Sample Fast Furnace',
    type: 'horizontal',
    sound: 'stone',
    tab: FUNCTIONAL,
    breakable: STONE,
    textures: furnaceLook.textures,
    component: [
      'msm:machine',
      {
        recipe_types: ['minecraft:smelting'],
        speed: 2,
        on_finish: ns('fast_furnace_finished'),
      },
    ],
    events: ['fast_furnace_finished'],
  }),
  block({
    name: 'redstone_grinder',
    display: 'Sample Redstone Grinder',
    type: 'horizontal',
    sound: 'stone',
    tab: 'minecraft:redstone_blocks',
    breakable: STONE,
    textures: redstoneLook.textures,
    component: [
      'msm:machine',
      {
        recipe_types: [GRINDER],
        power: 'redstone',
        menu: 'blast_furnace',
        comparator: 'progress',
        lit_light: 15,
        on_finish: ns('redstone_grinder_finished'),
      },
    ],
    events: ['redstone_grinder_finished'],
  }),
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
        'Sample containers and machines: crates, a hopper box, a dispenser box, a holder, a grinder, a fast furnace and a redstone grinder.',
      authors: ['MCSuperMods'],
      licence: 'MIT',
    },
  },
  ...BLOCKS,
  {
    id: HOLDER_MODEL,
    kind: 'minecraft:model',
    data: { parent: 'minecraft:block/cube_all', textures: { all: blockTexture('holder') } },
  },
  {
    id: CRATE_LOOT,
    kind: 'minecraft:loot_table',
    data: {
      type: 'minecraft:chest',
      pools: [
        {
          rolls: 1,
          entries: [
            {
              type: 'minecraft:item',
              name: 'minecraft:diamond',
              modifier: { type: 'minecraft:set_count', count: 3 },
            },
          ],
        },
        {
          rolls: 1,
          entries: [
            {
              type: 'minecraft:item',
              name: 'minecraft:bread',
              modifier: { type: 'minecraft:set_count', count: 5 },
            },
          ],
        },
      ],
      random_sequence: CRATE_LOOT,
    },
  },
  {
    id: LOOT_CRATE_FUNCTION,
    kind: 'minecraft:function',
    data: {
      lines: [`setblock ~ ~ ~ ${ns('crate')}{LootTable:"${CRATE_LOOT}"} replace`],
    },
  },
  ...(Object.entries(SAY_LINES) as [SayName, string][]).map(
    ([name, line]): SampleElement => ({
      id: sayFunction(name),
      kind: 'minecraft:function',
      data: { lines: [`say ${line}`] },
    }),
  ),
];

const SAMPLE_ASSETS: readonly SampleAsset[] = [
  ...crateLook.assets,
  ...SMALL_CRATE_ASSETS,
  ...keepCrateLook.assets,
  ...HOPPER_BOX_ASSETS,
  ...dispenserLook.assets,
  ...HOLDER_ASSETS,
  ...grinderLook.assets,
  ...furnaceLook.assets,
  ...redstoneLook.assets,
];

const BLOCK_NAMES = BLOCKS.map((entry) => entry.id.split(':')[1] as string);
const isMachine = (entry: SampleElement): boolean =>
  ((entry.data as JsonRecord).components as JsonRecord)['msm:machine'] !== undefined;
const MACHINE_NAMES = BLOCKS.filter(isMachine).map((entry) => entry.id.split(':')[1] as string);

/** What the runtime registers: nine blocks, their items, nine block entity types, 3 recipe types. */
const EXPECTED_BLOCKS = BLOCKS.length;
const EXPECTED_ITEMS = BLOCKS.length;

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

// Registries and checkers -------------------------------------------------------------------

/**
 * The project's own ids per registry, as the app derives them: element ids under their kind's
 * registry, each block's item and generated models, each machine's id as a `recipe_type` and
 * `recipe_serializer` (B318), and the textures of the namespace's PNG assets.
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
      const components = (element.data as { components?: JsonRecord }).components ?? {};
      if (components['msm:machine'] !== undefined) {
        add('recipe_type', element.id);
        add('recipe_serializer', element.id);
      }
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
      loot_table: ids.loot_table ?? [],
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

const componentsOf = (element: Element): JsonRecord =>
  (element.data as { components?: JsonRecord }).components ?? {};

// Tests -------------------------------------------------------------------------------------

describe('sample machines project', () => {
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

  it('loads with zero problems and has one block per layout and power', async () => {
    const project = await loadSample();
    expect(project.name).toBe(PROJECT_NAME);
    const blocks = new Map(
      elementsOf(project)
        .filter((element) => element.kind === 'msm:block')
        .map((element) => [element.id.split(':')[1] as string, componentsOf(element)] as const),
    );
    expect([...blocks.keys()].sort()).toEqual([...BLOCK_NAMES].sort());
    const container = (name: string) => blocks.get(name)?.['msm:container'] as JsonRecord;
    const machine = (name: string) => blocks.get(name)?.['msm:machine'] as JsonRecord;
    expect(
      Object.fromEntries(
        BLOCK_NAMES.filter((name) => container(name) !== undefined).map((name) => [
          name,
          container(name).layout,
        ]),
      ),
    ).toEqual({
      crate: 'chest',
      dispenser_box: 'dispenser',
      holder: 'none',
      hopper_box: 'hopper',
      keep_crate: 'chest',
      small_crate: 'chest',
    });
    expect(container('keep_crate')).toMatchObject({ rows: 3, keep_contents: true });
    expect(container('small_crate')).toMatchObject({ rows: 1 });
    expect(MACHINE_NAMES.sort()).toEqual(['fast_furnace', 'grinder', 'redstone_grinder']);
    expect(machine('grinder')).toMatchObject({ power: 'fuel' });
    expect(machine('grinder').recipe_types).toBeUndefined();
    expect(machine('fast_furnace')).toMatchObject({ recipe_types: ['minecraft:smelting'] });
    expect(machine('redstone_grinder')).toMatchObject({
      recipe_types: [GRINDER],
      power: 'redstone',
    });
    for (const [name, line] of Object.entries(SAY_LINES)) {
      const fn = elementsOf(project).find((element) => element.id === ns(`say/${name}`));
      expect((fn?.data as { lines?: string[] } | undefined)?.lines, name).toEqual([`say ${line}`]);
    }
    const kinds = new Set(elementsOf(project).map((element) => element.kind));
    expect([...kinds].sort()).toEqual([
      'minecraft:function',
      'minecraft:loot_table',
      'minecraft:model',
      'msm:block',
      'msm:mod',
    ]);
    expect(project.namespaces[0]?.assets.map((asset) => asset.path).sort()).toEqual(
      SAMPLE_ASSETS.map((asset) => asset.path).sort(),
    );
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sample machines export (%s)',
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
    ): Promise<{ jar: Uint8Array; problems: Problem[] }> {
      const sink = createZipSink();
      const report = await runExport({
        project: await loadSample(),
        registry,
        target,
        schemaIndex: context.schemaIndex,
        registries: context.registries,
        exporter: createFabricContentJarExporter(factory),
        sink,
        readAsset: (namespace, path) => sampleFs.readFile(`assets/${namespace}/${path}`),
        meta,
        validateText,
      });
      expect(report.problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
      expect(report.ok).toBe(true);
      return { jar: sink.finish(), problems: report.problems };
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

    it('holds the definitions, recipes, loot tables, models and functions, all valid', async () => {
      const { jar } = await exportJar();
      const files = unzipSync(jar);
      const paths = Object.keys(files).sort();
      const resource = target.folders.resource;
      const data = target.folders.data;
      const definitions = BLOCK_NAMES.map((name) => `msm/${NAMESPACE}/block/${name}.json`);
      expect(paths.filter((path) => path.startsWith('msm/'))).toEqual([...definitions].sort());
      const recipes = GRINDER_RECIPE_NAMES.map(
        (name) => `data/${NAMESPACE}/${data.recipe}/grinder/${name}.json`,
      );
      expect(paths.filter((path) => path.includes(`/${data.recipe}/`))).toEqual(
        [...recipes].sort(),
      );
      for (const path of [
        'fabric.mod.json',
        'msm.export.json',
        `assets/${NAMESPACE}/${resource.lang}/en_us.json`,
        `data/${NAMESPACE}/${data.loot_table}/chests/crate_loot.json`,
        `data/${NAMESPACE}/${data.function}/place_loot_crate.mcfunction`,
        ...BLOCK_NAMES.flatMap((name) => [
          `assets/${NAMESPACE}/blockstates/${name}.json`,
          `data/${NAMESPACE}/${data.loot_table}/blocks/${name}.json`,
        ]),
        ...['crate', 'small_crate', 'keep_crate', 'dispenser_box'].map(
          (name) => `assets/${NAMESPACE}/models/block/${name}_open.json`,
        ),
        ...MACHINE_NAMES.map((name) => `assets/${NAMESPACE}/models/block/${name}_lit.json`),
        ...Object.keys(SAY_LINES).map(
          (name) => `data/${NAMESPACE}/${data.function}/say/${name}.mcfunction`,
        ),
      ]) {
        expect(paths, path).toContain(path);
      }
      expect(paths).not.toContain('pack.mcmeta');

      const json = (path: string): Json => JSON.parse(utf8.decode(files[path] as Uint8Array));
      const problems: string[] = [];
      for (const name of BLOCK_NAMES) {
        const path = `msm/${NAMESPACE}/block/${name}.json`;
        for (const problem of validateJson(
          json(path),
          context.schemaIndex.resolveSchemaRef(MSM_SCHEMA_REFS.blockDefinition),
          { registries: context.registries },
        )) {
          problems.push(`${path} ${problem.path} ${problem.code}: ${problem.message}`);
        }
        // Element-only fields are stripped from the definitions.
        expect(Object.keys(json(path) as JsonRecord), path).not.toContain('recipes');
      }
      for (const path of recipes) {
        for (const problem of validateJson(
          json(path),
          context.schemaIndex.resolveSchemaRef(MSM_SCHEMA_REFS.machineRecipe),
          { registries: context.registries },
        )) {
          problems.push(`${path} ${problem.path} ${problem.code}: ${problem.message}`);
        }
        expect(json(path), path).toMatchObject({ type: GRINDER });
      }
      expect(problems).toEqual([]);
      expect(json(recipes[0] as string)).toEqual({
        type: GRINDER,
        ingredient: 'minecraft:cobblestone',
        result: { id: 'minecraft:gravel' },
      });

      // The keep-contents crate copies its contents into its item; the others drop themselves.
      const keepLoot = JSON.stringify(
        json(`data/${NAMESPACE}/${data.loot_table}/blocks/keep_crate.json`),
      );
      expect(keepLoot).toContain('minecraft:copy_components');
      expect(keepLoot).toContain('minecraft:container');
      expect(
        JSON.stringify(json(`data/${NAMESPACE}/${data.loot_table}/blocks/crate.json`)),
      ).not.toContain('copy_components');

      const lang = json(`assets/${NAMESPACE}/${resource.lang}/en_us.json`) as JsonRecord;
      for (const name of BLOCK_NAMES) {
        expect(lang[`block.${NAMESPACE}.${name}`], name).toBeDefined();
      }

      const modJson = json('fabric.mod.json') as {
        id: string;
        depends: Record<string, string>;
        jars: { file: string }[];
      };
      expect(modJson.id).toBe(NAMESPACE);
      expect(modJson.depends.msm_runtime).toBe(`>=${meta.msmVersion}`);
      const runtimePath = nestedRuntimePath(meta.msmVersion);
      expect(files[runtimePath]).toEqual(stubRuntimeJar);
      expect(paths.filter((path) => path.startsWith('META-INF/jars/'))).toEqual([runtimePath]);
    });

    it('leaves the machine recipes and block loot out of the vanilla data pack', async () => {
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
          // The vanilla mining tags, with the mod's blocks as optional entries.
          `data/minecraft/${data.tags}/block/mineable/axe.json`,
          `data/minecraft/${data.tags}/block/mineable/pickaxe.json`,
          `data/${NAMESPACE}/${data.loot_table}/chests/crate_loot.json`,
          `data/${NAMESPACE}/${data.function}/place_loot_crate.mcfunction`,
          ...Object.keys(SAY_LINES).map(
            (name) => `data/${NAMESPACE}/${data.function}/say/${name}.mcfunction`,
          ),
        ].sort(),
      );
      const axe = JSON.parse(
        utf8.decode(
          sink.files().get(`data/minecraft/${data.tags}/block/mineable/axe.json`) as Uint8Array,
        ),
      ) as { values: Json[] };
      expect(axe.values).toEqual(
        ['crate', 'keep_crate', 'small_crate'].map((name) => ({ id: ns(name), required: false })),
      );
      // Every machine recipe and every block loot table is left out (one warning per file
      // without an element lookup); the loot crate's function is kept with a warning.
      const flagged = (code: string): string[] =>
        report.problems
          .filter((problem) => problem.code === code)
          .map((problem) => problem.file ?? '')
          .sort();
      expect(flagged(MOD_ONLY_REFERENCE)).toEqual(
        [
          ...GRINDER_RECIPE_NAMES.map(
            (name) => `data/${NAMESPACE}/${data.recipe}/grinder/${name}.json`,
          ),
          ...BLOCK_NAMES.map((name) => `data/${NAMESPACE}/${data.loot_table}/blocks/${name}.json`),
        ].sort(),
      );
      expect(flagged(MOD_ONLY_FUNCTION)).toEqual([
        `data/${NAMESPACE}/${data.function}/place_loot_crate.mcfunction`,
      ]);
    });

    describe('content jar', () => {
      const hashFile = join(fixturesRoot, target.id, 'sample-machines-jar.sha256');
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
            hashes.push(sha256((await exportJar()).jar));
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
    const outDir = process.env.MSM_SAMPLE_MACHINES_OUT;
    it.runIf(runtimeJarPath !== undefined && outDir !== undefined && bundle === selectedTarget())(
      'writes the jar with the real runtime for the headless server check',
      async () => {
        const fabric = target.fabric;
        if (fabric === undefined) throw new Error(`${target.id} has no Fabric facts`);
        const runtimeJar = new Uint8Array(await readFile(runtimeJarPath as string));
        const runtimeVersion = jarModVersion(runtimeJar);
        const { jar } = await exportJar({
          loadRuntimeJar: async () => runtimeJar,
          runtimeVersion,
        });
        await mkdir(outDir as string, { recursive: true });
        await writeFile(join(outDir as string, `${NAMESPACE}.jar`), jar);
        const facts = {
          expectBlocks: EXPECTED_BLOCKS,
          expectItems: EXPECTED_ITEMS,
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
