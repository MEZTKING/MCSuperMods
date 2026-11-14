import { type BlockState, SimWorld } from '@msm/sim';
import { describe, expect, it } from 'vitest';
import { parseTextureAnimation } from '../../../src/renderer/src/preview/animation';
import type { ResourceFolders } from '../../../src/renderer/src/preview/model-chain';
import { FLOATS_PER_VERTEX } from '../../../src/renderer/src/tryit/render/particles';
import {
  DEFAULT_PORTAL_TEXTURE,
  FULL_UV,
  PORTAL_FAR,
  PORTAL_NEAR,
  PortalIndex,
  portalFrameUv,
  portalLooksFromFiles,
  readTexture,
  withoutPortals,
  writePortalFaces,
} from '../../../src/renderer/src/tryit/render/portal';

const folders: ResourceFolders = {
  atlases: 'atlases',
  block_definition: 'blockstates',
  font: 'font',
  item_definition: 'items',
  lang: 'lang',
  model: 'models',
  sounds_file: 'sounds.json',
  textures: 'textures',
};

const json = (value: unknown) => JSON.stringify(value);

function portalFiles(): Map<string, string | Uint8Array> {
  return new Map<string, string | Uint8Array>([
    ['msm/demo/block/gate.json', json({ format: 1, type: 'portal', destination: 'demo:far' })],
    [
      'msm/demo/block/plain_gate.json',
      json({ format: 1, type: 'portal', destination: 'demo:far' }),
    ],
    ['msm/demo/block/ruby_block.json', json({ format: 1 })],
    [
      'assets/demo/blockstates/gate.json',
      json({
        variants: {
          'axis=x': { model: 'demo:block/gate_ns' },
          'axis=z': { model: 'demo:block/gate_ew' },
        },
      }),
    ],
    [
      'assets/demo/models/block/gate_ns.json',
      json({
        parent: 'minecraft:block/nether_portal_ns',
        textures: { particle: 'demo:block/gate_swirl', portal: 'demo:block/gate_swirl' },
      }),
    ],
    [
      'assets/demo/models/block/gate_ew.json',
      json({
        parent: 'minecraft:block/nether_portal_ew',
        textures: { particle: 'demo:block/gate_swirl', portal: 'demo:block/gate_swirl' },
      }),
    ],
  ]);
}

const state = (name: string, axis = 'x'): BlockState => ({ name, properties: { axis } });

describe('Try it portal looks', () => {
  it('finds project portals and their pictures per axis', () => {
    const looks = portalLooksFromFiles(portalFiles(), folders);
    expect([...looks.keys()]).toEqual(['demo:gate', 'demo:plain_gate']);
    expect(looks.get('demo:gate')?.textures).toEqual({
      x: 'demo:block/gate_swirl',
      z: 'demo:block/gate_swirl',
    });
    // Without lowered models, the vanilla picture the generated models fall back to.
    expect(looks.get('demo:plain_gate')?.textures).toEqual({
      x: DEFAULT_PORTAL_TEXTURE,
      z: DEFAULT_PORTAL_TEXTURE,
    });
  });

  it('hides portals from the grid deepslate meshes, passing changes through', () => {
    const world = new SimWorld();
    world.set({ x: 1, y: 0, z: 1 }, state('demo:gate'));
    world.set({ x: 2, y: 0, z: 1 }, { name: 'demo:ruby_block', properties: {} });
    const view = withoutPortals(world, (id) => id === 'demo:gate');
    expect(view.get({ x: 1, y: 0, z: 1 })).toBeNull();
    expect(view.get({ x: 2, y: 0, z: 1 })?.name).toBe('demo:ruby_block');
    expect([...view.blocks()].map((block) => block.state.name)).toEqual(['demo:ruby_block']);
    expect([view.sizeX, view.sizeY, view.sizeZ]).toEqual([world.sizeX, world.sizeY, world.sizeZ]);
    const heard: string[] = [];
    const stop = view.onChange?.((change) => heard.push(`${change.pos.x}`));
    world.set({ x: 1, y: 0, z: 1 }, null);
    stop?.();
    world.set({ x: 3, y: 0, z: 1 }, state('demo:gate'));
    expect(heard).toEqual(['1']);
  });

  it('keeps an index of portal blocks from the world changes', () => {
    const world = new SimWorld();
    const index = new PortalIndex();
    const isPortal = (id: string) => id === 'demo:gate';
    world.set({ x: 4, y: 0, z: 4 }, state('demo:gate'));
    index.follow(world, isPortal);
    expect(index.portals().map((p) => p.pos)).toEqual([{ x: 4, y: 0, z: 4 }]);
    world.set({ x: 4, y: 1, z: 4 }, state('demo:gate', 'z'));
    world.set({ x: 5, y: 0, z: 4 }, { name: 'demo:ruby_block', properties: {} });
    expect(index.portals().map((p) => p.state.properties.axis)).toEqual(['x', 'z']);
    world.clear();
    expect(index.portals()).toEqual([]);
    index.dispose();
    expect(index.portals()).toEqual([]);
  });

  it('steps the picture frames by its .png.mcmeta', () => {
    expect(portalFrameUv(null, 16, 16, 7)).toBe(FULL_UV);
    const animation = parseTextureAnimation({ animation: { frametime: 2 } }, 16, 64);
    expect(animation?.frameCount).toBe(4);
    expect(portalFrameUv(animation, 16, 64, 0)).toEqual({ u0: 0, v0: 0, u1: 1, v1: 0.25 });
    expect(portalFrameUv(animation, 16, 64, 1.5)).toEqual({ u0: 0, v0: 0, u1: 1, v1: 0.25 });
    expect(portalFrameUv(animation, 16, 64, 2)).toEqual({ u0: 0, v0: 0.25, u1: 1, v1: 0.5 });
    expect(portalFrameUv(animation, 16, 64, 8)).toEqual({ u0: 0, v0: 0, u1: 1, v1: 0.25 });
  });

  it('draws two thin faces across the axis, as the runtime shape', () => {
    const out = new Float32Array(12 * FLOATS_PER_VERTEX);
    const end = writePortalFaces(out, 0, { x: 3, y: 1, z: 5 }, 'x', FULL_UV, [1, 1, 1, 0.5]);
    expect(end).toBe(12 * FLOATS_PER_VERTEX);
    const zs = new Set<number>();
    const xs = new Set<number>();
    for (let v = 0; v < 12; v += 1) {
      xs.add(out[v * FLOATS_PER_VERTEX] as number);
      zs.add(out[v * FLOATS_PER_VERTEX + 2] as number);
    }
    expect([...xs].sort()).toEqual([3, 4]);
    expect([...zs].sort()).toEqual([5 + PORTAL_NEAR, 5 + PORTAL_FAR].map(Math.fround));
    expect(out[8]).toBeCloseTo(0.5, 6);
    writePortalFaces(out, 0, { x: 3, y: 1, z: 5 }, 'z', FULL_UV, [1, 1, 1, 1]);
    expect(out[0]).toBeCloseTo(3 + PORTAL_NEAR, 6);
  });

  it('reads pictures from the lowered files, the project, then the vanilla cache', async () => {
    const files = new Map<string, string | Uint8Array>([
      ['assets/demo/textures/block/lowered.png', new Uint8Array([1])],
    ]);
    const asked: string[] = [];
    const source = {
      files,
      folders,
      vanilla: {
        readAsset: async (path: string) => {
          asked.push(`vanilla ${path}`);
          return path.endsWith('nether_portal.png') ? new Uint8Array([3]) : null;
        },
      },
      readProjectAsset: async (namespace: string, path: string) => {
        asked.push(`project ${namespace} ${path}`);
        return path === 'textures/block/swirl.png' ? new Uint8Array([2]) : null;
      },
    };
    expect(await readTexture(source, 'demo:block/lowered')).toEqual(new Uint8Array([1]));
    expect(await readTexture(source, 'demo:block/swirl')).toEqual(new Uint8Array([2]));
    expect(await readTexture(source, DEFAULT_PORTAL_TEXTURE)).toEqual(new Uint8Array([3]));
    expect(await readTexture({ ...source, vanilla: null }, 'minecraft:block/nether_portal')).toBe(
      null,
    );
    expect(asked).toEqual([
      'project demo textures/block/swirl.png',
      'vanilla assets/minecraft/textures/block/nether_portal.png',
    ]);
  });
});
