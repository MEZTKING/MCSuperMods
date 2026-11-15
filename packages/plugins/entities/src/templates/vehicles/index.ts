/**
 * "New element" templates of `msm:vehicle` (ADR 0091 D3, category "Vehicles"): Go-kart, Car,
 * Tank, Biplane, Helicopter, Motorboat, Raft and Hovercraft. They use vanilla ids only (items,
 * sounds, particles, damage types), plus ids derived from the new element's own id: the geo model
 * and texture `<ns>:entity/<path>`, the paints `<ns>:entity/<path>_<colour>` and the item picture
 * `<ns>:item/<path>`. None of these exists until the user adds or imports it, so each description
 * says so; with them (the starter geometry of `./geometry` and the pictures) a template has no
 * problems. The bones named in `turret`, `parts` and `muzzle` are those of the starter geometry.
 * Choices are inspired by the vehicle mods the research surveyed; nothing is copied from them.
 */
import type { ElementTemplate, Json, JsonObject, TemplateContext } from '@msm/plugin-api';
import { VEHICLE_KIND } from '../../kinds/vehicle';
import { displayName } from '../index';
import type { VehicleShape } from './geometry';

export {
  VEHICLE_GEOMETRY_FORMAT_VERSION,
  VEHICLE_SHAPES,
  type VehicleShape,
  vehicleGeometry,
} from './geometry';

const CATEGORY = 'Vehicles';

const MODEL_NOTE =
  'Its model, texture and item picture are named after the vehicle and are reported missing until you add or import them (for example from Blockbench).';

/** Vanilla sound events the templates use (the engine loops are vanilla loops). */
const SOUNDS = {
  ground: 'minecraft:entity.minecart.riding',
  air: 'minecraft:item.elytra.flying',
  paddle: 'minecraft:entity.boat.paddle_water',
  horn: 'minecraft:item.goat_horn.sound.0',
  start: 'minecraft:block.piston.extend',
  cannon: 'minecraft:entity.generic.explode',
  gun: 'minecraft:entity.arrow.shoot',
} as const;

/** Coal and charcoal, one minute of driving each. */
const COAL_FUEL: JsonObject = {
  items: [
    { item: 'minecraft:coal', ticks: 1200 },
    { item: 'minecraft:charcoal', ticks: 1200 },
  ],
};

/** The model and item fields every template shares. */
function looks(context: TemplateContext, extra: JsonObject = {}): JsonObject {
  const own = `${context.namespace}:entity/${context.path}`;
  return {
    display_name: displayName(context.path),
    model: { geometry: own, texture: own, ...extra },
    item: { texture: `${context.namespace}:item/${context.path}` },
  };
}

/** Red and blue paints switched with the dyes of the same colour. */
function paints(context: TemplateContext): JsonObject {
  const own = `${context.namespace}:entity/${context.path}`;
  return {
    paints: [
      { id: 'red', texture: `${own}_red`, dye: 'minecraft:red_dye' },
      { id: 'blue', texture: `${own}_blue`, dye: 'minecraft:blue_dye' },
    ],
  };
}

const WHEELS = ['wheel_front_left', 'wheel_front_right', 'wheel_back_left', 'wheel_back_right'];
const FRONT_WHEELS = ['wheel_front_left', 'wheel_front_right'];

/** A template entry: its id, shape and data. */
interface VehicleTemplate {
  shape: VehicleShape;
  title: string;
  description: string;
  data: (context: TemplateContext) => Json;
}

const VEHICLE_TEMPLATES: readonly VehicleTemplate[] = [
  {
    shape: 'go_kart',
    title: 'Go-kart',
    description: `A small, quick one-seater with no fuel and a horn, that grips the road and climbs half a block. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      ...looks(context),
      size: [1.2, 0.6],
      movement: {
        mode: 'ground',
        max_speed: 0.5,
        acceleration: 0.03,
        turn_rate: 6,
        step_height: 0.5,
        grip: 0.9,
      },
      seats: [{ offset: [0, 0.2, -0.1] }],
      engine: { sound: SOUNDS.ground, horn: SOUNDS.horn },
      health: { max: 20 },
      parts: { wheels: WHEELS, wheel_radius: 0.19, steering: FRONT_WHEELS },
      camera: { distance: 4 },
    }),
  },
  {
    shape: 'car',
    title: 'Car',
    description: `A two-seat car that runs on coal or charcoal, with a horn, a boot of one row, exhaust smoke, red and blue paint and iron-ingot repairs. ${MODEL_NOTE}`,
    data: (context) => {
      const base = looks(context, paints(context));
      return {
        format: 1,
        ...base,
        size: [1.6, 1.3],
        movement: { mode: 'ground', max_speed: 0.45, step_height: 1 },
        seats: [{ offset: [-0.35, 0.35, 0.1] }, { offset: [0.35, 0.35, 0.1] }],
        engine: {
          fuel: { ...COAL_FUEL, capacity: 24000 },
          sound: SOUNDS.ground,
          start_sound: SOUNDS.start,
          horn: SOUNDS.horn,
        },
        health: { max: 40, repair: [{ item: 'minecraft:iron_ingot', amount: 10 }] },
        parts: { wheels: WHEELS, wheel_radius: 0.25, steering: FRONT_WHEELS },
        storage: { rows: 1 },
        exhaust: { particle: 'minecraft:smoke', offset: [0, 0.3, -1.3], every_ticks: 4 },
        camera: { distance: 5 },
      };
    },
  },
  {
    shape: 'tank',
    title: 'Tank',
    description: `A slow, tough tank that turns on the spot, with a turret that follows your view, a cannon firing fire charges (loaded with fire charges) on the fire key and a machine gun on the second key. Repaired with iron ingots; immune to fire. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      ...looks(context),
      size: [3, 1.6],
      movement: {
        mode: 'ground',
        max_speed: 0.25,
        acceleration: 0.01,
        turn_rate: 3,
        turns_in_place: true,
        step_height: 1,
        grip: 1,
      },
      seats: [{ offset: [0, 1.6, 0] }],
      engine: { sound: SOUNDS.ground, start_sound: SOUNDS.start },
      health: {
        max: 120,
        repair: [{ item: 'minecraft:iron_ingot', amount: 20 }],
        explodes: 2,
        immune_to: ['#minecraft:is_fire'],
      },
      weapons: [
        {
          id: 'cannon',
          key: 'fire',
          projectile: 'minecraft:fire_charge',
          speed: 2.5,
          inaccuracy: 0.5,
          cooldown_ticks: 60,
          ammo: { item: 'minecraft:fire_charge', capacity: 16 },
          muzzle: { bone: 'barrel', offset: [0, 1.3, 2.5] },
          sound: SOUNDS.cannon,
          recoil: 0.1,
        },
        {
          id: 'machine_gun',
          key: 'second',
          projectile: 'minecraft:arrow',
          speed: 3,
          inaccuracy: 3,
          damage: 2,
          cooldown_ticks: 4,
          automatic: true,
          muzzle: { offset: [0.6, 0.9, 1.8] },
          sound: SOUNDS.gun,
        },
      ],
      turret: {
        bone: 'turret',
        pitch_bone: 'barrel',
        pitch_limit: [-20, 10],
        turn_rate: 4,
      },
      camera: { distance: 8 },
    }),
  },
  {
    shape: 'biplane',
    title: 'Biplane',
    description: `A two-seat plane on coal: forwards opens the throttle, the nose follows your view, and it lifts off above half its top speed. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      ...looks(context),
      size: [2.5, 1.2],
      movement: {
        mode: 'air',
        max_speed: 1,
        acceleration: 0.02,
        turn_rate: 3,
        lift_speed: 0.15,
        takeoff_speed: 0.5,
      },
      seats: [{ offset: [0, 0.6, -0.5] }, { offset: [0, 0.6, 0.5] }],
      engine: { fuel: COAL_FUEL, sound: SOUNDS.air, start_sound: SOUNDS.start },
      health: { max: 40, repair: [{ item: 'minecraft:iron_ingot', amount: 10 }] },
      parts: { propellers: ['propeller'], wheels: FRONT_WHEELS, wheel_radius: 0.19 },
      camera: { distance: 10 },
    }),
  },
  {
    shape: 'helicopter',
    title: 'Helicopter',
    description: `A two-seat helicopter on coal that hovers in place: jump climbs, the "Vehicle: descend" key sinks, and it turns with your view. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      ...looks(context),
      size: [2.2, 1.8],
      movement: { mode: 'hover', max_speed: 0.5, turn_rate: 5, lift_speed: 0.2 },
      seats: [{ offset: [-0.3, 0.4, 0.2] }, { offset: [0.3, 0.4, 0.2] }],
      engine: { fuel: COAL_FUEL, sound: SOUNDS.air, start_sound: SOUNDS.start },
      health: { max: 40, repair: [{ item: 'minecraft:iron_ingot', amount: 10 }] },
      parts: { rotors: ['rotor'], propellers: ['tail_rotor'] },
      camera: { distance: 10 },
    }),
  },
  {
    shape: 'motorboat',
    title: 'Motorboat',
    description: `A quick two-seat boat that skims the water surface, with a horn and a propeller, placed on water. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      ...looks(context),
      size: [1.6, 0.7],
      movement: { mode: 'water', max_speed: 0.4, turn_rate: 4 },
      seats: [{ offset: [0, 0.3, 0] }, { offset: [0, 0.3, -0.6] }],
      engine: { sound: SOUNDS.paddle, horn: SOUNDS.horn },
      health: { max: 30 },
      parts: { propellers: ['propeller'] },
      item: { texture: `${context.namespace}:item/${context.path}`, places_on: 'water' },
      camera: { distance: 5 },
    }),
  },
  {
    shape: 'raft',
    title: 'Raft',
    description: `A slow raft for four with a crate of one row, placed on water. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      ...looks(context),
      size: [1.8, 0.4],
      movement: { mode: 'water', max_speed: 0.15, acceleration: 0.01, turn_rate: 3 },
      seats: [
        { offset: [-0.4, 0.2, 0.4] },
        { offset: [0.4, 0.2, 0.4] },
        { offset: [-0.4, 0.2, -0.2] },
        { offset: [0.4, 0.2, -0.2] },
      ],
      engine: { sound: SOUNDS.paddle },
      health: { max: 20 },
      storage: { rows: 1 },
      item: { texture: `${context.namespace}:item/${context.path}`, places_on: 'water' },
      camera: { distance: 5 },
    }),
  },
  {
    shape: 'hovercraft',
    title: 'Hovercraft',
    description: `A two-seat amphibious craft that drives on land and water alike, slides in the turns and is placed on either. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      ...looks(context),
      size: [2, 0.8],
      movement: { mode: 'amphibious', max_speed: 0.45, turn_rate: 4, step_height: 0.6, grip: 0.5 },
      seats: [{ offset: [-0.3, 0.5, 0] }, { offset: [0.3, 0.5, 0] }],
      engine: { sound: SOUNDS.ground, horn: SOUNDS.horn },
      health: { max: 40, repair: [{ item: 'minecraft:iron_ingot', amount: 10 }] },
      parts: { propellers: ['fan'] },
      item: { texture: `${context.namespace}:item/${context.path}`, places_on: 'any' },
      camera: { distance: 6 },
    }),
  },
];

/** The template id of a shape: `msm_vehicle_<shape>`. */
export const vehicleTemplateId = (shape: VehicleShape): string => `msm_vehicle_${shape}`;

/** The starter shape of each vehicle template, by template id. */
export const VEHICLE_TEMPLATE_SHAPES: Readonly<Record<string, VehicleShape>> = Object.freeze(
  Object.fromEntries(
    VEHICLE_TEMPLATES.map((entry) => [vehicleTemplateId(entry.shape), entry.shape]),
  ),
);

export const vehicleTemplates: readonly ElementTemplate[] = Object.freeze(
  VEHICLE_TEMPLATES.map(
    (entry): ElementTemplate => ({
      id: vehicleTemplateId(entry.shape),
      kind: VEHICLE_KIND,
      category: CATEGORY,
      title: entry.title,
      description: entry.description,
      data: entry.data,
    }),
  ),
);
