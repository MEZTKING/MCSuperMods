/**
 * Golden over the committed portals project (`fixtures/sample-portals`, ADRs 0077 and 0078 D6,
 * plan B341): namespace `msm_sample_portals`, an `msm:mod`, a project dimension and three
 * portal blocks that differ in every way a parity test can see:
 *
 * - `sky_realm`: a flat dimension (the overworld's dimension type; bedrock, dirt and grass,
 *   plains everywhere, no features), so arrivals land on known ground.
 * - `sky_portal`: frame of the project block `sky_stone`, lit with flint and steel (the
 *   default igniter), to `sky_realm` and back to the overworld at `travel.scale` 1 (one block is
 *   one block); its own surface picture; `on_travel` runs `say/sky_portal_travelled` as the
 *   traveller, which says one line.
 * - `ember_portal`: frame of the block tag `#msm_sample_portals:ember_frame` (gold, copper and
 *   waxed copper blocks) with `frame_block` gold (the exits it builds), lit with the project key
 *   `ember_key` (an `msm:item` with 64 uses), to `minecraft:the_nether` with no `travel.scale`
 *   (the dimension types: 8 to 1), dust particles in amber and the project sound event
 *   `ember.hum` as its ambient sound; its own surface picture.
 * - `drift_portal`: frame of crying obsidian, `igniter: false` (only the action lights it), to
 *   `sky_realm` with `arrival: surface` (lands on the ground, builds no exit), `players_only`
 *   and `overlay: false` (no wobble, overlay or entry whoosh); the default surface picture.
 * - `drift_beacon`: a block whose `msm:on_interact` runs `light_portal` for `drift_portal` and
 *   then `say/drift_beacon_used`.
 *
 * Textures are the library's placeholder pictures (`placeholderPng`, the `portal` and
 * `portal_frame` patterns the Portal flow draws).
 *
 * - The fixture equals the project built from {@link SAMPLE_ELEMENTS} and {@link SAMPLE_ASSETS}
 *   now; `UPDATE_GOLDENS=1` rewrites it (the README is hand-written).
 * - Every element validates with zero problems, the plugins' project validators report nothing
 *   on every target, and the functions pass the offline mcfunction checker.
 * - The content jar exports with zero errors and warnings, holds the definitions (valid), the
 *   portal block states and `_ns`/`_ew` models, the `#minecraft:portals` tag, the dimension and
 *   the frame tag, no item model for a portal, and its SHA-256 is pinned per target in two time
 *   zones (`test/fixtures/<target id>/sample-portals-jar.sha256`).
 * - The vanilla data pack (vanilla pack safety, ADR 0066) keeps the dimension, the frame tag and
 *   the functions, makes the three `#minecraft:portals` entries optional and leaves out the
 *   project blocks' loot tables with `export.mod-only-reference`.
 * - With `MSM_RUNTIME_JAR` (a built `msm_runtime` jar for the selected target) and
 *   `MSM_SAMPLE_PORTALS_OUT` (a folder), the jar is also exported with the real runtime nested
 *   and written to that folder as `msm_sample_portals.jar`, next to `fabric-facts.json` for
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
import worldgenPlugin from '@msm/plugin-worldgen';
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
const sampleRoot = join(here, '..', '..', '..', 'fixtures', 'sample-portals');
const NAMESPACE = 'msm_sample_portals';
const PROJECT_NAME = 'MSM Sample Portals';
const NOW = '2026-11-14T00:00:00.000Z';
/** Files of the fixture that the test does not generate. */
const HAND_WRITTEN = new Set(['README.md']);

/** Two zones on opposite sides of the date line, so a local-time leak changes the bytes. */
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;

/** The plugins the sample needs, in the app's registration order (`msm:mod` is blocks-items'). */
const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  worldgenPlugin,
  blocksItemsPlugin,
];
const VALIDATORS = PLUGINS.flatMap((plugin) => plugin.contributes.validators ?? []);

const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);

const meta = {
  msmVersion: '1.4.0',
  plugins: ['msm.blocks-items', 'msm.datapack', 'msm.worldgen'],
};
const stubRuntimeJar = utf8.encode('PK stub msm_runtime jar for the sample-portals golden');

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
  sky_portal_travelled: 'I came through the Sky Portal.',
  drift_beacon_used: 'The drift beacon is used.',
} as const;
type SayName = keyof typeof SAY_LINES;
const sayFunction = (name: SayName): string => ns(`say/${name}`);
const runSay = (name: SayName): Json => ({ type: 'run_function', function: sayFunction(name) });

const COLOURS = {
  sky: LIBRARY_COLOURS.sapphire,
  ember: LIBRARY_COLOURS.amber,
  drift: LIBRARY_COLOURS.violet,
} as const satisfies Record<string, Rgb>;

/** An RGB colour as the integer `particles.color` takes. */
const colourInt = ([r, g, b]: Rgb): number => (r << 16) | (g << 8) | b;

const texture = (path: string, pattern: Pattern, colour: Rgb): SampleAsset => ({
  path: `textures/${path}.png`,
  bytes: placeholderPng(pattern, { colour }),
});

const SKY_REALM = ns('sky_realm');
const SKY_STONE = ns('sky_stone');
const SKY_PORTAL = ns('sky_portal');
const EMBER_FRAME = ns('ember_frame');
const EMBER_KEY = ns('ember_key');
const EMBER_PORTAL = ns('ember_portal');
const EMBER_HUM = ns('ember.hum');
const DRIFT_PORTAL = ns('drift_portal');
const DRIFT_BEACON = ns('drift_beacon');
const SKY_TRAVELLED = ns('sky_portal_travelled');
const BEACON_USED = ns('drift_beacon_used');
const NETHER = 'minecraft:the_nether';

const SKY_STONE_MODEL = ns('block/sky_stone');
const DRIFT_BEACON_MODEL = ns('block/drift_beacon');
const EMBER_KEY_MODEL = ns('item/ember_key');

/** The blocks of the ember frame tag (copper only while it is unweathered, or waxed). */
const EMBER_FRAME_BLOCKS = [
  'minecraft:gold_block',
  'minecraft:copper_block',
  'minecraft:waxed_copper_block',
] as const;

const PORTALS: readonly SampleElement[] = [
  {
    id: SKY_PORTAL,
    kind: 'msm:block',
    data: {
      format: 1,
      type: 'portal',
      display_name: 'Sky Portal',
      frame: SKY_STONE,
      destination: SKY_REALM,
      travel: { scale: 1 },
      textures: { portal: ns('block/sky_portal') },
      on_travel: SKY_TRAVELLED,
      events: { [SKY_TRAVELLED]: { actions: [runSay('sky_portal_travelled')] } },
    },
  },
  {
    id: EMBER_PORTAL,
    kind: 'msm:block',
    data: {
      format: 1,
      type: 'portal',
      display_name: 'Ember Portal',
      frame: `#${EMBER_FRAME}`,
      frame_block: 'minecraft:gold_block',
      igniter: EMBER_KEY,
      destination: NETHER,
      sounds: { ambient: EMBER_HUM },
      particles: { type: 'minecraft:dust', color: colourInt(COLOURS.ember), count: 6 },
      textures: { portal: ns('block/ember_portal') },
    },
  },
  {
    id: DRIFT_PORTAL,
    kind: 'msm:block',
    data: {
      format: 1,
      type: 'portal',
      display_name: 'Drift Portal',
      frame: 'minecraft:crying_obsidian',
      igniter: false,
      destination: SKY_REALM,
      travel: { arrival: 'surface', players_only: true, overlay: false },
    },
  },
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
        'Sample portals: a sky portal to a flat sky realm, an ember portal to the Nether lit with a key, and a drift portal lit by a beacon block.',
      authors: ['MCSuperMods'],
      licence: 'MIT',
    },
  },
  {
    id: SKY_REALM,
    kind: 'minecraft:dimension',
    data: {
      type: 'minecraft:overworld',
      generator: {
        type: 'minecraft:flat',
        settings: {
          biome: 'minecraft:plains',
          layers: [
            { block: 'minecraft:bedrock', height: 1 },
            { block: 'minecraft:dirt', height: 3 },
            { block: 'minecraft:grass_block', height: 1 },
          ],
          features: false,
          lakes: false,
          structure_overrides: [],
        },
      },
    },
  },
  {
    id: SKY_STONE,
    kind: 'msm:block',
    data: {
      format: 1,
      display_name: 'Sky Stone',
      model: SKY_STONE_MODEL,
      sound_type: 'stone',
      loot: 'self',
      item: { creative_tab: 'minecraft:building_blocks' },
      components: {
        'msm:breakable': { hardness: 5, resistance: 6, tool: 'pickaxe' },
        'msm:light_emitter': { level: 5 },
      },
    },
  },
  {
    id: SKY_STONE_MODEL,
    kind: 'minecraft:model',
    data: { parent: 'minecraft:block/cube_all', textures: { all: SKY_STONE_MODEL } },
  },
  {
    id: EMBER_FRAME,
    kind: 'minecraft:tag/block',
    data: { replace: false, values: [...EMBER_FRAME_BLOCKS] },
  },
  {
    id: EMBER_KEY,
    kind: 'msm:item',
    data: {
      format: 1,
      display_name: 'Ember Key',
      model: EMBER_KEY_MODEL,
      rarity: 'rare',
      creative_tab: 'minecraft:tools_and_utilities',
      components: { 'msm:durability': { max: 64 } },
    },
  },
  {
    id: EMBER_KEY_MODEL,
    kind: 'minecraft:model',
    data: { parent: 'minecraft:item/generated', textures: { layer0: EMBER_KEY_MODEL } },
  },
  {
    id: DRIFT_BEACON,
    kind: 'msm:block',
    data: {
      format: 1,
      display_name: 'Drift Beacon',
      model: DRIFT_BEACON_MODEL,
      sound_type: 'metal',
      loot: 'self',
      item: { creative_tab: 'minecraft:functional_blocks' },
      components: {
        'msm:breakable': { hardness: 3.5, resistance: 3.5, tool: 'pickaxe' },
        'msm:on_interact': { event: BEACON_USED },
      },
      events: {
        [BEACON_USED]: {
          actions: [{ type: 'light_portal', portal: DRIFT_PORTAL }, runSay('drift_beacon_used')],
        },
      },
    },
  },
  {
    id: DRIFT_BEACON_MODEL,
    kind: 'minecraft:model',
    data: { parent: 'minecraft:block/cube_all', textures: { all: DRIFT_BEACON_MODEL } },
  },
  ...PORTALS,
  {
    // A project sound event (ADR 0057): the runtime registers the key, so the ember portal's
    // definition names it as a plain id. It plays a vanilla sound file of the player's game.
    id: ns('sounds'),
    kind: 'minecraft:sounds',
    data: { 'ember.hum': { sounds: ['minecraft:block/beacon/ambient'] } },
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
  texture('block/sky_stone', 'portal_frame', COLOURS.sky),
  texture('block/sky_portal', 'portal', COLOURS.sky),
  texture('block/ember_portal', 'portal', COLOURS.ember),
  texture('item/ember_key', 'gem', COLOURS.ember),
  texture('block/drift_beacon', 'polished_stone', COLOURS.drift),
];

const isBlock = (entry: SampleElement): boolean => entry.kind === 'msm:block';
const nameOf = (id: string): string => id.split(':')[1] as string;
const BLOCK_NAMES = SAMPLE_ELEMENTS.filter(isBlock).map((entry) => nameOf(entry.id));
const PORTAL_NAMES = PORTALS.map((entry) => nameOf(entry.id));
/** The blocks with an item: every block but the portals. */
const BLOCK_ITEM_NAMES = BLOCK_NAMES.filter((name) => !PORTAL_NAMES.includes(name));

/** What the runtime registers: five blocks, and the two block items plus the key. */
const EXPECTED_BLOCKS = BLOCK_NAMES.length;
const EXPECTED_ITEMS = BLOCK_ITEM_NAMES.length + 1;

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
 * registry (`tag/block` and `dimension` from the kind id), each block's item and generated
 * models, the event keys of `sounds.json` as `sound_event` ids (ADR 0057 D3; the sample names
 * its key only in an `msm:` element) and the textures of the namespace's PNG assets.
 */
function projectIds(project: Project): Record<string, string[]> {
  const ids: Record<string, string[]> = {};
  const add = (name: string, id: string): void => {
    ids[name] = [...(ids[name] ?? []), id];
  };
  for (const element of elementsOf(project)) {
    if (element.kind === 'minecraft:sounds') {
      for (const key of Object.keys(element.data as object))
        add('sound_event', `${NAMESPACE}:${key}`);
    }
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

const dataOf = (project: Project, id: string): JsonRecord =>
  elementsOf(project).find((element) => element.id === id)?.data as JsonRecord;

// Tests -------------------------------------------------------------------------------------

describe('sample portals project', () => {
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

  it('loads with zero problems and has the three portals ADR 0078 D6 names', async () => {
    const project = await loadSample();
    expect(project.name).toBe(PROJECT_NAME);
    const portals = elementsOf(project)
      .filter((element) => (element.data as JsonRecord).type === 'portal')
      .map((element) => element.id)
      .sort();
    expect(portals).toEqual([DRIFT_PORTAL, EMBER_PORTAL, SKY_PORTAL]);
    expect(dataOf(project, SKY_PORTAL)).toMatchObject({
      frame: SKY_STONE,
      destination: SKY_REALM,
      travel: { scale: 1 },
      on_travel: SKY_TRAVELLED,
    });
    expect(dataOf(project, SKY_PORTAL).igniter).toBeUndefined();
    expect(dataOf(project, EMBER_PORTAL)).toMatchObject({
      frame: `#${EMBER_FRAME}`,
      frame_block: 'minecraft:gold_block',
      igniter: EMBER_KEY,
      destination: NETHER,
      sounds: { ambient: EMBER_HUM },
      particles: { type: 'minecraft:dust' },
    });
    expect(dataOf(project, EMBER_PORTAL).travel).toBeUndefined();
    expect(dataOf(project, DRIFT_PORTAL)).toMatchObject({
      frame: 'minecraft:crying_obsidian',
      igniter: false,
      destination: SKY_REALM,
      travel: { arrival: 'surface', players_only: true, overlay: false },
    });
    expect(dataOf(project, EMBER_FRAME).values).toEqual([...EMBER_FRAME_BLOCKS]);
    expect(
      JSON.stringify((dataOf(project, DRIFT_BEACON).events as JsonRecord)[BEACON_USED]),
    ).toContain(`"portal":"${DRIFT_PORTAL}"`);
    // The frame block is never part of the dimension (ADR 0066's dimension row).
    expect(JSON.stringify(dataOf(project, SKY_REALM))).not.toContain(SKY_STONE);
    for (const [name, line] of Object.entries(SAY_LINES)) {
      const fn = dataOf(project, ns(`say/${name}`)) as { lines?: string[] } | undefined;
      expect(fn?.lines, name).toEqual([`say ${line}`]);
    }
    const kinds = new Set(elementsOf(project).map((element) => element.kind));
    expect([...kinds].sort()).toEqual([
      'minecraft:dimension',
      'minecraft:function',
      'minecraft:model',
      'minecraft:sounds',
      'minecraft:tag/block',
      'msm:block',
      'msm:item',
      'msm:mod',
    ]);
    expect(project.namespaces[0]?.assets.map((asset) => asset.path).sort()).toEqual(
      SAMPLE_ASSETS.map((asset) => asset.path).sort(),
    );
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sample portals export (%s)',
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

    it('holds the definitions, portal states and models, tags and the dimension, all valid', async () => {
      const { jar } = await exportJar();
      const files = unzipSync(jar);
      const paths = Object.keys(files).sort();
      const resource = target.folders.resource;
      const data = target.folders.data;
      const blockDefinitions = BLOCK_NAMES.map((name) => `msm/${NAMESPACE}/block/${name}.json`);
      const itemDefinition = `msm/${NAMESPACE}/item/ember_key.json`;
      expect(paths.filter((path) => path.startsWith('msm/'))).toEqual(
        [...blockDefinitions, itemDefinition].sort(),
      );
      for (const path of [
        'fabric.mod.json',
        'msm.export.json',
        `assets/${NAMESPACE}/${resource.lang}/en_us.json`,
        `assets/${NAMESPACE}/sounds.json`,
        `data/${NAMESPACE}/${data.dimension}/sky_realm.json`,
        `data/${NAMESPACE}/${data.tags}/block/ember_frame.json`,
        `data/minecraft/${data.tags}/block/portals.json`,
        ...BLOCK_NAMES.map((name) => `assets/${NAMESPACE}/blockstates/${name}.json`),
        ...PORTAL_NAMES.flatMap((name) => [
          `assets/${NAMESPACE}/models/block/${name}_ns.json`,
          `assets/${NAMESPACE}/models/block/${name}_ew.json`,
        ]),
        ...BLOCK_ITEM_NAMES.map(
          (name) => `data/${NAMESPACE}/${data.loot_table}/blocks/${name}.json`,
        ),
        ...Object.keys(SAY_LINES).map(
          (name) => `data/${NAMESPACE}/${data.function}/say/${name}.mcfunction`,
        ),
      ]) {
        expect(paths, path).toContain(path);
      }
      expect(paths).not.toContain('pack.mcmeta');
      // A portal has no item, no item model and no loot table (ADR 0077 D1).
      for (const name of PORTAL_NAMES) {
        expect(paths.filter((path) => path.endsWith(`/${name}.json`)).sort(), name).toEqual([
          `assets/${NAMESPACE}/blockstates/${name}.json`,
          `msm/${NAMESPACE}/block/${name}.json`,
        ]);
      }

      const json = (path: string): Json => JSON.parse(utf8.decode(files[path] as Uint8Array));
      const problems: string[] = [];
      for (const path of blockDefinitions) {
        for (const problem of validateJson(
          json(path),
          context.schemaIndex.resolveSchemaRef(MSM_SCHEMA_REFS.blockDefinition),
          { registries: context.registries },
        )) {
          problems.push(`${path} ${problem.path} ${problem.code}: ${problem.message}`);
        }
      }
      expect(problems).toEqual([]);
      // The definition keeps the portal's fields as written and drops its textures.
      const ember = json(`msm/${NAMESPACE}/block/ember_portal.json`) as JsonRecord;
      expect(ember).toMatchObject({
        type: 'portal',
        frame: `#${EMBER_FRAME}`,
        igniter: EMBER_KEY,
        destination: NETHER,
      });
      expect(ember.textures).toBeUndefined();
      const drift = json(`msm/${NAMESPACE}/block/drift_portal.json`) as JsonRecord;
      expect(drift.travel).toEqual({ arrival: 'surface', players_only: true, overlay: false });

      // The portal block states: the x axis is the north-south model, z the east-west one.
      const states = json(`assets/${NAMESPACE}/blockstates/sky_portal.json`);
      expect(JSON.stringify(states)).toContain(`${NAMESPACE}:block/sky_portal_ns`);
      expect(JSON.stringify(states)).toContain(`${NAMESPACE}:block/sky_portal_ew`);
      expect(json(`assets/${NAMESPACE}/models/block/drift_portal_ns.json`)).toMatchObject({
        parent: 'minecraft:block/nether_portal_ns',
        textures: { portal: 'minecraft:block/nether_portal' },
      });
      expect(json(`assets/${NAMESPACE}/models/block/ember_portal_ew.json`)).toMatchObject({
        textures: { portal: `${NAMESPACE}:block/ember_portal` },
      });

      expect(json(`data/minecraft/${data.tags}/block/portals.json`)).toEqual({
        values: [DRIFT_PORTAL, EMBER_PORTAL, SKY_PORTAL],
      });
      expect(json(`data/${NAMESPACE}/${data.tags}/block/ember_frame.json`)).toEqual({
        replace: false,
        values: [...EMBER_FRAME_BLOCKS],
      });
      expect(json(`assets/${NAMESPACE}/sounds.json`)).toEqual({
        'ember.hum': { sounds: ['minecraft:block/beacon/ambient'] },
      });

      const lang = json(`assets/${NAMESPACE}/${resource.lang}/en_us.json`) as JsonRecord;
      for (const name of BLOCK_NAMES) {
        expect(lang[`block.${NAMESPACE}.${name}`], name).toBeDefined();
      }
      expect(lang[`item.${NAMESPACE}.ember_key`]).toBe('Ember Key');

      const modJson = json('fabric.mod.json') as {
        id: string;
        depends: Record<string, string>;
      };
      expect(modJson.id).toBe(NAMESPACE);
      expect(modJson.depends.msm_runtime).toBe(`>=${meta.msmVersion}`);
      const runtimePath = nestedRuntimePath(meta.msmVersion);
      expect(files[runtimePath]).toEqual(stubRuntimeJar);
      expect(paths.filter((path) => path.startsWith('META-INF/jars/'))).toEqual([runtimePath]);
    });

    it('keeps the dimension and the functions in the vanilla data pack, portals optional', async () => {
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
          // The vanilla tags, with the mod's blocks as optional entries.
          `data/minecraft/${data.tags}/block/mineable/pickaxe.json`,
          `data/minecraft/${data.tags}/block/portals.json`,
          `data/${NAMESPACE}/${data.dimension}/sky_realm.json`,
          `data/${NAMESPACE}/${data.tags}/block/ember_frame.json`,
          ...Object.keys(SAY_LINES).map(
            (name) => `data/${NAMESPACE}/${data.function}/say/${name}.mcfunction`,
          ),
        ].sort(),
      );
      const json = (path: string): Json =>
        JSON.parse(utf8.decode(sink.files().get(path) as Uint8Array));
      expect(json(`data/minecraft/${data.tags}/block/portals.json`)).toEqual({
        values: [DRIFT_PORTAL, EMBER_PORTAL, SKY_PORTAL].map((id) => ({ id, required: false })),
      });
      expect(json(`data/${NAMESPACE}/${data.dimension}/sky_realm.json`)).toEqual(
        dataOf(project, SKY_REALM),
      );
      // The two project blocks with an item drop themselves: their loot tables are left out.
      const flagged = (code: string): string[] =>
        report.problems
          .filter((problem) => problem.code === code)
          .map((problem) => problem.file ?? '')
          .sort();
      expect(flagged(MOD_ONLY_REFERENCE)).toEqual(
        BLOCK_ITEM_NAMES.map(
          (name) => `data/${NAMESPACE}/${data.loot_table}/blocks/${name}.json`,
        ).sort(),
      );
      expect(flagged(MOD_ONLY_FUNCTION)).toEqual([]);
    });

    describe('content jar', () => {
      const hashFile = join(fixturesRoot, target.id, 'sample-portals-jar.sha256');
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
    const outDir = process.env.MSM_SAMPLE_PORTALS_OUT;
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
