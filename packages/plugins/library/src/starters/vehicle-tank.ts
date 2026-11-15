/**
 * The Tank Creator flow (ADR 0091 D2): a slow, tough tank (health 120, repaired with iron
 * ingots, immune to fire) that turns on the spot, with a turret that follows the driver's view
 * and, if chosen, a cannon on the "Vehicle: fire" key firing the tank's own explosive shell (an
 * `msm:item` with `msm:throwable` whose hit events `explode`), loaded with shells when
 * "Needs shells" is on; optional fuel and seats; the MSM-made tank model painted in the
 * picked colour and optional crafting recipes for the tank and its shells. Ids derive from
 * `tank_name`. Vehicles need the Fabric mod jar export.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleAsset,
  ContentBundleElement,
  JsonObject,
  StarterParameter,
} from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
import { shellItemPng } from '../assets/vehicles/index';
import { element, KINDS, rl } from '../content/bundle';
import {
  booleanValue,
  type NameForms,
  nameForms,
  numberWord,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';
import {
  fuelOf,
  fuelParameters,
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

const TANK_COLOUR: Rgb = [88, 112, 52];

/** Shells loaded into the cannon at most. */
export const TANK_SHELL_CAPACITY = 16;

/** The power of a shell's explosion (TNT is 4); it breaks no blocks. */
export const TANK_SHELL_POWER = 1.5;

/** The Tank flow's questions, steps "Vehicle", "Driving", "Cannon" and "Recipe". */
export const VEHICLE_TANK_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  vehicleNameParameter('tank_name', 'Tank name', 'Battle Tank'),
  ...looksParameters(TANK_COLOUR),
  speedParameter(5, { min: 1, max: 12 }, 'a walking player goes about 4.3.'),
  seatsParameter(1, { min: 1, max: 2 }),
  ...fuelParameters(false),
  {
    id: 'cannon',
    label: 'Has a cannon',
    description:
      'A cannon on the turret, fired with the "Vehicle: fire" key (R), shooting exploding shells every three seconds.',
    group: 'Cannon',
    type: 'boolean',
    default: true,
  },
  {
    id: 'needs_shells',
    label: 'Needs shells',
    description: `The cannon fires only when loaded: use shells on the tank to load up to ${TANK_SHELL_CAPACITY}. Off: it never runs out.`,
    group: 'Cannon',
    type: 'boolean',
    default: false,
  },
  recipeParameter(
    'iron ingots around a furnace over three iron blocks; with the cannon, gunpowder and an iron ingot also make four shells.',
  ),
]);

/** The shell: a throwable item whose hits make a small explosion that breaks no blocks. */
function shell(
  namespace: string,
  name: NameForms,
  colour: Rgb,
  recipe: boolean,
): { id: string; elements: ContentBundleElement[]; assets: ContentBundleAsset[] } {
  const path = `${name.id}_shell`;
  const id = rl(namespace, path);
  const hit = rl(namespace, `${path}_hit`);
  const hitBlock = rl(namespace, `${path}_hit_block`);
  const model = rl(namespace, `item/${path}`);
  const bang = { actions: [{ type: 'explode', power: TANK_SHELL_POWER }] };
  const elements: ContentBundleElement[] = [
    element(
      id,
      KINDS.item,
      {
        format: 1,
        model,
        display_name: `${name.display} Shell`,
        max_stack_size: 16,
        creative_tab: 'minecraft:combat',
        components: {
          'msm:throwable': {
            speed: 1.5,
            gravity: 0.03,
            after_throw: 'consume',
            sound: 'minecraft:entity.snowball.throw',
            on_hit_entity: { event: hit },
            on_hit_block: { event: hitBlock },
          },
        },
        events: { [hit]: bang, [hitBlock]: bang },
      },
      `The ${name.lower}'s shell. msm:throwable makes it a projectile, so the tank's cannon can fire it (and a player can throw it by hand). Its hit events ${hit} and ${hitBlock} run explode where it lands: power ${TANK_SHELL_POWER}, breaking no blocks (breaks_blocks false is the default).`,
    ),
    element(
      model,
      KINDS.model,
      { parent: 'minecraft:item/generated', textures: { layer0: model } },
      `The flat item model of the shell, drawn from textures/item/${path}.png.`,
    ),
  ];
  if (recipe) {
    elements.push(
      element(
        rl(namespace, `${path}_crafting`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shapeless',
          category: 'equipment',
          ingredients: ['minecraft:gunpowder', 'minecraft:iron_ingot'],
          result: { id, count: 4 },
        },
        `Gunpowder and an iron ingot anywhere in the crafting grid make four ${name.lower} shells.`,
      ),
    );
  }
  return {
    id,
    elements,
    assets: [{ namespace, path: `textures/item/${path}.png`, bytes: shellItemPng(colour) }],
  };
}

export function vehicleTankBundle(context: BundleContext): ContentBundle {
  const values = readValues(VEHICLE_TANK_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'tank_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), TANK_COLOUR);
  const maxSpeed = maxSpeedOf(values, VEHICLE_TANK_PARAMETERS);
  const seatCount = Math.max(1, Math.min(2, seatCountOf(values)));
  const fuel = fuelOf(values);
  const cannon = booleanValue(values, 'cannon');
  const needsShells = booleanValue(values, 'needs_shells');
  const recipe = booleanValue(values, 'recipe');
  const made = cannon ? shell(context.namespace, name, colour, recipe) : undefined;

  const seats: JsonObject[] = [{ offset: [0, 1.6, 0] }, { offset: [0, 1.1, -1.2] }].slice(
    0,
    seatCount,
  );
  const vehicle: JsonObject = {
    size: [3, 1.6],
    movement: {
      mode: 'ground',
      max_speed: maxSpeed,
      acceleration: 0.01,
      turn_rate: 3,
      turns_in_place: true,
      step_height: 1,
      grip: 1,
    },
    seats,
    engine: {
      ...(fuel.field === undefined ? {} : { fuel: fuel.field }),
      sound: VEHICLE_SOUNDS.ground,
      start_sound: VEHICLE_SOUNDS.start,
    },
    health: {
      max: 120,
      repair: [{ item: 'minecraft:iron_ingot', amount: 20 }],
      explodes: 2,
      immune_to: ['#minecraft:is_fire'],
    },
    camera: { distance: 8 },
  };
  if (made !== undefined) {
    vehicle.weapons = [
      {
        id: 'cannon',
        key: 'fire',
        projectile: made.id,
        speed: 2.5,
        inaccuracy: 0.5,
        cooldown_ticks: 60,
        ...(needsShells ? { ammo: { item: made.id, capacity: TANK_SHELL_CAPACITY } } : {}),
        muzzle: { bone: 'barrel', offset: [0, 1.3, 2.5] },
        sound: VEHICLE_SOUNDS.cannon,
        recoil: 0.1,
      },
    ];
    vehicle.turret = {
      bone: 'turret',
      pitch_bone: 'barrel',
      pitch_limit: [-20, 10],
      turn_rate: 4,
    };
  }
  const cannonWords =
    made === undefined
      ? ' It has no cannon.'
      : ` The turret bone follows where the driver looks (turret, the barrel within pitch_limit), and the weapon cannon fires the ${name.lower} shell (${made.id}) with the Vehicle: fire key (R by default, changeable in Controls) every 60 ticks.${needsShells ? ` It needs ammunition: use shells on the tank to load up to ${TANK_SHELL_CAPACITY}; one is used per shot.` : ' It never runs out (no ammo).'}`;
  const notes = `A slow, tough tank: movement.mode ground at up to ${maxSpeed} blocks a tick, and turns_in_place lets it spin without moving. It has ${numberWord(seats.length)} seat${seats.length === 1 ? '' : 's'}; the first drives${seats.length > 1 ? ' and aims, the second rides on the back' : ''}. ${fuel.words}${cannonWords} It takes 120 damage before it is destroyed (and explodes, power 2), iron ingots repair it and fire does not hurt it (immune_to #minecraft:is_fire).`;

  return vehicleFlowBundle({
    context,
    values,
    name,
    shape: 'tank',
    colour,
    vehicle,
    notes,
    recipe: {
      pattern: ['III', 'IFI', 'BBB'],
      key: { I: 'minecraft:iron_ingot', F: 'minecraft:furnace', B: 'minecraft:iron_block' },
      words: 'Five iron ingots around a furnace over three iron blocks',
    },
    modDescription: `Adds the ${name.display}, a tank to drive${made === undefined ? '' : ' with a cannon'}.`,
    ...(made === undefined ? {} : { extra: { elements: made.elements, assets: made.assets } }),
  });
}
