// @vitest-environment happy-dom
import type { SimFiles } from '@msm/sim';
import { Identifier } from 'deepslate/core';
import type { TextureAtlasProvider } from 'deepslate/render';
import { describe, expect, it } from 'vitest';
import type {
  ResourceFolders,
  VanillaAssetReader,
} from '../../../src/renderer/src/preview/model-chain';
import {
  blockFlagsFor,
  prepareTryItResources,
  textureAlphaFromAtlas,
} from '../../../src/renderer/src/tryit/render/resources';

// Made-up folder names prove the code reads them from the target.
const folders: ResourceFolders = {
  atlases: 'atl',
  block_definition: 'bdefs',
  font: 'fnt',
  item_definition: 'idefs',
  lang: 'lng',
  model: 'mdl',
  sounds_file: 'snd.json',
  textures: 'tex',
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const json = (value: unknown): string => JSON.stringify(value);
const single = (model: string) => json({ variants: { '': { model } } });
const cubeAll = (texture: string) =>
  json({ parent: 'minecraft:block/cube_all', textures: { all: texture } });

/**
 * A fake atlas: each texture is a 2 by 2 tile in one row. Texture ids with `glass` have
 * half-transparent pixels, ids with `leaves` some fully transparent ones.
 */
function fakeAtlas(textures: Record<string, Blob>, seen: string[][]): TextureAtlasProvider {
  const ids = Object.keys(textures).sort();
  seen.push(ids);
  const width = Math.max(2, ids.length * 2);
  const data = new Uint8ClampedArray(width * 2 * 4).fill(255);
  ids.forEach((id, i) => {
    for (let y = 0; y < 2; y += 1) {
      for (let x = i * 2; x < i * 2 + 2; x += 1) {
        const at = (y * width + x) * 4 + 3;
        if (id.includes('glass')) data[at] = 128;
        if (id.includes('leaves') && x === i * 2) data[at] = 0;
      }
    }
  });
  const image = { width, height: 2, data } as unknown as ImageData;
  return {
    getTextureAtlas: () => image,
    getTextureUV: (id: Identifier) => {
      const i = ids.indexOf(id.toString());
      return i < 0 ? [0, 0, 0, 0] : [(i * 2) / width, 0, (i * 2 + 2) / width, 1];
    },
    getPixelSize: () => 1 / width,
  };
}

const files: SimFiles = new Map<string, string | Uint8Array>([
  ['assets/demo/bdefs/ruby_block.json', single('demo:block/ruby_block')],
  ['assets/demo/mdl/block/ruby_block.json', cubeAll('demo:block/ruby')],
  ['assets/demo/tex/block/ruby.png', PNG],
  ['assets/demo/bdefs/ruby_glass.json', single('demo:block/ruby_glass')],
  ['assets/demo/mdl/block/ruby_glass.json', cubeAll('demo:block/ruby_glass')],
  ['assets/demo/tex/block/ruby_glass.png', PNG],
  ['assets/demo/bdefs/ruby_leaves.json', single('demo:block/ruby_leaves')],
  ['assets/demo/mdl/block/ruby_leaves.json', cubeAll('demo:block/ruby_leaves')],
  ['assets/demo/tex/block/ruby_leaves.png', PNG],
  [
    'assets/demo/bdefs/ruby_slab.json',
    json({
      variants: {
        'type=bottom': { model: 'demo:block/ruby_slab' },
        'type=top': { model: 'demo:block/ruby_slab_top' },
        'type=double': { model: 'demo:block/ruby_block' },
      },
    }),
  ],
  [
    'assets/demo/mdl/block/ruby_slab.json',
    json({
      textures: { all: 'demo:block/ruby' },
      elements: [
        {
          from: [0, 0, 0],
          to: [16, 8, 16],
          faces: Object.fromEntries(
            ['down', 'up', 'north', 'south', 'west', 'east'].map((f) => [f, { texture: '#all' }]),
          ),
        },
      ],
    }),
  ],
  // The top slab's model is missing: drawn with the checker cube.
  ['assets/demo/bdefs/painted.json', single('demo:block/painted')],
  ['assets/demo/mdl/block/painted.json', cubeAll('demo:block/painted')],
]);

const vanillaFiles: Record<string, string> = {
  'assets/minecraft/bdefs/stone.json': single('minecraft:block/stone'),
  'assets/minecraft/mdl/block/stone.json': cubeAll('minecraft:block/stone'),
};
const vanilla: VanillaAssetReader = {
  readAsset: async (path) => {
    if (path === 'assets/minecraft/tex/block/stone.png') return PNG;
    const text = vanillaFiles[path];
    return text === undefined ? null : new TextEncoder().encode(text);
  },
};

async function prepare(ids: string[], options: { vanilla?: VanillaAssetReader | null } = {}) {
  const atlases: string[][] = [];
  const reads: string[] = [];
  const prepared = await prepareTryItResources(ids, {
    files,
    folders,
    vanilla: options.vanilla ?? null,
    readProjectAsset: async (namespace, path) => {
      reads.push(`${namespace}/${path}`);
      return namespace === 'demo' && path === 'tex/block/painted.png' ? PNG : null;
    },
    createAtlas: async (textures) => fakeAtlas(textures, atlases),
  });
  return { prepared, atlases, reads };
}

const flagsOf = (prepared: Awaited<ReturnType<typeof prepareTryItResources>>, id: string) =>
  prepared.resources.getBlockFlags(Identifier.parse(id));

describe('Try it resources', () => {
  it('reads definitions, models and textures from the lowered files', async () => {
    const { prepared, atlases } = await prepare(['demo:ruby_block', 'demo:ruby_slab']);
    expect([...prepared.blockIds]).toEqual(['demo:ruby_block', 'demo:ruby_slab']);
    expect(
      prepared.resources.getBlockDefinition(Identifier.parse('demo:ruby_block')),
    ).not.toBeNull();
    expect(
      prepared.resources.getBlockModel(Identifier.parse('demo:block/ruby_slab')),
    ).not.toBeNull();
    expect(atlases[0]).toEqual(['demo:block/ruby']);
    expect(prepared.usedFallback).toBe(true);
    expect(prepared.missingModels).toEqual(['demo:block/ruby_slab_top']);
    expect(
      prepared.resources.getDefaultBlockProperties(Identifier.parse('demo:ruby_slab')),
    ).toEqual({
      type: 'bottom',
    });
  });

  it('gives real opacity flags', async () => {
    const { prepared } = await prepare([
      'demo:ruby_block',
      'demo:ruby_glass',
      'demo:ruby_leaves',
      'demo:ruby_slab',
    ]);
    expect(flagsOf(prepared, 'demo:ruby_block')).toEqual({ opaque: true });
    expect(flagsOf(prepared, 'demo:ruby_glass')).toEqual({
      opaque: false,
      semi_transparent: true,
      self_culling: true,
    });
    expect(flagsOf(prepared, 'demo:ruby_leaves')).toEqual({ opaque: false, self_culling: true });
    // A slab is not a full cube, even though its double variant is.
    expect(flagsOf(prepared, 'demo:ruby_slab')).toEqual({ opaque: false });
    // Not prepared: drawn as nothing, never culls its neighbours.
    expect(flagsOf(prepared, 'demo:other')).toEqual({ opaque: false });
  });

  it('draws a block without a definition as the opaque missing cube', async () => {
    const { prepared } = await prepare(['demo:nothing_here']);
    expect(prepared.missingDefinitions).toEqual(['demo:nothing_here']);
    expect(
      prepared.resources.getBlockDefinition(Identifier.parse('demo:nothing_here')),
    ).not.toBeNull();
    expect(flagsOf(prepared, 'demo:nothing_here')).toEqual({ opaque: true });
  });

  it('reads textures the files lack from the project, then the vanilla cache', async () => {
    const { prepared, reads, atlases } = await prepare(['demo:painted', 'minecraft:stone'], {
      vanilla,
    });
    expect(reads).toContain('demo/tex/block/painted.png');
    expect(atlases[0]).toEqual(['demo:block/painted', 'minecraft:block/stone']);
    expect(prepared.missingTextures).toEqual([]);
    expect(prepared.missingDefinitions).toEqual([]);
    expect(flagsOf(prepared, 'minecraft:stone')).toEqual({ opaque: true });
  });

  it('draws vanilla blocks as MSM’s plain coloured cubes without the client jar', async () => {
    const { prepared, atlases } = await prepare(['stone', 'minecraft:grass_block']);
    expect([...prepared.blockIds]).toEqual(['minecraft:grass_block', 'minecraft:stone']);
    expect(prepared.missingDefinitions).toEqual([]);
    expect(prepared.missingModels).toEqual([]);
    expect(prepared.missingTextures).toEqual([]);
    expect(prepared.fallbackBlocks).toEqual(['minecraft:grass_block', 'minecraft:stone']);
    expect(flagsOf(prepared, 'minecraft:stone')).toEqual({ opaque: true });
    // Grass has its own top, side and bottom pictures; stone one (B499: drawn by the art recipes).
    expect(atlases[0]?.filter((id) => id.startsWith('msm:tryit_drawn/'))).toHaveLength(4);
    // A project block without a definition is still the missing cube.
    const missing = await prepare(['demo:nothing']);
    expect(missing.prepared.missingDefinitions).toEqual(['demo:nothing']);
    expect(missing.prepared.fallbackBlocks).toEqual([]);
  });

  it('always draws liquids as see-through fallback cubes, also with the client jar', async () => {
    const { prepared } = await prepare(['minecraft:water', 'stone'], { vanilla });
    expect(prepared.fallbackBlocks).toEqual(['minecraft:water']);
    expect(prepared.missingDefinitions).toEqual([]);
  });

  it('treats missing textures as opaque', async () => {
    const atlas = fakeAtlas({}, []);
    expect(textureAlphaFromAtlas(atlas, ['demo:block/glass'])).toEqual(
      new Map([['demo:block/glass', 'opaque']]),
    );
    expect(blockFlagsFor([])).toEqual({ opaque: false });
  });
});
