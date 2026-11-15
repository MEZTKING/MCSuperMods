/**
 * The Plane Creator flow (ADR 0091 D2): a biplane that flies (forwards opens the throttle, the
 * nose follows the driver's view, it lifts off above half its top speed), with one or two
 * seats, fuel by default, iron-ingot repairs, the MSM-made biplane model painted in the picked
 * colour and an optional crafting recipe. Ids derive from `plane_name`. Vehicles need the
 * Fabric mod jar export.
 */
import type { BundleContext, ContentBundle, JsonObject, StarterParameter } from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
import { PLANE_WHEELS } from '../assets/vehicles/index';
import { nameForms, readValues, rgbFromHex, stringValue } from '../content/parameters';
import {
  fuelOf,
  fuelParameters,
  looksParameters,
  maxSpeedOf,
  recipeParameter,
  seatCountOf,
  seatsParameter,
  speedParameter,
  tidy,
  VEHICLE_SOUNDS,
  vehicleFlowBundle,
  vehicleNameParameter,
} from './vehicle-flow';

const PLANE_COLOUR: Rgb = [222, 148, 32];

/** The Plane flow's questions, steps "Vehicle", "Driving" and "Recipe". */
export const VEHICLE_PLANE_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  vehicleNameParameter('plane_name', 'Plane name', 'Biplane'),
  ...looksParameters(PLANE_COLOUR),
  speedParameter(
    20,
    { min: 8, max: 50 },
    'it lifts off above half of it. Flying with elytra is about 30.',
  ),
  seatsParameter(2, { min: 1, max: 2 }),
  ...fuelParameters(true),
  recipeParameter('planks for wings above and below iron ingots around a furnace.'),
]);

export function vehiclePlaneBundle(context: BundleContext): ContentBundle {
  const values = readValues(VEHICLE_PLANE_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'plane_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), PLANE_COLOUR);
  const maxSpeed = maxSpeedOf(values, VEHICLE_PLANE_PARAMETERS);
  const two = seatCountOf(values) >= 2;
  const fuel = fuelOf(values);
  const takeoff = tidy(maxSpeed / 2);

  const vehicle: JsonObject = {
    size: [2.5, 1.2],
    movement: {
      mode: 'air',
      max_speed: maxSpeed,
      acceleration: 0.02,
      turn_rate: 3,
      lift_speed: 0.15,
      takeoff_speed: takeoff,
    },
    seats: two
      ? [{ offset: [0, 0.6, -0.5] }, { offset: [0, 0.6, 0.5] }]
      : [{ offset: [0, 0.6, -0.2] }],
    engine: {
      ...(fuel.field === undefined ? {} : { fuel: fuel.field }),
      sound: VEHICLE_SOUNDS.air,
      start_sound: VEHICLE_SOUNDS.start,
    },
    health: { max: 40, repair: [{ item: 'minecraft:iron_ingot', amount: 10 }] },
    parts: { propellers: ['propeller'], wheels: [...PLANE_WHEELS], wheel_radius: 0.19 },
    camera: { distance: 10 },
  };
  const notes = `A plane: movement.mode air. Forwards opens the throttle up to ${maxSpeed} blocks a tick and back closes it; the nose follows the driver's view, and below takeoff_speed (${takeoff}) it sinks, so it rolls along the ground until it is fast enough to lift off. ${two ? 'It has two seats, the pilot behind the passenger.' : 'It has one seat.'} ${fuel.words} Iron ingots repair it (health.repair); the propeller and wheels named in parts spin.`;

  return vehicleFlowBundle({
    context,
    values,
    name,
    shape: 'plane',
    colour,
    vehicle,
    notes,
    recipe: {
      pattern: ['PPP', 'IFI', 'PPP'],
      key: { P: 'minecraft:oak_planks', I: 'minecraft:iron_ingot', F: 'minecraft:furnace' },
      words: 'Three oak planks above and three below two iron ingots around a furnace',
    },
    modDescription: `Adds the ${name.display}, a plane to fly.`,
  });
}
