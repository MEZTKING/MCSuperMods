/**
 * Mobs 2 in Try it (B540, ADR 0109 as amended after B524, the runtime's B532): fish buckets,
 * both shoulders, hovering, and project boats as vehicles of the preview (ADR 0110).
 */
import type { Json, Target } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  BOAT_WIDTH,
  boatLookOf,
  buildEntityCatalogue,
  LocalWorldSource,
  readBoats,
  SHOULDER_COOLDOWN,
  type SimFiles,
  shoulderSeat,
} from '../../src/index.js';
import { builtInTargets } from '../lower-fixture.js';

const [target] = (await builtInTargets()) as [Target];
const UP = { x: 0.5, y: 1, z: 0.5 };
const floor = (x: number, z: number) => ({ x, y: -1, z });
const QUIET = { info: () => {}, onlyInMinecraft: () => {} };

const mob = (components: Json, size = { width: 0.5, height: 0.5 }): Json => ({
  format: 1,
  size,
  components,
});

function files(): SimFiles {
  const out = new Map<string, string>();
  const put = (path: string, json: Json) => out.set(path, JSON.stringify(json));
  put('msm/m2/entity/koi.json', mob({ 'msm:movement': { mode: 'swim' }, 'msm:bucketable': {} }));
  put(
    'msm/m2/entity/dry_koi.json',
    mob({ 'msm:movement': { mode: 'swim' }, 'msm:bucketable': { water: false } }),
  );
  put('msm/m2/entity/mole.json', mob({ 'msm:bucketable': {} }));
  put('msm/m2/entity/finch.json', mob({ 'msm:shoulder_riding': {} }));
  put('msm/m2/entity/wren.json', mob({ 'msm:shoulder_riding': {} }));
  put('msm/m2/entity/robin.json', mob({ 'msm:shoulder_riding': { sides: 'left' } }));
  put(
    'msm/m2/entity/wisp.json',
    mob({ 'msm:movement': { mode: 'hover', hover_height: 3 } }, { width: 1, height: 1 }),
  );
  put('msm/m2/entity/vexling.json', mob({ 'msm:movement': { mode: 'phase' } }));
  put('msm/m2/item/maple_boat.json', {
    format: 1,
    components: { 'msm:boat': { chest: true } },
  });
  put('msm/m2/item/reed_raft.json', { format: 1, components: { 'msm:boat': { raft: true } } });
  put('assets/m2/lang/en_us.json', {
    'entity.m2.koi': 'Koi',
    'item.m2.koi_bucket': 'Bucket of Koi',
    'entity.m2.finch': 'Finch',
    'entity.m2.wren': 'Wren',
    'entity.m2.robin': 'Robin',
    'item.m2.maple_boat': 'Maple Boat',
  });
  return out;
}

function spawn(source: LocalWorldSource, type: string, x: number, z: number): number {
  const before = new Set(source.entities.entities().map((one) => one.id));
  source.act({ type: 'use', pos: floor(x, z), face: 'up', hit: UP, item: `${type}_spawn_egg` });
  const made = source.entities.entities().find((one) => !before.has(one.id));
  if (made === undefined) throw new Error(`${type} did not hatch`);
  return made.id;
}

const move = (source: LocalWorldSource, sneak: boolean) =>
  source.act({
    type: 'move',
    forward: 0,
    strafe: 0,
    jump: false,
    sneak,
    toggleFly: false,
    yaw: 0,
    pitch: 0,
  });

const texts = (source: LocalWorldSource) => source.lines.map((line) => line.text);

describe('the batch 2 mob catalogue', () => {
  it('reads buckets, shoulders and the flight modes', () => {
    const catalogue = buildEntityCatalogue(files(), target, QUIET);
    expect(catalogue.get('m2:koi')?.bucket).toEqual({
      item: 'm2:koi_bucket',
      name: 'Bucket of Koi',
      water: true,
    });
    expect(catalogue.get('m2:dry_koi')?.bucket?.water).toBe(false);
    // A bucket only for a swimming mob (limit N12).
    expect(catalogue.get('m2:mole')?.bucket).toBeUndefined();
    expect(catalogue.get('m2:finch')?.shoulder).toBe('either');
    expect(catalogue.get('m2:robin')?.shoulder).toBe('left');
    expect(catalogue.get('m2:wisp')).toMatchObject({ mode: 'hover', hoverHeight: 3 });
    expect(catalogue.get('m2:vexling')?.mode).toBe('phase');
    expect(catalogue.entityForBucket('m2:koi_bucket')?.id).toBe('m2:koi');
  });
});

describe('fish buckets', () => {
  it('catch a fish with a water bucket and let a new one out with its water', () => {
    const source = new LocalWorldSource({ files: files(), target, seed: 4 });
    const koi = spawn(source, 'm2:koi', 24, 20);
    source.act({ type: 'interact', entity: koi, item: 'minecraft:water_bucket' });
    expect(source.entities.entity(koi)).toBeUndefined();
    expect(source.inventory.count('m2:koi_bucket')).toBe(1);
    expect(texts(source)).toContain('You caught Koi in Bucket of Koi.');
    source.act({ type: 'use', pos: floor(20, 20), face: 'up', hit: UP, item: 'm2:koi_bucket' });
    expect(source.world.get({ x: 20, y: 0, z: 20 })?.name).toBe('minecraft:water');
    expect(source.entities.entities().map((one) => one.kind.id)).toEqual(['m2:koi']);
    expect(texts(source)).toContain('You let Koi out of Bucket of Koi with its water.');
    expect(
      source.lines.some(
        (line) => line.onlyInMinecraft && line.text.includes("keeps Koi's name, health and look"),
      ),
    ).toBe(true);
  });

  it('take a dry fish with an empty bucket and not with water', () => {
    const source = new LocalWorldSource({ files: files(), target, seed: 4 });
    const dry = spawn(source, 'm2:dry_koi', 24, 20);
    source.act({ type: 'interact', entity: dry, item: 'minecraft:water_bucket' });
    expect(source.entities.entity(dry)).toBeDefined();
    source.act({ type: 'interact', entity: dry, item: 'minecraft:bucket' });
    expect(source.entities.entity(dry)).toBeUndefined();
    source.act({ type: 'use', pos: floor(20, 20), face: 'up', hit: UP, item: 'm2:dry_koi_bucket' });
    expect(source.world.get({ x: 20, y: 0, z: 20 })).toBeNull();
    expect(source.entities.count).toBe(1);
  });
});

describe('shoulder pets', () => {
  it('take the right shoulder first, then the left, and get off when you sneak', () => {
    const source = new LocalWorldSource({ files: files(), target, seed: 4 });
    const finch = spawn(source, 'm2:finch', 24, 21);
    const wren = spawn(source, 'm2:wren', 23, 21);
    const robin = spawn(source, 'm2:robin', 25, 21);
    source.act({ type: 'interact', entity: finch });
    expect(source.mobs2.shoulders.get('right')).toBe(finch);
    source.act({ type: 'interact', entity: wren });
    expect(source.mobs2.shoulders.get('left')).toBe(wren);
    source.act({ type: 'interact', entity: robin });
    expect(texts(source).at(-1)).toBe(
      'Both your shoulders are taken; Robin waits for one to be free.',
    );
    source.tick();
    const seat = shoulderSeat(source.player, 'right');
    expect(source.entities.entity(finch)?.position).toEqual(seat.position);
    // Facing south, the right shoulder is to the west (smaller x).
    expect(seat.position.x).toBeLessThan(source.player.position.x);
    expect(seat.position.y).toBeCloseTo(source.player.box[4] - 0.45, 6);

    move(source, true);
    source.tick();
    expect(source.mobs2.shoulders.size).toBe(0);
    expect(texts(source)).toContain('You sneaked: Finch got off your right shoulder.');
    move(source, false);
    source.tick();
    source.act({ type: 'interact', entity: finch });
    expect(source.mobs2.shoulders.size).toBe(0);
    expect(texts(source).at(-1)).toContain('waits');
    for (let i = 0; i < SHOULDER_COOLDOWN; i += 1) source.tick();
    source.act({ type: 'interact', entity: robin });
    expect(source.mobs2.shoulders.get('left')).toBe(robin);
  });
});

describe('hovering', () => {
  it('keeps its hover height over the ground below without bobbing', () => {
    const source = new LocalWorldSource({ files: files(), target, seed: 4 });
    const wisp = spawn(source, 'm2:wisp', 24, 20);
    for (let i = 0; i < 200; i += 1) source.tick();
    const heights: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      source.tick();
      heights.push(source.entities.entity(wisp)?.position.y ?? -1);
    }
    for (const y of heights) expect(y).toBeCloseTo(3, 1);
  });
});

describe('project boats', () => {
  it('are vehicles placed on water and ridden, with their chest boat', () => {
    const boats = readBoats(files(), target);
    expect(boats.map((one) => [one.id, one.displayName, one.seats.length])).toEqual([
      ['m2:maple_boat', 'Maple Boat', 2],
      ['m2:maple_chest_boat', 'Maple Boat with Chest', 1],
      ['m2:reed_raft', 'Reed Raft', 2],
    ]);
    expect(boatLookOf(boats[1] as never)).toEqual({
      boat: 'm2:maple_boat',
      chest: true,
      raft: false,
    });
    expect(boats[0]?.width).toBe(BOAT_WIDTH);

    const source = new LocalWorldSource({ files: files(), target, seed: 4 });
    expect(source.vehicles.types.ids()).toContain('m2:maple_boat');
    // On the floor it is refused; on water poured from a bucket it goes.
    source.act({ type: 'use', pos: floor(24, 20), face: 'up', hit: UP, item: 'm2:maple_boat' });
    expect(source.vehicles.count).toBe(0);
    source.act({
      type: 'use',
      pos: floor(24, 20),
      face: 'up',
      hit: UP,
      item: 'minecraft:water_bucket',
    });
    source.act({ type: 'use', pos: floor(24, 20), face: 'up', hit: UP, item: 'm2:maple_boat' });
    expect(source.vehicles.snapshots().map((one) => one.type)).toEqual(['m2:maple_boat']);
    const boat = source.vehicles.snapshots()[0];
    if (boat === undefined) throw new Error('no boat');
    // Get in and out: Shift gets out.
    source.act({ type: 'useVehicle', vehicle: boat.id });
    expect(source.vehicles.riding).toBe(boat.id);
    move(source, true);
    source.tick();
    expect(source.vehicles.riding).toBeNull();
    expect(source.lines.some((line) => line.text.includes("Maple Boat is vanilla's boat"))).toBe(
      true,
    );
  });
});
