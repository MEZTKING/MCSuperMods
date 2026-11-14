/**
 * Vanilla pack safety for particles (ADR 0066, ADR 0080 D10; B351). A project particle is a
 * mod-only id of the `particle_type` registry, so, in the vanilla data pack of a particle
 * project:
 *
 * - a biome, a dimension type and a timeline naming the particle in
 *   `minecraft:visual/ambient_particles` are left out with `export.mod-only-reference` (each one
 *   fails the whole pack on a vanilla server: brief B346's probe), and so is a dimension naming
 *   the left-out dimension type;
 * - a function running `particle <ns>:<id>` (also under `execute`) is kept with
 *   `export.mod-only-function` (a vanilla server drops only that function);
 * - the particle definition, the block's ambient particles and the `spawn_particle` action never
 *   reach the pack;
 * - the vanilla resource pack keeps the project description, its picture and a retexture of a
 *   vanilla particle;
 * - a project without particles exports the same bytes with or without the particle rules.
 *
 * Exported through the real plugins and `runExport` on every built-in target.
 */
import { readFile } from 'node:fs/promises';
import {
  createElement,
  createEmptyProject,
  ElementKindRegistry,
  type Project,
  registerPlugin,
  utf8,
} from '@msm/core';
import type { Element, Exporter, Json, ResourceLocation } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import worldgenPlugin from '@msm/plugin-worldgen';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, readVendoredJson, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  createMemorySink,
  dataPackExporter,
  FATAL_DATA_FOLDERS,
  MOD_ONLY_FUNCTION,
  MOD_ONLY_REFERENCE,
  modOnlyFunctionMessage,
  modOnlyIdsOf,
  modOnlyReferenceMessage,
  RUNTIME_REGISTRIES,
  resourcePackExporter,
  runExport,
  vanillaSafeExporter,
} from '../src/index';
import { indexesFor } from './helpers';

const NOW = '2026-11-14T00:00:00.000Z';
const meta = {
  msmVersion: '1.4.0',
  plugins: ['msm.resourcepack', 'msm.datapack', 'msm.worldgen', 'msm.blocks-items'],
};

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

const registry = new ElementKindRegistry();
for (const plugin of [resourcePackPlugin, dataPackPlugin, worldgenPlugin, blocksItemsPlugin]) {
  registerPlugin(registry, plugin);
}

const element = (id: string, kind: string, data: Json): Element =>
  createElement({ id: id as ResourceLocation, kind, data, now: () => NOW });

const SPARK = 'demo:spark';
const AMBIENT = {
  'minecraft:visual/ambient_particles': [{ particle: { type: SPARK }, probability: 0.01 }],
};

const PARTICLE = element(SPARK, 'msm:particle', {
  format: 1,
  textures: ['demo:spark_0', 'minecraft:glow'],
  emissive: true,
});

/** A vanilla particle retextured with the project's picture (resource pack only). */
const FLAME = element('minecraft:flame', 'minecraft:particle', { textures: ['demo:spark_0'] });

/** A block with ambient particles and a spawn_particle action; it drops nothing. */
const LANTERN = element('demo:lantern', 'msm:block', {
  format: 1,
  model: 'minecraft:block/glowstone',
  item: false,
  components: {
    'msm:ambient_particles': { particle: SPARK, chance: 0.5 },
    'msm:on_interact': { event: 'demo:burst' },
  },
  events: {
    'demo:burst': {
      actions: [{ type: 'spawn_particle', particle: SPARK, count: 8, motion: [0, 0.1, 0] }],
    },
  },
});

const FUNCTION = element('demo:sparkle', 'minecraft:function', {
  lines: [
    '# Shows the project particle around every player.',
    `particle ${SPARK} ~ ~1 ~ 0.5 0.5 0.5 0 10`,
    `execute as @a at @s run particle ${SPARK} ~ ~2 ~`,
  ],
});

const BIOME = element('demo:glowing_plains', 'minecraft:worldgen/biome', {
  has_precipitation: true,
  temperature: 0.8,
  downfall: 0.4,
  effects: { water_color: 4159204 },
  attributes: AMBIENT,
  carvers: [],
  features: [],
});

const DIMENSION_TYPE = element('demo:glow', 'minecraft:dimension_type', {
  has_skylight: true,
  has_ceiling: false,
  has_ender_dragon_fight: false,
  coordinate_scale: 1,
  ambient_light: 0,
  logical_height: 384,
  infiniburn: '#minecraft:infiniburn_overworld',
  min_y: -64,
  height: 384,
  monster_spawn_light_level: { type: 'minecraft:uniform', min_inclusive: 0, max_inclusive: 7 },
  monster_spawn_block_light_limit: 0,
  attributes: AMBIENT,
});

/** A dimension of the left-out type: a missing dimension type fails the pack too. */
const DIMENSION = element('demo:glow_realm', 'minecraft:dimension', {
  type: 'demo:glow',
  generator: {
    type: 'minecraft:flat',
    settings: {
      biome: 'minecraft:plains',
      layers: [{ block: 'minecraft:bedrock', height: 1 }],
      features: false,
      lakes: false,
      structure_overrides: [],
    },
  },
});

const TIMELINE = element('demo:sparkle_night', 'minecraft:timeline', {
  clock: 'minecraft:overworld',
  period_ticks: 24000,
  tracks: {
    'minecraft:visual/ambient_particles': {
      keyframes: [{ ticks: 0, value: [{ particle: { type: SPARK }, probability: 0.01 }] }],
    },
  },
});

/** Vanilla data only: a dimension type, a timeline and a function with vanilla particles. */
const PLAIN_TYPE = element('demo:plain', 'minecraft:dimension_type', {
  ...(DIMENSION_TYPE.data as Record<string, Json>),
  attributes: {
    'minecraft:visual/ambient_particles': [
      { particle: { type: 'minecraft:ash' }, probability: 0.01 },
    ],
  },
});
const PLAIN_TIMELINE = element('demo:plain_night', 'minecraft:timeline', {
  clock: 'minecraft:overworld',
  period_ticks: 24000,
  tracks: {
    'minecraft:visual/ambient_particles': {
      keyframes: [
        { ticks: 0, value: [{ particle: { type: 'minecraft:ash' }, probability: 0.01 }] },
      ],
    },
  },
});
const PLAIN_FUNCTION = element('demo:ash', 'minecraft:function', {
  lines: ['particle minecraft:ash ~ ~1 ~'],
});

const ASSETS = [{ path: 'textures/particle/spark_0.png', mediaType: 'image/png' }];
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function projectOf(elements: Element[]): Project {
  return {
    ...createEmptyProject('Particles'),
    namespaces: [{ name: 'demo', elements, assets: ASSETS }],
  };
}

const PARTICLE_PROJECT = (): Project =>
  projectOf([
    PARTICLE,
    FLAME,
    LANTERN,
    FUNCTION,
    BIOME,
    DIMENSION_TYPE,
    DIMENSION,
    TIMELINE,
    PLAIN_TYPE,
    PLAIN_TIMELINE,
    PLAIN_FUNCTION,
  ]);

/** The same project without particles: vanilla particles only, and the block without them. */
const PLAIN_PROJECT = (): Project =>
  projectOf([
    element('demo:lantern', 'msm:block', { format: 1, model: 'minecraft:block/glowstone' }),
    PLAIN_TYPE,
    PLAIN_TIMELINE,
    PLAIN_FUNCTION,
  ]);

/**
 * The runtime registry ids of a project as the app's `dataRegistryIds` declares them: every
 * kind's `registry` (`particle_type` for `msm:particle`), a block's item.
 */
function runtimeIds(value: Project): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const add = (name: string, id: string): void => {
    out[name] = [...(out[name] ?? []), id];
  };
  for (const namespace of value.namespaces) {
    for (const entry of namespace.elements) {
      if (entry.kind.startsWith('minecraft:')) continue;
      const kindRegistry = registry.get(entry.kind)?.registry;
      if (kindRegistry === undefined) continue;
      add(kindRegistry, entry.id);
      if (entry.kind === 'msm:block' && (entry.data as { item?: Json }).item !== false) {
        add('item', entry.id);
      }
    }
  }
  return out;
}

async function exportData(bundle: TargetBundle, value: Project, exporter: Exporter) {
  const { schemaIndex } = await indexesFor(bundle);
  const vanilla = (await readVendoredJson(bundle, 'mcmetaRegistries', nodeReadFile)) as Record<
    string,
    string[]
  >;
  const registries = createRegistryIndex({
    vanilla,
    project: {
      ...runtimeIds(value),
      texture: ['demo:particle/spark_0'],
      dimension_type: ['demo:glow', 'demo:plain'],
      function: ['demo:sparkle', 'demo:ash'],
    },
  });
  const sink = createMemorySink();
  const report = await runExport({
    project: value,
    registry,
    target: bundle.target,
    schemaIndex,
    registries,
    exporter,
    sink,
    readAsset: async () => PNG,
    meta,
  });
  return { report, files: sink.files() };
}

describe('particles in the vanilla packs', () => {
  it('counts particle types as mod-only and dimension types and timelines as fatal', () => {
    expect(RUNTIME_REGISTRIES).toContain('particle_type');
    expect(FATAL_DATA_FOLDERS).toEqual(expect.arrayContaining(['dimension_type', 'timeline']));
    expect(runtimeIds(PARTICLE_PROJECT())).toEqual({
      particle_type: [SPARK],
      block: ['demo:lantern'],
    });
    expect([...(modOnlyIdsOf(runtimeIds(PARTICLE_PROJECT())).get('particle_type') ?? [])]).toEqual([
      SPARK,
    ]);
  });

  for (const bundle of builtInTargets) {
    const folders = bundle.target.folders.data;
    const dataPath = (folder: string, path: string, suffix = '.json') =>
      `data/demo/${folder}/${path}${suffix}`;

    it(`leaves out what names the particle and keeps the function (${bundle.target.id})`, async () => {
      const value = PARTICLE_PROJECT();
      const ids = runtimeIds(value);
      const { report, files } = await exportData(
        bundle,
        value,
        vanillaSafeExporter(dataPackExporter, modOnlyIdsOf(ids)),
      );
      expect(report.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
      expect(report.ok).toBe(true);

      const biome = dataPath(`${folders.worldgen}/biome`, 'glowing_plains');
      const type = dataPath(folders.dimension_type, 'glow');
      const dimension = dataPath(folders.dimension, 'glow_realm');
      const timeline = dataPath(folders.timeline, 'sparkle_night');
      const sparkle = dataPath(folders.function, 'sparkle', '.mcfunction');
      expect(
        report.problems
          .filter((problem) => problem.severity !== 'info')
          .map((problem) => [problem.code, problem.file])
          .sort(),
      ).toEqual(
        [
          [MOD_ONLY_REFERENCE, biome],
          [MOD_ONLY_REFERENCE, type],
          [MOD_ONLY_REFERENCE, dimension],
          [MOD_ONLY_REFERENCE, timeline],
          [MOD_ONLY_FUNCTION, sparkle],
        ].sort(),
      );
      const message = (file: string) =>
        report.problems.find((problem) => problem.file === file)?.message;
      expect(message(type)).toBe(modOnlyReferenceMessage(type, SPARK));
      expect(message(sparkle)).toBe(modOnlyFunctionMessage(sparkle, SPARK));

      // Left out: everything naming the particle, and the dimension of the left-out type.
      for (const path of [biome, type, dimension, timeline])
        expect(files.has(path), path).toBe(false);
      // Kept: the function (a vanilla server drops only it) and the vanilla-only files.
      const text = (path: string): string => utf8.decode(files.get(path) as Uint8Array);
      expect(text(sparkle)).toContain(`execute as @a at @s run particle ${SPARK} ~ ~2 ~`);
      expect(files.has(dataPath(folders.dimension_type, 'plain'))).toBe(true);
      expect(files.has(dataPath(folders.timeline, 'plain_night'))).toBe(true);
      expect(files.has(dataPath(folders.function, 'ash', '.mcfunction'))).toBe(true);

      // No runtime definition, description or picture reaches the data pack, and no kept JSON
      // file names the particle.
      const paths = [...files.keys()];
      expect(paths.some((path) => path.startsWith('msm/') || path.startsWith('assets/'))).toBe(
        false,
      );
      for (const [path, bytes] of files) {
        if (path.endsWith('.json')) expect(utf8.decode(bytes), path).not.toContain(SPARK);
      }
    });

    it(`keeps descriptions and pictures in the resource pack (${bundle.target.id})`, async () => {
      const { report, files } = await exportData(bundle, PARTICLE_PROJECT(), resourcePackExporter);
      expect(report.ok).toBe(true);
      const description = bundle.target.particles?.descriptionFolder ?? 'particles';
      const json = (path: string): Json =>
        JSON.parse(utf8.decode(files.get(path) as Uint8Array)) as Json;
      expect(json(`assets/demo/${description}/spark.json`)).toEqual({
        textures: ['demo:spark_0', 'minecraft:glow'],
      });
      expect(json(`assets/minecraft/${description}/flame.json`)).toEqual({
        textures: ['demo:spark_0'],
      });
      expect(files.get('assets/demo/textures/particle/spark_0.png')).toEqual(PNG);
      expect([...files.keys()].some((path) => path.startsWith('msm/'))).toBe(false);
    });

    it(`exports a project without particles byte for byte as before (${bundle.target.id})`, async () => {
      const value = PLAIN_PROJECT();
      const ids = runtimeIds(value);
      expect(ids.particle_type).toBeUndefined();
      const plain = await exportData(bundle, value, dataPackExporter);
      const safe = await exportData(
        bundle,
        value,
        vanillaSafeExporter(dataPackExporter, modOnlyIdsOf(ids)),
      );
      expect(safe.report.problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
      expect([...safe.files.keys()]).toEqual([...plain.files.keys()]);
      for (const [path, bytes] of plain.files) expect(safe.files.get(path), path).toEqual(bytes);
      // Without any mod content the rule is the exporter itself.
      expect(vanillaSafeExporter(dataPackExporter, modOnlyIdsOf({}))).toBe(dataPackExporter);
    });
  }
});
