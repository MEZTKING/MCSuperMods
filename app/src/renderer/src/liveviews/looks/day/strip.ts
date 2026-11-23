/**
 * A timeline track sampled across its day (ADR 0121 D6; B619 3S10; B626). The period is the
 * timeline's `period_ticks`; a world clock has no fields. Between two keyframes the value moves
 * by the track's `ease` (the 32 named easings of easings.net, or `{cubic_bezier}`): numbers and
 * colours blend, true or false and choices step at the next keyframe. With a period the last
 * keyframe blends into the first of the next day; without one the track holds its first value
 * before it and its last after it. The game's own blending is code, so the strip is about right.
 */

import type { Json } from '@msm/plugin-api';
import type { ValueKind } from './attributes';

/** One keyframe of a track. */
export interface Keyframe {
  ticks: number;
  value: Json;
}

/** One track: an environment attribute's keyframes, with an easing and a modifier. */
export interface Track {
  ease?: Json;
  modifier?: string;
  keyframes: readonly Keyframe[];
}

/** A timeline as the strip reads it. */
export interface TimelineData {
  /** `period_ticks`, or `undefined` when the timeline does not repeat. */
  readonly period: number | undefined;
  /** The world clock it is tied to (`clock`), with its namespace. */
  readonly clock: string | undefined;
  /** The named times (`time_markers`), by tick. */
  readonly markers: readonly { readonly name: string; readonly ticks: number }[];
  /** The tracks by attribute id, as written. */
  readonly tracks: readonly { readonly attribute: string; readonly track: Track | null }[];
}

function isRecord(value: unknown): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withNamespace(id: string): string {
  return id.includes(':') ? id : `minecraft:${id}`;
}

/** A track's JSON as a {@link Track}, or `null` when it has no keyframe list. */
export function trackOf(json: Json | undefined): Track | null {
  if (!isRecord(json) || !Array.isArray(json.keyframes)) return null;
  const keyframes: Keyframe[] = [];
  for (const entry of json.keyframes) {
    if (!isRecord(entry) || typeof entry.ticks !== 'number' || !('value' in entry)) continue;
    keyframes.push({ ticks: entry.ticks, value: entry.value as Json });
  }
  const track: Track = { keyframes };
  if (json.ease !== undefined) track.ease = json.ease;
  if (typeof json.modifier === 'string') track.modifier = json.modifier;
  return track;
}

/** Reads a timeline's data (anything missing reads as absent). */
export function timelineOf(data: Json | undefined): TimelineData {
  const record = isRecord(data) ? data : {};
  const period =
    typeof record.period_ticks === 'number' && record.period_ticks >= 1
      ? Math.floor(record.period_ticks)
      : undefined;
  const markers: { name: string; ticks: number }[] = [];
  if (isRecord(record.time_markers)) {
    for (const [name, marker] of Object.entries(record.time_markers)) {
      const ticks =
        typeof marker === 'number' ? marker : isRecord(marker) ? marker.ticks : undefined;
      if (typeof ticks === 'number') markers.push({ name: withNamespace(name), ticks });
    }
  }
  markers.sort((a, b) => a.ticks - b.ticks || a.name.localeCompare(b.name));
  const tracks: { attribute: string; track: Track | null }[] = [];
  if (isRecord(record.tracks)) {
    for (const [attribute, json] of Object.entries(record.tracks)) {
      tracks.push({ attribute: withNamespace(attribute), track: trackOf(json) });
    }
  }
  tracks.sort((a, b) => a.attribute.localeCompare(b.attribute));
  return {
    period,
    clock: typeof record.clock === 'string' ? withNamespace(record.clock) : undefined,
    markers,
    tracks,
  };
}

/**
 * The ticks the strip spans: the period, or for a timeline that does not repeat its last
 * keyframe or marker (at least 1).
 */
export function stripSpan(timeline: TimelineData): number {
  if (timeline.period !== undefined) return timeline.period;
  let last = 0;
  for (const { track } of timeline.tracks) {
    for (const keyframe of track?.keyframes ?? []) last = Math.max(last, keyframe.ticks);
  }
  for (const marker of timeline.markers) last = Math.max(last, marker.ticks);
  return Math.max(1, last);
}

// Easings (easings.net, as the schema's description points to).

type EaseFn = (x: number) => number;

const C1 = 1.70158;
const C2 = C1 * 1.525;
const C3 = C1 + 1;
const C4 = (2 * Math.PI) / 3;
const C5 = (2 * Math.PI) / 4.5;

function outBounce(x: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) {
    const y = x - 1.5 / d1;
    return n1 * y * y + 0.75;
  }
  if (x < 2.5 / d1) {
    const y = x - 2.25 / d1;
    return n1 * y * y + 0.9375;
  }
  const y = x - 2.625 / d1;
  return n1 * y * y + 0.984375;
}

function power(n: number): { in: EaseFn; out: EaseFn; inOut: EaseFn } {
  return {
    in: (x) => x ** n,
    out: (x) => 1 - (1 - x) ** n,
    inOut: (x) => (x < 0.5 ? 2 ** (n - 1) * x ** n : 1 - (-2 * x + 2) ** n / 2),
  };
}

const POWERS = { quad: power(2), cubic: power(3), quart: power(4), quint: power(5) };

/** The named easings the strip draws. */
export const EASINGS: Readonly<Record<string, EaseFn>> = Object.freeze({
  constant: () => 0,
  linear: (x) => x,
  in_sine: (x) => 1 - Math.cos((x * Math.PI) / 2),
  out_sine: (x) => Math.sin((x * Math.PI) / 2),
  in_out_sine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  in_quad: POWERS.quad.in,
  out_quad: POWERS.quad.out,
  in_out_quad: POWERS.quad.inOut,
  in_cubic: POWERS.cubic.in,
  out_cubic: POWERS.cubic.out,
  in_out_cubic: POWERS.cubic.inOut,
  in_quart: POWERS.quart.in,
  out_quart: POWERS.quart.out,
  in_out_quart: POWERS.quart.inOut,
  in_quint: POWERS.quint.in,
  out_quint: POWERS.quint.out,
  in_out_quint: POWERS.quint.inOut,
  in_expo: (x) => (x === 0 ? 0 : 2 ** (10 * x - 10)),
  out_expo: (x) => (x === 1 ? 1 : 1 - 2 ** (-10 * x)),
  in_out_expo: (x) =>
    x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2,
  in_circ: (x) => 1 - Math.sqrt(1 - x * x),
  out_circ: (x) => Math.sqrt(1 - (x - 1) ** 2),
  in_out_circ: (x) =>
    x < 0.5 ? (1 - Math.sqrt(1 - (2 * x) ** 2)) / 2 : (Math.sqrt(1 - (-2 * x + 2) ** 2) + 1) / 2,
  in_back: (x) => C3 * x ** 3 - C1 * x * x,
  out_back: (x) => 1 + C3 * (x - 1) ** 3 + C1 * (x - 1) ** 2,
  in_out_back: (x) =>
    x < 0.5
      ? ((2 * x) ** 2 * ((C2 + 1) * 2 * x - C2)) / 2
      : ((2 * x - 2) ** 2 * ((C2 + 1) * (x * 2 - 2) + C2) + 2) / 2,
  in_elastic: (x) =>
    x === 0 ? 0 : x === 1 ? 1 : -(2 ** (10 * x - 10)) * Math.sin((x * 10 - 10.75) * C4),
  out_elastic: (x) =>
    x === 0 ? 0 : x === 1 ? 1 : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * C4) + 1,
  in_out_elastic: (x) =>
    x === 0
      ? 0
      : x === 1
        ? 1
        : x < 0.5
          ? -(2 ** (20 * x - 10) * Math.sin((20 * x - 11.125) * C5)) / 2
          : (2 ** (-20 * x + 10) * Math.sin((20 * x - 11.125) * C5)) / 2 + 1,
  in_bounce: (x) => 1 - outBounce(1 - x),
  out_bounce: outBounce,
  in_out_bounce: (x) => (x < 0.5 ? (1 - outBounce(1 - 2 * x)) / 2 : (1 + outBounce(2 * x - 1)) / 2),
});

/** A cubic Bézier easing through (0,0), (x1,y1), (x2,y2), (1,1): y at x, by bisection on x. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EaseFn {
  const at = (t: number, a: number, b: number) =>
    3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let low = 0;
    let high = 1;
    for (let step = 0; step < 40; step += 1) {
      const mid = (low + high) / 2;
      if (at(mid, x1, x2) < x) low = mid;
      else high = mid;
    }
    return at((low + high) / 2, y1, y2);
  };
}

/** A track's easing: its function, its name, and whether the strip knows it. */
export interface Easing {
  readonly fn: EaseFn;
  readonly name: string;
  readonly known: boolean;
}

/** The easing `ease` names (none: `linear`); an unknown one is drawn linear and says so. */
export function easingOf(ease: Json | undefined): Easing {
  if (ease === undefined) return { fn: EASINGS.linear as EaseFn, name: 'linear', known: true };
  if (typeof ease === 'string') {
    const name = ease.replace(/^minecraft:/, '');
    const fn = EASINGS[name];
    return fn === undefined
      ? { fn: EASINGS.linear as EaseFn, name, known: false }
      : { fn, name, known: true };
  }
  if (isRecord(ease) && Array.isArray(ease.cubic_bezier)) {
    const [x1, y1, x2, y2] = ease.cubic_bezier;
    if ([x1, y1, x2, y2].every((part) => typeof part === 'number')) {
      return {
        fn: cubicBezier(x1 as number, y1 as number, x2 as number, y2 as number),
        name: 'cubic_bezier',
        known: true,
      };
    }
  }
  return { fn: EASINGS.linear as EaseFn, name: JSON.stringify(ease), known: false };
}

// Colours.

/** A colour as 0 to 255 channels. */
export interface Argb {
  readonly a: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

/**
 * A colour value in any of the schema's forms: a packed integer (ARGB, or RGB with full
 * alpha when `alpha` is false), `[r, g, b]` or `[r, g, b, a]` from 0 to 1, or `#RRGGBB` /
 * `#AARRGGBB`. `null` when it is none of them.
 */
export function parseColour(value: Json | undefined, alpha = false): Argb | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const packed = Math.trunc(value) >>> 0;
    return {
      a: alpha ? (packed >>> 24) & 0xff : 255,
      r: (packed >>> 16) & 0xff,
      g: (packed >>> 8) & 0xff,
      b: packed & 0xff,
    };
  }
  if (Array.isArray(value) && (value.length === 3 || value.length === 4)) {
    if (!value.every((part) => typeof part === 'number')) return null;
    const [r, g, b, a = 1] = value as number[];
    return {
      a: byte((a as number) * 255),
      r: byte((r as number) * 255),
      g: byte((g as number) * 255),
      b: byte((b as number) * 255),
    };
  }
  if (typeof value === 'string') {
    const hex = /^#?([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value)?.[1];
    if (hex === undefined) return null;
    const packed = Number.parseInt(hex, 16) >>> 0;
    return {
      a: hex.length === 8 ? (packed >>> 24) & 0xff : 255,
      r: (packed >>> 16) & 0xff,
      g: (packed >>> 8) & 0xff,
      b: packed & 0xff,
    };
  }
  return null;
}

/** A colour as `#RRGGBB`, or `#AARRGGBB` when `alpha`. */
export function colourHex(colour: Argb, alpha = false): string {
  const two = (value: number) => byte(value).toString(16).padStart(2, '0');
  return `#${alpha ? two(colour.a) : ''}${two(colour.r)}${two(colour.g)}${two(colour.b)}`;
}

/** A colour as CSS `rgb()` (alpha as a fraction). */
export function colourCss(colour: Argb): string {
  return `rgb(${colour.r} ${colour.g} ${colour.b} / ${(colour.a / 255).toFixed(3)})`;
}

// Sampling.

function blend(from: Json, to: Json, t: number, kind: ValueKind | undefined): Json {
  const drawnAs = kind ?? (typeof from === 'number' ? 'number' : undefined);
  if (drawnAs === 'number' && typeof from === 'number' && typeof to === 'number') {
    return from + (to - from) * t;
  }
  if (drawnAs === 'colour') {
    const alpha =
      (typeof from === 'string' && from.replace('#', '').length === 8) ||
      (Array.isArray(from) && from.length === 4);
    const a = parseColour(from, alpha);
    const b = parseColour(to, alpha);
    if (a !== null && b !== null) {
      return colourHex(
        {
          a: a.a + (b.a - a.a) * t,
          r: a.r + (b.r - a.r) * t,
          g: a.g + (b.g - a.g) * t,
          b: a.b + (b.b - a.b) * t,
        },
        alpha,
      );
    }
  }
  // True or false, a choice, or anything else: it steps at the next keyframe.
  return t >= 1 ? to : from;
}

/** `value` within `[0, period)`. */
export function wrapTicks(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/**
 * The value of a track at a tick: within the period (`period_ticks`) when the timeline repeats,
 * else held at its ends. `kind` says how the value blends (by default a number blends and
 * anything else steps); a colour comes back as `#RRGGBB` (or `#AARRGGBB`).
 */
export function sampleTrack(
  track: Track,
  ticks: number,
  period: number | undefined,
  kind?: ValueKind,
): Json | null {
  const keyframes = [...track.keyframes].sort((a, b) => a.ticks - b.ticks);
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (first === undefined || last === undefined) return null;
  if (keyframes.length === 1) return first.value;
  const ease = easingOf(track.ease).fn;
  let at = ticks;
  let from: { ticks: number; value: Json };
  let to: { ticks: number; value: Json };
  if (period !== undefined) {
    at = wrapTicks(ticks, period);
    const index = keyframes.findLastIndex((keyframe) => keyframe.ticks <= at);
    if (index === -1) {
      from = { ticks: last.ticks - period, value: last.value };
      to = first;
    } else {
      from = keyframes[index] as Keyframe;
      const next = keyframes[index + 1];
      to = next ?? { ticks: first.ticks + period, value: first.value };
    }
  } else {
    if (at <= first.ticks) return first.value;
    if (at >= last.ticks) return last.value;
    const index = keyframes.findLastIndex((keyframe) => keyframe.ticks <= at);
    from = keyframes[index] as Keyframe;
    to = keyframes[index + 1] as Keyframe;
  }
  const span = to.ticks - from.ticks;
  const t = span <= 0 ? 1 : Math.max(0, Math.min(1, (at - from.ticks) / span));
  return blend(from.value, to.value, ease(t), kind);
}
