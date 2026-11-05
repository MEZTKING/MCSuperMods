/**
 * Keyframe evaluation for the geo preview: the `msm:animation` element data (Bedrock
 * animation format 1.8.0, as GeckoLib reads it) sampled per bone and channel at a time `t`.
 * Pure: no DOM, no WebGL.
 *
 * The preview is a subset of what the game plays (ADR 0029 D5): interpolation is linear;
 * `catmullrom` keyframes are played as linear and Molang strings as 0, each with a notice.
 * Strings that are plain numbers (such as `"1.5"`) are numbers, not Molang, as the
 * `models-anim.molang-unsupported` validator also treats them. Values are in Bedrock
 * orientation; `geometry.ts` applies Blockbench's signs when posing a bone.
 */

import type { JsonObject } from '@msm/plugin-api';
import type { BonePose, Vec3 } from './geometry';

/** The loop mode of an animation. */
export type LoopMode = boolean | 'hold_on_last_frame';

/** One keyframe: the value approaching it (`pre`) and leaving it (`post`). */
export interface Keyframe {
  time: number;
  pre: Vec3;
  post: Vec3;
  catmullrom: boolean;
}

/** A channel: keyframes sorted by time; a constant channel has one keyframe at 0. */
export type Channel = Keyframe[];

/** The channels of one bone. */
export interface BoneChannels {
  rotation?: Channel;
  position?: Channel;
  scale?: Channel;
}

/** One parsed animation. */
export interface ParsedAnimation {
  name: string;
  loop: LoopMode;
  /** `animation_length`, or the time of the last keyframe. */
  length: number;
  bones: Map<string, BoneChannels>;
  /** True when a keyframe uses `catmullrom`. */
  catmullrom: boolean;
  /** True when a value is a Molang expression. */
  molang: boolean;
}

/** Notice shown when an animation has `catmullrom` keyframes. */
export const CATMULLROM_NOTICE = 'Catmull-Rom keyframes are played as linear in the preview.';
/** Notice shown when an animation uses Molang. */
export const MOLANG_NOTICE = 'Molang expressions are played as 0 in the preview.';

const PLAIN_NUMBER = /^\s*[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?\s*$/;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

interface ParseState {
  molang: boolean;
  catmullrom: boolean;
}

function scalar(value: unknown, state: ParseState): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    if (PLAIN_NUMBER.test(value)) return Number(value);
    state.molang = true;
  }
  return 0;
}

/** A vector value: `[x, y, z]`, or one number or string for all three axes. */
function vector(value: unknown, state: ParseState): Vec3 | null {
  if (Array.isArray(value)) {
    return [scalar(value[0], state), scalar(value[1], state), scalar(value[2], state)];
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const n = scalar(value, state);
    return [n, n, n];
  }
  return null;
}

function keyframe(time: number, value: unknown, state: ParseState): Keyframe | null {
  if (isObject(value) && ('pre' in value || 'post' in value)) {
    const pre = vector(value.pre, state);
    const post = vector(value.post, state);
    const catmullrom = value.lerp_mode === 'catmullrom';
    if (catmullrom) state.catmullrom = true;
    const first = pre ?? post;
    if (first === null) return null;
    return { time, pre: first, post: post ?? first, catmullrom };
  }
  const v = vector(value, state);
  return v === null ? null : { time, pre: v, post: v, catmullrom: false };
}

/** Parses one channel: a constant vector or a map of keyframes by time in seconds. */
export function parseChannel(value: unknown, state: ParseState): Channel | undefined {
  if (value === undefined) return undefined;
  if (isObject(value) && !('pre' in value) && !('post' in value)) {
    const frames: Keyframe[] = [];
    for (const [key, entry] of Object.entries(value)) {
      const time = Number(key);
      if (!Number.isFinite(time)) continue;
      const frame = keyframe(time, entry, state);
      if (frame !== null) frames.push(frame);
    }
    frames.sort((a, b) => a.time - b.time);
    return frames.length === 0 ? undefined : frames;
  }
  const frame = keyframe(0, value, state);
  return frame === null ? undefined : [frame];
}

/** Parses the `animations` of an `msm:animation` element's data, in file order. */
export function parseAnimations(data: unknown): ParsedAnimation[] {
  const map = isObject(data) && isObject(data.animations) ? data.animations : {};
  const out: ParsedAnimation[] = [];
  for (const [name, raw] of Object.entries(map)) {
    if (!isObject(raw)) continue;
    const state: ParseState = { molang: false, catmullrom: false };
    const bones = new Map<string, BoneChannels>();
    let last = 0;
    if (isObject(raw.bones)) {
      for (const [bone, channels] of Object.entries(raw.bones)) {
        if (!isObject(channels)) continue;
        const parsed: BoneChannels = {};
        for (const key of ['rotation', 'position', 'scale'] as const) {
          const channel = parseChannel(channels[key], state);
          if (channel === undefined) continue;
          parsed[key] = channel;
          last = Math.max(last, channel[channel.length - 1]?.time ?? 0);
        }
        bones.set(bone, parsed);
      }
    }
    const loop: LoopMode =
      raw.loop === true ? true : raw.loop === 'hold_on_last_frame' ? 'hold_on_last_frame' : false;
    const length =
      typeof raw.animation_length === 'number' &&
      Number.isFinite(raw.animation_length) &&
      raw.animation_length >= 0
        ? raw.animation_length
        : last;
    out.push({ name, loop, length, bones, ...state });
  }
  return out;
}

/** Evaluates a channel at `t` seconds (linear between keyframes, held outside them). */
export function evaluateChannel(channel: Channel, t: number): Vec3 {
  const first = channel[0] as Keyframe;
  if (channel.length === 1 || t <= first.time) {
    return [...(t < first.time ? first.pre : first.post)] as Vec3;
  }
  for (let i = 1; i < channel.length; i++) {
    const next = channel[i] as Keyframe;
    if (t < next.time) {
      const previous = channel[i - 1] as Keyframe;
      const span = next.time - previous.time;
      const f = span <= 0 ? 1 : (t - previous.time) / span;
      const a = previous.post;
      const b = next.pre;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
  }
  return [...(channel[channel.length - 1] as Keyframe).post] as Vec3;
}

/** Where playback is after `elapsed` seconds of an animation. */
export interface PlaybackTime {
  /** The animation time to sample. */
  time: number;
  /** True when a non-looping animation has ended; playback stops. */
  finished: boolean;
  /** True when the rest pose shows (a `loop: false` animation after its end). */
  rest: boolean;
}

/** Maps elapsed playback seconds to animation time by the loop mode. */
export function playbackTime(
  animation: Pick<ParsedAnimation, 'loop' | 'length'>,
  elapsed: number,
): PlaybackTime {
  const { length, loop } = animation;
  const at = Math.max(0, elapsed);
  if (loop === true) {
    return { time: length > 0 ? at % length : 0, finished: false, rest: false };
  }
  if (at < length) return { time: at, finished: false, rest: false };
  return { time: length, finished: true, rest: loop === false };
}

/** Samples every animated bone of `animation` at `t` seconds. */
export function samplePose(animation: ParsedAnimation, t: number): Map<string, BonePose> {
  const pose = new Map<string, BonePose>();
  for (const [bone, channels] of animation.bones) {
    pose.set(bone, {
      rotation: channels.rotation === undefined ? [0, 0, 0] : evaluateChannel(channels.rotation, t),
      position: channels.position === undefined ? [0, 0, 0] : evaluateChannel(channels.position, t),
      scale: channels.scale === undefined ? [1, 1, 1] : evaluateChannel(channels.scale, t),
    });
  }
  return pose;
}

/** The notices an animation needs. */
export function animationNotices(animation: ParsedAnimation | undefined): string[] {
  if (animation === undefined) return [];
  return [
    ...(animation.catmullrom ? [CATMULLROM_NOTICE] : []),
    ...(animation.molang ? [MOLANG_NOTICE] : []),
  ];
}
