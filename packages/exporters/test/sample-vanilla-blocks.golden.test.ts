/**
 * Golden over the committed vanilla blocks project (`fixtures/sample-vanilla-blocks`, ADRs
 * 0094 to 0096 and 0101, plan B462): namespace `msm_sample_vanilla_blocks`, an `msm:mod` and one
 * of each vanilla-like block type of batch 1, each different enough for a parity test to tell
 * apart:
 *
 * - the twenty block types of ADR 0094 with their companions: `honey_cake` (cake, `on_eat`),
 *   `blue_berry_bush` (berry bush; its item is the berries), `tall_bluebell` (tall plant),
 *   `potted_grass_tuft` (potted plant, no item), `ivy` (vine), `glow_pod` (sea pickle),
 *   `moss_rug` (carpet), `ash_layer` (layers), `coffee_pod` (cocoa; its item is the beans),
 *   `tallow_candle` (candle), `cosy_bed` (bed), `rope_ladder` (ladder), `ember_torch` (torch
 *   with a blue flame; companion `ember_torch_wall`), `paper_lantern` (lantern), `brass_chain`
 *   (chain), `crystal_rod` (rod), `cedar_sign` and `cedar_hanging_sign` (spruce sounds;
 *   companions `_wall`; writing-screen pictures as assets), `gourd_stem` (stem of the `gourd`
 *   block; its item is the seeds; companion `gourd_stem_attached`) and `bamboo_frame`
 *   (scaffolding);
 * - `sea_lamp`, a plain block that holds water and gives light;
 * - a four-stage weathering set (`tin`, `exposed_tin`, `weathered_tin`, `oxidized_tin`) with a
 *   waxed copy of each stage (blocks-items golden `weathering-tin-set`);
 * - a bag of each layout (`satchel` chest of two rows opened with sneak and use, `seed_pouch`
 *   hopper, `tool_kit` dispenser) and a bundle (`charm_bundle`);
 * - two commands: `/greet` (alias `/hiya`, everyone, an event and a message back) and
 *   `/kit <who> <count>` (operators, a macro function giving candles);
 * - the creative tab `vanilla_blocks` (`as_listed`), listing every item but the tin set, and the
 *   tab `tin_blocks` (`by_name`, B464a), listing the eight tin blocks by display name, whose order
 *   ("Block of Tin" first) differs from their registration order.
 *
 * Pictures are MSM's own (the library's placeholder pictures, `placeholderPng`, and a sign
 * writing-screen board drawn here); none is vanilla's.
 *
 * - The fixture equals the project built from {@link SAMPLE_ELEMENTS} and {@link SAMPLE_ASSETS}
 *   now; `UPDATE_GOLDENS=1` rewrites it (the README is hand-written).
 * - Every element validates with zero problems, the plugins' project validators report nothing
 *   on every target, and the function passes the offline mcfunction checker.
 * - The content jar exports with zero errors and warnings, holds the definitions (valid) and its
 *   SHA-256 is pinned per target in two time zones
 *   (`test/fixtures/<target id>/sample-vanilla-blocks-jar.sha256`).
 * - The vanilla data pack (vanilla pack safety, ADR 0066) leaves out the loot tables with
 *   `export.mod-only-reference` and keeps the macro function with `export.mod-only-function`;
 *   the vanilla resource pack keeps the pictures and the writing-screen pictures.
 * - With `MSM_RUNTIME_JAR` (a built `msm_runtime` jar for the selected target) and
 *   `MSM_SAMPLE_VANILLA_BLOCKS_OUT` (a folder), the jar is also exported with the real runtime
 *   nested and written to that folder as `msm_sample_vanilla_blocks.jar`, next to
 *   `fabric-facts.json` for `tools/run-fabric-server`. Without them that test is skipped.
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
import blocksItemsPlugin, {
  blockGeneratedBlockIds,
  blockGeneratedModelIds,
  blockItemIdOf,
  bundleModelIds,
} from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import {
  encodePng,
  COLOURS as LIBRARY_COLOURS,
  placeholderPng,
  type Rgb,
} from '@msm/plugin-library';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import scriptingPlugin from '@msm/plugin-scripting';
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
  commandLiteralsOf,
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
  vanillaSafeExporter,
} from '../src/index';
import { defaultTarget, selectedTarget } from './selected-target';

const update = process.env.UPDATE_GOLDENS === '1';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, 'fixtures');
const sampleRoot = join(here, '..', '..', '..', 'fixtures', 'sample-vanilla-blocks');
const NAMESPACE = 'msm_sample_vanilla_blocks';
const PROJECT_NAME = 'MSM Sample Vanilla Blocks';
const NOW = '2026-11-15T00:00:00.000Z';
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
  msmVersion: '1.5.1',
  plugins: ['msm.blocks-items', 'msm.datapack', 'msm.scripting'],
};
const stubRuntimeJar = utf8.encode('PK stub msm_runtime jar for the sample-vanilla-blocks golden');

// The project -----------------------------------------------------------------------------

interface SampleElement {
  id: string;
  kind: string;
  data: Json;
}

interface SampleAsset {
  /** Path under the namespace's assets, such as `textures/block/ivy.png`. */
  path: string;
  bytes: Uint8Array;
}

type JsonRecord = { [key: string]: Json };
type Pattern = Parameters<typeof placeholderPng>[0];

const ns = (path: string): string => `${NAMESPACE}:${path}`;

const COLOURS = {
  cake: [238, 196, 92] as Rgb,
  sponge: [214, 168, 110] as Rgb,
  berry: [70, 96, 210] as Rgb,
  leaf: LIBRARY_COLOURS.jade,
  bluebell: [96, 118, 224] as Rgb,
  moss: [86, 128, 50] as Rgb,
  pod: [150, 232, 120] as Rgb,
  ash: [150, 146, 140] as Rgb,
  coffee: [122, 76, 44] as Rgb,
  tallow: [236, 222, 184] as Rgb,
  blanket: [70, 150, 200] as Rgb,
  rope: [176, 140, 90] as Rgb,
  flame: [92, 200, 236] as Rgb,
  paper: [236, 214, 160] as Rgb,
  brass: [196, 160, 64] as Rgb,
  crystal: [196, 236, 244] as Rgb,
  cedar: [150, 94, 60] as Rgb,
  gourd: [212, 150, 48] as Rgb,
  bamboo: [196, 184, 96] as Rgb,
  sea: [60, 170, 180] as Rgb,
  tin: [176, 182, 190] as Rgb,
  patina: [92, 170, 140] as Rgb,
  satchel: [140, 92, 52] as Rgb,
  pouch: [120, 140, 60] as Rgb,
  kit: [180, 60, 52] as Rgb,
  charm: [168, 92, 176] as Rgb,
} as const satisfies Record<string, Rgb>;

const TAB = ns('vanilla_blocks');
/** Every item but the tin set joins the project's first tab (`as_listed`: registration order). */
const IN_TAB = { creative_tab: TAB };
/** The tin set's tab (`by_name`, B464a): parity checks the sort against the registration order. */
const TIN_TAB = ns('tin_blocks');
const IN_TIN_TAB = { creative_tab: TIN_TAB };

const texture = (path: string, pattern: Pattern, colour: Rgb): SampleAsset => ({
  path: `textures/${path}.png`,
  bytes: placeholderPng(pattern, { colour }),
});

/** A mix of two colours, `amount` of the way from `from` to `to`. */
const mix = (from: Rgb, to: Rgb, amount: number): Rgb => {
  const channel = (i: 0 | 1 | 2): number => Math.round(from[i] + (to[i] - from[i]) * amount);
  return [channel(0), channel(1), channel(2)];
};

/**
 * A standing sign's writing-screen picture, 24 by 26 pixels (B440 S1): a board of four planks
 * over a post, in shades of `wood`, drawn here.
 */
function signGuiPng(wood: Rgb): Uint8Array {
  const width = 24;
  const height = 26;
  const pixels = new Uint8Array(width * height * 4);
  const dark = mix(wood, [0, 0, 0], 0.35);
  const light = mix(wood, [255, 255, 255], 0.2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const board = y < 13;
      const post = !board && x >= 10 && x <= 13;
      if (!board && !post) continue;
      let colour: Rgb = wood;
      if (board && (y % 4 === 3 || x === 23 || y === 12)) colour = dark;
      if (board && (x === 0 || y === 0)) colour = light;
      if (post && x === 13) colour = dark;
      if (post && x === 10) colour = light;
      const at = (y * width + x) * 4;
      pixels.set([colour[0], colour[1], colour[2], 255], at);
    }
  }
  return encodePng(pixels, width, height);
}

const HONEY_CAKE = ns('honey_cake');
const BLUE_BERRY_BUSH = ns('blue_berry_bush');
const BLUE_BERRIES = ns('blue_berries');
const TALL_BLUEBELL = ns('tall_bluebell');
const POTTED_GRASS = ns('potted_grass_tuft');
const IVY = ns('ivy');
const GLOW_POD = ns('glow_pod');
const MOSS_RUG = ns('moss_rug');
const ASH_LAYER = ns('ash_layer');
const COFFEE_POD = ns('coffee_pod');
const COFFEE_BEANS = ns('coffee_beans');
const TALLOW_CANDLE = ns('tallow_candle');
const COSY_BED = ns('cosy_bed');
const ROPE_LADDER = ns('rope_ladder');
const EMBER_TORCH = ns('ember_torch');
const PAPER_LANTERN = ns('paper_lantern');
const BRASS_CHAIN = ns('brass_chain');
const CRYSTAL_ROD = ns('crystal_rod');
const CEDAR_SIGN = ns('cedar_sign');
const CEDAR_HANGING_SIGN = ns('cedar_hanging_sign');
const GOURD = ns('gourd');
const GOURD_STEM = ns('gourd_stem');
const GOURD_SEEDS = ns('gourd_seeds');
const BAMBOO_FRAME = ns('bamboo_frame');
const SEA_LAMP = ns('sea_lamp');
const SATCHEL = ns('satchel');
const SEED_POUCH = ns('seed_pouch');
const TOOL_KIT = ns('tool_kit');
const CHARM_BUNDLE = ns('charm_bundle');
const GREET = ns('greet');
const KIT = ns('kit');
const GIVE_KIT = ns('give_kit');

const CAKE_EATEN = ns('honey_cake_eaten');
const SATCHEL_OPENED = ns('satchel_opened');
const SATCHEL_CLOSED = ns('satchel_closed');

/** The macro line of the `/kit` function: the runtime passes `who` and `count` (B440 S8). */
const KIT_LINE = `$give $(who) ${TALLOW_CANDLE} $(count)`;
const GREET_TEXT = 'Hello from the vanilla blocks sample!';
const KIT_TEXT = 'A kit of candles is on its way.';

/** The twenty block types of ADR 0094, in the order the sample holds them. */
const BLOCK_TYPES = [
  'cake',
  'berry_bush',
  'tall_plant',
  'potted_plant',
  'vine',
  'sea_pickle',
  'carpet',
  'layers',
  'cocoa',
  'candle',
  'bed',
  'ladder',
  'torch',
  'lantern',
  'chain',
  'rod',
  'sign',
  'hanging_sign',
  'stem',
  'scaffolding',
] as const;

const breakable = (hardness: number, extra: JsonRecord = {}): JsonRecord => ({
  'msm:breakable': { hardness, resistance: hardness, ...extra },
});

/** A cube block model over `block/<name>`. */
const blockModel = (name: string, picture = name): SampleElement => ({
  id: ns(`block/${name}`),
  kind: 'minecraft:model',
  data: { parent: 'minecraft:block/cube_all', textures: { all: ns(`block/${picture}`) } },
});

/** A flat item model over `item/<name>`. */
const itemModel = (name: string): SampleElement => ({
  id: ns(`item/${name}`),
  kind: 'minecraft:model',
  data: { parent: 'minecraft:item/generated', textures: { layer0: ns(`item/${name}`) } },
});

const block = (id: string, data: JsonRecord): SampleElement => ({
  id,
  kind: 'msm:block',
  data: { format: 1, loot: 'self', ...data },
});

const TYPE_BLOCKS: readonly SampleElement[] = [
  block(HONEY_CAKE, {
    type: 'cake',
    display_name: 'Honey Cake',
    sound_type: 'wool',
    food: { nutrition: 3, saturation: 0.3 },
    on_eat: CAKE_EATEN,
    textures: {
      top: ns('block/honey_cake_top'),
      bottom: ns('block/honey_cake_bottom'),
      side: ns('block/honey_cake_side'),
      inside: ns('block/honey_cake_inner'),
      item: ns('item/honey_cake'),
    },
    item: { max_stack_size: 1, ...IN_TAB },
    components: breakable(0.5),
    events: {
      [CAKE_EATEN]: {
        actions: [{ type: 'play_sound', sound: 'minecraft:entity.player.burp' }],
      },
    },
  }),
  block(BLUE_BERRY_BUSH, {
    type: 'berry_bush',
    display_name: 'Blue Berry Bush',
    sound_type: 'grass',
    berry: BLUE_BERRIES,
    harvest: { ripe: [1, 2], full: [2, 3] },
    textures: {
      stages: [0, 1, 2, 3].map((stage) => ns(`block/blue_berry_bush_stage${stage}`)),
    },
    item: { id: BLUE_BERRIES, ...IN_TAB },
    components: breakable(0),
  }),
  block(TALL_BLUEBELL, {
    type: 'tall_plant',
    display_name: 'Tall Bluebell',
    sound_type: 'grass',
    textures: { top: ns('block/tall_bluebell_top'), bottom: ns('block/tall_bluebell_bottom') },
    item: IN_TAB,
    components: breakable(0),
  }),
  block(POTTED_GRASS, {
    type: 'potted_plant',
    display_name: 'Potted Grass Tuft',
    plant: 'minecraft:short_grass',
    textures: { plant: ns('block/grass_tuft') },
    // The runtime gives a block without `item` a block item; a pot needs `item: false` (B445).
    item: false,
    components: breakable(0),
  }),
  block(IVY, {
    type: 'vine',
    display_name: 'Ivy',
    sound_type: 'grass',
    textures: { texture: ns('block/ivy') },
    item: IN_TAB,
    components: breakable(0.2, { tool: 'axe' }),
  }),
  block(GLOW_POD, {
    type: 'sea_pickle',
    display_name: 'Glow Pod',
    sound_type: 'slime_block',
    textures: { texture: ns('block/glow_pod') },
    item: IN_TAB,
    components: breakable(0),
  }),
  block(MOSS_RUG, {
    type: 'carpet',
    display_name: 'Moss Rug',
    sound_type: 'moss',
    textures: { texture: ns('block/moss_rug') },
    item: IN_TAB,
    components: breakable(0.1),
  }),
  block(ASH_LAYER, {
    type: 'layers',
    display_name: 'Ash',
    sound_type: 'sand',
    textures: { texture: ns('block/ash') },
    item: IN_TAB,
    components: breakable(0.1, { tool: 'shovel' }),
  }),
  block(COFFEE_POD, {
    type: 'cocoa',
    display_name: 'Coffee Pod',
    sound_type: 'wood',
    textures: {
      stages: [
        ns('block/coffee_pod_small'),
        ns('block/coffee_pod_medium'),
        ns('block/coffee_pod_ripe'),
      ],
    },
    item: { id: COFFEE_BEANS, ...IN_TAB },
    components: breakable(0.2, { tool: 'axe' }),
  }),
  block(TALLOW_CANDLE, {
    type: 'candle',
    display_name: 'Tallow Candle',
    sound_type: 'wool',
    textures: {
      candle: ns('block/tallow_candle'),
      lit: ns('block/tallow_candle_lit'),
      item: ns('item/tallow_candle'),
    },
    item: IN_TAB,
    components: breakable(0.1),
  }),
  block(COSY_BED, {
    type: 'bed',
    display_name: 'Cosy Bed',
    sound_type: 'wood',
    colour: 'light_blue',
    textures: { bed: ns('block/cosy_bed'), item: ns('item/cosy_bed') },
    item: { max_stack_size: 1, ...IN_TAB },
    components: breakable(0.2),
  }),
  block(ROPE_LADDER, {
    type: 'ladder',
    display_name: 'Rope Ladder',
    sound_type: 'ladder',
    textures: { texture: ns('block/rope_ladder') },
    item: IN_TAB,
    components: breakable(0.4, { tool: 'axe' }),
  }),
  block(EMBER_TORCH, {
    type: 'torch',
    display_name: 'Ember Torch',
    sound_type: 'wood',
    particle: 'minecraft:soul_fire_flame',
    textures: { texture: ns('block/ember_torch') },
    item: IN_TAB,
    components: breakable(0),
  }),
  block(PAPER_LANTERN, {
    type: 'lantern',
    display_name: 'Paper Lantern',
    sound_type: 'lantern',
    textures: { texture: ns('block/paper_lantern'), item: ns('item/paper_lantern') },
    item: IN_TAB,
    components: breakable(1, { tool: 'pickaxe', requires_tool: false }),
  }),
  block(BRASS_CHAIN, {
    type: 'chain',
    display_name: 'Brass Chain',
    sound_type: 'metal',
    textures: { texture: ns('block/brass_chain'), item: ns('item/brass_chain') },
    item: IN_TAB,
    components: breakable(5, { tool: 'pickaxe' }),
  }),
  block(CRYSTAL_ROD, {
    type: 'rod',
    display_name: 'Crystal Rod',
    sound_type: 'glass',
    textures: { texture: ns('block/crystal_rod') },
    item: IN_TAB,
    components: breakable(0),
  }),
  block(CEDAR_SIGN, {
    type: 'sign',
    display_name: 'Cedar Sign',
    wood_type: 'spruce',
    textures: {
      all: ns('block/cedar_planks'),
      sign: ns('gui/signs/cedar_sign'),
      item: ns('item/cedar_sign'),
    },
    item: { max_stack_size: 16, ...IN_TAB },
    components: breakable(1, { tool: 'axe' }),
  }),
  block(CEDAR_HANGING_SIGN, {
    type: 'hanging_sign',
    display_name: 'Cedar Hanging Sign',
    wood_type: 'spruce',
    textures: {
      all: ns('block/stripped_cedar_log'),
      hanging_gui: ns('gui/hanging_signs/cedar_hanging_sign'),
      item: ns('item/cedar_hanging_sign'),
    },
    item: { max_stack_size: 16, ...IN_TAB },
    components: breakable(1, { tool: 'axe' }),
  }),
  block(GOURD_STEM, {
    type: 'stem',
    display_name: 'Gourd Stem',
    sound_type: 'wood',
    fruit: GOURD,
    textures: { stem: ns('block/gourd_stem'), attached: ns('block/attached_gourd_stem') },
    item: { id: GOURD_SEEDS, ...IN_TAB },
    components: breakable(0),
  }),
  block(BAMBOO_FRAME, {
    type: 'scaffolding',
    display_name: 'Bamboo Frame',
    sound_type: 'bamboo',
    textures: {
      top: ns('block/bamboo_frame_top'),
      side: ns('block/bamboo_frame_side'),
      bottom: ns('block/bamboo_frame_bottom'),
    },
    item: IN_TAB,
    components: breakable(0),
  }),
];

/** The fruit of the gourd stem: a plain block the stem grows beside it. */
const GOURD_BLOCK = block(GOURD, {
  display_name: 'Gourd',
  model: ns('block/gourd'),
  sound_type: 'wood',
  item: IN_TAB,
  components: breakable(1, { tool: 'axe' }),
});

/** A plain lamp that holds water (ADR 0094 D8). */
const SEA_LAMP_BLOCK = block(SEA_LAMP, {
  display_name: 'Sea Lamp',
  model: ns('block/sea_lamp'),
  sound_type: 'glass',
  item: IN_TAB,
  components: {
    ...breakable(0.3),
    'msm:light_emitter': { level: 12 },
    'msm:waterloggable': {},
  },
});

/** The four stages of tin, then the waxed copy of each (blocks-items `weathering-tin-set`). */
const TIN_STAGES = ['unaffected', 'exposed', 'weathered', 'oxidized'] as const;
const tinName = (stage: (typeof TIN_STAGES)[number]): string =>
  stage === 'unaffected' ? 'tin' : `${stage}_tin`;
const tinTitle = (stage: (typeof TIN_STAGES)[number]): string =>
  ({
    unaffected: 'Block of Tin',
    exposed: 'Exposed Tin',
    weathered: 'Weathered Tin',
    oxidized: 'Oxidised Tin',
  })[stage];

const TIN_BLOCKS: readonly SampleElement[] = [
  ...TIN_STAGES.map((stage, i) => {
    const next = TIN_STAGES[i + 1];
    const name = tinName(stage);
    return block(ns(name), {
      display_name: tinTitle(stage),
      model: ns(`block/${name}`),
      sound_type: 'copper',
      item: IN_TIN_TAB,
      components: {
        ...breakable(3, { tool: 'pickaxe' }),
        'msm:weathering': next === undefined ? { stage } : { stage, next: ns(tinName(next)) },
        'msm:waxable': { into: ns(`waxed_${name}`) },
      },
    });
  }),
  ...TIN_STAGES.map((stage) => {
    const name = tinName(stage);
    return block(ns(`waxed_${name}`), {
      display_name: `Waxed ${tinTitle(stage)}`,
      model: ns(`block/${name}`),
      sound_type: 'copper',
      item: IN_TIN_TAB,
      components: breakable(3, { tool: 'pickaxe' }),
    });
  }),
];

const ITEMS: readonly SampleElement[] = [
  {
    id: SATCHEL,
    kind: 'msm:item',
    data: {
      format: 1,
      display_name: 'Satchel',
      model: ns('item/satchel'),
      max_stack_size: 1,
      ...IN_TAB,
      components: {
        'msm:item_inventory': {
          layout: 'chest',
          rows: 2,
          open: 'sneak_use',
          open_sound: 'minecraft:item.armor.equip_leather',
          close_sound: 'minecraft:item.armor.equip_leather',
          on_open: SATCHEL_OPENED,
          on_close: SATCHEL_CLOSED,
        },
      },
      events: {
        [SATCHEL_OPENED]: {
          actions: [{ type: 'play_sound', sound: 'minecraft:block.note_block.bell' }],
        },
        [SATCHEL_CLOSED]: {
          actions: [{ type: 'play_sound', sound: 'minecraft:block.note_block.bass' }],
        },
      },
    },
  },
  {
    id: SEED_POUCH,
    kind: 'msm:item',
    data: {
      format: 1,
      display_name: 'Seed Pouch',
      model: ns('item/seed_pouch'),
      max_stack_size: 1,
      ...IN_TAB,
      components: { 'msm:item_inventory': { layout: 'hopper' } },
    },
  },
  {
    id: TOOL_KIT,
    kind: 'msm:item',
    data: {
      format: 1,
      display_name: 'Tool Kit',
      model: ns('item/tool_kit'),
      max_stack_size: 1,
      ...IN_TAB,
      components: { 'msm:item_inventory': { layout: 'dispenser' } },
    },
  },
  {
    id: CHARM_BUNDLE,
    kind: 'msm:item',
    data: {
      format: 1,
      display_name: 'Charm Bundle',
      model: ns('item/charm_bundle'),
      max_stack_size: 1,
      ...IN_TAB,
      // The closed bundle is the item model; the open pictures go round the selected item.
      bundle_textures: {
        open_back: ns('item/charm_bundle_open_back'),
        open_front: ns('item/charm_bundle_open_front'),
      },
      components: { 'msm:bundle': {} },
    },
  },
];

const COMMANDS: readonly SampleElement[] = [
  {
    id: GREET,
    kind: 'msm:command',
    data: {
      format: 1,
      name: 'greet',
      aliases: ['hiya'],
      event: 'wave',
      events: {
        wave: {
          actions: [
            { type: 'play_sound', sound: 'minecraft:block.note_block.chime' },
            { type: 'apply_effect', effect: 'minecraft:glowing', seconds: 5 },
          ],
        },
      },
      feedback_text: GREET_TEXT,
    },
  },
  {
    id: KIT,
    kind: 'msm:command',
    data: {
      format: 1,
      name: 'kit',
      permission: 2,
      arguments: [
        { name: 'who', type: 'player' },
        { name: 'count', type: 'integer', min: 1, max: 16 },
      ],
      function: GIVE_KIT,
      feedback_text: KIT_TEXT,
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
        'Sample vanilla blocks: one block of each vanilla-like type, a lamp that holds water, tin that ages like copper, bags, a bundle, two commands and two creative tabs.',
      authors: ['MCSuperMods'],
      licence: 'MIT',
    },
  },
  {
    id: TAB,
    kind: 'msm:creative_tab',
    data: {
      format: 1,
      icon: PAPER_LANTERN,
      order: 'as_listed',
      display_name: 'Vanilla Blocks',
    },
  },
  {
    id: TIN_TAB,
    kind: 'msm:creative_tab',
    data: {
      format: 1,
      icon: ns('tin'),
      order: 'by_name',
      display_name: 'Tin Blocks',
    },
  },
  ...TYPE_BLOCKS,
  GOURD_BLOCK,
  blockModel('gourd'),
  SEA_LAMP_BLOCK,
  blockModel('sea_lamp'),
  ...TIN_BLOCKS,
  ...TIN_STAGES.map((stage) => blockModel(tinName(stage))),
  ...ITEMS,
  itemModel('satchel'),
  itemModel('seed_pouch'),
  itemModel('tool_kit'),
  itemModel('charm_bundle'),
  ...COMMANDS,
  {
    id: GIVE_KIT,
    kind: 'minecraft:function',
    data: {
      lines: [
        '# /kit <who> <count>: gives tallow candles; $(who) and $(count) are what was typed.',
        KIT_LINE,
      ],
    },
  },
];

const SAMPLE_ASSETS: readonly SampleAsset[] = [
  texture('block/honey_cake_top', 'plain', COLOURS.cake),
  texture('block/honey_cake_bottom', 'plain', COLOURS.sponge),
  texture('block/honey_cake_side', 'bricks', COLOURS.sponge),
  texture('block/honey_cake_inner', 'plain', mix(COLOURS.sponge, COLOURS.cake, 0.5)),
  texture('item/honey_cake', 'produce', COLOURS.cake),
  ...[0, 1, 2, 3].map((stage) =>
    texture(`block/blue_berry_bush_stage${stage}`, `crop_stage${stage}` as Pattern, COLOURS.leaf),
  ),
  texture('block/grass_tuft', 'sapling', COLOURS.moss),
  texture('block/tall_bluebell_top', 'sapling', COLOURS.bluebell),
  texture('block/tall_bluebell_bottom', 'sapling', COLOURS.leaf),
  texture('block/ivy', 'leaves', COLOURS.leaf),
  texture('block/glow_pod', 'egg', COLOURS.pod),
  texture('block/moss_rug', 'plain', COLOURS.moss),
  texture('block/ash', 'stone', COLOURS.ash),
  texture('block/coffee_pod_small', 'seeds', COLOURS.leaf),
  texture('block/coffee_pod_medium', 'produce', mix(COLOURS.leaf, COLOURS.coffee, 0.5)),
  texture('block/coffee_pod_ripe', 'produce', COLOURS.coffee),
  texture('block/tallow_candle', 'pillar_side', COLOURS.tallow),
  texture('block/tallow_candle_lit', 'pillar_side', mix(COLOURS.tallow, [255, 200, 80], 0.4)),
  texture('item/tallow_candle', 'bottle', COLOURS.tallow),
  texture('block/cosy_bed', 'block_front', COLOURS.blanket),
  texture('item/cosy_bed', 'plain', COLOURS.blanket),
  texture('block/rope_ladder', 'trapdoor', COLOURS.rope),
  texture('block/ember_torch', 'spear', COLOURS.flame),
  texture('block/paper_lantern', 'block_front', COLOURS.paper),
  texture('item/paper_lantern', 'flask', COLOURS.paper),
  texture('block/brass_chain', 'pillar_side', COLOURS.brass),
  texture('item/brass_chain', 'ingot', COLOURS.brass),
  texture('block/crystal_rod', 'pillar_side', COLOURS.crystal),
  texture('block/cedar_planks', 'planks', COLOURS.cedar),
  { path: 'textures/gui/signs/cedar_sign.png', bytes: signGuiPng(COLOURS.cedar) },
  texture('item/cedar_sign', 'planks', COLOURS.cedar),
  texture('block/stripped_cedar_log', 'stripped_log', COLOURS.cedar),
  texture('gui/hanging_signs/cedar_hanging_sign', 'planks', COLOURS.cedar),
  texture('item/cedar_hanging_sign', 'stripped_log', COLOURS.cedar),
  texture('block/gourd', 'pillar_side', COLOURS.gourd),
  texture('block/gourd_stem', 'sapling', COLOURS.leaf),
  texture('block/attached_gourd_stem', 'sapling', mix(COLOURS.leaf, COLOURS.gourd, 0.4)),
  texture('block/bamboo_frame_top', 'planks', COLOURS.bamboo),
  texture('block/bamboo_frame_side', 'trapdoor', COLOURS.bamboo),
  texture('block/bamboo_frame_bottom', 'planks', mix(COLOURS.bamboo, [0, 0, 0], 0.2)),
  texture('block/sea_lamp', 'polished_stone', COLOURS.sea),
  ...TIN_STAGES.map((stage, i) =>
    texture(`block/${tinName(stage)}`, 'polished_stone', mix(COLOURS.tin, COLOURS.patina, i / 3)),
  ),
  texture('item/satchel', 'egg', COLOURS.satchel),
  texture('item/seed_pouch', 'seeds', COLOURS.pouch),
  texture('item/tool_kit', 'block_front', COLOURS.kit),
  texture('item/charm_bundle', 'egg', COLOURS.charm),
  texture('item/charm_bundle_open_back', 'egg', mix(COLOURS.charm, [0, 0, 0], 0.3)),
  texture('item/charm_bundle_open_front', 'egg', mix(COLOURS.charm, [255, 255, 255], 0.2)),
];

const nameOf = (id: string): string => id.split(':')[1] as string;
const ofKind = (kind: string): string[] =>
  SAMPLE_ELEMENTS.filter((entry) => entry.kind === kind).map((entry) => nameOf(entry.id));
const BLOCK_NAMES = ofKind('msm:block');
const ITEM_NAMES = ofKind('msm:item');
const COMMAND_NAMES = ofKind('msm:command');
const BLOCK_ELEMENTS = SAMPLE_ELEMENTS.filter((entry) => entry.kind === 'msm:block');
/** The companions lowering generates (`<id>_wall`, `<id>_attached`, ADR 0094 D3). */
const COMPANIONS = BLOCK_ELEMENTS.flatMap((entry) =>
  blockGeneratedBlockIds(entry.id, entry.data).map(nameOf),
);
/** The block items, by their own ids (berries, beans and seeds name their bush, pod and stem). */
const BLOCK_ITEMS = BLOCK_ELEMENTS.flatMap((entry) => {
  const id = blockItemIdOf(entry.id, entry.data);
  return id === undefined ? [] : [id];
});

/**
 * What the runtime registers: every block element (companions are not counted in
 * `registered N block(s)`, B446), the block items (the potted plant has none) and the items.
 */
const EXPECTED_BLOCKS = BLOCK_NAMES.length;
const EXPECTED_ITEMS = BLOCK_ITEMS.length + ITEM_NAMES.length;

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

// Registries and checkers -------------------------------------------------------------------

/**
 * The project's own ids per registry, as the app derives them: element ids under their kind's
 * registry, each block's item, companions and generated models, a bundle's generated models,
 * and the textures of the namespace's PNG assets.
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
    if (element.kind === 'msm:item') {
      const pictures = (element.data as { bundle_textures?: unknown }).bundle_textures;
      if (typeof pictures === 'object' && pictures !== null) {
        const models = bundleModelIds(NAMESPACE, nameOf(element.id));
        for (const slot of Object.keys(pictures) as (keyof typeof models)[]) {
          if (models[slot] !== undefined) add('model', models[slot]);
        }
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
      item: ids.item ?? [],
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

// Tests -------------------------------------------------------------------------------------

describe('sample vanilla blocks project', () => {
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

  it('loads with zero problems and holds every type, the set, the bags, the commands and the tab', async () => {
    const project = await loadSample();
    expect(project.name).toBe(PROJECT_NAME);
    const types = elementsOf(project)
      .filter((element) => element.kind === 'msm:block')
      .map((element) => (element.data as JsonRecord).type)
      .filter((type) => type !== undefined);
    expect(types.sort()).toEqual([...BLOCK_TYPES].sort());
    expect(COMPANIONS.sort()).toEqual([
      'cedar_hanging_sign_wall',
      'cedar_sign_wall',
      'ember_torch_wall',
      'gourd_stem_attached',
    ]);
    // Block names never match a vanilla class name in the eject (B457).
    expect(BLOCK_NAMES.filter((name) => BLOCK_TYPES.includes(name as never))).toEqual([]);
    // The potted plant has no item (ADR 0094 D11, B448).
    expect(blockItemIdOf(POTTED_GRASS, dataOf(project, POTTED_GRASS))).toBeUndefined();
    expect(dataOf(project, GOURD_STEM)).toMatchObject({ fruit: GOURD });
    expect(dataOf(project, CEDAR_SIGN)).toMatchObject({ wood_type: 'spruce' });
    const components = (id: string): JsonRecord => dataOf(project, id).components as JsonRecord;
    expect(components(SEA_LAMP)['msm:waterloggable']).toEqual({});
    expect(
      TIN_STAGES.map(
        (stage) => (components(ns(tinName(stage)))['msm:weathering'] as JsonRecord).stage,
      ),
    ).toEqual([...TIN_STAGES]);
    expect(components(ns('oxidized_tin'))['msm:weathering']).toEqual({ stage: 'oxidized' });
    expect(components(ns('waxed_tin'))['msm:weathering']).toBeUndefined();
    const layouts = [SATCHEL, SEED_POUCH, TOOL_KIT].map(
      (id) => (components(id)['msm:item_inventory'] as JsonRecord).layout,
    );
    expect(layouts).toEqual(['chest', 'hopper', 'dispenser']);
    expect(components(CHARM_BUNDLE)['msm:bundle']).toEqual({});
    expect(COMMAND_NAMES).toEqual(['greet', 'kit']);
    expect(dataOf(project, GIVE_KIT).lines).toContain(KIT_LINE);
    // Every item of the project names a tab: the tin set the by-name tab, the rest the first.
    const tinIds = new Set(TIN_BLOCKS.map((element) => element.id));
    for (const element of elementsOf(project)) {
      const data = element.data as JsonRecord;
      if (element.kind === 'msm:item') expect(data.creative_tab, element.id).toBe(TAB);
      if (element.kind === 'msm:block' && data.item !== undefined && data.item !== false) {
        expect((data.item as JsonRecord).creative_tab, element.id).toBe(
          tinIds.has(element.id) ? TIN_TAB : TAB,
        );
      }
    }
    expect(dataOf(project, TIN_TAB)).toMatchObject({ order: 'by_name' });
    const kinds = new Set(elementsOf(project).map((element) => element.kind));
    expect([...kinds].sort()).toEqual([
      'minecraft:function',
      'minecraft:model',
      'msm:block',
      'msm:command',
      'msm:creative_tab',
      'msm:item',
      'msm:mod',
    ]);
    expect(project.namespaces[0]?.assets.map((asset) => asset.path).sort()).toEqual(
      SAMPLE_ASSETS.map((asset) => asset.path).sort(),
    );
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sample vanilla blocks export (%s)',
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
        exporter: createFabricContentJarExporter(factory),
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

    it('holds the definitions (valid), the companions, the pictures and the tab', async () => {
      const files = unzipSync(await exportJar());
      const paths = Object.keys(files).sort();
      const resource = target.folders.resource;
      const data = target.folders.data;
      const definitions: [string, string][] = [
        ...BLOCK_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/block/${name}.json`,
          MSM_SCHEMA_REFS.blockDefinition,
        ]),
        ...ITEM_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/item/${name}.json`,
          MSM_SCHEMA_REFS.itemDefinition,
        ]),
        ...COMMAND_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/command/${name}.json`,
          MSM_SCHEMA_REFS.commandDefinition,
        ]),
        ...['tin_blocks', 'vanilla_blocks'].map((name): [string, string] => [
          `msm/${NAMESPACE}/creative_tab/${name}.json`,
          MSM_SCHEMA_REFS.creativeTabDefinition,
        ]),
      ];
      expect(paths.filter((path) => path.startsWith('msm/'))).toEqual(
        definitions.map(([path]) => path).sort(),
      );
      for (const path of [
        'fabric.mod.json',
        'msm.export.json',
        `assets/${NAMESPACE}/${resource.lang}/en_us.json`,
        `assets/${NAMESPACE}/textures/gui/signs/cedar_sign.png`,
        `assets/${NAMESPACE}/textures/gui/hanging_signs/cedar_hanging_sign.png`,
        `data/${NAMESPACE}/${data.function}/give_kit.mcfunction`,
        ...[...BLOCK_NAMES, ...COMPANIONS].map(
          (name) => `assets/${NAMESPACE}/blockstates/${name}.json`,
        ),
        ...[...BLOCK_NAMES, ...COMPANIONS].map(
          (name) => `data/${NAMESPACE}/${data.loot_table}/blocks/${name}.json`,
        ),
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

      // The definitions carry what the runtime reads, with full ids for the ageing chain.
      const definition = (kind: string, name: string): JsonRecord =>
        json(`msm/${NAMESPACE}/${kind}/${name}.json`) as JsonRecord;
      expect(definition('block', 'tin').components).toMatchObject({
        'msm:weathering': { stage: 'unaffected', next: ns('exposed_tin') },
        'msm:waxable': { into: ns('waxed_tin') },
      });
      expect(definition('block', 'sea_lamp').components).toMatchObject({
        'msm:waterloggable': {},
      });
      expect(definition('block', 'potted_grass_tuft').item).toBe(false);
      expect(definition('item', 'satchel').components).toMatchObject({
        'msm:item_inventory': { layout: 'chest', rows: 2, open: 'sneak_use' },
      });
      expect(definition('command', 'kit')).toMatchObject({
        name: 'kit',
        permission: 2,
        function: GIVE_KIT,
      });
      expect(definition('creative_tab', 'vanilla_blocks')).toMatchObject({ icon: PAPER_LANTERN });
      expect(definition('creative_tab', 'tin_blocks')).toMatchObject({
        icon: ns('tin'),
        order: 'by_name',
      });
      expect(
        utf8.decode(files[`data/${NAMESPACE}/${data.function}/give_kit.mcfunction`] as Uint8Array),
      ).toContain(`${KIT_LINE}\n`);

      const lang = json(`assets/${NAMESPACE}/${resource.lang}/en_us.json`) as JsonRecord;
      for (const name of BLOCK_NAMES)
        expect(lang[`block.${NAMESPACE}.${name}`], name).toBeDefined();
      for (const name of ITEM_NAMES) expect(lang[`item.${NAMESPACE}.${name}`], name).toBeDefined();
      expect(lang[`itemGroup.${NAMESPACE}.vanilla_blocks`]).toBe('Vanilla Blocks');
      expect(lang[`command.${NAMESPACE}.greet.feedback`]).toBe(GREET_TEXT);
      expect(lang[`command.${NAMESPACE}.kit.feedback`]).toBe(KIT_TEXT);

      const modJson = json('fabric.mod.json') as { id: string; depends: Record<string, string> };
      expect(modJson.id).toBe(NAMESPACE);
      expect(modJson.depends.msm_runtime).toBe(`>=${meta.msmVersion}`);
      const runtimePath = nestedRuntimePath(meta.msmVersion);
      expect(files[runtimePath]).toEqual(stubRuntimeJar);
      expect(paths.filter((path) => path.startsWith('META-INF/jars/'))).toEqual([runtimePath]);
    });

    it('leaves out the loot tables and keeps the macro function in the vanilla data pack', async () => {
      const project = await loadSample();
      const modOnly = modOnlyIdsOf(context.ids, commandLiteralsOf(elementsOf(project)));
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
      const paths = [...sink.files().keys()].sort();
      expect(paths.some((path) => path.startsWith('msm/'))).toBe(false);
      // The vanilla tags the types join (entries optional), the macro function, and the potted
      // grass's table (a pot and vanilla grass only).
      const tags = target.folders.data.tags;
      expect(paths).toEqual(
        [
          ...[
            'beds',
            'bee_growables',
            'candles',
            'ceiling_hanging_signs',
            'climbable',
            'crops',
            'flower_pots',
            'maintains_farmland',
            'mineable/axe',
            'mineable/pickaxe',
            'mineable/shovel',
            'standing_signs',
            'wall_hanging_signs',
            'wall_signs',
          ].map((tag) => `data/minecraft/${tags}/block/${tag}.json`),
          ...['beds', 'candles', 'hanging_signs', 'signs'].map(
            (tag) => `data/minecraft/${tags}/item/${tag}.json`,
          ),
          `data/${NAMESPACE}/${data.function}/give_kit.mcfunction`,
          `data/${NAMESPACE}/${data.loot_table}/blocks/potted_grass_tuft.json`,
          'msm.export.json',
          'pack.mcmeta',
        ].sort(),
      );
      const flagged = (code: string): string[] =>
        report.problems
          .filter((problem) => problem.code === code)
          .map((problem) => problem.file ?? '')
          .sort();
      expect(flagged(MOD_ONLY_REFERENCE)).toEqual(
        [...BLOCK_NAMES, ...COMPANIONS]
          .filter((name) => name !== nameOf(POTTED_GRASS))
          .map((name) => `data/${NAMESPACE}/${data.loot_table}/blocks/${name}.json`)
          .sort(),
      );
      expect(flagged(MOD_ONLY_FUNCTION)).toEqual([
        `data/${NAMESPACE}/${data.function}/give_kit.mcfunction`,
      ]);
      console.log('DATAPACK', target.id, JSON.stringify(paths));
    });

    it('keeps the pictures and the writing-screen pictures in the vanilla resource pack', async () => {
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
      for (const asset of SAMPLE_ASSETS) {
        expect(paths).toContain(`assets/${NAMESPACE}/${asset.path}`);
      }
      for (const name of [...BLOCK_NAMES, ...COMPANIONS]) {
        expect(paths).toContain(`assets/${NAMESPACE}/blockstates/${name}.json`);
      }
      expect(paths.some((path) => path.startsWith('msm/'))).toBe(false);
    });

    describe('content jar', () => {
      const hashFile = join(fixturesRoot, target.id, 'sample-vanilla-blocks-jar.sha256');
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
    const outDir = process.env.MSM_SAMPLE_VANILLA_BLOCKS_OUT;
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
          expectScripts: 0,
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
