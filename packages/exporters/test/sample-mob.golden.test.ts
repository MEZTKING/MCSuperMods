/**
 * Golden over the committed kitchen-sink mob project (`fixtures/sample-mob`, ADRs 0028 and
 * 0029): an `msm:mod`, one `msm:entity` (`glow_golem`) using every entity component, all six
 * goal types, the trigger events, `play_animation`, a natural spawn and a spawn egg, one
 * `msm:geo_model`, one `msm:animation` set (`idle`, `walk`, `attack`, `wave`), two
 * placeholder textures, a function and a loot table, namespace `msm_sample_mob`; since ADR
 * 0057 the golem's ambient, hurt, death and step sounds are four project sound events of a
 * `minecraft:sounds` element; since ADR 0061 the triggers `msm:on_tick` (a heal every 20 ticks)
 * and `msm:on_spawn` (Glowing for 10 seconds and a second function, `golem/arrive`).
 *
 * - The fixture equals the project built from {@link SAMPLE_ELEMENTS} and
 *   {@link SAMPLE_ASSETS} now; `UPDATE_GOLDENS=1` rewrites it (the README is hand-written).
 * - Every element validates with zero problems, the plugins' project validators report
 *   nothing, and the function passes the offline mcfunction checker.
 * - The content jar exports with zero problems with stub runtime and GeckoLib jars nested;
 *   its SHA-256 is pinned per target in two time zones
 *   (`test/fixtures/<target id>/sample-mob-jar.sha256`).
 * - The jar holds the `msm/` entity definition and the GeckoLib model and animations, each
 *   valid against its MSM schema, and `fabric.mod.json` depends on GeckoLib.
 * - With `MSM_RUNTIME_JAR` (a built `msm_runtime` jar), `MSM_GECKOLIB_JAR` (the GeckoLib jar
 *   path; downloaded there from the target's GeckoLib facts and SHA-512 checked when the file
 *   is missing or differs) and `MSM_SAMPLE_MOB_OUT` (a folder), the jar is also exported with
 *   both real jars nested and written to that folder as `msm_sample_mob.jar`, next to
 *   `fabric-facts.json` for `tools/run-fabric-server` (CI's `engine-mod` job). Without them
 *   that test is skipped.
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
import { placeholderPng, placeholderSkinPng, type Rgb } from '@msm/plugin-library';
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
const sampleRoot = join(here, '..', '..', '..', 'fixtures', 'sample-mob');
const NAMESPACE = 'msm_sample_mob';
const PROJECT_NAME = 'MSM Sample Mob';
const NOW = '2026-11-05T00:00:00.000Z';
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
  msmVersion: '0.4.0',
  plugins: ['msm.blocks-items', 'msm.datapack', 'msm.entities', 'msm.models-anim'],
};
const stubRuntimeJar = utf8.encode('PK stub msm_runtime jar for the sample-mob golden');
const stubGeckolibJar = utf8.encode('PK stub GeckoLib jar for the sample-mob golden');

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

const ns = (path: string): string => `${NAMESPACE}:${path}`;

const GLOW: Rgb = [232, 196, 64];
const MODEL = ns('entity/glow_golem');
const ANIMATIONS = ns('entity/glow_golem_animations');
const SKIN = ns('entity/glow_golem');
const EGG_TEXTURE = ns('item/glow_golem_spawn_egg');
const LOOT = ns('entities/glow_golem');
const BURST = ns('golem/glow_burst');
const ARRIVE = ns('golem/arrive');

/** A one-second swing between `+angle` and `-angle` about x. */
const swing = (angle: number): Json => ({
  rotation: { '0.0': [angle, 0, 0], '0.5': [-angle, 0, 0], '1.0': [angle, 0, 0] },
});

/**
 * The kitchen sink. The entity uses every component (`msm:health`, `msm:movement`,
 * `msm:attack`, `msm:ai_goals`, `msm:animated_model`, `msm:on_hurt`, `msm:on_death`,
 * `msm:on_interact`, `msm:on_tick`, `msm:on_spawn`), every goal type (`wander`, `look_at_player`, `look_around`,
 * `melee_attack`, `flee`, `follow`), a natural spawn from a biome tag and a biome id with
 * every spawn field, a spawn egg with its own texture, and the actions `play_animation`,
 * `play_sound`, `spawn_particle`, `run_function`, `apply_effect` and `heal`.
 */
const SAMPLE_ELEMENTS: readonly SampleElement[] = [
  {
    id: ns('mod'),
    kind: 'msm:mod',
    data: {
      mod_id: NAMESPACE,
      version: '1.0.0',
      name: PROJECT_NAME,
      description: 'Kitchen-sink sample: an animated mob with every entity component and goal.',
      authors: ['MCSuperMods'],
      licence: 'MIT',
    },
  },
  {
    id: ns('glow_golem'),
    kind: 'msm:entity',
    data: {
      format: 1,
      display_name: 'Glow Golem',
      category: 'creature',
      size: { width: 0.8, height: 1.9 },
      eye_height: 1.6,
      loot_table: LOOT,
      spawn: {
        biomes: ['#minecraft:is_forest', 'minecraft:plains'],
        weight: 5,
        min_group: 1,
        max_group: 2,
        placement: 'on_ground',
        heightmap: 'motion_blocking_no_leaves',
        rule: 'mob',
      },
      spawn_egg: {
        creative_tab: 'minecraft:spawn_eggs',
        texture: EGG_TEXTURE,
        display_name: 'Glow Golem Spawn Egg',
      },
      components: {
        'msm:health': { max: 40 },
        'msm:movement': {
          speed: 0.25,
          follow_range: 24,
          knockback_resistance: 0.4,
          swims: true,
          fire_immune: true,
        },
        'msm:attack': { damage: 5, knockback: 0.5, on_attack: ns('swing') },
        'msm:ai_goals': {
          goals: [
            {
              type: 'melee_attack',
              priority: 1,
              speed: 1.1,
              targets: ['minecraft:zombie'],
              must_see: true,
              retaliate: true,
            },
            {
              type: 'flee',
              from: ['minecraft:creeper'],
              distance: 6,
              speed: 1,
              sprint_speed: 1.3,
            },
            {
              type: 'follow',
              entities: ['minecraft:player'],
              speed: 1,
              stop_distance: 3,
              range: 12,
            },
            { type: 'wander', speed: 0.8, avoid_water: true },
            { type: 'look_at_player', distance: 8 },
            { type: 'look_around' },
          ],
        },
        'msm:animated_model': {
          model: MODEL,
          animations: ANIMATIONS,
          texture: SKIN,
          scale: 1,
          idle: 'idle',
          walk: 'walk',
          attack: 'attack',
          transition_ticks: 4,
        },
        'msm:on_hurt': { event: ns('hurt') },
        'msm:on_death': { event: ns('fade') },
        'msm:on_interact': { event: ns('greet') },
        // Triggers (ADR 0061 D3): a heal every second while its AI runs, and a greeting when
        // it spawns from an egg, a spawner or naturally (not when its chunk loads).
        'msm:on_tick': { event: ns('mend'), interval_ticks: 20 },
        'msm:on_spawn': { event: ns('arrive') },
      },
      // Project sound events (ADR 0057 D6), defined by the `sounds` element below.
      sounds: {
        ambient: ns('golem.ambient'),
        hurt: ns('golem.hurt'),
        death: ns('golem.death'),
        step: ns('golem.step'),
        ambient_interval_ticks: 200,
      },
      events: {
        [ns('swing')]: {
          actions: [{ type: 'play_sound', sound: 'minecraft:entity.iron_golem.attack' }],
        },
        [ns('hurt')]: {
          actions: [{ type: 'spawn_particle', particle: 'minecraft:glow', count: 6, spread: 0.4 }],
        },
        [ns('greet')]: {
          actions: [
            { type: 'play_animation', animation: 'wave', controller: 'msm_triggered' },
            { type: 'play_sound', sound: 'minecraft:block.amethyst_block.chime', pitch: 1.2 },
          ],
        },
        [ns('fade')]: {
          actions: [
            { type: 'spawn_particle', particle: 'minecraft:end_rod', count: 12, spread: 0.5 },
            { type: 'run_function', function: BURST },
          ],
        },
        [ns('mend')]: { actions: [{ type: 'heal', amount: 2 }] },
        [ns('arrive')]: {
          actions: [
            { type: 'apply_effect', effect: 'minecraft:glowing', seconds: 10, target: 'self' },
            { type: 'run_function', function: ARRIVE },
          ],
        },
      },
    },
  },
  {
    id: MODEL,
    kind: 'msm:geo_model',
    data: {
      format_version: '1.12.0',
      'minecraft:geometry': [
        {
          description: {
            identifier: 'geometry.glow_golem',
            texture_width: 64,
            texture_height: 64,
            visible_bounds_width: 2,
            visible_bounds_height: 3,
            visible_bounds_offset: [0, 1.5, 0],
          },
          bones: [
            {
              name: 'body',
              pivot: [0, 24, 0],
              cubes: [{ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16] }],
            },
            {
              name: 'head',
              parent: 'body',
              pivot: [0, 24, 0],
              cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0] }],
            },
            {
              name: 'right_arm',
              parent: 'body',
              pivot: [-5, 22, 0],
              cubes: [{ origin: [-8, 12, -2], size: [4, 12, 4], uv: [40, 16] }],
            },
            {
              name: 'left_arm',
              parent: 'body',
              pivot: [5, 22, 0],
              cubes: [{ origin: [4, 12, -2], size: [4, 12, 4], uv: [32, 48] }],
            },
            {
              name: 'right_leg',
              pivot: [-1.9, 12, 0],
              cubes: [{ origin: [-3.9, 0, -2], size: [4, 12, 4], uv: [0, 16] }],
            },
            {
              name: 'left_leg',
              pivot: [1.9, 12, 0],
              cubes: [{ origin: [-0.1, 0, -2], size: [4, 12, 4], uv: [16, 48] }],
            },
          ],
        },
      ],
    },
  },
  {
    id: ANIMATIONS,
    kind: 'msm:animation',
    data: {
      format_version: '1.8.0',
      animations: {
        idle: {
          loop: true,
          animation_length: 2,
          bones: {
            body: { position: { '0.0': [0, 0, 0], '1.0': [0, 0.5, 0], '2.0': [0, 0, 0] } },
            head: { rotation: { '0.0': [0, 0, 0], '1.0': [4, 0, 0], '2.0': [0, 0, 0] } },
          },
        },
        walk: {
          loop: true,
          animation_length: 1,
          bones: {
            right_leg: swing(30),
            left_leg: swing(-30),
            right_arm: swing(-25),
            left_arm: swing(25),
          },
        },
        attack: {
          loop: false,
          animation_length: 0.5,
          bones: {
            right_arm: { rotation: { '0.0': [0, 0, 0], '0.2': [-100, 0, 0], '0.5': [0, 0, 0] } },
            left_arm: { rotation: { '0.0': [0, 0, 0], '0.2': [-100, 0, 0], '0.5': [0, 0, 0] } },
          },
        },
        wave: {
          loop: false,
          animation_length: 1.5,
          bones: {
            right_arm: {
              rotation: {
                '0.0': [0, 0, 0],
                '0.3': [0, 0, 150],
                '0.6': [0, 0, 120],
                '0.9': [0, 0, 150],
                '1.5': [0, 0, 0],
              },
            },
          },
        },
      },
    },
  },
  {
    id: BURST,
    kind: 'minecraft:function',
    data: {
      lines: [
        '# Run by the glow golem when it dies (run_function action).',
        'particle minecraft:glow ~ ~1 ~ 0.5 0.6 0.5 0.05 20',
        'say The glow golem fades.',
      ],
    },
  },
  {
    id: ARRIVE,
    kind: 'minecraft:function',
    data: {
      lines: [
        '# Run when a glow golem spawns (msm:on_spawn, run_function action).',
        'say The glow golem arrives.',
      ],
    },
  },
  {
    // The golem's sound events: vanilla iron golem sound files from the player's own game.
    id: ns('sounds'),
    kind: 'minecraft:sounds',
    data: {
      'golem.ambient': { sounds: ['minecraft:mob/irongolem/walk1'] },
      'golem.death': { sounds: ['minecraft:mob/irongolem/death'] },
      'golem.hurt': { sounds: ['minecraft:mob/irongolem/hit1'] },
      'golem.step': { sounds: ['minecraft:mob/irongolem/walk2'] },
    },
  },
  {
    id: LOOT,
    kind: 'minecraft:loot_table',
    data: {
      type: 'minecraft:entity',
      pools: [
        {
          rolls: 1,
          bonus_rolls: 0,
          entries: [
            {
              type: 'minecraft:item',
              name: 'minecraft:glowstone_dust',
              modifier: {
                type: 'minecraft:set_count',
                count: { type: 'minecraft:uniform', min: 1, max: 3 },
              },
            },
          ],
        },
      ],
      random_sequence: LOOT,
    },
  },
];

/** The two placeholder textures: the 64x64 skin and the 16x16 spawn egg. */
const SAMPLE_ASSETS: readonly SampleAsset[] = [
  { path: 'textures/entity/glow_golem.png', bytes: placeholderSkinPng({ colour: GLOW }) },
  {
    path: 'textures/item/glow_golem_spawn_egg.png',
    bytes: placeholderPng('egg', { colour: GLOW }),
  },
];

/** What the runtime registers: no blocks, the spawn egg as the one item, one entity type. */
const EXPECTED_BLOCKS = 0;
const EXPECTED_ITEMS = 1;
const EXPECTED_ENTITIES = SAMPLE_ELEMENTS.filter((entry) => entry.kind === 'msm:entity').length;

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
 * kind's registry, the spawn egg item `<id>_spawn_egg` and its generated item model
 * `<ns>:item/<path>_spawn_egg`, and the textures of the namespace's PNG assets.
 */
function projectIds(project: Project): Record<string, string[]> {
  const ids: Record<string, string[]> = {};
  const add = (name: string, id: string): void => {
    ids[name] = [...(ids[name] ?? []), id];
  };
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      // `sounds.json` event keys are `sound_event` ids in `msm:` elements (ADR 0057 D3).
      if (element.kind === 'minecraft:sounds') {
        for (const key of Object.keys(element.data as object)) {
          add('sound_event', `${namespace.name}:${key}`);
        }
      }
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

// Tests -------------------------------------------------------------------------------------

describe('sample mob project', () => {
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

  it('loads with zero problems and covers every component, goal and trigger', async () => {
    const project = await loadSample();
    expect(project.name).toBe(PROJECT_NAME);
    const text = JSON.stringify(elementsOf(project).map((element) => element.data));
    for (const component of [
      'msm:health',
      'msm:movement',
      'msm:attack',
      'msm:ai_goals',
      'msm:animated_model',
      'msm:on_hurt',
      'msm:on_death',
      'msm:on_interact',
      'msm:on_tick',
      'msm:on_spawn',
    ]) {
      expect(text.includes(`"${component}"`), component).toBe(true);
    }
    for (const goal of [
      'wander',
      'look_at_player',
      'look_around',
      'melee_attack',
      'flee',
      'follow',
    ]) {
      expect(text.includes(`"type":"${goal}"`), goal).toBe(true);
    }
    expect(text.includes('"type":"play_animation"')).toBe(true);
    const animations = elementsOf(project).find((element) => element.id === ANIMATIONS);
    if (animations === undefined) throw new Error(`${ANIMATIONS} is missing`);
    expect(Object.keys((animations.data as { animations: object }).animations).sort()).toEqual([
      'attack',
      'idle',
      'walk',
      'wave',
    ]);
    const kinds = new Set(elementsOf(project).map((element) => element.kind));
    expect([...kinds].sort()).toEqual([
      'minecraft:function',
      'minecraft:loot_table',
      'minecraft:sounds',
      'msm:animation',
      'msm:entity',
      'msm:geo_model',
      'msm:mod',
    ]);
    expect(project.namespaces[0]?.assets.map((asset) => asset.path).sort()).toEqual(
      SAMPLE_ASSETS.map((asset) => asset.path).sort(),
    );
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sample mob export (%s)',
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

    /** The jar needs GeckoLib: on a target without it only the problem is asserted. */
    const withGeckolib = it.runIf(geckolib !== undefined);

    it.runIf(geckolib === undefined)(
      'refuses the content jar with export.no-geckolib-target (no GeckoLib build)',
      async () => {
        const report = await runExport({
          project: await loadSample(),
          registry,
          target,
          schemaIndex: context.schemaIndex,
          registries: context.registries,
          exporter: createFabricContentJarExporter({
            loadRuntimeJar: async () => stubRuntimeJar,
            loadGeckolibJar: async () => stubGeckolibJar,
          }),
          sink: createZipSink(),
          readAsset: (namespace, path) => sampleFs.readFile(`assets/${namespace}/${path}`),
          meta,
        });
        expect(report.ok).toBe(false);
        expect(report.problems.map((problem) => problem.code)).toContain(
          'export.no-geckolib-target',
        );
      },
    );

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

    withGeckolib(
      'holds the expected files, the definition and GeckoLib resources validate',
      async () => {
        if (geckolib === undefined) throw new Error(`${target.id} has no GeckoLib facts`);
        const files = unzipSync(await exportJar());
        const paths = Object.keys(files).sort();
        const resource = target.folders.resource;
        const data = target.folders.data;
        const definition = `msm/${NAMESPACE}/entity/glow_golem.json`;
        const geo = `assets/${NAMESPACE}/geckolib/models/entity/glow_golem.geo.json`;
        const animation = `assets/${NAMESPACE}/geckolib/animations/entity/glow_golem_animations.animation.json`;
        expect(paths.filter((path) => path.startsWith('msm/'))).toEqual([definition]);
        for (const path of [
          'fabric.mod.json',
          'msm.export.json',
          geo,
          animation,
          `assets/${NAMESPACE}/${resource.textures}/entity/glow_golem.png`,
          `assets/${NAMESPACE}/${resource.textures}/item/glow_golem_spawn_egg.png`,
          `assets/${NAMESPACE}/${resource.item_definition}/glow_golem_spawn_egg.json`,
          `assets/${NAMESPACE}/${resource.model}/item/glow_golem_spawn_egg.json`,
          `assets/${NAMESPACE}/${resource.lang}/en_us.json`,
          `data/${NAMESPACE}/${data.function}/golem/glow_burst.mcfunction`,
          `data/${NAMESPACE}/${data.function}/golem/arrive.mcfunction`,
          `data/${NAMESPACE}/${data.loot_table}/entities/glow_golem.json`,
          `assets/${NAMESPACE}/sounds.json`,
        ]) {
          expect(paths, path).toContain(path);
        }
        const runtimePath = nestedRuntimePath(meta.msmVersion);
        const geckolibPath = nestedGeckolibPath(geckolib);
        expect(paths.filter((path) => path.startsWith('META-INF/jars/'))).toEqual(
          [runtimePath, geckolibPath].sort(),
        );
        expect(files[runtimePath]).toEqual(stubRuntimeJar);
        expect(files[geckolibPath]).toEqual(stubGeckolibJar);
        expect(paths).not.toContain('pack.mcmeta');

        const json = (path: string): Json => JSON.parse(utf8.decode(files[path] as Uint8Array));
        const problems: string[] = [];
        for (const [path, ref] of [
          [definition, MSM_SCHEMA_REFS.entityDefinition],
          [geo, MSM_SCHEMA_REFS.geoModel],
          [animation, MSM_SCHEMA_REFS.animation],
        ] as const) {
          for (const problem of validateJson(
            json(path),
            context.schemaIndex.resolveSchemaRef(ref),
            {
              registries: context.registries,
            },
          )) {
            problems.push(`${path} ${problem.path} ${problem.code}: ${problem.message}`);
          }
        }
        expect(problems).toEqual([]);

        expect(json(definition)).toMatchObject({
          format: 1,
          category: 'creature',
          loot_table: LOOT,
          spawn_egg: { creative_tab: 'minecraft:spawn_eggs' },
          components: {
            'msm:animated_model': {
              model: MODEL,
              animations: ANIMATIONS,
              texture: SKIN,
              idle: 'idle',
              walk: 'walk',
              attack: 'attack',
            },
          },
        });
        expect(json(`assets/${NAMESPACE}/${resource.lang}/en_us.json`)).toMatchObject({
          [`entity.${NAMESPACE}.glow_golem`]: 'Glow Golem',
          [`item.${NAMESPACE}.glow_golem_spawn_egg`]: 'Glow Golem Spawn Egg',
        });

        const modJson = json('fabric.mod.json') as {
          id: string;
          depends: Record<string, string>;
          jars: { file: string }[];
        };
        expect(modJson.id).toBe(NAMESPACE);
        expect(modJson.depends.msm_runtime).toBe(`>=${meta.msmVersion}`);
        expect(modJson.depends[geckolib.modId]).toBe(geckolib.dependency);
        expect(modJson.jars).toEqual(
          expect.arrayContaining([{ file: runtimePath }, { file: geckolibPath }]),
        );
        expect(modJson.jars).toHaveLength(2);
      },
    );

    describe.runIf(geckolib !== undefined)('content jar', () => {
      const hashFile = join(fixturesRoot, target.id, 'sample-mob-jar.sha256');
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
    const geckolibJarPath = process.env.MSM_GECKOLIB_JAR;
    const outDir = process.env.MSM_SAMPLE_MOB_OUT;
    const isSelectedTarget = bundle === selectedTarget();
    it.runIf(
      runtimeJarPath !== undefined &&
        geckolibJarPath !== undefined &&
        outDir !== undefined &&
        isSelectedTarget &&
        geckolib !== undefined,
    )(
      'writes the jar with the real runtime and GeckoLib for the headless server check',
      async () => {
        const fabric = target.fabric;
        if (fabric === undefined) throw new Error(`${target.id} has no Fabric facts`);
        if (geckolib === undefined) throw new Error(`${target.id} has no GeckoLib facts`);
        const runtimeJar = new Uint8Array(await readFile(runtimeJarPath as string));
        const runtimeVersion = jarModVersion(runtimeJar);
        const realGeckolib = await geckolibJar(geckolibJarPath as string, geckolib);
        const jar = await exportJar({
          loadRuntimeJar: async () => runtimeJar,
          loadGeckolibJar: async () => realGeckolib,
          runtimeVersion,
        });
        await mkdir(outDir as string, { recursive: true });
        await writeFile(join(outDir as string, `${NAMESPACE}.jar`), jar);
        const facts = {
          expectBlocks: EXPECTED_BLOCKS,
          expectEntities: EXPECTED_ENTITIES,
          expectItems: EXPECTED_ITEMS,
          fabricApi: fabric.api,
          geckolib: { fileName: geckolib.fileName, sha512: geckolib.sha512, url: geckolib.url },
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
        expect(files[nestedGeckolibPath(geckolib)]).toEqual(realGeckolib);
      },
      120_000,
    );
  },
);
