import { createElement, createEmptyProject } from '@msm/core';
import type { ContentBundle } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  bundleAssetReader,
  bundlePreviewProject,
  displayName,
  elementTextureBytes,
  pngDataUrl,
} from '../../../src/renderer/src/preview/bundle-source';
import {
  ARMOUR_LAYER_HEIGHT,
  ARMOUR_LAYER_WIDTH,
  armourGeometry,
} from '../../../src/renderer/src/preview/geo/armour';
import { bakeGeometry } from '../../../src/renderer/src/preview/geo/geometry';
import {
  createModelLookup,
  type ResourceFolders,
} from '../../../src/renderer/src/preview/model-chain';

const FOLDERS: ResourceFolders = {
  atlases: 'atlases',
  block_definition: 'blockstates',
  font: 'font',
  item_definition: 'items',
  lang: 'lang',
  model: 'models',
  sounds_file: 'sounds.json',
  textures: 'textures',
};

const TEXTURE = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

const bundle: ContentBundle = {
  elements: [
    {
      id: 'ruby:ruby_sword',
      kind: 'msm:item',
      data: { format: 1, model: 'ruby:item/ruby_sword' },
    },
    {
      id: 'ruby:item/ruby_sword',
      kind: 'minecraft:model',
      data: { parent: 'minecraft:item/handheld', textures: { layer0: 'ruby:item/ruby_sword' } },
    },
    { id: 'ruby:en_us', kind: 'minecraft:lang', data: { 'item.ruby.ruby_sword': 'Ruby Sword' } },
  ],
  assets: [{ namespace: 'ruby', path: 'textures/item/ruby_sword.png', bytes: TEXTURE }],
};

describe('bundle-backed preview source (ADR 0043 D3)', () => {
  it('lays the bundle over the project without changing it', async () => {
    const project = createEmptyProject('demo');
    project.namespaces.push({
      name: 'ruby',
      elements: [
        createElement({
          id: 'ruby:item/ruby_sword',
          kind: 'minecraft:model',
          data: { parent: 'minecraft:item/generated' },
        }),
        createElement({ id: 'ruby:other', kind: 'minecraft:model', data: {} }),
      ],
      assets: [],
    });
    const overlaid = bundlePreviewProject(project, bundle);
    expect(project.namespaces.find((entry) => entry.name === 'ruby')?.elements).toHaveLength(2);
    const lookup = createModelLookup({ folders: FOLDERS, project: overlaid, vanillaJson: null });
    // Bundle models win over the project's, project models stay reachable.
    expect((await lookup('ruby:item/ruby_sword'))?.json.parent).toBe('minecraft:item/handheld');
    expect((await lookup('ruby:other'))?.source).toBe('project');
  });

  it('reads textures from the bundle first, then the project', async () => {
    const reader = bundleAssetReader(bundle, async (_namespace, path) =>
      path === 'textures/block/stone.png' ? new Uint8Array([1]) : null,
    );
    expect(await reader('ruby', 'textures/item/ruby_sword.png')).toBe(TEXTURE);
    expect(await reader('ruby', 'textures/block/stone.png')).toEqual(new Uint8Array([1]));
    expect(await reader('ruby', 'textures/missing.png')).toBeNull();
  });

  it('finds an item texture and name, and encodes data URLs', () => {
    const item = bundle.elements[0];
    expect(elementTextureBytes(bundle, item?.data ?? null, FOLDERS)).toBe(TEXTURE);
    expect(displayName(bundle, 'ruby:ruby_sword', 'item')).toBe('Ruby Sword');
    expect(displayName(bundle, 'ruby:ruby_sword', 'block')).toBeUndefined();
    expect(pngDataUrl(new Uint8Array([1, 2, 3]))).toBe('data:image/png;base64,AQID');
  });
});

describe('armour preview geometry', () => {
  it('bakes every piece with UVs inside the 64x64 texture', () => {
    const model = bakeGeometry(armourGeometry(['helmet', 'chestplate', 'leggings', 'boots']));
    expect(model.problems).toEqual([]);
    expect(model.textureWidth).toBe(ARMOUR_LAYER_WIDTH);
    expect(model.textureHeight).toBe(ARMOUR_LAYER_HEIGHT * 2);
    // helmet 1, chestplate 3, leggings 3, boots 2 cubes.
    expect(model.cubeCount).toBe(9);
    expect(model.uvs.length).toBeGreaterThan(0);
    for (const value of model.uvs) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('draws the leggings from layer 2 (the bottom half) and the rest from layer 1', () => {
    const geometry = armourGeometry(['helmet', 'leggings']) as {
      'minecraft:geometry': { bones: { name: string; cubes: { uv: number[] }[] }[] }[];
    };
    const bones = geometry['minecraft:geometry'][0]?.bones ?? [];
    const v = (name: string) => bones.find((bone) => bone.name === name)?.cubes[0]?.uv[1];
    expect(v('helmet_head')).toBe(0);
    expect(v('leggings_body')).toBe(16 + ARMOUR_LAYER_HEIGHT);
    expect(v('leggings_right_leg')).toBe(16 + ARMOUR_LAYER_HEIGHT);
    expect(bones.some((bone) => bone.name.startsWith('boots'))).toBe(false);
  });

  it('gives an empty geometry without pieces', () => {
    const model = bakeGeometry(armourGeometry([]));
    expect(model.cubeCount).toBe(0);
  });
});
