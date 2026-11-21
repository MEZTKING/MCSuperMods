/**
 * Golden over the committed villagers and fluids project (`fixtures/sample-villagers-and-fluids`,
 * ADRs 0098 to 0100, plan B482): namespace `msm_sample_villagers`, an `msm:mod` and one of each
 * feature of batch 2, each different enough for a parity test to tell apart:
 *
 * - `pedlar`, a trader mob (`msm:trader`) with two trade sets of its own (`pedlar/level_1`: 6
 *   glow berries for an emerald, an emerald for 10 wheat; `pedlar/level_2`: a name tag for 5
 *   emeralds) and vanilla's `minecraft:wandering_trader/common` at level 3, its own XP
 *   thresholds (10 and 30), restocking twice a day;
 * - `glassblower`, a villager profession whose job site is the project block
 *   `glassblower_bench`, with its apron for villagers and zombie villagers at the paths the game
 *   reads, the mason's work sound, and the five default trade sets lowering creates, filled by
 *   the trade tags `glassblower/level_1` (two trades of its own: an emerald for 12 sand, 4 glass
 *   for an emerald) to `glassblower/level_5` (vanilla's mason trades);
 * - `pack_mule`, a tameable, saddled animal with three rows of storage that need a chest
 *   (`msm:storage`, `needs_chest`);
 * - `sugar_glider`, a small tameable pet that sits on its owner's shoulder
 *   (`msm:shoulder_riding`);
 * - two fluids with MSM-drawn opaque still and flowing pictures and buckets: `brine` (water-like,
 *   tinted, `on_entity_inside` makes whoever is in it glow) and `molten_amber` (lava-like, light
 *   12, its own flow: one step every 10 ticks, 2 levels lost a block, slopes found 2 blocks
 *   away);
 * - the dimension type `glow_moon_sky` (a violet sky, stars by day, the sun standing still, no
 *   sleeping) and the flat dimension `glow_moon` using it (element ids are unique across kinds).
 *
 * The mobs use the library's presets (biped, quadruped, bird) drawn by the runtime's vanilla
 * renderer, so the content jar needs no GeckoLib on any version. Pictures are MSM's own (the
 * library's placeholder and preset skins, and the apron, liquids and buckets drawn here); none is
 * vanilla's.
 *
 * - The fixture equals the project built from {@link SAMPLE_ELEMENTS} and {@link SAMPLE_ASSETS}
 *   now; `UPDATE_GOLDENS=1` rewrites it (the README is hand-written).
 * - Every element validates with zero problems; the project expands with no problems and the
 *   plugins' project validators report nothing at all on every target (no info either).
 * - The content jar exports with zero errors and warnings, holds the definitions (valid), and
 *   its SHA-256 is pinned per target in two time zones
 *   (`test/fixtures/<target id>/sample-villagers-and-fluids-jar.sha256`).
 * - The vanilla data pack (ADR 0066, B478) keeps the trades, trade sets, trade tags, the
 *   dimension and its type, and the job site and fluid tag entries as optional ones.
 * - With `MSM_RUNTIME_JAR` (a built `msm_runtime` jar for the selected target) and
 *   `MSM_SAMPLE_VILLAGERS_OUT` (a folder), the jar is also exported with the real runtime nested
 *   and written to that folder as `msm_sample_villagers.jar`, next to `fabric-facts.json` for
 *   `tools/run-fabric-server`. Without them that test is skipped.
 *
 * The Java project eject leaves batch 2 out (B478: a warning per profession and fluid and the
 * components stripped), so this sample has no Java golden and parity runs on content jars only.
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
import blocksItemsPlugin, { blockGeneratedModelIds, blockItemIdOf } from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import entitiesPlugin, { defaultTradeSets } from '@msm/plugin-entities';
import {
  encodePng,
  MOB_PRESETS,
  placeholderPng,
  presetAnimationFields,
  presetSkinPng,
  type Rgb,
} from '@msm/plugin-library';
import modelsAnimPlugin from '@msm/plugin-models-anim';
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
import { builtInTargets, readVendoredJson, type TargetBundle } from '@msm/targets';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
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
  vanillaSafeExporter,
} from '../src/index';
import { defaultTarget, selectedTarget } from './selected-target';

// Expanding and exporting a project with mobs takes a few seconds; under load the default 5 s
// is too short (B368, B377).
vi.setConfig({ testTimeout: 60_000 });

const update = process.env.UPDATE_GOLDENS === '1';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, 'fixtures');
const sampleRoot = join(here, '..', '..', '..', 'fixtures', 'sample-villagers-and-fluids');
const NAMESPACE = 'msm_sample_villagers';
const PROJECT_NAME = 'MSM Sample Villagers and Fluids';
const NOW = '2026-11-21T00:00:00.000Z';
/** Files of the fixture that the test does not generate. */
const HAND_WRITTEN = new Set(['README.md']);

/** Two zones on opposite sides of the date line, so a local-time leak changes the bytes. */
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;

/** The plugins the sample needs, in the app's registration order. */
const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  worldgenPlugin,
  blocksItemsPlugin,
  entitiesPlugin,
  modelsAnimPlugin,
];
const VALIDATORS = PLUGINS.flatMap((plugin) => plugin.contributes.validators ?? []);

const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);

const meta = {
  msmVersion: '1.5.1',
  plugins: ['msm.blocks-items', 'msm.datapack', 'msm.entities', 'msm.models-anim', 'msm.worldgen'],
};
const stubRuntimeJar = utf8.encode('PK stub msm_runtime jar for the sample-villagers golden');

// The project -----------------------------------------------------------------------------

interface SampleElement {
  id: string;
  kind: string;
  data: Json;
}

interface SampleAsset {
  /** Path under the namespace's assets, such as `textures/block/brine_still.png`. */
  path: string;
  bytes: Uint8Array;
}

type JsonRecord = { [key: string]: Json };

const ns = (path: string): string => `${NAMESPACE}:${path}`;

const COLOURS = {
  pedlar: [92, 70, 140] as Rgb,
  apron: [38, 96, 178] as Rgb,
  benchWood: [132, 94, 58] as Rgb,
  benchTop: [200, 228, 236] as Rgb,
  mule: [140, 112, 84] as Rgb,
  glider: [176, 176, 168] as Rgb,
  /** Drawn light: the fluid's tint colours it in the game. */
  brine: [228, 240, 236] as Rgb,
  brineTint: 0x3aa69c,
  amber: [236, 150, 28] as Rgb,
  bucket: [168, 172, 180] as Rgb,
};

const PEDLAR = ns('pedlar');
const GLASSBLOWER = ns('glassblower');
const BENCH = ns('glassblower_bench');
const PACK_MULE = ns('pack_mule');
const SUGAR_GLIDER = ns('sugar_glider');
const BRINE = ns('brine');
const MOLTEN_AMBER = ns('molten_amber');
const GLOW_MOON = ns('glow_moon');
const GLOW_MOON_SKY = ns('glow_moon_sky');
const BRINE_INSIDE = ns('brine_inside');

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
 * picture, slanted streaks for the flowing one (B470: opaque pictures, so the tint is exact).
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

/** A 16 by 16 bucket of `liquid`: an iron pail seen from the side, the liquid at its top. */
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
 * A villager's job picture, 64 by 64: an apron of `apron` with a belt on the front of the body
 * (8 by 12 at 22, 26) and the robe (8 by 18 at 6, 44); everything else stays clear so the
 * villager's own look shows through. The zombie villager uses the same layout.
 */
function apronPng(apron: Rgb): Uint8Array {
  const out = canvas(64, 64);
  const edge = mix(apron, [0, 0, 0], 0.25);
  const belt = mix(apron, [40, 28, 20], 0.6);
  const paint = (x0: number, y0: number, height: number): void => {
    for (let y = 0; y < height; y += 1) {
      for (let x = 1; x < 7; x += 1) out.set(x0 + x, y0 + y, x === 1 || x === 6 ? edge : apron);
    }
  };
  paint(22, 26, 12);
  paint(6, 44, 18);
  for (let x = 22; x < 30; x += 1) out.set(x, 33, belt);
  return out.png();
}

const breakable = { hardness: 2.5, resistance: 2.5, tool: 'axe' };

/** A trade: `wants` (the price) for `gives`, `max_uses` before a restock and the XP it earns. */
const trade = (
  id: string,
  wants: [string, number],
  gives: [string, number],
  maxUses: number,
  xp: number,
): SampleElement => ({
  id: ns(id),
  kind: 'minecraft:villager_trade',
  data: {
    wants: { id: wants[0], count: wants[1] },
    gives: { id: gives[0], count: gives[1] },
    max_uses: maxUses,
    xp,
  },
});

const PEDLAR_ELEMENTS: readonly SampleElement[] = [
  {
    id: PEDLAR,
    kind: 'msm:entity',
    data: {
      format: 1,
      display_name: 'Pedlar',
      category: 'creature',
      size: { width: 0.6, height: 1.95 },
      spawn_egg: { texture: ns('item/pedlar_spawn_egg'), display_name: 'Pedlar Spawn Egg' },
      components: {
        'msm:health': { max: 20 },
        'msm:movement': { speed: 0.25 },
        'msm:ai_goals': {
          goals: [
            { type: 'panic', speed: 1.3 },
            { type: 'wander', speed: 0.6 },
            { type: 'look_at_player', distance: 8 },
            { type: 'look_around' },
          ],
        },
        'msm:trader': {
          trade_sets: [
            { trade_set: ns('pedlar/level_1'), xp_to_next: 10 },
            { trade_set: ns('pedlar/level_2'), xp_to_next: 30 },
            { trade_set: 'minecraft:wandering_trader/common' },
          ],
          levels: true,
          restock: 'twice_a_day',
        },
        'msm:animated_model': {
          model: ns('entity/pedlar'),
          animations: ns('entity/pedlar_animations'),
          texture: ns('entity/pedlar'),
          renderer: 'vanilla',
          ...presetAnimationFields('biped'),
        },
      },
    },
  },
  { id: ns('entity/pedlar'), kind: 'msm:geo_model', data: MOB_PRESETS.biped.geometry('pedlar') },
  {
    id: ns('entity/pedlar_animations'),
    kind: 'msm:animation',
    data: MOB_PRESETS.biped.animations(),
  },
  trade('pedlar/glow_berries', ['minecraft:emerald', 1], ['minecraft:glow_berries', 6], 3, 5),
  trade('pedlar/wheat', ['minecraft:wheat', 10], ['minecraft:emerald', 1], 4, 5),
  trade('pedlar/name_tag', ['minecraft:emerald', 5], ['minecraft:name_tag', 1], 2, 10),
  {
    id: ns('pedlar/level_1'),
    kind: 'minecraft:trade_set',
    data: { amount: 2, trades: [ns('pedlar/glow_berries'), ns('pedlar/wheat')] },
  },
  {
    id: ns('pedlar/level_2'),
    kind: 'minecraft:trade_set',
    data: { amount: 1, trades: [ns('pedlar/name_tag')] },
  },
];

const GLASSBLOWER_ELEMENTS: readonly SampleElement[] = [
  {
    id: GLASSBLOWER,
    kind: 'msm:villager_profession',
    data: {
      format: 1,
      display_name: 'Glassblower',
      job_site: BENCH,
      textures: {
        villager: ns('entity/villager/profession/glassblower'),
        zombie_villager: ns('entity/zombie_villager/profession/glassblower'),
      },
      work_sound: 'minecraft:entity.villager.work_mason',
    },
  },
  {
    id: BENCH,
    kind: 'msm:block',
    data: {
      format: 1,
      display_name: 'Glassblower Bench',
      model: ns('block/glassblower_bench'),
      sound_type: 'wood',
      loot: 'self',
      item: { creative_tab: 'minecraft:functional_blocks' },
      components: { 'msm:breakable': breakable },
    },
  },
  {
    id: ns('block/glassblower_bench'),
    kind: 'minecraft:model',
    data: {
      parent: 'minecraft:block/cube_bottom_top',
      textures: {
        top: ns('block/glassblower_bench_top'),
        side: ns('block/glassblower_bench_side'),
        bottom: ns('block/glassblower_bench_bottom'),
      },
    },
  },
  trade('glassblower/1/sand', ['minecraft:sand', 12], ['minecraft:emerald', 1], 16, 2),
  trade('glassblower/1/glass', ['minecraft:emerald', 1], ['minecraft:glass', 4], 12, 2),
  ...[1, 2, 3, 4, 5].map(
    (level): SampleElement => ({
      id: ns(`glassblower/level_${level}`),
      kind: 'minecraft:tag/villager_trade',
      data: {
        values:
          level === 1
            ? [ns('glassblower/1/glass'), ns('glassblower/1/sand')]
            : [`#minecraft:mason/level_${level}`],
      },
    }),
  ),
];

const PACK_MULE_ELEMENTS: readonly SampleElement[] = [
  {
    id: PACK_MULE,
    kind: 'msm:entity',
    data: {
      format: 1,
      display_name: 'Pack Mule',
      base: 'animal',
      category: 'creature',
      size: { width: 1.3, height: 1.5 },
      spawn_egg: { texture: ns('item/pack_mule_spawn_egg'), display_name: 'Pack Mule Spawn Egg' },
      components: {
        'msm:health': { max: 22 },
        'msm:movement': { speed: 0.175 },
        'msm:tameable': {
          items: ['minecraft:apple'],
          chance: 0.25,
          sit: false,
          follows_owner: false,
          defends_owner: false,
        },
        'msm:rideable': { saddle: true, controlled_by: 'owner', speed: 1, jump: 0.5 },
        'msm:storage': { rows: 3, needs_chest: true },
        'msm:ai_goals': {
          goals: [
            { type: 'panic', speed: 1.2 },
            { type: 'tempt', items: ['minecraft:apple'], speed: 1 },
            { type: 'wander' },
            { type: 'look_at_player' },
            { type: 'look_around' },
          ],
        },
        'msm:animated_model': {
          model: ns('entity/pack_mule'),
          animations: ns('entity/pack_mule_animations'),
          texture: ns('entity/pack_mule'),
          renderer: 'vanilla',
          ...presetAnimationFields('quadruped'),
        },
      },
    },
  },
  {
    id: ns('entity/pack_mule'),
    kind: 'msm:geo_model',
    data: MOB_PRESETS.quadruped.geometry('pack_mule'),
  },
  {
    id: ns('entity/pack_mule_animations'),
    kind: 'msm:animation',
    data: MOB_PRESETS.quadruped.animations(),
  },
];

const SUGAR_GLIDER_ELEMENTS: readonly SampleElement[] = [
  {
    id: SUGAR_GLIDER,
    kind: 'msm:entity',
    data: {
      format: 1,
      display_name: 'Sugar Glider',
      base: 'animal',
      category: 'creature',
      size: { width: 0.5, height: 0.5 },
      spawn_egg: {
        texture: ns('item/sugar_glider_spawn_egg'),
        display_name: 'Sugar Glider Spawn Egg',
      },
      components: {
        'msm:health': { max: 6 },
        'msm:movement': { speed: 0.3 },
        'msm:tameable': {
          items: ['minecraft:sweet_berries'],
          chance: 0.33,
          sit: true,
          follows_owner: true,
          defends_owner: false,
        },
        'msm:shoulder_riding': {},
        'msm:ai_goals': {
          goals: [
            { type: 'panic', speed: 1.4 },
            { type: 'wander' },
            { type: 'look_at_player' },
            { type: 'look_around' },
          ],
        },
        'msm:animated_model': {
          model: ns('entity/sugar_glider'),
          animations: ns('entity/sugar_glider_animations'),
          texture: ns('entity/sugar_glider'),
          renderer: 'vanilla',
          ...presetAnimationFields('bird'),
        },
      },
    },
  },
  {
    id: ns('entity/sugar_glider'),
    kind: 'msm:geo_model',
    data: MOB_PRESETS.bird.geometry('sugar_glider'),
  },
  {
    id: ns('entity/sugar_glider_animations'),
    kind: 'msm:animation',
    data: MOB_PRESETS.bird.animations(),
  },
];

const FLUID_ELEMENTS: readonly SampleElement[] = [
  {
    id: BRINE,
    kind: 'msm:fluid',
    data: {
      format: 1,
      display_name: 'Brine',
      bucket_display_name: 'Bucket of Brine',
      behaves_like: 'water',
      tint: COLOURS.brineTint,
      on_entity_inside: BRINE_INSIDE,
      events: {
        [BRINE_INSIDE]: {
          actions: [
            {
              type: 'apply_effect',
              target: 'other',
              effect: 'minecraft:glowing',
              seconds: 3,
              amplifier: 0,
            },
          ],
        },
      },
      textures: {
        still: ns('block/brine_still'),
        flowing: ns('block/brine_flow'),
        bucket: ns('item/brine_bucket'),
      },
    },
  },
  {
    id: MOLTEN_AMBER,
    kind: 'msm:fluid',
    data: {
      format: 1,
      display_name: 'Molten Amber',
      bucket_display_name: 'Bucket of Molten Amber',
      behaves_like: 'lava',
      light: 12,
      flow: { tick_delay: 10, slope_distance: 2, drop_off: 2, infinite: false },
      textures: {
        still: ns('block/molten_amber_still'),
        flowing: ns('block/molten_amber_flow'),
        bucket: ns('item/molten_amber_bucket'),
      },
    },
  },
];

/** The Glow Moon and its type: attributes both targets list (`worldgen.environmentAttributes`). */
const GLOW_MOON_ELEMENTS: readonly SampleElement[] = [
  {
    id: GLOW_MOON_SKY,
    kind: 'minecraft:dimension_type',
    data: {
      has_skylight: true,
      has_ceiling: false,
      has_ender_dragon_fight: false,
      coordinate_scale: 1,
      ambient_light: 0.1,
      min_y: 0,
      height: 256,
      logical_height: 256,
      infiniburn: '#minecraft:infiniburn_overworld',
      monster_spawn_light_level: { type: 'minecraft:uniform', min_inclusive: 0, max_inclusive: 7 },
      monster_spawn_block_light_limit: 0,
      skybox: 'overworld',
      has_fixed_time: true,
      timelines: '#minecraft:universal',
      attributes: {
        'minecraft:visual/sky_color': '#5a2d91',
        'minecraft:visual/fog_color': '#2a1640',
        'minecraft:visual/sun_angle': 60,
        'minecraft:visual/moon_angle': 240,
        'minecraft:visual/star_angle': 60,
        'minecraft:visual/star_brightness': 1,
        'minecraft:gameplay/bed_rule': { can_set_spawn: 'always', can_sleep: 'never' },
        'minecraft:gameplay/can_start_raid': false,
      },
    },
  },
  {
    id: GLOW_MOON,
    kind: 'minecraft:dimension',
    data: {
      type: GLOW_MOON_SKY,
      generator: {
        type: 'minecraft:flat',
        settings: {
          biome: 'minecraft:plains',
          features: false,
          lakes: false,
          layers: [
            { block: 'minecraft:bedrock', height: 1 },
            { block: 'minecraft:end_stone', height: 3 },
          ],
          structure_overrides: [],
        },
      },
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
        'Sample villagers and fluids: a pedlar who trades, a glassblower job for villagers, a pack mule with storage, a shoulder pet, brine and molten amber, and the Glow Moon.',
      authors: ['MCSuperMods'],
      licence: 'MIT',
    },
  },
  ...PEDLAR_ELEMENTS,
  ...GLASSBLOWER_ELEMENTS,
  ...PACK_MULE_ELEMENTS,
  ...SUGAR_GLIDER_ELEMENTS,
  ...FLUID_ELEMENTS,
  ...GLOW_MOON_ELEMENTS,
];

const SAMPLE_ASSETS: readonly SampleAsset[] = [
  { path: 'textures/entity/pedlar.png', bytes: presetSkinPng('biped', { colour: COLOURS.pedlar }) },
  {
    path: 'textures/entity/pack_mule.png',
    bytes: presetSkinPng('quadruped', { colour: COLOURS.mule }),
  },
  {
    path: 'textures/entity/sugar_glider.png',
    bytes: presetSkinPng('bird', { colour: COLOURS.glider }),
  },
  ...(
    [
      ['pedlar', COLOURS.pedlar],
      ['pack_mule', COLOURS.mule],
      ['sugar_glider', COLOURS.glider],
    ] as const
  ).map(
    ([name, colour]): SampleAsset => ({
      path: `textures/item/${name}_spawn_egg.png`,
      bytes: placeholderPng('egg', { colour }),
    }),
  ),
  { path: 'textures/entity/villager/profession/glassblower.png', bytes: apronPng(COLOURS.apron) },
  {
    path: 'textures/entity/zombie_villager/profession/glassblower.png',
    bytes: apronPng(COLOURS.apron),
  },
  {
    path: 'textures/block/glassblower_bench_top.png',
    bytes: placeholderPng('plain', { colour: COLOURS.benchTop }),
  },
  {
    path: 'textures/block/glassblower_bench_side.png',
    bytes: placeholderPng('planks', { colour: COLOURS.benchWood }),
  },
  {
    path: 'textures/block/glassblower_bench_bottom.png',
    bytes: placeholderPng('plain', { colour: COLOURS.benchWood }),
  },
  { path: 'textures/block/brine_still.png', bytes: liquidPng(COLOURS.brine, false) },
  { path: 'textures/block/brine_flow.png', bytes: liquidPng(COLOURS.brine, true) },
  {
    path: 'textures/item/brine_bucket.png',
    bytes: bucketPng(mix(COLOURS.brine, [58, 166, 156], 0.8)),
  },
  { path: 'textures/block/molten_amber_still.png', bytes: liquidPng(COLOURS.amber, false) },
  { path: 'textures/block/molten_amber_flow.png', bytes: liquidPng(COLOURS.amber, true) },
  { path: 'textures/item/molten_amber_bucket.png', bytes: bucketPng(COLOURS.amber) },
];

const nameOf = (id: string): string => id.split(':')[1] as string;
const ofKind = (kind: string): string[] =>
  SAMPLE_ELEMENTS.filter((entry) => entry.kind === kind).map((entry) => nameOf(entry.id));
const ENTITY_NAMES = ofKind('msm:entity');
const FLUID_NAMES = ofKind('msm:fluid');
const PROFESSION_NAMES = ofKind('msm:villager_profession');
const BLOCK_NAMES = ofKind('msm:block');

/**
 * What the runtime counts in `registered N block(s) and M item(s)`: the block elements and their
 * items, and the spawn eggs (fluids, their liquid blocks and buckets are counted on their own line,
 * `registered N fluid(s)`).
 */
const EXPECTED_BLOCKS = BLOCK_NAMES.length;
const EXPECTED_ITEMS = BLOCK_NAMES.length + ENTITY_NAMES.length;

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

// Registries and checkers -------------------------------------------------------------------

/**
 * The project's own ids per registry, as the app derives them (B478, B480, B481): element ids
 * under their kind's registry (vanilla kinds under their own name), each block's item and
 * generated models, each mob's spawn egg and its model, each fluid's liquid block, bucket and
 * models (and `flowing_` fluid where the target registers two), each profession's point of
 * interest type and its default trade sets, and the textures of the namespace's PNG assets.
 */
function projectIds(project: Project, target: TargetFacts): Record<string, string[]> {
  const ids: Record<string, string[]> = {};
  const add = (name: string, id: string): void => {
    ids[name] = [...(ids[name] ?? []), id];
  };
  const elements = elementsOf(project);
  const batch2 = fluidProfessionIdsOf(elements, target.blocks?.fluidModel === 'two_fluids');
  for (const [name, list] of Object.entries(batch2)) for (const id of list) add(name, id);
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
    }
    if (element.kind === 'msm:fluid') {
      add('model', ns(`block/${nameOf(element.id)}`));
      add('model', ns(`item/${nameOf(element.id)}_bucket`));
    }
    if (element.kind === 'msm:villager_profession') {
      for (const set of defaultTradeSets(element.id)) {
        add('trade_set', set);
        add('tag/villager_trade', set);
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

describe('sample villagers and fluids project', () => {
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

  it('loads with zero problems and holds a trader, a profession, storage, a shoulder pet, two fluids and a dimension type', async () => {
    const project = await loadSample();
    expect(project.name).toBe(PROJECT_NAME);
    const components = (id: string): string[] => {
      const entity = elementsOf(project).find((e) => e.id === id && e.kind === 'msm:entity');
      const data = (entity?.data ?? {}) as JsonRecord;
      return Object.keys((data.components ?? {}) as JsonRecord);
    };
    expect(components(PEDLAR)).toContain('msm:trader');
    expect(components(PACK_MULE)).toContain('msm:storage');
    expect(components(SUGAR_GLIDER)).toContain('msm:shoulder_riding');
    expect(PROFESSION_NAMES).toEqual(['glassblower']);
    expect(FLUID_NAMES).toEqual(['brine', 'molten_amber']);
    expect(ofKind('minecraft:dimension_type')).toEqual(['glow_moon_sky']);
    expect(ofKind('minecraft:dimension')).toEqual(['glow_moon']);
    expect(project.namespaces[0]?.assets.map((asset) => asset.path).sort()).toEqual(
      SAMPLE_ASSETS.map((asset) => asset.path).sort(),
    );
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sample villagers and fluids export (%s)',
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
      expect(report.problems).toEqual([]);
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

    it('holds the definitions (valid), the profession pictures, the liquid models and the fluid tags', async () => {
      const files = unzipSync(await exportJar());
      const paths = Object.keys(files).sort();
      const resource = target.folders.resource;
      const data = target.folders.data;
      const definitions: [string, string][] = [
        ...BLOCK_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/block/${name}.json`,
          MSM_SCHEMA_REFS.blockDefinition,
        ]),
        ...ENTITY_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/entity/${name}.json`,
          MSM_SCHEMA_REFS.entityDefinition,
        ]),
        ...FLUID_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/fluid/${name}.json`,
          MSM_SCHEMA_REFS.fluidDefinition,
        ]),
        ...PROFESSION_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/villager_profession/${name}.json`,
          MSM_SCHEMA_REFS.villagerProfessionDefinition,
        ]),
      ];
      expect(paths.filter((path) => path.startsWith('msm/'))).toEqual(
        definitions.map(([path]) => path).sort(),
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
      for (const asset of SAMPLE_ASSETS) {
        expect(paths).toContain(`assets/${NAMESPACE}/${asset.path}`);
      }
      // The liquid block's model names the still and flowing pictures (ADR 0099 D1, B477).
      for (const name of FLUID_NAMES) {
        const model = JSON.parse(
          utf8.decode(files[`assets/${NAMESPACE}/models/block/${name}.json`] as Uint8Array),
        ) as { textures: Record<string, string> };
        expect(model.textures.still).toBe(ns(`block/${name}_still`));
        expect(model.textures.flowing).toBe(ns(`block/${name}_flow`));
        expect(paths).toContain(`assets/${NAMESPACE}/blockstates/${name}.json`);
        expect(paths).toContain(`assets/${NAMESPACE}/items/${name}_bucket.json`);
      }
      const lang = JSON.parse(
        utf8.decode(files[`assets/${NAMESPACE}/${resource.lang}/en_us.json`] as Uint8Array),
      ) as Record<string, string>;
      expect(lang[`entity.${NAMESPACE}.villager.glassblower`]).toBe('Glassblower');
      expect(lang[`item.${NAMESPACE}.brine_bucket`]).toBe('Bucket of Brine');
      expect(lang[`block.${NAMESPACE}.molten_amber`]).toBe('Molten Amber');
      // The job site entry and the default trade sets (B476), the fluid tags per target (B477).
      const acquirable = JSON.parse(
        utf8.decode(
          files[
            `data/minecraft/${data.tags}/point_of_interest_type/acquirable_job_site.json`
          ] as Uint8Array,
        ),
      ) as { values: Json[] };
      expect(acquirable.values).toEqual([{ id: GLASSBLOWER, required: false }]);
      for (const set of defaultTradeSets(GLASSBLOWER)) {
        expect(paths).toContain(`data/${NAMESPACE}/trade_set/${nameOf(set)}.json`);
      }
      const twoFluids = target.blocks?.fluidModel === 'two_fluids';
      const fluidTags = paths.filter((path) =>
        path.startsWith(`data/minecraft/${data.tags}/fluid/`),
      );
      expect(fluidTags.length).toBeGreaterThan(0);
      const tagged = fluidTags.flatMap(
        (path) =>
          (JSON.parse(utf8.decode(files[path] as Uint8Array)) as { values: string[] }).values,
      );
      expect(tagged).toContain(BRINE);
      expect(tagged).toContain(MOLTEN_AMBER);
      expect(tagged.includes(ns('flowing_brine'))).toBe(twoFluids);
    });

    it('keeps the trades, sets, tags and the Glow Moon in the vanilla data pack', async () => {
      const project = await expandSample(target);
      const modOnly = modOnlyIdsOf(context.ids, []);
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
      // The vanilla tags the content joins (entries optional), the job's trades, sets and tags,
      // the pedlar's, and the Glow Moon; the bench's loot table names the mod-only bench.
      const data = target.folders.data;
      const tags = data.tags;
      const fluidTags =
        target.blocks?.fluidModel === 'two_fluids'
          ? ['lava', 'water']
          : ['lava', 'swimmable', 'water'];
      expect(paths).toEqual(
        [
          `data/minecraft/${tags}/block/mineable/axe.json`,
          `data/minecraft/${tags}/entity_type/can_equip_saddle.json`,
          ...fluidTags.map((tag) => `data/minecraft/${tags}/fluid/${tag}.json`),
          `data/minecraft/${tags}/point_of_interest_type/acquirable_job_site.json`,
          `data/${NAMESPACE}/dimension/glow_moon.json`,
          `data/${NAMESPACE}/dimension_type/glow_moon_sky.json`,
          ...[1, 2, 3, 4, 5].flatMap((level) => [
            `data/${NAMESPACE}/${tags}/villager_trade/glassblower/level_${level}.json`,
            `data/${NAMESPACE}/trade_set/glassblower/level_${level}.json`,
          ]),
          `data/${NAMESPACE}/trade_set/pedlar/level_1.json`,
          `data/${NAMESPACE}/trade_set/pedlar/level_2.json`,
          `data/${NAMESPACE}/villager_trade/glassblower/1/glass.json`,
          `data/${NAMESPACE}/villager_trade/glassblower/1/sand.json`,
          `data/${NAMESPACE}/villager_trade/pedlar/glow_berries.json`,
          `data/${NAMESPACE}/villager_trade/pedlar/name_tag.json`,
          `data/${NAMESPACE}/villager_trade/pedlar/wheat.json`,
          'msm.export.json',
          'pack.mcmeta',
        ].sort(),
      );
      expect(
        report.problems
          .filter((problem) => problem.code === MOD_ONLY_REFERENCE)
          .map((problem) => problem.file),
      ).toEqual([`data/${NAMESPACE}/${data.loot_table}/blocks/glassblower_bench.json`]);
      const acquirable = JSON.parse(
        utf8.decode(
          sink
            .files()
            .get(
              `data/minecraft/${tags}/point_of_interest_type/acquirable_job_site.json`,
            ) as Uint8Array,
        ),
      ) as { values: Json[] };
      expect(acquirable.values).toEqual([{ id: GLASSBLOWER, required: false }]);
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
      const hashFile = join(fixturesRoot, target.id, 'sample-villagers-and-fluids-jar.sha256');
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
    const outDir = process.env.MSM_SAMPLE_VILLAGERS_OUT;
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
