/**
 * Golden over the committed vehicles project (`fixtures/sample-vehicles`, ADRs 0088 to 0091,
 * plan B425): namespace `msm_sample_vehicles`, an `msm:mod` and one vehicle for every movement
 * mode (and a helicopter, so a rotor is checked too), each different enough for a parity test
 * (B426) to tell apart:
 *
 * - `racing_car` (`ground`): two seats, coal or charcoal, a horn, a boot of one row (the only
 *   storage), red, blue and yellow paints switched with dyes, exhaust smoke, wheels that spin and
 *   steer;
 * - `motorboat` (`water`): placed on water, a horn and a propeller, no fuel;
 * - `swamp_buggy` (`amphibious`): drives on land and floats on water, placed on either;
 * - `biplane` (`air`): coal, lifts off above half its top speed, a propeller and wheels;
 * - `hovercraft` (`hover`): dried kelp blocks, jump climbs and "Vehicle: descend" sinks, a fan;
 * - `helicopter` (`hover`, extra): coal, a rotor (spun about its vertical axis, the only one in
 *   the sample) and a tail rotor;
 * - `battle_tank` (`ground`, turns in place): blaze rods, a turret with a pitching barrel, a
 *   cannon on "Vehicle: fire" firing the project's own throwable shell (`battle_tank_shell`,
 *   whose hits `explode` without breaking blocks) loaded as ammunition (16), a machine gun on
 *   "Vehicle: second weapon" firing vanilla arrows while held, recoil, ram damage, smoke after
 *   each cannon shot (`on_fire`), immune to fire, explodes when destroyed.
 *
 * Every vehicle is repaired with the project's `repair_kit`; the shell and the kit have crafting
 * recipes. Two key binds with events: `flare` (J, while seated) calls the script handler that
 * spends flare charge and sends up a flare; `status` (K) shows a line of text while held
 * (`show_hud`, `set_hud`, `hide_hud`). Four HUD elements: the bar `flare_charge` from script data
 * (refilled by the script every second), the text `speedometer` from a vehicle stat (speed), the
 * text `tank_shells` (the tank's ammunition, only while driving it) and the hidden text
 * `status_line`; every vehicle keeps the built-in dashboard.
 *
 * Models and pictures are MSM-made only: the car, tank, plane and boat use the library's Creator
 * flows (their boxed geometries, the painter and the item pictures, B422); the swamp buggy, the
 * hovercraft and the helicopter use the entities plugin's starter geometries (`vehicleGeometry`,
 * B414) painted with the library's box painter (`boxSkinPng`) and the flows' item pictures in
 * their own colours. The pictures are deflated (`compactPng`) with their pixels unchanged.
 * Geometries face -z. Engine, horn and weapon sounds are vanilla sound event ids. Nothing is
 * Mojang's.
 *
 * - The fixture equals the project built from {@link SAMPLE_ELEMENTS} and {@link SAMPLE_ASSETS}
 *   now; `UPDATE_GOLDENS=1` rewrites it (the README is hand-written).
 * - Every element validates with zero problems, the plugins' project validators report nothing
 *   on every target and the script type-checks against the generated typings.
 * - The content jar exports with zero errors and warnings, holds the vehicle, key bind and HUD
 *   definitions (valid), the geo models, textures, item models, language keys and the script as
 *   JavaScript, and its SHA-256 is pinned per target in two time zones
 *   (`test/fixtures/<target id>/sample-vehicles-jar.sha256`).
 * - The vanilla packs carry nothing of the vehicles, keys or HUD (they need the Fabric mod jar):
 *   no `msm/`, no script; the data pack leaves out the two recipes making mod items with
 *   `export.mod-only-reference`.
 * - With `MSM_RUNTIME_JAR` (a built `msm_runtime` jar for the selected target) and
 *   `MSM_SAMPLE_VEHICLES_OUT` (a folder), the jar is also exported with the real runtime nested
 *   and written to that folder as `msm_sample_vehicles.jar`, next to `fabric-facts.json` for
 *   `tools/run-fabric-server` (whose `--expect-line` pins the vehicle, key bind and HUD counts,
 *   {@link EXPECTED_LOG_LINES}). Without them that test is skipped.
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
  loadProject,
  type MemoryFileSystem,
  type ProjectFileSystem,
  registerPlugin,
  saveProject,
  utf8,
} from '@msm/core';
import type {
  ContentBundle,
  Element,
  Json,
  JsonObject,
  Plugin,
  Problem,
  Project,
} from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import controlsPlugin from '@msm/plugin-controls';
import dataPackPlugin from '@msm/plugin-datapack';
import entitiesPlugin, { vehicleGeometry } from '@msm/plugin-entities';
import {
  boxSkinPng,
  encodePng,
  COLOURS as LIBRARY_COLOURS,
  libraryStarters,
  placeholderPng,
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
import { unzipSync, unzlibSync, zlibSync } from 'fflate';
import ts from 'typescript';
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
  type ScriptTranspileResult,
  vanillaSafeExporter,
} from '../src/index';
import { defaultTarget, selectedTarget } from './selected-target';

// Exporting six vehicles with their pictures takes a few seconds; under load the default 5 s is
// too short (as the rules sample, B368).
vi.setConfig({ testTimeout: 60_000 });

const update = process.env.UPDATE_GOLDENS === '1';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, 'fixtures');
const sampleRoot = join(here, '..', '..', '..', 'fixtures', 'sample-vehicles');
const NAMESPACE = 'msm_sample_vehicles';
const PROJECT_NAME = 'MSM Sample Vehicles';
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
  entitiesPlugin,
  modelsAnimPlugin,
  scriptingPlugin,
  controlsPlugin,
];
const VALIDATORS = PLUGINS.flatMap((plugin) => plugin.contributes.validators ?? []);

const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);

const meta = {
  msmVersion: '1.4.0',
  plugins: [
    'msm.blocks-items',
    'msm.controls',
    'msm.datapack',
    'msm.entities',
    'msm.models-anim',
    'msm.scripting',
  ],
};
const stubRuntimeJar = utf8.encode('PK stub msm_runtime jar for the sample-vehicles golden');

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

// Models and pictures -----------------------------------------------------------------------

interface SampleElement {
  id: string;
  kind: string;
  data: Json;
}

interface SampleAsset {
  /** Path under the namespace's assets, such as `textures/entity/racing_car.png`. */
  path: string;
  bytes: Uint8Array;
}

type JsonRecord = { [key: string]: Json };

const ns = (path: string): string => `${NAMESPACE}:${path}`;
const hex = ([r, g, b]: Rgb): string =>
  `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;

/** Body colours of the six vehicles and their paints. */
const COLOURS = {
  racing_car: [196, 28, 52] as Rgb,
  motorboat: [36, 84, 196] as Rgb,
  swamp_buggy: [74, 120, 64] as Rgb,
  biplane: [222, 148, 32] as Rgb,
  hovercraft: [232, 112, 40] as Rgb,
  helicopter: [60, 140, 150] as Rgb,
  battle_tank: [88, 112, 52] as Rgb,
  repair_kit: LIBRARY_COLOURS.slate,
} as const satisfies Record<string, Rgb>;

/** The car's paints (the library flow's "Extra paints": red, blue and yellow dye). */
const CAR_PAINTS = ['red', 'blue', 'yellow'] as const;

/**
 * Builds one of the library's vehicle Creator flows (B422) for the sample's namespace with the
 * flow's defaults and `values`, as the Creator does.
 */
async function flow(id: string, values: Record<string, Json>): Promise<ContentBundle> {
  const starter = libraryStarters.find((entry) => entry.id === id);
  if (starter === undefined) throw new Error(`the library has no starter ${id}`);
  const defaults: Record<string, Json> = {};
  for (const parameter of starter.parameters ?? []) {
    if (parameter.default !== undefined) defaults[parameter.id] = parameter.default as Json;
  }
  return starter.build({
    namespace: NAMESPACE,
    projectName: PROJECT_NAME,
    target: defaultTarget().target,
    values: { ...defaults, ...values },
  });
}

/** The data of a bundle's element `id`. */
function bundleData(bundle: ContentBundle, id: string): JsonObject {
  const found = bundle.elements.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`the bundle has no element ${id}`);
  return found.data as JsonObject;
}

/** The bytes of a bundle's asset at `path`. */
function bundleAsset(bundle: ContentBundle, path: string): Uint8Array {
  const found = bundle.assets?.find((entry) => entry.path === path);
  if (found === undefined) throw new Error(`the bundle has no asset ${path}`);
  return found.bytes;
}

const CAR_FLOW = await flow('vehicle-car', {
  car_name: 'Racing Car',
  colour: hex(COLOURS.racing_car),
  paints: true,
});
const BOAT_FLOW = await flow('vehicle-boat', {
  boat_name: 'Motorboat',
  colour: hex(COLOURS.motorboat),
});
const PLANE_FLOW = await flow('vehicle-plane', {
  plane_name: 'Biplane',
  colour: hex(COLOURS.biplane),
});
const TANK_FLOW = await flow('vehicle-tank', {
  tank_name: 'Battle Tank',
  colour: hex(COLOURS.battle_tank),
  cannon: true,
});
/** Only for the swamp buggy's item picture (a car in green). */
const BUGGY_PICTURE_FLOW = await flow('vehicle-car', {
  car_name: 'Swamp Buggy',
  colour: hex(COLOURS.swamp_buggy),
});
/** Only for the helicopter's item picture (a plane in teal). */
const HELI_PICTURE_FLOW = await flow('vehicle-plane', {
  plane_name: 'Helicopter',
  colour: hex(COLOURS.helicopter),
});
/** Only for the hovercraft's item picture (a boat in orange). */
const HOVER_PICTURE_FLOW = await flow('vehicle-boat', {
  boat_name: 'Hovercraft',
  colour: hex(COLOURS.hovercraft),
});

/** Tyres, propellers and fans are dark (the flows' painter's tone); the rest is the body colour. */
const DARK: Rgb = [52, 52, 60];

/** The RGBA pixels of a PNG the library's `encodePng` wrote (one IDAT, filter none). */
function pixelsOf(png: Uint8Array): Uint8Array {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const parts: Uint8Array[] = [];
  for (let at = 8; at < png.length; ) {
    const length = view.getUint32(at);
    const type = utf8.decode(png.subarray(at + 4, at + 8));
    if (type === 'IDAT') parts.push(png.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = unzlibSync(Uint8Array.from(parts.flatMap((part) => [...part])));
  const stride = 1 + width * 4;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    if (raw[y * stride] !== 0) throw new Error('only filter none is read');
    rgba.set(raw.subarray(y * stride + 1, (y + 1) * stride), y * width * 4);
  }
  return rgba;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** One PNG chunk: length, type, data and CRC-32. */
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const body = Uint8Array.from([...utf8.encode(type), ...data]);
  let c = 0xffffffff;
  for (const byte of body) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  const out = new Uint8Array(body.length + 8);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(body.length + 4, (c ^ 0xffffffff) >>> 0);
  return out;
}

/**
 * The same picture with its pixels deflated by fflate at level 9. The library's `encodePng`
 * stored them uncompressed when the fixture was made (B422 follow-up); it deflates them itself
 * since B468a, and this keeps the fixture's bytes as they were. The pixels are unchanged;
 * fflate's output is deterministic.
 */
function compactPng(png: Uint8Array): Uint8Array {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const rgba = pixelsOf(png);
  const stride = 1 + width * 4;
  const raw = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * stride + 1);
  }
  const parts = [
    png.subarray(0, 8),
    pngChunk('IHDR', png.subarray(16, 29)),
    pngChunk('IDAT', zlibSync(raw, { level: 9 })),
    pngChunk('IEND', new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/**
 * The entity texture of a starter geometry: each box drawn with the library's box painter
 * (`boxSkinPng`) in the body colour, wheels, propellers and fans in dark over them.
 */
function paintGeometry(geometry: JsonObject, colour: Rgb): Uint8Array {
  const entry = (geometry['minecraft:geometry'] as JsonObject[])[0] as JsonObject;
  const size = (entry.description as JsonObject).texture_width as number;
  const body: Parameters<typeof boxSkinPng>[0][number][] = [];
  const dark: typeof body = [];
  for (const bone of entry.bones as JsonObject[]) {
    for (const cube of (bone.cubes ?? []) as JsonObject[]) {
      const [u, v] = cube.uv as [number, number];
      const [w, h, d] = cube.size as [number, number, number];
      (/wheel|fan|propeller|rotor/.test(String(bone.name)) ? dark : body).push({ u, v, w, h, d });
    }
  }
  const rgba = pixelsOf(boxSkinPng(body, size, size, { colour }));
  const over = pixelsOf(boxSkinPng(dark, size, size, { colour: DARK }));
  for (let index = 0; index < over.length; index += 4) {
    if ((over[index + 3] ?? 0) > 0) rgba.set(over.subarray(index, index + 4), index);
  }
  return encodePng(rgba, size, size);
}

const BUGGY_GEOMETRY = vehicleGeometry('go_kart', 'entity.swamp_buggy');
const HOVER_GEOMETRY = vehicleGeometry('hovercraft', 'entity.hovercraft');
const HELI_GEOMETRY = vehicleGeometry('helicopter', 'entity.helicopter');

// The project -------------------------------------------------------------------------------

const RACING_CAR = ns('racing_car');
const MOTORBOAT = ns('motorboat');
const SWAMP_BUGGY = ns('swamp_buggy');
const BIPLANE = ns('biplane');
const HOVERCRAFT = ns('hovercraft');
const HELICOPTER = ns('helicopter');
const BATTLE_TANK = ns('battle_tank');
const SHELL = ns('battle_tank_shell');
const REPAIR_KIT = ns('repair_kit');
const FLARE = ns('flare');
const STATUS = ns('status');
const FLARE_CHARGE = ns('flare_charge');
const SPEEDOMETER = ns('speedometer');
const TANK_SHELLS = ns('tank_shells');
const STATUS_LINE = ns('status_line');
const SCRIPT = ns('flares');
const FIRE_FLARE = ns('fire_flare');

/** Vanilla sound events (the library flows' choices). */
const SOUNDS = {
  ground: 'minecraft:entity.minecart.riding',
  air: 'minecraft:item.elytra.flying',
  paddle: 'minecraft:entity.boat.paddle_water',
  horn: 'minecraft:item.goat_horn.sound.0',
  start: 'minecraft:block.piston.extend',
  cannon: 'minecraft:entity.generic.explode',
  gun: 'minecraft:entity.arrow.shoot',
} as const;

/** Every vehicle is mended with the repair kit. */
const repair = (amount: number): Json => [{ item: REPAIR_KIT, amount }];

/**
 * The model and item fields of a vehicle named `name`: the item shows through a flat item model
 * (as the library flows do), so every model id it names is a project element.
 */
function looks(name: string, extra: JsonRecord = {}): JsonRecord {
  const own = ns(`entity/${name}`);
  return {
    model: { geometry: own, texture: own, ...extra },
    item: { model: ns(`item/${name}`) },
  };
}

/** A geo model element `entity/<name>`. */
const geoModel = (name: string, data: JsonObject): SampleElement => ({
  id: ns(`entity/${name}`),
  kind: 'msm:geo_model',
  data: data as Json,
});

/** A flat item model over `item/<name>`. */
const itemModel = (name: string): SampleElement => ({
  id: ns(`item/${name}`),
  kind: 'minecraft:model',
  data: { parent: 'minecraft:item/generated', textures: { layer0: ns(`item/${name}`) } },
});

const TANK_FIRED = ns('battle_tank_fired');
const SHELL_HIT = ns('battle_tank_shell_hit');
const SHELL_HIT_BLOCK = ns('battle_tank_shell_hit_block');
const SHELL_BANG: Json = { actions: [{ type: 'explode', power: 1.5 }] };
const FLARE_PRESSED = ns('flare_pressed');
const STATUS_PRESSED = ns('status_pressed');
const STATUS_RELEASED = ns('status_released');
/** The status key's line. */
const STATUS_TEXT = 'J flare, R cannon, V machine gun, H horn, Left Alt down';

/** Flare charge: the script's data key, full value, cost of one flare and refill a second. */
const CHARGE = { key: 'flare_charge', full: 100, cost: 25, refill: 5 } as const;

const VEHICLES: readonly SampleElement[] = [
  {
    id: RACING_CAR,
    kind: 'msm:vehicle',
    data: {
      format: 1,
      display_name: 'Racing Car',
      ...looks('racing_car', {
        paints: CAR_PAINTS.map((paint) => ({
          id: paint,
          texture: ns(`entity/racing_car_${paint}`),
          dye: `minecraft:${paint}_dye`,
        })),
      }),
      size: [1.6, 1.3],
      movement: { mode: 'ground', max_speed: 0.45, step_height: 1 },
      seats: [{ offset: [-0.35, 0.35, 0.1] }, { offset: [0.35, 0.35, 0.1] }],
      engine: {
        fuel: {
          items: [
            { item: 'minecraft:coal', ticks: 1200 },
            { item: 'minecraft:charcoal', ticks: 1200 },
          ],
          capacity: 24000,
        },
        sound: SOUNDS.ground,
        start_sound: SOUNDS.start,
        horn: SOUNDS.horn,
      },
      health: { max: 40, repair: repair(10) },
      parts: {
        wheels: ['wheel_front_left', 'wheel_front_right', 'wheel_back_left', 'wheel_back_right'],
        wheel_radius: 0.25,
        steering: ['wheel_front_left', 'wheel_front_right'],
      },
      storage: { rows: 1 },
      exhaust: { particle: 'minecraft:smoke', offset: [0, 0.3, -1.3], every_ticks: 4 },
      camera: { distance: 5 },
    },
  },
  geoModel('racing_car', bundleData(CAR_FLOW, ns('entity/racing_car'))),
  itemModel('racing_car'),
  {
    id: MOTORBOAT,
    kind: 'msm:vehicle',
    data: {
      format: 1,
      display_name: 'Motorboat',
      ...looks('motorboat'),
      item: { model: ns('item/motorboat'), places_on: 'water' },
      size: [1.6, 0.7],
      movement: { mode: 'water', max_speed: 0.4, turn_rate: 4 },
      seats: [{ offset: [0, 0.3, 0] }, { offset: [0, 0.3, -0.6] }],
      engine: { sound: SOUNDS.paddle, horn: SOUNDS.horn },
      health: { max: 30, repair: repair(10) },
      parts: { propellers: ['propeller'] },
      camera: { distance: 5 },
    },
  },
  geoModel('motorboat', bundleData(BOAT_FLOW, ns('entity/motorboat'))),
  itemModel('motorboat'),
  {
    id: SWAMP_BUGGY,
    kind: 'msm:vehicle',
    data: {
      format: 1,
      display_name: 'Swamp Buggy',
      ...looks('swamp_buggy'),
      item: { model: ns('item/swamp_buggy'), places_on: 'any' },
      size: [1.2, 0.6],
      movement: {
        mode: 'amphibious',
        max_speed: 0.35,
        turn_rate: 6,
        step_height: 0.5,
        grip: 0.9,
      },
      seats: [{ offset: [0, 0.2, -0.1] }],
      engine: { sound: SOUNDS.ground, horn: SOUNDS.horn },
      health: { max: 30, repair: repair(10) },
      parts: {
        wheels: ['wheel_front_left', 'wheel_front_right', 'wheel_back_left', 'wheel_back_right'],
        wheel_radius: 0.19,
        steering: ['wheel_front_left', 'wheel_front_right'],
      },
      camera: { distance: 4 },
    },
  },
  geoModel('swamp_buggy', BUGGY_GEOMETRY),
  itemModel('swamp_buggy'),
  {
    id: BIPLANE,
    kind: 'msm:vehicle',
    data: {
      format: 1,
      display_name: 'Biplane',
      ...looks('biplane'),
      size: [2.5, 1.2],
      movement: {
        mode: 'air',
        max_speed: 1,
        acceleration: 0.02,
        turn_rate: 3,
        lift_speed: 0.15,
        takeoff_speed: 0.5,
      },
      seats: [{ offset: [0, 0.6, 0.5] }, { offset: [0, 0.6, -0.5] }],
      engine: {
        fuel: { items: [{ item: 'minecraft:coal', ticks: 1200 }] },
        sound: SOUNDS.air,
        start_sound: SOUNDS.start,
      },
      health: { max: 40, repair: repair(10) },
      parts: {
        propellers: ['propeller'],
        wheels: ['wheel_front_left', 'wheel_front_right'],
        wheel_radius: 0.19,
      },
      camera: { distance: 10 },
    },
  },
  geoModel('biplane', bundleData(PLANE_FLOW, ns('entity/biplane'))),
  itemModel('biplane'),
  {
    id: HOVERCRAFT,
    kind: 'msm:vehicle',
    data: {
      format: 1,
      display_name: 'Hovercraft',
      ...looks('hovercraft'),
      size: [2, 0.8],
      movement: { mode: 'hover', max_speed: 0.5, turn_rate: 6, lift_speed: 0.08 },
      seats: [{ offset: [-0.3, 0.5, 0] }, { offset: [0.3, 0.5, 0] }],
      engine: {
        fuel: { items: [{ item: 'minecraft:dried_kelp_block', ticks: 800 }] },
        sound: SOUNDS.ground,
        horn: SOUNDS.horn,
      },
      health: { max: 40, repair: repair(10) },
      parts: { propellers: ['fan'] },
      camera: { distance: 6 },
    },
  },
  geoModel('hovercraft', HOVER_GEOMETRY),
  itemModel('hovercraft'),
  {
    id: HELICOPTER,
    kind: 'msm:vehicle',
    data: {
      format: 1,
      display_name: 'Helicopter',
      ...looks('helicopter'),
      size: [2.2, 1.8],
      movement: { mode: 'hover', max_speed: 0.5, turn_rate: 5, lift_speed: 0.2 },
      seats: [{ offset: [-0.3, 0.4, 0.2] }, { offset: [0.3, 0.4, 0.2] }],
      engine: {
        fuel: { items: [{ item: 'minecraft:coal', ticks: 1200 }] },
        sound: SOUNDS.air,
        start_sound: SOUNDS.start,
      },
      health: { max: 40, repair: repair(10) },
      parts: { rotors: ['rotor'], propellers: ['tail_rotor'] },
      camera: { distance: 10 },
    },
  },
  geoModel('helicopter', HELI_GEOMETRY),
  itemModel('helicopter'),
  {
    id: BATTLE_TANK,
    kind: 'msm:vehicle',
    data: {
      format: 1,
      display_name: 'Battle Tank',
      ...looks('battle_tank'),
      size: [3, 1.6],
      movement: {
        mode: 'ground',
        max_speed: 0.25,
        acceleration: 0.01,
        turn_rate: 3,
        turns_in_place: true,
        step_height: 1,
        grip: 1,
      },
      seats: [{ offset: [0, 1.6, 0] }],
      engine: {
        fuel: { items: [{ item: 'minecraft:blaze_rod', ticks: 2400 }] },
        sound: SOUNDS.ground,
        start_sound: SOUNDS.start,
      },
      health: {
        max: 120,
        repair: repair(20),
        explodes: 2,
        immune_to: ['#minecraft:is_fire'],
      },
      weapons: [
        {
          id: 'cannon',
          key: 'fire',
          projectile: SHELL,
          speed: 2.5,
          inaccuracy: 0.5,
          cooldown_ticks: 60,
          ammo: { item: SHELL, capacity: 16 },
          muzzle: { bone: 'barrel', offset: [0, 1.3, 2.5] },
          sound: SOUNDS.cannon,
          recoil: 0.1,
          on_fire: TANK_FIRED,
        },
        {
          id: 'machine_gun',
          key: 'second',
          projectile: 'minecraft:arrow',
          speed: 3,
          inaccuracy: 3,
          damage: 2,
          cooldown_ticks: 4,
          automatic: true,
          muzzle: { offset: [0.6, 0.9, 1.8] },
          sound: SOUNDS.gun,
        },
      ],
      turret: { bone: 'turret', pitch_bone: 'barrel', pitch_limit: [-20, 10], turn_rate: 4 },
      parts: { wheels: ['track_left', 'track_right'], wheel_radius: 0.3 },
      ram_damage: { damage: 4, min_speed: 0.15 },
      camera: { distance: 8 },
      events: {
        [TANK_FIRED]: {
          actions: [
            { type: 'spawn_particle', particle: 'minecraft:large_smoke', count: 8, spread: 0.4 },
          ],
        },
      },
    },
  },
  geoModel('battle_tank', bundleData(TANK_FLOW, ns('entity/battle_tank'))),
  itemModel('battle_tank'),
];

const ITEMS: readonly SampleElement[] = [
  {
    id: SHELL,
    kind: 'msm:item',
    data: {
      format: 1,
      display_name: 'Battle Tank Shell',
      model: ns('item/battle_tank_shell'),
      max_stack_size: 16,
      creative_tab: 'minecraft:combat',
      components: {
        'msm:throwable': {
          speed: 1.5,
          gravity: 0.03,
          after_throw: 'consume',
          sound: 'minecraft:entity.snowball.throw',
          on_hit_entity: { event: SHELL_HIT },
          on_hit_block: { event: SHELL_HIT_BLOCK },
        },
      },
      events: { [SHELL_HIT]: SHELL_BANG, [SHELL_HIT_BLOCK]: SHELL_BANG },
    },
  },
  itemModel('battle_tank_shell'),
  {
    id: REPAIR_KIT,
    kind: 'msm:item',
    data: {
      format: 1,
      display_name: 'Repair Kit',
      model: ns('item/repair_kit'),
      max_stack_size: 16,
      creative_tab: 'minecraft:tools_and_utilities',
    },
  },
  itemModel('repair_kit'),
  {
    id: ns('battle_tank_shell_crafting'),
    kind: 'minecraft:recipe',
    data: {
      type: 'minecraft:crafting_shapeless',
      category: 'equipment',
      ingredients: ['minecraft:gunpowder', 'minecraft:iron_ingot'],
      result: { id: SHELL, count: 4 },
    },
  },
  {
    id: ns('repair_kit_crafting'),
    kind: 'minecraft:recipe',
    data: {
      type: 'minecraft:crafting_shaped',
      category: 'misc',
      pattern: [' I ', 'ICI', ' I '],
      key: { I: 'minecraft:iron_ingot', C: 'minecraft:copper_ingot' },
      result: { id: REPAIR_KIT, count: 2 },
    },
  },
];

const KEY_BINDS: readonly SampleElement[] = [
  {
    id: FLARE,
    kind: 'msm:key_bind',
    data: {
      format: 1,
      display_name: 'Send up a flare',
      default_key: 'key.keyboard.j',
      category: 'sample_vehicles',
      category_name: 'Sample vehicles',
      when: 'in_vehicle',
      cooldown_ticks: 40,
      'msm:on_press': FLARE_PRESSED,
      events: { [FLARE_PRESSED]: { actions: [{ type: 'run_script', handler: FIRE_FLARE }] } },
    },
  },
  {
    id: STATUS,
    kind: 'msm:key_bind',
    data: {
      format: 1,
      display_name: 'Show the vehicle keys',
      default_key: 'key.keyboard.k',
      category: 'sample_vehicles',
      category_name: 'Sample vehicles',
      'msm:on_press': STATUS_PRESSED,
      'msm:on_release': STATUS_RELEASED,
      events: {
        [STATUS_PRESSED]: {
          actions: [
            { type: 'set_hud', hud: STATUS_LINE, value: STATUS_TEXT },
            { type: 'show_hud', hud: STATUS_LINE },
          ],
        },
        [STATUS_RELEASED]: { actions: [{ type: 'hide_hud', hud: STATUS_LINE }] },
      },
    },
  },
];

const HUD_ELEMENTS: readonly SampleElement[] = [
  {
    id: FLARE_CHARGE,
    kind: 'msm:hud',
    data: {
      format: 1,
      type: 'bar',
      anchor: 'above_hotbar',
      value: { source: 'data', scope: 'player', namespace: NAMESPACE, key: CHARGE.key },
      max: CHARGE.full,
      show: 'in_vehicle',
      fill_color: '#e07020',
      back_color: '#202020',
      size: [81, 5],
    },
  },
  {
    id: SPEEDOMETER,
    kind: 'msm:hud',
    data: {
      format: 1,
      type: 'text',
      anchor: 'top_left',
      value: { source: 'vehicle', stat: 'speed' },
      show: 'in_vehicle',
      text: 'Speed: {value} blocks a second',
      color: '#f0f0f0',
    },
  },
  {
    id: TANK_SHELLS,
    kind: 'msm:hud',
    data: {
      format: 1,
      type: 'text',
      anchor: 'left',
      value: { source: 'vehicle', stat: 'ammo', weapon: 'cannon' },
      show: 'driving',
      vehicle: BATTLE_TANK,
      text: 'Shells: {value}',
      color: '#e0c040',
    },
  },
  {
    id: STATUS_LINE,
    kind: 'msm:hud',
    data: {
      format: 1,
      type: 'text',
      anchor: 'top',
      offset: [0, 20],
      value: { source: 'set' },
      show: 'always',
      starts_hidden: true,
      color: '#a0e0ff',
    },
  },
];

const IMPORT = 'import { msm } from "msm:runtime";';

const SCRIPT_LINES = [
  IMPORT,
  '',
  `// Flare charge lives in each player's script data under "${CHARGE.key}"; the HUD bar`,
  `// ${FLARE_CHARGE} reads it. It refills by ${CHARGE.refill} a second up to ${CHARGE.full}.`,
  `const KEY = "${CHARGE.key}";`,
  `const FULL = ${CHARGE.full};`,
  `const COST = ${CHARGE.cost};`,
  `const REFILL = ${CHARGE.refill};`,
  '',
  'function chargeOf(value: unknown): number {',
  '  return typeof value === "number" ? value : FULL;',
  '}',
  '',
  'msm.events.on("player.tick", (e) => {',
  '  const now = e.player.data.get(KEY);',
  '  const charge = chargeOf(now);',
  '  if (typeof now !== "number" || charge < FULL) {',
  '    e.player.data.set(KEY, Math.min(FULL, charge + (typeof now === "number" ? REFILL : 0)));',
  '  }',
  '}, { interval: 20 });',
  '',
  `// The flare key (${FLARE}) runs this handler: it spends charge and sends a flare up.`,
  `msm.actions.define("${FIRE_FLARE}", (e) => {`,
  '  const player = e.player;',
  '  if (player === undefined) return;',
  '  const charge = chargeOf(player.data.get(KEY));',
  '  if (charge < COST) {',
  '    player.sendMessage("The flare is not charged yet.");',
  '    return;',
  '  }',
  '  player.data.set(KEY, charge - COST);',
  '  e.world.spawnParticle("minecraft:firework", e.pos.offset(0, 3, 0), { count: 40, spread: 0.5 });',
  '  e.world.playSound("minecraft:entity.firework_rocket.launch", e.pos);',
  '  msm.log.info("flare: " + player.name + " sent up a flare");',
  '});',
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
        'Sample vehicles: a car, a motorboat, a swamp buggy, a biplane, a hovercraft, a helicopter and a tank with a turret, a cannon and a machine gun; fuel, repairs, a boot, paints, two keys and four HUD elements.',
      authors: ['MCSuperMods'],
      licence: 'MIT',
    },
  },
  ...VEHICLES,
  ...ITEMS,
  ...KEY_BINDS,
  ...HUD_ELEMENTS,
  { id: SCRIPT, kind: 'msm:script', data: { lines: SCRIPT_LINES } },
];

const entityTexture = (name: string, bytes: Uint8Array): SampleAsset => ({
  path: `textures/entity/${name}.png`,
  bytes: compactPng(bytes),
});
const itemPicture = (name: string, bytes: Uint8Array): SampleAsset => ({
  path: `textures/item/${name}.png`,
  bytes: compactPng(bytes),
});
const fromFlow = (bundle: ContentBundle, path: string): Uint8Array =>
  bundleAsset(bundle, `${path}.png`);

const SAMPLE_ASSETS: readonly SampleAsset[] = [
  entityTexture('racing_car', fromFlow(CAR_FLOW, 'textures/entity/racing_car')),
  ...CAR_PAINTS.map((paint) =>
    entityTexture(`racing_car_${paint}`, fromFlow(CAR_FLOW, `textures/entity/racing_car_${paint}`)),
  ),
  itemPicture('racing_car', fromFlow(CAR_FLOW, 'textures/item/racing_car')),
  entityTexture('motorboat', fromFlow(BOAT_FLOW, 'textures/entity/motorboat')),
  itemPicture('motorboat', fromFlow(BOAT_FLOW, 'textures/item/motorboat')),
  entityTexture('swamp_buggy', paintGeometry(BUGGY_GEOMETRY, COLOURS.swamp_buggy)),
  itemPicture('swamp_buggy', fromFlow(BUGGY_PICTURE_FLOW, 'textures/item/swamp_buggy')),
  entityTexture('biplane', fromFlow(PLANE_FLOW, 'textures/entity/biplane')),
  itemPicture('biplane', fromFlow(PLANE_FLOW, 'textures/item/biplane')),
  entityTexture('hovercraft', paintGeometry(HOVER_GEOMETRY, COLOURS.hovercraft)),
  itemPicture('hovercraft', fromFlow(HOVER_PICTURE_FLOW, 'textures/item/hovercraft')),
  entityTexture('helicopter', paintGeometry(HELI_GEOMETRY, COLOURS.helicopter)),
  itemPicture('helicopter', fromFlow(HELI_PICTURE_FLOW, 'textures/item/helicopter')),
  entityTexture('battle_tank', fromFlow(TANK_FLOW, 'textures/entity/battle_tank')),
  itemPicture('battle_tank', fromFlow(TANK_FLOW, 'textures/item/battle_tank')),
  itemPicture('battle_tank_shell', fromFlow(TANK_FLOW, 'textures/item/battle_tank_shell')),
  itemPicture('repair_kit', placeholderPng('smithing_template', { colour: COLOURS.repair_kit })),
];

const nameOf = (id: string): string => id.split(':')[1] as string;
const ofKind = (kind: string): string[] =>
  SAMPLE_ELEMENTS.filter((entry) => entry.kind === kind).map((entry) => nameOf(entry.id));
const VEHICLE_NAMES = ofKind('msm:vehicle');
const ITEM_NAMES = ofKind('msm:item');
const KEY_BIND_NAMES = ofKind('msm:key_bind');
const HUD_NAMES = ofKind('msm:hud');
const SCRIPTS = SAMPLE_ELEMENTS.filter((entry) => entry.kind === 'msm:script');

/**
 * What the runtime registers and logs: the definition scanner's items (the vehicles' items come
 * later, from `MsmVehicles`, and are not in that count), no mob, and the three lines
 * `tools/run-fabric-server --expect-line` pins for B426.
 */
const EXPECTED_ITEMS = ITEM_NAMES.length;
const EXPECTED_LOG_LINES = [
  `registered ${VEHICLE_NAMES.length} vehicle type(s)`,
  `registered ${KEY_BIND_NAMES.length} key bind(s)`,
  `registered ${HUD_NAMES.length} HUD element(s)`,
] as const;

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

/**
 * Type-checks the scripts against the generated typings with `lib.es5` only, as
 * `sample-script.golden.test.ts` does.
 */
function typeCheckScripts(scripts: readonly SampleElement[]): string[] {
  const libDir = dirname(createRequire(import.meta.url).resolve('typescript/lib/lib.es5.d.ts'));
  const files = new Map<string, string>([['/msm-runtime.d.ts', MSM_RUNTIME_TYPINGS]]);
  for (const entry of scripts) {
    files.set(
      `/script/${nameOf(entry.id)}.ts`,
      `${(entry.data as { lines: string[] }).lines.join('\n')}\n`,
    );
  }
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

// Registries --------------------------------------------------------------------------------

/**
 * The project's own ids per registry, as the app derives them (`session/schema-context.ts`):
 * element ids under their kind's registry (`entity_type` for `msm:vehicle`), each vehicle's id
 * also in `item` (the runtime registers its item under the same id, B415), and the textures of
 * the namespace's PNG assets.
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
    if (element.kind === 'msm:vehicle') add('item', element.id);
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

describe('sample vehicles project', () => {
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

  it('loads with zero problems and has one vehicle per mode, the tank, keys and HUD', async () => {
    const project = await loadSample();
    expect(project.name).toBe(PROJECT_NAME);
    expect(VEHICLE_NAMES).toEqual([
      'racing_car',
      'motorboat',
      'swamp_buggy',
      'biplane',
      'hovercraft',
      'helicopter',
      'battle_tank',
    ]);
    const mode = (id: string): Json => (dataOf(project, id).movement as JsonRecord).mode as Json;
    expect(VEHICLE_NAMES.map((name) => mode(ns(name)))).toEqual([
      'ground',
      'water',
      'amphibious',
      'air',
      'hover',
      'hover',
      'ground',
    ]);
    // Every mode of the target is covered.
    expect([...new Set(VEHICLE_NAMES.map((name) => mode(ns(name))))].sort()).toEqual(
      [...(defaultTarget().target.vehicles?.modes ?? [])].sort(),
    );
    // Only the car has storage and paints; every vehicle is mended with the repair kit.
    const withField = (field: string): string[] =>
      VEHICLE_NAMES.filter((name) => dataOf(project, ns(name))[field] !== undefined);
    expect(withField('storage')).toEqual(['racing_car']);
    expect(
      VEHICLE_NAMES.filter(
        (name) => (dataOf(project, ns(name)).model as JsonRecord).paints !== undefined,
      ),
    ).toEqual(['racing_car']);
    for (const name of VEHICLE_NAMES) {
      const mends = (dataOf(project, ns(name)).health as JsonRecord).repair as JsonRecord[];
      expect(
        mends.map((entry) => entry.item),
        name,
      ).toEqual([REPAIR_KIT]);
    }
    const tank = dataOf(project, BATTLE_TANK);
    const weapons = tank.weapons as JsonRecord[];
    expect(weapons.map((weapon) => [weapon.id, weapon.key, weapon.projectile])).toEqual([
      ['cannon', 'fire', SHELL],
      ['machine_gun', 'second', 'minecraft:arrow'],
    ]);
    expect(weapons[0]?.ammo).toEqual({ item: SHELL, capacity: 16 });
    expect(tank.turret).toMatchObject({ bone: 'turret', pitch_bone: 'barrel' });
    expect((tank.engine as JsonRecord).fuel).toBeDefined();
    expect(
      (dataOf(project, SHELL).components as JsonRecord)['msm:throwable'] as JsonRecord,
    ).toMatchObject({ on_hit_block: { event: SHELL_HIT_BLOCK } });
    expect(KEY_BIND_NAMES).toEqual(['flare', 'status']);
    expect(HUD_NAMES).toEqual(['flare_charge', 'speedometer', 'tank_shells', 'status_line']);
    expect((dataOf(project, FLARE_CHARGE).value as JsonRecord).source).toBe('data');
    expect(dataOf(project, SPEEDOMETER).value).toEqual({ source: 'vehicle', stat: 'speed' });
    // The dashboard is on for every vehicle (`hud` defaults to true).
    for (const name of VEHICLE_NAMES) expect(dataOf(project, ns(name)).hud, name).toBeUndefined();
    const kinds = new Set(elementsOf(project).map((element) => element.kind));
    expect([...kinds].sort()).toEqual([
      'minecraft:model',
      'minecraft:recipe',
      'msm:geo_model',
      'msm:hud',
      'msm:item',
      'msm:key_bind',
      'msm:mod',
      'msm:script',
      'msm:vehicle',
    ]);
    expect(project.namespaces[0]?.assets.map((asset) => asset.path).sort()).toEqual(
      SAMPLE_ASSETS.map((asset) => asset.path).sort(),
    );
  });

  it('has a geometry for every vehicle with the bones it names', () => {
    for (const name of VEHICLE_NAMES) {
      const geometry = SAMPLE_ELEMENTS.find((entry) => entry.id === ns(`entity/${name}`))
        ?.data as JsonObject;
      const entry = (geometry['minecraft:geometry'] as JsonObject[])[0] as JsonObject;
      const bones = (entry.bones as JsonObject[]).map((bone) => String(bone.name));
      const vehicle = SAMPLE_ELEMENTS.find((sample) => sample.id === ns(name))?.data as JsonRecord;
      const parts = (vehicle.parts ?? {}) as Record<string, Json>;
      const named = [
        ...['wheels', 'steering', 'rotors', 'propellers'].flatMap(
          (field) => (parts[field] ?? []) as string[],
        ),
        ...(vehicle.turret === undefined
          ? []
          : [
              (vehicle.turret as JsonRecord).bone as string,
              (vehicle.turret as JsonRecord).pitch_bone as string,
            ]),
      ];
      for (const bone of named) expect(bones, `${name} ${bone}`).toContain(bone);
      expect(entry.description, name).toMatchObject({ identifier: `geometry.entity.${name}` });
    }
  });

  it('keeps the library pictures pixel for pixel when deflating them', () => {
    for (const [bundle, path] of [
      [TANK_FLOW, 'textures/entity/battle_tank'],
      [CAR_FLOW, 'textures/item/racing_car'],
    ] as const) {
      const original = fromFlow(bundle, path);
      const compact = compactPng(original);
      // No larger than the library's own fixed-Huffman deflate (B468a).
      expect(compact.length).toBeLessThanOrEqual(original.length);
      expect(Buffer.from(pixelsOf(compact)).equals(Buffer.from(pixelsOf(original))), path).toBe(
        true,
      );
    }
  });

  it('type-checks the script against the typings', () => {
    expect(typeCheckScripts(SCRIPTS)).toEqual([]);
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sample vehicles export (%s)',
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
        project: await loadSample(),
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
      const found: Problem[] = (
        await Promise.all(
          VALIDATORS.map((validator) =>
            validator.validate({ elements, target, registry: context.registries }),
          ),
        )
      ).flat();
      expect(found).toEqual([]);
    });

    it('holds the definitions (valid), the models, the pictures, the keys and the script', async () => {
      const files = unzipSync(await exportJar());
      const paths = Object.keys(files).sort();
      const resource = target.folders.resource;
      const definitions: [string, string][] = [
        ...VEHICLE_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/vehicle/${name}.json`,
          MSM_SCHEMA_REFS.vehicleDefinition,
        ]),
        ...ITEM_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/item/${name}.json`,
          MSM_SCHEMA_REFS.itemDefinition,
        ]),
        ...KEY_BIND_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/key_bind/${name}.json`,
          MSM_SCHEMA_REFS.keyBindDefinition,
        ]),
        ...HUD_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/hud/${name}.json`,
          MSM_SCHEMA_REFS.hudDefinition,
        ]),
      ];
      expect(paths.filter((path) => path.startsWith('msm/'))).toEqual(
        [
          ...definitions.map(([path]) => path),
          ...SCRIPTS.map((entry) => `msm/${NAMESPACE}/script/${nameOf(entry.id)}.js`),
        ].sort(),
      );
      expect(paths.filter((path) => path.endsWith('.ts'))).toEqual([]);
      for (const path of [
        'fabric.mod.json',
        'msm.export.json',
        `assets/${NAMESPACE}/${resource.lang}/en_us.json`,
        ...VEHICLE_NAMES.map(
          (name) => `assets/${NAMESPACE}/geckolib/models/entity/${name}.geo.json`,
        ),
        ...VEHICLE_NAMES.map((name) => `assets/${NAMESPACE}/textures/entity/${name}.png`),
        ...CAR_PAINTS.map((paint) => `assets/${NAMESPACE}/textures/entity/racing_car_${paint}.png`),
        ...[...VEHICLE_NAMES, ...ITEM_NAMES].map(
          (name) => `assets/${NAMESPACE}/textures/item/${name}.png`,
        ),
        ...[...VEHICLE_NAMES, ...ITEM_NAMES].map(
          (name) => `assets/${NAMESPACE}/items/${name}.json`,
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

      // Element-only fields stay out of the definitions; the rest reaches the runtime unchanged.
      const car = json(`msm/${NAMESPACE}/vehicle/racing_car.json`) as JsonRecord;
      expect(car.display_name).toBeUndefined();
      expect(car.storage).toEqual({ rows: 1 });
      expect(((car.model as JsonRecord).paints as JsonRecord[]).map((paint) => paint.dye)).toEqual(
        CAR_PAINTS.map((paint) => `minecraft:${paint}_dye`),
      );
      const tank = json(`msm/${NAMESPACE}/vehicle/battle_tank.json`) as JsonRecord;
      expect((tank.weapons as JsonRecord[])[0]).toMatchObject({
        projectile: SHELL,
        ammo: { item: SHELL, capacity: 16 },
        on_fire: TANK_FIRED,
      });
      const flare = json(`msm/${NAMESPACE}/key_bind/flare.json`) as JsonRecord;
      expect(flare).toMatchObject({ default_key: 'key.keyboard.j', when: 'in_vehicle' });
      expect(flare.display_name).toBeUndefined();
      expect(flare.category_name).toBeUndefined();
      expect(json(`msm/${NAMESPACE}/hud/flare_charge.json`)).toMatchObject({
        type: 'bar',
        value: { source: 'data', key: CHARGE.key },
      });
      const js = utf8.decode(files[`msm/${NAMESPACE}/script/flares.js`] as Uint8Array);
      expect(js).toContain('require("msm:runtime")');
      expect(js).toContain(`msm.actions.define("${FIRE_FLARE}"`);

      const lang = json(`assets/${NAMESPACE}/${resource.lang}/en_us.json`) as JsonRecord;
      for (const name of VEHICLE_NAMES) {
        expect(lang[`entity.${NAMESPACE}.${name}`], name).toBeDefined();
        expect(lang[`item.${NAMESPACE}.${name}`], name).toBeDefined();
      }
      for (const name of ITEM_NAMES) expect(lang[`item.${NAMESPACE}.${name}`], name).toBeDefined();
      expect(lang[`key.${NAMESPACE}.flare`]).toBe('Send up a flare');
      expect(lang[`key.${NAMESPACE}.status`]).toBe('Show the vehicle keys');
      expect(lang[`key.category.${NAMESPACE}.sample_vehicles`]).toBe('Sample vehicles');

      const modJson = json('fabric.mod.json') as { id: string; depends: Record<string, string> };
      expect(modJson.id).toBe(NAMESPACE);
      expect(modJson.depends.msm_runtime).toBe(`>=${meta.msmVersion}`);
      const runtimePath = nestedRuntimePath(meta.msmVersion);
      expect(files[runtimePath]).toEqual(stubRuntimeJar);
      expect(paths.filter((path) => path.startsWith('META-INF/jars/'))).toEqual([runtimePath]);
    });

    it('leaves the mod items out of the vanilla data pack', async () => {
      const sink = createMemorySink();
      const report = await runExport({
        project: await loadSample(),
        registry,
        target,
        schemaIndex: context.schemaIndex,
        registries: context.registries,
        exporter: vanillaSafeExporter(dataPackExporter, modOnlyIdsOf(context.ids)),
        sink,
        readAsset: (namespace, path) => sampleFs.readFile(`assets/${namespace}/${path}`),
        meta,
      });
      const recipes = target.folders.data.recipe;
      expect(
        report.problems.filter(
          (problem) => problem.severity !== 'info' && problem.code !== MOD_ONLY_REFERENCE,
        ),
      ).toEqual([]);
      expect(report.ok).toBe(true);
      expect(
        report.problems
          .filter((problem) => problem.code === MOD_ONLY_REFERENCE)
          .map((problem) => problem.file)
          .sort(),
      ).toEqual([
        `data/${NAMESPACE}/${recipes}/battle_tank_shell_crafting.json`,
        `data/${NAMESPACE}/${recipes}/repair_kit_crafting.json`,
      ]);
      const paths = [...sink.files().keys()];
      expect(paths.some((path) => path.startsWith('msm/'))).toBe(false);
      expect(paths.some((path) => path.includes('/recipe'))).toBe(false);
    });

    it('carries no vehicle, key or HUD definition in the vanilla resource pack', async () => {
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
      expect(paths.some((path) => path.startsWith('msm/'))).toBe(false);
      expect(paths).toContain(`assets/${NAMESPACE}/textures/entity/battle_tank.png`);
    });

    describe('content jar', () => {
      const hashFile = join(fixturesRoot, target.id, 'sample-vehicles-jar.sha256');
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
    const outDir = process.env.MSM_SAMPLE_VEHICLES_OUT;
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
          expectBlocks: 0,
          expectEntities: 0,
          expectItems: EXPECTED_ITEMS,
          expectScripts: SCRIPTS.length,
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
        // The three lines B426 pins with `--expect-line`, one per line for the workflow to read.
        await writeFile(
          join(outDir as string, 'expect-lines.txt'),
          `${EXPECTED_LOG_LINES.join('\n')}\n`,
        );
        expect(unzipSync(jar)[nestedRuntimePath(runtimeVersion)]).toEqual(runtimeJar);
      },
      120_000,
    );
  },
);
