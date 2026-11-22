/**
 * The Flying mob Creator flow (ADR 0073 D2): a round flyer or a bird that flies about (movement
 * mode `fly`, hovering when idle, no fall damage) and is peaceful, neutral (fights back),
 * hostile in melee or hostile with a projectile. Hostile mobs are base `monster` in the
 * `monster` category; the others are plain creatures. Renderer `auto`, extra variants. Since
 * ADR 0109 D3 (B539) it may instead float above the ground (`hover`, ghast-like) or fly through
 * walls while it charges (`phase`, vex-like); a hostile melee flyer may swoop from above
 * (`swoop`, phantom-like) and any may hang under blocks by day (`roost`, bat-like). Ids derive
 * from `mob_name`. New mobs need the Fabric mod jar export.
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
  projectileParameter,
  projectileValue,
  rangedAttack,
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

const PRESETS: readonly MobPresetName[] = ['flyer', 'bird'];

/** How the mob flies (ADR 0070 D3, ADR 0109 D3), with the words the notes use. */
const FLIGHTS: readonly { value: 'fly' | 'hover' | 'phase'; label: string; words: string }[] = [
  {
    value: 'fly',
    label: 'Flies about and hovers in place',
    words:
      'mode fly gives it flying movement and navigation, it hovers in place when idle (hovers true)',
  },
  {
    value: 'hover',
    label: 'Floats above the ground, as a ghast',
    words:
      'mode hover keeps it floating four blocks above the ground below it (hover_height 4), as a ghast or a blaze',
  },
  {
    value: 'phase',
    label: 'Flies through walls when it charges, as a vex',
    words:
      'mode phase flies as fly does and passes through blocks while its attack goal charges at a target, as a vex',
  },
];

/** The Flying mob flow's questions, steps "Mob", "Behaviour", "Spawning" and "Variants". */
export const FLYING_MOB_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  mobNameParameter('mob_name', 'Mob name', 'Glow Moth'),
  presetParameter(PRESETS),
  ...skinParameters(COLOURS.violet),
  {
    id: 'behaviour',
    label: 'Behaviour',
    group: 'Behaviour',
    type: 'choice',
    default: 'peaceful',
    choices: [
      { value: 'peaceful', label: 'Peaceful: never fights' },
      { value: 'neutral', label: 'Neutral: fights back when hit' },
      { value: 'hostile', label: 'Hostile: swoops at players in the dark' },
      { value: 'shooter', label: 'Hostile shooter: shoots at players from a distance' },
    ],
  },
  {
    id: 'flight',
    label: 'How it flies',
    group: 'Behaviour',
    type: 'choice',
    default: 'fly',
    choices: FLIGHTS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'swoops',
    label: 'Swoops down from above',
    description:
      'A hostile flyer circles high above a player, then dives and bites, as a phantom does. Shooters keep shooting.',
    group: 'Behaviour',
    type: 'boolean',
    default: false,
  },
  {
    id: 'roosts',
    label: 'Hangs under blocks by day',
    description:
      'Through the day it hangs upside down under a block, as a bat does, and lets go when someone comes near.',
    group: 'Behaviour',
    type: 'boolean',
    default: false,
  },
  projectileParameter(
    'minecraft:snowball',
    'What a hostile shooter shoots; the other behaviours ignore it.',
  ),
  behaviourNumber('health', 'Health', 'Maximum health in half hearts; a bee has 10.', 10, {
    min: 2,
    max: 100,
    step: 1,
  }),
  behaviourNumber(
    'flying_speed',
    'Flying speed',
    'The flying speed attribute; a bee has 0.6, a parrot 0.4.',
    0.6,
    { min: 0.1, max: 1.5, step: 0.05 },
  ),
  spawnParameter(LAND_SPAWNS, 'forests'),
  ...variantParameters(LAND_VARIANT_PLACES),
]);

export function flyingMobBundle(context: BundleContext): ContentBundle {
  const values = readValues(FLYING_MOB_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'mob_name'));
  const preset = presetValue(values, PRESETS);
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.violet);
  const behaviour = stringValue(values, 'behaviour');
  const projectile = projectileValue(values);
  const spawn = spawnChoice(values, LAND_SPAWNS);
  const hostile = behaviour === 'hostile' || behaviour === 'shooter';
  const shooter = behaviour === 'shooter';
  const melee = behaviour === 'neutral' || behaviour === 'hostile';
  const targets = hostile ? { targets: ['minecraft:player'] } : {};
  const flight =
    FLIGHTS.find((entry) => entry.value === stringValue(values, 'flight')) ??
    (FLIGHTS[0] as (typeof FLIGHTS)[number]);
  const swoops = behaviour === 'hostile' && booleanValue(values, 'swoops');
  const roosts = booleanValue(values, 'roosts');
  const flyingSpeed = numberValue(values, 'flying_speed');

  const goals: JsonObject[] = [
    ...(shooter
      ? [{ type: 'ranged_attack', speed: 1, ...targets, retaliate: true }]
      : swoops
        ? [{ type: 'swoop', speed: 1, height: 12, ...targets, retaliate: true }]
        : melee
          ? [{ type: 'melee_attack', speed: 1.2, ...targets, retaliate: true }]
          : []),
    ...(roosts ? [{ type: 'roost', daylight: true, when_idle: false, range: 8 }] : []),
    { type: 'wander', speed: 1 },
    { type: 'look_at_player', distance: 8 },
    { type: 'look_around' },
  ];
  const components: JsonObject = {
    'msm:health': { max: numberValue(values, 'health') },
    'msm:movement': {
      speed: 0.3,
      mode: flight.value,
      flying_speed: flyingSpeed,
      ...(flight.value === 'fly' ? { hovers: true } : {}),
      ...(flight.value === 'hover' ? { hover_height: 4 } : {}),
      ...(hostile ? { follow_range: 24 } : {}),
    },
    ...(melee ? { 'msm:attack': { damage: 3 } } : {}),
    ...(shooter
      ? { 'msm:ranged_attack': rangedAttack(projectile, { damage: 2, interval: 40, range: 16 }) }
      : {}),
    'msm:ai_goals': { goals },
  };
  const what = shooter
    ? `It hunts players and shoots ${projectile.label.toLowerCase()} at them from up to 16 blocks every two seconds (msm:ranged_attack with the ranged_attack goal), and fights back the same way.`
    : swoops
      ? 'It hunts players: the swoop goal circles 12 blocks above one, then dives and bites for 3 damage, as a phantom; it fights back the same way.'
      : behaviour === 'hostile'
        ? 'It hunts players and hits them for 3 damage (melee_attack with targets minecraft:player), and fights back when hurt.'
        : behaviour === 'neutral'
          ? 'It leaves players alone but fights back when hurt (melee_attack with retaliate), hitting for 3 damage.'
          : 'It never fights: it only wanders and looks about.';
  const spawnWords =
    spawn.biomes.length === 0
      ? 'It never spawns on its own: use its spawn egg.'
      : hostile
        ? `It spawns in ${spawn.words} where it is dark enough for monsters (rule monster).`
        : `It spawns in ${spawn.words} in groups of one to three.`;
  const notes =
    `A flying mob: ${flight.words} and takes no fall damage; flying_speed sets how fast it flies. ${what}${roosts ? ' The roost goal makes it hang upside down under a block through the day, as a bat, letting go when a player comes within 8 blocks.' : ''} ${hostile ? 'base monster makes it an enemy that is removed in Peaceful.' : ''} ${spawnWords}`.replace(
      /\s+/g,
      ' ',
    );

  return mobFlowBundle({
    context,
    name,
    preset,
    colour,
    picture: imageValue(values, 'picture'),
    scale: 1,
    entity: {
      ...(hostile ? { base: 'monster' } : {}),
      category: hostile ? 'monster' : 'creature',
      ...spawnField(
        spawn,
        hostile
          ? { weight: 20, min: 1, max: 2, rule: 'monster' }
          : { weight: 6, min: 1, max: 3, rule: 'mob' },
      ),
      components,
    },
    variants: readVariants(values, LAND_VARIANT_PLACES),
    modDescription: `Adds the ${name.display}, a flying mob.`,
    entityNotes: notes,
  });
}
