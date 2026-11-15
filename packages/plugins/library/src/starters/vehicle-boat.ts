/**
 * The Boat Creator flow (ADR 0091 D2): a motorboat that floats on water and is placed on water,
 * with two to four seats, an engine or paddle sound, an optional horn, optional fuel, plank
 * repairs, the MSM-made motorboat model painted in the picked colour and an optional crafting
 * recipe. Ids derive from `boat_name`. Vehicles need the Fabric mod jar export.
 */
import type { BundleContext, ContentBundle, JsonObject, StarterParameter } from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
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

const BOAT_COLOUR: Rgb = [36, 84, 196];

/** The boat's sounds: an engine or a paddle. */
const BOAT_SOUNDS = [
  { value: 'engine', label: 'An engine', sound: VEHICLE_SOUNDS.ground },
  { value: 'paddle', label: 'A paddle', sound: VEHICLE_SOUNDS.paddle },
] as const;

/** The Boat flow's questions, steps "Vehicle", "Driving", "Extras" and "Recipe". */
export const VEHICLE_BOAT_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  vehicleNameParameter('boat_name', 'Boat name', 'Motorboat'),
  ...looksParameters(BOAT_COLOUR),
  speedParameter(8, { min: 2, max: 20 }, 'a vanilla boat goes about 8 on water.'),
  seatsParameter(2, { min: 2, max: 4 }),
  ...fuelParameters(false),
  {
    id: 'sound',
    label: 'Sounds like',
    description: 'What you hear while it moves.',
    group: 'Extras',
    type: 'choice',
    default: 'engine',
    choices: BOAT_SOUNDS.map((entry) => ({ value: entry.value, label: entry.label })),
  },
  hornParameter(),
  recipeParameter('a furnace over an iron ingot either side of an oak boat.'),
]);

/** Seats: two in a line; three or four in rows of two, the driver at the back on the left. */
function boatSeats(count: number): JsonObject[] {
  const layouts: Record<number, [number, number, number][]> = {
    2: [
      [0, 0.3, -0.6],
      [0, 0.3, 0.2],
    ],
    3: [
      [0, 0.3, -0.6],
      [-0.3, 0.3, 0.3],
      [0.3, 0.3, 0.3],
    ],
    4: [
      [-0.3, 0.3, -0.5],
      [0.3, 0.3, -0.5],
      [-0.3, 0.3, 0.3],
      [0.3, 0.3, 0.3],
    ],
  };
  const layout = layouts[Math.max(2, Math.min(4, count))] ?? [];
  return layout.map((offset) => ({ offset }));
}

export function vehicleBoatBundle(context: BundleContext): ContentBundle {
  const values = readValues(VEHICLE_BOAT_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'boat_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), BOAT_COLOUR);
  const maxSpeed = maxSpeedOf(values, VEHICLE_BOAT_PARAMETERS);
  const seats = boatSeats(seatCountOf(values));
  const fuel = fuelOf(values);
  const horn = booleanValue(values, 'horn');
  const sound =
    BOAT_SOUNDS.find((entry) => entry.value === stringValue(values, 'sound')) ?? BOAT_SOUNDS[0];

  const vehicle: JsonObject = {
    size: [1.6, 0.7],
    movement: { mode: 'water', max_speed: maxSpeed, turn_rate: 4 },
    seats,
    engine: {
      ...(fuel.field === undefined ? {} : { fuel: fuel.field }),
      sound: sound.sound,
      ...(horn ? { horn: VEHICLE_SOUNDS.horn } : {}),
    },
    health: { max: 30, repair: [{ item: '#minecraft:planks', amount: 10 }] },
    parts: { propellers: ['propeller'] },
    camera: { distance: 5 },
  };
  const notes = `A boat: movement.mode water keeps it on the water surface at up to ${maxSpeed} blocks a tick; on land it barely moves. item.places_on water places it on water only. It has ${numberWord(seats.length)} seats; the first drives. ${fuel.words} ${sound.value === 'engine' ? 'It hums like an engine' : 'It splashes like a paddle'} while it moves${horn ? ', and engine.horn is the sound the Vehicle: horn key (H) plays' : ''}. Any planks repair it (health.repair, the tag #minecraft:planks); the propeller named in parts spins.`;

  return vehicleFlowBundle({
    context,
    values,
    name,
    shape: 'boat',
    colour,
    vehicle,
    item: { places_on: 'water' },
    notes,
    recipe: {
      pattern: [' F ', 'IBI'],
      key: { F: 'minecraft:furnace', I: 'minecraft:iron_ingot', B: 'minecraft:oak_boat' },
      words: 'A furnace over an oak boat between two iron ingots',
    },
    modDescription: `Adds the ${name.display}, a boat to steer on water.`,
  });
}
