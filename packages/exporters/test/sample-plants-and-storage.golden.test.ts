/**
 * Golden over the committed plants and storage project (`fixtures/sample-plants-and-storage`,
 * ADRs 0103 to 0105, ADR 0112 D4, plan B520): namespace `msm_sample_plants`, an `msm:mod` and one
 * of each feature of vanilla parity 3, batch 1, each different enough for a parity test to tell
 * apart:
 *
 * - growing plants (ADR 0103 D1): `sea_ribbon` (kelp-like: grows up in water, companion
 *   `sea_ribbon_plant`), `glow_vine` (cave-vine-like: hangs down, berries of its own,
 *   `glow_vine_berries`, light 14 while ripe) and `climbing_ivy` (twisting-vine-like: grows up in
 *   air and can be climbed);
 * - column plants: `dune_reed` (sugar-cane-like, three high), `spine_cactus` (cactus-like, four
 *   high, touch damage 2) and `reed_bamboo` (bamboo-like, with the shoot `reed_bamboo_shoot`);
 * - `glow_moss` (glow-lichen-like, light 7, spreads by bone meal);
 * - `wide_leaf` (big-dripleaf-like, companion `wide_leaf_stem`) and `small_wide_leaf` (small,
 *   grows into `wide_leaf`);
 * - `clay_planter`, a project flower pot (ADR 0103 D2) taking a dandelion, a poppy and an oak
 *   sapling (companions `clay_planter_<plant>`), and `clay_planter_grass`, a potted plant in it (short grass, which vanilla does not pot);
 * - bronze, ageing like copper on the six new weathering types (ADR 0104 D1): a rod, a button,
 *   a pressure plate, a fence, a fence gate and a wall, each unaffected (with a waxed copy) and
 *   exposed; lightning scrapes them (D2);
 * - storage 2 (ADR 0104 D3 to D6): `twin_crate` (joins into a double chest), `private_crate`
 *   (different for every player), `sea_crate` (two rows, holds water) and the bronze chest
 *   (`bronze_chest`, `exposed_bronze_chest`, `waxed_bronze_chest`: a double chest that ages with
 *   its contents);
 * - own sounds and set types (ADR 0105 D1, D2): `chime_stone` breaks, steps and is placed with
 *   amethyst sounds; `creaky_door`, an iron-based door that opens by hand with its own sounds;
 * - pairs (D3, D4): `loam` a shovel flattens into `loam_path` and a hoe tills into
 *   `loam_farmland` (dropping a stick), and the rules for vanilla blocks `farm_rules` (the
 *   library's template: strip mossy cobblestone and stone bricks, flatten mud, till a moss block,
 *   burn mushroom blocks).
 *
 * Pictures are MSM's own (the library's placeholder pictures, `placeholderPng`); none is
 * vanilla's. The pot's item is vanilla's flower pot picture, named, never bundled.
 *
 * - The fixture equals the project built from {@link SAMPLE_ELEMENTS} and {@link SAMPLE_ASSETS}
 *   now; `UPDATE_GOLDENS=1` rewrites it (the README is hand-written).
 * - Every element validates with zero problems; the project expands with no problems and the
 *   plugins' project validators report nothing at all on every target.
 * - The content jar exports with zero errors and warnings, holds the definitions (valid), and its
 *   SHA-256 is pinned per target in two time zones
 *   (`test/fixtures/<target id>/sample-plants-and-storage-jar.sha256`).
 * - The vanilla data pack (ADR 0066) leaves out the loot tables (they name the project's blocks)
 *   and the runtime layer, and keeps the vanilla tags with optional entries.
 * - With `MSM_RUNTIME_JAR` (a built `msm_runtime` jar for the selected target) and
 *   `MSM_SAMPLE_PLANTS_OUT` (a folder), the jar is also exported with the real runtime nested and
 *   written to that folder as `msm_sample_plants.jar`, next to `fabric-facts.json` for
 *   `tools/run-fabric-server`. Without them that test is skipped.
 *
 * The Java project eject of the same fixture is `sample-plants-and-storage.java.golden.test.ts`.
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
import type { Element, Json, Plugin, Project, TargetFacts } from '@msm/plugin-api';
import blocksItemsPlugin, {
  blockGeneratedBlockIds,
  blockGeneratedModelIds,
  blockItemIdOf,
} from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import { placeholderPng, type Rgb } from '@msm/plugin-library';
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
import { builtInTargets, readVendoredJson, type TargetBundle } from '@msm/targets';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createFabricContentJarExporter,
  createMemorySink,
  createZipSink,
  dataPackExporter,
  type FabricContentJarOptions,
  MOD_ONLY_REFERENCE,
  modOnlyIdsOf,
  nestedRuntimePath,
  resourcePackExporter,
  runExport,
  vanillaSafeExporter,
} from '../src/index';
import { defaultTarget, selectedTarget } from './selected-target';

// Expanding and exporting a project of some sixty blocks takes a few seconds (B368, B377).
vi.setConfig({ testTimeout: 60_000 });

const update = process.env.UPDATE_GOLDENS === '1';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, 'fixtures');
const sampleRoot = join(here, '..', '..', '..', 'fixtures', 'sample-plants-and-storage');
const NAMESPACE = 'msm_sample_plants';
const PROJECT_NAME = 'MSM Sample Plants and Storage';
const NOW = '2026-11-22T00:00:00.000Z';
/** Files of the fixture that the test does not generate. */
const HAND_WRITTEN = new Set(['README.md']);

/** Two zones on opposite sides of the date line, so a local-time leak changes the bytes. */
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;

/** The plugins the sample needs, in the app's registration order. */
const PLUGINS: readonly Plugin[] = [resourcePackPlugin, dataPackPlugin, blocksItemsPlugin];
const VALIDATORS = PLUGINS.flatMap((plugin) => plugin.contributes.validators ?? []);

const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);

const meta = { msmVersion: '1.5.2', plugins: ['msm.blocks-items', 'msm.datapack'] };
const stubRuntimeJar = utf8.encode('PK stub msm_runtime jar for the sample-plants golden');

// The project -----------------------------------------------------------------------------

interface SampleElement {
  id: string;
  kind: string;
  data: Json;
}

interface SampleAsset {
  /** Path under the namespace's assets, such as `textures/block/bronze.png`. */
  path: string;
  bytes: Uint8Array;
}

type JsonRecord = { [key: string]: Json };
type Pattern = Parameters<typeof placeholderPng>[0];

const ns = (path: string): string => `${NAMESPACE}:${path}`;
const tex = (path: string): string => ns(`block/${path}`);

const breakable = (hardness: number, extra: JsonRecord = {}): JsonRecord => ({
  'msm:breakable': { hardness, resistance: hardness, ...extra },
});

const block = (path: string, data: JsonRecord): SampleElement => ({
  id: ns(path),
  kind: 'msm:block',
  data: { format: 1, loot: 'self', ...data },
});

const PLANTS: readonly SampleElement[] = [
  block('sea_ribbon', {
    type: 'growing_plant',
    display_name: 'Sea Ribbon',
    needs_water: true,
    sound_type: 'grass',
    textures: { head: tex('sea_ribbon'), body: tex('sea_ribbon_plant') },
    components: breakable(0),
  }),
  block('glow_vine', {
    type: 'growing_plant',
    display_name: 'Glow Vine',
    direction: 'down',
    berries: { item: ns('glow_vine_berries'), light: 14 },
    sound_type: 'grass',
    textures: {
      head: tex('glow_vine'),
      body: tex('glow_vine_plant'),
      head_berries: tex('glow_vine_berries'),
      body_berries: tex('glow_vine_plant_berries'),
      item: ns('item/glow_vine_berries'),
    },
    item: { id: ns('glow_vine_berries') },
    components: breakable(0),
  }),
  block('climbing_ivy', {
    type: 'growing_plant',
    display_name: 'Climbing Ivy',
    climbable: true,
    sound_type: 'grass',
    textures: { head: tex('climbing_ivy'), body: tex('climbing_ivy_plant') },
    components: breakable(0),
  }),
  block('dune_reed', {
    type: 'column_plant',
    display_name: 'Dune Reed',
    style: 'cane',
    sound_type: 'grass',
    textures: { all: tex('dune_reed') },
    components: breakable(0),
  }),
  block('spine_cactus', {
    type: 'column_plant',
    display_name: 'Spine Cactus',
    style: 'cactus',
    max_height: 4,
    touch_damage: 2,
    sound_type: 'wool',
    textures: {
      side: tex('spine_cactus_side'),
      top: tex('spine_cactus_top'),
      bottom: tex('spine_cactus_top'),
    },
    components: breakable(0.4),
  }),
  block('reed_bamboo', {
    type: 'column_plant',
    display_name: 'Reed Bamboo',
    style: 'bamboo',
    sound_type: 'bamboo',
    textures: {
      stalk: tex('reed_bamboo'),
      leaves_small: tex('reed_bamboo_leaves'),
      leaves_large: tex('reed_bamboo_leaves'),
      shoot: tex('reed_bamboo_shoot'),
    },
    components: breakable(1, { tool: 'axe' }),
  }),
  block('glow_moss', {
    type: 'multiface',
    display_name: 'Glow Moss',
    light: 7,
    sound_type: 'grass',
    textures: { texture: tex('glow_moss') },
    components: breakable(0.2),
  }),
  block('wide_leaf', {
    type: 'dripleaf',
    display_name: 'Wide Leaf',
    size: 'big',
    sound_type: 'grass',
    textures: {
      top: tex('wide_leaf_top'),
      side: tex('wide_leaf_side'),
      tip: tex('wide_leaf_side'),
      stem: tex('wide_leaf_stem'),
    },
    components: breakable(0.1, { tool: 'axe' }),
  }),
  block('small_wide_leaf', {
    type: 'dripleaf',
    display_name: 'Small Wide Leaf',
    size: 'small',
    grows_into: ns('wide_leaf'),
    sound_type: 'grass',
    textures: {
      top: tex('wide_leaf_top'),
      side: tex('wide_leaf_side'),
      stem_top: tex('wide_leaf_stem'),
    },
    components: breakable(0.1, { tool: 'axe' }),
  }),
  block('clay_planter', {
    type: 'flower_pot',
    display_name: 'Clay Planter',
    plants: ['minecraft:dandelion', 'minecraft:poppy', 'minecraft:oak_sapling'],
    sound_type: 'stone',
    textures: { pot: tex('clay_planter'), item: 'minecraft:item/flower_pot' },
    components: breakable(0),
  }),
  block('clay_planter_grass', {
    type: 'potted_plant',
    display_name: 'Grass in a Clay Planter',
    plant: 'minecraft:short_grass',
    pot: ns('clay_planter'),
    textures: { plant: 'minecraft:block/short_grass' },
    item: false,
    components: breakable(0),
  }),
];

/** The six weathering types of ADR 0104 D1, with the fields each needs. */
const BRONZE_TYPES: readonly [string, JsonRecord][] = [
  ['rod', {}],
  ['button', { set_type: 'copper' }],
  ['pressure_plate', { set_type: 'copper', weighted_max: 15 }],
  ['fence', {}],
  ['fence_gate', { wood_type: 'oak' }],
  ['wall', {}],
];
const TITLES: Record<string, string> = {
  rod: 'Rod',
  button: 'Button',
  pressure_plate: 'Pressure Plate',
  fence: 'Fence',
  fence_gate: 'Fence Gate',
  wall: 'Wall',
};
const bronzeHard = (): JsonRecord => breakable(3, { tool: 'pickaxe' });

const BRONZE: readonly SampleElement[] = BRONZE_TYPES.flatMap(([type, fields]) => [
  block(`bronze_${type}`, {
    type,
    display_name: `Bronze ${TITLES[type]}`,
    sound_type: 'copper',
    ...fields,
    textures: { texture: tex('bronze') },
    components: {
      ...bronzeHard(),
      'msm:weathering': { stage: 'unaffected', next: ns(`exposed_bronze_${type}`) },
      'msm:waxable': { into: ns(`waxed_bronze_${type}`) },
    },
  }),
  block(`exposed_bronze_${type}`, {
    type,
    display_name: `Exposed Bronze ${TITLES[type]}`,
    sound_type: 'copper',
    ...fields,
    textures: { texture: tex('exposed_bronze') },
    components: { ...bronzeHard(), 'msm:weathering': { stage: 'exposed' } },
  }),
  block(`waxed_bronze_${type}`, {
    type,
    display_name: `Waxed Bronze ${TITLES[type]}`,
    sound_type: 'copper',
    ...fields,
    textures: { texture: tex('bronze') },
    components: bronzeHard(),
  }),
]);

const chestTextures = (name: string, front = `${name}_front`): JsonRecord => ({
  front: tex(front),
  side: tex(name),
  top: tex(name),
});

const STORAGE: readonly SampleElement[] = [
  block('twin_crate', {
    type: 'horizontal',
    display_name: 'Twin Crate',
    sound_type: 'wood',
    textures: chestTextures('twin_crate'),
    components: {
      ...breakable(2.5, { tool: 'axe' }),
      'msm:container': { double: true, layout: 'chest', rows: 3 },
    },
  }),
  block('private_crate', {
    display_name: 'Private Crate',
    sound_type: 'stone',
    model: ns('block/private_crate'),
    components: {
      ...breakable(3.5, { tool: 'pickaxe' }),
      'msm:container': { layout: 'chest', per_player: true, rows: 3 },
    },
  }),
  block('sea_crate', {
    display_name: 'Sea Crate',
    sound_type: 'wood',
    model: ns('block/sea_crate'),
    components: {
      ...breakable(2.5, { tool: 'axe' }),
      'msm:container': { layout: 'chest', rows: 2 },
      'msm:waterloggable': {},
    },
  }),
  block('bronze_chest', {
    type: 'horizontal',
    display_name: 'Bronze Chest',
    sound_type: 'copper',
    textures: chestTextures('bronze', 'bronze_chest_front'),
    components: {
      ...bronzeHard(),
      'msm:container': { double: true, layout: 'chest', rows: 3 },
      'msm:weathering': { stage: 'unaffected', next: ns('exposed_bronze_chest') },
      'msm:waxable': { into: ns('waxed_bronze_chest') },
    },
  }),
  block('exposed_bronze_chest', {
    type: 'horizontal',
    display_name: 'Exposed Bronze Chest',
    sound_type: 'copper',
    textures: chestTextures('exposed_bronze', 'exposed_bronze_chest_front'),
    components: {
      ...bronzeHard(),
      'msm:container': { double: true, layout: 'chest', rows: 3 },
      'msm:weathering': { stage: 'exposed' },
    },
  }),
  block('waxed_bronze_chest', {
    type: 'horizontal',
    display_name: 'Waxed Bronze Chest',
    sound_type: 'copper',
    textures: chestTextures('bronze', 'bronze_chest_front'),
    components: {
      ...bronzeHard(),
      'msm:container': { double: true, layout: 'chest', rows: 3 },
    },
  }),
];

/** The amethyst sounds `chime_stone` breaks, steps and is placed with (ADR 0105 D1). */
const CHIME_SOUNDS = {
  break: 'minecraft:block.amethyst_block.break',
  step: 'minecraft:block.amethyst_block.step',
  place: 'minecraft:block.amethyst_block.place',
} as const;
/** The creaky door's own set type sounds (ADR 0105 D2). */
const DOOR_SOUNDS = {
  open: 'minecraft:block.iron_door.open',
  close: 'minecraft:block.chest.close',
} as const;

const SOUNDS_AND_PAIRS: readonly SampleElement[] = [
  block('chime_stone', {
    display_name: 'Chime Stone',
    sound_type: 'stone',
    block_sounds: { ...CHIME_SOUNDS, volume: 0.8 },
    model: ns('block/chime_stone'),
    components: breakable(1.5, { tool: 'pickaxe' }),
  }),
  block('creaky_door', {
    type: 'door',
    display_name: 'Creaky Door',
    set_type: { base: 'iron', can_open_by_hand: true, sounds: { ...DOOR_SOUNDS } },
    textures: {
      top: tex('creaky_door_top'),
      bottom: tex('creaky_door_bottom'),
    },
    components: breakable(5, { tool: 'pickaxe' }),
  }),
  block('loam', {
    display_name: 'Loam',
    sound_type: 'gravel',
    model: ns('block/loam'),
    components: {
      ...breakable(0.5, { tool: 'shovel' }),
      'msm:flattenable': { into: ns('loam_path') },
      'msm:tillable': { into: ns('loam_farmland'), drops: 'minecraft:stick' },
    },
  }),
  block('loam_path', {
    display_name: 'Loam Path',
    sound_type: 'gravel',
    model: ns('block/loam_path'),
    components: breakable(0.65, { tool: 'shovel' }),
  }),
  block('loam_farmland', {
    display_name: 'Loam Farmland',
    sound_type: 'gravel',
    model: ns('block/loam_farmland'),
    components: breakable(0.6, { tool: 'shovel' }),
  }),
];

/** The library's template `msm_vanilla_block_rules` (B518): no vanilla pair is replaced. */
const FARM_RULES: SampleElement = {
  id: ns('farm_rules'),
  kind: 'msm:vanilla_block_rules',
  data: {
    format: 1,
    strip: [
      { block: 'minecraft:mossy_cobblestone', into: 'minecraft:cobblestone' },
      { block: 'minecraft:mossy_stone_bricks', into: 'minecraft:stone_bricks' },
    ],
    flatten: [{ block: 'minecraft:mud', into: 'minecraft:packed_mud' }],
    till: [
      { block: 'minecraft:moss_block', into: 'minecraft:dirt', drops: 'minecraft:moss_carpet' },
    ],
    burn: [
      { block: 'minecraft:brown_mushroom_block', burn_odds: 5, ignite_odds: 5 },
      { block: 'minecraft:red_mushroom_block', burn_odds: 5, ignite_odds: 5 },
    ],
  },
};

/** The plain blocks, drawn by a cube model over `block/<name>`. */
const MODEL_NAMES = [
  'private_crate',
  'sea_crate',
  'chime_stone',
  'loam',
  'loam_path',
  'loam_farmland',
];
const cubeModel = (name: string): SampleElement => ({
  id: ns(`block/${name}`),
  kind: 'minecraft:model',
  data: { parent: 'minecraft:block/cube_all', textures: { all: tex(name) } },
});

const SAMPLE_ELEMENTS: readonly SampleElement[] = [
  {
    id: ns('mod'),
    kind: 'msm:mod',
    data: {
      mod_id: NAMESPACE,
      version: '1.0.0',
      name: PROJECT_NAME,
      description:
        'Sample plants and storage: growing, column, multiface and dripleaf plants, a flower pot of its own, bronze that ages like copper on six more types, double, per-player, waterlogged and ageing chests, own block and door sounds, and shovel, hoe and vanilla block rules.',
      authors: ['MCSuperMods'],
      licence: 'MIT',
    },
  },
  ...PLANTS,
  ...BRONZE,
  ...STORAGE,
  ...SOUNDS_AND_PAIRS,
  FARM_RULES,
  ...MODEL_NAMES.map(cubeModel),
];

const COLOURS: Record<string, Rgb> = {
  ribbon: [52, 130, 92],
  vine: [70, 110, 50],
  berries: [236, 170, 60],
  ivy: [60, 120, 110],
  reed: [150, 180, 90],
  cactus: [70, 140, 70],
  bamboo: [120, 160, 60],
  moss: [110, 200, 170],
  leaf: [96, 160, 56],
  clay: [170, 96, 70],
  bronze: [176, 120, 64],
  exposedBronze: [150, 130, 96],
  crate: [150, 110, 70],
  privateCrate: [90, 70, 110],
  seaCrate: [70, 110, 140],
  chime: [150, 110, 190],
  door: [120, 120, 130],
  loam: [120, 84, 56],
};

const texture = (path: string, pattern: Pattern, colour: Rgb): SampleAsset => ({
  path: `textures/${path}.png`,
  bytes: placeholderPng(pattern, { colour }),
});

const SAMPLE_ASSETS: readonly SampleAsset[] = [
  texture('block/sea_ribbon', 'sapling', COLOURS.ribbon as Rgb),
  texture('block/sea_ribbon_plant', 'sapling', COLOURS.ribbon as Rgb),
  texture('block/glow_vine', 'sapling', COLOURS.vine as Rgb),
  texture('block/glow_vine_plant', 'sapling', COLOURS.vine as Rgb),
  texture('block/glow_vine_berries', 'produce', COLOURS.berries as Rgb),
  texture('block/glow_vine_plant_berries', 'produce', COLOURS.berries as Rgb),
  texture('item/glow_vine_berries', 'produce', COLOURS.berries as Rgb),
  texture('block/climbing_ivy', 'sapling', COLOURS.ivy as Rgb),
  texture('block/climbing_ivy_plant', 'sapling', COLOURS.ivy as Rgb),
  texture('block/dune_reed', 'sapling', COLOURS.reed as Rgb),
  texture('block/spine_cactus_side', 'pillar_side', COLOURS.cactus as Rgb),
  texture('block/spine_cactus_top', 'pillar_top', COLOURS.cactus as Rgb),
  texture('block/reed_bamboo', 'pillar_side', COLOURS.bamboo as Rgb),
  texture('block/reed_bamboo_leaves', 'leaves', COLOURS.bamboo as Rgb),
  texture('block/reed_bamboo_shoot', 'sapling', COLOURS.bamboo as Rgb),
  texture('block/glow_moss', 'leaves', COLOURS.moss as Rgb),
  texture('block/wide_leaf_top', 'leaves', COLOURS.leaf as Rgb),
  texture('block/wide_leaf_side', 'leaves', COLOURS.leaf as Rgb),
  texture('block/wide_leaf_stem', 'sapling', COLOURS.leaf as Rgb),
  texture('block/clay_planter', 'bricks', COLOURS.clay as Rgb),
  texture('block/bronze', 'polished_stone', COLOURS.bronze as Rgb),
  texture('block/exposed_bronze', 'polished_stone', COLOURS.exposedBronze as Rgb),
  texture('block/bronze_chest_front', 'block_front', COLOURS.bronze as Rgb),
  texture('block/exposed_bronze_chest_front', 'block_front', COLOURS.exposedBronze as Rgb),
  texture('block/twin_crate', 'planks', COLOURS.crate as Rgb),
  texture('block/twin_crate_front', 'block_front', COLOURS.crate as Rgb),
  texture('block/private_crate', 'polished_stone', COLOURS.privateCrate as Rgb),
  texture('block/sea_crate', 'planks', COLOURS.seaCrate as Rgb),
  texture('block/chime_stone', 'stone', COLOURS.chime as Rgb),
  texture('block/creaky_door_top', 'door_top', COLOURS.door as Rgb),
  texture('block/creaky_door_bottom', 'door_bottom', COLOURS.door as Rgb),
  texture('block/loam', 'stone', COLOURS.loam as Rgb),
  texture('block/loam_path', 'polished_stone', COLOURS.loam as Rgb),
  texture('block/loam_farmland', 'bricks', COLOURS.loam as Rgb),
];

const nameOf = (id: string): string => id.split(':')[1] as string;
const BLOCK_ELEMENTS = SAMPLE_ELEMENTS.filter((entry) => entry.kind === 'msm:block');
const BLOCK_NAMES = BLOCK_ELEMENTS.map((entry) => nameOf(entry.id));
/** The companions lowering generates (strand bodies, the shoot, the stem, the potted plants). */
const COMPANIONS = BLOCK_ELEMENTS.flatMap((entry) =>
  blockGeneratedBlockIds(entry.id, entry.data).map(nameOf),
);
/** The block items, by their own ids (the vine's item is its berries; the potted grass has none). */
const BLOCK_ITEMS = BLOCK_ELEMENTS.flatMap((entry) => {
  const id = blockItemIdOf(entry.id, entry.data);
  return id === undefined ? [] : [id];
});

/** What the runtime registers: every block element (companions are not counted) and the block items. */
const EXPECTED_BLOCKS = BLOCK_NAMES.length;
const EXPECTED_ITEMS = BLOCK_ITEMS.length;

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

/** The project as the app's session validates and exports it: expanded, with no problems. */
async function expandSample(target: TargetFacts): Promise<Project> {
  const expansion = await expandProject(await loadSample(), PLUGINS, target);
  expect(expansion.problems).toEqual([]);
  return expansion.project;
}

/**
 * The project's own ids per registry, as the app derives them: element ids under their kind's
 * registry, each block's item, companions and generated models, and the namespace's textures.
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
      for (const id of blockGeneratedBlockIds(element.id, element.data as Json)) add('block', id);
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
  ids: Record<string, string[]>;
}

async function contextFor(bundle: TargetBundle, project: Project): Promise<TargetContext> {
  const read = (key: Parameters<typeof readVendoredJson>[1]) =>
    readVendoredJson(bundle, key, nodeReadFile);
  const [symbols, vanilla] = await Promise.all([
    read('vanillaMcdocSymbols'),
    read('mcmetaRegistries'),
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

describe('sample plants and storage project', () => {
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

  it('loads with zero problems and holds every new type, the pot, bronze, the storage, the sounds and the pairs', async () => {
    const project = await loadSample();
    expect(project.name).toBe(PROJECT_NAME);
    const types = elementsOf(project)
      .filter((element) => element.kind === 'msm:block')
      .map((element) => (element.data as JsonRecord).type)
      .filter((type): type is string => typeof type === 'string');
    for (const type of [
      'growing_plant',
      'column_plant',
      'multiface',
      'dripleaf',
      'flower_pot',
      'potted_plant',
      'rod',
      'button',
      'pressure_plate',
      'fence',
      'fence_gate',
      'wall',
      'door',
      'horizontal',
    ]) {
      expect(types, type).toContain(type);
    }
    expect([...COMPANIONS].sort()).toEqual([
      'clay_planter_dandelion',
      'clay_planter_oak_sapling',
      'clay_planter_poppy',
      'climbing_ivy_plant',
      'glow_vine_plant',
      'reed_bamboo_shoot',
      'sea_ribbon_plant',
      'wide_leaf_stem',
    ]);
    expect(BLOCK_ITEMS).toContain(ns('glow_vine_berries'));
    expect(BLOCK_ITEMS).not.toContain(ns('clay_planter_grass'));
    const components = (id: string): JsonRecord => dataOf(project, id).components as JsonRecord;
    expect(components(ns('twin_crate'))['msm:container']).toMatchObject({ double: true });
    expect(components(ns('private_crate'))['msm:container']).toMatchObject({ per_player: true });
    expect(components(ns('sea_crate'))['msm:waterloggable']).toEqual({});
    expect(components(ns('bronze_chest'))['msm:weathering']).toMatchObject({
      next: ns('exposed_bronze_chest'),
    });
    expect(dataOf(project, ns('creaky_door')).set_type).toMatchObject({ base: 'iron' });
    const kinds = new Set(elementsOf(project).map((element) => element.kind));
    expect([...kinds].sort()).toEqual([
      'minecraft:model',
      'msm:block',
      'msm:mod',
      'msm:vanilla_block_rules',
    ]);
    expect(project.namespaces[0]?.assets.map((asset) => asset.path).sort()).toEqual(
      SAMPLE_ASSETS.map((asset) => asset.path).sort(),
    );
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sample plants and storage export (%s)',
  (_id, bundle) => {
    const { target } = bundle;
    let context: TargetContext;

    beforeAll(async () => {
      context = await contextFor(bundle, await loadSample());
    }, 120_000);

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
        exporter: createFabricContentJarExporter(factory),
        sink,
        readAsset: (namespace, path) => sampleFs.readFile(`assets/${namespace}/${path}`),
        meta,
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

    it('expands with no problems and passes every project validator with no problems at all', async () => {
      const expanded = await expandSample(target);
      const elements = elementsOf(expanded);
      const found = (
        await Promise.all(
          VALIDATORS.map((validator) =>
            validator.validate({ elements, target, registry: context.registries }),
          ),
        )
      ).flat();
      expect(found).toEqual([]);
    });

    it('holds the definitions (valid), the companions and the pictures', async () => {
      const files = unzipSync(await exportJar());
      const paths = Object.keys(files).sort();
      const resource = target.folders.resource;
      const data = target.folders.data;
      const definitions: [string, string][] = [
        ...BLOCK_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/block/${name}.json`,
          MSM_SCHEMA_REFS.blockDefinition,
        ]),
        [`msm/${NAMESPACE}/vanilla_block_rules/farm_rules.json`, MSM_SCHEMA_REFS.vanillaBlockRules],
      ];
      expect(paths.filter((path) => path.startsWith('msm/'))).toEqual(
        definitions.map(([path]) => path).sort(),
      );
      for (const path of [
        'fabric.mod.json',
        'msm.export.json',
        `assets/${NAMESPACE}/${resource.lang}/en_us.json`,
        ...[...BLOCK_NAMES, ...COMPANIONS].map(
          (name) => `assets/${NAMESPACE}/blockstates/${name}.json`,
        ),
        ...SAMPLE_ASSETS.map((asset) => `assets/${NAMESPACE}/${asset.path}`),
        `data/${NAMESPACE}/${data.loot_table}/blocks/clay_planter_poppy.json`,
      ]) {
        expect(paths, path).toContain(path);
      }
      // Where block sounds are data, a block sound set per block with block_sounds (and the door's).
      const soundSets = paths.filter((path) => path.includes('/block_sound_set/'));
      expect(soundSets.length > 0).toBe(target.blocks?.soundModel === 'block_sound_set');

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

      const definition = (name: string): JsonRecord =>
        json(`msm/${NAMESPACE}/block/${name}.json`) as JsonRecord;
      expect(definition('bronze_rod').components).toMatchObject({
        'msm:weathering': { stage: 'unaffected', next: ns('exposed_bronze_rod') },
        'msm:waxable': { into: ns('waxed_bronze_rod') },
      });
      expect(definition('twin_crate').components).toMatchObject({
        'msm:container': { double: true },
      });
      expect(definition('clay_planter').plants).toEqual([
        'minecraft:dandelion',
        'minecraft:poppy',
        'minecraft:oak_sapling',
      ]);
      const lang = json(`assets/${NAMESPACE}/${resource.lang}/en_us.json`) as JsonRecord;
      for (const name of BLOCK_NAMES) {
        expect(lang[`block.${NAMESPACE}.${name}`], name).toBeDefined();
      }
      const modJson = json('fabric.mod.json') as { id: string; depends: Record<string, string> };
      expect(modJson.id).toBe(NAMESPACE);
      expect(modJson.depends.msm_runtime).toBe(`>=${meta.msmVersion}`);
      const runtimePath = nestedRuntimePath(meta.msmVersion);
      expect(files[runtimePath]).toEqual(stubRuntimeJar);
    });

    it('leaves out the loot tables and the runtime layer in the vanilla data pack', async () => {
      const project = await expandSample(target);
      const sink = createMemorySink();
      const report = await runExport({
        project,
        registry,
        target,
        schemaIndex: context.schemaIndex,
        registries: context.registries,
        exporter: vanillaSafeExporter(dataPackExporter, modOnlyIdsOf(context.ids)),
        sink,
        readAsset: (namespace, path) => sampleFs.readFile(`assets/${namespace}/${path}`),
        meta,
      });
      expect(
        report.problems.filter(
          (problem) => problem.severity !== 'info' && problem.code !== MOD_ONLY_REFERENCE,
        ),
      ).toEqual([]);
      expect(report.ok).toBe(true);
      const paths = [...sink.files().keys()].sort();
      const loot = target.folders.data.loot_table;
      expect(paths.some((path) => path.startsWith('msm/'))).toBe(false);
      expect(paths.some((path) => path.includes(`/${loot}/`))).toBe(false);
      const tags = target.folders.data.tags;
      const pots = JSON.parse(
        utf8.decode(
          sink.files().get(`data/minecraft/${tags}/block/flower_pots.json`) as Uint8Array,
        ),
      ) as { values: Json[] };
      expect(pots.values).toContainEqual({ id: ns('clay_planter_poppy'), required: false });
      const left = report.problems
        .filter((problem) => problem.code === MOD_ONLY_REFERENCE)
        .map((problem) => problem.file);
      expect(left).toContain(`data/${NAMESPACE}/${loot}/blocks/twin_crate.json`);
    });

    it('keeps the pictures in the vanilla resource pack', async () => {
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
      for (const asset of SAMPLE_ASSETS) {
        expect(paths).toContain(`assets/${NAMESPACE}/${asset.path}`);
      }
      for (const name of [...BLOCK_NAMES, ...COMPANIONS]) {
        expect(paths).toContain(`assets/${NAMESPACE}/blockstates/${name}.json`);
      }
      expect(paths.some((path) => path.startsWith('msm/'))).toBe(false);
    });

    describe('content jar', () => {
      const hashFile = join(fixturesRoot, target.id, 'sample-plants-and-storage-jar.sha256');
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
    const outDir = process.env.MSM_SAMPLE_PLANTS_OUT;
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
