import type { SimLog, SimOrigin } from '@msm/sim';
import { mat4 } from 'gl-matrix';
import { describe, expect, it } from 'vitest';
import {
  resolveSpec,
  size as specSize,
} from '../../../src/renderer/src/studios/blocks-items/particle-sim';
import { seededRandom } from '../../../src/renderer/src/tryit/ambient';
import {
  cameraAxes,
  dotPixels,
  dustColour,
  FLOATS_PER_VERTEX,
  MAX_PARTICLES,
  ParticleField,
  particleQuads,
  writeBillboard,
} from '../../../src/renderer/src/tryit/render/particles';

type Line = { kind: 'info' | 'only'; text: string; origin?: SimOrigin };

function recordingLog(): SimLog & { lines: Line[] } {
  const lines: Line[] = [];
  return {
    lines,
    info: (text, origin) => lines.push({ kind: 'info', text, ...(origin ? { origin } : {}) }),
    onlyInMinecraft: (text, origin) =>
      lines.push({ kind: 'only', text, ...(origin ? { origin } : {}) }),
  };
}

const SPARK = {
  format: 1,
  textures: ['demo:spark_0', 'demo:spark_1', 'demo:spark_2'],
  lifetime: { min: 10, max: 20 },
  size: 0.1,
  size_end: 0.3,
  gravity: 1,
  fade: 'out',
};

function files(extra: Record<string, unknown> = {}): Map<string, string | Uint8Array> {
  const out = new Map<string, string | Uint8Array>([
    ['msm/demo/particle/spark.json', JSON.stringify(SPARK)],
    ['msm/demo/block/ruby_block.json', JSON.stringify({ format: 1 })],
  ]);
  for (const [path, json] of Object.entries(extra)) out.set(path, JSON.stringify(json));
  return out;
}

describe('Try it particle field', () => {
  it('reads the project particles from the lowered files', () => {
    const field = new ParticleField({ files: files() });
    expect(field.projectParticles()).toEqual(['demo:spark']);
    const look = field.lookFor('demo:spark');
    expect(look.dot).toBe(false);
    expect(look.sprites).toEqual(['demo:spark_0', 'demo:spark_1', 'demo:spark_2']);
    expect(look.spec).toEqual(resolveSpec(SPARK));
  });

  it('moves a particle as particle-sim does, with no collision, and lets it die', () => {
    const field = new ParticleField({ files: files(), random: () => 0 });
    const particle = field.emit('demo:spark', { x: 1, y: 2, z: 3, xd: 0.1 });
    expect(particle.life).toBe(10);
    field.tick();
    // Gravity 1: yd = 0 - 0.04, then the move, then friction 0.98.
    expect(particle.x).toBeCloseTo(1.1, 6);
    expect(particle.y).toBeCloseTo(1.96, 6);
    expect(particle.yd).toBeCloseTo(-0.04 * 0.98, 6);
    expect(particle.px).toBe(1);
    // It falls through where a floor would be: collision is off.
    for (let i = 0; i < 8; i += 1) field.tick();
    expect(field.size).toBe(1);
    expect(particle.y).toBeLessThan(2);
    field.tick();
    expect(field.size).toBe(0);
  });

  it('never keeps more than 500 alive, pushing out the oldest', () => {
    const field = new ParticleField({ files: files(), random: seededRandom(3) });
    for (let i = 0; i < 1200; i += 1) field.emit('demo:spark', { x: i, y: 0, z: 0 });
    expect(MAX_PARTICLES).toBe(500);
    expect(field.size).toBe(500);
    expect(field.emitted).toBe(1200);
    expect(field.dropped).toBe(700);
    expect(field.particles()[0]?.x).toBe(700);
    field.clear();
    expect(field.size).toBe(0);
    expect(field.emitted).toBe(0);
  });

  it('shows a vanilla particle as a small neutral dot and says so once per id', () => {
    const log = recordingLog();
    const field = new ParticleField({ files: files(), log });
    const origin = { elementId: 'demo:torch' };
    const flame = field.lookFor('minecraft:flame', origin);
    field.emit('minecraft:flame', { x: 0, y: 0, z: 0 });
    field.emit('flame', { x: 0, y: 0, z: 0 });
    field.emit('minecraft:end_rod', { x: 0, y: 0, z: 0 });
    expect(flame.dot).toBe(true);
    expect(flame.sprites).toEqual([]);
    expect(flame.spec.color).toBe(0xd8d8d8);
    expect(flame.spec.size).toBeCloseTo(0.06, 6);
    expect(log.lines).toEqual([
      {
        kind: 'only',
        text: 'how the vanilla particle minecraft:flame looks; the preview shows a small dot',
        origin,
      },
      {
        kind: 'only',
        text: 'how the vanilla particle minecraft:end_rod looks; the preview shows a small dot',
      },
    ]);
  });

  it('keeps the colour of dust and names unknown particles plainly', () => {
    const log = recordingLog();
    const field = new ParticleField({ files: files(), log });
    const red = field.lookFor({ type: 'minecraft:dust', color: [1, 0, 0], scale: 1 });
    expect(red.dot).toBe(true);
    expect(red.spec.color).toBe(0xff0000);
    expect(field.lookFor({ type: 'minecraft:dust', color: 0x00ff00 }).spec.color).toBe(0x00ff00);
    field.lookFor('demo:missing');
    field.lookFor('other:glow');
    field.lookFor({ scale: 1 });
    expect(log.lines.map((line) => line.text)).toEqual([
      'how the vanilla particle minecraft:dust looks; the preview shows a small dot',
      'the particle demo:missing, which the project does not define; the preview shows a small dot',
      'the particle other:glow of another mod; the preview shows a small dot',
      'a particle with no type; the preview shows a small dot',
    ]);
    expect(dustColour([0, 0.5, 1])).toBe(0x0080ff);
    expect(dustColour('red')).toBeUndefined();
  });

  it('says once that a particle which collides passes through blocks here', () => {
    const log = recordingLog();
    const field = new ParticleField({
      files: files({
        'msm/demo/particle/ghost.json': { format: 1, textures: [], collision: false },
      }),
      log,
    });
    field.emit('demo:spark', { x: 0, y: 0, z: 0 });
    field.emit('demo:spark', { x: 0, y: 0, z: 0 });
    field.emit('demo:ghost', { x: 0, y: 0, z: 0 });
    expect(log.lines.map((line) => line.text)).toEqual([
      'the particle demo:spark stopping on blocks; here it passes through them',
    ]);
  });

  it('picks up new files and keeps the particles alive', () => {
    const field = new ParticleField({ files: files() });
    field.emit('demo:spark', { x: 0, y: 0, z: 0 });
    const revision = field.revision;
    field.setFiles(
      files({ 'msm/demo/particle/glow.json': { format: 1, textures: ['demo:glow'] } }),
    );
    expect(field.revision).toBe(revision + 1);
    expect(field.projectParticles()).toEqual(['demo:glow', 'demo:spark']);
    expect(field.size).toBe(1);
  });

  it('finds frame pictures where lowering puts them and never a vanilla sprite', () => {
    const field = new ParticleField({ files: files() });
    expect(field.spritePicture('demo:spark_0')).toEqual({
      namespace: 'demo',
      path: 'textures/particle/spark_0.png',
      assetPath: 'assets/demo/textures/particle/spark_0.png',
    });
    expect(field.spritePicture('minecraft:glow')).toBeUndefined();
    expect(field.spritePicture('glow')).toBeUndefined();
  });

  it('gives quads between ticks with the frame, size and colour of particle-sim', () => {
    const field = new ParticleField({ files: files(), random: () => 0.999 });
    const particle = field.emit('demo:spark', { x: 0, y: 5, z: 0, xd: 1 });
    expect(particle.life).toBe(20);
    for (let i = 0; i < 10; i += 1) field.tick();
    const [quad] = particleQuads(field.particles(), 0.5);
    expect(quad).toBeDefined();
    if (quad === undefined) return;
    expect(quad.x).toBeCloseTo((particle.px + particle.x) / 2, 6);
    expect(quad.sprite).toBe('demo:spark_1');
    expect(quad.half).toBeCloseTo(specSize(particle.look.spec, 10, 20, 0.5), 6);
    expect(quad.rgba[3]).toBeCloseTo(0.5, 5);
    expect(quad.translucent).toBe(true);
  });

  it('builds camera-facing squares', () => {
    const view = mat4.create();
    const axes = cameraAxes(view);
    expect(axes).toEqual({ right: [1, 0, 0], up: [0, 1, 0] });
    const out = new Float32Array(6 * FLOATS_PER_VERTEX);
    const next = writeBillboard(
      out,
      0,
      { x: 2, y: 3, z: 4, half: 0.5, roll: 0, rgba: [1, 0.5, 0.25, 1] },
      axes,
    );
    expect(next).toBe(6 * FLOATS_PER_VERTEX);
    // The first corner is bottom left, the third top right.
    expect([...out.slice(0, 3)]).toEqual([1.5, 2.5, 4]);
    expect([...out.slice(2 * FLOATS_PER_VERTEX, 2 * FLOATS_PER_VERTEX + 3)]).toEqual([2.5, 3.5, 4]);
    expect([...out.slice(5, 9)]).toEqual([1, 0.5, 0.25, 1]);
    // A quarter turn of roll swaps the axes.
    writeBillboard(
      out,
      0,
      { x: 0, y: 0, z: 0, half: 1, roll: Math.PI / 2, rgba: [1, 1, 1, 1] },
      axes,
    );
    expect(out[0]).toBeCloseTo(1, 6);
    expect(out[1]).toBeCloseTo(-1, 6);
  });

  it('draws the dot as a disc', () => {
    const pixels = dotPixels();
    expect(pixels[3]).toBe(0);
    expect(pixels[(3 * 8 + 3) * 4 + 3]).toBe(255);
  });
});
