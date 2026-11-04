import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { target } from '../src/index';

async function readJson(relative: string): Promise<Record<string, unknown>> {
  const text = await readFile(new URL(relative, import.meta.url), 'utf8');
  return JSON.parse(text) as Record<string, unknown>;
}

describe('target mc-26.3', () => {
  it('derives its id from the Minecraft version', () => {
    expect(target.id).toBe(`mc-${target.mcVersion}`);
  });

  it('pins vanilla-mcdoc to a full commit sha', () => {
    expect(target.mcdocRef).toMatch(/^[0-9a-f]{40}$/);
  });

  it('matches the vendored vanilla-mcdoc ref', async () => {
    const source = await readJson('../vendor/vanilla-mcdoc/SOURCE.json');
    expect(source.ref).toBe(target.mcdocRef);
    const symbols = await readJson('../vendor/vanilla-mcdoc/symbols.json');
    expect(symbols.ref).toBe(target.mcdocRef);
  });

  it('matches the vendored mcmeta refs', async () => {
    const source = await readJson('../vendor/mcmeta/SOURCE.json');
    const refs = source.refs as { summary: string; registries: string };
    expect(refs.summary).toBe(`${target.mcmetaRef}-summary`);
    expect(refs.registries).toBe(`${target.mcmetaRef}-registries`);
  });

  it('names every resource pack folder', () => {
    expect(target.folders.resource).toEqual({
      model: 'models',
      block_definition: 'blockstates',
      item_definition: 'items',
      lang: 'lang',
      sounds_file: 'sounds.json',
      textures: 'textures',
      atlases: 'atlases',
      font: 'font',
    });
    for (const name of Object.values(target.folders.resource)) {
      expect(name).toMatch(/^[a-z_]+(\.json)?$/);
    }
  });
});
