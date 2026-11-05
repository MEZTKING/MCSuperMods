import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { target, vendored } from '../src/index';

async function readJson(url: URL): Promise<unknown> {
  return JSON.parse(await readFile(url, 'utf8')) as unknown;
}

describe('vendored mcmeta data', () => {
  it('describes the target version and its pack formats', async () => {
    const version = (await readJson(vendored.mcmetaVersion)) as Record<string, unknown>;
    expect(version).toMatchObject({
      id: '26.4-snapshot-7',
      type: 'snapshot',
      data_version: 5127,
      data_pack_version: 126,
      data_pack_version_minor: 0,
      resource_pack_version: 102,
      resource_pack_version_minor: 0,
    });
    expect(version.id).toBe(target.mcVersion);
    expect(target.packFormats.data).toEqual({
      major: version.data_pack_version,
      minor: version.data_pack_version_minor,
    });
    expect(target.packFormats.resource).toEqual({
      major: version.resource_pack_version,
      minor: version.resource_pack_version_minor,
    });
  });

  it('lists recipe serialisers (ids stored without namespace)', async () => {
    const registries = (await readJson(vendored.mcmetaRegistries)) as Record<string, string[]>;
    const serialisers = registries.recipe_serializer ?? [];
    expect(serialisers.map((id) => `minecraft:${id}`)).toContain('minecraft:crafting_shaped');
  });

  /**
   * Regression list of the registry changes between the 26.3 and 26.4-snapshot-7 vendored
   * files (the plan's facts table). B153 ties its removed-id migration table to the full diff;
   * this keeps the snapshot pin honest.
   */
  it('has the registries 26.4-snapshot-7 added and lacks the one it removed', async () => {
    const registries = (await readJson(vendored.mcmetaRegistries)) as Record<string, string[]>;
    expect(Object.keys(registries)).toHaveLength(192);
    expect(registries).not.toHaveProperty('rule_test');
    for (const name of ['rule_test_type', 'block_sound_set', 'tag/block_sound_set']) {
      expect(registries, name).toHaveProperty([name]);
    }
  });

  it('lacks the members 26.4-snapshot-7 removed and has their replacements', async () => {
    const registries = (await readJson(vendored.mcmetaRegistries)) as Record<string, string[]>;
    const removed: Record<string, string[]> = {
      fluid: ['flowing_water', 'flowing_lava'],
      'worldgen/feature_type': ['large_dripstone'],
      'worldgen/density_function_type': ['interpolated'],
      particle_type: ['item_snowball'],
    };
    const added: Record<string, string[]> = {
      'worldgen/feature_type': ['crevasse', 'large_speleothem'],
      'worldgen/density_function_type': ['domain_warp', 'upscale'],
      particle_type: ['freezing'],
      item: ['frostbite_spawn_egg', 'ice_ball'],
      'worldgen/biome': ['ice_caves'],
      entity_type: ['frostbite', 'ice_ball'],
      mob_effect: ['freezing'],
      potion: ['freezing'],
      environment_attribute: ['visual/has_sky_occluder'],
      block_predicate_type: ['below_heightmap'],
      jukebox_song: ['flurry'],
    };
    for (const [registry, ids] of Object.entries(removed)) {
      for (const id of ids) expect(registries[registry], `${registry} ${id}`).not.toContain(id);
    }
    for (const [registry, ids] of Object.entries(added)) {
      for (const id of ids) expect(registries[registry], `${registry} ${id}`).toContain(id);
    }
  });
});
