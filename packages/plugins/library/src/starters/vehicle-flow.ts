/**
 * Shared parts of the vehicle Creator flows (ADR 0091 D2): Car, Tank, Plane and Boat. Each flow
 * makes one `msm:vehicle`, its geo model from an MSM-made boxed shape (`assets/vehicles/`), a
 * texture painted in the picked colour (and, if chosen, paints switched with dyes), an item
 * picture through an item model (so the item never shows the missing cube), an optional
 * crafting recipe, the pack and the mod metadata. Sounds are vanilla sound events. Ids derive
 * from the flow's name field. Vehicles need the Fabric mod jar export.
 *
 * @packageDocumentation
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleAsset,
  ContentBundleElement,
  Json,
  JsonObject,
  StarterParameter,
} from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
import {
  type VehicleFlowShape,
  vehicleFlowGeometry,
  vehicleItemPng,
  vehicleTexturePng,
} from '../assets/vehicles/index';
import {
  artSeed,
  element,
  KINDS,
  modElement,
  PACK_NOTES,
  packElement,
  rl,
} from '../content/bundle';
import {
  booleanValue,
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  type NameForms,
  numberValue,
  type ParameterValues,
  stringValue,
} from '../content/parameters';

/** The vehicle kind (`@msm/plugin-entities`, ADR 0090). */
export const VEHICLE_KIND = 'msm:vehicle';

/** Vanilla sound events the flows use. */
export const VEHICLE_SOUNDS = Object.freeze({
  ground: 'minecraft:entity.minecart.riding',
  air: 'minecraft:item.elytra.flying',
  paddle: 'minecraft:entity.boat.paddle_water',
  horn: 'minecraft:item.goat_horn.sound.0',
  start: 'minecraft:block.piston.extend',
  cannon: 'minecraft:entity.generic.explode',
});

/** The paints added by "Extra paints": the dye switches the vehicle to that colour. */
export const VEHICLE_PAINTS: readonly { id: string; dye: string; colour: Rgb; label: string }[] =
  Object.freeze([
    { id: 'red', dye: 'minecraft:red_dye', colour: [176, 46, 38] as Rgb, label: 'red' },
    { id: 'blue', dye: 'minecraft:blue_dye', colour: [60, 68, 170] as Rgb, label: 'blue' },
    { id: 'yellow', dye: 'minecraft:yellow_dye', colour: [232, 196, 52] as Rgb, label: 'yellow' },
  ]);

/** What a vehicle can burn, with the ticks of driving one item gives. */
export const VEHICLE_FUELS: readonly {
  value: string;
  label: string;
  items: readonly { item: string; ticks: number }[];
}[] = Object.freeze([
  {
    value: 'coal',
    label: 'Coal or charcoal',
    items: [
      { item: 'minecraft:coal', ticks: 1200 },
      { item: 'minecraft:charcoal', ticks: 1200 },
    ],
  },
  {
    value: 'blaze_rod',
    label: 'Blaze rods',
    items: [{ item: 'minecraft:blaze_rod', ticks: 2400 }],
  },
  {
    value: 'dried_kelp_block',
    label: 'Dried kelp blocks',
    items: [{ item: 'minecraft:dried_kelp_block', ticks: 800 }],
  },
]);

// Parameters --------------------------------------------------------------------------------

/** The name field (`<shape>_name`), the first question of every vehicle flow. */
export function vehicleNameParameter(id: string, label: string, name: string): StarterParameter {
  return {
    id,
    label,
    description: `What it is called in the game. Ids derive from it: ${name} gives ${name.toLowerCase().replace(/ /g, '_')}.`,
    group: 'Vehicle',
    type: 'string',
    default: name,
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  };
}

/** The colour and "Extra paints" questions. */
export function looksParameters(colour: Rgb): StarterParameter[] {
  return [
    {
      id: 'colour',
      label: 'Colour',
      description: 'The colour it is painted. Paint over the texture later for more detail.',
      group: 'Vehicle',
      type: 'colour',
      default: hexFromRgb(colour),
    },
    {
      id: 'paints',
      label: 'Extra paints',
      description: 'Using red, blue or yellow dye on it repaints it in that colour.',
      group: 'Vehicle',
      type: 'boolean',
      default: false,
    },
  ];
}

/** "How fast", in blocks a second. */
export function speedParameter(
  value: number,
  range: { min: number; max: number },
  hint: string,
): StarterParameter {
  return {
    id: 'speed',
    label: 'How fast',
    description: `Top speed in blocks a second; ${hint}`,
    group: 'Driving',
    type: 'number',
    default: value,
    min: range.min,
    max: range.max,
    step: 1,
  };
}

/** "How many seats"; the first seat drives. */
export function seatsParameter(
  value: number,
  range: { min: number; max: number },
): StarterParameter {
  return {
    id: 'seats',
    label: 'How many seats',
    description: 'The first seat drives; the others ride along.',
    group: 'Driving',
    type: 'number',
    default: value,
    min: range.min,
    max: range.max,
    step: 1,
  };
}

/** "Needs fuel" and "What fuel?". */
export function fuelParameters(needsFuel: boolean): StarterParameter[] {
  return [
    {
      id: 'needs_fuel',
      label: 'Needs fuel',
      description: 'It only drives with fuel in it: use the fuel on it to fill it up.',
      group: 'Driving',
      type: 'boolean',
      default: needsFuel,
    },
    {
      id: 'fuel',
      label: 'What fuel?',
      description: 'Used when Needs fuel is on.',
      group: 'Driving',
      type: 'choice',
      default: 'coal',
      choices: VEHICLE_FUELS.map((entry) => ({ value: entry.value, label: entry.label })),
    },
  ];
}

/** "Has a horn". */
export function hornParameter(): StarterParameter {
  return {
    id: 'horn',
    label: 'Has a horn',
    description: 'The "Vehicle: horn" key (H) sounds a horn.',
    group: 'Extras',
    type: 'boolean',
    default: true,
  };
}

/** "Crafting recipe". */
export function recipeParameter(words: string): StarterParameter {
  return {
    id: 'recipe',
    label: 'Crafting recipe',
    description: `A crafting recipe for it: ${words}`,
    group: 'Recipe',
    type: 'boolean',
    default: true,
  };
}

// Values ------------------------------------------------------------------------------------

/** A number to three decimals, so blocks a tick stay tidy. */
export const tidy = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * The top speed in blocks a tick from "How fast" in blocks a second, kept within the flow's
 * range (and so within the target's cap) whatever value is passed.
 */
export function maxSpeedOf(
  values: ParameterValues,
  parameters: readonly StarterParameter[],
): number {
  const parameter = parameters.find((entry) => entry.id === 'speed');
  const min = parameter?.type === 'number' ? (parameter.min ?? 1) : 1;
  const max = parameter?.type === 'number' ? (parameter.max ?? 60) : 60;
  return tidy(Math.min(max, Math.max(min, numberValue(values, 'speed'))) / 20);
}

/** The seat count, whole. */
export function seatCountOf(values: ParameterValues): number {
  return Math.round(numberValue(values, 'seats'));
}

/** `engine.fuel` when "Needs fuel" is on. */
export function fuelOf(values: ParameterValues): { field?: JsonObject; words: string } {
  if (!booleanValue(values, 'needs_fuel')) return { words: 'It needs no fuel.' };
  const fuel =
    VEHICLE_FUELS.find((entry) => entry.value === stringValue(values, 'fuel')) ??
    (VEHICLE_FUELS[0] as (typeof VEHICLE_FUELS)[number]);
  return {
    field: { items: fuel.items.map((entry) => ({ ...entry })) },
    words: `It burns fuel while driven: use ${fuel.label.toLowerCase()} on it to fill it up (engine.fuel); without fuel it does not move.`,
  };
}

// Bundle ------------------------------------------------------------------------------------

/** What a flow passes to {@link vehicleFlowBundle}. */
export interface VehicleFlowInput {
  context: BundleContext;
  values: ParameterValues;
  name: NameForms;
  shape: VehicleFlowShape;
  colour: Rgb;
  /** The vehicle's data without `format`, `display_name`, `model` and `item`. */
  vehicle: JsonObject;
  /** Fields of the vehicle's `item` other than its model. */
  item?: JsonObject;
  /** The vehicle element's notes. */
  notes: string;
  /** The shaped recipe, used when "Crafting recipe" is on. */
  recipe: { pattern: string[]; key: Record<string, string>; words: string };
  /** The mod description. */
  modDescription: string;
  /** More elements and assets (the tank's shell). */
  extra?: { elements: ContentBundleElement[]; assets: ContentBundleAsset[] };
}

/** The bone names of a geometry, in order, as prose. */
function boneList(geometry: JsonObject): string {
  const entry = (geometry['minecraft:geometry'] as JsonObject[])[0] as JsonObject;
  const names = (entry.bones as JsonObject[]).map((bone) => String(bone.name));
  return names.length <= 1
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * A vehicle flow's bundle: pack, mod, the vehicle, its geo model and item model, the recipe and
 * any extras; assets: the texture, the paints and the item picture.
 */
export function vehicleFlowBundle(input: VehicleFlowInput): ContentBundle {
  const { context, values, name, shape, colour } = input;
  const { namespace, projectName } = context;
  const id = rl(namespace, name.id);
  const own = rl(namespace, `entity/${name.id}`);
  const itemModel = rl(namespace, `item/${name.id}`);
  const geometry = vehicleFlowGeometry(shape, `entity.${name.id}`);
  const paints = booleanValue(values, 'paints') ? VEHICLE_PAINTS : [];
  const model: JsonObject = { geometry: own, texture: own };
  if (paints.length > 0) {
    model.paints = paints.map((paint) => ({
      id: paint.id,
      texture: rl(namespace, `entity/${name.id}_${paint.id}`),
      dye: paint.dye,
    }));
  }
  const data: JsonObject = {
    format: 1,
    display_name: name.display,
    model,
    item: { model: itemModel, ...(input.item ?? {}) },
    ...input.vehicle,
  };
  const paintWords =
    paints.length === 0
      ? ''
      : ` model.paints lets ${paints.map((paint) => paint.label).join(', ')} dye repaint it (textures/entity/${name.id}_<colour>.png).`;
  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
    modElement(namespace, projectName, input.modDescription),
    element(
      id,
      VEHICLE_KIND,
      data,
      `${input.notes}${paintWords} Its model is ${own}, an MSM-made boxed geo model, with the texture textures/entity/${name.id}.png; the item shows through the item model ${itemModel}. Place it from its item, get in with use, drive with the movement keys and pick it up again by hitting it while sneaking. Vehicles need the Fabric mod jar export.`,
    ),
    element(
      own,
      KINDS.geoModel,
      geometry,
      `The boxed model of the ${name.lower}, drawn for MSM, with the bones ${boneList(geometry)}. Replace it with your own Blockbench model; keep the bone names the vehicle uses.`,
    ),
    element(
      itemModel,
      KINDS.model,
      { parent: 'minecraft:item/generated', textures: { layer0: itemModel } },
      `The flat item model of the ${name.lower}'s item (item.model), drawn from textures/item/${name.id}.png.`,
    ),
  ];
  if (booleanValue(values, 'recipe')) {
    elements.push(
      element(
        rl(namespace, `${name.id}_crafting`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shaped',
          category: 'misc',
          pattern: input.recipe.pattern,
          key: input.recipe.key as Json,
          result: { id },
        },
        `${input.recipe.words} make one ${name.lower}. The vehicle's item has the vehicle's own id.`,
      ),
    );
  }
  // One seed for the body and every paint, so a paint is the same drawing in another colour.
  const skinSeed = artSeed(namespace, `entity/${name.id}`, 'box_skin');
  const assets: ContentBundleAsset[] = [
    {
      namespace,
      path: `textures/entity/${name.id}.png`,
      bytes: vehicleTexturePng(geometry, colour, skinSeed),
    },
    ...paints.map((paint) => ({
      namespace,
      path: `textures/entity/${name.id}_${paint.id}.png`,
      bytes: vehicleTexturePng(geometry, paint.colour, skinSeed),
    })),
    { namespace, path: `textures/item/${name.id}.png`, bytes: vehicleItemPng(shape, colour) },
  ];
  if (input.extra !== undefined) {
    elements.push(...input.extra.elements);
    assets.push(...input.extra.assets);
  }
  return { elements, assets };
}
