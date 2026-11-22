import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { builtInTargets, readVendoredJson, targetById } from '../src/index';
import { clientJarPath, zipEntries } from './client-jar';

/**
 * `WorldgenFacts.terrainPreview` (ADR 0119 D16; plugin API 1.21.0): the jar's data folders the
 * live world generation preview caches, and the parts approximate on each target. The folder
 * lists are pinned here and checked against the client jar Fabric Loom caches (entry names
 * only; no file is read). The jar checks are skipped without a jar: MSM never bundles Mojang
 * files.
 */
const FOLDERS = [
  'dimension_type',
  'tags/worldgen/biome',
  'tags/worldgen/feature',
  'tags/worldgen/flat_level_generator_preset',
  'tags/worldgen/structure',
  'tags/worldgen/world_preset',
  'worldgen/biome',
  'worldgen/block_state_provider',
  'worldgen/carver',
  'worldgen/density_function',
  'worldgen/feature',
  'worldgen/flat_level_generator_preset',
  'worldgen/material_condition',
  'worldgen/material_rule',
  'worldgen/multi_noise_biome_source_parameter_list',
  'worldgen/noise',
  'worldgen/noise_settings',
  'worldgen/placed_feature',
  'worldgen/processor_list',
  'worldgen/structure',
  'worldgen/structure_set',
  'worldgen/template_pool',
  'worldgen/world_preset',
];

/** Per target: the pinned facts and the JSON file count B574 (WS11) read from its jar. */
const EXPECTED = {
  'mc-26.3': { approximate: ['end'], files: 1271 },
  'mc-26.4': { approximate: ['biome_layout', 'end'], files: 1325 },
} as const;

const DATA = 'data/minecraft/';

/** The folder of `folders` (longest match) that a jar path under `data/minecraft/` is in. */
function folderOf(path: string, folders: readonly string[]): string | undefined {
  const relative = path.slice(DATA.length);
  let best: string | undefined;
  for (const folder of folders) {
    if (relative.startsWith(`${folder}/`) && (best === undefined || folder.length > best.length)) {
      best = folder;
    }
  }
  return best;
}

describe('worldgen.terrainPreview', () => {
  it('is pinned on both built-in targets', () => {
    expect(builtInTargets.map((bundle) => bundle.target.id).sort()).toEqual(
      Object.keys(EXPECTED).sort(),
    );
    for (const [id, expected] of Object.entries(EXPECTED)) {
      const facts = targetById(id)?.target.worldgen.terrainPreview;
      expect(facts, id).toBeDefined();
      expect(facts?.dataFolders, id).toEqual(FOLDERS);
      expect(facts?.approximate, id).toEqual(expected.approximate);
      // No `dimension` folder: vanilla's dimensions are inline in its world presets.
      expect(facts?.dataFolders, id).not.toContain('dimension');
    }
  });

  it('names registries the target has, apart from the tag folders', async () => {
    for (const bundle of builtInTargets) {
      const registries = (await readVendoredJson(
        bundle,
        'mcmetaRegistries',
        async (url) => new Uint8Array(await readFile(url)),
      )) as Record<string, unknown>;
      for (const folder of bundle.target.worldgen.terrainPreview?.dataFolders ?? []) {
        if (folder.startsWith('tags/')) {
          expect(registries, folder).toHaveProperty(folder.slice('tags/'.length));
          continue;
        }
        expect(registries, `${bundle.target.id} ${folder}`).toHaveProperty(folder);
      }
    }
  });

  for (const bundle of builtInTargets) {
    const { id, mcVersion } = bundle.target;
    const jar = clientJarPath(id, mcVersion);
    it.skipIf(jar === undefined)(`matches the ${mcVersion} client jar's data folders`, async () => {
      const facts = bundle.target.worldgen.terrainPreview;
      if (jar === undefined || facts === undefined) throw new Error('unreachable');
      const json = (await zipEntries(jar))
        .map((entry) => entry.name)
        .filter((name) => name.startsWith(DATA) && name.endsWith('.json'));
      const kept = json.filter((name) => folderOf(name, facts.dataFolders) !== undefined);
      const counts = new Map<string, number>();
      for (const name of kept) {
        const folder = folderOf(name, facts.dataFolders) as string;
        counts.set(folder, (counts.get(folder) ?? 0) + 1);
      }
      // Every folder holds files, and the total is the one WS11 measured.
      for (const folder of facts.dataFolders) {
        expect(counts.get(folder) ?? 0, folder).toBeGreaterThan(0);
      }
      expect(kept.length).toBe(EXPECTED[id as keyof typeof EXPECTED].files);
      // Nothing under worldgen/ or tags/worldgen/ is left out, and there is no dimension folder.
      const missed = json.filter(
        (name) =>
          (name.startsWith(`${DATA}worldgen/`) || name.startsWith(`${DATA}tags/worldgen/`)) &&
          folderOf(name, facts.dataFolders) === undefined,
      );
      expect(missed).toEqual([]);
      expect(json.some((name) => name.startsWith(`${DATA}dimension/`))).toBe(false);
    });
  }
});
