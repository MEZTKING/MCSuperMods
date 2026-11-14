/**
 * The Particle Studio's simulation (ADR 0081 D1, D6): the TypeScript twin of the runtime's
 * `ParticleLook` (ADR 0080 D4), written from the rules in `fixtures/particle-look/README.md`.
 * It gives the frame, size, colour, alpha and roll of a particle by age, and its movement when
 * it does not collide, for the Studio's 2D preview. `test/particle-sim.test.ts` checks it
 * against `fixtures/particle-look/golden.json`, whose expected values the runtime computes.
 *
 * Single-precision steps of the runtime are repeated with `Math.fround`, so both sides agree
 * within the golden's tolerance. No React, no DOM.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';

/** How the frames run: once over the life, in a loop, or one random frame per particle. */
export type ParticleAnimation = 'age' | 'loop' | 'random';

/** How the particle fades. */
export type ParticleFade = 'none' | 'out' | 'in_out';

/** The knobs of an `msm:particle` definition with the defaults resolved (ADR 0080 D1). */
export interface ParticleSpec {
  animation: ParticleAnimation;
  frameTicks: number;
  lifetimeMin: number;
  lifetimeMax: number;
  size: number;
  sizeEnd: number;
  gravity: number;
  friction: number;
  collision: boolean;
  color: number;
  colorEnd: number;
  alpha: number;
  fade: ParticleFade;
  emissive: boolean;
  translucent: boolean;
  spin: number;
  alwaysShow: boolean;
}

/** Where a particle is and how fast it moves, in blocks and blocks per tick. */
export interface ParticleState {
  x: number;
  y: number;
  z: number;
  xd: number;
  yd: number;
  zd: number;
}

/** The share of the life an `in_out` fade takes at each end. */
export const IN_OUT_EDGE = 0.25;
/** The speed gravity takes off per tick for a gravity of 1. */
export const GRAVITY_STEP = 0.04;

const f = Math.fround;

function isObject(value: Json | undefined): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `value` as a number in `min..max` (`fallback` when it is not a number). */
function numberIn(value: Json | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function intIn(value: Json | undefined, min: number, max: number, fallback: number): number {
  return Math.round(numberIn(value, min, max, fallback));
}

function booleanOr(value: Json | undefined, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * The spec of a definition, with ADR 0080 D1's defaults for absent fields. Values out of range
 * are clamped (the schema reports them; the preview still plays).
 */
export function resolveSpec(definition: Json | undefined): ParticleSpec {
  const data = isObject(definition) ? definition : {};
  const animation: ParticleAnimation =
    data.animation === 'loop' || data.animation === 'random' ? data.animation : 'age';
  const fade: ParticleFade = data.fade === 'out' || data.fade === 'in_out' ? data.fade : 'none';
  let lifetimeMin = 20;
  let lifetimeMax = 20;
  if (isObject(data.lifetime)) {
    lifetimeMin = intIn(data.lifetime.min, 1, 6000, 20);
    lifetimeMax = Math.max(lifetimeMin, intIn(data.lifetime.max, 1, 6000, lifetimeMin));
  } else {
    lifetimeMin = intIn(data.lifetime, 1, 6000, 20);
    lifetimeMax = lifetimeMin;
  }
  const size = f(numberIn(data.size, 0.01, 16, 0.2));
  const color = intIn(data.color, 0, 0xffffff, 0xffffff);
  const alpha = f(numberIn(data.alpha, 0, 1, 1));
  return {
    animation,
    frameTicks: intIn(data.frame_ticks, 1, 1200, 2),
    lifetimeMin,
    lifetimeMax,
    size,
    sizeEnd: data.size_end === undefined ? size : f(numberIn(data.size_end, 0, 16, size)),
    gravity: f(numberIn(data.gravity, -16, 16, 0)),
    friction: f(numberIn(data.friction, 0, 1, 0.98)),
    collision: booleanOr(data.collision, true),
    color,
    colorEnd: data.color_end === undefined ? color : intIn(data.color_end, 0, 0xffffff, color),
    alpha,
    fade,
    emissive: booleanOr(data.emissive, false),
    translucent: booleanOr(data.translucent, alpha < 1 || fade !== 'none'),
    spin: f(numberIn(data.spin, -360, 360, 0)),
    alwaysShow: booleanOr(data.always_show, false),
  };
}

/** The lifetime of a range for `r` in [0, 1): `min + floor(r × (max − min + 1))`, clamped. */
export function lifetime(min: number, max: number, r: number): number {
  const value = min + Math.floor(r * (max - min + 1));
  return Math.max(min, Math.min(max, value));
}

/** `(age + partial) / lifetime`, clamped to 0..1. */
export function progress(age: number, partial: number, life: number): number {
  const t = f(f(age + partial) / Math.max(1, life));
  return Math.max(0, Math.min(1, t));
}

/** The frame index at `age` of `frames` pictures. */
export function frame(
  spec: ParticleSpec,
  age: number,
  life: number,
  frames: number,
  randomFrame: number,
): number {
  if (frames <= 1) return 0;
  const a = Math.max(0, age);
  switch (spec.animation) {
    case 'age':
      return Math.min(frames - 1, Math.floor((a * frames) / Math.max(1, life)));
    case 'loop':
      return Math.floor(a / spec.frameTicks) % frames;
    case 'random':
      return ((randomFrame % frames) + frames) % frames;
  }
}

/** The quad size (half the square's width) at `age` plus `partial` ticks. */
export function size(spec: ParticleSpec, age: number, life: number, partial: number): number {
  const t = progress(age, partial, life);
  return f(spec.size + f(f(spec.sizeEnd - spec.size) * t));
}

function channel(from: number, to: number, shift: number, t: number): number {
  const a = f(((from >> shift) & 0xff) / 255);
  const b = f(((to >> shift) & 0xff) / 255);
  return f(a + f(f(b - a) * t));
}

/** `[r, g, b, a]`, each 0..1, at `age`. */
export function rgba(
  spec: ParticleSpec,
  age: number,
  life: number,
): [number, number, number, number] {
  const t = progress(age, 0, life);
  let fade = 1;
  if (spec.fade === 'out') fade = f(1 - t);
  else if (spec.fade === 'in_out') {
    fade = Math.max(0, Math.min(1, Math.min(f(t / IN_OUT_EDGE), f(f(1 - t) / IN_OUT_EDGE))));
  }
  return [
    channel(spec.color, spec.colorEnd, 16, t),
    channel(spec.color, spec.colorEnd, 8, t),
    channel(spec.color, spec.colorEnd, 0, t),
    f(spec.alpha * fade),
  ];
}

/** The roll at `age`, in radians (`spin` degrees per tick). */
export function roll(spec: ParticleSpec, age: number): number {
  return f(((spec.spin * age) / 180) * Math.PI);
}

/** One tick of movement: gravity, then the move, then friction on the velocity. */
export function step(state: ParticleState, spec: ParticleSpec): ParticleState {
  const friction = spec.friction;
  const yd = state.yd - GRAVITY_STEP * spec.gravity;
  return {
    x: state.x + state.xd,
    y: state.y + yd,
    z: state.z + state.zd,
    xd: state.xd * friction,
    yd: yd * friction,
    zd: state.zd * friction,
  };
}
