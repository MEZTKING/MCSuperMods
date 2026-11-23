/**
 * A void Skyblock's vanilla packs (B551; ADR 0113 D1, D2, ADR 0114; the game modes plan's
 * "Data packs first"): a project of a start island (a structure template), its goals (an
 * advancement) and a `msm:world_setup` of the type `void` with a start at the first join, a kit,
 * effects, a message and game rules, built, saved and reloaded with the real built-in plugins as
 * the library test does, validated element by element and by every plugin's validators, and
 * exported as a resource pack and as the vanilla-safe data pack with every function checked by
 * the offline mcfunction service. Zero problems (errors or warnings) on every built-in target.
 */
import { readFile } from 'node:fs/promises';
import {
  createElement,
  createEmptyProject,
  createMemoryFileSystem,
  ElementKindRegistry,
  loadProject,
  type Project,
  registerPlugin,
  requireSyncResult,
  saveProject,
  utf8,
} from '@msm/core';
import type { Exporter, Json, Plugin, Problem, ResourceLocation } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import gamesPlugin, { worldSetupGeneratedIds } from '@msm/plugin-games';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import structuresPlugin from '@msm/plugin-structures';
import worldgenPlugin from '@msm/plugin-worldgen';
import {
  createRegistryIndex,
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type RegistryIndex,
  validateJson,
} from '@msm/schemas';
import { createMcfunctionService, type McfunctionService } from '@msm/schemas/mcfunction';
import { builtInTargets, readVendoredJson, type TargetBundle } from '@msm/targets';
import { describe, expect, it, vi } from 'vitest';
import {
  createMemorySink,
  dataPackExporter,
  modOnlyIdsOf,
  resourcePackExporter,
  runExport,
  vanillaSafeExporter,
} from '../src/index';

vi.setConfig({ testTimeout: 60_000 });

const NOW = '2026-11-23T00:00:00.000Z';
const NS = 'skyblock';
const meta = { msmVersion: '1.5.4', plugins: ['msm.datapack', 'msm.structures', 'msm.games'] };
const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  structuresPlugin,
  worldgenPlugin,
  blocksItemsPlugin,
  gamesPlugin,
];
const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);

/** A 5 by 3 by 5 island: dirt with grass on top and an oak sapling in the middle. */
function island(): Json {
  const blocks: number[][] = [];
  for (let x = 0; x < 5; x++) {
    for (let z = 0; z < 5; z++) {
      blocks.push([x, 0, z, 0], [x, 1, z, 1]);
    }
  }
  blocks.push([2, 2, 2, 2]);
  return {
    size: [5, 3, 5],
    palette: ['minecraft:dirt', 'minecraft:grass_block', 'minecraft:oak_sapling'],
    blocks,
  };
}

/** The Skyblock's elements. */
function elements(): { id: string; kind: string; data: Json }[] {
  return [
    {
      id: `${NS}:pack`,
      kind: 'minecraft:pack_mcmeta',
      data: registry.get('minecraft:pack_mcmeta')?.defaultData as Json,
    },
    { id: `${NS}:island`, kind: 'minecraft:structure_template', data: island() },
    {
      id: `${NS}:goals/root`,
      kind: 'minecraft:advancement',
      data: {
        display: {
          icon: { id: 'minecraft:grass_block' },
          title: 'Skyblock',
          description: 'Grow your island',
          background: 'minecraft:block/dirt',
        },
        criteria: { start: { trigger: 'minecraft:tick' } },
      },
    },
    {
      id: `${NS}:skyblock`,
      kind: 'msm:world_setup',
      data: {
        world: { type: 'void', nether: 'vanilla', end: 'vanilla' },
        start: { structure: `${NS}:island`, at: [0, 64, 0], spawn: [2, 3, 1] },
        spawn_radius: 0,
        game_mode: 'survival',
        difficulty: 'normal',
        game_rules: { spawn_wandering_traders: true },
        new_player: {
          items: [
            { item: 'minecraft:lava_bucket', count: 1 },
            { item: 'minecraft:ice', count: 2 },
            { item: 'minecraft:bone_meal', count: 3, slot: 'hotbar.8' },
          ],
          message: 'Welcome to Skyblock. Do not fall!',
          effects: [{ effect: 'minecraft:slow_falling', seconds: 20 }],
        },
        goals: `${NS}:goals/root`,
      },
    },
  ];
}

/** Builds, saves and reloads the project as the app's session does. */
async function built(): Promise<Project> {
  const project = createEmptyProject('Skyblock', {
    targets: [builtInTargets[0]?.target.id ?? ''],
    plugins: PLUGINS.map((plugin) => plugin.id),
  });
  project.namespaces.push({
    name: NS,
    elements: elements().map((entry) =>
      createElement({
        id: entry.id as ResourceLocation,
        kind: entry.kind,
        data: structuredClone(entry.data),
        now: () => NOW,
      }),
    ),
    assets: [],
  });
  const fs = createMemoryFileSystem();
  await saveProject(fs, project, registry);
  const loaded = await loadProject(fs, registry);
  expect(loaded.problems).toEqual([]);
  return loaded.project;
}

/**
 * The project's registry ids, as the app's registry view derives them for these kinds, with the
 * ids a world setup's lowering writes (its world preset, sky biome, functions and advancement).
 */
function projectIds(project: Project): Record<string, string[]> {
  const ids: Record<string, string[]> = {};
  const add = (name: string, id: string): void => {
    ids[name] = [...(ids[name] ?? []), id];
  };
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const kind = registry.get(element.kind);
      const name = kind?.registry ?? element.kind.replace(/^minecraft:/, '');
      if (element.kind === 'msm:world_setup') {
        for (const [registryName, list] of Object.entries(worldSetupGeneratedIds(element))) {
          for (const id of list) add(registryName, id);
        }
      }
      if (name.includes(':') || element.kind === 'minecraft:pack_mcmeta') continue;
      add(name, element.id);
    }
  }
  return ids;
}

interface Context {
  schemaIndex: ReturnType<typeof createSchemaIndex>;
  vanilla: Record<string, string[]>;
  mcfunction: McfunctionService;
}

async function contextFor(bundle: TargetBundle): Promise<Context> {
  const read = (key: Parameters<typeof readVendoredJson>[1]) =>
    readVendoredJson(bundle, key, nodeReadFile);
  const [symbols, registries, commands, blocks] = await Promise.all([
    read('vanillaMcdocSymbols'),
    read('mcmetaRegistries'),
    read('mcmetaCommands'),
    read('mcmetaBlocks'),
  ]);
  const vanilla = registries as Record<string, string[]>;
  return {
    schemaIndex: createSchemaIndex(parseVanillaMcdocSymbols(symbols), {
      mcVersion: bundle.target.mcVersion,
    }),
    vanilla,
    mcfunction: await createMcfunctionService(
      { commands, blocks, registries: vanilla },
      { mcVersion: bundle.target.mcVersion },
    ),
  };
}

/** Exports with every function checked; `functions` are the ids the checker declares. */
async function exported(
  bundle: TargetBundle,
  context: Context,
  project: Project,
  registries: RegistryIndex,
  exporter: Exporter,
  checkerIds: Record<string, string[]>,
) {
  const sink = createMemorySink();
  const report = await runExport({
    project,
    registry,
    target: bundle.target,
    schemaIndex: context.schemaIndex,
    registries,
    exporter,
    sink,
    readAsset: async () => {
      throw new Error('no assets');
    },
    meta,
    async validateText(file) {
      if (file.language !== 'mcfunction') return [];
      const source = utf8.decode(file.contents as Uint8Array).replace(/\n$/, '');
      const found = await context.mcfunction.check(source, {
        uri: `file:///msm/${file.path}`,
        projectIds: checkerIds,
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
  return { report, files: sink.files() };
}

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'a void Skyblock on %s',
  (_id, bundle) => {
    it('validates and exports its vanilla packs with zero problems', async () => {
      const context = await contextFor(bundle);
      const project = await built();
      const ids = projectIds(project);
      const registries = createRegistryIndex({ vanilla: context.vanilla, project: ids });

      // Every element against its schema.
      for (const element of project.namespaces.flatMap((namespace) => namespace.elements)) {
        const kind = registry.get(element.kind);
        expect(kind, element.kind).toBeDefined();
        const node = context.schemaIndex.resolveSchemaRef(kind?.schema ?? '');
        expect(
          validateJson(element.data, node, { registries })
            .filter((problem) => !(kind?.hiddenPaths ?? []).includes(problem.path))
            .map((problem) => `${element.id} ${problem.path} ${problem.code}: ${problem.message}`),
        ).toEqual([]);
      }

      // Every plugin's validators.
      const elementList = project.namespaces.flatMap((namespace) => namespace.elements);
      const validated = PLUGINS.flatMap((plugin) => plugin.contributes.validators ?? []).flatMap(
        (validator) =>
          requireSyncResult(
            validator.validate({
              elements: elementList,
              target: bundle.target,
              registry: registries,
            }),
            validator.id,
          ),
      );
      expect(validated.filter((problem) => problem.severity !== 'info')).toEqual([]);

      // The functions the world setup writes are declared to the checker like project ones.
      expect(ids.function?.length).toBe(4);
      const checkerIds = { ...ids, 'tag/function': ['minecraft:load', 'minecraft:tick'] };

      const modOnly = modOnlyIdsOf(ids);
      const resource = await exported(
        bundle,
        context,
        project,
        registries,
        resourcePackExporter,
        checkerIds,
      );
      expect(resource.report.problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
      expect(resource.report.ok).toBe(true);
      const data = await exported(
        bundle,
        context,
        project,
        registries,
        vanillaSafeExporter(dataPackExporter, modOnly),
        checkerIds,
      );
      expect(data.report.problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
      expect(data.report.ok).toBe(true);

      // The pack holds the world type, the start and the first join.
      const folders = bundle.target.folders.data;
      const paths = [...data.files.keys()];
      for (const path of [
        `data/${NS}/${folders.worldgen}/world_preset/skyblock.json`,
        `data/${NS}/${folders.worldgen}/biome/msm_games/sky.json`,
        `data/minecraft/${folders.tags}/worldgen/world_preset/normal.json`,
        `data/minecraft/${folders.tags}/function/load.json`,
        `data/${NS}/${folders.structure}/island.nbt`,
        `data/${NS}/${folders.advancement}/msm_games/first_join.json`,
        `data/${NS}/${folders.function}/msm_games/world_setup/start.mcfunction`,
        `data/${NS}/${folders.function}/msm_games/world_setup/first_join.mcfunction`,
      ]) {
        expect(paths, path).toContain(path);
      }
      const start = utf8.decode(
        data.files.get(
          `data/${NS}/${folders.function}/msm_games/world_setup/start.mcfunction`,
        ) as Uint8Array,
      );
      expect(start).toContain(`place template ${NS}:island 0 64 0\n`);
      expect(start).toContain('setworldspawn 2 67 1\n');
      expect([...resource.files.keys()]).toContain(`assets/${NS}/lang/en_us.json`);
    });
  },
);
