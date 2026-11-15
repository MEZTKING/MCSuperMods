/**
 * Vehicles in the Try it area (B428): the catalogue's defaults, placing from the item, getting
 * in and out, driving with the movement keys through the physics twin, collision and step
 * height, water, fuel, damage, pick-up, events and what is said as "Only in Minecraft".
 */
import type { Json } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  buildVehicleCatalogue,
  hullToWorld,
  IDLE_INPUT,
  LocalWorldSource,
  type PlayerInput,
  rayBox,
  resolveMovement,
  type SimFiles,
  vehicleBox,
} from '../../src/index.js';
import { FAKE_TARGET, testFiles } from '../blocks/helpers.js';

const NS = 'vh';

const event = (...actions: Json[]): Json => ({ actions });

const KART: Json = {
  format: 1,
  model: { geometry: `${NS}:entity/kart`, texture: `${NS}:entity/kart` },
  size: [1.2, 0.6],
  movement: { mode: 'ground', max_speed: 0.5, acceleration: 0.03, turn_rate: 6, grip: 0.9 },
  seats: [{ offset: [0, 0.2, -0.1] }],
  health: { max: 3 },
  camera: { distance: 4 },
  events: {
    placed: event({ type: 'play_sound', sound: 'minecraft:block.anvil.land' }),
    in: event({ type: 'give_item', item: `${NS}:key`, count: 1 }),
    out: event({ type: 'play_sound', sound: 'minecraft:block.chest.close' }),
    gone: event({ type: 'explode', power: 2 }),
    driving: event({ type: 'play_sound', sound: 'minecraft:entity.minecart.riding' }),
  },
  on_place: 'placed',
  on_mount: 'in',
  on_dismount: 'out',
  on_destroy: 'gone',
  on_tick: { event: 'driving', interval: 5 },
};

const CAR: Json = {
  format: 1,
  model: {
    geometry: `${NS}:entity/car`,
    texture: `${NS}:entity/car`,
    paints: [{ id: 'red', texture: `${NS}:entity/car_red`, dye: 'minecraft:red_dye' }],
  },
  movement: { mode: 'ground' },
  engine: {
    fuel: { items: [{ item: 'minecraft:coal', ticks: 100 }] },
    start_sound: 'minecraft:block.piston.extend',
  },
  health: { explodes: 2, repair: [{ item: 'minecraft:iron_ingot', amount: 10 }] },
  weapons: [{ id: 'gun', projectile: 'minecraft:arrow' }],
  storage: { rows: 1 },
  exhaust: { particle: 'minecraft:smoke', offset: [0, 0.3, -1], every_ticks: 2 },
};

const BOAT: Json = {
  format: 1,
  model: { geometry: `${NS}:entity/boat`, texture: `${NS}:entity/boat` },
  movement: { mode: 'water' },
};

const TANK: Json = {
  format: 1,
  model: { geometry: `${NS}:entity/tank`, texture: `${NS}:entity/tank` },
  size: [3, 1.6],
  movement: { mode: 'ground', turns_in_place: true },
  turret: { bone: 'turret', yaw_limit: [-90, 90], turn_rate: 10 },
};

function files(extra: Record<string, Json> = {}): SimFiles {
  const out = testFiles();
  const vehicles: Record<string, Json> = { kart: KART, car: CAR, boat: BOAT, tank: TANK, ...extra };
  for (const [path, definition] of Object.entries(vehicles)) {
    out.set(`msm/${NS}/vehicle/${path}.json`, JSON.stringify(definition));
  }
  out.set(
    `assets/${NS}/lang/en_us.json`,
    JSON.stringify({ 'entity.vh.kart': 'Go-kart', 'item.vh.car': 'Family Car' }),
  );
  return out;
}

function source(extra: Record<string, Json> = {}): LocalWorldSource {
  return new LocalWorldSource({ files: files(extra), target: FAKE_TARGET, seed: 3 });
}

const floor = (x: number, z: number) => ({ x, y: -1, z });
const up = { x: 0.5, y: 1, z: 0.5 };

/** Holds `input` for `ticks` ticks. */
function drive(s: LocalWorldSource, input: Partial<PlayerInput>, ticks: number): void {
  s.act({ type: 'move', ...IDLE_INPUT, ...input });
  for (let i = 0; i < ticks; i += 1) s.tick();
}

/** Places a vehicle from its item on the floor at x, z (the player faces south, yaw 0). */
function place(s: LocalWorldSource, item: string, x = 24, z = 30): number {
  s.act({ type: 'use', pos: floor(x, z), face: 'up', hit: up, item });
  const snapshot = s.vehicles.snapshots().at(-1);
  if (snapshot === undefined) throw new Error(`${item} was not placed: ${s.lines.at(-1)?.text}`);
  return snapshot.id;
}

const texts = (s: LocalWorldSource): string[] => s.lines.map((line) => line.text);
const onlyInMinecraft = (s: LocalWorldSource): string[] =>
  s.lines.filter((line) => line.onlyInMinecraft).map((line) => line.text);

describe('vehicle catalogue', () => {
  it('resolves the defaults as the runtime does', () => {
    const catalogue = buildVehicleCatalogue(files(), FAKE_TARGET);
    expect(catalogue.ids()).toEqual(['vh:boat', 'vh:car', 'vh:kart', 'vh:tank']);
    const kart = catalogue.get('vh:kart');
    expect(kart?.displayName).toBe('Go-kart');
    expect(kart?.constants).toEqual(
      resolveMovement({
        mode: 'ground',
        max_speed: 0.5,
        acceleration: 0.03,
        turn_rate: 6,
        grip: 0.9,
      }),
    );
    expect(kart?.seats).toEqual([{ offset: [0, 0.2, -0.1] }]);
    expect(kart?.cameraDistance).toBe(4);
    const car = catalogue.get('vh:car');
    expect(car?.displayName).toBe('Family Car');
    expect(car?.width).toBe(1.375);
    expect(car?.height).toBe(0.5625);
    expect(car?.seats).toEqual([{ offset: [0, 0.5625, 0] }]);
    expect(car?.maxHealth).toBe(40);
    expect(car?.fuel?.capacity).toBe(1000);
    expect(car?.placesOn).toBe('ground');
    expect(catalogue.get('vh:boat')?.placesOn).toBe('water');
    expect(car?.onlyInMinecraft.join('\n')).toMatch(/weapon fires only in the game/);
    expect(car?.onlyInMinecraft.join('\n')).toMatch(/storage opens only in the game/);
    expect(car?.onlyInMinecraft.join('\n')).toMatch(/paints show only in the game/);
    expect(car?.onlyInMinecraft.join('\n')).toMatch(/explodes when destroyed only in the game/);
  });

  it('leaves out a definition without a known mode, with a line', () => {
    const lines: string[] = [];
    const catalogue = buildVehicleCatalogue(
      files({ odd: { format: 1, model: {}, movement: { mode: 'rail' } } }),
      FAKE_TARGET,
      (text) => lines.push(text),
    );
    expect(catalogue.get('vh:odd')).toBeUndefined();
    expect(lines).toEqual(['vh:odd has no movement mode the preview knows; it is left out.']);
  });
});

describe('geometry helpers', () => {
  it('turns hull points with the yaw (x right, z forwards; yaw 0 faces south)', () => {
    const at0 = hullToWorld([1, 0, 2], 0);
    expect(at0.x).toBeCloseTo(-1);
    expect(at0.z).toBeCloseTo(2);
    const at90 = hullToWorld([0, 0, 1], 90);
    expect(at90.x).toBeCloseTo(-1);
    expect(at90.z).toBeCloseTo(0);
  });

  it('meets a box with a ray', () => {
    const box = vehicleBox({ x: 0, y: 0, z: 5 }, 2, 1);
    expect(rayBox({ x: 0, y: 0.5, z: 0 }, { x: 0, y: 0, z: 1 }, box, 10)).toBeCloseTo(4);
    expect(rayBox({ x: 0, y: 0.5, z: 0 }, { x: 0, y: 0, z: 1 }, box, 3)).toBeNull();
    expect(rayBox({ x: 5, y: 0.5, z: 0 }, { x: 0, y: 0, z: 1 }, box, 10)).toBeNull();
  });
});

describe('VehicleWorld in the local source', () => {
  it('places a vehicle from its item, fires on_place and says what only the game does', () => {
    const s = source();
    const id = place(s, 'vh:car');
    expect(s.vehicles.count).toBe(1);
    const snapshot = s.vehicles.snapshot(id);
    expect(snapshot?.position).toEqual({ x: 24.5, y: 0, z: 30.5 });
    expect(snapshot?.yaw).toBe(0);
    const only = onlyInMinecraft(s).join('\n');
    expect(only).toMatch(/Family Car's weapon fires only in the game/);
    expect(only).toMatch(/storage opens only in the game/);
    expect(only).toMatch(/paints show only in the game/);
    expect(texts(s).join('\n')).toMatch(/needs fuel and has none yet/);
    place(s, 'vh:kart', 20, 20);
    expect(
      s.trace.some((entry) => entry.text === 'You placed Go-kart, so its event "placed" ran.'),
    ).toBe(true);
  });

  it('refuses a boat on the ground and a vehicle where blocks stand', () => {
    const s = source();
    s.act({ type: 'use', pos: floor(10, 10), face: 'up', hit: up, item: 'vh:boat' });
    expect(s.vehicles.count).toBe(0);
    expect(s.lines.at(-1)?.text).toBe('Boat was not placed: it goes on water; point at water.');
    s.world.set({ x: 10, y: 0, z: 11 }, { name: 'test:cube', properties: {} });
    s.act({ type: 'use', pos: floor(10, 10), face: 'up', hit: up, item: 'vh:car' });
    expect(s.vehicles.count).toBe(0);
    expect(s.lines.at(-1)?.text).toBe('Family Car was not placed: there is no room for it there.');
  });

  it('gets in, drives forwards with W as the physics twin says, steers and gets out with Shift', () => {
    const s = source();
    const id = place(s, 'vh:kart', 24, 2);
    drive(s, {}, 3);
    expect(s.vehicles.snapshot(id)?.onGround).toBe(true);
    s.act({ type: 'useVehicle', vehicle: id });
    expect(s.vehicles.riding).toBe(id);
    expect(
      s.trace.some((entry) => entry.text.startsWith('You got into Go-kart, so its event "in"')),
    ).toBe(true);
    expect(s.inventory.count('vh:key')).toBe(1);
    const start = s.vehicles.snapshot(id)?.position.z ?? 0;
    drive(s, { forward: 1 }, 30);
    const moving = s.vehicles.snapshot(id);
    expect(moving?.speed).toBeCloseTo(0.5, 5);
    expect(moving?.throttle).toBe(1);
    expect((moving?.position.z ?? 0) - start).toBeGreaterThan(8);
    expect(moving?.distance).toBeGreaterThan(8);
    // The player sits on the seat, carried along.
    expect(s.player.position.z).toBeCloseTo((moving?.position.z ?? 0) - 0.1, 5);
    expect(s.player.position.y).toBeCloseTo((moving?.position.y ?? 0) + 0.2 - 0.6, 5);
    expect(s.vehicles.riderEye(1)?.y).toBeCloseTo((moving?.position.y ?? 0) + 0.2 + 1.02, 5);
    // D steers right: the yaw grows, and the look turns with the hull.
    s.vehicles.takeLookTurn();
    drive(s, { forward: 1, strafe: 1 }, 5);
    expect(s.vehicles.snapshot(id)?.yaw).toBeCloseTo(30, 5);
    expect(s.vehicles.takeLookTurn()).toBeCloseTo(30, 5);
    expect(s.vehicles.snapshot(id)?.steering).toBe(1);
    // on_tick every 5 ticks while driven.
    expect(s.trace.filter((entry) => entry.text.startsWith('Go-kart is being driven')).length).toBe(
      7,
    );
    drive(s, { sneak: true }, 1);
    expect(s.vehicles.riding).toBeNull();
    expect(texts(s)).toContain('You got out of Go-kart.');
    const after = s.vehicles.snapshot(id);
    expect(
      Math.hypot(
        s.player.position.x - (after?.position.x ?? 0),
        s.player.position.z - (after?.position.z ?? 0),
      ),
    ).toBeGreaterThan(0.6);
    // Without a driver it coasts to a stop.
    drive(s, {}, 200);
    expect(s.vehicles.snapshot(id)?.speed).toBe(0);
  });

  it('stops at a wall it cannot climb and climbs a block (step height 1)', () => {
    const s = source();
    const id = place(s, 'vh:kart', 24, 10);
    for (let x = 20; x < 29; x += 1) {
      for (let z = 16; z <= 26; z += 1)
        s.world.set({ x, y: 0, z }, { name: 'test:cube', properties: {} });
      s.world.set({ x, y: 1, z: 26 }, { name: 'test:cube', properties: {} });
      s.world.set({ x, y: 2, z: 26 }, { name: 'test:cube', properties: {} });
    }
    s.act({ type: 'useVehicle', vehicle: id });
    drive(s, { forward: 1 }, 60);
    const after = s.vehicles.snapshot(id);
    expect(after?.position.y).toBeCloseTo(1, 5);
    expect(after?.position.z).toBeLessThan(26 - 0.6 + 1e-6);
    expect(after?.position.z).toBeGreaterThan(25);
  });

  it('floats a boat on water at its draft', () => {
    const s = source();
    for (let x = 18; x < 30; x += 1) {
      for (let z = 26; z < 36; z += 1) {
        s.world.set({ x, y: 0, z }, { name: 'minecraft:water', properties: { level: '0' } });
      }
    }
    // Pointing at the floor under the water places it on the surface.
    const id = place(s, 'vh:boat', 24, 30);
    expect(s.vehicles.snapshot(id)?.position.y).toBeCloseTo(8 / 9, 5);
    drive(s, {}, 80);
    const floating = s.vehicles.snapshot(id);
    expect(floating?.waterDepth).toBeCloseTo(0.12, 2);
    // A car does not go on water.
    s.act({ type: 'use', pos: floor(20, 28), face: 'up', hit: up, item: 'vh:car' });
    expect(s.lines.at(-1)?.text).toBe(
      'Family Car was not placed: it goes on the ground, not on water.',
    );
  });

  it('needs fuel to drive, burns it while driving and fills up with its fuel item', () => {
    const s = source();
    const id = place(s, 'vh:car');
    s.act({ type: 'useVehicle', vehicle: id });
    drive(s, { forward: 1 }, 10);
    expect(s.vehicles.snapshot(id)?.speed).toBe(0);
    drive(s, { sneak: true }, 1);
    s.act({ type: 'useVehicle', vehicle: id, item: 'minecraft:coal' });
    expect(s.vehicles.snapshot(id)?.fuel).toBe(100);
    expect(s.vehicles.riding).toBeNull();
    s.act({ type: 'useVehicle', vehicle: id, item: 'minecraft:red_dye' });
    expect(onlyInMinecraft(s)).toContain('painting Family Car with minecraft:red_dye');
    expect(s.vehicles.riding).toBeNull();
    s.act({ type: 'useVehicle', vehicle: id });
    expect(s.vehicles.riding).toBe(id);
    drive(s, { forward: 1 }, 10);
    const driving = s.vehicles.snapshot(id);
    expect(driving?.fuel).toBe(90);
    expect(driving?.speed).toBeGreaterThan(0);
    drive(s, {}, 10);
    expect(s.vehicles.snapshot(id)?.fuel).toBe(90);
    s.vehicles.fillTank(id);
    expect(s.vehicles.snapshot(id)?.fuel).toBe(1000);
  });

  it('sends exhaust particles and the start sound while the engine runs', () => {
    const s = source();
    const effects: string[] = [];
    s.subscribe((e) => {
      if (e.type === 'effect') effects.push(`${e.effect.kind} ${e.effect.id}`);
    });
    const id = place(s, 'vh:car');
    s.vehicles.fillTank(id);
    s.act({ type: 'useVehicle', vehicle: id });
    expect(effects).toContain('sound minecraft:block.piston.extend');
    drive(s, { forward: 1 }, 4);
    expect(effects.filter((one) => one === 'particle minecraft:smoke').length).toBe(2);
  });

  it('takes damage from hits, is destroyed at its health and fires on_destroy', () => {
    const s = source();
    const id = place(s, 'vh:kart');
    s.act({ type: 'hitVehicle', vehicle: id });
    expect(s.vehicles.snapshot(id)?.damage).toBe(1);
    expect(texts(s)).toContain('You hit Go-kart: 1 of 3 damage.');
    s.act({ type: 'hitVehicle', vehicle: id });
    s.act({ type: 'hitVehicle', vehicle: id });
    expect(s.vehicles.count).toBe(0);
    expect(
      s.trace.some((entry) => entry.text.startsWith('Go-kart was destroyed, so its event "gone"')),
    ).toBe(true);
    // The event's explode action is the game's.
    expect(
      s.trace.some((entry) => entry.kind === 'onlyInMinecraft' && entry.action === 'explode'),
    ).toBe(true);
    expect(texts(s)).toContain('Go-kart was destroyed. In the game it drops its item.');
  });

  it('repairs with a repair item and is picked up by a sneaking hit', () => {
    const s = source();
    const id = place(s, 'vh:car');
    s.act({ type: 'hitVehicle', vehicle: id });
    s.act({ type: 'useVehicle', vehicle: id, item: 'minecraft:iron_ingot' });
    expect(s.vehicles.snapshot(id)?.damage).toBe(0);
    s.act({ type: 'move', ...IDLE_INPUT, sneak: true });
    s.tick();
    s.act({ type: 'hitVehicle', vehicle: id });
    expect(s.vehicles.count).toBe(0);
    expect(s.lines.at(-1)?.text).toMatch(/^You picked up Family Car\./);
  });

  it('points at a vehicle before the floor behind it', () => {
    const s = source();
    place(s, 'vh:car', 24, 26);
    const at = s.pointedAt({ yaw: 0, pitch: 45 });
    expect(at?.kind).toBe('vehicle');
  });

  it('aims a turret with the look within its limits', () => {
    const s = source();
    const id = place(s, 'vh:tank', 24, 34);
    s.act({ type: 'useVehicle', vehicle: id });
    drive(s, { yaw: 150 }, 20);
    expect(s.vehicles.snapshot(id)?.turretYaw).toBe(90);
    // A tank turns on the spot with its engine.
    drive(s, { yaw: 0, strafe: -1 }, 2);
    expect(s.vehicles.snapshot(id)?.yaw).toBeCloseTo(-10, 5);
  });

  it('takes vehicles out on Clear the area and when their type leaves the project', () => {
    const s = source();
    place(s, 'vh:car');
    place(s, 'vh:kart', 10, 10);
    const without = new Map(files());
    without.delete(`msm/${NS}/vehicle/kart.json`);
    s.setFiles(without);
    expect(s.vehicles.count).toBe(1);
    expect(texts(s)).toContain(
      'Go-kart is no longer in the project; it was taken out of the preview.',
    );
    s.act({ type: 'clear' });
    expect(s.vehicles.count).toBe(0);
  });
});
