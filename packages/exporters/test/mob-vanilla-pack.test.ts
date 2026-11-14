/**
 * Vanilla pack safety for mobs (ADR 0066, ADR 0071 D7): a project with a rideable, saddled mob
 * exports a vanilla data pack whose `#minecraft:can_equip_saddle` entry for the mob is
 * `{ "id": ..., "required": false }` and in which no other file names the mob, so the pack loads
 * on a vanilla server and simply does not list the mob. The Fabric mod jar keeps the plain
 * entry, so the vanilla saddle equips the mob where the mod is installed.
 *
 * The mob is lowered by the real entities plugin. The saddle tag entry is also given as a
 * `minecraft:tag/entity_type` element holding exactly what the entities lowering writes for a
 * saddled mount (the tag named by `TargetFacts.entities.saddleTag`, `merge: 'tag'`): the
 * lowering's own entry (B287) merges into the same file, so the test holds with or without it.
 */

import { readFile } from 'node:fs/promises';
import { createElement, ElementKindRegistry, registerPlugin, utf8 } from '@msm/core';
import type { Element, Json, Problem, Project, ResourceLocation } from '@msm/plugin-api';
import dataPackPlugin from '@msm/plugin-datapack';
import entitiesPlugin from '@msm/plugin-entities';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, readVendoredJson } from '@msm/targets';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  createFabricContentJarExporter,
  createMemorySink,
  createZipSink,
  dataPackExporter,
  MOD_ONLY_REFERENCE,
  modOnlyIdsOf,
  runExport,
  vanillaSafeExporter,
} from '../src/index';
import { fakeAsset, indexesFor, meta } from './helpers';

const NAMESPACE = 'demo';
const MOB = `${NAMESPACE}:mount`;
const EGG = `${MOB}_spawn_egg`;
const LOOT = `${NAMESPACE}:entities/mount`;
const NOW = '2026-11-14T00:00:00.000Z';

const registry = new ElementKindRegistry();
registerPlugin(registry, dataPackPlugin);
registerPlugin(registry, entitiesPlugin);

/** A saddled mount: `msm:rideable` with `saddle: true` (ADR 0071 D3). */
const mount: Json = {
  format: 1,
  display_name: 'Mount',
  category: 'creature',
  size: { width: 1.2, height: 1.4 },
  loot_table: LOOT,
  components: {
    'msm:health': { max: 20 },
    'msm:movement': { speed: 0.25 },
    'msm:animated_model': {
      model: `${NAMESPACE}:entity/mount`,
      texture: `${NAMESPACE}:entity/mount`,
    },
    'msm:rideable': { saddle: true, speed: 1.5, jump: 0.6 },
  },
};

/** The mount's loot table names only vanilla items, so it stays in the vanilla pack. */
const loot: Json = {
  type: 'minecraft:entity',
  pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:leather' }] }],
};

function element(kind: string, id: ResourceLocation, data: Json): Element {
  return createElement({ kind, id, data, now: () => NOW });
}

function mountProject(saddleTag: ResourceLocation): Project {
  const [tagNamespace] = saddleTag.split(':') as [string, string];
  return {
    formatVersion: 1,
    name: 'Mount Pack',
    namespaces: [
      {
        name: NAMESPACE,
        elements: [element('msm:entity', MOB, mount), element('minecraft:loot_table', LOOT, loot)],
        assets: [],
      },
      {
        name: tagNamespace,
        elements: [
          element('minecraft:tag/entity_type', saddleTag, { replace: false, values: [MOB] }),
        ],
        assets: [],
      },
    ].sort((a, b) => a.name.localeCompare(b.name)),
    targets: [],
    plugins: ['msm.datapack', 'msm.entities'],
    settings: {},
  };
}

/** The mod-only ids as the app computes them: the mob and its spawn egg. */
const modOnly = modOnlyIdsOf({ entity_type: [MOB], item: [EGG] });

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'rideable mob, vanilla data pack (%s)',
  (_id, bundle) => {
    const { target } = bundle;
    const saddleTag = (target.entities?.saddleTag ??
      'minecraft:can_equip_saddle') as ResourceLocation;
    const [tagNamespace, tagPath] = saddleTag.split(':') as [string, string];
    const tagFile = `data/${tagNamespace}/${target.folders.data.tags}/entity_type/${tagPath}.json`;

    async function context() {
      const { schemaIndex } = await indexesFor(bundle);
      const vanilla = (await readVendoredJson(bundle, 'mcmetaRegistries', (url: URL) =>
        readFile(url),
      )) as Record<string, string[]>;
      const registries = createRegistryIndex({
        vanilla,
        project: { entity_type: [MOB], item: [EGG], loot_table: [LOOT] },
      });
      return { schemaIndex, registries };
    }

    it('makes the can_equip_saddle entry optional and names the mob nowhere else', async () => {
      expect(target.entities?.saddleTag).toBe('minecraft:can_equip_saddle');
      const { schemaIndex, registries } = await context();
      const sink = createMemorySink();
      const report = await runExport({
        project: mountProject(saddleTag),
        registry,
        target,
        schemaIndex,
        registries,
        exporter: vanillaSafeExporter(dataPackExporter, modOnly),
        sink,
        readAsset: fakeAsset,
        meta,
      });
      const notInfo = (problems: Problem[]) =>
        problems.filter((problem) => problem.severity !== 'info');
      expect(notInfo(report.problems)).toEqual([]);
      expect(report.ok).toBe(true);
      // Nothing had to be left out: only the tag names the mob, and it is made optional.
      expect(report.problems.map((problem) => problem.code)).not.toContain(MOD_ONLY_REFERENCE);

      const files = sink.files();
      const tag = files.get(tagFile);
      expect(tag, tagFile).toBeDefined();
      expect(JSON.parse(utf8.decode(tag as Uint8Array))).toEqual({
        replace: false,
        values: [{ id: MOB, required: false }],
      });
      expect(
        files.has(`data/${NAMESPACE}/${target.folders.data.loot_table}/entities/mount.json`),
      ).toBe(true);
      // No other file of the vanilla pack names the mob or its spawn egg, and nothing of the
      // mod layer (`msm/`) or the resource pack reaches it.
      for (const [path, bytes] of files) {
        expect(
          path.startsWith('data/') || path === 'pack.mcmeta' || path === 'msm.export.json',
          path,
        ).toBe(true);
        if (path === tagFile) continue;
        const text = utf8.decode(bytes);
        expect(text.includes(MOB), path).toBe(false);
      }
    });

    it('keeps the plain entry in the Fabric mod jar', async () => {
      const { schemaIndex, registries } = await context();
      const sink = createZipSink();
      const report = await runExport({
        project: mountProject(saddleTag),
        registry,
        target,
        schemaIndex,
        registries,
        exporter: createFabricContentJarExporter({
          loadRuntimeJar: async () => utf8.encode('PK stub runtime'),
          loadGeckolibJar: async () => utf8.encode('PK stub GeckoLib'),
        }),
        sink,
        readAsset: fakeAsset,
        meta,
      });
      expect(report.problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
      const files = unzipSync(sink.finish());
      expect(JSON.parse(utf8.decode(files[tagFile] as Uint8Array))).toEqual({
        replace: false,
        values: [MOB],
      });
      expect(files[`msm/${NAMESPACE}/entity/mount.json`]).toBeDefined();
    });
  },
);
