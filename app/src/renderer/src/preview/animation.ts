/**
 * Texture animation for the preview: parsing a `.png.mcmeta` sidecar's `animation` object and
 * working out which frame of the strip shows at a given game tick. Pure: no DOM, no deepslate,
 * so it is unit-tested without WebGL. Frames step; `interpolate` is ignored (no blending).
 */

/** Milliseconds per game tick. */
export const TICK_MS = 50;

/** One step of an animation: a frame of the strip and how long it shows, in ticks. */
export interface AnimationFrame {
  /** Index of the frame in the strip, counted left to right, then top to bottom. */
  index: number;
  /** Ticks the frame shows (at least 1). */
  time: number;
}

/** A parsed texture animation. */
export interface TextureAnimation {
  /** Width of one frame in pixels. */
  frameWidth: number;
  /** Height of one frame in pixels. */
  frameHeight: number;
  /** Number of frames the image holds. */
  frameCount: number;
  /** The playback sequence; never empty. */
  frames: AnimationFrame[];
}

/** A rectangle in image pixels. */
export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const positiveInt = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : undefined;

/**
 * Parses the sidecar of a `width` × `height` texture. Returns `null` when the sidecar has no
 * `animation` object or describes frames that do not tile the image, so the texture is shown
 * static.
 *
 * Frame size follows the game: `animation.width` and `animation.height` in pixels when given
 * (a missing one takes the image's dimension), otherwise square frames of the image's smaller
 * side. `frametime` defaults to 1. Without `frames`, every frame plays in strip order; frame
 * entries are an index or `{ index, time }`, and indices outside the strip are dropped.
 *
 * @param sidecar - The parsed `.png.mcmeta` JSON.
 * @param width - The texture's width in pixels.
 * @param height - The texture's height in pixels.
 */
export function parseTextureAnimation(
  sidecar: unknown,
  width: number,
  height: number,
): TextureAnimation | null {
  if (!isObject(sidecar) || !isObject(sidecar.animation)) return null;
  if (width < 1 || height < 1) return null;
  const animation = sidecar.animation;
  const explicitWidth = positiveInt(animation.width);
  const explicitHeight = positiveInt(animation.height);
  let frameWidth: number;
  let frameHeight: number;
  if (explicitWidth === undefined && explicitHeight === undefined) {
    frameWidth = Math.min(width, height);
    frameHeight = frameWidth;
  } else {
    frameWidth = explicitWidth ?? width;
    frameHeight = explicitHeight ?? height;
  }
  if (width % frameWidth !== 0 || height % frameHeight !== 0) return null;
  const frameCount = (width / frameWidth) * (height / frameHeight);
  const frametime = positiveInt(animation.frametime) ?? 1;

  const frames: AnimationFrame[] = [];
  if (Array.isArray(animation.frames)) {
    for (const entry of animation.frames) {
      const index = isObject(entry) ? entry.index : entry;
      if (typeof index !== 'number' || !Number.isInteger(index)) continue;
      if (index < 0 || index >= frameCount) continue;
      const time = isObject(entry) ? (positiveInt(entry.time) ?? frametime) : frametime;
      frames.push({ index, time });
    }
  } else {
    for (let index = 0; index < frameCount; index++) frames.push({ index, time: frametime });
  }
  if (frames.length === 0) return null;
  return { frameWidth, frameHeight, frameCount, frames };
}

/** The total length of one loop of the animation, in ticks. */
export function animationLength(animation: TextureAnimation): number {
  return animation.frames.reduce((sum, frame) => sum + frame.time, 0);
}

/** The tick at which step `step` of the sequence starts (`step` wraps around). */
export function stepStartTick(animation: TextureAnimation, step: number): number {
  const count = animation.frames.length;
  const wrapped = ((step % count) + count) % count;
  let tick = 0;
  for (let i = 0; i < wrapped; i++) tick += (animation.frames[i] as AnimationFrame).time;
  return tick;
}

/** The step of the sequence that shows at `tick` (ticks wrap around the loop). */
export function stepAtTick(animation: TextureAnimation, tick: number): number {
  const length = animationLength(animation);
  let remaining = ((Math.floor(tick) % length) + length) % length;
  for (let step = 0; step < animation.frames.length; step++) {
    const time = (animation.frames[step] as AnimationFrame).time;
    if (remaining < time) return step;
    remaining -= time;
  }
  return animation.frames.length - 1;
}

/**
 * The rectangle of strip frame `index` in an image `imageWidth` pixels wide: frames run left
 * to right, then top to bottom.
 */
export function frameRect(
  animation: TextureAnimation,
  index: number,
  imageWidth: number,
): FrameRect {
  const columns = Math.max(1, Math.floor(imageWidth / animation.frameWidth));
  return {
    x: (index % columns) * animation.frameWidth,
    y: Math.floor(index / columns) * animation.frameHeight,
    width: animation.frameWidth,
    height: animation.frameHeight,
  };
}

/** The strip rectangle that shows at `tick`. */
export function frameRectAtTick(
  animation: TextureAnimation,
  tick: number,
  imageWidth: number,
): FrameRect {
  const step = animation.frames[stepAtTick(animation, tick)] as AnimationFrame;
  return frameRect(animation, step.index, imageWidth);
}
