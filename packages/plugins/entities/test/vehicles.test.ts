/**
 * The `msm:vehicle` kind and its lowering (ADR 0090 D2, D5, D14): the kind's fields and default
 * data, the definition without element-only fields, the language keys, the item picture, and
 * goldens of a car and a tank per target (`fixtures/<target id>/expected/vehicle/<name>.json`;
 * `UPDATE_GOLDENS=1` rewrites them).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Json, OutputFile, ResourceLocation } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  EntitiesLoweringError,
  entitiesKinds,
  lowerVehicle,
  VEHICLE_ELEMENT_ONLY_FIELDS,
  VEHICLE_ITEM_PARENT_MODEL,
  vehicleDefinition,
  vehicleDefinitionPath,
  vehicleItemPicture,
  vehicleKind,
} from '../src/index';
import { blockingProblems, element, sortedJson } from './support';
import { vehicleIndexesFor } from './vehicle-support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';
const firstBundle = builtInTargets[0] as TargetBundle;
const firstTarget = firstBundle.target;

interface Sample {
  name: string;
  id: ResourceLocation;
  data: Json;
}

/** A car using every field of the format that a car would, with a flat item picture. */
const CAR: Json = {
  format: 1,
  display_name: 'Red Car',
  item_display_name: 'Red Car Keys',
  model: {
    geometry: 'example:entity/car',
    texture: 'example:entity/car',
    paints: [{ id: 'red', texture: 'example:entity/car_red', dye: 'minecraft:red_dye' }],
    scale: 1,
  },
  size: [1.6, 1.3],
  movement: {
    mode: 'ground',
    max_speed: 0.45,
    reverse_factor: 0.4,
    acceleration: 0.02,
    braking: 0.04,
    turn_rate: 5,
    turns_in_place: false,
    step_height: 1,
    grip: 0.8,
    floats: false,
  },
  seats: [{ offset: [-0.35, 0.35, 0.1] }, { offset: [0.35, 0.35, 0.1], weapons: [] }],
  engine: {
    fuel: { items: [{ item: 'minecraft:coal', ticks: 1200 }], capacity: 12000 },
    sound: 'minecraft:entity.minecart.riding',
    start_sound: 'minecraft:block.piston.extend',
    horn: 'minecraft:item.goat_horn.sound.0',
  },
  health: { max: 40, repair: [{ item: 'minecraft:iron_ingot', amount: 10 }] },
  parts: {
    wheels: ['wheel_front_left', 'wheel_front_right'],
    wheel_radius: 0.25,
    steering: ['wheel_front_left', 'wheel_front_right'],
  },
  storage: { rows: 1 },
  item: { texture: 'example:item/car', places_on: 'ground' },
  pick_up: true,
  ram_damage: { damage: 4, min_speed: 0.3 },
  camera: { distance: 5 },
  exhaust: { particle: 'minecraft:smoke', offset: [0, 0.3, -1.3], every_ticks: 4 },
  hud: true,
  events: {
    honk: { actions: [{ type: 'play_sound', sound: 'minecraft:item.goat_horn.sound.0' }] },
  },
  on_mount: 'honk',
  on_tick: { event: 'honk', interval: 200 },
};

/** A tank with a turret, two weapons, ammunition and an item model. */
const TANK: Json = {
  format: 1,
  display_name: 'Tank',
  model: {
    geometry: 'example:entity/tank',
    texture: 'example:entity/tank',
    paints: [{ id: 'desert', texture: 'example:entity/tank_desert', dye: 'minecraft:sand' }],
  },
  size: [3, 1.6],
  movement: { mode: 'ground', max_speed: 0.25, turn_rate: 3, turns_in_place: true },
  seats: [{ offset: [0, 1.6, 0], weapons: ['cannon', 'machine_gun'] }],
  engine: { sound: 'minecraft:entity.minecart.riding' },
  health: {
    max: 120,
    repair: [{ item: 'minecraft:iron_ingot', amount: 20 }],
    explodes: 2,
    immune_to: ['#minecraft:is_fire', 'minecraft:cactus'],
  },
  weapons: [
    {
      id: 'cannon',
      key: 'fire',
      projectile: 'minecraft:fire_charge',
      speed: 2.5,
      inaccuracy: 0.5,
      cooldown_ticks: 60,
      ammo: { item: 'minecraft:fire_charge', per_shot: 1, capacity: 16 },
      muzzle: { bone: 'barrel', offset: [0, 1.3, 2.5] },
      sound: 'minecraft:entity.generic.explode',
      recoil: 0.1,
      on_fire: 'shot',
    },
    {
      id: 'machine_gun',
      key: 'second',
      projectile: 'minecraft:arrow',
      damage: 2,
      cooldown_ticks: 4,
      automatic: true,
      muzzle: { offset: [0.6, 0.9, 1.8] },
    },
  ],
  turret: {
    bone: 'turret',
    pitch_bone: 'barrel',
    yaw_limit: [-180, 180],
    pitch_limit: [-20, 10],
    turn_rate: 4,
    seat: 0,
  },
  item: { model: 'example:item/tank_model' },
  events: {
    shot: { actions: [{ type: 'explode', power: 1, at: 'other' }] },
    wrecked: { actions: [{ type: 'explode', power: 3, fire: true }] },
  },
  on_destroy: 'wrecked',
};

const SAMPLES: Sample[] = [
  { name: 'default', id: 'demo:sample', data: vehicleKind.defaultData as Json },
  { name: 'car', id: 'example:car', data: CAR },
  { name: 'tank', id: 'example:tank', data: TANK },
];

describe('msm:vehicle kind', () => {
  it('is contributed after msm:entity with its schema, folder, registry and preview', () => {
    expect(entitiesKinds.map((kind) => kind.id)).toEqual(['msm:entity', 'msm:vehicle']);
    expect(plugin.contributes.elementKinds?.map((kind) => kind.id)).toEqual([
      'msm:entity',
      'msm:vehicle',
    ]);
    expect([
      vehicleKind.schema,
      vehicleKind.folder,
      vehicleKind.registry,
      vehicleKind.previewKind,
      vehicleKind.hiddenPaths,
    ]).toEqual([MSM_SCHEMA_REFS.vehicle, 'vehicle', 'entity_type', 'vehicle', ['/format']]);
  });

  it('starts with the two required records only', async () => {
    expect(vehicleKind.defaultData).toEqual({
      format: 1,
      model: { geometry: '', texture: '' },
      movement: { mode: 'ground' },
    });
    // The empty texture is the one gap: the form asks for a picture.
    const indexes = await vehicleIndexesFor(firstBundle);
    const problems = blockingProblems(indexes, vehicleKind.schema, vehicleKind.defaultData as Json);
    expect(problems.map((problem) => problem.path)).toEqual(['/model/texture']);
  });
});

describe('vehicle lowering', () => {
  it('strips the element-only fields and writes format 1', () => {
    expect(VEHICLE_ELEMENT_ONLY_FIELDS).toEqual(['display_name', 'item_display_name']);
    const created = element(vehicleKind.id, 'example:car', { ...(CAR as object), format: 7 });
    const definition = vehicleDefinition(created);
    expect(definition.display_name).toBeUndefined();
    expect(definition.item_display_name).toBeUndefined();
    expect(definition.format).toBe(1);
    expect(definition.movement).toEqual((CAR as { movement: Json }).movement);
    // The element is not changed.
    expect((created.data as { display_name: string }).display_name).toBe('Red Car');
  });

  it('writes the definition under msm/<ns>/vehicle/', () => {
    expect(vehicleDefinitionPath('example', 'cars/red')).toBe('msm/example/vehicle/cars/red.json');
    const [definition] = lowerVehicle(
      element(vehicleKind.id, 'example:cars/red', CAR),
      firstTarget,
    );
    expect(definition).toMatchObject({
      path: 'msm/example/vehicle/cars/red.json',
      layer: 'msm',
      schema: MSM_SCHEMA_REFS.vehicleDefinition,
    });
  });

  it('names the entity and its item, the item falling back to the vehicle name', () => {
    const lang = (data: Json) =>
      lowerVehicle(element(vehicleKind.id, 'example:cars/red', data), firstTarget).find((file) =>
        file.path.endsWith('/en_us.json'),
      );
    expect(lang(CAR)?.contents).toEqual({
      'entity.example.cars.red': 'Red Car',
      'item.example.cars.red': 'Red Car Keys',
    });
    expect(lang(CAR)?.merge).toBe('object');
    const { item_display_name: _drop, ...noItemName } = CAR as Record<string, Json>;
    expect(lang(noItemName)?.contents).toEqual({
      'entity.example.cars.red': 'Red Car',
      'item.example.cars.red': 'Red Car',
    });
    expect(lang(vehicleKind.defaultData as Json)).toBeUndefined();
  });

  it('writes the item picture from item.model, else from item.texture, else nothing', () => {
    expect(vehicleItemPicture({ item: { model: 'a:item/m', texture: 'a:item/t' } })).toEqual({
      model: 'a:item/m',
    });
    expect(vehicleItemPicture({ item: { texture: 'a:item/t' } })).toEqual({ texture: 'a:item/t' });
    expect(vehicleItemPicture({ item: { model: '' } })).toBeUndefined();
    expect(vehicleItemPicture({})).toBeUndefined();
    const paths = (data: Json): string[] =>
      lowerVehicle(element(vehicleKind.id, 'example:car', data), firstTarget).map(
        (file) => file.path,
      );
    const folders = firstTarget.folders.resource;
    expect(paths(CAR)).toEqual([
      'msm/example/vehicle/car.json',
      `assets/example/${folders.lang}/en_us.json`,
      `assets/example/${folders.item_definition}/car.json`,
      `assets/example/${folders.model}/item/car.json`,
    ]);
    const flat = lowerVehicle(element(vehicleKind.id, 'example:car', CAR), firstTarget)[3];
    expect(flat?.contents).toEqual({
      parent: VEHICLE_ITEM_PARENT_MODEL,
      textures: { layer0: 'example:item/car' },
    });
    expect(paths(TANK)).toHaveLength(3);
  });

  it('rejects unsafe ids and data that is not an object', () => {
    expect(() => lowerVehicle(element(vehicleKind.id, 'Bad:id', CAR), firstTarget)).toThrow(
      EntitiesLoweringError,
    );
    expect(() => lowerVehicle(element(vehicleKind.id, 'a:../b', CAR), firstTarget)).toThrow(
      EntitiesLoweringError,
    );
    expect(() => lowerVehicle(element(vehicleKind.id, 'a:b', [] as Json), firstTarget)).toThrow(
      EntitiesLoweringError,
    );
  });
});

const fixtureUrl = (targetId: string, sample: Sample): URL =>
  new URL(
    `./fixtures/${targetId}/expected/${vehicleKind.folder}/${sample.name}.json`,
    import.meta.url,
  );

const recorded = (file: OutputFile): Record<string, unknown> => ({
  contents: file.contents,
  layer: file.layer,
  merge: file.merge,
  path: file.path,
  schema: file.schema,
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'golden vehicle lowering for %s',
  (targetId, bundle) => {
    it.each(SAMPLES.map((sample) => [sample.name, sample] as const))('%s', async (name, sample) => {
      const created = element(vehicleKind.id, sample.id, sample.data);
      const files = await vehicleKind.lower(created, bundle.target);
      const indexes = await vehicleIndexesFor(bundle);
      if (name !== 'default') {
        expect(blockingProblems(indexes, vehicleKind.schema, sample.data)).toEqual([]);
        for (const file of files) {
          if (file.schema === undefined) continue;
          expect(blockingProblems(indexes, file.schema, file.contents as Json), file.path).toEqual(
            [],
          );
        }
      }
      expect(await vehicleKind.lower(created, bundle.target)).toEqual(files);
      const actual = sortedJson(files.map(recorded));
      const url = fixtureUrl(targetId, sample);
      if (UPDATE) {
        await mkdir(dirname(fileURLToPath(url)), { recursive: true });
        await writeFile(url, actual);
      }
      expect(actual).toBe(await readFile(url, 'utf8'));
    });
  },
);
