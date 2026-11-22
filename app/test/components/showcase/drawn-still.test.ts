/**
 * The drawn still (B568, ADR 0118 D7, D9): up to three of the example's pictures, whole-number
 * scaled without smoothing on a tint from the first; byte-stable for the same pictures.
 */

import type { ContentBundle } from '@msm/plugin-api';
import { afterEach, describe, expect, it } from 'vitest';
import type { RgbaImage } from '../../../src/renderer/src/components/texture-editor/pixels';
import {
  clearDrawnStills,
  composeStill,
  drawnStill,
  firstFrame,
  meanColour,
  STILL_HEIGHT,
  STILL_WIDTH,
  type StillCodec,
  stillPictures,
  stillTint,
} from '../../../src/renderer/src/showcase/drawn-still';
import { exampleById, TARGETS } from './showcase-fixture';

afterEach(clearDrawnStills);

/** A solid picture of `size` (or `width` by `height`). */
function solid(rgba: readonly number[], width: number, height = width): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let at = 0; at < data.length; at += 4) data.set(rgba, at);
  return { width, height, data };
}

const pixel = (image: RgbaImage, x: number, y: number): number[] => {
  const at = (y * image.width + x) * 4;
  return [...image.data.slice(at, at + 4)];
};

const asset = (path: string) => ({ namespace: 'showcase', path, bytes: new Uint8Array([1]) });

describe('the pictures of a drawn still', () => {
  it('takes block pictures first, then items, then the rest, at most three', () => {
    const bundle: ContentBundle = {
      elements: [],
      assets: [
        asset('textures/entity/pet.png'),
        asset('textures/item/door.png'),
        asset('sounds/hum.ogg'),
        asset('textures/block/log.png'),
        asset('textures/block/planks.png'),
        asset('textures/block/notes.txt'),
      ],
    };
    expect(stillPictures(bundle).map((one) => one.path)).toEqual([
      'textures/block/log.png',
      'textures/block/planks.png',
      'textures/item/door.png',
    ]);
  });

  it('takes an animated strip’s first frame', () => {
    const strip = solid([1, 2, 3, 255], 4, 12);
    expect(firstFrame(strip).height).toBe(4);
    expect(firstFrame(solid([0, 0, 0, 255], 4, 6)).height).toBe(6);
  });

  it('tints the ground from the first picture’s opaque pixels', () => {
    expect(meanColour(solid([0, 0, 0, 0], 2))).toBeNull();
    expect(meanColour(solid([200, 100, 0, 255], 2))).toEqual([200, 100, 0]);
    expect(stillTint(solid([200, 100, 0, 255], 2))).toEqual([108, 63, 18]);
    expect(stillTint(undefined)).toEqual([58, 66, 74]);
  });
});

describe('composing a still', () => {
  it('scales by whole numbers without smoothing, centred on the tint', () => {
    const red = solid([255, 0, 0, 255], 2);
    red.data.set([0, 0, 255, 255], 4); // the top-right pixel blue
    const still = composeStill([red], 40, 20);
    expect(still.width).toBe(40);
    // One picture: a cell of 40 - 32 by 20 - 32 is too small, so the scale is 1.
    const big = composeStill([red]);
    expect(big.width).toBe(STILL_WIDTH);
    expect(big.height).toBe(STILL_HEIGHT);
    // 2 by 2 in a 288 by 148 cell: scale 74, drawn 148 by 148 from (86, 16).
    expect(pixel(big, 86, 16)).toEqual([255, 0, 0, 255]);
    expect(pixel(big, 86 + 73, 16)).toEqual([255, 0, 0, 255]);
    expect(pixel(big, 86 + 74, 16)).toEqual([0, 0, 255, 255]);
    expect(pixel(big, 85, 16)).toEqual([...stillTint(red), 255]);
  });

  it('puts up to three pictures side by side', () => {
    const pictures = [
      solid([255, 0, 0, 255], 16),
      solid([0, 255, 0, 255], 16),
      solid([0, 0, 255, 255], 16),
      solid([255, 255, 255, 255], 16),
    ];
    const still = composeStill(pictures);
    // Cells of 85 wide: scale 5, three pictures of 80 with gaps of 16: 272 wide from 24.
    expect(pixel(still, 24, 50)).toEqual([255, 0, 0, 255]);
    expect(pixel(still, 24 + 96, 50)).toEqual([0, 255, 0, 255]);
    expect(pixel(still, 24 + 192, 50)).toEqual([0, 0, 255, 255]);
    const colours = new Set<string>();
    for (let at = 0; at < still.data.length; at += 4) {
      colours.add([...still.data.slice(at, at + 3)].join());
    }
    expect(colours.has('255,255,255')).toBe(false);
  });

  it('blends see-through pixels over the tint', () => {
    const half = solid([255, 255, 255, 128], 16);
    const opaque = solid([0, 0, 0, 255], 16);
    const still = composeStill([opaque, half]);
    const tint = stillTint(opaque);
    const [r] = pixel(still, STILL_WIDTH / 2 + 30, 90);
    expect(r).toBe(Math.round((255 * 128 + (tint[0] ?? 0) * 127) / 255));
  });

  it('is byte-stable for the same pictures', () => {
    const pictures = () => [solid([10, 20, 30, 255], 16), solid([40, 50, 60, 200], 8, 16)];
    expect(composeStill(pictures()).data).toEqual(composeStill(pictures()).data);
  });
});

describe('the drawn still of an example', () => {
  const codec = (seen: Uint8Array[]): StillCodec => ({
    decode: async (bytes) => {
      seen.push(bytes);
      return solid([bytes[20] ?? 0, 100, 50, 255], 16);
    },
    encode: (image) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, image.width, image.height]),
  });

  it('draws the wood set from its own pictures, once per session', async () => {
    const seen: Uint8Array[] = [];
    const example = exampleById('example_msm_wood_set');
    const target = TARGETS[0];
    if (target === undefined) throw new Error('no target');
    const first = drawnStill(example, target, codec(seen));
    expect(drawnStill(example, target, codec(seen))).toBe(first);
    const url = await first;
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(seen.length).toBe(3);
  });

  it('leaves out a picture it cannot read and forgets a failed build', async () => {
    const target = TARGETS[0];
    if (target === undefined) throw new Error('no target');
    const broken: StillCodec = {
      decode: async () => {
        throw new Error('not a picture');
      },
      encode: () => new Uint8Array([0x89, 0x50]),
    };
    const url = await drawnStill(exampleById('example_msm_crop'), target, broken);
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    let builds = 0;
    const failing = {
      ...exampleById('example_msm_crop'),
      id: 'failing',
      build: async () => {
        builds += 1;
        throw new Error('no');
      },
    };
    await expect(drawnStill(failing, target, broken)).rejects.toThrow('no');
    await expect(drawnStill(failing, target, broken)).rejects.toThrow('no');
    expect(builds).toBe(2);
  });
});
