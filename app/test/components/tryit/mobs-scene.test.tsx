// @vitest-environment happy-dom
import { SimWorld } from '@msm/sim';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ResourceFolders } from '../../../src/renderer/src/preview/model-chain';
import { MobField } from '../../../src/renderer/src/tryit/render/mobs';
import { NO_WEBGL_MESSAGE, TryItScene } from '../../../src/renderer/src/tryit/render/TryItScene';

afterEach(cleanup);

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

describe('Try it canvas with mobs', () => {
  it('takes a mob field and falls back without WebGL', async () => {
    const mobs = new MobField({ catalogue: { get: () => undefined } });
    const position = { x: 4, y: 0, z: 4 };
    mobs.update([
      { id: 1, type: 'demo:golem', position, previousPosition: position, yaw: 0, pitch: 0 },
    ]);
    render(
      <TryItScene
        grid={new SimWorld()}
        camera={{ eye: { x: 24, y: 1.62, z: 24 }, yaw: 0, pitch: 0 }}
        files={new Map()}
        folders={folders}
        vanilla={null}
        mobs={mobs}
        partialTick={() => 0.5}
        webgl={false}
      />,
    );
    expect((await screen.findByRole('alert', {}, { timeout: 5000 })).textContent).toBe(
      NO_WEBGL_MESSAGE,
    );
  });
});
