/**
 * The Boss Creator flow (ADR 0073 D2): a large monster on the two-legged or four-legged preset,
 * scaled up, with its health, attacks (melee, a projectile, or both), a boss bar of the chosen
 * colour and style that may darken the sky, and drops. It never spawns on its own: it is
 * summoned with its spawn egg or a command. Base `monster`, `msm:boss_bar`, no knockback, fire
 * immune, renderer `auto`; no variants. Ids derive from `boss_name`. New mobs need the Fabric
 * mod jar export.
 */
import type { BundleContext, ContentBundle, JsonObject, StarterParameter } from '@msm/plugin-api';
import { COLOURS } from '../content/bundle';
import {
  behaviourNumber,
  dropLoot,
  mobFlowBundle,
  mobNameParameter,
  presetParameter,
  presetValue,
  projectileParameter,
  projectileValue,
  rangedAttack,
  skinParameters,
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

const PRESETS: readonly MobPresetName[] = ['biped', 'quadruped'];

/** Boss sizes: the model's scale. */
const SIZES: readonly { value: string; label: string; scale: number }[] = [
  { value: 'large', label: 'Large (one and a half times)', scale: 1.5 },
  { value: 'huge', label: 'Huge (twice)', scale: 2 },
  { value: 'giant', label: 'Giant (three times)', scale: 3 },
];

const BAR_COLOURS = ['purple', 'pink', 'blue', 'red', 'green', 'yellow', 'white'];

const BAR_STYLES: readonly { value: string; label: string }[] = [
  { value: 'progress', label: 'Smooth' },
  { value: 'notched_6', label: '6 notches' },
  { value: 'notched_10', label: '10 notches' },
  { value: 'notched_12', label: '12 notches' },
  { value: 'notched_20', label: '20 notches' },
];

/** Drops, with their words. */
const DROPS: readonly { value: string; label: string }[] = [
  { value: 'minecraft:diamond', label: 'Diamonds' },
  { value: 'minecraft:emerald', label: 'Emeralds' },
  { value: 'minecraft:gold_ingot', label: 'Gold ingots' },
  { value: 'minecraft:netherite_scrap', label: 'Netherite scrap' },
  { value: 'minecraft:experience_bottle', label: "Bottles o' enchanting" },
];

/** The Boss flow's questions, steps "Mob", "Behaviour" and "Boss bar". */
export const BOSS_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  mobNameParameter('boss_name', 'Boss name', 'Iron Tyrant'),
  presetParameter(PRESETS),
  ...skinParameters(COLOURS.slate),
  {
    id: 'size',
    label: 'Size',
    description: 'How much bigger than the model it is; its hitbox grows with it.',
    group: 'Mob',
    type: 'choice',
    default: 'large',
    choices: SIZES.map(({ value, label }) => ({ value, label })),
  },
  behaviourNumber('health', 'Health', 'Maximum health in half hearts; the wither has 300.', 200, {
    min: 20,
    max: 1024,
    step: 10,
  }),
  {
    id: 'attacks',
    label: 'Attacks',
    group: 'Behaviour',
    type: 'choice',
    default: 'melee',
    choices: [
      { value: 'melee', label: 'Melee: hits hard up close' },
      { value: 'ranged', label: 'Ranged: shoots from a distance' },
      { value: 'both', label: 'Both: hits when it can reach you, shoots when it cannot' },
    ],
  },
  projectileParameter('minecraft:fire_charge', 'What it shoots when its attacks are ranged.'),
  behaviourNumber('damage', 'Melee damage', 'Damage of each hit, in half hearts.', 12, {
    min: 1,
    max: 50,
    step: 1,
  }),
  {
    id: 'drop',
    label: 'Drops',
    group: 'Behaviour',
    type: 'choice',
    default: 'minecraft:diamond',
    choices: DROPS.map(({ value, label }) => ({ value, label })),
  },
  behaviourNumber('drop_max', 'Most drops', 'It drops one to this many.', 5, {
    min: 1,
    max: 64,
    step: 1,
  }),
  {
    id: 'bar_colour',
    label: 'Boss bar colour',
    group: 'Boss bar',
    type: 'choice',
    default: 'purple',
    choices: BAR_COLOURS.map((colour) => ({
      value: colour,
      label: `${colour.charAt(0).toUpperCase()}${colour.slice(1)}`,
    })),
  },
  {
    id: 'bar_style',
    label: 'Boss bar style',
    group: 'Boss bar',
    type: 'choice',
    default: 'notched_10',
    choices: BAR_STYLES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'darkens_sky',
    label: 'Darkens the sky',
    description: 'The sky darkens for players who see its boss bar, as with the wither.',
    group: 'Boss bar',
    type: 'boolean',
    default: true,
  },
]);

export function bossBundle(context: BundleContext): ContentBundle {
  const { namespace } = context;
  const values = readValues(BOSS_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'boss_name'));
  const preset = presetValue(values, PRESETS);
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.slate);
  const size =
    SIZES.find((entry) => entry.value === stringValue(values, 'size')) ??
    (SIZES[0] as (typeof SIZES)[number]);
  const attacks = stringValue(values, 'attacks');
  const melee = attacks !== 'ranged';
  const ranged = attacks !== 'melee';
  const projectile = projectileValue(values);
  const damage = numberValue(values, 'damage');
  const drop =
    DROPS.find((entry) => entry.value === stringValue(values, 'drop')) ??
    (DROPS[0] as (typeof DROPS)[number]);
  const dropMax = numberValue(values, 'drop_max');
  const barColour = BAR_COLOURS.includes(stringValue(values, 'bar_colour'))
    ? stringValue(values, 'bar_colour')
    : 'purple';
  const barStyle =
    BAR_STYLES.find((entry) => entry.value === stringValue(values, 'bar_style')) ??
    (BAR_STYLES[2] as (typeof BAR_STYLES)[number]);
  const darkens = booleanValue(values, 'darkens_sky');
  const table = `${namespace}:entities/${name.id}`;
  const targets = { targets: ['minecraft:player'], retaliate: true };

  const goals: JsonObject[] = [
    ...(melee && ranged ? [{ type: 'melee_attack', speed: 1.1, ...targets }] : []),
    ...(ranged ? [{ type: 'ranged_attack', speed: 1, strafe: !melee, ...targets }] : []),
    ...(melee && !ranged ? [{ type: 'melee_attack', speed: 1, ...targets }] : []),
    { type: 'wander', speed: 0.8 },
    { type: 'look_at_player', distance: 16 },
    { type: 'look_around' },
  ];
  const components: JsonObject = {
    'msm:health': { max: numberValue(values, 'health') },
    'msm:movement': {
      speed: 0.3,
      follow_range: 40,
      knockback_resistance: 1,
      fire_immune: true,
    },
    ...(melee ? { 'msm:attack': { damage, knockback: 1.5 } } : {}),
    ...(ranged
      ? { 'msm:ranged_attack': rangedAttack(projectile, { damage: 6, interval: 30, range: 24 }) }
      : {}),
    'msm:boss_bar': {
      colour: barColour,
      overlay: barStyle.value,
      darken_sky: darkens,
      fog: false,
      music: false,
    },
    'msm:ai_goals': { goals },
  };
  const what =
    melee && ranged
      ? `It shoots ${projectile.label.toLowerCase()} at players from up to 24 blocks (msm:ranged_attack) and hits for ${damage} damage when close (msm:attack); melee_attack comes first in the goals, so it closes in when it can reach the player and shoots when it cannot.`
      : ranged
        ? `It circles players and shoots ${projectile.label.toLowerCase()} at them from up to 24 blocks (msm:ranged_attack with a strafing ranged_attack goal).`
        : `It hunts players and hits for ${damage} damage with a strong knockback (msm:attack).`;
  const notes = `A boss: base monster in the monster category, ${size.label.toLowerCase().replace(/ \(.*\)$/, '')} (scale ${size.scale}), with knockback resistance 1 and fire immunity. ${what} msm:boss_bar shows its health in a ${barColour} bar (${barStyle.label.toLowerCase()})${darkens ? ' and darkens the sky' : ''} for players nearby; a boss never despawns and is seen from ten chunks away. It never spawns on its own: summon it with its spawn egg or /summon.`;

  return mobFlowBundle({
    context,
    name,
    preset,
    colour,
    picture: imageValue(values, 'picture'),
    scale: size.scale,
    entity: { base: 'monster', category: 'monster', components },
    variants: [],
    loot: {
      data: dropLoot(drop.value, dropMax, false, table),
      notes: `What the ${name.lower} drops: one to ${dropMax} ${drop.label.toLowerCase()}.`,
    },
    modDescription: `Adds the ${name.display}, a boss with a boss bar.`,
    entityNotes: notes,
  });
}
