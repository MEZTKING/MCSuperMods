// @vitest-environment happy-dom
import type { Project } from '@msm/plugin-api';
import type { TextureAtlasProvider } from 'deepslate/render';
import { describe, expect, it } from 'vitest';
import type { FrameRect } from '../../../src/renderer/src/preview/animation';
import { createPreviewResources } from '../../../src/renderer/src/preview/asset-source';
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

const project: Project = {
  formatVersion: 1,
  name: 'Anim',
  namespaces: [{ name: 'demo', elements: [], assets: [] }],
  targets: [],
  plugins: [],
  settings: {},
};

const json = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

/** A blob's contents as text, for blobs the fake cropper made. */
const text = (blob: Blob | undefined): Promise<string> =>
  blob === undefined ? Promise.resolve('<none>') : blob.text();

interface Harness {
  atlases: Record<string, Blob>[];
  crops: { size: number; rect: FrameRect }[];
}

async function prepare(files: {
  project: Record<string, Uint8Array>;
  vanilla: Record<string, Uint8Array>;
}) {
  const harness: Harness = { atlases: [], crops: [] };
  const prepared = await createPreviewResources({
    project,
    folders,
    subject: {
      previewKind: 'model',
      id: 'demo:block/thing',
      data: {
        parent: 'minecraft:block/cube_all',
        textures: {
          all: 'demo:block/glow',
          side: 'demo:block/plain',
          particle: 'minecraft:block/lava',
          top: 'demo:block/shadowed',
        },
      },
    },
    readProjectAsset: async (namespace, path) => files.project[`${namespace}/${path}`] ?? null,
    vanilla: { readAsset: async (path) => files.vanilla[path] ?? null },
    createAtlas: async (textures) => {
      harness.atlases.push({ ...textures });
      const index = harness.atlases.length;
      return {
        getTextureAtlas: () => ({ index }) as unknown as ImageData,
        getTextureUV: () => [0, 0, 1, 1],
        getPixelSize: () => 1 / 16,
      } as TextureAtlasProvider;
    },
    cropTexture: async (texture, rect) => {
      harness.crops.push({ size: texture.size, rect });
      return new Blob([`frame ${rect.x},${rect.y}`]);
    },
  });
  return { prepared, harness };
}

describe('createPreviewResources with animated textures', () => {
  const glow = makePng(16, 48);
  const lava = makePng(16, 32);
  const files = {
    project: {
      'demo/tex/block/glow.png': glow,
      'demo/tex/block/glow.png.mcmeta': json({
        animation: { frametime: 2, frames: [2, { index: 0, time: 3 }] },
      }),
      'demo/tex/block/plain.png': makePng(16, 16),
      // A project image without a sidecar must not pick up the vanilla one.
      'demo/tex/block/shadowed.png': makePng(16, 32),
    },
    vanilla: {
      'assets/minecraft/tex/block/lava.png': lava,
      'assets/minecraft/tex/block/lava.png.mcmeta': json({ animation: {} }),
      'assets/demo/tex/block/shadowed.png.mcmeta': json({ animation: {} }),
    },
  };

  it('finds animations from project and vanilla sidecars, sorted by id', async () => {
    const { prepared } = await prepare(files);
    expect(prepared.animations.map((entry) => entry.id)).toEqual([
      'demo:block/glow',
      'minecraft:block/lava',
    ]);
    expect(prepared.animations[0]?.animation.frames).toEqual([
      { index: 2, time: 2 },
      { index: 0, time: 3 },
    ]);
    expect(prepared.missingTextures).toEqual([]);
  });

  it('builds the first atlas from the frames at tick 0, keeping static textures whole', async () => {
    const { harness } = await prepare(files);
    expect(harness.atlases).toHaveLength(1);
    const atlas = harness.atlases[0] ?? {};
    expect(Object.keys(atlas)).toEqual([
      'demo:block/glow',
      'demo:block/plain',
      'demo:block/shadowed',
      'minecraft:block/lava',
    ]);
    expect(await text(atlas['demo:block/glow'])).toBe('frame 0,32');
    expect(await text(atlas['minecraft:block/lava'])).toBe('frame 0,0');
    expect(atlas['demo:block/plain']?.size).toBe(makePng(16, 16).length);
    expect(atlas['demo:block/shadowed']?.size).toBe(makePng(16, 32).length);
    expect(harness.crops.map((crop) => crop.size)).toEqual([glow.length, lava.length]);
  });

  it('rebuilds the atlas only when a frame changes, through createAtlas', async () => {
    const { prepared, harness } = await prepare(files);
    // Tick 1: glow still shows step 0; lava (frametime 1, two frames) moves to frame 1.
    expect(await prepared.showTick(1)).toBe(true);
    expect(prepared.resources.getTextureAtlas()).toEqual({ index: 2 });
    let atlas = harness.atlases[1] ?? {};
    expect(await text(atlas['demo:block/glow'])).toBe('frame 0,32');
    expect(await text(atlas['minecraft:block/lava'])).toBe('frame 0,16');
    // Tick 2: glow steps to strip frame 0; lava wraps to frame 0.
    expect(await prepared.showTick(2)).toBe(true);
    atlas = harness.atlases[2] ?? {};
    expect(await text(atlas['demo:block/glow'])).toBe('frame 0,0');
    expect(await text(atlas['minecraft:block/lava'])).toBe('frame 0,0');
    // Tick 4: glow is still on strip frame 0 and lava is back on frame 0.
    expect(await prepared.showTick(4)).toBe(false);
    expect(harness.atlases).toHaveLength(3);
    // Cropped frames are reused.
    await prepared.showTick(1);
    expect(harness.crops).toHaveLength(4);
  });

  it('keeps static textures unchanged and never re-crops without animations', async () => {
    const { prepared, harness } = await prepare({
      project: { 'demo/tex/block/plain.png': makePng(16, 16) },
      vanilla: {},
    });
    expect(prepared.animations).toEqual([]);
    expect(await prepared.showTick(7)).toBe(false);
    expect(harness.crops).toEqual([]);
    expect(harness.atlases).toHaveLength(1);
  });

  it('shows a texture static when its sidecar is not JSON or does not fit the image', async () => {
    const { prepared } = await prepare({
      project: {
        'demo/tex/block/glow.png': makePng(16, 48),
        'demo/tex/block/glow.png.mcmeta': new TextEncoder().encode('{ nope'),
        'demo/tex/block/plain.png': makePng(16, 16),
        'demo/tex/block/plain.png.mcmeta': json({ animation: { width: 5 } }),
      },
      vanilla: {},
    });
    expect(prepared.animations).toEqual([]);
  });
});
