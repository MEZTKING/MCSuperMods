/**
 * The Pet Creator flow (ADR 0073 D2): an animal on a preset model (four-legged, bird, round
 * flyer or two-legged) that players tame with a food, which then sits when told, follows its
 * owner and defends them, and if chosen has babies when fed a breeding food. Base `animal`,
 * `msm:tameable`, optional `msm:breedable`, renderer `auto`, extra variants. Ids derive from
 * `pet_name`. New mobs need the Fabric mod jar export.
 */
import type { BundleContext, ContentBundle, JsonObject, StarterParameter } from '@msm/plugin-api';
import { COLOURS } from '../content/bundle';
import {
  behaviourNumber,
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
import type { MobPresetName } from '../content/mob-presets';
import {
  booleanValue,
  imageValue,
  nameForms,
  numberValue,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

const PRESETS: readonly MobPresetName[] = ['quadruped', 'bird', 'flyer', 'biped'];

/** Foods that tame the pet; none is also a breeding food, so feeding never mixes the two up. */
const TAMING_FOODS: readonly { value: string; label: string; items: string[] }[] = [
  { value: 'bones', label: 'Bones', items: ['minecraft:bone'] },
  { value: 'raw_fish', label: 'Raw fish', items: ['minecraft:cod', 'minecraft:salmon'] },
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
    value: 'berries',
    label: 'Berries',
    items: ['minecraft:sweet_berries', 'minecraft:glow_berries'],
  },
  { value: 'apples', label: 'Apples', items: ['minecraft:apple'] },
];

/** Foods that breed tamed pets and grow their babies. */
const BREEDING_FOODS: readonly { value: string; label: string; items: string[] }[] = [
  {
    value: 'cooked_meat',
    label: 'Cooked meat',
    items: ['minecraft:cooked_beef', 'minecraft:cooked_porkchop', 'minecraft:cooked_chicken'],
  },
  {
    value: 'cooked_fish',
    label: 'Cooked fish',
    items: ['minecraft:cooked_cod', 'minecraft:cooked_salmon'],
  },
  { value: 'wheat', label: 'Wheat', items: ['minecraft:wheat'] },
  { value: 'carrots', label: 'Carrots', items: ['minecraft:carrot'] },
  { value: 'golden_carrots', label: 'Golden carrots', items: ['minecraft:golden_carrot'] },
];

/** The Pet flow's questions, steps "Mob", "Behaviour", "Spawning" and "Variants". */
export const PET_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  mobNameParameter('pet_name', 'Pet name', 'Ember Fox'),
  presetParameter(PRESETS),
  ...skinParameters(COLOURS.amber),
  {
    id: 'taming_food',
    label: 'Taming food',
    description: 'What players feed the pet to tame it; each one tames it one time in three.',
    group: 'Behaviour',
    type: 'choice',
    default: 'berries',
    choices: TAMING_FOODS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'sits',
    label: 'Sits when told',
    description: "The owner's right click with an empty hand makes it sit or stand.",
    group: 'Behaviour',
    type: 'boolean',
    default: true,
  },
  {
    id: 'defends',
    label: 'Defends you',
    description: 'It attacks what hurts its owner and what its owner attacks.',
    group: 'Behaviour',
    type: 'boolean',
    default: true,
  },
  {
    id: 'babies',
    label: 'Can have babies',
    description: 'Two pets fed the breeding food have a baby.',
    group: 'Behaviour',
    type: 'boolean',
    default: true,
  },
  {
    id: 'breeding_food',
    label: 'Breeding food',
    description: 'What makes two pets have a baby, and makes babies grow faster.',
    group: 'Behaviour',
    type: 'choice',
    default: 'cooked_meat',
    choices: BREEDING_FOODS.map(({ value, label }) => ({ value, label })),
  },
  behaviourNumber('health', 'Health', 'Maximum health in half hearts; doubled once tamed.', 10, {
    min: 2,
    max: 100,
    step: 1,
  }),
  behaviourNumber(
    'speed',
    'Speed',
    'The movement speed attribute; a wolf has 0.3, a cat 0.3.',
    0.3,
    { min: 0.1, max: 0.6, step: 0.01 },
  ),
  spawnParameter(LAND_SPAWNS, 'forests'),
  ...variantParameters(LAND_VARIANT_PLACES),
]);

export function petBundle(context: BundleContext): ContentBundle {
  const values = readValues(PET_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'pet_name'));
  const preset = presetValue(values, PRESETS);
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.amber);
  const taming =
    TAMING_FOODS.find((food) => food.value === stringValue(values, 'taming_food')) ??
    (TAMING_FOODS[0] as (typeof TAMING_FOODS)[number]);
  const breeding =
    BREEDING_FOODS.find((food) => food.value === stringValue(values, 'breeding_food')) ??
    (BREEDING_FOODS[0] as (typeof BREEDING_FOODS)[number]);
  const sits = booleanValue(values, 'sits');
  const defends = booleanValue(values, 'defends');
  const babies = booleanValue(values, 'babies');
  const health = numberValue(values, 'health');
  const speed = numberValue(values, 'speed');
  const spawn = spawnChoice(values, LAND_SPAWNS);
  const flies = preset === 'flyer';
  const leaps = preset === 'quadruped' && defends;

  const goals: JsonObject[] = [
    ...(leaps ? [{ type: 'leap_at_target', height: 0.4 }] : []),
    ...(defends ? [{ type: 'melee_attack', speed: 1, retaliate: true }] : []),
    { type: 'wander', speed: 1 },
    { type: 'look_at_player', distance: 8 },
    { type: 'look_around' },
  ];
  const components: JsonObject = {
    'msm:health': { max: health },
    'msm:movement': flies ? { speed, mode: 'fly', flying_speed: 0.6, hovers: true } : { speed },
    ...(defends ? { 'msm:attack': { damage: 3 } } : {}),
    'msm:tameable': {
      items: [...taming.items],
      chance: 0.33,
      sit: sits,
      follows_owner: true,
      defends_owner: defends,
      tamed_health: Math.min(1024, health * 2),
    },
    ...(babies ? { 'msm:breedable': { items: [...breeding.items], baby_scale: 0.5 } } : {}),
    'msm:ai_goals': { goals },
  };
  const food = taming.label.toLowerCase();
  const notes = `A pet: base animal makes it an animal that can be tamed${babies ? ' and bred' : ''}. msm:tameable tames it one time in three when a player feeds it ${food} (${taming.items.join(', ')}): then it follows its owner${sits ? ', sits or stands when the owner right-clicks it with an empty hand' : ''}${defends ? ' and attacks what hurts its owner or what its owner attacks (melee_attack, 3 damage)' : ''}, never despawns and has ${Math.min(1024, health * 2)} health instead of ${health}.${babies ? ` msm:breedable lets two tamed or wild pets fed ${breeding.label.toLowerCase()} have a baby at half size that grows up in 20 minutes; the food also tempts it.` : ''}${flies ? ' It flies (mode fly), hovering when idle, and takes no fall damage.' : ''} ${spawn.biomes.length === 0 ? 'It never spawns on its own: use its spawn egg.' : `It spawns in ${spawn.words} in groups of two to four (rule animal: on grass in daylight).`}`;

  return mobFlowBundle({
    context,
    name,
    preset,
    colour,
    picture: imageValue(values, 'picture'),
    scale: preset === 'biped' ? 0.6 : 0.8,
    entity: {
      base: 'animal',
      category: 'creature',
      ...spawnField(spawn, { weight: 5, min: 2, max: 4, rule: 'animal' }),
      components,
    },
    variants: readVariants(values, LAND_VARIANT_PLACES),
    modDescription: `Adds the ${name.display}, a pet you tame with ${food}.`,
    entityNotes: notes,
  });
}
