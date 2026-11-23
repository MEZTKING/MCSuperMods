// @vitest-environment happy-dom
/**
 * The world cards' stills (ADR 0128 D3; the user's look at 1.5.6: "A world of islands" and "A
 * world of tall mountains" showed an empty grey frame). The cause: a world example has no
 * pictures, so its drawn still was only the plain tint, one grey colour, shown on every world
 * card that was not the live one and over the picture while its land arrived. Now a world card's
 * still is its land drawn from the clip's camera (`land-still.ts`, `land-picture.ts`), made by
 * the real terrain engine in the test's thread; a land that cannot be made keeps the plain still
 * with a line, in the gallery and in the live clip, never an empty frame.
 */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RgbaImage } from '../../../src/renderer/src/components/texture-editor/pixels';
import { builtInPlugins } from '../../../src/renderer/src/plugins/built-in';
import { ClipView } from '../../../src/renderer/src/showcase/ClipView';
import type { ShowcaseClip } from '../../../src/renderer/src/showcase/clip';
import { SHOWCASE_NAMESPACE } from '../../../src/renderer/src/showcase/clip';
import { TICK_MS } from '../../../src/renderer/src/showcase/clip-player';
import {
  clearDrawnStills,
  composeStill,
  drawnStill,
  type StillCodec,
  stillPictures,
} from '../../../src/renderer/src/showcase/drawn-still';
import { rayDirection } from '../../../src/renderer/src/showcase/land-picture';
import { clearLandStills, landStill } from '../../../src/renderer/src/showcase/land-still';
import type { LiveClipEnvironment } from '../../../src/renderer/src/showcase/live-clip';
import { LAND_NOT_MADE } from '../../../src/renderer/src/showcase/ShowcaseCard';
import {
  type LandStillMaker,
  ShowcaseGallery,
} from '../../../src/renderer/src/showcase/ShowcaseGallery';
import { SHOWCASES } from '../../../src/renderer/src/showcase/showcases';
import { clearStills, stillKey } from '../../../src/renderer/src/showcase/still-cache';
import { encodeRgbaPng } from '../../../src/renderer/src/tryit/render/fallback-colours';
import type { TryItSceneProps } from '../../../src/renderer/src/tryit/render/TryItScene';
import type { LocalWorker } from '../terrain/fake-engine';
import { exampleById, TARGETS, theRegistry } from './showcase-fixture';

const worker = vi.hoisted(() => ({ local: null as LocalWorker | null }));

vi.mock('../../../src/renderer/src/terrain/client', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../../src/renderer/src/terrain/client')>();
  const engine = await import('@msm/terrain');
  const { localWorker } = await import('../terrain/fake-engine');
  class LocalTerrainClient extends original.TerrainClient {
    constructor() {
      super({
        createWorker: () => {
          worker.local = localWorker(engine);
          return worker.local.worker;
        },
      });
    }
  }
  return { ...original, TerrainClient: LocalTerrainClient };
});

const scene: { props: TryItSceneProps | null } = { props: null };
vi.mock('../../../src/renderer/src/tryit/render/TryItScene', () => ({
  TryItScene: (props: TryItSceneProps) => {
    scene.props = props;
    return <canvas data-testid="fake-scene" aria-label={props.label} />;
  },
}));

const WORLD_CARDS = SHOWCASES.filter((clip) => clip.ground.kind === 'generated');
const target = TARGETS[0] as NonNullable<(typeof TARGETS)[0]>;
const deps = { registry: theRegistry(), plugins: builtInPlugins };

afterEach(() => {
  cleanup();
  scene.props = null;
  clearLandStills();
  clearDrawnStills();
  clearStills();
});

/** A codec that keeps every image it encodes (PNG bytes from the pure encoder). */
function keepingCodec(): StillCodec & { readonly images: RgbaImage[] } {
  const images: RgbaImage[] = [];
  return {
    images,
    decode: async () => {
      throw new Error('no pictures here');
    },
    encode: (image) => {
      images.push(image);
      return encodeRgbaPng(image.width, image.height, new Uint8Array(image.data.buffer));
    },
  };
}

/** The colours of an image and the share of its commonest one. */
function colours(image: RgbaImage): { count: number; commonest: number } {
  const counts = new Map<number, number>();
  for (let at = 0; at < image.data.length; at += 4) {
    const key =
      (image.data[at] ?? 0) * 0x10000 +
      (image.data[at + 1] ?? 0) * 0x100 +
      (image.data[at + 2] ?? 0);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const most = Math.max(...counts.values());
  return { count: counts.size, commonest: most / (image.width * image.height) };
}

/** Runs the terrain worker while `pending` has not settled. */
async function settle<T>(pending: Promise<T>, rounds = 2000): Promise<T> {
  let done = false;
  const watched = pending.finally(() => {
    done = true;
  });
  // Handled by the caller once returned; not reported as unhandled while the worker runs.
  watched.catch(() => undefined);
  for (let i = 0; i < rounds && !done; i += 1) {
    await worker.local?.flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return watched;
}

describe('the cause: a world example has no pictures', () => {
  it.each(WORLD_CARDS.map((clip) => [clip.id, clip] as const))(
    '%s: its plain drawn still is one grey colour',
    async (_id, clip) => {
      const bundle = await exampleById(clip.exampleId).build({
        namespace: SHOWCASE_NAMESPACE,
        projectName: SHOWCASE_NAMESPACE,
        target,
        values: {},
      });
      expect(stillPictures(bundle)).toEqual([]);
      expect(colours(composeStill([])).count).toBe(1);
    },
  );
});

describe('a world card’s land still', () => {
  it('looks the way Try it’s camera does', () => {
    const at = (yaw: number, pitch: number) =>
      rayDirection({ eye: { x: 0, y: 0, z: 0 }, yaw, pitch }, 0, 0).map(
        (value) => Math.round(value * 1000) / 1000 + 0,
      );
    expect(at(0, 0)).toEqual([0, 0, 1]);
    expect(at(90, 0)).toEqual([-1, 0, 0]);
    expect(at(0, 90)).toEqual([0, -1, 0]);
  });

  it.each(WORLD_CARDS.map((clip) => [clip.id, clip] as const))(
    '%s: is its land from the clip’s camera, never one grey colour',
    async (_id, clip) => {
      const codec = keepingCodec();
      const url = await settle(
        landStill(clip, exampleById(clip.exampleId), target, {
          deps,
          size: { width: 320, height: 180 },
          codec,
        }),
      );
      expect(url.startsWith('data:image/png;base64,')).toBe(true);
      const image = codec.images[0] as RgbaImage;
      if (process.env.LAND_STILL_OUT !== undefined) {
        const { writeFileSync } = await import('node:fs');
        writeFileSync(
          `${process.env.LAND_STILL_OUT}/${clip.id}.png`,
          encodeRgbaPng(image.width, image.height, new Uint8Array(image.data.buffer)),
        );
      }
      expect([image.width, image.height]).toEqual([320, 180]);
      const { count, commonest } = colours(image);
      // Land in many shades, and no one colour (the sky, the grey) filling the picture.
      expect(count).toBeGreaterThan(50);
      expect(commonest).toBeLessThan(0.6);
    },
    60_000,
  );

  it('is made once per clip, target and size', async () => {
    const clip = WORLD_CARDS[0] as ShowcaseClip;
    const codec = keepingCodec();
    const options = { deps, size: { width: 32, height: 18 }, codec };
    const first = landStill(clip, exampleById(clip.exampleId), target, options);
    expect(landStill(clip, exampleById(clip.exampleId), target, options)).toBe(first);
    await settle(first);
    expect(codec.images).toHaveLength(1);
  }, 60_000);

  it('rejects, and is not kept, when the land cannot be made', async () => {
    const clip = WORLD_CARDS[0] as ShowcaseClip;
    const ground = clip.ground as Extract<ShowcaseClip['ground'], { kind: 'generated' }>;
    const lost: ShowcaseClip = { ...clip, id: 'lost', ground: { ...ground, preset: './nowhere' } };
    const options = { deps, size: { width: 32, height: 18 }, codec: keepingCodec() };
    const made = landStill(lost, exampleById(clip.exampleId), target, options);
    await expect(settle(made)).rejects.toThrow(/could not be made/);
    const again = landStill(lost, exampleById(clip.exampleId), target, options);
    expect(again).not.toBe(made);
    await expect(settle(again)).rejects.toThrow(/could not be made/);
  }, 60_000);
});

const environment: LiveClipEnvironment = {
  reducedMotion: () => false,
  onReducedMotion: () => () => {},
  windowShown: () => true,
  onWindowShown: () => () => {},
  watchInView: () => () => {},
};

describe('the gallery’s world cards', () => {
  const worlds = WORLD_CARDS.slice(0, 2);
  const examples = worlds.map((clip) => exampleById(clip.exampleId));
  const plainCodec: StillCodec = {
    decode: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }),
    encode: () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1]),
  };

  it('show their land stills, and the plain still with a line when the land fails', async () => {
    const land = vi.fn<LandStillMaker>(async (clip) => {
      if (clip.id === 'world-mountains') throw new Error('The land could not be made: no.');
      return 'data:image/png;base64,bGFuZA==';
    });
    render(
      <ShowcaseGallery
        heading="See what you can make"
        clips={worlds}
        examples={examples}
        target={target}
        deps={deps}
        onMake={() => {}}
        onSeeExample={() => {}}
        environment={environment}
        webgl={false}
        codec={plainCodec}
        landStill={land}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('showcase-still-world-islands').getAttribute('src')).toBe(
        'data:image/png;base64,bGFuZA==',
      ),
    );
    expect(screen.queryByTestId('showcase-note-world-islands')).toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId('showcase-note-world-mountains').textContent).toBe(LAND_NOT_MADE),
    );
    // The mountains keep their plain drawn still: a picture, never an empty frame.
    expect(screen.getByTestId('showcase-still-world-mountains').getAttribute('src')).toMatch(
      /^data:image\/png;base64,/,
    );
    expect(land.mock.calls.map((call) => call[3].size)).toEqual([
      { width: 320, height: 180 },
      { width: 320, height: 180 },
    ]);
  });
});

describe('a live world clip whose land cannot be made', () => {
  it('keeps the still over the picture and says so', async () => {
    const islands = WORLD_CARDS[0] as ShowcaseClip;
    const ground = islands.ground as Extract<ShowcaseClip['ground'], { kind: 'generated' }>;
    const lost: ShowcaseClip = {
      ...islands,
      id: 'lost',
      ground: { ...ground, preset: './nowhere' },
    };
    const still = 'data:image/png;base64,c3RpbGw=';
    render(
      <ClipView
        clip={lost}
        example={exampleById(islands.exampleId)}
        target={target}
        deps={deps}
        vanilla={null}
        stillKey={stillKey(lost.id, target.id, false)}
        still={still}
        scripting={null}
      />,
    );
    await waitFor(() => expect(scene.props).not.toBeNull(), { timeout: 10_000 });
    const props = () => scene.props as TryItSceneProps;
    for (
      let round = 0;
      round < 200 && screen.queryByTestId('showcase-land-failed') === null;
      round += 1
    ) {
      await act(async () => {
        await worker.local?.flush();
        await new Promise((resolve) => setTimeout(resolve, 0));
        props().onFrame?.(TICK_MS);
        props().onFrameDrawn?.({} as never);
      });
    }
    expect(screen.getByTestId('showcase-land-failed').textContent).toBe(LAND_NOT_MADE);
    expect(screen.getByTestId('showcase-clip-cover').getAttribute('src')).toBe(still);
  }, 60_000);
});

describe('drawn stills at a card’s size', () => {
  it('are made at the size asked, and again for another size', async () => {
    const example = exampleById('example_msm_wood_set');
    const sizes: string[] = [];
    const codec: StillCodec = {
      decode: async () => ({
        width: 16,
        height: 16,
        data: new Uint8ClampedArray(16 * 16 * 4).fill(200),
      }),
      encode: (image) => {
        sizes.push(`${image.width}x${image.height}`);
        return encodeRgbaPng(image.width, image.height, new Uint8Array(image.data.buffer));
      },
    };
    await drawnStill(example, target, codec, { width: 412, height: 230 });
    await drawnStill(example, target, codec, { width: 412, height: 230 });
    await drawnStill(example, target, codec, { width: 206, height: 115 });
    expect(sizes).toEqual(['412x230', '206x115']);
  });
});
