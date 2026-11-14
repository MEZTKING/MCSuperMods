/**
 * The Farm animal Creator flow (ADR 0073 D2): a four-legged animal or a bird that players
 * breed with a food, whose babies have the chosen size, that panics when hurt and drops an item
 * (raw meat comes out cooked when it dies burning, as vanilla's), optionally rideable with a
 * saddle. Base `animal`, `msm:breedable`, a `panic` goal (the breeding food tempts it), an
 * animal spawn rule, renderer `auto`, extra variants. Ids derive from `animal_name`. New mobs
 * need the Fabric mod jar export.
 */
import type { BundleContext, ContentBundle, JsonObject, StarterParameter } from '@msm/plugin-api';
import { COLOURS } from '../content/bundle';
import {
  behaviourNumber,
  dropLoot,
  LAND_SPAWNS,
  LAND_VARIANT_PLACES,
  mobFlowBundle,
  mobNameParameter,
  presetParameter,
  presetValue,
  readVariants,
  skinParameters,
  spawnChoice,
  spawnField,
  spawnParameter,
  variantParameters,
} from '../content/mob-flows';
import { MOB_PRESETS, type MobPresetName } from '../content/mob-presets';
import {
  booleanValue,
  imageValue,
  nameForms,
  numberValue,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

const PRESETS: readonly MobPresetName[] = ['quadruped', 'bird'];

/** Breeding foods. */
const FOODS: readonly { value: string; label: string; items: string[] }[] = [
  { value: 'wheat', label: 'Wheat', items: ['minecraft:wheat'] },
  {
    value: 'seeds',
    label: 'Seeds',
    items: [
      'minecraft:wheat_seeds',
      'minecraft:melon_seeds',
      'minecraft:pumpkin_seeds',
      'minecraft:beetroot_seeds',
    ],
  },
  {
    value: 'roots',
    label: 'Carrots, potatoes and beetroots',
    items: ['minecraft:carrot', 'minecraft:potato', 'minecraft:beetroot'],
  },
  {
    value: 'grass',
    label: 'Short grass and ferns',
    items: ['minecraft:short_grass', 'minecraft:fern'],
  },
];

/** Drops; `cooked` ones are smelted when the animal dies burning. */
const DROPS: readonly { value: string; label: string; cooked: boolean }[] = [
  { value: 'minecraft:porkchop', label: 'Raw porkchop', cooked: true },
  { value: 'minecraft:beef', label: 'Raw beef', cooked: true },
  { value: 'minecraft:chicken', label: 'Raw chicken', cooked: true },
  { value: 'minecraft:mutton', label: 'Raw mutton', cooked: true },
  { value: 'minecraft:rabbit', label: 'Raw rabbit', cooked: true },
  { value: 'minecraft:leather', label: 'Leather', cooked: false },
  { value: 'minecraft:feather', label: 'Feathers', cooked: false },
  { value: 'minecraft:white_wool', label: 'White wool', cooked: false },
];

/** The Farm animal flow's questions, steps "Mob", "Behaviour", "Spawning" and "Variants". */
export const FARM_ANIMAL_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  mobNameParameter('animal_name', 'Animal name', 'Moss Boar'),
  presetParameter(PRESETS),
  ...skinParameters(COLOURS.jade),
  {
    id: 'breeding_food',
    label: 'Breeding food',
    description: 'What makes two animals have a baby; holding it makes them follow you.',
    group: 'Behaviour',
    type: 'choice',
    default: 'wheat',
    choices: FOODS.map(({ value, label }) => ({ value, label })),
  },
  behaviourNumber(
    'baby_size',
    'Baby size',
    'The size of a baby next to a grown animal: 0.5 is half as big.',
    0.5,
    { min: 0.2, max: 1, step: 0.05 },
  ),
  {
    id: 'drop',
    label: 'Drops',
    description: 'What it drops when killed; raw meat drops cooked when it dies burning.',
    group: 'Behaviour',
    type: 'choice',
    default: 'minecraft:porkchop',
    choices: DROPS.map(({ value, label }) => ({ value, label })),
  },
  behaviourNumber('drop_max', 'Most drops', 'It drops one to this many.', 3, {
    min: 1,
    max: 8,
    step: 1,
  }),
  {
    id: 'rideable',
    label: 'Can be ridden',
    description: 'Players ride and steer it once it wears a saddle.',
    group: 'Behaviour',
    type: 'boolean',
    default: false,
  },
  behaviourNumber('health', 'Health', 'Maximum health in half hearts; a cow has 10.', 10, {
    min: 2,
    max: 100,
    step: 1,
  }),
  behaviourNumber('speed', 'Speed', 'The movement speed attribute; a cow has 0.2.', 0.2, {
    min: 0.1,
    max: 0.5,
    step: 0.01,
  }),
  spawnParameter(LAND_SPAWNS, 'plains'),
  ...variantParameters(LAND_VARIANT_PLACES),
]);

export function farmAnimalBundle(context: BundleContext): ContentBundle {
  const { namespace } = context;
  const values = readValues(FARM_ANIMAL_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'animal_name'));
  const preset = presetValue(values, PRESETS);
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.jade);
  const food =
    FOODS.find((entry) => entry.value === stringValue(values, 'breeding_food')) ??
    (FOODS[0] as (typeof FOODS)[number]);
  const drop =
    DROPS.find((entry) => entry.value === stringValue(values, 'drop')) ??
    (DROPS[0] as (typeof DROPS)[number]);
  const dropMax = numberValue(values, 'drop_max');
  const babySize = numberValue(values, 'baby_size');
  const rideable = booleanValue(values, 'rideable');
  const saddleBone = MOB_PRESETS[preset].saddleBone;
  const spawn = spawnChoice(values, LAND_SPAWNS);
  const table = `${namespace}:entities/${name.id}`;

  const components: JsonObject = {
    'msm:health': { max: numberValue(values, 'health') },
    'msm:movement': { speed: numberValue(values, 'speed') },
    'msm:breedable': {
      items: [...food.items],
      baby_scale: babySize,
      grow_up_ticks: 24000,
      tempted: true,
      follow_parents: true,
    },
    ...(rideable
      ? {
          'msm:rideable': {
            saddle: true,
            controlled_by: 'anyone',
            speed: 1,
            passengers: 1,
            ...(saddleBone === undefined ? {} : { saddle_bone: saddleBone }),
          },
        }
      : {}),
    'msm:ai_goals': {
      goals: [
        { type: 'panic', speed: 1.4 },
        { type: 'wander', speed: 1 },
        { type: 'look_at_player', distance: 6 },
        { type: 'look_around' },
      ],
    },
  };
  const notes = `A farm animal: base animal lets it breed. msm:breedable makes two of them fed ${food.label.toLowerCase()} have a baby at ${babySize} times their size that grows up in 20 minutes (24000 ticks); holding the food tempts them and babies follow their parents. panic makes it run about when hurt.${rideable ? ` msm:rideable lets a player ride and steer it once it wears a vanilla saddle${saddleBone === undefined ? '' : `, and the model's ${saddleBone} bone shows the saddle`}.` : ''} ${spawn.biomes.length === 0 ? 'It never spawns on its own: use its spawn egg.' : `It spawns in ${spawn.words} in groups of two to four (rule animal: on grass in daylight).`}`;

  return mobFlowBundle({
    context,
    name,
    preset,
    colour,
    picture: imageValue(values, 'picture'),
    scale: 1,
    entity: {
      base: 'animal',
      category: 'creature',
      ...spawnField(spawn, { weight: 8, min: 2, max: 4, rule: 'animal' }),
      components,
    },
    variants: readVariants(values, LAND_VARIANT_PLACES),
    loot: {
      data: dropLoot(drop.value, dropMax, drop.cooked, table),
      notes: `What the ${name.lower} drops: one to ${dropMax} ${drop.label.toLowerCase()}${drop.cooked ? '; furnace_smelt cooks it when the animal dies burning (entity_properties is_on_fire), as a cow drops cooked beef' : ''}.`,
    },
    modDescription: `Adds the ${name.display}, a farm animal you breed with ${food.label.toLowerCase()}.`,
    entityNotes: notes,
  });
}
