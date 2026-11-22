/**
 * Golden over the committed mobs and commands project (`fixtures/sample-mobs-and-commands`, ADRs
 * 0107 to 0111, ADR 0112 D4, plan B541): namespace `msm_sample_mobs`, an `msm:mod` and one of each
 * feature of batch 2 of vanilla parity 3, each different enough for a parity test to tell apart:
 *
 * - traders 2 (ADR 0107): `kind_merchant`, a trader with reputation (a poppy is its gift),
 *   vanilla's demand and a barrel as its work site, selling bread for 10 emeralds and cooked beef
 *   for 20 (its own trades, with vanilla's reputation discounts 0.05 and 0.2); `straw_mat`, a
 *   project bed villagers take as a home; `fen`, a villager type for swamps with its own robes;
 * - fluids 2 (ADR 0108): `maple_syrup`, water-like, tinted, that turns into a honeycomb block (as
 *   a source) or brown terracotta (flowing) where it meets lava, with a cauldron in three levels
 *   and a bottle (food and speed); `hot_tar`, lava-like, that turns into blackstone or basalt by
 *   water, with a full-only cauldron;
 * - mobs 2 (ADR 0109): `pond_carp` (a fish a water bucket takes), `ember_wisp` (hovers 4 blocks
 *   over the ground), `shade` (passes through walls while it charges), `dusk_swooper` (circles
 *   high and dives), `cave_flitter` (hangs under a block when idle), `trinket_magpie` (collects
 *   the item it was given), `truffle_hog` (digs moss and wool for the sniffer's loot),
 *   `pond_newt` (plays dead below half its health), `gold_haggler` (barters gold ingots for the
 *   piglin's loot), `dune_runner` (a mount that dashes) and `perch_owl` (a pet for the right
 *   shoulder only);
 * - boats (ADR 0110): `larch_boat` and its chest boat, crafted from `larch_planks`;
 * - commands 2 (ADR 0111): `/signal` with eight of the new argument types and an `open_dialog`
 *   action showing the project dialog `welcome` (and a compass), `/tally` whose `run_script`
 *   event reads its arguments in the script `mob_notes`, the game rules `calm_nights` (boolean)
 *   and `merchant_bonus` (0 to 5), the statistics `carp_caught` and `distance_hopped`, the
 *   creative tab `mobs_tab` in its own order, and the script's six new events (`item.crafted`,
 *   `item.picked_up`, `player.ate`, `player.slept`, `player.woke`, `player.advancement`).
 *
 * The mobs use the library's presets drawn by the runtime's vanilla renderer, so the content jar
 * needs no GeckoLib on any version. Pictures are MSM's own (the library's placeholder and preset
 * skins, the art generator's boat, robe and bed pictures, and the liquids and buckets drawn
 * here); none is vanilla's.
 *
 * - The fixture equals the project built from {@link SAMPLE_ELEMENTS} and {@link SAMPLE_ASSETS}
 *   now; `UPDATE_GOLDENS=1` rewrites it (the README is hand-written).
 * - Every element validates with zero problems; the project expands with no problems and the
 *   plugins' project validators report nothing at all on every target (no info either); the
 *   script type-checks against the generated typings.
 * - The content jar exports with zero errors and warnings, holds the definitions (valid)
 *   and the script, and its SHA-256 is pinned per target in two time zones
 *   (`test/fixtures/<target id>/sample-mobs-and-commands-jar.sha256`).
 * - The vanilla data pack (ADR 0066) keeps the trades, the dialog and the vanilla tags it joins,
 *   and leaves out what names the mod's own ids.
 * - With `MSM_RUNTIME_JAR` (a built `msm_runtime` jar for the selected target) and
 *   `MSM_SAMPLE_MOBS_COMMANDS_OUT` (a folder), the jar is also exported with the real runtime
 *   nested and written to that folder as `msm_sample_mobs.jar`, next to `fabric-facts.json` for
 *   `tools/run-fabric-server`. Without them that test is skipped.
 *
 * `sample-mobs-and-commands.java.golden.test.ts` checks the Java project eject.
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
  expandProject,
  loadProject,
  type MemoryFileSystem,
  type ProjectFileSystem,
  registerPlugin,
  saveProject,
  utf8,
} from '@msm/core';
import type { Element, Json, Plugin, Project, TargetFacts } from '@msm/plugin-api';
import blocksItemsPlugin, { blockGeneratedModelIds, blockItemIdOf } from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import entitiesPlugin from '@msm/plugin-entities';
import {
  artLookPng,
  encodePng,
  type MOB_PRESET_NAMES,
  MOB_PRESETS,
  placeholderPng,
  presetAnimationFields,
  presetSkinPng,
  type Rgb,
} from '@msm/plugin-library';
import modelsAnimPlugin from '@msm/plugin-models-anim';
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
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  commandLiteralsOf,
  createFabricContentJarExporter,
  createMemorySink,
  createZipSink,
  dataPackExporter,
  type FabricContentJarOptions,
  fluidProfessionIdsOf,
  MOD_ONLY_REFERENCE,
  modOnlyIdsOf,
  nestedRuntimePath,
  resourcePackExporter,
  runExport,
  type ScriptTranspileResult,
  vanillaSafeExporter,
} from '../src/index';
import { defaultTarget, selectedTarget } from './selected-target';

// Expanding and exporting a project with twelve mobs and a script takes a few seconds; under
// load the default 5 s is too short (B368, B377).
vi.setConfig({ testTimeout: 60_000 });

const update = process.env.UPDATE_GOLDENS === '1';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, 'fixtures');
const sampleRoot = join(here, '..', '..', '..', 'fixtures', 'sample-mobs-and-commands');
const NAMESPACE = 'msm_sample_mobs';
const PROJECT_NAME = 'MSM Sample Mobs and Commands';
const NOW = '2026-11-22T00:00:00.000Z';
/** Files of the fixture that the test does not generate. */
const HAND_WRITTEN = new Set(['README.md']);

/** Two zones on opposite sides of the date line, so a local-time leak changes the bytes. */
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;

/** The plugins the sample needs, in the app's registration order. */
const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  blocksItemsPlugin,
  entitiesPlugin,
  modelsAnimPlugin,
  scriptingPlugin,
];
const VALIDATORS = PLUGINS.flatMap((plugin) => plugin.contributes.validators ?? []);

const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);

const meta = {
  msmVersion: '1.5.3',
  plugins: ['msm.blocks-items', 'msm.datapack', 'msm.entities', 'msm.models-anim', 'msm.scripting'],
};
const stubRuntimeJar = utf8.encode(
  'PK stub msm_runtime jar for the sample-mobs-and-commands golden',
);

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
  /** Path under the namespace's assets, such as `textures/block/larch_planks.png`. */
  path: string;
  bytes: Uint8Array;
}

type JsonRecord = { [key: string]: Json };

const ns = (path: string): string => `${NAMESPACE}:${path}`;

const COLOURS = {
  merchant: [70, 120, 90] as Rgb,
  carp: [214, 130, 52] as Rgb,
  wisp: [250, 196, 70] as Rgb,
  shade: [60, 56, 84] as Rgb,
  swooper: [76, 70, 128] as Rgb,
  flitter: [96, 78, 66] as Rgb,
  magpie: [36, 40, 52] as Rgb,
  hog: [168, 118, 96] as Rgb,
  newt: [212, 96, 128] as Rgb,
  haggler: [196, 160, 64] as Rgb,
  runner: [206, 176, 120] as Rgb,
  owl: [150, 120, 86] as Rgb,
  larch: [196, 150, 96] as Rgb,
  fen: [72, 104, 64] as Rgb,
  fenHem: [180, 168, 104] as Rgb,
  straw: [214, 186, 96] as Rgb,
  strawCloth: [128, 160, 96] as Rgb,
  /** Drawn light: the fluid's tint colours it in the game. */
  syrup: [236, 224, 208] as Rgb,
  syrupTint: 0xb5651d,
  tar: [52, 40, 34] as Rgb,
  bucket: [168, 172, 180] as Rgb,
};

const MERCHANT = ns('kind_merchant');
const CARP = ns('pond_carp');
const OWL = ns('perch_owl');
const SYRUP = ns('maple_syrup');
const TAR = ns('hot_tar');
const BED = ns('straw_mat');
const FEN = ns('fen');
const PLANKS = ns('larch_planks');
const BOAT = ns('larch_boat');
const CHEST_BOAT = ns('larch_chest_boat');
const TAB = ns('mobs_tab');
const WELCOME = ns('welcome');
const SCRIPT = ns('mob_notes');
const CALM_NIGHTS = ns('calm_nights');
const MERCHANT_BONUS = ns('merchant_bonus');
const CARP_CAUGHT = ns('carp_caught');
const DISTANCE_HOPPED = ns('distance_hopped');
const SIGNAL_EVENT = ns('signal');
const TALLY_EVENT = ns('tally');
const TALLY_HANDLER = ns('tally');

/** A mix of two colours, `amount` of the way from `from` to `to`. */
const mix = (from: Rgb, to: Rgb, amount: number): Rgb => {
  const channel = (i: 0 | 1 | 2): number => Math.round(from[i] + (to[i] - from[i]) * amount);
  return [channel(0), channel(1), channel(2)];
};

/** A canvas of `width` by `height` clear pixels, painted with `set`, encoded with `png`. */
function canvas(width: number, height: number) {
  const pixels = new Uint8Array(width * height * 4);
  return {
    set(x: number, y: number, colour: Rgb): void {
      pixels.set([colour[0], colour[1], colour[2], 255], (y * width + x) * 4);
    },
    png: (): Uint8Array => encodePng(pixels, width, height),
  };
}

/**
 * A 16 by 16 opaque liquid picture in shades of `colour` that tiles: dots of light for the still
 * picture, slanted streaks for the flowing one (opaque, so a tint is exact).
 */
function liquidPng(colour: Rgb, flowing: boolean): Uint8Array {
  const out = canvas(16, 16);
  const light = mix(colour, [255, 255, 255], 0.35);
  const dark = mix(colour, [0, 0, 0], 0.15);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const streak = flowing
        ? (x + 2 * y) % 8 === 0
        : (x % 8 === 2 && y % 8 === 3) || (x % 8 === 6 && y % 8 === 7);
      const shade = flowing ? (x + 2 * y) % 8 === 4 : (x + y) % 8 === 0;
      out.set(x, y, streak ? light : shade ? dark : colour);
    }
  }
  return out.png();
}

/** A 16 by 16 bucket of `liquid`: an iron pail seen from the side, the liquid (or a fish) at its top. */
function bucketPng(liquid: Rgb): Uint8Array {
  const out = canvas(16, 16);
  const metal = COLOURS.bucket;
  const rim = mix(metal, [255, 255, 255], 0.25);
  const shadow = mix(metal, [0, 0, 0], 0.3);
  for (let y = 4; y < 15; y += 1) {
    const inset = Math.floor((y - 4) / 4);
    for (let x = 3 + inset; x < 13 - inset; x += 1) {
      const edge = x === 3 + inset || x === 12 - inset || y === 14;
      out.set(x, y, y === 4 ? rim : y <= 6 && !edge ? liquid : edge ? shadow : metal);
    }
  }
  for (let x = 4; x < 12; x += 1) out.set(x, 2, shadow);
  out.set(3, 3, shadow);
  out.set(12, 3, shadow);
  return out.png();
}

/**
 * A 64 by 64 bed picture in the layout vanilla's bed renderer reads: the cloth over the head
 * (0, 0 to 44, 22) and the foot (0, 22 to 44, 44) halves, the frame's legs (50, 0 to 64, 24)
 * in `frame`; the rest stays clear.
 */
function bedPng(cloth: Rgb, frame: Rgb): Uint8Array {
  const out = canvas(64, 64);
  const fold = mix(cloth, [0, 0, 0], 0.2);
  const pillow = mix(cloth, [255, 255, 255], 0.6);
  for (let y = 0; y < 44; y += 1) {
    for (let x = 0; x < 44; x += 1) {
      const head = y < 22;
      const onPillow = head && y >= 6 && y < 12 && x >= 6 && x < 22;
      out.set(x, y, onPillow ? pillow : (x + y) % 6 === 0 ? fold : cloth);
    }
  }
  for (let y = 0; y < 24; y += 1) {
    for (let x = 50; x < 64; x += 1)
      out.set(x, y, (x + y) % 4 === 0 ? mix(frame, [0, 0, 0], 0.2) : frame);
  }
  return out.png();
}

const breakable = (hardness: number, tool?: string): JsonRecord => ({
  hardness,
  resistance: hardness,
  ...(tool === undefined ? {} : { tool }),
});

/** A trade: `wants` (the price) for `gives`, `max_uses` before a restock, the XP and vanilla's discount. */
const trade = (
  id: string,
  wants: [string, number],
  gives: [string, number],
  discount: number,
): SampleElement => ({
  id: ns(id),
  kind: 'minecraft:villager_trade',
  data: {
    wants: { id: wants[0], count: wants[1] },
    gives: { id: gives[0], count: gives[1] },
    max_uses: 12,
    xp: 2,
    reputation_discount: discount,
  },
});

/** A mob of a library preset drawn by the runtime's vanilla renderer, with its model, animations, skin and egg. */
type MobPresetName = (typeof MOB_PRESET_NAMES)[number];

interface MobSpec {
  name: string;
  display: string;
  preset: MobPresetName;
  colour: Rgb;
  data: JsonRecord;
  components: JsonRecord;
}

const MOBS: readonly MobSpec[] = [
  {
    name: 'kind_merchant',
    display: 'Kind Merchant',
    preset: 'biped',
    colour: COLOURS.merchant,
    data: { category: 'creature', size: { width: 0.6, height: 1.95 } },
    components: {
      'msm:health': { max: 20 },
      'msm:movement': { speed: 0.25 },
      'msm:ai_goals': {
        goals: [
          { type: 'panic', speed: 1.3 },
          { type: 'wander', speed: 0.6 },
          { type: 'look_at_player', distance: 8 },
        ],
      },
      'msm:trader': {
        trade_sets: [{ trade_set: ns('kind_merchant/level_1') }],
        levels: false,
        demand: true,
        reputation: { gift_item: 'minecraft:poppy' },
        work_site: 'minecraft:barrel',
      },
    },
  },
  {
    name: 'pond_carp',
    display: 'Pond Carp',
    preset: 'fish',
    colour: COLOURS.carp,
    data: {
      category: 'water_creature',
      size: { width: 0.5, height: 0.4 },
      bucket_texture: ns('item/pond_carp_bucket'),
    },
    components: {
      'msm:health': { max: 6 },
      'msm:movement': { mode: 'swim', speed: 1 },
      'msm:bucketable': {},
      'msm:ai_goals': { goals: [{ type: 'wander', speed: 1 }] },
    },
  },
  {
    name: 'ember_wisp',
    display: 'Ember Wisp',
    preset: 'flyer',
    colour: COLOURS.wisp,
    data: { category: 'creature', size: { width: 0.6, height: 0.9 } },
    components: {
      'msm:health': { max: 10 },
      'msm:movement': { mode: 'hover', hover_height: 4, speed: 0.3 },
      'msm:ai_goals': { goals: [{ type: 'wander' }] },
    },
  },
  {
    name: 'shade',
    display: 'Shade',
    preset: 'flyer',
    colour: COLOURS.shade,
    data: { category: 'creature', size: { width: 0.4, height: 0.8 } },
    components: {
      'msm:health': { max: 14 },
      'msm:movement': { mode: 'phase', speed: 0.3 },
      'msm:attack': { damage: 2 },
      'msm:ai_goals': {
        goals: [{ type: 'melee_attack', must_see: false, targets: ['minecraft:pig'] }],
      },
    },
  },
  {
    name: 'dusk_swooper',
    display: 'Dusk Swooper',
    preset: 'bird',
    colour: COLOURS.swooper,
    data: { category: 'creature', size: { width: 0.8, height: 0.5 } },
    components: {
      'msm:health': { max: 12 },
      'msm:movement': { mode: 'fly', speed: 0.5 },
      'msm:attack': { damage: 2 },
      'msm:ai_goals': { goals: [{ type: 'swoop', height: 5, must_see: false }] },
    },
  },
  {
    name: 'cave_flitter',
    display: 'Cave Flitter',
    preset: 'bird',
    colour: COLOURS.flitter,
    data: { category: 'creature', size: { width: 0.5, height: 0.9 } },
    components: {
      'msm:health': { max: 6 },
      'msm:movement': { mode: 'fly', speed: 0.3 },
      'msm:ai_goals': {
        goals: [{ type: 'roost', daylight: false, when_idle: true, range: 8 }],
      },
    },
  },
  {
    name: 'trinket_magpie',
    display: 'Trinket Magpie',
    preset: 'bird',
    colour: COLOURS.magpie,
    data: { category: 'creature', size: { width: 0.4, height: 0.6 } },
    components: {
      'msm:health': { max: 8 },
      'msm:movement': { speed: 0.3 },
      'msm:ai_goals': { goals: [{ type: 'collect_items', range: 16, speed: 1.2 }] },
    },
  },
  {
    name: 'truffle_hog',
    display: 'Truffle Hog',
    preset: 'quadruped',
    colour: COLOURS.hog,
    data: { category: 'creature', size: { width: 0.9, height: 0.9 } },
    components: {
      'msm:health': { max: 14 },
      'msm:movement': { speed: 0.25 },
      'msm:ai_goals': {
        goals: [
          {
            type: 'dig_items',
            dig_blocks: ['minecraft:moss_block', '#minecraft:wool'],
            interval_ticks: 60,
            loot_table: 'minecraft:gameplay/sniffer_digging',
          },
        ],
      },
    },
  },
  {
    name: 'pond_newt',
    display: 'Pond Newt',
    preset: 'quadruped',
    colour: COLOURS.newt,
    data: { category: 'creature', size: { width: 0.6, height: 0.9 } },
    components: {
      'msm:health': { max: 20 },
      'msm:movement': { speed: 0.3 },
      'msm:ai_goals': { goals: [{ type: 'play_dead', ticks: 60 }, { type: 'wander' }] },
    },
  },
  {
    name: 'gold_haggler',
    display: 'Gold Haggler',
    preset: 'biped',
    colour: COLOURS.haggler,
    data: { category: 'creature', size: { width: 0.6, height: 0.9 } },
    components: {
      'msm:health': { max: 16 },
      'msm:movement': { speed: 0.3 },
      'msm:ai_goals': {
        goals: [
          {
            type: 'barter',
            item: 'minecraft:gold_ingot',
            loot_table: 'minecraft:gameplay/piglin_bartering',
            ticks: 20,
            from_ground: true,
          },
        ],
      },
    },
  },
  {
    name: 'dune_runner',
    display: 'Dune Runner',
    preset: 'quadruped',
    colour: COLOURS.runner,
    data: { category: 'creature', size: { width: 1.2, height: 1.4 } },
    components: {
      'msm:health': { max: 24 },
      'msm:movement': { speed: 0.2 },
      'msm:rideable': { saddle: false, dash: { power: 1, cooldown_ticks: 40 } },
    },
  },
  {
    name: 'perch_owl',
    display: 'Perch Owl',
    preset: 'bird',
    colour: COLOURS.owl,
    data: { base: 'animal', category: 'creature', size: { width: 0.5, height: 0.6 } },
    components: {
      'msm:health': { max: 8 },
      'msm:movement': { speed: 0.3 },
      'msm:tameable': {
        items: ['minecraft:wheat_seeds'],
        chance: 1,
        sit: true,
        follows_owner: true,
        defends_owner: false,
      },
      'msm:shoulder_riding': { sides: 'right' },
    },
  },
];

function mobElements(spec: MobSpec): SampleElement[] {
  const id = ns(spec.name);
  return [
    {
      id,
      kind: 'msm:entity',
      data: {
        format: 1,
        display_name: spec.display,
        ...spec.data,
        spawn_egg: {
          texture: ns(`item/${spec.name}_spawn_egg`),
          display_name: `${spec.display} Spawn Egg`,
        },
        components: {
          ...spec.components,
          'msm:animated_model': {
            model: ns(`entity/${spec.name}`),
            animations: ns(`entity/${spec.name}_animations`),
            texture: ns(`entity/${spec.name}`),
            renderer: 'vanilla',
            ...presetAnimationFields(spec.preset),
          },
        },
      },
    },
    {
      id: ns(`entity/${spec.name}`),
      kind: 'msm:geo_model',
      data: MOB_PRESETS[spec.preset].geometry(spec.name),
    },
    {
      id: ns(`entity/${spec.name}_animations`),
      kind: 'msm:animation',
      data: MOB_PRESETS[spec.preset].animations(),
    },
  ];
}

const TRADER_ELEMENTS: readonly SampleElement[] = [
  trade('kind_merchant/bread', ['minecraft:emerald', 10], ['minecraft:bread', 1], 0.05),
  trade('kind_merchant/beef', ['minecraft:emerald', 20], ['minecraft:cooked_beef', 1], 0.2),
  {
    id: ns('kind_merchant/level_1'),
    kind: 'minecraft:trade_set',
    data: {
      amount: 2,
      trades: [ns('kind_merchant/beef'), ns('kind_merchant/bread')],
    },
  },
  {
    id: BED,
    kind: 'msm:block',
    data: {
      format: 1,
      type: 'bed',
      display_name: 'Straw Mat',
      colour: 'lime',
      sound_type: 'wood',
      loot: 'self',
      item: { creative_tab: TAB, max_stack_size: 1 },
      textures: { bed: ns('block/straw_mat') },
      components: { 'msm:breakable': breakable(0.2) },
    },
  },
  {
    id: FEN,
    kind: 'msm:villager_type',
    data: {
      format: 1,
      biomes: ['minecraft:swamp', 'minecraft:mangrove_swamp'],
      textures: {
        villager: ns('entity/villager/type/fen'),
        zombie_villager: ns('entity/zombie_villager/type/fen'),
      },
    },
  },
];

const FLUID_ELEMENTS: readonly SampleElement[] = [
  {
    id: SYRUP,
    kind: 'msm:fluid',
    data: {
      format: 1,
      display_name: 'Maple Syrup',
      bucket_display_name: 'Bucket of Maple Syrup',
      bottle_display_name: 'Bottle of Maple Syrup',
      cauldron_display_name: 'Cauldron of Maple Syrup',
      behaves_like: 'water',
      tint: COLOURS.syrupTint,
      mixing: [
        {
          with: 'lava',
          source: 'minecraft:honeycomb_block',
          flowing: 'minecraft:brown_terracotta',
        },
      ],
      cauldron: { levels: true },
      bottle: {
        food: { nutrition: 2, saturation: 0.4, can_always_eat: true },
        effects: [{ effect: 'minecraft:speed', seconds: 10, amplifier: 0 }],
      },
      textures: {
        still: ns('block/maple_syrup_still'),
        flowing: ns('block/maple_syrup_flow'),
        bucket: ns('item/maple_syrup_bucket'),
      },
    },
  },
  {
    id: TAR,
    kind: 'msm:fluid',
    data: {
      format: 1,
      display_name: 'Hot Tar',
      bucket_display_name: 'Bucket of Hot Tar',
      cauldron_display_name: 'Cauldron of Hot Tar',
      behaves_like: 'lava',
      light: 10,
      mixing: [{ with: 'water', source: 'minecraft:blackstone', flowing: 'minecraft:basalt' }],
      cauldron: {},
      textures: {
        still: ns('block/hot_tar_still'),
        flowing: ns('block/hot_tar_flow'),
        bucket: ns('item/hot_tar_bucket'),
      },
    },
  },
];

const BOAT_ELEMENTS: readonly SampleElement[] = [
  {
    id: PLANKS,
    kind: 'msm:block',
    data: {
      format: 1,
      display_name: 'Larch Planks',
      model: ns('block/larch_planks'),
      sound_type: 'wood',
      loot: 'self',
      item: { creative_tab: 'minecraft:building_blocks' },
      components: {
        'msm:breakable': breakable(2, 'axe'),
        'msm:flammable': { burn_odds: 5, ignite_odds: 20 },
      },
    },
  },
  {
    id: ns('block/larch_planks'),
    kind: 'minecraft:model',
    data: { parent: 'minecraft:block/cube_all', textures: { all: ns('block/larch_planks') } },
  },
  {
    id: BOAT,
    kind: 'msm:item',
    data: {
      format: 1,
      display_name: 'Larch Boat',
      chest_boat_display_name: 'Larch Boat with Chest',
      model: ns('item/larch_boat'),
      creative_tab: TAB,
      components: { 'msm:boat': { chest: true } },
      boat_textures: {
        boat: ns('entity/boat/larch'),
        chest_boat: ns('entity/chest_boat/larch'),
        chest_boat_item: ns('item/larch_chest_boat'),
      },
    },
  },
  {
    id: ns('item/larch_boat'),
    kind: 'minecraft:model',
    data: { parent: 'minecraft:item/generated', textures: { layer0: ns('item/larch_boat') } },
  },
];

const COMMAND_ELEMENTS: readonly SampleElement[] = [
  {
    id: ns('signal'),
    kind: 'msm:command',
    data: {
      format: 1,
      name: 'signal',
      permission: 2,
      arguments: [
        { name: 'where', type: 'dimension' },
        { name: 'wait', type: 'time' },
        { name: 'colour', type: 'hex_colour' },
        { name: 'facing', type: 'rotation' },
        { name: 'who', type: 'uuid' },
        { name: 'holding', type: 'item_predicate' },
        { name: 'standing_on', type: 'block_predicate' },
        { name: 'note', type: 'message', optional: true },
      ],
      event: SIGNAL_EVENT,
      events: {
        [SIGNAL_EVENT]: {
          actions: [
            { type: 'open_dialog', dialog: WELCOME },
            { type: 'give_item', item: 'minecraft:compass', count: 1 },
          ],
        },
      },
    },
  },
  {
    id: ns('tally'),
    kind: 'msm:command',
    data: {
      format: 1,
      name: 'tally',
      arguments: [
        { name: 'count', type: 'integer', min: 0, max: 64 },
        { name: 'team', type: 'team_colour' },
        { name: 'effect', type: 'effect' },
        { name: 'mode', type: 'game_mode' },
        { name: 'span', type: 'int_range' },
        { name: 'kind', type: 'entity_type' },
      ],
      event: TALLY_EVENT,
      events: { [TALLY_EVENT]: { actions: [{ type: 'run_script', handler: TALLY_HANDLER }] } },
    },
  },
  {
    id: WELCOME,
    kind: 'minecraft:dialog',
    data: {
      type: 'minecraft:notice',
      title: { text: 'Mobs and commands', color: 'gold' },
      body: {
        type: 'minecraft:plain_message',
        contents: 'This dialog was opened by /signal, a command made with MCSuperMods.',
      },
      action: { label: 'Thanks' },
    },
  },
  {
    id: CALM_NIGHTS,
    kind: 'msm:game_rule',
    data: {
      format: 1,
      kind: 'boolean',
      default: false,
      category: 'mobs',
      display_name: 'Calm nights',
      description: 'Whether the sample mobs stay calm at night.',
    },
  },
  {
    id: MERCHANT_BONUS,
    kind: 'msm:game_rule',
    data: {
      format: 1,
      kind: 'integer',
      default: 2,
      min: 0,
      max: 5,
      category: 'player',
      display_name: 'Merchant bonus',
      description: 'How many extra emeralds a merchant gives back, from 0 to 5.',
    },
  },
  {
    id: CARP_CAUGHT,
    kind: 'msm:stat',
    data: { format: 1, formatter: 'default', display_name: 'Carp caught' },
  },
  {
    id: DISTANCE_HOPPED,
    kind: 'msm:stat',
    data: { format: 1, formatter: 'distance', display_name: 'Distance hopped' },
  },
  {
    id: TAB,
    kind: 'msm:creative_tab',
    data: {
      format: 1,
      display_name: 'Sample Mobs',
      icon: BOAT,
      order: 'by_hand',
      items: [
        ns('pond_carp_bucket'),
        ns('maple_syrup_bottle'),
        CHEST_BOAT,
        BOAT,
        'minecraft:water_bucket',
      ],
    },
  },
];

/** The lines the script says, which parity reads back. */
const SCRIPT_TEXT = {
  picked: 'You picked up ',
  ate: 'You ate ',
  crafted: 'You crafted ',
  slept: 'Sleep well.',
  woke: 'Good morning.',
  advancement: 'Well done: ',
  tally: 'Tally: ',
} as const;

/**
 * The script of Script API 1.7 (ADR 0111 D3 to D6, "Since runtime 1.5.3"): a line to the player
 * for each of the six new events (only items and advancements of this sample's or vanilla's
 * plain ids), and the `/tally` handler, which reads the command's arguments (`ActionEvent.args`),
 * the game rules (`World.gameRule`) and adds the count to `carp_caught` (`Player.addStat`).
 */
const SCRIPT_LINES = [
  'import { msm } from "msm:runtime";',
  '',
  '// Script API 1.7 (runtime 1.5.3) in the mobs and commands sample: the six new events, a',
  "// command's arguments, game rules and statistics.",
  `const NS = "${NAMESPACE}";`,
  '',
  'msm.events.on("item.picked_up", (e) => {',
  `  e.player.sendMessage(${JSON.stringify(SCRIPT_TEXT.picked)} + e.count + " " + e.item.id + ".");`,
  '});',
  '',
  'msm.events.on("player.ate", (e) => {',
  `  e.player.sendMessage(${JSON.stringify(SCRIPT_TEXT.ate)} + e.item.id + ".");`,
  '});',
  '',
  'msm.events.on("item.crafted", (e) => {',
  `  e.player.sendMessage(${JSON.stringify(SCRIPT_TEXT.crafted)} + e.count + " " + e.item.id + ".");`,
  '});',
  '',
  'msm.events.on("player.slept", (e) => {',
  `  e.player.sendMessage(${JSON.stringify(SCRIPT_TEXT.slept)});`,
  '});',
  '',
  'msm.events.on("player.woke", (e) => {',
  `  e.player.sendMessage(${JSON.stringify(SCRIPT_TEXT.woke)});`,
  '});',
  '',
  'msm.events.on("player.advancement", (e) => {',
  `  e.player.sendMessage(${JSON.stringify(SCRIPT_TEXT.advancement)} + e.advancement + ".");`,
  '});',
  '',
  '// /tally <count> <team> <effect> <mode> <span> <kind>: says what was typed, the game rules,',
  '// and adds the count to the carp caught statistic.',
  `msm.actions.define(${JSON.stringify(TALLY_HANDLER)}, (e) => {`,
  '  if (e.player === undefined || e.args === undefined) return;',
  '  const args = e.args;',
  '  const count = Number(args.count);',
  '  const total = e.player.addStat(NS + ":carp_caught", count);',
  '  const calm = e.world.gameRule(NS + ":calm_nights");',
  '  const bonus = e.world.gameRule(NS + ":merchant_bonus");',
  `  e.player.sendMessage(${JSON.stringify(SCRIPT_TEXT.tally)} + count + " " + String(args.team) + " " + String(args.effect) + " " + String(args.mode) + " " + String(args.kind) + "; calm " + String(calm) + ", bonus " + String(bonus) + ", carp caught " + total + ".");`,
  '});',
];

const SCRIPT_ELEMENTS: readonly SampleElement[] = [
  { id: SCRIPT, kind: 'msm:script', data: { lines: SCRIPT_LINES } },
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
        'Sample mobs and commands: a merchant who remembers you, a villager bed and look, maple syrup and hot tar with cauldrons and a bottle, eleven mobs with buckets, flight and habits, a larch boat, two commands, game rules, statistics, a tab in its own order and a script.',
      authors: ['MCSuperMods'],
      licence: 'MIT',
    },
  },
  ...MOBS.flatMap(mobElements),
  ...TRADER_ELEMENTS,
  ...FLUID_ELEMENTS,
  ...BOAT_ELEMENTS,
  ...COMMAND_ELEMENTS,
  ...SCRIPT_ELEMENTS,
];

const SAMPLE_ASSETS: readonly SampleAsset[] = [
  ...MOBS.flatMap((spec): SampleAsset[] => [
    {
      path: `textures/entity/${spec.name}.png`,
      bytes: presetSkinPng(spec.preset, { colour: spec.colour }),
    },
    {
      path: `textures/item/${spec.name}_spawn_egg.png`,
      bytes: placeholderPng('egg', { colour: spec.colour }),
    },
  ]),
  { path: 'textures/item/pond_carp_bucket.png', bytes: bucketPng(COLOURS.carp) },
  { path: 'textures/block/straw_mat.png', bytes: bedPng(COLOURS.strawCloth, COLOURS.straw) },
  ...(['villager', 'zombie_villager'] as const).map(
    (who, i): SampleAsset => ({
      path: `textures/entity/${who}/type/fen.png`,
      bytes: artLookPng({
        recipe: 'villager_robe',
        colour: COLOURS.fen,
        accent: COLOURS.fenHem,
        finish: 'sash',
        seed: 41 + i,
      }),
    }),
  ),
  { path: 'textures/block/maple_syrup_still.png', bytes: liquidPng(COLOURS.syrup, false) },
  { path: 'textures/block/maple_syrup_flow.png', bytes: liquidPng(COLOURS.syrup, true) },
  { path: 'textures/item/maple_syrup_bucket.png', bytes: bucketPng([181, 101, 29]) },
  { path: 'textures/block/hot_tar_still.png', bytes: liquidPng(COLOURS.tar, false) },
  { path: 'textures/block/hot_tar_flow.png', bytes: liquidPng(COLOURS.tar, true) },
  { path: 'textures/item/hot_tar_bucket.png', bytes: bucketPng(COLOURS.tar) },
  {
    path: 'textures/block/larch_planks.png',
    bytes: placeholderPng('planks', { colour: COLOURS.larch }),
  },
  {
    path: 'textures/item/larch_boat.png',
    bytes: artLookPng({ recipe: 'boat', colour: COLOURS.larch, finish: 'boat', seed: 51 }),
  },
  {
    path: 'textures/item/larch_chest_boat.png',
    bytes: artLookPng({ recipe: 'boat', colour: COLOURS.larch, finish: 'chest', seed: 52 }),
  },
  {
    path: 'textures/entity/boat/larch.png',
    bytes: artLookPng({ recipe: 'boat_layer', colour: COLOURS.larch, seed: 53 }),
  },
  {
    path: 'textures/entity/chest_boat/larch.png',
    bytes: artLookPng({ recipe: 'chest_boat_layer', colour: COLOURS.larch, seed: 54 }),
  },
];

const nameOf = (id: string): string => id.split(':')[1] as string;
const ofKind = (kind: string): string[] =>
  SAMPLE_ELEMENTS.filter((entry) => entry.kind === kind).map((entry) => nameOf(entry.id));
const ENTITY_NAMES = ofKind('msm:entity');
const FLUID_NAMES = ofKind('msm:fluid');
const BLOCK_NAMES = ofKind('msm:block');
const ITEM_NAMES = ofKind('msm:item');
const COMMAND_NAMES = ofKind('msm:command');
const GAME_RULE_NAMES = ofKind('msm:game_rule');
const STAT_NAMES = ofKind('msm:stat');
const VILLAGER_TYPE_NAMES = ofKind('msm:villager_type');
const BUCKETABLE_NAMES = SAMPLE_ELEMENTS.filter(
  (entry) =>
    entry.kind === 'msm:entity' &&
    'msm:bucketable' in (((entry.data as JsonRecord).components ?? {}) as JsonRecord),
).map((entry) => nameOf(entry.id));

/**
 * What the runtime counts in `registered N block(s) and M item(s)`: the block elements and their
 * items, the item elements, the spawn eggs and the mobs' buckets (fluids, their buckets,
 * cauldrons and bottles and the chest boat are counted on their own lines).
 */
const EXPECTED_BLOCKS = BLOCK_NAMES.length;
const EXPECTED_ITEMS =
  BLOCK_NAMES.length + ITEM_NAMES.length + ENTITY_NAMES.length + BUCKETABLE_NAMES.length;

/** The script file of the content jar. */
const SCRIPT_FILE = `msm/${NAMESPACE}/script/${nameOf(SCRIPT)}.js`;

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

/** The project as the app's session validates and exports it, expanded with zero problems. */
async function expandSample(target: TargetFacts): Promise<Project> {
  const expansion = await expandProject(await loadSample(), PLUGINS, target);
  expect(expansion.problems).toEqual([]);
  return expansion.project;
}

/**
 * Type-checks the script against the generated typings with `lib.es5` only, as
 * `sample-script.golden.test.ts` does.
 */
function typeCheckScript(lines: readonly string[]): string[] {
  const libDir = dirname(createRequire(import.meta.url).resolve('typescript/lib/lib.es5.d.ts'));
  const files = new Map<string, string>([
    ['/msm-runtime.d.ts', MSM_RUNTIME_TYPINGS],
    [`/script/${nameOf(SCRIPT)}.ts`, `${lines.join('\n')}\n`],
  ]);
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
 * registry (vanilla kinds under their own name), each block's item and generated models, each
 * mob's spawn egg and its model and a bucketable mob's bucket, each fluid's liquid block, bucket,
 * cauldron, bottle and models (and `flowing_` fluid where the target registers two), the boat's
 * chest boat (item and entity type) and the boat's entity type, and the textures of the
 * namespace's PNG assets.
 */
function projectIds(project: Project, target: TargetFacts): Record<string, string[]> {
  const ids: Record<string, string[]> = {};
  const add = (name: string, id: string): void => {
    ids[name] = [...(ids[name] ?? []), id];
  };
  const elements = elementsOf(project);
  const companions = fluidProfessionIdsOf(elements, target.blocks?.fluidModel === 'two_fluids');
  for (const [name, list] of Object.entries(companions)) for (const id of list) add(name, id);
  for (const element of elements) {
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
    if (element.kind === 'msm:entity') {
      add('item', `${element.id}_spawn_egg`);
      add('model', ns(`item/${nameOf(element.id)}_spawn_egg`));
      if (BUCKETABLE_NAMES.includes(nameOf(element.id))) {
        add('item', `${element.id}_bucket`);
        add('model', ns(`item/${nameOf(element.id)}_bucket`));
      }
    }
    if (element.kind === 'msm:fluid') {
      const path = nameOf(element.id);
      const data = element.data as JsonRecord;
      add('model', ns(`block/${path}`));
      add('model', ns(`item/${path}_bucket`));
      if (data.cauldron !== undefined) {
        const levels =
          (data.cauldron as JsonRecord).levels === true && data.behaves_like !== 'lava';
        const models = levels ? ['_level1', '_level2', '_full'] : [''];
        for (const suffix of models) add('model', ns(`block/${path}_cauldron${suffix}`));
      }
      if (data.bottle !== undefined) add('model', ns(`item/${path}_bottle`));
    }
    if (element.kind === 'msm:item' && element.id === BOAT) {
      add('entity_type', BOAT);
      add('entity_type', CHEST_BOAT);
      add('item', CHEST_BOAT);
      add('model', ns('item/larch_chest_boat'));
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
  const ids = projectIds(project, bundle.target);
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

describe('sample mobs and commands project', () => {
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

  it('loads with zero problems and holds one of each feature of batch 2', async () => {
    const project = await loadSample();
    expect(project.name).toBe(PROJECT_NAME);
    const components = (id: string): string[] => {
      const entity = elementsOf(project).find((e) => e.id === id && e.kind === 'msm:entity');
      const data = (entity?.data ?? {}) as JsonRecord;
      return Object.keys((data.components ?? {}) as JsonRecord);
    };
    expect(components(MERCHANT)).toContain('msm:trader');
    expect(components(CARP)).toContain('msm:bucketable');
    expect(components(OWL)).toContain('msm:shoulder_riding');
    expect(ENTITY_NAMES).toHaveLength(12);
    expect(BUCKETABLE_NAMES).toEqual(['pond_carp']);
    expect(FLUID_NAMES).toEqual(['maple_syrup', 'hot_tar']);
    expect(VILLAGER_TYPE_NAMES).toEqual(['fen']);
    expect(GAME_RULE_NAMES).toEqual(['calm_nights', 'merchant_bonus']);
    expect(STAT_NAMES).toEqual(['carp_caught', 'distance_hopped']);
    expect(COMMAND_NAMES).toEqual(['signal', 'tally']);
    expect(project.namespaces[0]?.assets.map((asset) => asset.path).sort()).toEqual(
      SAMPLE_ASSETS.map((asset) => asset.path).sort(),
    );
  });

  it('type-checks the script against the generated typings', () => {
    expect(typeCheckScript(SCRIPT_LINES)).toEqual([]);
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sample mobs and commands export (%s)',
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
        exporter: createFabricContentJarExporter({
          ...factory,
          transpileScript: async (source, name) => typescriptTranspile(source, name),
        }),
        sink,
        readAsset: (namespace, path) => sampleFs.readFile(`assets/${namespace}/${path}`),
        meta,
      });
      // Only the info that no TypeScript checker ran (the script is type-checked above).
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
      const elements = elementsOf(await expandSample(target));
      const found = (
        await Promise.all(
          VALIDATORS.map((validator) =>
            validator.validate({ elements, target, registry: context.registries }),
          ),
        )
      ).flat();
      expect(found).toEqual([]);
    });

    it('holds the definitions (valid), the script and the companions of the fluids, mobs and boat', async () => {
      const files = unzipSync(await exportJar());
      const paths = Object.keys(files).sort();
      const resource = target.folders.resource;
      const definitions: [string, string][] = [
        ...BLOCK_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/block/${name}.json`,
          MSM_SCHEMA_REFS.blockDefinition,
        ]),
        ...ITEM_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/item/${name}.json`,
          MSM_SCHEMA_REFS.itemDefinition,
        ]),
        ...ENTITY_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/entity/${name}.json`,
          MSM_SCHEMA_REFS.entityDefinition,
        ]),
        ...FLUID_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/fluid/${name}.json`,
          MSM_SCHEMA_REFS.fluidDefinition,
        ]),
        ...COMMAND_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/command/${name}.json`,
          MSM_SCHEMA_REFS.commandDefinition,
        ]),
        ...GAME_RULE_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/game_rule/${name}.json`,
          MSM_SCHEMA_REFS.gameRuleDefinition,
        ]),
        ...STAT_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/stat/${name}.json`,
          MSM_SCHEMA_REFS.statDefinition,
        ]),
        ...VILLAGER_TYPE_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/villager_type/${name}.json`,
          MSM_SCHEMA_REFS.villagerTypeDefinition,
        ]),
        [
          `msm/${NAMESPACE}/creative_tab/${nameOf(TAB)}.json`,
          MSM_SCHEMA_REFS.creativeTabDefinition,
        ],
      ];
      expect(paths.filter((path) => path.startsWith('msm/'))).toEqual(
        [...definitions.map(([path]) => path), SCRIPT_FILE].sort(),
      );
      for (const [path, ref] of definitions) {
        const json = JSON.parse(utf8.decode(files[path] as Uint8Array)) as Json;
        const node = context.schemaIndex.resolveSchemaRef(ref);
        expect(
          validateJson(json, node, { registries: context.registries }).map(
            (problem) => `${problem.path} ${problem.code}: ${problem.message}`,
          ),
          path,
        ).toEqual([]);
      }
      const script = utf8.decode(files[SCRIPT_FILE] as Uint8Array);
      for (const name of [
        'item.crafted',
        'item.picked_up',
        'player.ate',
        'player.slept',
        'player.woke',
        'player.advancement',
      ]) {
        expect(script, name).toContain(`"${name}"`);
      }
      expect(script).toContain(TALLY_HANDLER);
      for (const asset of SAMPLE_ASSETS) {
        expect(paths).toContain(`assets/${NAMESPACE}/${asset.path}`);
      }
      // The companions' client files: the fish bucket, the cauldrons and the bottle, the chest boat.
      for (const path of [
        `assets/${NAMESPACE}/items/pond_carp_bucket.json`,
        `assets/${NAMESPACE}/blockstates/maple_syrup_cauldron.json`,
        `assets/${NAMESPACE}/blockstates/hot_tar_cauldron.json`,
        `assets/${NAMESPACE}/items/maple_syrup_bottle.json`,
        `assets/${NAMESPACE}/items/larch_chest_boat.json`,
        `assets/${NAMESPACE}/blockstates/straw_mat.json`,
      ]) {
        expect(paths, path).toContain(path);
      }
      expect(paths).not.toContain(`assets/${NAMESPACE}/items/hot_tar_bottle.json`);
      const lang = JSON.parse(
        utf8.decode(files[`assets/${NAMESPACE}/${resource.lang}/en_us.json`] as Uint8Array),
      ) as Record<string, string>;
      expect(lang[`item.${NAMESPACE}.pond_carp_bucket`]).toBe('Bucket of Pond Carp');
      expect(lang[`item.${NAMESPACE}.maple_syrup_bottle`]).toBe('Bottle of Maple Syrup');
      expect(lang[`block.${NAMESPACE}.hot_tar_cauldron`]).toBe('Cauldron of Hot Tar');
      expect(lang[`item.${NAMESPACE}.larch_chest_boat`]).toBe('Larch Boat with Chest');
      expect(lang[`gamerule.${NAMESPACE}.calm_nights`]).toBe('Calm nights');
      expect(lang[`stat.${NAMESPACE}.distance_hopped`]).toBe('Distance hopped');
      // The tab's order by hand reaches the definition.
      const tab = JSON.parse(
        utf8.decode(files[`msm/${NAMESPACE}/creative_tab/${nameOf(TAB)}.json`] as Uint8Array),
      ) as { order: string; items: string[] };
      expect(tab.order).toBe('by_hand');
      expect(tab.items[0]).toBe(ns('pond_carp_bucket'));
    });

    it('keeps the trades, the dialog and the vanilla tags in the vanilla data pack', async () => {
      const project = await expandSample(target);
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
      });
      expect(
        report.problems.filter(
          (problem) => problem.severity !== 'info' && problem.code !== MOD_ONLY_REFERENCE,
        ),
      ).toEqual([]);
      expect(report.ok).toBe(true);
      const paths = [...sink.files().keys()].sort();
      expect(paths.some((path) => path.startsWith('msm/'))).toBe(false);
      // The vanilla tags the content joins (entries optional), the dialog, the merchant's trades
      // and set, and the cauldrons' loot tables (they drop vanilla's cauldron); the boats'
      // recipes and the blocks' loot tables name mod-only items and are left out.
      const data = target.folders.data;
      const tags = data.tags;
      const fluidTags =
        target.blocks?.fluidModel === 'two_fluids'
          ? ['lava', 'water']
          : ['lava', 'swimmable', 'water'];
      expect(paths).toEqual(
        [
          ...['beds', 'cauldrons', 'mineable/axe', 'mineable/pickaxe'].map(
            (tag) => `data/minecraft/${tags}/block/${tag}.json`,
          ),
          ...fluidTags.map((tag) => `data/minecraft/${tags}/fluid/${tag}.json`),
          ...['beds', 'boats', 'chest_boats'].map(
            (tag) => `data/minecraft/${tags}/item/${tag}.json`,
          ),
          `data/${NAMESPACE}/dialog/welcome.json`,
          `data/${NAMESPACE}/${data.loot_table}/blocks/hot_tar_cauldron.json`,
          `data/${NAMESPACE}/${data.loot_table}/blocks/maple_syrup_cauldron.json`,
          `data/${NAMESPACE}/trade_set/kind_merchant/level_1.json`,
          `data/${NAMESPACE}/villager_trade/kind_merchant/beef.json`,
          `data/${NAMESPACE}/villager_trade/kind_merchant/bread.json`,
          'msm.export.json',
          'pack.mcmeta',
        ].sort(),
      );
      expect(
        report.problems
          .filter((problem) => problem.code === MOD_ONLY_REFERENCE)
          .map((problem) => problem.file),
      ).toEqual([
        `data/${NAMESPACE}/${data.loot_table}/blocks/larch_planks.json`,
        `data/${NAMESPACE}/${data.loot_table}/blocks/straw_mat.json`,
        `data/${NAMESPACE}/${data.recipe}/larch_boat.json`,
        `data/${NAMESPACE}/${data.recipe}/larch_chest_boat.json`,
      ]);
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
      expect(paths.some((path) => path.startsWith('msm/'))).toBe(false);
    });

    describe('content jar', () => {
      const hashFile = join(fixturesRoot, target.id, 'sample-mobs-and-commands-jar.sha256');
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
    const outDir = process.env.MSM_SAMPLE_MOBS_COMMANDS_OUT;
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
          expectEntities: ENTITY_NAMES.length,
          expectItems: EXPECTED_ITEMS,
          expectScripts: 1,
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
