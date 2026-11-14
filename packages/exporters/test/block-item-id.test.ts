/**
 * A block item with its own id (ADR 0068 D2) in the vanilla data pack (ADR 0066): a crop
 * planted from its seeds registers the seeds under `item.id`, not under the block's id, so the
 * mod-only ids take the item id from `blockItemId`. A recipe naming only the seeds is left out
 * of the vanilla data pack with `export.mod-only-reference`, tag entries naming the seeds
 * (the always-written `minecraft:villager_plantable_seeds` and a project tag) become
 * `required: false`, and files naming only vanilla ids stay. Exported on every built-in target.
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
import type { Element, Json, ResourceLocation } from '@msm/plugin-api';
import blocksItemsPlugin, { blockItemId } from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, readVendoredJson } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  createMemorySink,
  dataPackExporter,
  MOD_ONLY_REFERENCE,
  modOnlyIdsOf,
  runExport,
  vanillaSafeExporter,
} from '../src/index';
import { indexesFor } from './helpers';

const NOW = '2026-11-14T00:00:00.000Z';
const meta = { msmVersion: '1.4.0', plugins: ['msm.datapack', 'msm.blocks-items'] };

const registry = new ElementKindRegistry();
for (const plugin of [resourcePackPlugin, dataPackPlugin, blocksItemsPlugin]) {
  registerPlugin(registry, plugin);
}

const element = (id: string, kind: string, data: Json): Element =>
  createElement({ id: id as ResourceLocation, kind, data, now: () => NOW });

const CROP = element('demo:tomatoes', 'msm:block', {
  format: 1,
  type: 'crop',
  display_name: 'Tomatoes',
  sound_type: 'grass',
  textures: {
    stages: [
      'minecraft:block/wheat_stage0',
      'minecraft:block/wheat_stage1',
      'minecraft:block/wheat_stage2',
      'minecraft:block/wheat_stage3',
      'minecraft:block/wheat_stage4',
      'minecraft:block/wheat_stage5',
      'minecraft:block/wheat_stage6',
      'minecraft:block/wheat_stage7',
    ],
  },
  item: { id: 'demo:tomato_seeds', creative_tab: 'minecraft:natural_blocks' },
  loot: 'crop',
  crop_drops: { produce: 'minecraft:wheat' },
  components: { 'msm:breakable': { hardness: 0, resistance: 0 } },
});

/** Names only the seeds and vanilla items: mod-only through `item.id` alone. */
const SEEDS_RECIPE = element('demo:seeds_to_bone_meal', 'minecraft:recipe', {
  type: 'minecraft:crafting_shapeless',
  ingredients: ['demo:tomato_seeds'],
  result: { id: 'minecraft:bone_meal', count: 1 },
});

/** Names only vanilla items: kept. */
const VANILLA_RECIPE = element('demo:wheat_to_seeds', 'minecraft:recipe', {
  type: 'minecraft:crafting_shapeless',
  ingredients: ['minecraft:wheat'],
  result: { id: 'minecraft:wheat_seeds', count: 1 },
});

const SEEDS_TAG = element('demo:seeds', 'minecraft:tag/item', {
  values: ['demo:tomato_seeds', 'minecraft:wheat_seeds'],
});

function project(): Project {
  return {
    ...createEmptyProject('Seeds'),
    namespaces: [
      {
        name: 'demo',
        elements: [CROP, SEEDS_RECIPE, VANILLA_RECIPE, SEEDS_TAG],
        assets: [],
      },
    ],
  };
}

/** The runtime registry ids of the project as the app's `dataRegistryIds` declares them. */
function runtimeIds(value: Project): { block: string[]; item: string[] } {
  const block: string[] = [];
  const item: string[] = [];
  for (const namespace of value.namespaces) {
    for (const entry of namespace.elements) {
      if (entry.kind === 'msm:item') item.push(entry.id);
      if (entry.kind !== 'msm:block') continue;
      block.push(entry.id);
      const itemId = blockItemId(entry);
      if (itemId !== undefined) item.push(itemId);
    }
  }
  return { block: block.sort(), item: item.sort() };
}

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

describe('block item ids in the vanilla data pack', () => {
  it('counts the seeds (item.id) as the mod-only item, not the crop id', () => {
    expect(runtimeIds(project())).toEqual({
      block: ['demo:tomatoes'],
      item: ['demo:tomato_seeds'],
    });
  });

  it('would keep the seeds recipe if the item id were taken from the block id', async () => {
    const bundle = builtInTargets[0];
    if (bundle === undefined) throw new Error('no built-in target');
    const { schemaIndex } = await indexesFor(bundle);
    const sink = createMemorySink();
    await runExport({
      project: project(),
      registry,
      target: bundle.target,
      schemaIndex,
      exporter: vanillaSafeExporter(
        dataPackExporter,
        modOnlyIdsOf({ block: ['demo:tomatoes'], item: ['demo:tomatoes'] }),
      ),
      sink,
      readAsset: async () => {
        throw new Error('no assets');
      },
      meta,
    });
    const recipe = `data/demo/${bundle.target.folders.data.recipe}/seeds_to_bone_meal.json`;
    expect(sink.files().has(recipe)).toBe(true);
  });

  for (const bundle of builtInTargets) {
    it(`leaves out files naming the seeds and makes tag entries optional (${bundle.target.id})`, async () => {
      const { schemaIndex } = await indexesFor(bundle);
      const vanilla = (await readVendoredJson(bundle, 'mcmetaRegistries', nodeReadFile)) as Record<
        string,
        string[]
      >;
      const ids = runtimeIds(project());
      const registries = createRegistryIndex({
        vanilla,
        project: {
          ...ids,
          recipe: ['demo:seeds_to_bone_meal', 'demo:wheat_to_seeds'],
          'tag/item': ['demo:seeds'],
        },
      });
      const sink = createMemorySink();
      const report = await runExport({
        project: project(),
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
      expect(
        report.problems.filter(
          (problem) => problem.severity !== 'info' && problem.code !== MOD_ONLY_REFERENCE,
        ),
      ).toEqual([]);
      expect(report.ok).toBe(true);

      const folders = bundle.target.folders.data;
      const files = sink.files();
      const json = (path: string): Json => JSON.parse(utf8.decode(files.get(path) as Uint8Array));
      const recipe = (path: string) => `data/demo/${folders.recipe}/${path}.json`;
      const lootTable = `data/demo/${folders.loot_table}/blocks/tomatoes.json`;

      // The recipe naming only the seeds and the crop's loot table are left out, each warned.
      expect(files.has(recipe('seeds_to_bone_meal'))).toBe(false);
      expect(files.has(lootTable)).toBe(false);
      expect(files.has(recipe('wheat_to_seeds'))).toBe(true);
      const leftOut = report.problems
        .filter((problem) => problem.code === MOD_ONLY_REFERENCE)
        .map((problem) => problem.file);
      expect(leftOut).toContain(recipe('seeds_to_bone_meal'));
      expect(leftOut).toContain(lootTable);
      expect(
        report.problems.find((problem) => problem.file === recipe('seeds_to_bone_meal'))?.message,
      ).toContain('demo:tomato_seeds');

      // Tag entries naming the seeds become optional; vanilla entries stay plain.
      expect(json('data/demo/tags/item/seeds.json')).toEqual({
        values: [{ id: 'demo:tomato_seeds', required: false }, 'minecraft:wheat_seeds'],
      });
      const plantable = json('data/minecraft/tags/item/villager_plantable_seeds.json') as {
        values: Json[];
      };
      expect(plantable.values).toEqual([{ id: 'demo:tomato_seeds', required: false }]);
      // The crop's block tags name the block, which is mod-only too.
      const crops = json('data/minecraft/tags/block/crops.json') as { values: Json[] };
      expect(crops.values).toEqual([{ id: 'demo:tomatoes', required: false }]);
      // Nothing in the vanilla data pack names the seeds or the crop as a plain entry.
      for (const [path, bytes] of files) {
        if (!path.startsWith('data/') || !path.endsWith('.json')) continue;
        const text = utf8.decode(bytes);
        for (const id of ['demo:tomato_seeds', 'demo:tomatoes']) {
          expect(text.includes(`"${id}"`) && !text.includes('"required": false'), path).toBe(false);
        }
      }
    });
  }
});
