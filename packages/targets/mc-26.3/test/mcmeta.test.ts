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
      id: '26.3',
      data_pack_version: 121,
      data_pack_version_minor: 0,
      resource_pack_version: 97,
      resource_pack_version_minor: 1,
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
});
