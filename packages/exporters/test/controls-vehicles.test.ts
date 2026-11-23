/**
 * Key binds, HUD elements and vehicles in the exporters (ADR 0088 D10, ADR 0090 D14; B415):
 *
 * - a vehicle's item and entity ids are mod-only ids, so a recipe making the vehicle item is
 *   left out of the vanilla data pack with `export.mod-only-reference`;
 * - the Java eject warns `export.not-in-eject` once per key bind, HUD element and vehicle, and
 *   still builds a valid tree.
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
} from '@msm/core';
import type { Element, Json, ResourceLocation } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import controlsPlugin from '@msm/plugin-controls';
import dataPackPlugin from '@msm/plugin-datapack';
import entitiesPlugin from '@msm/plugin-entities';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, readVendoredJson } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  createJavaProjectExporter,
  createMemorySink,
  dataPackExporter,
  ExportProblemCodes,
  MOD_ONLY_REFERENCE,
  modOnlyIdsOf,
  runExport,
  vanillaSafeExporter,
} from '../src/index';
import { indexesFor } from './helpers';

const NOW = '2026-11-15T00:00:00.000Z';
const meta = {
  msmVersion: '1.4.0',
  plugins: ['msm.datapack', 'msm.blocks-items', 'msm.entities', 'msm.controls'],
};
const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

const registry = new ElementKindRegistry();
for (const plugin of [
  resourcePackPlugin,
  dataPackPlugin,
  blocksItemsPlugin,
  entitiesPlugin,
  controlsPlugin,
]) {
  registerPlugin(registry, plugin);
}

const element = (id: string, kind: string, data: Json): Element =>
  createElement({ id: id as ResourceLocation, kind, data, now: () => NOW });

const VEHICLE_ID = 'demo:buggy';

const VEHICLE = element(VEHICLE_ID, 'msm:vehicle', {
  format: 1,
  display_name: 'Buggy',
  model: { geometry: '', texture: 'demo:entity/buggy' },
  movement: { mode: 'ground' },
});

/** A recipe whose result is the vehicle's item. */
const RECIPE = element('demo:buggy_recipe', 'minecraft:recipe', {
  type: 'minecraft:crafting_shapeless',
  ingredients: ['minecraft:iron_ingot', 'minecraft:redstone'],
  result: { id: VEHICLE_ID, count: 1 },
});

/** A recipe with only vanilla ids: kept. */
const PLAIN_RECIPE = element('demo:plain_recipe', 'minecraft:recipe', {
  type: 'minecraft:crafting_shapeless',
  ingredients: ['minecraft:iron_ingot'],
  result: { id: 'minecraft:iron_block', count: 1 },
});

const KEY_BIND = element('demo:boost', 'msm:key_bind', {
  format: 1,
  default_key: 'key.keyboard.j',
});
const HUD = element('demo:fuel', 'msm:hud', { format: 1, type: 'bar', value: { source: 'set' } });

function project(elements: Element[]): Project {
  return {
    ...createEmptyProject('Vehicles'),
    namespaces: [{ name: 'demo', elements, assets: [] }],
  };
}

describe('vehicles in the vanilla data pack', () => {
  for (const bundle of builtInTargets) {
    it(`leaves out a recipe making the vehicle item (${bundle.target.id})`, async () => {
      const { schemaIndex } = await indexesFor(bundle);
      const vanilla = (await readVendoredJson(bundle, 'mcmetaRegistries', nodeReadFile)) as Record<
        string,
        string[]
      >;
      // As the app's `dataRegistryIds` declares them: the entity type and the item share the id.
      const ids = { entity_type: [VEHICLE_ID], item: [VEHICLE_ID] };
      const registries = createRegistryIndex({
        vanilla,
        project: { ...ids, recipe: ['demo:buggy_recipe', 'demo:plain_recipe'] },
      });
      const sink = createMemorySink();
      const report = await runExport({
        project: project([VEHICLE, RECIPE, PLAIN_RECIPE]),
        registry,
        target: bundle.target,
        schemaIndex,
        registries,
        exporter: vanillaSafeExporter(dataPackExporter, modOnlyIdsOf(ids)),
        sink,
        readAsset: async () => {
          throw new Error('no assets');
        },
        meta,
      });
      expect(report.problems.filter((p) => p.severity === 'error')).toEqual([]);
      expect(report.ok).toBe(true);
      const left = report.problems.filter((problem) => problem.code === MOD_ONLY_REFERENCE);
      expect(left.map((problem) => problem.file)).toEqual([
        `data/demo/${bundle.target.folders.data.recipe}/buggy_recipe.json`,
      ]);
      const recipes = bundle.target.folders.data.recipe;
      const files = sink.files();
      expect(files.has(`data/demo/${recipes}/buggy_recipe.json`)).toBe(false);
      expect(files.has(`data/demo/${recipes}/plain_recipe.json`)).toBe(true);
      expect([...files.keys()].some((path) => path.startsWith('msm/'))).toBe(false);
    });
  }
});

describe('key binds, HUD elements and vehicles in the Java project', () => {
  for (const bundle of builtInTargets.filter(
    (entry) => entry.target.loadJavaProject !== undefined,
  )) {
    it(`warns once per element and still builds the tree (${bundle.target.id})`, async () => {
      const { schemaIndex, registries } = await indexesFor(bundle);
      const sink = createMemorySink();
      const report = await runExport({
        project: project([VEHICLE, KEY_BIND, HUD]),
        registry,
        target: bundle.target,
        schemaIndex,
        registries,
        exporter: createJavaProjectExporter({ loadGradleWrapper: async () => undefined }),
        sink,
        readAsset: async () => {
          throw new Error('no assets');
        },
        meta,
      });
      expect(report.problems.filter((p) => p.severity === 'error')).toEqual([]);
      expect(report.ok).toBe(true);
      const warned = report.problems.filter(
        (problem) => problem.code === ExportProblemCodes.notInEject,
      );
      expect(warned.map((problem) => problem.file)).toEqual([
        'msm/demo/hud/fuel.json',
        'msm/demo/key_bind/boost.json',
        'msm/demo/vehicle/buggy.json',
      ]);
      expect(warned.every((problem) => problem.severity === 'warning')).toBe(true);
      // No "unknown definition folder" warning for the three kinds.
      expect(
        report.problems.filter(
          (problem) => problem.code === ExportProblemCodes.javaGenerationFailed,
        ),
      ).toEqual([]);
      const files = sink.files();
      expect(files.has('build.gradle.kts')).toBe(true);
      expect([...files.keys()].some((path) => path.startsWith('msm/'))).toBe(false);
    });
  }
});
