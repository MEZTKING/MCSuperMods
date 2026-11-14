import { describe, expect, it } from 'vitest';
import {
  CEILING_MARGIN,
  IDLE_INPUT,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  PlayerController,
  type PlayerInput,
  WALK_SPEED,
} from '../../src/player/index.js';
import { AREA_SIZE_X, AREA_SIZE_Y, AREA_SIZE_Z } from '../../src/types.js';
import { FakeWorld, SHAPES, SLAB, STAIR_EAST, STONE } from './fake-world.js';

const EAST = -90;
const WEST = 90;
const NORTH = 180;
const HALF = PLAYER_WIDTH / 2;

function input(patch: Partial<PlayerInput>): PlayerInput {
  return { ...IDLE_INPUT, ...patch };
}

function run(player: PlayerController, ticks: number, i: PlayerInput): void {
  for (let t = 0; t < ticks; t++) player.step(i);
}

function settled(world: FakeWorld, x: number, y: number, z: number): PlayerController {
  const p = new PlayerController(world.lookup, SHAPES, { x, y, z });
  run(p, 3, IDLE_INPUT);
  return p;
}

describe('PlayerController', () => {
  it('stands on the floor', () => {
    const p = settled(new FakeWorld(), 10.5, 1, 10.5);
    expect(p.position).toEqual({ x: 10.5, y: 1, z: 10.5 });
    expect(p.onGround).toBe(true);
  });

  it('walks at about 4.3 blocks a second', () => {
    const p = settled(new FakeWorld(), 5.5, 1, 10.5);
    run(p, 20, input({ forward: 1, yaw: EAST }));
    const before = p.position.x;
    run(p, 20, input({ forward: 1, yaw: EAST }));
    expect(p.position.x - before).toBeCloseTo(WALK_SPEED * 20, 2);
    expect(p.position.z).toBe(10.5);
  });

  it('stops at a wall', () => {
    const world = new FakeWorld().set(12, 1, 10, STONE).set(12, 2, 10, STONE);
    const p = settled(world, 10.5, 1, 10.5);
    run(p, 40, input({ forward: 1, yaw: EAST }));
    expect(p.position.x).toBeCloseTo(12 - HALF, 6);
    expect(p.position.y).toBe(1);
    expect(p.velocity.x).toBe(0);
  });

  it('does not walk up a full block without jumping, but jumps onto it', () => {
    const world = new FakeWorld();
    for (let x = 12; x < 30; x++) world.set(x, 1, 10, STONE);
    const p = settled(world, 10.5, 1, 10.5);
    run(p, 40, input({ forward: 1, yaw: EAST }));
    expect(p.position.x).toBeCloseTo(12 - HALF, 6);
    expect(p.position.y).toBe(1);
    run(p, 30, input({ forward: 1, yaw: EAST, jump: true }));
    run(p, 20, IDLE_INPUT);
    expect(p.position.y).toBe(2);
    expect(p.position.x).toBeGreaterThan(12.3);
  });

  it('walks up a slab', () => {
    const world = new FakeWorld().set(12, 1, 10, SLAB);
    const p = settled(world, 10.5, 1, 10.5);
    run(p, 12, input({ forward: 1, yaw: EAST }));
    expect(p.position.y).toBe(1.5);
    expect(p.onGround).toBe(true);
    expect(p.position.x).toBeGreaterThan(12 - HALF);
  });

  it('walks up stairs one half at a time', () => {
    const world = new FakeWorld().set(12, 1, 10, STAIR_EAST).set(13, 1, 10, STONE);
    const p = settled(world, 10.5, 1, 10.5);
    const heights = new Set<number>();
    for (let t = 0; t < 40; t++) {
      p.step(input({ forward: 1, yaw: EAST }));
      if (p.onGround) heights.add(p.position.y);
    }
    expect([...heights].sort()).toEqual([1, 1.5, 2]);
    expect(p.position.x).toBeGreaterThan(13);
  });

  it('steps off a block, falls and lands', () => {
    const world = new FakeWorld().set(10, 1, 10, STONE);
    const p = settled(world, 10.5, 2, 10.5);
    expect(p.position.y).toBe(2);
    let wasFalling = false;
    for (let t = 0; t < 40; t++) {
      p.step(input({ forward: 1, yaw: EAST }));
      if (!p.onGround && p.position.y < 2 && p.position.y > 1) wasFalling = true;
    }
    expect(wasFalling).toBe(true);
    expect(p.position.y).toBe(1);
    expect(p.onGround).toBe(true);
    expect(p.position.x).toBeGreaterThan(11 + HALF);
  });

  it('jumps about 1.25 blocks and comes back down', () => {
    const p = settled(new FakeWorld(), 10.5, 1, 10.5);
    p.step(input({ jump: true }));
    let top = p.position.y;
    for (let t = 0; t < 30; t++) {
      p.step(IDLE_INPUT);
      top = Math.max(top, p.position.y);
    }
    expect(top - 1).toBeGreaterThan(1.2);
    expect(top - 1).toBeLessThan(1.3);
    expect(Math.abs(top - 1 - 1.25)).toBeLessThan(0.02);
    expect(p.position.y).toBe(1);
    expect(p.onGround).toBe(true);
  });

  it('flies up, hovers, flies down and lands', () => {
    const p = settled(new FakeWorld(), 10.5, 1, 10.5);
    p.step(input({ toggleFly: true }));
    expect(p.flying).toBe(true);
    run(p, 20, input({ jump: true }));
    const high = p.position.y;
    expect(high).toBeGreaterThan(6);
    run(p, 40, IDLE_INPUT);
    expect(p.position.y).toBeGreaterThan(high);
    expect(p.position.y).toBeLessThan(high + 1);
    const hover = p.position.y;
    run(p, 20, IDLE_INPUT);
    expect(p.position.y).toBe(hover);
    run(p, 60, input({ sneak: true }));
    expect(p.position.y).toBe(1);
    expect(p.flying).toBe(false);
    expect(p.onGround).toBe(true);
  });

  it('turns flying off again by toggling, then falls', () => {
    const p = settled(new FakeWorld(), 10.5, 1, 10.5);
    p.step(input({ toggleFly: true }));
    run(p, 10, input({ jump: true }));
    p.step(input({ toggleFly: true }));
    expect(p.flying).toBe(false);
    run(p, 60, IDLE_INPUT);
    expect(p.position.y).toBe(1);
  });

  it('flies fast horizontally', () => {
    const p = settled(new FakeWorld(), 1.5, 1, 10.5);
    p.step(input({ toggleFly: true }));
    run(p, 5, input({ jump: true }));
    run(p, 40, input({ forward: 1, yaw: EAST }));
    const x0 = p.position.x;
    run(p, 20, input({ forward: 1, yaw: EAST }));
    expect(p.position.x - x0).toBeGreaterThan(WALK_SPEED * 20 * 2);
  });

  it('cannot leave the area: invisible walls at the edges and a ceiling', () => {
    const p = settled(new FakeWorld(), 1.5, 1, 1.5);
    run(p, 40, input({ forward: 1, yaw: WEST }));
    expect(p.position.x).toBeCloseTo(HALF, 6);
    run(p, 40, input({ forward: 1, yaw: NORTH }));
    expect(p.position.z).toBeCloseTo(HALF, 6);
    p.teleport({ x: AREA_SIZE_X - 1.5, y: 1, z: AREA_SIZE_Z - 1.5 });
    run(p, 40, input({ forward: 1, strafe: 1, yaw: EAST }));
    expect(p.position.x).toBeCloseTo(AREA_SIZE_X - HALF, 6);
    expect(p.position.z).toBeCloseTo(AREA_SIZE_Z - HALF, 6);
    p.step(input({ toggleFly: true }));
    run(p, 400, input({ jump: true }));
    expect(p.position.y + PLAYER_HEIGHT).toBeCloseTo(AREA_SIZE_Y + CEILING_MARGIN, 6);
  });

  it('stands on the invisible floor at y 0 when there are no blocks', () => {
    const p = new PlayerController(new FakeWorld(false).lookup, SHAPES, { x: 5.5, y: 4, z: 5.5 });
    run(p, 60, IDLE_INPUT);
    expect(p.position.y).toBe(0);
    expect(p.onGround).toBe(true);
  });

  it('sneaks at a third of the speed and walks off edges', () => {
    const walk = settled(new FakeWorld(), 5.5, 1, 10.5);
    const sneak = settled(new FakeWorld(), 5.5, 1, 10.5);
    run(walk, 40, input({ forward: 1, yaw: EAST }));
    run(sneak, 40, input({ forward: 1, yaw: EAST, sneak: true }));
    const ratio = (sneak.position.x - 5.5) / (walk.position.x - 5.5);
    expect(ratio).toBeGreaterThan(0.25);
    expect(ratio).toBeLessThan(0.35);
    expect(sneak.view().eyeHeight).toBeLessThan(walk.view().eyeHeight);

    const ledge = settled(new FakeWorld().set(10, 1, 10, STONE), 10.5, 2, 10.5);
    run(ledge, 60, input({ forward: 1, yaw: EAST, sneak: true }));
    expect(ledge.position.y).toBe(1);
  });

  it('gives interpolation values between ticks', () => {
    const p = settled(new FakeWorld(), 5.5, 1, 10.5);
    run(p, 5, input({ forward: 1, yaw: EAST, pitch: 10 }));
    const v = p.view();
    expect(v.previousPosition.x).toBeLessThan(v.position.x);
    const mid = p.interpolatedPosition(0.5);
    expect(mid.x).toBeCloseTo((v.previousPosition.x + v.position.x) / 2, 9);
    expect(p.interpolatedPosition(0)).toEqual(v.previousPosition);
    expect(p.eyePosition(1).y).toBeCloseTo(1 + v.eyeHeight, 9);
    expect(v.yaw).toBe(EAST);
    expect(v.pitch).toBe(10);
  });

  it('knows when a placed block would overlap it', () => {
    const p = settled(new FakeWorld(), 10.5, 1, 10.5);
    expect(p.wouldOverlap({ x: 10, y: 1, z: 10 }, STONE)).toBe(true);
    expect(p.wouldOverlap({ x: 10, y: 2, z: 10 }, STONE)).toBe(true);
    expect(p.wouldOverlap({ x: 10, y: 3, z: 10 }, STONE)).toBe(false);
    expect(p.wouldOverlap({ x: 11, y: 1, z: 10 }, STONE)).toBe(false);
  });

  it('gives the same end position twice over a 1,000-tick scripted run', () => {
    function script(): { x: number; y: number; z: number; flying: boolean } {
      const world = new FakeWorld()
        .set(20, 1, 20, STONE)
        .set(21, 1, 20, SLAB)
        .set(22, 1, 21, STAIR_EAST)
        .set(18, 1, 23, STONE)
        .set(18, 2, 23, STONE);
      const p = new PlayerController(world.lookup, SHAPES, { x: 20.5, y: 1, z: 18.5 });
      let seed = 12345;
      const next = (): number => {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
        return seed / 2 ** 32;
      };
      let current = IDLE_INPUT;
      for (let t = 0; t < 1000; t++) {
        if (t % 15 === 0) {
          current = {
            forward: Math.round(next() * 2 - 1),
            strafe: Math.round(next() * 2 - 1),
            jump: next() < 0.3,
            sneak: next() < 0.15,
            toggleFly: false,
            yaw: next() * 360 - 180,
            pitch: next() * 60 - 30,
          };
        }
        p.step({ ...current, toggleFly: t % 250 === 100 });
      }
      return { ...p.position, flying: p.flying };
    }
    const first = script();
    const second = script();
    expect(second).toEqual(first);
    expect(first.x).toBeGreaterThanOrEqual(HALF);
    expect(first.x).toBeLessThanOrEqual(AREA_SIZE_X - HALF);
    expect(first.z).toBeGreaterThanOrEqual(HALF);
    expect(first.z).toBeLessThanOrEqual(AREA_SIZE_Z - HALF);
    expect(first.y).toBeGreaterThanOrEqual(0);
  });
});
