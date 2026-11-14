/**
 * Golden over the committed creatures project (`fixtures/sample-creatures`, ADRs 0070–0073,
 * plan B302): an `msm:mod` and six `msm:entity` elements, one per mob feature of the mob
 * expansion, each drawn with a preset model of `@msm/plugin-library` (`MOB_PRESETS`,
 * `presetSkinPng`), namespace `msm_sample_creatures`:
 *
 * - `pet`: base `animal`, quadruped; `msm:tameable` (a bone always tames, `chance` 1),
 *   `msm:breedable` and `msm:variants` by biome.
 * - `mount`: base `animal`, quadruped; `msm:rideable` with a saddle, a jump and the
 *   `saddle` bone.
 * - `glider`: base `mob`, flyer; movement `fly` and `msm:ranged_attack` with the project's own
 *   throwable item `spark` (`msm:throwable`, whose hit runs a function).
 * - `fish`: base `mob`, fish; movement `swim`, category `water_ambient`, random variants.
 * - `archer`: base `monster`, biped; arrows from the `ranged_attack` goal with `strafe`.
 * - `boss`: base `monster`, biped, `renderer: vanilla` (the others are `auto`);
 *   `msm:boss_bar` (`notched_10`), melee and ranged attacks.
 *
 * Every `on_*` event (`on_tame`, `on_breed`, `on_mount`, `on_shoot`, `on_death`, the spark's
 * `on_hit_entity`) runs a function under `say/` that says one fixed line, for the parity tests
 * (B306) to observe. Each mob has a loot table and a spawn egg with its own texture.
 *
 * - The fixture equals the project built from {@link SAMPLE_ELEMENTS} and
 *   {@link SAMPLE_ASSETS} now; `UPDATE_GOLDENS=1` rewrites it (the README is hand-written).
 * - Every element validates with zero problems, the plugins' project validators report
 *   nothing on every target, and the functions pass the offline mcfunction checker.
 * - The content jar exports with zero errors and warnings and its SHA-256 is pinned per target
 *   in two time zones (`test/fixtures/<target id>/sample-creatures-jar.sha256`): on a target with
 *   GeckoLib with stub runtime and GeckoLib jars nested, on one without GeckoLib without it (the five `auto` mobs drawn
 *   by the runtime's vanilla renderer, one `export.entity-vanilla-renderer` info each).
 * - With `MSM_RUNTIME_JAR` (a built `msm_runtime` jar for the selected target) and
 *   `MSM_SAMPLE_CREATURES_OUT` (a folder), plus `MSM_GECKOLIB_JAR` on a target with GeckoLib,
 *   the jar is also exported with the real jars nested and written to that folder as
 *   `msm_sample_creatures.jar`, next to `fabric-facts.json` for `tools/run-fabric-server`.
 *   Without them that test is skipped.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
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
import type {
  Element,
  GeckolibFacts,
  Json,
  Plugin,
  Problem,
  Project,
  Target,
} from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import entitiesPlugin from '@msm/plugin-entities';
import {
  MOB_PRESETS,
  placeholderPng,
  presetAnimationFields,
  presetSkinPng,
  type Rgb,
} from '@msm/plugin-library';
import modelsAnimPlugin from '@msm/plugin-models-anim';
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
import { nestedGeckolibPath } from '../src/fabric-content-jar/index';
import {
  createFabricContentJarExporter,
  createZipSink,
  type FabricContentJarOptions,
  nestedRuntimePath,
  runExport,
} from '../src/index';
import { defaultTarget, selectedTarget } from './selected-target';

const update = process.env.UPDATE_GOLDENS === '1';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, 'fixtures');
const sampleRoot = join(here, '..', '..', '..', 'fixtures', 'sample-creatures');
const NAMESPACE = 'msm_sample_creatures';
const PROJECT_NAME = 'MSM Sample Creatures';
const NOW = '2026-11-14T00:00:00.000Z';
/** Files of the fixture that the test does not generate. */
const HAND_WRITTEN = new Set(['README.md']);

/** Two zones on opposite sides of the date line, so a local-time leak changes the bytes. */
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;

/** The plugins the sample needs, in the app's registration order (`msm:mod` is blocks-items'). */
const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  blocksItemsPlugin,
  entitiesPlugin,
  modelsAnimPlugin,
];
const VALIDATORS = PLUGINS.flatMap((plugin) => plugin.contributes.validators ?? []);

const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);

const meta = {
  msmVersion: '1.4.0',
  plugins: ['msm.blocks-items', 'msm.datapack', 'msm.entities', 'msm.models-anim'],
};
const stubRuntimeJar = utf8.encode('PK stub msm_runtime jar for the sample-creatures golden');
const stubGeckolibJar = utf8.encode('PK stub GeckoLib jar for the sample-creatures golden');

// The project -----------------------------------------------------------------------------

interface SampleElement {
  id: string;
  kind: string;
  data: Json;
}

interface SampleAsset {
  /** Path under the namespace's assets, such as `textures/entity/x.png`. */
  path: string;
  bytes: Uint8Array;
}

type JsonRecord = { [key: string]: Json };
type PresetName = keyof typeof MOB_PRESETS;

const ns = (path: string): string => `${NAMESPACE}:${path}`;

/** The function an event runs: `say/<name>`, which says {@link SAY_LINES}`[name]`. */
const SAY_LINES = {
  tamed: 'The pet is tamed.',
  bred: 'A pet baby is born.',
  mounted: 'The mount is ridden.',
  glider_shot: 'The glider throws a spark.',
  spark_hit: 'The spark hits.',
  archer_shot: 'The archer shoots.',
  boss_shot: 'The boss throws a snowball.',
  boss_defeated: 'The boss is defeated.',
} as const;
type SayName = keyof typeof SAY_LINES;

const sayFunction = (name: SayName): string => ns(`say/${name}`);
/** An event that runs the `say/<name>` function. */
const sayEvent = (name: SayName): Json => ({
  actions: [{ type: 'run_function', function: sayFunction(name) }],
});

/** The parts every mob shares: its preset model, skin, egg, loot table and the common fields. */
interface MobInput {
  name: string;
  preset: PresetName;
  colour: Rgb;
  display: string;
  base?: 'mob' | 'animal' | 'monster';
  category: string;
  size: { width: number; height: number };
  scale?: number;
  renderer?: 'auto' | 'vanilla';
  /** The loot table's one item. */
  drop: string;
  spawn?: JsonRecord;
  components: JsonRecord;
  events?: Partial<Record<string, SayName>>;
}

const COLOURS = {
  pet: [214, 120, 52],
  petSnow: [236, 236, 244],
  mount: [176, 140, 92],
  glider: [120, 200, 236],
  spark: [255, 214, 72],
  fishBlue: [64, 120, 220],
  fishOrange: [240, 140, 40],
  archer: [150, 170, 190],
  boss: [120, 40, 140],
} as const satisfies Record<string, Rgb>;

function mob(input: MobInput): { elements: SampleElement[]; assets: SampleAsset[] } {
  const { name } = input;
  const model = ns(`entity/${name}`);
  const animations = ns(`entity/${name}_animations`);
  const loot = ns(`entities/${name}`);
  const events: JsonRecord = {};
  for (const [event, say] of Object.entries(input.events ?? {})) {
    events[ns(event)] = sayEvent(say as SayName);
  }
  const entity: JsonRecord = {
    format: 1,
    display_name: input.display,
    ...(input.base === undefined ? {} : { base: input.base }),
    category: input.category,
    size: input.size,
    loot_table: loot,
    ...(input.spawn === undefined ? {} : { spawn: input.spawn }),
    spawn_egg: {
      texture: ns(`item/${name}_spawn_egg`),
      display_name: `${input.display} Spawn Egg`,
    },
    components: {
      ...input.components,
      'msm:animated_model': {
        model,
        animations,
        texture: ns(`entity/${name}`),
        ...(input.scale === undefined ? {} : { scale: input.scale }),
        renderer: input.renderer ?? 'auto',
        ...presetAnimationFields(input.preset),
      },
    },
    ...(Object.keys(events).length === 0 ? {} : { events }),
  };
  const preset = MOB_PRESETS[input.preset];
  return {
    elements: [
      { id: ns(name), kind: 'msm:entity', data: entity },
      { id: model, kind: 'msm:geo_model', data: preset.geometry(name) },
      { id: animations, kind: 'msm:animation', data: preset.animations() },
      {
        id: loot,
        kind: 'minecraft:loot_table',
        data: {
          type: 'minecraft:entity',
          pools: [
            {
              rolls: 1,
              bonus_rolls: 0,
              entries: [{ type: 'minecraft:item', name: input.drop }],
            },
          ],
          random_sequence: loot,
        },
      },
    ],
    assets: [
      {
        path: `textures/entity/${name}.png`,
        bytes: presetSkinPng(input.preset, { colour: input.colour }),
      },
      {
        path: `textures/item/${name}_spawn_egg.png`,
        bytes: placeholderPng('egg', { colour: input.colour }),
      },
    ],
  };
}

const LOOK_GOALS: Json[] = [{ type: 'look_at_player', distance: 8 }, { type: 'look_around' }];

const MOBS = [
  mob({
    name: 'pet',
    preset: 'quadruped',
    colour: COLOURS.pet,
    display: 'Sample Pet',
    base: 'animal',
    category: 'creature',
    size: { width: 0.6, height: 0.85 },
    scale: 0.8,
    drop: 'minecraft:bone',
    spawn: {
      biomes: ['#minecraft:is_forest', 'minecraft:snowy_taiga'],
      weight: 5,
      min_group: 1,
      max_group: 3,
      rule: 'animal',
    },
    components: {
      'msm:health': { max: 10 },
      'msm:movement': { speed: 0.3 },
      'msm:attack': { damage: 3 },
      'msm:ai_goals': {
        goals: [
          { type: 'leap_at_target', height: 0.4 },
          { type: 'melee_attack', speed: 1.2, retaliate: true },
          { type: 'wander', speed: 1 },
          ...LOOK_GOALS,
        ],
      },
      // Taming and breeding foods are kept apart: breeding runs before taming (plan, B299).
      'msm:tameable': {
        items: ['minecraft:bone'],
        chance: 1,
        tamed_health: 20,
        on_tame: ns('tamed'),
      },
      'msm:breedable': {
        items: ['minecraft:cooked_beef'],
        baby_scale: 0.5,
        on_breed: ns('bred'),
      },
      'msm:variants': {
        choose: 'biome',
        variants: [
          { id: 'default', texture: ns('entity/pet') },
          {
            id: 'snow',
            texture: ns('entity/pet_snow'),
            biomes: ['minecraft:snowy_taiga', 'minecraft:snowy_plains'],
          },
        ],
      },
    },
    events: { tamed: 'tamed', bred: 'bred' },
  }),
  mob({
    name: 'mount',
    preset: 'quadruped',
    colour: COLOURS.mount,
    display: 'Sample Mount',
    base: 'animal',
    category: 'creature',
    size: { width: 1.3, height: 1.5 },
    scale: 1.4,
    drop: 'minecraft:leather',
    spawn: {
      biomes: ['minecraft:plains', 'minecraft:meadow'],
      weight: 4,
      min_group: 1,
      max_group: 2,
      rule: 'animal',
    },
    components: {
      'msm:health': { max: 24 },
      'msm:movement': { speed: 0.25, step_height: 1 },
      'msm:ai_goals': {
        goals: [{ type: 'panic', speed: 1.2 }, { type: 'wander', speed: 0.7 }, ...LOOK_GOALS],
      },
      'msm:rideable': {
        saddle: true,
        jump: 0.7,
        saddle_bone: 'saddle',
        on_mount: ns('mounted'),
      },
    },
    events: { mounted: 'mounted' },
  }),
  mob({
    name: 'glider',
    preset: 'flyer',
    colour: COLOURS.glider,
    display: 'Sample Glider',
    category: 'creature',
    size: { width: 0.8, height: 0.8 },
    drop: 'minecraft:feather',
    components: {
      'msm:health': { max: 12 },
      'msm:movement': { mode: 'fly', speed: 0.3, flying_speed: 0.6, hovers: true },
      'msm:ranged_attack': {
        projectile: ns('spark'),
        interval_ticks: 40,
        charge_ticks: 10,
        range: 12,
        on_shoot: ns('shot'),
      },
      'msm:ai_goals': {
        goals: [
          { type: 'ranged_attack', targets: ['minecraft:zombie'], retaliate: true },
          { type: 'wander', speed: 1 },
          ...LOOK_GOALS,
        ],
      },
    },
    events: { shot: 'glider_shot' },
  }),
  mob({
    name: 'fish',
    preset: 'fish',
    colour: COLOURS.fishBlue,
    display: 'Sample Fish',
    category: 'water_ambient',
    size: { width: 0.5, height: 0.4 },
    drop: 'minecraft:cod',
    spawn: {
      biomes: ['#minecraft:is_ocean'],
      weight: 8,
      min_group: 2,
      max_group: 4,
      placement: 'in_water',
      rule: 'water_animal',
    },
    components: {
      'msm:health': { max: 3 },
      'msm:movement': { mode: 'swim', speed: 1, dry_out_ticks: 300 },
      'msm:ai_goals': {
        goals: [
          {
            type: 'flee',
            from: ['minecraft:player'],
            distance: 8,
            speed: 1.6,
            sprint_speed: 1.4,
          },
          { type: 'wander', speed: 1 },
        ],
      },
      'msm:variants': {
        choose: 'random',
        variants: [
          { id: 'blue', texture: ns('entity/fish'), weight: 2 },
          { id: 'orange', texture: ns('entity/fish_orange') },
        ],
      },
    },
  }),
  mob({
    name: 'archer',
    preset: 'biped',
    colour: COLOURS.archer,
    display: 'Sample Archer',
    base: 'monster',
    category: 'monster',
    size: { width: 0.6, height: 1.95 },
    drop: 'minecraft:arrow',
    spawn: {
      biomes: ['minecraft:plains'],
      weight: 5,
      min_group: 1,
      max_group: 2,
      rule: 'monster',
    },
    components: {
      'msm:health': { max: 20 },
      'msm:movement': { speed: 0.25, follow_range: 16 },
      'msm:ranged_attack': {
        projectile: 'minecraft:arrow',
        damage: 2,
        interval_ticks: 30,
        charge_ticks: 20,
        range: 15,
        on_shoot: ns('shot'),
      },
      'msm:ai_goals': {
        goals: [
          {
            type: 'ranged_attack',
            strafe: true,
            targets: ['minecraft:player'],
            retaliate: true,
          },
          { type: 'wander', speed: 1 },
          ...LOOK_GOALS,
        ],
      },
    },
    events: { shot: 'archer_shot' },
  }),
  mob({
    name: 'boss',
    preset: 'biped',
    colour: COLOURS.boss,
    display: 'Sample Boss',
    base: 'monster',
    category: 'monster',
    size: { width: 0.9, height: 2.95 },
    scale: 1.5,
    renderer: 'vanilla',
    drop: 'minecraft:nether_star',
    components: {
      'msm:health': { max: 200 },
      'msm:movement': { speed: 0.3, follow_range: 40, knockback_resistance: 1 },
      'msm:attack': { damage: 10, knockback: 1 },
      'msm:ranged_attack': {
        projectile: 'minecraft:snowball',
        interval_ticks: 60,
        charge_ticks: 10,
        range: 20,
        on_shoot: ns('shot'),
      },
      'msm:ai_goals': {
        goals: [
          { type: 'melee_attack', speed: 1, targets: ['minecraft:player'], retaliate: true },
          { type: 'ranged_attack', targets: ['minecraft:player'], retaliate: true },
          { type: 'wander', speed: 0.8 },
          ...LOOK_GOALS,
        ],
      },
      'msm:boss_bar': { colour: 'red', overlay: 'notched_10', darken_sky: true },
      'msm:on_death': { event: ns('defeated') },
    },
    events: { shot: 'boss_shot', defeated: 'boss_defeated' },
  }),
];

const SPARK = ns('spark');
const SPARK_MODEL = ns('item/spark');

const SAMPLE_ELEMENTS: readonly SampleElement[] = [
  {
    id: ns('mod'),
    kind: 'msm:mod',
    data: {
      mod_id: NAMESPACE,
      version: '1.0.0',
      name: PROJECT_NAME,
      description:
        'Sample creatures: a pet, a mount, a glider, a fish, an archer and a boss, one per mob feature.',
      authors: ['MCSuperMods'],
      licence: 'MIT',
    },
  },
  ...MOBS.flatMap((entry) => entry.elements),
  {
    // The glider's projectile, also throwable by players.
    id: SPARK,
    kind: 'msm:item',
    data: {
      format: 1,
      display_name: 'Spark',
      max_stack_size: 16,
      creative_tab: 'minecraft:combat',
      model: SPARK_MODEL,
      components: {
        'msm:throwable': {
          speed: 1.2,
          gravity: 0.03,
          damage: 2,
          on_hit_entity: { event: ns('spark_hit') },
        },
      },
      events: { [ns('spark_hit')]: sayEvent('spark_hit') },
    },
  },
  {
    id: SPARK_MODEL,
    kind: 'minecraft:model',
    data: { parent: 'minecraft:item/generated', textures: { layer0: SPARK_MODEL } },
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
  ...MOBS.flatMap((entry) => entry.assets),
  {
    path: 'textures/entity/pet_snow.png',
    bytes: presetSkinPng('quadruped', { colour: COLOURS.petSnow }),
  },
  {
    path: 'textures/entity/fish_orange.png',
    bytes: presetSkinPng('fish', { colour: COLOURS.fishOrange }),
  },
  { path: 'textures/item/spark.png', bytes: placeholderPng('ball', { colour: COLOURS.spark }) },
];

const ENTITY_NAMES = MOBS.map((entry) => (entry.elements[0] as SampleElement).id.split(':')[1]);

/** What the runtime registers: no blocks, six spawn eggs and the spark, six entity types. */
const EXPECTED_BLOCKS = 0;
const EXPECTED_ENTITIES = SAMPLE_ELEMENTS.filter((entry) => entry.kind === 'msm:entity').length;
const EXPECTED_ITEMS =
  EXPECTED_ENTITIES + SAMPLE_ELEMENTS.filter((entry) => entry.kind === 'msm:item').length;

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
 * The project's own ids per registry, as the app derives them: element ids under their
 * kind's registry, each spawn egg item `<id>_spawn_egg` and its generated item model
 * `<ns>:item/<path>_spawn_egg`, and the textures of the namespace's PNG assets.
 */
function projectIds(project: Project): Record<string, string[]> {
  const ids: Record<string, string[]> = {};
  const add = (name: string, id: string): void => {
    ids[name] = [...(ids[name] ?? []), id];
  };
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const name = registry.get(element.kind)?.registry;
      if (name === undefined) {
        if (element.kind.startsWith('minecraft:'))
          add(element.kind.slice('minecraft:'.length), element.id);
        continue;
      }
      add(name, element.id);
      const egg = (element.data as { spawn_egg?: Json }).spawn_egg;
      if (name === 'entity_type' && egg !== undefined && egg !== false) {
        add('item', `${element.id}_spawn_egg`);
        const path = element.id.slice(element.id.indexOf(':') + 1);
        add('model', `${namespace.name}:item/${path}_spawn_egg`);
      }
    }
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
const sha512 = (bytes: Uint8Array): string => createHash('sha512').update(bytes).digest('hex');

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
 * The GeckoLib jar at `path`: read when its SHA-512 matches the facts, else downloaded from
 * the facts' URL, checked and written there (so CI can cache the file).
 */
async function geckolibJar(path: string, facts: GeckolibFacts): Promise<Uint8Array> {
  try {
    const bytes = new Uint8Array(await readFile(path));
    if (sha512(bytes) === facts.sha512) return bytes;
  } catch {
    // Not there yet: download it below.
  }
  const response = await fetch(facts.url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`GET ${facts.url} returned HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = sha512(bytes);
  if (actual !== facts.sha512) {
    throw new Error(`${facts.url}: SHA-512 ${actual} does not match the target's ${facts.sha512}`);
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.part`, bytes);
  await rename(`${path}.part`, path);
  return bytes;
}

const componentsOf = (element: Element): JsonRecord =>
  (element.data as { components?: JsonRecord }).components ?? {};

// Tests -------------------------------------------------------------------------------------

describe('sample creatures project', () => {
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

  it('loads with zero problems and has one mob per feature', async () => {
    const project = await loadSample();
    expect(project.name).toBe(PROJECT_NAME);
    const entities = new Map(
      elementsOf(project)
        .filter((element) => element.kind === 'msm:entity')
        .map((element) => [element.id.split(':')[1] as string, element] as const),
    );
    expect([...entities.keys()].sort()).toEqual(
      ['archer', 'boss', 'fish', 'glider', 'mount', 'pet'].sort(),
    );
    const of = (name: string): { data: JsonRecord; components: JsonRecord } => {
      const element = entities.get(name);
      if (element === undefined) throw new Error(`${name} is missing`);
      return { data: element.data as JsonRecord, components: componentsOf(element) };
    };
    const pet = of('pet');
    expect(pet.data.base).toBe('animal');
    expect(pet.components['msm:tameable']).toMatchObject({ chance: 1 });
    expect(pet.components['msm:breedable']).toBeDefined();
    expect(pet.components['msm:variants']).toMatchObject({ choose: 'biome' });
    const mount = of('mount');
    expect(mount.components['msm:rideable']).toMatchObject({
      saddle: true,
      saddle_bone: 'saddle',
    });
    expect((mount.components['msm:rideable'] as JsonRecord).jump).toBeGreaterThan(0);
    const glider = of('glider');
    expect(glider.components['msm:movement']).toMatchObject({ mode: 'fly' });
    expect(glider.components['msm:ranged_attack']).toMatchObject({ projectile: SPARK });
    const fish = of('fish');
    expect(fish.data.category).toBe('water_ambient');
    expect(fish.components['msm:movement']).toMatchObject({ mode: 'swim' });
    expect(fish.components['msm:variants']).toMatchObject({ choose: 'random' });
    const archer = of('archer');
    expect(archer.data.base).toBe('monster');
    expect(archer.components['msm:ranged_attack']).toMatchObject({
      projectile: 'minecraft:arrow',
    });
    expect(JSON.stringify(archer.components['msm:ai_goals'])).toContain('"strafe":true');
    const boss = of('boss');
    expect(boss.data.base).toBe('monster');
    expect(boss.components['msm:boss_bar']).toMatchObject({ overlay: 'notched_10' });
    expect(boss.components['msm:attack']).toBeDefined();
    expect(boss.components['msm:ranged_attack']).toBeDefined();
    // Every mob is `auto` but the boss.
    const renderers = Object.fromEntries(
      [...entities.keys()].map((name) => [
        name,
        (of(name).components['msm:animated_model'] as JsonRecord).renderer,
      ]),
    );
    expect(renderers).toEqual({
      archer: 'auto',
      boss: 'vanilla',
      fish: 'auto',
      glider: 'auto',
      mount: 'auto',
      pet: 'auto',
    });
    // Every `say/` function says its fixed line.
    for (const [name, line] of Object.entries(SAY_LINES)) {
      const fn = elementsOf(project).find((element) => element.id === ns(`say/${name}`));
      expect((fn?.data as { lines?: string[] } | undefined)?.lines, name).toEqual([`say ${line}`]);
    }
    const kinds = new Set(elementsOf(project).map((element) => element.kind));
    expect([...kinds].sort()).toEqual([
      'minecraft:function',
      'minecraft:loot_table',
      'minecraft:model',
      'msm:animation',
      'msm:entity',
      'msm:geo_model',
      'msm:item',
      'msm:mod',
    ]);
    expect(project.namespaces[0]?.assets.map((asset) => asset.path).sort()).toEqual(
      SAMPLE_ASSETS.map((asset) => asset.path).sort(),
    );
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sample creatures export (%s)',
  (_id, bundle) => {
    const { target } = bundle;
    let context: TargetContext;
    const geckolib = target.geckolib;

    beforeAll(async () => {
      context = await contextFor(bundle, await loadSample());
    }, 120_000);

    async function exportJar(
      factory: FabricContentJarOptions = {
        loadRuntimeJar: async () => stubRuntimeJar,
        loadGeckolibJar: async () => stubGeckolibJar,
      },
      exportTarget: Target = target,
    ): Promise<{ jar: Uint8Array; problems: Problem[] }> {
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

    it('holds the definitions, models, functions and the saddle tag, all valid', async () => {
      const { jar, problems: exportProblems } = await exportJar();
      const files = unzipSync(jar);
      const paths = Object.keys(files).sort();
      const resource = target.folders.resource;
      const data = target.folders.data;
      const definitions = ENTITY_NAMES.map((name) => `msm/${NAMESPACE}/entity/${name}.json`);
      expect(paths.filter((path) => path.startsWith('msm/'))).toEqual(
        [...definitions, `msm/${NAMESPACE}/item/spark.json`].sort(),
      );
      const saddleTag = target.entities?.saddleTag;
      if (saddleTag === undefined) throw new Error(`${target.id} has no saddle tag fact`);
      const [tagNamespace, tagPath] = saddleTag.split(':') as [string, string];
      const tagFile = `data/${tagNamespace}/tags/entity_type/${tagPath}.json`;
      for (const path of [
        'fabric.mod.json',
        'msm.export.json',
        tagFile,
        `assets/${NAMESPACE}/${resource.lang}/en_us.json`,
        `assets/${NAMESPACE}/${resource.textures}/item/spark.png`,
        `assets/${NAMESPACE}/${resource.textures}/entity/pet_snow.png`,
        `assets/${NAMESPACE}/${resource.textures}/entity/fish_orange.png`,
        ...ENTITY_NAMES.flatMap((name) => [
          `assets/${NAMESPACE}/geckolib/models/entity/${name}.geo.json`,
          `assets/${NAMESPACE}/geckolib/animations/entity/${name}_animations.animation.json`,
          `assets/${NAMESPACE}/${resource.textures}/entity/${name}.png`,
          `assets/${NAMESPACE}/${resource.textures}/item/${name}_spawn_egg.png`,
          `data/${NAMESPACE}/${data.loot_table}/entities/${name}.json`,
        ]),
        ...Object.keys(SAY_LINES).map(
          (name) => `data/${NAMESPACE}/${data.function}/say/${name}.mcfunction`,
        ),
      ]) {
        expect(paths, path).toContain(path);
      }
      expect(paths).not.toContain('pack.mcmeta');

      const json = (path: string): Json => JSON.parse(utf8.decode(files[path] as Uint8Array));
      // Only the mount is saddled: the tag lists it and nothing else.
      expect(json(tagFile)).toEqual({ values: [ns('mount')] });

      const problems: string[] = [];
      for (const name of ENTITY_NAMES) {
        for (const [path, ref] of [
          [`msm/${NAMESPACE}/entity/${name}.json`, MSM_SCHEMA_REFS.entityDefinition],
          [`assets/${NAMESPACE}/geckolib/models/entity/${name}.geo.json`, MSM_SCHEMA_REFS.geoModel],
          [
            `assets/${NAMESPACE}/geckolib/animations/entity/${name}_animations.animation.json`,
            MSM_SCHEMA_REFS.animation,
          ],
        ] as const) {
          for (const problem of validateJson(
            json(path),
            context.schemaIndex.resolveSchemaRef(ref),
            { registries: context.registries },
          )) {
            problems.push(`${path} ${problem.path} ${problem.code}: ${problem.message}`);
          }
        }
      }
      expect(problems).toEqual([]);

      expect(json(`msm/${NAMESPACE}/entity/boss.json`)).toMatchObject({
        base: 'monster',
        components: {
          'msm:animated_model': { renderer: 'vanilla' },
          'msm:boss_bar': { colour: 'red', overlay: 'notched_10', darken_sky: true },
        },
      });
      const lang = json(`assets/${NAMESPACE}/${resource.lang}/en_us.json`) as JsonRecord;
      for (const name of ENTITY_NAMES) {
        expect(lang[`entity.${NAMESPACE}.${name}`], name).toBeDefined();
        expect(lang[`item.${NAMESPACE}.${name}_spawn_egg`], name).toBeDefined();
      }
      expect(lang[`item.${NAMESPACE}.spark`]).toBe('Spark');

      const modJson = json('fabric.mod.json') as {
        id: string;
        depends: Record<string, string>;
        jars: { file: string }[];
      };
      expect(modJson.id).toBe(NAMESPACE);
      expect(modJson.depends.msm_runtime).toBe(`>=${meta.msmVersion}`);
      const runtimePath = nestedRuntimePath(meta.msmVersion);
      expect(files[runtimePath]).toEqual(stubRuntimeJar);
      const vanillaInfos = exportProblems
        .filter((problem) => problem.code === 'export.entity-vanilla-renderer')
        .map((problem) => [problem.severity, problem.file]);
      if (geckolib !== undefined) {
        // With GeckoLib: the five `auto` mobs need it, nested; the boss draws with the runtime.
        const geckolibPath = nestedGeckolibPath(geckolib);
        expect(paths.filter((path) => path.startsWith('META-INF/jars/'))).toEqual(
          [runtimePath, geckolibPath].sort(),
        );
        expect(files[geckolibPath]).toEqual(stubGeckolibJar);
        expect(modJson.depends[geckolib.modId]).toBe(geckolib.dependency);
        expect(modJson.jars).toHaveLength(2);
        expect(vanillaInfos).toEqual([]);
      } else {
        // Without GeckoLib (ADR 0072 D5): none nested; each `auto` mob gets one info.
        expect(paths.filter((path) => path.startsWith('META-INF/jars/'))).toEqual([runtimePath]);
        expect(Object.keys(modJson.depends).sort()).toEqual([
          'fabric-api',
          'fabricloader',
          'minecraft',
          'msm_runtime',
        ]);
        expect(modJson.jars).toEqual([{ file: runtimePath }]);
        expect(vanillaInfos).toEqual(
          ENTITY_NAMES.filter((name) => name !== 'boss')
            .sort()
            .map((name) => ['info', `msm/${NAMESPACE}/entity/${name}.json`]),
        );
      }
    });

    describe('content jar', () => {
      const hashFile = join(fixturesRoot, target.id, 'sample-creatures-jar.sha256');
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
    const geckolibJarPath = process.env.MSM_GECKOLIB_JAR;
    const outDir = process.env.MSM_SAMPLE_CREATURES_OUT;
    const isSelectedTarget = bundle === selectedTarget();
    it.runIf(
      runtimeJarPath !== undefined &&
        outDir !== undefined &&
        isSelectedTarget &&
        (geckolib === undefined || geckolibJarPath !== undefined),
    )(
      'writes the jar with the real runtime (and GeckoLib) for the headless server check',
      async () => {
        const fabric = target.fabric;
        if (fabric === undefined) throw new Error(`${target.id} has no Fabric facts`);
        const runtimeJar = new Uint8Array(await readFile(runtimeJarPath as string));
        const runtimeVersion = jarModVersion(runtimeJar);
        const realGeckolib =
          geckolib === undefined
            ? undefined
            : await geckolibJar(geckolibJarPath as string, geckolib);
        const { jar } = await exportJar({
          loadRuntimeJar: async () => runtimeJar,
          loadGeckolibJar: async () => realGeckolib ?? stubGeckolibJar,
          runtimeVersion,
        });
        await mkdir(outDir as string, { recursive: true });
        await writeFile(join(outDir as string, `${NAMESPACE}.jar`), jar);
        const facts = {
          expectBlocks: EXPECTED_BLOCKS,
          expectEntities: EXPECTED_ENTITIES,
          expectItems: EXPECTED_ITEMS,
          fabricApi: fabric.api,
          ...(geckolib === undefined
            ? {}
            : {
                geckolib: {
                  fileName: geckolib.fileName,
                  sha512: geckolib.sha512,
                  url: geckolib.url,
                },
              }),
          java: target.java,
          loader: fabric.loader,
          minecraft: target.mcVersion,
          runtimeVersion,
        };
        await writeFile(
          join(outDir as string, 'fabric-facts.json'),
          `${JSON.stringify(facts, null, 2)}\n`,
        );
        const files = unzipSync(jar);
        expect(files[nestedRuntimePath(runtimeVersion)]).toEqual(runtimeJar);
        if (geckolib !== undefined) {
          expect(files[nestedGeckolibPath(geckolib)]).toEqual(realGeckolib);
        }
      },
      120_000,
    );
  },
);
