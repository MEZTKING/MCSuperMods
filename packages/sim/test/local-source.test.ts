import { describe, expect, it } from 'vitest';
import {
  IDLE_INPUT,
  LocalWorldSource,
  pickFloor,
  SimWorld,
  type WorldEvent,
} from '../src/index.js';
import { FAKE_TARGET, testFiles } from './blocks/helpers.js';
import { MOBS, mobFiles } from './entities/helpers.js';

/** The block test project and the mob test project in one set of files. */
function files(extra: Record<string, string> = {}): Map<string, string> {
  const out = new Map<string, string>([...testFiles(), ...mobFiles()]);
  for (const [path, text] of Object.entries(extra)) out.set(path, text);
  return out;
}

function source(): { source: LocalWorldSource; events: WorldEvent[] } {
  const made = new LocalWorldSource({ files: files(), target: FAKE_TARGET, seed: 7 });
  const events: WorldEvent[] = [];
  made.subscribe((event) => events.push(event));
  return { source: made, events };
}

const floor = (x: number, z: number) => ({ x, y: -1, z });
const up = { x: 0.5, y: 1, z: 0.5 };

describe('LocalWorldSource', () => {
  it('starts in the middle of the area with nothing in it', () => {
    const { source: s } = source();
    expect(s.player.position).toEqual({ x: 24.5, y: 0, z: 24.5 });
    expect(s.world.count).toBe(0);
    expect(s.entities.count).toBe(0);
  });

  it('places, uses and breaks blocks, sending a change for each', () => {
    const { source: s, events } = source();
    s.act({ type: 'place', pos: floor(10, 10), face: 'up', hit: up, block: 'test:cube' });
    expect(s.world.get({ x: 10, y: 0, z: 10 })?.name).toBe('test:cube');
    expect(events.filter((e) => e.type === 'blockChanged')).toHaveLength(1);
    s.act({ type: 'break', pos: { x: 10, y: 0, z: 10 } });
    expect(s.world.count).toBe(0);
  });

  it('decides what a right click does: use a door, place a held block, hatch an egg', () => {
    const { source: s } = source();
    s.act({ type: 'use', pos: floor(5, 5), face: 'up', hit: up, item: 'test:door' });
    expect(s.world.count).toBe(2);
    s.act({ type: 'use', pos: { x: 5, y: 0, z: 5 }, face: 'north', hit: up, item: 'test:cube' });
    expect(s.world.get({ x: 5, y: 0, z: 5 })?.properties.open).toBe('true');
    expect(s.world.count).toBe(2);
    s.act({ type: 'use', pos: floor(8, 8), face: 'up', hit: up, item: 'zoo:cow_spawn_egg' });
    expect(s.entities.count).toBe(1);
    s.act({ type: 'use', pos: floor(9, 9), face: 'up', hit: up, item: 'zoo:nothing' });
    expect(s.lines.at(-1)?.text).toBe('zoo:nothing is not a block or a spawn egg of the project');
  });

  it('refuses a block where the player or a mob stands', () => {
    const { source: s } = source();
    s.act({ type: 'place', pos: floor(24, 24), face: 'up', hit: up, block: 'test:cube' });
    expect(s.world.count).toBe(0);
    expect(s.lines.at(-1)?.text).toContain('you or a mob stand where it would go');
    s.act({ type: 'use', pos: floor(30, 30), face: 'up', hit: up, item: 'zoo:cow_spawn_egg' });
    s.act({ type: 'place', pos: floor(30, 30), face: 'up', hit: up, block: 'test:cube' });
    expect(s.world.count).toBe(0);
  });

  it('steps the player and the mobs each tick and sends their snapshots', () => {
    const { source: s, events } = source();
    s.act({ type: 'use', pos: floor(30, 30), face: 'up', hit: up, item: 'zoo:cow_spawn_egg' });
    s.act({ type: 'move', ...IDLE_INPUT, forward: 1 });
    for (let i = 0; i < 10; i += 1) s.tick();
    expect(s.player.position.z).toBeGreaterThan(24.5);
    const last = events.filter((e) => e.type === 'entities').at(-1);
    expect(last?.type === 'entities' && last.entities).toHaveLength(1);
    expect(s.ticksRun).toBe(10);
  });

  it('counts toggleFly once', () => {
    const { source: s } = source();
    s.act({ type: 'move', ...IDLE_INPUT, toggleFly: true });
    s.tick();
    expect(s.player.flying).toBe(true);
    s.tick();
    expect(s.player.flying).toBe(true);
  });

  it('presses a plate under the player and lets a button go', () => {
    const { source: s } = source();
    s.act({ type: 'place', pos: floor(3, 3), face: 'up', hit: up, block: 'test:cube' });
    s.act({
      type: 'place',
      pos: { x: 3, y: 0, z: 3 },
      face: 'south',
      hit: { x: 0.5, y: 0.5, z: 1 },
      block: 'test:button',
    });
    s.act({ type: 'use', pos: { x: 3, y: 0, z: 4 }, face: 'south', hit: up });
    expect(s.world.get({ x: 3, y: 0, z: 4 })?.properties.powered).toBe('true');
    expect(s.pendingTimers).toBe(1);
    for (let i = 0; i < 40; i += 1) s.tick();
    expect(s.world.get({ x: 3, y: 0, z: 4 })?.properties.powered).toBe('false');
  });

  it('uses the Grow and Power tools', () => {
    const { source: s } = source();
    s.act({ type: 'place', pos: floor(6, 6), face: 'up', hit: up, block: 'test:crop' });
    s.act({ type: 'tool', tool: 'grow', pos: { x: 6, y: 0, z: 6 } });
    expect(s.world.get({ x: 6, y: 0, z: 6 })?.properties.age).toBe('1');
    s.act({ type: 'tool', tool: 'power', pos: { x: 6, y: 0, z: 6 } });
    expect(s.lines.some((line) => line.onlyInMinecraft)).toBe(true);
  });

  it('points at the floor, a block or a nearer mob', () => {
    const { source: s } = source();
    // Looking down at 45 degrees from the eye (1.62 high) meets the floor 1.62 blocks ahead.
    const look = { alpha: 1, yaw: 0, pitch: 45 };
    const atFloor = s.pointedAt(look);
    expect(atFloor?.kind).toBe('block');
    expect(atFloor?.kind === 'block' && atFloor.block.pos).toEqual({ x: 24, y: -1, z: 26 });
    s.act({ type: 'place', pos: floor(24, 26), face: 'up', hit: up, block: 'test:cube' });
    const atBlock = s.pointedAt(look);
    expect(atBlock?.kind === 'block' && atBlock.block.pos).toEqual({ x: 24, y: 0, z: 26 });
    s.act({ type: 'break', pos: { x: 24, y: 0, z: 26 } });
    s.act({ type: 'use', pos: floor(24, 26), face: 'up', hit: up, item: 'zoo:cow_spawn_egg' });
    const atMob = s.pointedAt(look);
    expect(atMob?.kind).toBe('entity');
    if (atMob?.kind === 'entity') s.act({ type: 'hit', entity: atMob.entity.id });
    expect(s.entities.count).toBe(0);
  });

  it('keeps the world on new files, drops removed blocks and falls back on lost states', () => {
    const { source: s } = source();
    s.act({ type: 'place', pos: floor(2, 2), face: 'up', hit: up, block: 'test:cube' });
    s.act({ type: 'place', pos: floor(4, 4), face: 'up', hit: up, block: 'test:crop' });
    s.act({ type: 'tool', tool: 'grow', pos: { x: 4, y: 0, z: 4 } });
    s.act({ type: 'tool', tool: 'grow', pos: { x: 4, y: 0, z: 4 } });
    s.act({ type: 'use', pos: floor(10, 10), face: 'up', hit: up, item: 'zoo:cow_spawn_egg' });
    s.act({ type: 'use', pos: floor(14, 14), face: 'up', hit: up, item: 'zoo:bee_spawn_egg' });
    const next = files({
      'msm/test/block/crop.json': JSON.stringify({ format: 1, type: 'crop', max_age: 1 }),
    });
    next.delete('msm/test/block/cube.json');
    next.delete('msm/zoo/entity/bee.json');
    s.setFiles(next);
    expect(s.world.get({ x: 2, y: 0, z: 2 })).toBeNull();
    expect(s.world.get({ x: 4, y: 0, z: 4 })?.properties.age).toBe('0');
    expect(s.entities.count).toBe(1);
    expect(s.lines.map((line) => line.text)).toContain(
      'Cube is no longer in the project; it was taken out of the preview.',
    );
  });

  it('says each "Only in Minecraft" line once, also after a rebuild', () => {
    const { source: s } = source();
    const before = s.lines.filter((line) => line.onlyInMinecraft).length;
    s.setFiles(files());
    expect(s.lines.filter((line) => line.onlyInMinecraft).length).toBe(before);
  });

  it('clears blocks, mobs and timers', () => {
    const { source: s, events } = source();
    s.act({ type: 'place', pos: floor(3, 3), face: 'up', hit: up, block: 'test:cube' });
    s.act({ type: 'use', pos: floor(10, 10), face: 'up', hit: up, item: 'zoo:cow_spawn_egg' });
    s.act({ type: 'clear' });
    expect(s.world.count).toBe(0);
    expect(s.entities.count).toBe(0);
    expect(s.pendingTimers).toBe(0);
    expect(events.at(-1)).toMatchObject({ type: 'log', line: { text: 'You cleared the area.' } });
  });

  it('keeps at most the log limit', () => {
    const made = new LocalWorldSource({ files: files(), target: FAKE_TARGET, logLimit: 3 });
    for (let i = 0; i < 5; i += 1) made.log.info(`line ${i}`);
    expect(made.lines.map((line) => line.text)).toEqual(['line 2', 'line 3', 'line 4']);
  });

  it('runs the same way twice with the same seed', () => {
    const run = (): string => {
      const made = new LocalWorldSource({ files: files(), target: FAKE_TARGET, seed: 3 });
      made.act({ type: 'use', pos: floor(20, 20), face: 'up', hit: up, item: 'zoo:cow_spawn_egg' });
      for (let i = 0; i < 200; i += 1) made.tick();
      return JSON.stringify(made.entities.snapshots());
    };
    expect(run()).toBe(run());
  });
});

describe('pickFloor', () => {
  it('finds the floor below a downward look inside the area only', () => {
    const world = new SimWorld();
    expect(pickFloor(world, { x: 1.5, y: 1, z: 1.5 }, { x: 0, y: -1, z: 0 })?.pos).toEqual({
      x: 1,
      y: -1,
      z: 1,
    });
    expect(pickFloor(world, { x: 1.5, y: 1, z: 1.5 }, { x: 0, y: 1, z: 0 })).toBeNull();
    expect(pickFloor(world, { x: -3, y: 1, z: 1 }, { x: 0, y: -1, z: 0 })).toBeNull();
    expect(pickFloor(world, { x: 1, y: 10, z: 1 }, { x: 0, y: -1, z: 0 })).toBeNull();
  });
});

// The mob test project is used through its files.
void MOBS;
