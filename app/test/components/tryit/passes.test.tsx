// @vitest-environment happy-dom
import { SimWorld } from '@msm/sim';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ResourceFolders } from '../../../src/renderer/src/preview/model-chain';
import { ParticleField } from '../../../src/renderer/src/tryit/render/particles';
import { NO_WEBGL_MESSAGE, TryItScene } from '../../../src/renderer/src/tryit/render/TryItScene';
import { LAZY_CHUNK_TIMEOUT_MS, PRELOAD_TIMEOUT_MS, preloadChunks } from '../lazy-chunks';

afterEach(cleanup);
// The canvas is a lazy chunk (deepslate, gl-matrix; ADR 0085 D12): loaded once here, so the
// alert does not wait on Vitest transforming it, which took over findBy's second under load.
beforeAll(
  () => preloadChunks(() => import('../../../src/renderer/src/tryit/render/TryItCanvas')),
  PRELOAD_TIMEOUT_MS,
);

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

describe('Try it canvas with particles and portals', () => {
  it('takes a particle field and the partial tick, and falls back without WebGL', async () => {
    const files = new Map<string, string | Uint8Array>([
      ['msm/demo/block/gate.json', JSON.stringify({ format: 1, type: 'portal' })],
    ]);
    const grid = new SimWorld();
    grid.set({ x: 1, y: 0, z: 1 }, { name: 'demo:gate', properties: { axis: 'x' } });
    const particles = new ParticleField({ files });
    particles.emit('minecraft:flame', { x: 1, y: 1, z: 1 });
    let unavailable = 0;
    render(
      <TryItScene
        grid={grid}
        camera={{ eye: { x: 24, y: 1.62, z: 24 }, yaw: 0, pitch: 0 }}
        files={files}
        folders={folders}
        vanilla={null}
        particles={particles}
        partialTick={() => 0.5}
        webgl
        onWebGLUnavailable={() => (unavailable += 1)}
      />,
    );
    expect(
      await screen.findByRole('alert', undefined, { timeout: LAZY_CHUNK_TIMEOUT_MS }),
    ).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe(NO_WEBGL_MESSAGE);
    expect(unavailable).toBe(1);
  });
});
