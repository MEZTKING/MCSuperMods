import { describe, expect, it } from 'vitest';
import {
  AREA_SIZE_X,
  AREA_SIZE_Z,
  BlockTimers,
  buildEntityCatalogue,
  ENTITY_CAP,
  type EntitySnapshot,
  HOVER_MIN,
  placeBlock,
} from '../../src/index.js';
import { FAKE_TARGET, placeOn, testLog } from '../blocks/helpers.js';
import { mob, mobFiles, onFloor, setUpMobs } from './helpers.js';

/** Spawns a few mobs of every style around the area, with a wall of blocks in the middle. */
function busyArea(seed: number) {
  const ctx = setUpMobs({ seed });
  for (let x = 10; x < 30; x++) {
    placeBlock(ctx.world, ctx.blocks, placeOn('cube', { x, y: -1, z: 24 }));
  }
  const types = ['cow', 'bee', 'parrot', 'fish', 'frog', 'cow', 'cow', 'bee'];
  types.forEach((type, i) => {
    const result = ctx.entities.spawn(mob(type), onFloor(4 + i * 5, 4 + ((i * 7) % 40)));
    expect(result.spawned).toBe(true);
  });
  return ctx;
}

function run(seed: number, ticks: number): EntitySnapshot[][] {
  const { entities } = busyArea(seed);
  return Array.from({ length: ticks }, () => entities.step());
}

describe('a seeded run', () => {
  it('repeats exactly over 600 ticks', () => {
    const a = run(1234, 600);
    const b = run(1234, 600);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a[599]).toHaveLength(8);
  });

  it('walks another way with another seed', () => {
    expect(JSON.stringify(run(99, 600))).not.toBe(JSON.stringify(run(1234, 600)));
  });

  it('has mobs walking and standing', () => {
    const ticks = run(1234, 600);
    const cow = (frame: EntitySnapshot[]) => frame.find((s) => s.type === mob('cow'));
    expect(ticks.some((frame) => cow(frame)?.walking === true)).toBe(true);
    expect(ticks.some((frame) => cow(frame)?.walking === false)).toBe(true);
    const moved = ticks[599]?.filter((s) => s.type === mob('cow')) ?? [];
    expect(moved.some((s) => s.position.x !== 4.5 || s.position.z !== 4.5)).toBe(true);
  });
});

describe('the area', () => {
  it('keeps every mob inside it, even spawned in the corners', () => {
    const { entities } = setUpMobs({ seed: 7 });
    const corners = [0, AREA_SIZE_X - 1];
    const types = ['cow', 'bee', 'parrot', 'frog', 'fish'];
    let i = 0;
    while (entities.count < ENTITY_CAP) {
      const x = corners[i % 2] as number;
      const z = corners[Math.floor(i / 2) % 2] as number;
      entities.spawn(mob(types[i % types.length] as string), onFloor(x, z));
      i++;
    }
    // Checked in a plain loop and asserted once: 600 ticks of 24 mobs are 72,000 checks, and an
    // expect() for each took this test past its timeout on a loaded CI machine.
    const outside: { tick: number; box: readonly number[] }[] = [];
    for (let t = 0; t < 600; t++) {
      entities.step();
      for (const box of entities.boxes()) {
        const [minX = 0, minY = 0, minZ = 0, maxX = 0, , maxZ = 0] = box;
        if (minX < 0 || minY < 0 || minZ < 0 || maxX > AREA_SIZE_X || maxZ > AREA_SIZE_Z) {
          outside.push({ tick: t, box: [...box] });
        }
      }
    }
    expect(outside).toEqual([]);
    expect(entities.count).toBe(ENTITY_CAP);
  });

  it('refuses to spawn outside the area', () => {
    const { entities, log } = setUpMobs();
    const result = entities.spawn(mob('cow'), { pos: { x: 0, y: 0, z: 5 }, face: 'west' });
    expect(result).toEqual({
      spawned: false,
      reason: 'There is no room in the area for Moo Cow there',
    });
    expect(log.lines).toEqual(['There is no room in the area for Moo Cow there.']);
  });

  it('stands a walker on top of a block it was spawned into', () => {
    const { world, blocks, entities } = setUpMobs();
    placeBlock(world, blocks, placeOn('cube', { x: 5, y: -1, z: 5 }));
    const result = entities.spawn(mob('cow'), { pos: { x: 5, y: -1, z: 5 }, face: 'up' });
    expect(result.spawned && result.entity.position.y).toBe(1);
  });
});

describe('the cap', () => {
  it(`holds at most ${ENTITY_CAP} mobs`, () => {
    const { entities, log } = setUpMobs();
    for (let i = 0; i < ENTITY_CAP; i++) {
      expect(entities.spawn(mob('cow'), onFloor(i, 10)).spawned).toBe(true);
    }
    const refused = entities.spawn(mob('bee'), onFloor(30, 30));
    expect(refused.spawned).toBe(false);
    expect(entities.count).toBe(ENTITY_CAP);
    expect(log.lines.at(-1)).toBe(
      'The preview holds at most 24 mobs; hit one to remove it before spawning Buzzy Bee.',
    );
    expect(entities.hit(1)).toBe(true);
    expect(entities.spawn(mob('bee'), onFloor(30, 30)).spawned).toBe(true);
  });
});

describe('spawning and hitting', () => {
  it('spawns from an egg and refuses what is not one', () => {
    const { entities } = setUpMobs();
    const egg = entities.spawnFromEgg('zoo:cow_spawn_egg', onFloor(3, 3));
    expect(egg.spawned && egg.entity).toMatchObject({
      id: 1,
      type: 'zoo:cow',
      position: { x: 3.5, y: 0, z: 3.5 },
      pitch: 0,
      walking: false,
    });
    expect(entities.spawnFromEgg('zoo:fish_spawn_egg', onFloor(3, 3)).spawned).toBe(false);
    expect(entities.spawn('zoo:unicorn', onFloor(3, 3)).spawned).toBe(false);
  });

  it('removes a mob hit by a pointing ray, with log lines', () => {
    const { entities, log } = setUpMobs();
    entities.spawn(mob('cow'), onFloor(10, 10));
    entities.spawn(mob('cow'), onFloor(10, 14));
    const hit = entities.pick({ x: 10.5, y: 1, z: 7 }, { x: 0, y: 0, z: 1 });
    expect(hit).toEqual({ id: 1, distance: expect.closeTo(3.05, 5) });
    expect(entities.pick({ x: 10.5, y: 1, z: 7 }, { x: 0, y: 0, z: -1 })).toBeNull();
    expect(entities.hit(hit?.id ?? 0)).toBe(true);
    expect(entities.hit(hit?.id ?? 0)).toBe(false);
    expect(entities.snapshots().map((s) => s.id)).toEqual([2]);
    expect(log.lines.at(-1)).toBe('You hit Moo Cow; it is gone from the preview.');
    expect(log.only.at(-1)).toBe(
      "Moo Cow's health, hurting, death and drops; a hit in the preview removes it",
    );
    entities.hit(2);
    expect(log.only.filter((line) => line.includes('a hit'))).toHaveLength(1);
  });

  it('says once per type what only the game does', () => {
    const { entities, log } = setUpMobs();
    entities.spawn(mob('cow'), onFloor(3, 3));
    entities.spawn(mob('cow'), onFloor(5, 3));
    entities.spawn(mob('bee'), onFloor(7, 3));
    expect(log.lines).toEqual([
      'You spawned Moo Cow.',
      'You spawned Moo Cow.',
      'You spawned Buzzy Bee.',
    ]);
    expect(log.only).toEqual([
      "Moo Cow's goals (panic, look around), breeding and babies and natural spawning; in the preview it only wanders",
    ]);
  });
});

describe('flyers', () => {
  it('rise to a height above the ground and hover there', () => {
    const { entities } = setUpMobs({ seed: 3 });
    entities.spawn(mob('bee'), onFloor(20, 20));
    const ys: number[] = [];
    for (let t = 0; t < 600; t++) ys.push(entities.step()[0]?.position.y ?? 0);
    expect(Math.min(...ys.slice(100))).toBeGreaterThanOrEqual(HOVER_MIN - 0.05);
    const bee = entities.entities()[0];
    expect(bee?.onGround).toBe(false);
    // Standing still in the air: it holds its height.
    let still = 0;
    for (let t = 0; t < 600; t++) {
      const before = bee?.position.y ?? 0;
      entities.step();
      if (!bee?.walking && Math.abs((bee?.position.y ?? 0) - before) < 1e-3) still++;
    }
    expect(still).toBeGreaterThan(50);
  });

  it('settle on the ground while standing when they do not hover', () => {
    const { entities } = setUpMobs({ seed: 3 });
    entities.spawn(mob('parrot'), onFloor(20, 20));
    let grounded = 0;
    for (let t = 0; t < 600; t++) {
      entities.step();
      if (entities.entities()[0]?.onGround) grounded++;
    }
    expect(grounded).toBeGreaterThan(0);
  });
});

describe('swimmers', () => {
  it('stand still and say once that they swim only in the game', () => {
    const { entities, log } = setUpMobs();
    entities.spawn(mob('fish'), onFloor(8, 8));
    entities.spawn(mob('fish'), onFloor(9, 8));
    for (let t = 0; t < 600; t++) {
      for (const s of entities.step()) expect(s.walking).toBe(false);
    }
    expect(entities.snapshots()[0]?.position).toEqual({ x: 8.5, y: 0, z: 8.5 });
    expect(log.only).toEqual(['Fish swims; in the preview it stands still']);
  });

  it('walk amphibians on land with a line', () => {
    const { entities, log } = setUpMobs();
    entities.spawn(mob('frog'), onFloor(8, 8));
    expect(log.only).toEqual(['Frog swims; in the preview it only walks on land']);
  });
});

describe('with blocks', () => {
  it('presses a pressure plate through BlockTimers', () => {
    const { world, blocks, entities } = setUpMobs();
    placeBlock(world, blocks, placeOn('plate', { x: 6, y: -1, z: 6 }));
    entities.spawn(mob('fish'), onFloor(6, 6));
    const timers = new BlockTimers(world, blocks);
    timers.tick(entities.boxes());
    expect(world.get({ x: 6, y: 0, z: 6 })?.properties.powered).toBe('true');
  });

  it('tells the view when a block would overlap a mob', () => {
    const { blocks, entities } = setUpMobs();
    entities.spawn(mob('fish'), onFloor(6, 6));
    const cube = blocks.defaultState('test:cube');
    expect(cube).toBeDefined();
    if (cube === undefined) return;
    expect(entities.wouldOverlap({ x: 6, y: 0, z: 6 }, cube)).toBe(true);
    expect(entities.wouldOverlap({ x: 7, y: 0, z: 6 }, cube)).toBe(false);
  });

  it('lifts a mob out of a block placed into it', () => {
    const { world, blocks, entities } = setUpMobs();
    entities.spawn(mob('fish'), onFloor(6, 6));
    const cube = blocks.defaultState('test:cube');
    if (cube !== undefined) world.set({ x: 6, y: 0, z: 6 }, cube);
    entities.step();
    expect(entities.snapshots()[0]?.position.y).toBe(1);
  });

  it('stops walking at a wall', () => {
    const { world, blocks, entities } = setUpMobs({ seed: 11 });
    const cube = blocks.defaultState('test:cube');
    // A pen of two-high walls around (20..22, 20..22).
    for (let y = 0; y < 2; y++) {
      for (let i = 19; i <= 23; i++) {
        for (const [x, z] of [
          [i, 19],
          [i, 23],
          [19, i],
          [23, i],
        ] as const) {
          if (cube !== undefined) world.set({ x, y, z }, cube);
        }
      }
    }
    entities.spawn(mob('cow'), onFloor(21, 21));
    for (let t = 0; t < 600; t++) {
      const s = entities.step()[0];
      expect(s?.position.x).toBeGreaterThan(20);
      expect(s?.position.x).toBeLessThan(23);
      expect(s?.position.z).toBeGreaterThan(20);
      expect(s?.position.z).toBeLessThan(23);
    }
  });
});

describe('live edits and clearing', () => {
  it('takes out mobs whose type is gone and keeps the rest', () => {
    const { entities, log } = setUpMobs();
    entities.spawn(mob('cow'), onFloor(3, 3));
    entities.spawn(mob('bee'), onFloor(6, 3));
    const files = mobFiles();
    files.delete('msm/zoo/entity/cow.json');
    entities.setCatalogue(buildEntityCatalogue(files, FAKE_TARGET, testLog()));
    expect(entities.snapshots().map((s) => s.type)).toEqual(['zoo:bee']);
    expect(log.lines.at(-1)).toBe(
      'Moo Cow is no longer in the project; it was taken out of the preview.',
    );
  });

  it('clears and keeps counting ids', () => {
    const { entities } = setUpMobs();
    entities.spawn(mob('cow'), onFloor(3, 3));
    entities.clear();
    expect(entities.count).toBe(0);
    const again = entities.spawn(mob('cow'), onFloor(3, 3));
    expect(again.spawned && again.entity.id).toBe(2);
    expect(entities.remove(2)).toBe(true);
  });
});
