// @vitest-environment happy-dom
import type { Project } from '@msm/plugin-api';
import { Identifier } from 'deepslate/core';
import type { TextureAtlasProvider } from 'deepslate/render';
import { describe, expect, it } from 'vitest';
import {
  createPreviewResources,
  MISSING_BLOCK_MODEL,
} from '../../../src/renderer/src/preview/asset-source';
import type { ResourceFolders } from '../../../src/renderer/src/preview/model-chain';
import { makePngHeader as makePng } from './png';

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

const json = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

const project = {
  formatVersion: 1,
  name: 'Structures',
  namespaces: [
    {
      name: 'demo',
      assets: [],
      elements: [
        {
          id: 'demo:ruby_block',
          kind: 'minecraft:block_definition',
          data: { variants: { '': { model: 'demo:block/ruby_block' } } },
        },
        {
          id: 'demo:block/ruby_block',
          kind: 'minecraft:model',
          data: { parent: 'minecraft:block/cube_all', textures: { all: 'demo:block/ruby' } },
        },
      ],
    },
  ],
  targets: [],
  plugins: [],
  settings: {},
} as unknown as Project;

const vanilla: Record<string, Uint8Array> = {
  'assets/minecraft/bdefs/oak_log.json': json({
    variants: {
      'axis=x': { model: 'minecraft:block/oak_log_horizontal', x: 90, y: 90 },
      'axis=y': { model: 'minecraft:block/oak_log' },
    },
  }),
  'assets/minecraft/mdl/block/oak_log.json': json({
    parent: 'minecraft:block/cube_column',
    textures: { end: 'minecraft:block/oak_log_top', side: 'minecraft:block/oak_log' },
  }),
  'assets/minecraft/tex/block/oak_log.png': makePng(16, 16),
};

async function prepare(data: unknown) {
  const atlases: string[][] = [];
  const prepared = await createPreviewResources({
    project,
    folders,
    subject: { previewKind: 'structure', id: 'demo:house', data },
    readProjectAsset: async (namespace, path) =>
      namespace === 'demo' && path === 'tex/block/ruby.png' ? makePng(16, 16) : null,
    vanilla: { readAsset: async (path) => vanilla[path] ?? null },
    createAtlas: async (textures) => {
      atlases.push(Object.keys(textures).sort());
      return {
        getTextureAtlas: () => ({}) as ImageData,
        getTextureUV: () => [0, 0, 1, 1],
        getPixelSize: () => 1 / 16,
      } as TextureAtlasProvider;
    },
  });
  return { prepared, atlases };
}

describe('createPreviewResources for a structure template', () => {
  it('prepares every palette block from the project, the vanilla cache or the checker cube', async () => {
    const { prepared, atlases } = await prepare({
      size: [3, 1, 1],
      palette: ['demo:ruby_block', 'oak_log[axis=y]', 'minecraft:mystery_block', '???'],
      blocks: [
        [0, 0, 0, 0],
        [1, 0, 0, 1],
        [2, 0, 0, 2],
      ],
    });
    expect(prepared.mode).toBe('structure');
    expect(prepared.structure?.blockCount).toBe(3);
    expect(prepared.structure?.invalidPalette).toEqual(['???']);
    expect(prepared.missingDefinitions).toEqual(['minecraft:mystery_block']);
    const { resources } = prepared;
    for (const id of ['demo:ruby_block', 'minecraft:oak_log', 'minecraft:mystery_block']) {
      expect(resources.getBlockDefinition(Identifier.parse(id)), id).not.toBeNull();
    }
    // The checker cube is a real model, so a block without a definition is never dropped.
    expect(resources.getBlockModel(Identifier.parse(MISSING_BLOCK_MODEL))).not.toBeNull();
    expect(resources.getDefaultBlockProperties(Identifier.parse('minecraft:oak_log'))).toEqual({
      axis: 'x',
    });
    expect(atlases[0]).toEqual(['demo:block/ruby', 'minecraft:block/oak_log']);
    expect(prepared.missingTextures).toEqual(['minecraft:block/oak_log_top']);
  });

  it('draws missing models with the checker cube', async () => {
    const { prepared } = await prepare({
      size: [1, 1, 1],
      palette: ['oak_log[axis=x]'],
      blocks: [[0, 0, 0, 0]],
    });
    expect(prepared.missingModels).toEqual(['minecraft:block/oak_log_horizontal']);
    expect(
      prepared.resources.getBlockModel(Identifier.parse('minecraft:block/oak_log_horizontal')),
    ).not.toBeNull();
  });
});
