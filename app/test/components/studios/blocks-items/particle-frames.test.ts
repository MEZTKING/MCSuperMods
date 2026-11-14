/**
 * "Split a strip into frames" (B353, ADR 0081 D1): horizontal and vertical strips of square or
 * counted frames, grids read left to right, and the reasons a picture does not split.
 */
import { describe, expect, it } from 'vitest';
import type { RgbaImage } from '../../../../src/renderer/src/components/texture-editor/pixels';
import {
  MAX_FRAMES,
  SplitError,
  splitFrames,
} from '../../../../src/renderer/src/studios/blocks-items/particle-frames';

/** A picture whose red channel is the x and green the y of each pixel. */
function picture(width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set([x, y, 0, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

/** The `[x, y]` of a frame's top-left pixel in the source picture. */
const corner = (image: RgbaImage) => [image.data[0], image.data[1]];

describe('splitFrames', () => {
  it('cuts a horizontal strip into square frames', () => {
    const frames = splitFrames(picture(32, 8), { layout: 'horizontal' });
    expect(frames).toHaveLength(4);
    expect(frames.map((frame) => [frame.width, frame.height])).toEqual([
      [8, 8],
      [8, 8],
      [8, 8],
      [8, 8],
    ]);
    expect(frames.map(corner)).toEqual([
      [0, 0],
      [8, 0],
      [16, 0],
      [24, 0],
    ]);
    // The last pixel of the second frame is (15, 7).
    const second = frames[1] as RgbaImage;
    expect([...second.data.slice(-4)]).toEqual([15, 7, 0, 255]);
  });

  it('cuts a vertical strip, or a strip into a counted number of frames', () => {
    expect(splitFrames(picture(8, 24), { layout: 'vertical' }).map(corner)).toEqual([
      [0, 0],
      [0, 8],
      [0, 16],
    ]);
    const two = splitFrames(picture(32, 8), { layout: 'horizontal', frames: 2 });
    expect(two.map((frame) => [frame.width, frame.height])).toEqual([
      [16, 8],
      [16, 8],
    ]);
  });

  it('reads a grid left to right and takes the frames asked for', () => {
    const grid = splitFrames(picture(16, 16), { layout: 'grid', columns: 2 });
    expect(grid.map(corner)).toEqual([
      [0, 0],
      [8, 0],
      [0, 8],
      [8, 8],
    ]);
    expect(splitFrames(picture(16, 16), { layout: 'grid', columns: 2, frames: 3 })).toHaveLength(3);
    expect(splitFrames(picture(24, 16), { layout: 'grid' })).toHaveLength(6);
  });

  it('refuses pictures that do not split into whole frames', () => {
    expect(() => splitFrames(picture(20, 8), { layout: 'horizontal' })).toThrow(SplitError);
    expect(() => splitFrames(picture(30, 8), { layout: 'horizontal', frames: 4 })).toThrow(
      /do not split into 4 equal frames/,
    );
    expect(() => splitFrames(picture(16, 12), { layout: 'grid', columns: 2 })).toThrow(SplitError);
    expect(() => splitFrames(picture(16, 16), { layout: 'grid', columns: 2, frames: 5 })).toThrow(
      /4 frames, fewer than the 5/,
    );
    expect(() => splitFrames(picture(8 * 65, 8), { layout: 'horizontal' })).toThrow(
      `at most ${MAX_FRAMES}`,
    );
    expect(() => splitFrames(picture(8, 8), { layout: 'horizontal', frames: 0 })).toThrow(
      /at least one frame/,
    );
  });
});
