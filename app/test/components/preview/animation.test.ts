import { describe, expect, it } from 'vitest';
import {
  animationLength,
  frameRect,
  frameRectAtTick,
  parseTextureAnimation,
  stepAtTick,
  stepStartTick,
  TICK_MS,
} from '../../../src/renderer/src/preview/animation';

describe('parseTextureAnimation', () => {
  it('returns null without an animation object', () => {
    expect(parseTextureAnimation({}, 16, 64)).toBeNull();
    expect(parseTextureAnimation({ animation: 3 }, 16, 64)).toBeNull();
    expect(parseTextureAnimation(null, 16, 64)).toBeNull();
    expect(parseTextureAnimation([], 16, 64)).toBeNull();
  });

  it('plays every frame of a vertical strip with frametime 1 by default', () => {
    expect(parseTextureAnimation({ animation: {} }, 16, 48)).toEqual({
      frameWidth: 16,
      frameHeight: 16,
      frameCount: 3,
      frames: [
        { index: 0, time: 1 },
        { index: 1, time: 1 },
        { index: 2, time: 1 },
      ],
    });
  });

  it('applies frametime and per-frame index and time', () => {
    const animation = parseTextureAnimation(
      { animation: { frametime: 4, frames: [2, { index: 0, time: 10 }, { index: 1 }] } },
      16,
      48,
    );
    expect(animation?.frames).toEqual([
      { index: 2, time: 4 },
      { index: 0, time: 10 },
      { index: 1, time: 4 },
    ]);
  });

  it('drops frame indices outside the strip and ignores bad values', () => {
    const animation = parseTextureAnimation(
      { animation: { frametime: 0, frames: [5, -1, 1.5, 'x', { index: 1, time: -2 }, 0] } },
      8,
      16,
    );
    expect(animation?.frames).toEqual([
      { index: 1, time: 1 },
      { index: 0, time: 1 },
    ]);
    expect(parseTextureAnimation({ animation: { frames: [9] } }, 8, 16)).toBeNull();
  });

  it('uses square frames of the smaller side, also for horizontal strips', () => {
    const animation = parseTextureAnimation({ animation: {} }, 64, 16);
    expect(animation).toMatchObject({ frameWidth: 16, frameHeight: 16, frameCount: 4 });
  });

  it('honours explicit frame width and height in pixels', () => {
    expect(parseTextureAnimation({ animation: { width: 16, height: 8 } }, 16, 32)).toMatchObject({
      frameWidth: 16,
      frameHeight: 8,
      frameCount: 4,
    });
    expect(parseTextureAnimation({ animation: { height: 8 } }, 16, 32)).toMatchObject({
      frameWidth: 16,
      frameHeight: 8,
    });
  });

  it('treats frames that do not tile the image as static', () => {
    expect(parseTextureAnimation({ animation: { width: 5 } }, 16, 32)).toBeNull();
  });
});

describe('ticks and frames', () => {
  const animation = parseTextureAnimation(
    { animation: { frametime: 2, frames: [0, { index: 2, time: 5 }, 1] } },
    16,
    48,
  );
  if (animation === null) throw new Error('expected an animation');

  it('measures the loop and the start of each step', () => {
    expect(animationLength(animation)).toBe(9);
    expect([0, 1, 2, 3].map((step) => stepStartTick(animation, step))).toEqual([0, 2, 7, 0]);
  });

  it('finds the step at a tick, wrapping around the loop', () => {
    expect([0, 1, 2, 6, 7, 8, 9, 11].map((tick) => stepAtTick(animation, tick))).toEqual([
      0, 0, 1, 1, 2, 2, 0, 1,
    ]);
  });

  it('crops the frame rectangle out of the strip', () => {
    expect(frameRect(animation, 2, 16)).toEqual({ x: 0, y: 32, width: 16, height: 16 });
    expect(frameRectAtTick(animation, 3, 16)).toEqual({ x: 0, y: 32, width: 16, height: 16 });
    expect(frameRectAtTick(animation, 8, 16)).toEqual({ x: 0, y: 16, width: 16, height: 16 });
  });

  it('lays out grid strips left to right, then top to bottom', () => {
    const grid = parseTextureAnimation({ animation: {} }, 32, 32);
    if (grid === null) throw new Error('expected an animation');
    expect(grid.frameCount).toBe(1);
    const wide = parseTextureAnimation({ animation: { width: 16, height: 16 } }, 32, 32);
    if (wide === null) throw new Error('expected an animation');
    expect(wide.frameCount).toBe(4);
    expect([0, 1, 2, 3].map((index) => frameRect(wide, index, 32))).toEqual([
      { x: 0, y: 0, width: 16, height: 16 },
      { x: 16, y: 0, width: 16, height: 16 },
      { x: 0, y: 16, width: 16, height: 16 },
      { x: 16, y: 16, width: 16, height: 16 },
    ]);
  });

  it('steps at 50 ms per tick', () => {
    expect(TICK_MS).toBe(50);
  });
});
