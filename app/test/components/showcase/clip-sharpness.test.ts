/**
 * Clips choose their own sharpness (B713, D6 of the plan after 1.5.8): 2, then 1.5, then 1 while
 * the median of the last 30 frames is under 24 frames a second; never up again for that card in
 * the session.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  CLIP_FRAME_WINDOW,
  CLIP_SLOW_FRAME_MS,
  ClipSharpness,
  clearClipRatios,
  medianOf,
  nextPixelRatio,
} from '../../../src/renderer/src/showcase/clip-player';

afterEach(clearClipRatios);

const SLOW = 60; // 16.7 frames a second
const FAST = 1000 / 60;

describe('nextPixelRatio', () => {
  it('steps down 2, 1.5, 1 while slower than 24 frames a second', () => {
    expect(nextPixelRatio(2, SLOW)).toBe(1.5);
    expect(nextPixelRatio(1.5, SLOW)).toBe(1);
    expect(nextPixelRatio(1, SLOW)).toBe(1);
    expect(nextPixelRatio(1.25, SLOW)).toBe(1);
  });

  it('keeps the ratio at 24 frames a second or faster, and never goes up', () => {
    expect(nextPixelRatio(2, FAST)).toBe(2);
    expect(nextPixelRatio(1.5, CLIP_SLOW_FRAME_MS)).toBe(1.5);
    expect(nextPixelRatio(1, FAST)).toBe(1);
    expect(nextPixelRatio(1.5, 0)).toBe(1.5);
    expect(nextPixelRatio(Number.NaN, SLOW)).toBe(1);
  });

  it('takes the median, so a few slow frames (a chunk rebuilt) change nothing', () => {
    expect(medianOf([])).toBe(0);
    expect(medianOf([5, 1, 3])).toBe(3);
    expect(medianOf([4, 1, 3, 2])).toBe(2.5);
    const frames = [...Array(25).fill(FAST), ...Array(5).fill(500)];
    expect(nextPixelRatio(2, medianOf(frames))).toBe(2);
  });
});

describe('ClipSharpness', () => {
  it('steps after a window of slow frames, starting the window again', () => {
    const clip = new ClipSharpness('card-a');
    expect(clip.ratio).toBe(2);
    for (let at = 0; at < CLIP_FRAME_WINDOW - 1; at += 1) expect(clip.frame(SLOW)).toBe(false);
    expect(clip.frame(SLOW)).toBe(true);
    expect(clip.ratio).toBe(1.5);
    expect(clip.medianFrameMs).toBe(0);
    for (let at = 0; at < CLIP_FRAME_WINDOW; at += 1) clip.frame(SLOW);
    expect(clip.ratio).toBe(1);
  });

  it('stays sharp while fast', () => {
    const clip = new ClipSharpness('card-b');
    for (let at = 0; at < 3 * CLIP_FRAME_WINDOW; at += 1) clip.frame(FAST);
    expect(clip.ratio).toBe(2);
  });

  it('never goes up again for that card in the session; another card starts sharp', () => {
    const slow = new ClipSharpness('card-c');
    for (let at = 0; at < CLIP_FRAME_WINDOW; at += 1) slow.frame(SLOW);
    expect(slow.ratio).toBe(1.5);
    const again = new ClipSharpness('card-c');
    expect(again.ratio).toBe(1.5);
    for (let at = 0; at < 3 * CLIP_FRAME_WINDOW; at += 1) again.frame(FAST);
    expect(again.ratio).toBe(1.5);
    expect(new ClipSharpness('card-d').ratio).toBe(2);
    // A screen capped lower starts there.
    expect(new ClipSharpness('card-e', 1).ratio).toBe(1);
  });
});
