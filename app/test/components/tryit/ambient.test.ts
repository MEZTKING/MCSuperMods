import { type BlockState, SimWorld, type Vec3 } from '@msm/sim';
import { describe, expect, it } from 'vitest';
import {
  AMBIENT_RANGE,
  AmbientParticles,
  type AmbientSink,
  ambientSpecOf,
  emittersFromFiles,
  planEmission,
  portalSpecOf,
  seededRandom,
} from '../../../src/renderer/src/tryit/ambient';
import { MAX_PARTICLES, ParticleField } from '../../../src/renderer/src/tryit/render/particles';

const MINUTE = 20 * 60;

const block = (name: string, properties: Record<string, string> = {}): BlockState => ({
  name,
  properties,
});

function projectFiles(): Map<string, string | Uint8Array> {
  const definitions: Record<string, unknown> = {
    'msm/demo/particle/spark.json': { format: 1, textures: ['demo:spark'], lifetime: 40 },
    'msm/demo/block/sparkler.json': {
      format: 1,
      components: {
        'msm:ambient_particles': { particle: 'demo:spark', chance: 0.25, count: 2 },
      },
    },
    'msm/demo/block/oven.json': {
      format: 1,
      type: 'horizontal',
      components: {
        'msm:ambient_particles': {
          particle: 'minecraft:smoke',
          offset: [0.5, 1, 0.5],
          spread: [0.25, 0, 0.25],
          velocity: [0, 0.05, 0],
          states: { lit: 'true' },
        },
      },
    },
    'msm/demo/block/gate.json': {
      format: 1,
      type: 'portal',
      destination: 'demo:far',
      particles: { type: 'demo:spark', count: 3 },
    },
    'msm/demo/block/red_gate.json': {
      format: 1,
      type: 'portal',
      destination: 'demo:far',
      particles: { color: 0xff0000 },
    },
    'msm/demo/block/plain.json': { format: 1 },
  };
  return new Map(Object.entries(definitions).map(([path, json]) => [path, JSON.stringify(json)]));
}

const PLAYER: Vec3 = { x: 24, y: 1, z: 24 };

describe('Try it ambient particles: reading definitions', () => {
  it('finds every block that shows particles on its own, with defaults filled', () => {
    const emitters = emittersFromFiles(projectFiles(), 'minecraft:portal');
    expect([...emitters.keys()].sort()).toEqual([
      'demo:gate',
      'demo:oven',
      'demo:red_gate',
      'demo:sparkler',
    ]);
    expect(emitters.get('demo:sparkler')).toEqual({
      kind: 'ambient',
      particle: 'demo:spark',
      chance: 0.25,
      count: 2,
      offset: [0.5, 0.5, 0.5],
      spread: [0.5, 0.5, 0.5],
      velocity: [0, 0, 0],
      states: {},
    });
    expect(emitters.get('demo:gate')).toEqual({
      kind: 'portal',
      particle: 'demo:spark',
      count: 3,
      dust: false,
    });
    expect(emitters.get('demo:red_gate')).toEqual({
      kind: 'portal',
      particle: { type: 'minecraft:dust', color: 0xff0000, scale: 1 },
      count: 4,
      dust: true,
    });
  });

  it('uses the target portal particle by default and leaves out what is not set', () => {
    expect(portalSpecOf({ type: 'portal' }, 'minecraft:portal')?.particle).toBe('minecraft:portal');
    expect(portalSpecOf({ type: 'portal' })?.particle).toBeNull();
    expect(portalSpecOf({ type: 'block' })).toBeUndefined();
    expect(ambientSpecOf({ components: { 'msm:ambient_particles': { particle: '' } } })).toBe(
      undefined,
    );
    expect(ambientSpecOf({ components: {} })).toBeUndefined();
  });
});

describe('Try it ambient particles: the plan of one animation tick', () => {
  it('places particles as the runtime does: offset plus or minus spread, exact velocity', () => {
    const spec = ambientSpecOf({
      components: {
        'msm:ambient_particles': {
          particle: 'demo:spark',
          count: 1,
          offset: [0.5, 1, 0.5],
          spread: [0.25, 0, 0.5],
          velocity: [0, 0.1, 0],
        },
      },
    });
    if (spec === undefined) throw new Error('no spec');
    const draws = [0, 0.5, 1];
    let at = 0;
    const plan = planEmission(spec, block('demo:x'), { x: 3, y: 4, z: 5 }, () => draws[at++] ?? 0);
    expect(plan).toEqual([{ x: 3.25, y: 5, z: 6, xd: 0, yd: 0.1, zd: 0 }]);
    expect(at).toBe(3);
  });

  it('draws chance first and shows nothing when it fails', () => {
    const spec = ambientSpecOf({
      components: { 'msm:ambient_particles': { particle: 'demo:spark', chance: 0.5 } },
    });
    if (spec === undefined) throw new Error('no spec');
    expect(planEmission(spec, block('demo:x'), { x: 0, y: 0, z: 0 }, () => 0.5)).toEqual([]);
    expect(planEmission(spec, block('demo:x'), { x: 0, y: 0, z: 0 }, () => 0.4)).toHaveLength(1);
  });

  it('shows nothing unless the block state matches', () => {
    const emitters = emittersFromFiles(projectFiles());
    const oven = emitters.get('demo:oven');
    if (oven === undefined) throw new Error('no oven');
    const random = seededRandom(1);
    expect(planEmission(oven, block('demo:oven', { lit: 'false' }), PLAYER, random)).toEqual([]);
    expect(planEmission(oven, block('demo:oven', { lit: 'true' }), PLAYER, random)).toHaveLength(1);
  });

  it('gives portal particles a small random velocity, and still dust', () => {
    const emitters = emittersFromFiles(projectFiles());
    const gate = emitters.get('demo:gate');
    const red = emitters.get('demo:red_gate');
    if (gate === undefined || red === undefined) throw new Error('no gate');
    const random = seededRandom(9);
    const plan = planEmission(
      gate,
      block('demo:gate', { axis: 'x' }),
      { x: 2, y: 1, z: 2 },
      random,
    );
    expect(plan).toHaveLength(3);
    for (const spawn of plan) {
      expect(spawn.x).toBeGreaterThanOrEqual(2);
      expect(spawn.x).toBeLessThan(3);
      expect(Math.abs(spawn.xd)).toBeLessThanOrEqual(0.25);
    }
    expect(plan.some((spawn) => spawn.xd !== 0)).toBe(true);
    const dust = planEmission(red, block('demo:red_gate'), { x: 0, y: 0, z: 0 }, random);
    expect(dust).toHaveLength(4);
    expect(dust.every((spawn) => spawn.xd === 0 && spawn.yd === 0 && spawn.zd === 0)).toBe(true);
  });
});

/** Runs `ticks` ticks of ambient emission into a field; returns the emission count. */
function run(world: SimWorld, seed: number, ticks: number, field?: ParticleField): number {
  const ambient = new AmbientParticles({ files: projectFiles(), seed });
  let count = 0;
  const sink: AmbientSink = (particle, at, origin) => {
    count += 1;
    field?.emit(particle, at, origin);
  };
  for (let tick = 0; tick < ticks; tick += 1) {
    ambient.tick({ world, player: PLAYER, sink });
    field?.tick();
  }
  ambient.dispose();
  return count;
}

describe('Try it ambient particles over a seeded minute', () => {
  it('emits by chance and count, the same number for the same seed', () => {
    const world = new SimWorld();
    world.set({ x: 20, y: 0, z: 20 }, block('demo:sparkler'));
    const first = run(world, 42, MINUTE);
    expect(run(world, 42, MINUTE)).toBe(first);
    expect(first % 2).toBe(0);
    // 1,200 tries at a chance of 0.25 with 2 particles each: 600 expected.
    expect(first).toBeGreaterThan(500);
    expect(first).toBeLessThan(700);
    expect(first).toBe(580);
    expect(run(world, 1, MINUTE)).not.toBe(first);
  });

  it('emits exactly count every tick at chance 1, only while the state matches', () => {
    const world = new SimWorld();
    world.set({ x: 20, y: 0, z: 20 }, block('demo:oven', { facing: 'north', lit: 'true' }));
    world.set({ x: 22, y: 0, z: 20 }, block('demo:oven', { facing: 'north', lit: 'false' }));
    world.set({ x: 24, y: 0, z: 20 }, block('demo:gate', { axis: 'x' }));
    world.set({ x: 26, y: 0, z: 20 }, block('demo:plain'));
    expect(run(world, 1, MINUTE)).toBe(MINUTE * (1 + 3));
  });

  it('leaves out blocks beyond the range of the player', () => {
    const world = new SimWorld();
    world.set({ x: 0, y: 0, z: 0 }, block('demo:oven', { lit: 'true' }));
    const ambient = new AmbientParticles({ files: projectFiles() });
    let count = 0;
    const sink: AmbientSink = () => {
      count += 1;
    };
    ambient.tick({ world, player: { x: 0, y: 0, z: 0 }, sink });
    expect(count).toBe(1);
    ambient.tick({ world, player: { x: AMBIENT_RANGE + 2, y: 0, z: 0 }, sink });
    expect(count).toBe(1);
  });

  it('follows placed and broken blocks through the world change events', () => {
    const world = new SimWorld();
    const ambient = new AmbientParticles({ files: projectFiles() });
    let count = 0;
    const sink: AmbientSink = () => {
      count += 1;
    };
    ambient.tick({ world, player: PLAYER, sink });
    world.set({ x: 24, y: 0, z: 24 }, block('demo:oven', { lit: 'true' }));
    ambient.tick({ world, player: PLAYER, sink });
    expect(count).toBe(1);
    world.set({ x: 24, y: 0, z: 24 }, null);
    ambient.tick({ world, player: PLAYER, sink });
    expect(count).toBe(1);
    world.set({ x: 25, y: 0, z: 24 }, block('demo:gate'));
    world.clear();
    ambient.tick({ world, player: PLAYER, sink });
    expect(count).toBe(1);
  });

  it('keeps the field at 500 particles with many emitters for a minute', () => {
    const world = new SimWorld();
    for (let x = 10; x < 38; x += 1) {
      for (let z = 10; z < 38; z += 1) world.set({ x, y: 0, z }, block('demo:gate'));
    }
    const field = new ParticleField({ files: projectFiles(), random: seededRandom(5) });
    let most = 0;
    const ambient = new AmbientParticles({ files: projectFiles(), seed: 5 });
    for (let tick = 0; tick < MINUTE; tick += 1) {
      ambient.tick({ world, player: PLAYER, sink: field.sink });
      most = Math.max(most, field.size);
      field.tick();
    }
    expect(most).toBe(MAX_PARTICLES);
    expect(field.size).toBeLessThanOrEqual(MAX_PARTICLES);
    expect(field.emitted).toBe(MINUTE * 28 * 28 * 3);
    expect(field.dropped).toBeGreaterThan(0);
  });

  it('works on a hand-made grid without change events', () => {
    const states = new Map([['1,0,1', block('demo:oven', { lit: 'true' })]]);
    const grid = {
      get: (pos: { x: number; y: number; z: number }) =>
        states.get(`${pos.x},${pos.y},${pos.z}`) ?? null,
      *blocks() {
        for (const [key, state] of states) {
          const [x, y, z] = key.split(',').map(Number) as [number, number, number];
          yield { pos: { x, y, z }, state };
        }
      },
    };
    const ambient = new AmbientParticles({ files: projectFiles() });
    let count = 0;
    ambient.tick({ world: grid, player: { x: 1, y: 0, z: 1 }, sink: () => (count += 1) });
    states.set('2,0,1', block('demo:oven', { lit: 'true' }));
    ambient.tick({ world: grid, player: { x: 1, y: 0, z: 1 }, sink: () => (count += 1) });
    expect(count).toBe(3);
  });
});
