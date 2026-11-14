/**
 * The Potion Creator flow (ADR 0063 D10): one `msm:potion` with its name, the effect it gives
 * (a vanilla effect, or a new `msm:effect` of its own with a colour, an icon and one stat
 * change), how long it lasts and its level; the brewing step (a base potion and an
 * ingredient) and, if chosen, a longer version (redstone) and a stronger version (glowstone
 * dust), and splash and lingering bottles (tipped arrows come with lingering). Ids derive from
 * `potion_name`: the potion is `<id>`, its own effect `<id>_effect`. Potions need the Fabric
 * mod jar export (with `msm_runtime`); the vanilla pack export warns.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleAsset,
  ContentBundleElement,
  JsonObject,
  ResourceLocation,
  StarterParameter,
} from '@msm/plugin-api';
import {
  COLOURS,
  element,
  KINDS,
  modElement,
  PACK_NOTES,
  packElement,
  rl,
} from '../content/bundle';
import {
  attributeModifiers,
  chosenStats,
  colourInt,
  describeStat,
  EFFECT_CHOICES,
  effectIconAsset,
  statParameters,
} from '../content/effects';
import {
  booleanValue,
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

/** The "a new effect of its own" value of the effect question. */
export const OWN_EFFECT = 'own';

/**
 * Vanilla items no vanilla brewing recipe uses, offered as the ingredient, so the new step
 * never clashes with a vanilla one. Checked against each target's item registry in the tests.
 */
export const BREWING_INGREDIENTS: readonly { value: string; label: string }[] = Object.freeze([
  { value: 'minecraft:amethyst_shard', label: 'Amethyst shard' },
  { value: 'minecraft:glow_berries', label: 'Glow berries' },
  { value: 'minecraft:honeycomb', label: 'Honeycomb' },
  { value: 'minecraft:feather', label: 'Feather' },
  { value: 'minecraft:prismarine_crystals', label: 'Prismarine crystals' },
  { value: 'minecraft:echo_shard', label: 'Echo shard' },
  { value: 'minecraft:sweet_berries', label: 'Sweet berries' },
  { value: 'minecraft:cocoa_beans', label: 'Cocoa beans' },
  { value: 'minecraft:emerald', label: 'Emerald' },
  { value: 'minecraft:ender_pearl', label: 'Ender pearl' },
]);

/** The base potions the ingredient can go into. */
const BASES: readonly { value: string; label: string }[] = [
  { value: 'minecraft:awkward', label: 'Awkward potion (water bottle and nether wart)' },
  { value: 'minecraft:mundane', label: 'Mundane potion' },
  { value: 'minecraft:thick', label: 'Thick potion' },
  { value: 'minecraft:water', label: 'Water bottle' },
];

const OWN_ONLY = 'Used when Effect is A new effect of its own.';

/** The Potion flow's questions, groups "Potion", "Effect", "Brewing" and "Versions". */
export const POTION_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'potion_name',
    label: 'Name',
    description:
      'The English name after "Potion of". Ids derive from it: Moon Leap gives moon_leap.',
    group: 'Potion',
    type: 'string',
    default: 'Moon Leap',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'effect',
    label: 'Effect',
    description:
      'What the potion gives: a new effect of its own (made here, with its icon) or a vanilla effect.',
    group: 'Effect',
    type: 'choice',
    default: OWN_EFFECT,
    choices: [
      { value: OWN_EFFECT, label: 'A new effect of its own' },
      ...EFFECT_CHOICES.map((entry) => ({ ...entry })),
    ],
  },
  {
    id: 'colour',
    label: 'Colour',
    description: `The colour of the new effect, which also colours the potion. ${OWN_ONLY} A vanilla effect keeps its own colour.`,
    group: 'Effect',
    type: 'colour',
    default: hexFromRgb(COLOURS.sapphire),
  },
  ...statParameters('Effect', [{ stat: 'minecraft:jump_strength', amount: 30 }]).map(
    (parameter) => ({
      ...parameter,
      description: `${parameter.description ?? 'What the new effect changes.'} ${OWN_ONLY}`,
    }),
  ),
  {
    id: 'seconds',
    label: 'Seconds it lasts',
    description: 'Vanilla potions last 3 minutes (180 seconds); instant ones are not offered.',
    group: 'Effect',
    type: 'number',
    default: 180,
    min: 1,
    max: 1800,
    step: 1,
  },
  {
    id: 'level',
    label: 'Level',
    description: '1 is level I, 2 is level II, and so on.',
    group: 'Effect',
    type: 'number',
    default: 1,
    min: 1,
    max: 5,
    step: 1,
  },
  {
    id: 'base',
    label: 'Brewed from',
    description:
      'The potion the ingredient goes into. Most vanilla potions start from an awkward potion.',
    group: 'Brewing',
    type: 'choice',
    default: 'minecraft:awkward',
    choices: BASES.map((entry) => ({ ...entry })),
  },
  {
    id: 'ingredient',
    label: 'Ingredient',
    description:
      'The item that brews the potion. None of these is a vanilla brewing ingredient, so the step never clashes with a vanilla potion.',
    group: 'Brewing',
    type: 'choice',
    default: 'minecraft:amethyst_shard',
    choices: [
      ...BREWING_INGREDIENTS.map((entry) => ({ ...entry })),
      { value: 'none', label: 'Not brewed (commands and creative only)' },
    ],
  },
  {
    id: 'longer',
    label: 'Longer version',
    description: 'Redstone dust makes a version that lasts longer, like vanilla potions.',
    group: 'Versions',
    type: 'boolean',
    default: true,
  },
  {
    id: 'long_seconds',
    label: 'Longer version: seconds',
    description: 'Vanilla longer potions last 8 minutes (480 seconds).',
    group: 'Versions',
    type: 'number',
    default: 480,
    min: 1,
    max: 1800,
    step: 1,
  },
  {
    id: 'stronger',
    label: 'Stronger version',
    description: 'Glowstone dust makes a version one level higher that lasts shorter.',
    group: 'Versions',
    type: 'boolean',
    default: true,
  },
  {
    id: 'strong_seconds',
    label: 'Stronger version: seconds',
    description: 'Vanilla stronger potions last 1:30 (90 seconds).',
    group: 'Versions',
    type: 'number',
    default: 90,
    min: 1,
    max: 1800,
    step: 1,
  },
  {
    id: 'splash',
    label: 'Splash potion',
    description: 'Gunpowder turns the potion into a splash potion you throw.',
    group: 'Versions',
    type: 'boolean',
    default: true,
  },
  {
    id: 'lingering',
    label: 'Lingering potion and tipped arrows',
    description:
      "Dragon's breath turns the splash potion into a lingering one, which with eight arrows crafts tipped arrows.",
    group: 'Versions',
    type: 'boolean',
    default: true,
  },
]);

/** `3 minutes`, `1:30`, `45 seconds`. */
export function durationWords(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (rest === 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function potionBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(POTION_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'potion_name'));
  const effectChoice = stringValue(values, 'effect');
  const vanillaEffect = EFFECT_CHOICES.find((entry) => entry.value === effectChoice);
  const own = vanillaEffect === undefined;
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.sapphire);
  const stats = chosenStats(values, 1);
  const seconds = Math.round(numberValue(values, 'seconds'));
  const amplifier = Math.max(0, Math.round(numberValue(values, 'level')) - 1);
  const base =
    BASES.find((entry) => entry.value === stringValue(values, 'base')) ??
    (BASES[0] as { value: string; label: string });
  const ingredient = BREWING_INGREDIENTS.find(
    (entry) => entry.value === stringValue(values, 'ingredient'),
  );
  const longer = booleanValue(values, 'longer');
  const longSeconds = Math.round(numberValue(values, 'long_seconds'));
  const stronger = booleanValue(values, 'stronger');
  const strongSeconds = Math.round(numberValue(values, 'strong_seconds'));
  const splash = booleanValue(values, 'splash');
  const lingering = booleanValue(values, 'lingering');

  const potion = rl(namespace, name.id);
  const effect = own
    ? rl(namespace, `${name.id}_effect`)
    : (vanillaEffect.value as ResourceLocation);
  const effectLabel = own ? name.display : vanillaEffect.label;

  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: potion of ${name.lower}`, PACK_NOTES),
    modElement(namespace, projectName, `Adds the Potion of ${name.display}.`),
  ];
  const assets: ContentBundleAsset[] = [];
  if (own) {
    const data: JsonObject = {
      format: 1,
      display_name: name.display,
      category: 'beneficial',
      color: colourInt(colour),
    };
    if (stats.length > 0) data.attribute_modifiers = attributeModifiers(stats);
    const statWords =
      stats.length === 0
        ? 'It changes no stats yet; add attribute modifiers or events in the Effect Studio.'
        : `It changes ${stats.map(describeStat).join(' and ')}, until it ends.`;
    elements.push(
      element(
        effect,
        KINDS.effect,
        data,
        `The new status effect the potion gives, shown in the colour ${hexFromRgb(colour)}, which also colours the potion. ${statWords} Its icon is textures/mob_effect/${name.id}_effect.png; paint over the placeholder to restyle it.`,
      ),
    );
    assets.push(effectIconAsset(namespace, `${name.id}_effect`, colour));
  }

  const effectEntry: JsonObject = { id: effect, duration_ticks: seconds * 20 };
  if (amplifier > 0) effectEntry.amplifier = amplifier;
  const data: JsonObject = {
    format: 1,
    display_name: name.display,
    effects: [effectEntry],
  };
  const sentences: string[] = [
    `The potion gives ${effectLabel}${amplifier > 0 ? ` (level ${amplifier + 1})` : ''} for ${durationWords(seconds)}; its colour comes from the effect.`,
  ];
  if (ingredient !== undefined) {
    const brewing: JsonObject = { reagent: ingredient.value };
    if (base.value !== 'minecraft:awkward') brewing.base = base.value;
    data.brewing = brewing;
    sentences.push(
      `In a brewing stand, ${ingredient.label.toLowerCase()} added to ${articleBase(base.label)} brews it.`,
    );
  } else {
    sentences.push('It is not brewed: get it from the creative menu or with /give.');
  }
  if (longer) {
    data.long = { duration_ticks: longSeconds * 20 };
    sentences.push(
      `Redstone dust makes ${namespace}:long_${name.id}, which lasts ${durationWords(longSeconds)}.`,
    );
  }
  if (stronger) {
    data.strong = { amplifier: amplifier + 1, duration_ticks: strongSeconds * 20 };
    sentences.push(
      `Glowstone dust makes ${namespace}:strong_${name.id}, level ${amplifier + 2} for ${durationWords(strongSeconds)}.`,
    );
  }
  if (!splash) data.splash = false;
  if (!lingering) data.lingering = false;
  const bottles = [
    ...(splash ? ['gunpowder makes the splash potion'] : []),
    ...(lingering
      ? [
          `dragon's breath makes the lingering one${splash ? ' from the splash potion' : ''}, and a lingering potion with eight arrows crafts tipped arrows`,
        ]
      : []),
  ];
  if (bottles.length > 0) sentences.push(`${capitalise(bottles.join('; '))}.`);
  sentences.push('Potions need the Fabric mod jar export.');
  elements.push(element(potion, KINDS.potion, data, sentences.join(' ')));
  return { elements, assets };
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** `an awkward potion (water bottle and nether wart)`, `a water bottle`. */
function articleBase(label: string): string {
  const lower = label.charAt(0).toLowerCase() + label.slice(1);
  return `${/^[aeiou]/.test(lower) ? 'an' : 'a'} ${lower}`;
}
