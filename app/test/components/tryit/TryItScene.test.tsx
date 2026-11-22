// @vitest-environment happy-dom
import { SimWorld } from '@msm/sim';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ResourceFolders } from '../../../src/renderer/src/preview/model-chain';
import { NO_WEBGL_MESSAGE, TryItScene } from '../../../src/renderer/src/tryit/render/TryItScene';
import { LAZY_CHUNK_TIMEOUT_MS, PRELOAD_TIMEOUT_MS, preloadChunks } from '../lazy-chunks';

afterEach(cleanup);
// The canvas is a lazy chunk (deepslate, gl-matrix; ADR 0085 D12).
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

const props = {
  grid: new SimWorld(),
  camera: { eye: { x: 24, y: 1.62, z: 24 }, yaw: 0, pitch: 0 },
  files: new Map<string, string | Uint8Array>(),
  folders,
  vanilla: null,
};

describe('Try it scene boundary', () => {
  it('shows the no-WebGL message under happy-dom, with what the view adds', () => {
    render(
      <TryItScene {...props}>
        <button type="button">Play in Minecraft</button>
      </TryItScene>,
    );
    expect(screen.getByRole('alert').textContent).toBe(NO_WEBGL_MESSAGE);
    expect(screen.getByRole('button', { name: 'Play in Minecraft' })).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows the message when WebGL is turned off by the test hook', () => {
    render(<TryItScene {...props} webgl={false} />);
    expect(screen.getByRole('alert').textContent).toBe('Preview unavailable: WebGL is disabled.');
  });

  it('loads the canvas chunk when WebGL is there, and says so when it has no context', async () => {
    let unavailable = 0;
    render(<TryItScene {...props} webgl onWebGLUnavailable={() => (unavailable += 1)} />);
    // happy-dom has no WebGL context: the loaded canvas reports it and the boundary falls back.
    expect(await screen.findByRole('alert', {}, { timeout: LAZY_CHUNK_TIMEOUT_MS })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe(NO_WEBGL_MESSAGE);
    expect(unavailable).toBe(1);
  });
});
