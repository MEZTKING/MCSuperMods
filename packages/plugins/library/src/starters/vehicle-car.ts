/**
 * The Car Creator flow (ADR 0091 D2): a car that drives on the ground, with one to four seats
 * (two by default), an optional horn, optional fuel, a boot of one row, exhaust smoke,
 * iron-ingot repairs, the MSM-made car model painted in the picked colour and an optional
 * crafting recipe. Ids derive from `car_name`. Vehicles need the Fabric mod jar export.
 */
import type { BundleContext, ContentBundle, JsonObject, StarterParameter } from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
import { CAR_STEERING, CAR_WHEELS } from '../assets/vehicles/index';
import {
  booleanValue,
  nameForms,
  numberWord,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';
import {
  fuelOf,
  fuelParameters,
  hornParameter,
  looksParameters,
  maxSpeedOf,
  recipeParameter,
  seatCountOf,
  seatsParameter,
  speedParameter,
  VEHICLE_SOUNDS,
  vehicleFlowBundle,
  vehicleNameParameter,
} from './vehicle-flow';

const CAR_COLOUR: Rgb = [196, 28, 52];

/** The Car flow's questions, steps "Vehicle", "Driving", "Extras" and "Recipe". */
export const VEHICLE_CAR_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  vehicleNameParameter('car_name', 'Car name', 'Racing Car'),
  ...looksParameters(CAR_COLOUR),
  speedParameter(9, { min: 2, max: 30 }, 'a sprinting player runs about 5.6, a horse up to 14.'),
  seatsParameter(2, { min: 1, max: 4 }),
  ...fuelParameters(false),
  hornParameter(),
  {
    id: 'boot',
    label: 'Has a boot',
    description:
      'A row of nine slots to carry things in, opened with the inventory key from a seat.',
    group: 'Extras',
    type: 'boolean',
    default: true,
  },
  recipeParameter('a glass pane over four iron ingots around a minecart.'),
]);

/** Seats in rows of two: driver on the left, front row first. */
function carSeats(count: number): JsonObject[] {
  const all: [number, number, number][] = [
    [-0.35, 0.35, 0.1],
    [0.35, 0.35, 0.1],
    [-0.35, 0.35, -0.5],
    [0.35, 0.35, -0.5],
  ];
  return all.slice(0, Math.max(1, Math.min(4, count))).map((offset) => ({ offset }));
}

export function vehicleCarBundle(context: BundleContext): ContentBundle {
  const values = readValues(VEHICLE_CAR_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'car_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), CAR_COLOUR);
  const maxSpeed = maxSpeedOf(values, VEHICLE_CAR_PARAMETERS);
  const seats = carSeats(seatCountOf(values));
  const fuel = fuelOf(values);
  const horn = booleanValue(values, 'horn');
  const boot = booleanValue(values, 'boot');

  const vehicle: JsonObject = {
    size: [1.6, 1.3],
    movement: { mode: 'ground', max_speed: maxSpeed, step_height: 1 },
    seats,
    engine: {
      ...(fuel.field === undefined ? {} : { fuel: fuel.field }),
      sound: VEHICLE_SOUNDS.ground,
      start_sound: VEHICLE_SOUNDS.start,
      ...(horn ? { horn: VEHICLE_SOUNDS.horn } : {}),
    },
    health: { max: 40, repair: [{ item: 'minecraft:iron_ingot', amount: 10 }] },
    parts: { wheels: [...CAR_WHEELS], wheel_radius: 0.25, steering: [...CAR_STEERING] },
    ...(boot ? { storage: { rows: 1 } } : {}),
    exhaust: { particle: 'minecraft:smoke', offset: [0, 0.3, -1.3], every_ticks: 4 },
    camera: { distance: 5 },
  };
  const notes = `A car: movement.mode ground drives it on the movement keys at up to ${maxSpeed} blocks a tick (${Math.round(maxSpeed * 20)} blocks a second) and climbs full blocks (step_height 1); it must move to turn. It has ${numberWord(seats.length)} seat${seats.length === 1 ? '' : 's'}; the first drives. ${fuel.words}${horn ? ' engine.horn is the sound the Vehicle: horn key (H) plays.' : ''}${boot ? ' storage holds one row of items, opened with the inventory key from a seat or by sneaking and using it.' : ''} Iron ingots repair it (health.repair); the wheels named in parts spin and the front ones steer, and smoke puffs from the exhaust.`;

  return vehicleFlowBundle({
    context,
    values,
    name,
    shape: 'car',
    colour,
    vehicle,
    notes,
    recipe: {
      pattern: [' G ', 'IMI', 'I I'],
      key: { G: 'minecraft:glass_pane', I: 'minecraft:iron_ingot', M: 'minecraft:minecart' },
      words: 'A glass pane over four iron ingots around a minecart',
    },
    modDescription: `Adds the ${name.display}, a car to drive.`,
  });
}
