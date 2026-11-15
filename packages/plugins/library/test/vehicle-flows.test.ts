/**
 * The vehicle Creator flows (ADR 0091 D2): Car, Tank, Plane and Boat. Ids, the vehicle's fields
 * for the answers, the MSM-made models and pictures, and that every bone the vehicle names is
 * in its model. Validation and export with the real plugins on both targets (zero problems,
 * warnings included, for untouched defaults) live in `packages/exporters/test/library.test.ts`.
 */
import type { ContentBundle, Json, JsonObject } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  geometryCubes,
  SHELL_ITEM_PICTURE,
  VEHICLE_FLOW_SHAPES,
  VEHICLE_ITEM_PICTURES,
  vehicleFlowGeometry,
} from '../src/assets/vehicles/index';
import { libraryStarters } from '../src/index';
import { TANK_SHELL_CAPACITY } from '../src/starters/index';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

const FLOWS = ['vehicle-car', 'vehicle-tank', 'vehicle-plane', 'vehicle-boat'] as const;

const build = (id: string, values: Record<string, Json> = {}): ContentBundle => {
  const starter = libraryStarters.find((entry) => entry.id === id);
  if (starter === undefined) throw new Error(`no ${id}`);
  const bundle = starter.build({ namespace: 'demo', projectName: 'Demo', target, values });
  if (bundle instanceof Promise) throw new Error(`${id} builds asynchronously`);
  return bundle;
};

const ofKind = (bundle: ContentBundle, kind: string) =>
  bundle.elements.filter((entry) => entry.kind === kind);

const vehicleOf = (bundle: ContentBundle): JsonObject => {
  const [found] = ofKind(bundle, 'msm:vehicle');
  if (found === undefined) throw new Error('no vehicle');
  return found.data as JsonObject;
};

const ids = (bundle: ContentBundle): string[] => bundle.elements.map((entry) => entry.id);

/** Every bone the vehicle names in `turret`, `parts` and its weapons' muzzles. */
function namedBones(data: JsonObject): string[] {
  const bones: string[] = [];
  const turret = data.turret as JsonObject | undefined;
  for (const key of ['bone', 'pitch_bone']) {
    if (typeof turret?.[key] === 'string') bones.push(turret[key] as string);
  }
  const parts = (data.parts ?? {}) as JsonObject;
  for (const key of ['wheels', 'steering', 'rotors', 'propellers']) {
    bones.push(...((parts[key] ?? []) as string[]));
  }
  for (const weapon of (data.weapons ?? []) as JsonObject[]) {
    const bone = (weapon.muzzle as JsonObject | undefined)?.bone;
    if (typeof bone === 'string') bones.push(bone);
  }
  return bones;
}

describe('vehicle flows (ADR 0091 D2)', () => {
  it('are four Creator flows that need the Fabric mod jar', () => {
    for (const id of FLOWS) {
      const entry = libraryStarters.find((starter) => starter.id === id);
      expect(entry?.creator?.group, id).toBe('vehicles');
      expect(entry?.layers, id).toEqual(['resourcepack', 'datapack', 'msm']);
      expect(entry?.supports?.(target), id).toBe(true);
      const { fabric: _fabric, ...withoutFabric } = target;
      expect(entry?.supports?.(withoutFabric), id).toBe(false);
      expect(entry?.requiresKinds, id).toEqual(
        expect.arrayContaining([
          'minecraft:model',
          'minecraft:pack_mcmeta',
          'minecraft:recipe',
          'msm:geo_model',
          'msm:mod',
          'msm:vehicle',
        ]),
      );
    }
    expect(libraryStarters.find((entry) => entry.id === 'vehicle-tank')?.requiresKinds).toContain(
      'msm:item',
    );
    expect(libraryStarters.map((entry) => entry.title)).toEqual(
      expect.arrayContaining(['Car', 'Tank', 'Plane', 'Boat']),
    );
  });

  it('ask the plain questions: name, colour, speed, seats, fuel and the cannon', () => {
    const parameterIds = (id: string) =>
      (libraryStarters.find((entry) => entry.id === id)?.parameters ?? []).map(
        (parameter) => parameter.id,
      );
    expect(parameterIds('vehicle-car')).toEqual([
      'car_name',
      'colour',
      'paints',
      'speed',
      'seats',
      'needs_fuel',
      'fuel',
      'horn',
      'boot',
      'recipe',
    ]);
    expect(parameterIds('vehicle-tank')).toEqual([
      'tank_name',
      'colour',
      'paints',
      'speed',
      'seats',
      'needs_fuel',
      'fuel',
      'cannon',
      'needs_shells',
      'recipe',
    ]);
    expect(parameterIds('vehicle-plane')).toEqual([
      'plane_name',
      'colour',
      'paints',
      'speed',
      'seats',
      'needs_fuel',
      'fuel',
      'recipe',
    ]);
    expect(parameterIds('vehicle-boat')).toEqual([
      'boat_name',
      'colour',
      'paints',
      'speed',
      'seats',
      'needs_fuel',
      'fuel',
      'sound',
      'horn',
      'recipe',
    ]);
  });

  it('make the vehicle, its geo model, item model and recipe by default', () => {
    expect(ids(build('vehicle-car'))).toEqual([
      'demo:pack',
      'demo:mod',
      'demo:racing_car',
      'demo:entity/racing_car',
      'demo:item/racing_car',
      'demo:racing_car_crafting',
    ]);
    expect(ids(build('vehicle-tank'))).toEqual([
      'demo:pack',
      'demo:mod',
      'demo:battle_tank',
      'demo:entity/battle_tank',
      'demo:item/battle_tank',
      'demo:battle_tank_crafting',
      'demo:battle_tank_shell',
      'demo:item/battle_tank_shell',
      'demo:battle_tank_shell_crafting',
    ]);
    expect(ids(build('vehicle-plane'))).toContain('demo:biplane');
    expect(ids(build('vehicle-boat'))).toContain('demo:motorboat');
    const car = vehicleOf(build('vehicle-car'));
    expect(car).toMatchObject({
      format: 1,
      display_name: 'Racing Car',
      model: { geometry: 'demo:entity/racing_car', texture: 'demo:entity/racing_car' },
      item: { model: 'demo:item/racing_car' },
      movement: { mode: 'ground', max_speed: 0.45 },
      storage: { rows: 1 },
      engine: { horn: 'minecraft:item.goat_horn.sound.0' },
    });
    expect(car.seats).toHaveLength(2);
    expect((car.engine as JsonObject).fuel).toBeUndefined();
    expect((car.model as JsonObject).paints).toBeUndefined();
  });

  it('name only bones that are in their model, and keep the speed within the cap', () => {
    const cap = target.vehicles?.maxSpeed ?? 3;
    for (const id of FLOWS) {
      for (const values of [{}, { speed: 1000, seats: 99 }, { cannon: false }]) {
        const bundle = build(id, values);
        const data = vehicleOf(bundle);
        const [geo] = ofKind(bundle, 'msm:geo_model');
        const names = new Set(
          geometryCubes(geo?.data as JsonObject).cubes.map((cube) => cube.bone),
        );
        for (const bone of namedBones(data)) expect(names.has(bone), `${id} ${bone}`).toBe(true);
        expect((data.movement as JsonObject).max_speed as number).toBeLessThanOrEqual(cap);
        expect((data.seats as Json[]).length).toBeGreaterThanOrEqual(1);
        expect((data.seats as Json[]).length).toBeLessThanOrEqual(8);
      }
    }
  });

  it('turn the answers into fuel, seats, paints and sounds', () => {
    const car = vehicleOf(
      build('vehicle-car', { needs_fuel: true, fuel: 'blaze_rod', seats: 4, paints: true }),
    );
    expect((car.engine as JsonObject).fuel).toEqual({
      items: [{ item: 'minecraft:blaze_rod', ticks: 2400 }],
    });
    expect(car.seats).toHaveLength(4);
    expect((car.model as JsonObject).paints).toEqual([
      { id: 'red', texture: 'demo:entity/racing_car_red', dye: 'minecraft:red_dye' },
      { id: 'blue', texture: 'demo:entity/racing_car_blue', dye: 'minecraft:blue_dye' },
      { id: 'yellow', texture: 'demo:entity/racing_car_yellow', dye: 'minecraft:yellow_dye' },
    ]);
    const painted = build('vehicle-car', { paints: true }).assets.map((asset) => asset.path);
    expect(painted).toEqual([
      'textures/entity/racing_car.png',
      'textures/entity/racing_car_red.png',
      'textures/entity/racing_car_blue.png',
      'textures/entity/racing_car_yellow.png',
      'textures/item/racing_car.png',
    ]);
    const plane = vehicleOf(build('vehicle-plane', { seats: 1, speed: 30 }));
    expect(plane.movement).toMatchObject({ mode: 'air', max_speed: 1.5, takeoff_speed: 0.75 });
    expect(plane.seats).toHaveLength(1);
    expect((plane.engine as JsonObject).fuel).toBeDefined();
    const boat = vehicleOf(build('vehicle-boat', { sound: 'paddle', seats: 3, horn: false }));
    expect(boat.engine).toEqual({ sound: 'minecraft:entity.boat.paddle_water' });
    expect(boat.seats).toHaveLength(3);
    expect(boat.item).toEqual({ model: 'demo:item/motorboat', places_on: 'water' });
    const noRecipe = build('vehicle-boat', { recipe: false });
    expect(ofKind(noRecipe, 'minecraft:recipe')).toEqual([]);
  });

  it('give the tank a turret and a cannon firing its own exploding shell, loaded if chosen', () => {
    const bundle = build('vehicle-tank');
    const tank = vehicleOf(bundle);
    expect(tank.movement).toMatchObject({ mode: 'ground', turns_in_place: true });
    expect(tank.health).toMatchObject({ max: 120, repair: [{ item: 'minecraft:iron_ingot' }] });
    expect(tank.turret).toMatchObject({ bone: 'turret', pitch_bone: 'barrel' });
    const [cannon] = tank.weapons as JsonObject[];
    expect(cannon).toMatchObject({
      id: 'cannon',
      key: 'fire',
      projectile: 'demo:battle_tank_shell',
      muzzle: { bone: 'barrel' },
    });
    expect(cannon?.ammo).toBeUndefined();
    const [shell] = ofKind(bundle, 'msm:item');
    const shellData = shell?.data as JsonObject;
    expect((shellData.components as JsonObject)['msm:throwable']).toMatchObject({
      on_hit_entity: { event: 'demo:battle_tank_shell_hit' },
      on_hit_block: { event: 'demo:battle_tank_shell_hit_block' },
    });
    expect(shellData.events).toEqual({
      'demo:battle_tank_shell_hit': { actions: [{ type: 'explode', power: 1.5 }] },
      'demo:battle_tank_shell_hit_block': { actions: [{ type: 'explode', power: 1.5 }] },
    });
    const loaded = vehicleOf(build('vehicle-tank', { needs_shells: true }));
    expect((loaded.weapons as JsonObject[])[0]?.ammo).toEqual({
      item: 'demo:battle_tank_shell',
      capacity: TANK_SHELL_CAPACITY,
    });
    const unarmed = build('vehicle-tank', { cannon: false });
    expect(vehicleOf(unarmed).weapons).toBeUndefined();
    expect(vehicleOf(unarmed).turret).toBeUndefined();
    expect(ofKind(unarmed, 'msm:item')).toEqual([]);
  });

  it('draw their models from whole-number boxes on a square texture', () => {
    for (const shape of VEHICLE_FLOW_SHAPES) {
      const geometry = vehicleFlowGeometry(shape, `entity.${shape}`);
      const { size, cubes } = geometryCubes(geometry);
      expect([64, 128, 256], shape).toContain(size);
      for (const cube of cubes) {
        for (const value of [cube.u, cube.v, cube.w, cube.h, cube.d]) {
          expect(Number.isInteger(value), shape).toBe(true);
        }
        expect(cube.u + 2 * (cube.w + cube.d), shape).toBeLessThanOrEqual(size);
        expect(cube.v + cube.d + cube.h, shape).toBeLessThanOrEqual(size);
      }
    }
  });

  it('have item pictures of 16 rows of 16', () => {
    for (const rows of [...Object.values(VEHICLE_ITEM_PICTURES), SHELL_ITEM_PICTURE]) {
      expect(rows).toHaveLength(16);
      for (const row of rows) expect(row).toMatch(/^[.XBLGKH]{16}$/);
    }
  });
});
