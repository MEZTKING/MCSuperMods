/**
 * The Water mob Creator flow (ADR 0073 D2): a fish or a four-legged animal living in water, of
 * one of three kinds: a fish (`swim`, `water_ambient`, schools, dries out on land), a
 * dolphin-like swimmer (`swim` with `breathes_air`, `water_creature`) or an axolotl-like
 * amphibian (`amphibious`, `axolotls`); peaceful, neutral or hostile; spawning in oceans,
 * rivers or swamps. Swimmers move at a speed near 1 (B290). Renderer `auto`, extra variants
 * by water biome. Ids derive from `mob_name`. New mobs need the Fabric mod jar export.
 */
import type { BundleContext, ContentBundle, JsonObject, StarterParameter } from '@msm/plugin-api';
import { COLOURS } from '../content/bundle';
import {
  behaviourNumber,
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
  WATER_SPAWNS,
  WATER_VARIANT_PLACES,
} from '../content/mob-flows';
import type { MobPresetName } from '../content/mob-presets';
import {
  imageValue,
  nameForms,
  numberValue,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

const PRESETS: readonly MobPresetName[] = ['fish', 'quadruped'];

/** The kinds of water mob, with what each writes. */
const KINDS_OF_WATER_MOB: readonly {
  value: string;
  label: string;
  category: string;
  movement: JsonObject;
  group: { weight: number; min: number; max: number };
  words: string;
}[] = [
  {
    value: 'fish',
    label: 'Fish: swims in schools, dries out on land',
    category: 'water_ambient',
    movement: { speed: 1, mode: 'swim', breathes_air: false, dry_out_ticks: 300 },
    group: { weight: 10, min: 3, max: 6 },
    words:
      'a fish: mode swim with water_ambient, swimming in schools of three to six, flopping on land and losing health 300 ticks (15 seconds) after leaving the water',
  },
  {
    value: 'dolphin',
    label: 'Dolphin-like: swims and comes up for air',
    category: 'water_creature',
    movement: { speed: 1.2, mode: 'swim', breathes_air: true },
    group: { weight: 4, min: 1, max: 3 },
    words:
      'a dolphin-like swimmer: mode swim with breathes_air, so it surfaces for air, in the water_creature category, in groups of one to three',
  },
  {
    value: 'amphibian',
    label: 'Amphibian: walks and swims, axolotl-like',
    category: 'axolotls',
    movement: { speed: 1, mode: 'amphibious' },
    group: { weight: 6, min: 1, max: 3 },
    words:
      'an amphibian: mode amphibious walks on land and swims in water, in the axolotls category, in groups of one to three',
  },
];

/** The Water mob flow's questions, steps "Mob", "Behaviour", "Spawning" and "Variants". */
export const WATER_MOB_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  mobNameParameter('mob_name', 'Mob name', 'Reef Darter'),
  presetParameter(PRESETS),
  ...skinParameters(COLOURS.sapphire),
  {
    id: 'kind',
    label: 'Kind',
    group: 'Behaviour',
    type: 'choice',
    default: 'fish',
    choices: KINDS_OF_WATER_MOB.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'behaviour',
    label: 'Behaviour',
    group: 'Behaviour',
    type: 'choice',
    default: 'peaceful',
    choices: [
      { value: 'peaceful', label: 'Peaceful: darts away from players' },
      { value: 'neutral', label: 'Neutral: fights back when hit' },
      { value: 'hostile', label: 'Hostile: attacks players in the water' },
    ],
  },
  behaviourNumber('health', 'Health', 'Maximum health in half hearts; a cod has 3.', 3, {
    min: 1,
    max: 100,
    step: 1,
  }),
  spawnParameter(WATER_SPAWNS, 'oceans'),
  ...variantParameters(WATER_VARIANT_PLACES),
]);

export function waterMobBundle(context: BundleContext): ContentBundle {
  const values = readValues(WATER_MOB_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'mob_name'));
  const preset = presetValue(values, PRESETS);
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.sapphire);
  const kind =
    KINDS_OF_WATER_MOB.find((entry) => entry.value === stringValue(values, 'kind')) ??
    (KINDS_OF_WATER_MOB[0] as (typeof KINDS_OF_WATER_MOB)[number]);
  const behaviour = stringValue(values, 'behaviour');
  const spawn = spawnChoice(values, WATER_SPAWNS);
  const fights = behaviour !== 'peaceful';
  const hostile = behaviour === 'hostile';

  const goals: JsonObject[] = [
    ...(fights
      ? [
          {
            type: 'melee_attack',
            speed: 1.2,
            ...(hostile ? { targets: ['minecraft:player'] } : {}),
            retaliate: true,
          },
        ]
      : [
          {
            type: 'flee',
            from: ['minecraft:player'],
            distance: 8,
            speed: 1.6,
            sprint_speed: 1.4,
          },
        ]),
    { type: 'wander', speed: 1 },
    ...(kind.value === 'fish' ? [] : [{ type: 'look_at_player', distance: 6 }]),
  ];
  const components: JsonObject = {
    'msm:health': { max: numberValue(values, 'health') },
    'msm:movement': { ...kind.movement },
    ...(fights ? { 'msm:attack': { damage: 2 } } : {}),
    'msm:ai_goals': { goals },
  };
  const what = hostile
    ? 'It hunts players in the water and bites for 2 damage (melee_attack with targets minecraft:player).'
    : fights
      ? 'It leaves players alone but bites back for 2 damage when hurt (melee_attack with retaliate).'
      : 'It darts away from players within 8 blocks (flee).';
  const spawnWords =
    spawn.biomes.length === 0
      ? 'It never spawns on its own: use its spawn egg.'
      : `It spawns in ${spawn.words}, in the water (placement in_water, rule water_animal: between 13 blocks below sea level and sea level).`;
  const notes = `A water mob, ${kind.words}. Swimmers move at a movement speed near 1, as fish and dolphins do. ${what} ${spawnWords}`;

  return mobFlowBundle({
    context,
    name,
    preset,
    colour,
    picture: imageValue(values, 'picture'),
    scale: preset === 'quadruped' ? 0.6 : 1,
    entity: {
      category: kind.category,
      ...spawnField(spawn, {
        weight: kind.group.weight,
        min: kind.group.min,
        max: kind.group.max,
        placement: 'in_water',
        rule: 'water_animal',
      }),
      components,
    },
    variants: readVariants(values, WATER_VARIANT_PLACES),
    modDescription: `Adds the ${name.display}, a mob that lives in water.`,
    entityNotes: notes,
  });
}
