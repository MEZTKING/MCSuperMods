// @vitest-environment happy-dom
/**
 * Sharper clips and stills (ADR 0128 D3; the user's look at 1.5.6: "the resolution needs to be
 * better for the previews"). A clip's canvas is drawn at its displayed size times the screen's
 * pixel ratio, capped at 2 (no longer Smaller picture's half); a still is drawn one still pixel
 * per device pixel at the card's size, its pictures scaled by whole numbers, and shown with
 * `image-rendering: pixelated`, never smoothed.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { RgbaImage } from '../../../src/renderer/src/components/texture-editor/pixels';
import type { ShowcaseClip } from '../../../src/renderer/src/showcase/clip';
import {
  composeStill,
  DEFAULT_STILL_SIZE,
  MAX_PIXEL_RATIO,
  stillSizeFor,
} from '../../../src/renderer/src/showcase/drawn-still';
import { ShowcaseCard } from '../../../src/renderer/src/showcase/ShowcaseCard';
import { SHOWCASES } from '../../../src/renderer/src/showcase/showcases';
import {
  canvasBufferSize,
  canvasPixelScale,
} from '../../../src/renderer/src/tryit/render/TryItCanvas';

afterEach(cleanup);

describe('a clip’s canvas', () => {
  it('has twice the buffer at a pixel ratio of 2, and no more above it', () => {
    const at = (ratio: number) =>
      canvasBufferSize(206, 115, canvasPixelScale(ratio, false, MAX_PIXEL_RATIO));
    expect(at(1)).toEqual({ width: 206, height: 115 });
    expect(at(2)).toEqual({ width: 412, height: 230 });
    expect(at(1.5)).toEqual({ width: 309, height: 173 });
    expect(at(3)).toEqual({ width: 412, height: 230 });
  });

  it('keeps Try it’s own behaviour without a cap: the screen’s ratio, halved when smaller', () => {
    expect(canvasPixelScale(3, false)).toBe(3);
    expect(canvasPixelScale(2, true)).toBe(1);
    expect(canvasPixelScale(0, false)).toBe(1);
  });
});

describe('a still’s size', () => {
  it('is the picture’s size in device pixels, the ratio between 1 and 2', () => {
    expect(stillSizeFor(206, 115.5, 2)).toEqual({ width: 412, height: 231 });
    expect(stillSizeFor(206, 115, 1)).toEqual({ width: 206, height: 115 });
    expect(stillSizeFor(206, 115, 3)).toEqual({ width: 412, height: 230 });
    expect(stillSizeFor(206, 115, 0.5)).toEqual({ width: 206, height: 115 });
    expect(stillSizeFor(0, 0, 2)).toBe(DEFAULT_STILL_SIZE);
  });
});

/** A 16 by 16 picture of one colour with a different top-left pixel. */
function picture(): RgbaImage {
  const data = new Uint8ClampedArray(16 * 16 * 4);
  for (let at = 0; at < data.length; at += 4) data.set([200, 40, 40, 255], at);
  data.set([20, 220, 20, 255], 0);
  return { width: 16, height: 16, data };
}

/** The width of the run of `colour` in row `y` starting at its first pixel. */
function runOf(image: RgbaImage, colour: readonly number[]): number {
  for (let y = 0; y < image.height; y += 1) {
    let run = 0;
    for (let x = 0; x < image.width; x += 1) {
      const at = (y * image.width + x) * 4;
      const same = colour.every((value, c) => image.data[at + c] === value);
      if (same) run += 1;
      else if (run > 0) return run;
    }
    if (run > 0) return run;
  }
  return 0;
}

describe('a drawn still at twice the size', () => {
  it('scales each picture pixel by a whole number, at least twice as many pixels as at 1x', () => {
    const small = composeStill([picture()], 206, 115);
    const large = composeStill([picture()], 412, 230);
    const one = runOf(small, [20, 220, 20]);
    const two = runOf(large, [20, 220, 20]);
    expect(one).toBeGreaterThan(1);
    // One picture pixel is a square of whole pixels (the run is the scale).
    expect(Number.isInteger(two)).toBe(true);
    expect(two).toBeGreaterThanOrEqual(one * 2);
  });
});

describe('a card’s still', () => {
  it('is shown pixelated, never smoothed', () => {
    const clip = SHOWCASES[0] as ShowcaseClip;
    render(
      <ul>
        <ShowcaseCard
          clip={clip}
          still="data:image/png;base64,c3RpbGw="
          webgl
          onSeeExample={() => {}}
        />
      </ul>,
    );
    expect(screen.getByTestId(`showcase-still-${clip.id}`).className).toContain(
      '[image-rendering:pixelated]',
    );
  });
});
