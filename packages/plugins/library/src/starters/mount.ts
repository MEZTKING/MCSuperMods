/**
 * The Mount Creator flow (ADR 0073 D2): a four-legged animal or a round flyer that players ride
 * and steer, with or without a vanilla saddle (the preset's `saddle` bone shows it), its speed
 * and jump strength, optionally steered by its owner only (which adds taming) and optionally
 * flying (a round flyer always flies). Base `animal`, `msm:rideable`, optional `msm:tameable`,
 * renderer `auto`, extra variants. Ids derive from `mount_name`. New mobs need the Fabric mod
 * jar export.
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

const PRESETS: readonly MobPresetName[] = ['quadruped', 'flyer'];

/** What tames a mount that only its owner may steer. */
const TAMING_ITEMS = ['minecraft:apple', 'minecraft:golden_apple', 'minecraft:golden_carrot'];

/** The Mount flow's questions, steps "Mob", "Behaviour", "Spawning" and "Variants". */
export const MOUNT_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  mobNameParameter('mount_name', 'Mount name', 'Dune Runner'),
  presetParameter(PRESETS),
  ...skinParameters(COLOURS.wood),
  {
    id: 'needs_saddle',
    label: 'Needs a saddle',
    description:
      'Riders steer it only once it wears a vanilla saddle; off: it can be steered bare.',
    group: 'Behaviour',
    type: 'boolean',
    default: true,
  },
  behaviourNumber(
    'speed',
    'Speed',
    'The movement speed attribute, also its speed while ridden; a horse has 0.1 to 0.34.',
    0.25,
    { min: 0.1, max: 0.5, step: 0.01 },
  ),
  behaviourNumber(
    'jump',
    'Jump strength',
    'How high it jumps with the jump bar while ridden; a horse has 0.4 to 1. 0 means no jump.',
    0.7,
    { min: 0, max: 1.5, step: 0.1 },
  ),
  {
    id: 'owner_only',
    label: 'Only its owner can ride it',
    description:
      'Players tame it with apples, golden apples or golden carrots first; only the owner steers it.',
    group: 'Behaviour',
    type: 'boolean',
    default: false,
  },
  {
    id: 'flying',
    label: 'Flying',
    description: 'It flies, and rises while the rider holds jump. The round flyer always flies.',
    group: 'Behaviour',
    type: 'boolean',
    default: false,
  },
  behaviourNumber('health', 'Health', 'Maximum health in half hearts; a horse has 15 to 30.', 24, {
    min: 2,
    max: 100,
    step: 1,
  }),
  spawnParameter(LAND_SPAWNS, 'plains'),
  ...variantParameters(LAND_VARIANT_PLACES),
]);

export function mountBundle(context: BundleContext): ContentBundle {
  const values = readValues(MOUNT_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'mount_name'));
  const preset = presetValue(values, PRESETS);
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.wood);
  const saddle = booleanValue(values, 'needs_saddle');
  const speed = numberValue(values, 'speed');
  const jump = numberValue(values, 'jump');
  const ownerOnly = booleanValue(values, 'owner_only');
  const flies = preset === 'flyer' || booleanValue(values, 'flying');
  const spawn = spawnChoice(values, LAND_SPAWNS);
  const saddleBone = MOB_PRESETS[preset].saddleBone;

  const components: JsonObject = {
    'msm:health': { max: numberValue(values, 'health') },
    'msm:movement': flies
      ? { speed, mode: 'fly', flying_speed: Math.max(speed, 0.4), hovers: true }
      : { speed, step_height: 1 },
    'msm:rideable': {
      saddle,
      controlled_by: ownerOnly ? 'owner' : 'anyone',
      speed: 1,
      jump,
      passengers: 1,
      ...(saddleBone === undefined ? {} : { saddle_bone: saddleBone }),
    },
    ...(ownerOnly
      ? {
          'msm:tameable': {
            items: [...TAMING_ITEMS],
            chance: 0.2,
            sit: false,
            follows_owner: false,
            defends_owner: false,
          },
        }
      : {}),
    'msm:ai_goals': {
      goals: [
        { type: 'panic', speed: 1.2 },
        { type: 'wander', speed: 0.7 },
        { type: 'look_at_player', distance: 6 },
        { type: 'look_around' },
      ],
    },
  };
  const steer = saddle
    ? 'once it wears a vanilla saddle (shown by the saddle bone)'
    : 'without a saddle (the saddle bone stays hidden)';
  const notes = `A mount: msm:rideable lets a player get on with an empty hand and steer it ${steer}${ownerOnly ? ', but only its owner (controlled_by owner): msm:tameable tames it one time in five with an apple, golden apple or golden carrot' : ''}. ${flies ? 'It flies (mode fly): the rider steers along the view and rises while holding jump; it takes no fall damage.' : `It walks${jump > 0 ? ` and jumps with the jump bar at strength ${jump}` : ''}, stepping up full blocks (step_height 1).`} Its ridden speed is its movement speed (${speed}); sneaking dismounts. ${spawn.biomes.length === 0 ? 'It never spawns on its own: use its spawn egg.' : `It spawns in ${spawn.words} in groups of two to four (rule animal: on grass in daylight).`}`;

  return mobFlowBundle({
    context,
    name,
    preset,
    colour,
    picture: imageValue(values, 'picture'),
    scale: preset === 'flyer' ? 2 : 1.5,
    entity: {
      base: 'animal',
      category: 'creature',
      ...spawnField(spawn, { weight: 5, min: 2, max: 4, rule: 'animal' }),
      components,
    },
    variants: readVariants(values, LAND_VARIANT_PLACES),
    modDescription: `Adds the ${name.display}, a ${flies ? 'flying ' : ''}mount to ride.`,
    entityNotes: notes,
  });
}
