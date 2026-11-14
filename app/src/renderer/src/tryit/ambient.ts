/**
 * Ambient particles in Try it (ADR 0085 slice 2; formats ADR 0080 D6 and ADR 0077 D1): blocks
 * that show particles on their own, near the player.
 *
 * - A block with `msm:ambient_particles` follows the runtime's rule (`AmbientParticles.plan`):
 *   nothing unless every `states` property has its value; with `chance` below 1 one draw below
 *   `chance` passes; then `count` particles, each drawing x, y and z in that order, placed at
 *   the block's corner plus `offset` plus or minus `spread` (`offset + (2r - 1) × spread`) and
 *   starting with exactly `velocity`.
 * - A portal block shows its `particles`: `count` (default 4, 0 for none) per animation tick
 *   anywhere in the block, with a velocity of up to 0.25 a tick on each axis, or still coloured
 *   dust when `color` is set (the runtime's `MsmPortalBlock.animateTick`).
 * - Approximation: every such block within {@link AMBIENT_RANGE} blocks of the player gets one
 *   animation tick each game tick (the game picks blocks near the player at random, about once
 *   a tick each).
 *
 * The world, the lowered files and the player's position come in as plain inputs; the particles
 * go out through a sink, so this module draws nothing and runs under tests with a seeded random.
 * No React, no GL.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import {
  type BlockPos,
  type BlockState,
  readJsonFile,
  type SimFiles,
  type SimOrigin,
  type Vec3,
} from '@msm/sim';

/** How far from the player blocks show ambient particles, in blocks. */
export const AMBIENT_RANGE = 32;
/** A portal's particles per animation tick without `particles.count` (ADR 0077 D1). */
export const PORTAL_PARTICLE_COUNT = 4;
/** The most a portal's particle moves per tick on each axis is half this. */
export const PORTAL_PARTICLE_SPEED = 0.5;

/** A particle to spawn: a type id, or a vanilla options object. Same as `render/particles`. */
export type AmbientParticleRef = string | JsonObject;

/** Where an ambient particle starts and how it moves. */
export interface AmbientSpawn {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly xd: number;
  readonly yd: number;
  readonly zd: number;
}

/** Takes the particles; `ParticleField.sink` from `render/particles` fits. */
export type AmbientSink = (
  particle: AmbientParticleRef,
  at: AmbientSpawn,
  origin?: SimOrigin,
) => void;

/** What the emitter reads of the world: `SimWorld` from `@msm/sim` fits. */
export interface AmbientWorld {
  get(pos: BlockPos): BlockState | null;
  blocks(): Iterable<{ readonly pos: BlockPos; readonly state: BlockState }>;
  /** With it, the emitter keeps an index of emitting blocks instead of scanning each tick. */
  onChange?(listener: (change: { readonly pos: BlockPos }) => void): () => void;
}

type Triple = readonly [number, number, number];

/** A block's `msm:ambient_particles`, with the defaults filled. */
export interface AmbientSpec {
  readonly kind: 'ambient';
  readonly particle: AmbientParticleRef;
  readonly chance: number;
  readonly count: number;
  readonly offset: Triple;
  readonly spread: Triple;
  readonly velocity: Triple;
  readonly states: Readonly<Record<string, string>>;
}

/** A portal's `particles`, with the defaults filled. */
export interface PortalParticlesSpec {
  readonly kind: 'portal';
  /** The particle type, or `null` for the target's default portal particle when not known. */
  readonly particle: AmbientParticleRef | null;
  readonly count: number;
  /** True when `color` makes it coloured dust: such particles start still. */
  readonly dust: boolean;
}

/** What a block shows on its own. */
export type EmitterSpec = AmbientSpec | PortalParticlesSpec;

/** A random source in [0, 1). */
export type Random = () => number;

/**
 * A seeded random source in [0, 1) (mulberry32): the same seed gives the same numbers, so a
 * test's emission is repeatable.
 */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function tripleOf(value: Json | undefined, fallback: Triple): Triple {
  return Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
    ? (value as unknown as Triple)
    : fallback;
}

function numberIn(value: Json | undefined, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

const BLOCK_PATH = /^msm\/([a-z0-9_.-]+)\/block\/(.+)\.json$/;

/** The component of a block definition as an {@link AmbientSpec}; `undefined` without one. */
export function ambientSpecOf(definition: Json | undefined): AmbientSpec | undefined {
  if (!isObject(definition)) return undefined;
  const components = isObject(definition.components) ? definition.components : undefined;
  const component = components?.['msm:ambient_particles'];
  if (!isObject(component)) return undefined;
  const particle = component.particle;
  if (!(typeof particle === 'string' && particle !== '') && !isObject(particle)) return undefined;
  const states: Record<string, string> = {};
  if (isObject(component.states)) {
    for (const [key, value] of Object.entries(component.states)) {
      states[key] = typeof value === 'string' ? value : String(value);
    }
  }
  return Object.freeze({
    kind: 'ambient',
    particle,
    chance: numberIn(component.chance, 0, 1, 1),
    count: Math.round(numberIn(component.count, 1, 16, 1)),
    offset: tripleOf(component.offset, [0.5, 0.5, 0.5]),
    spread: tripleOf(component.spread, [0.5, 0.5, 0.5]),
    velocity: tripleOf(component.velocity, [0, 0, 0]),
    states: Object.freeze(states),
  });
}

/**
 * A portal definition's particles as a {@link PortalParticlesSpec}; `undefined` for a block that
 * is not a portal. `defaultParticle` is the target's portal particle (`TargetFacts.blocks.portal`).
 */
export function portalSpecOf(
  definition: Json | undefined,
  defaultParticle?: string,
): PortalParticlesSpec | undefined {
  if (!isObject(definition) || definition.type !== 'portal') return undefined;
  const particles = isObject(definition.particles) ? definition.particles : {};
  const colour =
    typeof particles.color === 'number' && Number.isInteger(particles.color)
      ? particles.color
      : undefined;
  const type =
    typeof particles.type === 'string' && particles.type !== '' ? particles.type : undefined;
  let particle: AmbientParticleRef | null;
  if (colour !== undefined) particle = { type: 'minecraft:dust', color: colour, scale: 1 };
  else particle = type ?? defaultParticle ?? null;
  return Object.freeze({
    kind: 'portal',
    particle,
    count: Math.round(numberIn(particles.count, 0, 16, PORTAL_PARTICLE_COUNT)),
    dust: colour !== undefined,
  });
}

/** Every project block that shows particles on its own, by block id. */
export function emittersFromFiles(
  files: SimFiles,
  defaultPortalParticle?: string,
): Map<string, EmitterSpec> {
  const out = new Map<string, EmitterSpec>();
  for (const path of [...files.keys()].sort()) {
    const match = BLOCK_PATH.exec(path);
    if (match === null) continue;
    const definition = readJsonFile(files, path);
    const spec = portalSpecOf(definition, defaultPortalParticle) ?? ambientSpecOf(definition);
    if (spec !== undefined) out.set(`${match[1]}:${match[2]}`, spec);
  }
  return out;
}

/** Whether `state` has every property of `states` with that value. */
export function statesMatch(states: Readonly<Record<string, string>>, state: BlockState): boolean {
  for (const [key, value] of Object.entries(states)) {
    if (state.properties[key] !== value) return false;
  }
  return true;
}

/** The particles one animation tick of a block shows (the runtime's rule, see the module). */
export function planEmission(
  spec: EmitterSpec,
  state: BlockState,
  pos: BlockPos,
  random: Random,
): AmbientSpawn[] {
  if (spec.kind === 'portal') {
    const out: AmbientSpawn[] = [];
    const speed = spec.dust ? 0 : PORTAL_PARTICLE_SPEED;
    for (let n = 0; n < spec.count; n += 1) {
      const x = pos.x + random();
      const y = pos.y + random();
      const z = pos.z + random();
      out.push({
        x,
        y,
        z,
        xd: (random() - 0.5) * speed,
        yd: (random() - 0.5) * speed,
        zd: (random() - 0.5) * speed,
      });
    }
    return out;
  }
  if (!statesMatch(spec.states, state)) return [];
  if (spec.chance < 1 && random() >= spec.chance) return [];
  const out: AmbientSpawn[] = [];
  for (let n = 0; n < spec.count; n += 1) {
    out.push({
      x: pos.x + spec.offset[0] + (2 * random() - 1) * spec.spread[0],
      y: pos.y + spec.offset[1] + (2 * random() - 1) * spec.spread[1],
      z: pos.z + spec.offset[2] + (2 * random() - 1) * spec.spread[2],
      xd: spec.velocity[0],
      yd: spec.velocity[1],
      zd: spec.velocity[2],
    });
  }
  return out;
}

/** Options of {@link AmbientParticles}. */
export interface AmbientOptions {
  /** The project's lowered files. */
  files: SimFiles;
  /** The target's portal particle (`TargetFacts.blocks.portal.particle`). */
  defaultPortalParticle?: string;
  /** Seed of the random source; ignored when `random` is given. Default 1. */
  seed?: number;
  random?: Random;
  /** Default {@link AMBIENT_RANGE}. */
  range?: number;
}

/** One tick's inputs. */
export interface AmbientTickInput {
  /** The blocks; `SimWorld` fits. */
  world: AmbientWorld;
  /** The player's position (feet or eye; the range is generous). */
  player: Vec3;
  /** Where the particles go. */
  sink: AmbientSink;
}

const posKey = (pos: BlockPos): string => `${pos.x},${pos.y},${pos.z}`;

/**
 * Ambient particles of the test area. Call {@link tick} once per game tick (from the
 * simulation clock's tick), after the player has moved.
 */
export class AmbientParticles {
  private emitters: Map<string, EmitterSpec>;
  private readonly defaultPortalParticle: string | undefined;
  private readonly random: Random;
  private readonly range: number;
  private world: AmbientWorld | null = null;
  private unsubscribe: (() => void) | null = null;
  /** Emitting blocks by position key, kept from the world's change events. */
  private index: Map<string, BlockPos> | null = null;

  constructor(options: AmbientOptions) {
    this.defaultPortalParticle = options.defaultPortalParticle;
    this.emitters = emittersFromFiles(options.files, this.defaultPortalParticle);
    this.random = options.random ?? seededRandom(options.seed ?? 1);
    this.range = options.range ?? AMBIENT_RANGE;
  }

  /** New lowered files: the emitters are read again and the world scanned again. */
  setFiles(files: SimFiles): void {
    this.emitters = emittersFromFiles(files, this.defaultPortalParticle);
    this.index = null;
  }

  /** The block ids that show particles on their own. */
  emitterIds(): string[] {
    return [...this.emitters.keys()].sort();
  }

  /** The emitter of a block id. */
  emitterFor(id: string): EmitterSpec | undefined {
    return this.emitters.get(id);
  }

  private follow(world: AmbientWorld): void {
    if (this.world === world) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.world = world;
    this.index = null;
    if (world.onChange !== undefined) {
      this.unsubscribe = world.onChange(({ pos }) => {
        if (this.index === null) return;
        const state = world.get(pos);
        if (state !== null && this.emitters.has(state.name)) this.index.set(posKey(pos), pos);
        else this.index.delete(posKey(pos));
      });
    }
  }

  private scan(world: AmbientWorld): Map<string, BlockPos> {
    const index = new Map<string, BlockPos>();
    for (const { pos, state } of world.blocks()) {
      if (this.emitters.has(state.name)) index.set(posKey(pos), { x: pos.x, y: pos.y, z: pos.z });
    }
    return index;
  }

  /** One game tick: every emitting block near the player gets one animation tick. */
  tick(input: AmbientTickInput): number {
    const { world, player, sink } = input;
    this.follow(world);
    if (this.emitters.size === 0) return 0;
    let index = this.index;
    if (index === null || world.onChange === undefined) {
      index = this.scan(world);
      if (world.onChange !== undefined) this.index = index;
    }
    const range2 = this.range * this.range;
    let emitted = 0;
    for (const pos of index.values()) {
      const dx = pos.x + 0.5 - player.x;
      const dy = pos.y + 0.5 - player.y;
      const dz = pos.z + 0.5 - player.z;
      if (dx * dx + dy * dy + dz * dz > range2) continue;
      const state = world.get(pos);
      if (state === null) continue;
      const spec = this.emitters.get(state.name);
      if (spec === undefined) continue;
      const particle = spec.particle ?? '';
      const plan = planEmission(spec, state, pos, this.random);
      if (plan.length === 0) continue;
      const origin: SimOrigin = {
        elementId: state.name,
        pointer: spec.kind === 'portal' ? '/particles' : '/components/msm:ambient_particles',
      };
      for (const at of plan) sink(particle, at, origin);
      emitted += plan.length;
    }
    return emitted;
  }

  /** Stops following the world's changes. */
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.world = null;
    this.index = null;
  }
}
