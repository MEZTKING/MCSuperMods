/**
 * Vanilla pack safety for portals (ADR 0066, ADR 0077; B335). A portal block is a mod-only id
 * (a block registry entry; limit P1) and has no block item by default (ADR 0077 D1), and a
 * project frame block is mod-only too. So, in the vanilla data pack of a portal project:
 *
 * - the project dimension (vanilla data: a vanilla dimension type and flat layers of vanilla
 *   blocks) and the `spreadplayers` travel function are kept, with no warning;
 * - the portal's `#minecraft:portals` entry becomes `{ "id": ..., "required": false }` (D4);
 * - the frame block's loot table names its block item and is left out with
 *   `export.mod-only-reference` (D3);
 * - a function that `setblock`s the portal is kept and warned about with
 *   `export.mod-only-function` (D5);
 * - the portal's own `msm/` definition never reaches the pack.
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
import type { Element, Json, ResourceLocation } from '@msm/plugin-api';
import blocksItemsPlugin, { blockItemId } from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import worldgenPlugin from '@msm/plugin-worldgen';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, readVendoredJson } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  createMemorySink,
  dataPackExporter,
  MOD_ONLY_FUNCTION,
  MOD_ONLY_REFERENCE,
  modOnlyFunctionMessage,
  modOnlyIdsOf,
  runExport,
  vanillaSafeExporter,
} from '../src/index';
import { indexesFor } from './helpers';

const NOW = '2026-11-14T00:00:00.000Z';
const meta = {
  msmVersion: '1.4.0',
  plugins: ['msm.datapack', 'msm.worldgen', 'msm.blocks-items'],
};

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

const registry = new ElementKindRegistry();
for (const plugin of [resourcePackPlugin, dataPackPlugin, worldgenPlugin, blocksItemsPlugin]) {
  registerPlugin(registry, plugin);
}

const element = (id: string, kind: string, data: Json): Element =>
  createElement({ id: id as ResourceLocation, kind, data, now: () => NOW });

const PORTAL_ID = 'demo:sky_portal';
const FRAME_ID = 'demo:sky_stone';

/** The flat sky dimension, vanilla data only (as the Dimension flow writes it). */
const DIMENSION = element('demo:sky_realm', 'minecraft:dimension', {
  type: 'minecraft:overworld',
  generator: {
    type: 'minecraft:flat',
    settings: {
      biome: 'minecraft:plains',
      layers: [
        { block: 'minecraft:bedrock', height: 1 },
        { block: 'minecraft:stone', height: 3 },
      ],
      features: false,
      lakes: false,
      structure_overrides: [],
    },
  },
});

/** The Dimension flow's way in for vanilla packs: no mod-only id. */
const TRAVEL = element('demo:sky_realm/travel', 'minecraft:function', {
  lines: [
    '# Travels to the sky realm and back.',
    'execute if dimension demo:sky_realm in minecraft:overworld run return run spreadplayers ~ ~ 0 64 false @s',
    'execute in demo:sky_realm run spreadplayers ~ ~ 0 64 false @s',
  ],
});

/** A function that places the portal block itself. */
const BUILD = element('demo:build_portal', 'minecraft:function', {
  lines: ['# Opens a portal where you stand.', `setblock ~ ~ ~ ${PORTAL_ID}[axis=x]`],
});

/** The project frame block: drops itself, so its loot table names its block item. */
const FRAME = element(FRAME_ID, 'msm:block', {
  format: 1,
  display_name: 'Sky Stone',
  model: 'minecraft:block/calcite',
  loot: 'self',
  item: { creative_tab: 'minecraft:building_blocks' },
  components: { 'msm:breakable': { hardness: 1.5, resistance: 6, tool: 'pickaxe' } },
});

const PORTAL = element(PORTAL_ID, 'msm:block', {
  format: 1,
  type: 'portal',
  display_name: 'Sky Portal',
  frame: FRAME_ID,
  destination: 'demo:sky_realm',
  on_travel: 'demo:arrived',
  events: {
    'demo:arrived': { actions: [{ type: 'run_function', function: 'demo:sky_realm/travel' }] },
  },
});

function project(): Project {
  return {
    ...createEmptyProject('Portals'),
    namespaces: [{ name: 'demo', elements: [DIMENSION, TRAVEL, BUILD, FRAME, PORTAL], assets: [] }],
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

describe('portals in the vanilla data pack', () => {
  it('counts the portal as a mod-only block with no item', () => {
    expect(runtimeIds(project())).toEqual({
      block: [PORTAL_ID, FRAME_ID],
      item: [FRAME_ID],
    });
  });

  for (const bundle of builtInTargets) {
    it(`keeps the dimension and the way in, makes the tag entry optional (${bundle.target.id})`, async () => {
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
          dimension: ['demo:sky_realm'],
          function: ['demo:sky_realm/travel', 'demo:build_portal'],
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
      expect(report.ok).toBe(true);
      expect(
        report.problems
          .filter((problem) => problem.severity !== 'info')
          .map((problem) => [problem.code, problem.file]),
      ).toEqual([
        [
          MOD_ONLY_REFERENCE,
          `data/demo/${bundle.target.folders.data.loot_table}/blocks/sky_stone.json`,
        ],
        [
          MOD_ONLY_FUNCTION,
          `data/demo/${bundle.target.folders.data.function}/build_portal.mcfunction`,
        ],
      ]);

      const folders = bundle.target.folders.data;
      const files = sink.files();
      const text = (path: string): string => utf8.decode(files.get(path) as Uint8Array);
      const json = (path: string): Json => JSON.parse(text(path));
      const functionPath = (path: string) => `data/demo/${folders.function}/${path}.mcfunction`;
      const buildPath = functionPath('build_portal');

      // The dimension and the travel function stay as written.
      expect(json(`data/demo/${folders.dimension}/sky_realm.json`)).toEqual(DIMENSION.data);
      expect(text(functionPath('sky_realm/travel'))).toContain(
        'execute in demo:sky_realm run spreadplayers',
      );

      // The portal's tag entry becomes optional, so vanilla servers load the tag.
      expect(json(`data/minecraft/${folders.tags}/block/portals.json`)).toEqual({
        values: [{ id: PORTAL_ID, required: false }],
      });

      // The frame block's loot table is left out; the function placing the portal is kept.
      expect(files.has(`data/demo/${folders.loot_table}/blocks/sky_stone.json`)).toBe(false);
      expect(text(buildPath)).toContain(`setblock ~ ~ ~ ${PORTAL_ID}[axis=x]`);
      expect(report.problems.find((problem) => problem.code === MOD_ONLY_FUNCTION)?.message).toBe(
        modOnlyFunctionMessage(buildPath, PORTAL_ID),
      );

      // No runtime definition and no plain entry naming a mod-only id reach the pack.
      expect([...files.keys()].some((path) => path.startsWith('msm/'))).toBe(false);
      for (const [path, bytes] of files) {
        if (!path.startsWith('data/') || !path.endsWith('.json')) continue;
        const contents = utf8.decode(bytes);
        for (const id of [PORTAL_ID, FRAME_ID]) {
          expect(
            contents.includes(`"${id}"`) && !contents.includes('"required": false'),
            path,
          ).toBe(false);
        }
      }
    });
  }
});
