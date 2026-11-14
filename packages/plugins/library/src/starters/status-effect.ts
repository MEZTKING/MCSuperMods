/**
 * The Status effect starter and Creator flow (ADR 0055 D11): one `msm:effect` with its name,
 * colour, category and tinted 18 by 18 icon (`textures/mob_effect/<id>.png`); what it does
 * every few seconds (nothing extra, heal, hurt, particles or a data pack function, optionally
 * faster at higher levels); up to two stat changes; and how players get it: a drink
 * (`msm:consumable`, a glass bottle back), a throwable flask (`msm:throwable`, ADR 0056) whose
 * hit gives the effect to the mob hit, a brewed potion (`msm:potion` `<id>_potion`, ADR 0063
 * D10) or nothing (commands and other elements). The item has a
 * flat model and texture and an optional shapeless recipe; the mod metadata is added. Ids
 * derive from `effect_name`: the effect is `<id>`, the drink `<id>_tonic`, the flask
 * `<id>_flask`. Custom effects need the Fabric mod jar export (with `msm_runtime`).
 */
import type { BundleContext, ContentBundle, JsonObject, StarterParameter } from '@msm/plugin-api';
import {
  COLOURS,
  element,
  itemModel,
  KINDS,
  modElement,
  PACK_NOTES,
  packElement,
  rl,
  texture,
} from '../content/bundle';
import {
  attributeModifiers,
  chosenStats,
  colourInt,
  describeStat,
  effectIconAsset,
  PARTICLE_CHOICES,
  statParameters,
} from '../content/effects';
import {
  articleFor,
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
import { BREWING_INGREDIENTS } from './potion';

/** The number of stat slots the flow asks. */
const STAT_SLOTS = 2;

/** What the effect does every few seconds. */
const BEHAVIOURS: readonly { value: string; label: string }[] = [
  { value: 'none', label: 'Nothing extra' },
  { value: 'heal', label: 'Heals' },
  { value: 'hurt', label: 'Hurts' },
  { value: 'particles', label: 'Shows particles' },
  { value: 'function', label: 'Runs a function' },
];

/** How players get the effect. */
const SOURCES: readonly { value: string; label: string }[] = [
  { value: 'drink', label: 'A drink' },
  { value: 'flask', label: 'A throwable flask' },
  { value: 'potion', label: 'A brewed potion' },
  { value: 'none', label: 'Nothing (commands and other elements)' },
];

/** The vanilla items the optional recipe can use. */
const INGREDIENTS: readonly { value: string; label: string }[] = [
  { value: 'none', label: 'No recipe' },
  { value: 'minecraft:glistering_melon_slice', label: 'Glistering melon slice' },
  { value: 'minecraft:sugar', label: 'Sugar' },
  { value: 'minecraft:blaze_powder', label: 'Blaze powder' },
  { value: 'minecraft:ghast_tear', label: 'Ghast tear' },
  { value: 'minecraft:rabbit_foot', label: "Rabbit's foot" },
  { value: 'minecraft:fermented_spider_eye', label: 'Fermented spider eye' },
  { value: 'minecraft:phantom_membrane', label: 'Phantom membrane' },
  { value: 'minecraft:amethyst_shard', label: 'Amethyst shard' },
];

const TICK_ONLY = 'Used when What it does is not Nothing extra.';

/** The Status effect flow's questions, groups "Effect", "Behaviour", "Stats", "Getting it". */
export const STATUS_EFFECT_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'effect_name',
    label: 'Name',
    description: 'The English name. Ids derive from it: Ruby Rush gives ruby_rush.',
    group: 'Effect',
    type: 'string',
    default: 'Ruby Rush',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'colour',
    label: 'Colour',
    description: 'The colour of the swirling particles, the icon and the drink or flask.',
    group: 'Effect',
    type: 'colour',
    default: hexFromRgb(COLOURS.ruby),
  },
  {
    id: 'category',
    label: 'Good or bad',
    description:
      'Good effects show their name in blue, bad ones in red; milk clears both. Neutral effects are neither.',
    group: 'Effect',
    type: 'choice',
    default: 'beneficial',
    choices: [
      { value: 'beneficial', label: 'Good' },
      { value: 'harmful', label: 'Bad' },
      { value: 'neutral', label: 'Neutral' },
    ],
  },
  {
    id: 'behaviour',
    label: 'What it does',
    description: 'What happens to the mob or player with the effect, every few seconds.',
    group: 'Behaviour',
    type: 'choice',
    default: 'heal',
    choices: BEHAVIOURS.map((entry) => ({ ...entry })),
  },
  {
    id: 'amount',
    label: 'Amount',
    description: `Health healed or damage dealt each time, in half hearts. Used when What it does is Heals or Hurts.`,
    group: 'Behaviour',
    type: 'number',
    default: 1,
    min: 0.5,
    max: 20,
    step: 0.5,
  },
  {
    id: 'interval_seconds',
    label: 'Every how many seconds',
    description: `Regeneration acts every 2.5 seconds at level I. ${TICK_ONLY}`,
    group: 'Behaviour',
    type: 'number',
    default: 2,
    min: 0.25,
    max: 30,
    step: 0.25,
  },
  {
    id: 'faster_per_level',
    label: 'Stronger levels act faster',
    description: `Level II acts twice as often, level III three times, and so on. ${TICK_ONLY}`,
    group: 'Behaviour',
    type: 'boolean',
    default: true,
  },
  {
    id: 'particle',
    label: 'Particles',
    description: 'Used when What it does is Shows particles.',
    group: 'Behaviour',
    type: 'choice',
    default: 'minecraft:end_rod',
    choices: PARTICLE_CHOICES.map((entry) => ({ ...entry })),
  },
  ...statParameters('Stats', [
    { stat: 'minecraft:movement_speed', amount: 20 },
    { stat: 'none', amount: 1 },
  ]),
  {
    id: 'source',
    label: 'How players get it',
    description:
      'A drink gives the effect to whoever drinks it; a flask gives it to the mob or player it hits; a brewed potion comes from the brewing stand, with splash and lingering bottles and tipped arrows. Either way the /effect command works too.',
    group: 'Getting it',
    type: 'choice',
    default: 'drink',
    choices: SOURCES.map((entry) => ({ ...entry })),
  },
  {
    id: 'seconds',
    label: 'Seconds it lasts',
    description: 'How long the drink, flask or potion gives the effect for.',
    group: 'Getting it',
    type: 'number',
    default: 30,
    min: 1,
    max: 600,
    step: 1,
  },
  {
    id: 'level',
    label: 'Level',
    description: '1 is level I, 2 is level II, and so on.',
    group: 'Getting it',
    type: 'number',
    default: 1,
    min: 1,
    max: 5,
    step: 1,
  },
  {
    id: 'ingredient',
    label: 'Crafted from',
    description:
      'One of it with a glass bottle makes the drink; with a glass bottle and gunpowder, the flask.',
    group: 'Getting it',
    type: 'choice',
    default: 'minecraft:glistering_melon_slice',
    choices: INGREDIENTS.map((entry) => ({ ...entry })),
  },
  {
    id: 'brew_ingredient',
    label: 'Brewed from',
    description:
      'Added to an awkward potion in a brewing stand, it brews the potion. Used when How players get it is A brewed potion; none of these is a vanilla brewing ingredient.',
    group: 'Getting it',
    type: 'choice',
    default: 'minecraft:amethyst_shard',
    choices: [
      ...BREWING_INGREDIENTS.map((entry) => ({ ...entry })),
      { value: 'none', label: 'Not brewed (commands and creative only)' },
    ],
  },
]);

/** How the mod description ends, by source. */
const GIVEN_BY: Readonly<Record<string, string>> = {
  drink: ' and a drink that gives it',
  flask: ' and a flask that gives it',
  potion: ' and a potion of it',
  none: '',
};

/** `1 half heart`, `2.5 half hearts`. */
const halfHearts = (amount: number): string => `${amount} half heart${amount === 1 ? '' : 's'}`;

/** A number rounded to two decimals, so float sliders give tidy JSON. */
const tidy = (value: number): number => Math.round(value * 100) / 100;

export function statusEffectBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(STATUS_EFFECT_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'effect_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.ruby);
  const categoryValue = stringValue(values, 'category');
  const category =
    categoryValue === 'harmful' || categoryValue === 'neutral' ? categoryValue : 'beneficial';
  const behaviour =
    BEHAVIOURS.find((entry) => entry.value === stringValue(values, 'behaviour'))?.value ?? 'heal';
  const sourceValue = stringValue(values, 'source');
  const source =
    sourceValue === 'flask' || sourceValue === 'potion' || sourceValue === 'none'
      ? sourceValue
      : 'drink';
  const amount = tidy(numberValue(values, 'amount'));
  const intervalTicks = Math.max(1, Math.round(numberValue(values, 'interval_seconds') * 20));
  const faster = booleanValue(values, 'faster_per_level');
  const particle =
    PARTICLE_CHOICES.find((entry) => entry.value === stringValue(values, 'particle')) ??
    (PARTICLE_CHOICES[0] as { value: string; label: string });
  const stats = chosenStats(values, STAT_SLOTS);
  const seconds = Math.round(numberValue(values, 'seconds'));
  const amplifier = Math.max(0, Math.round(numberValue(values, 'level')) - 1);
  const ingredient = INGREDIENTS.find((entry) => entry.value === stringValue(values, 'ingredient'));

  const effect = rl(namespace, name.id);
  const tick = rl(namespace, `${name.id}_tick`);
  const fn = rl(namespace, `${name.id}/tick`);

  // The effect ---------------------------------------------------------------------------------
  const data: JsonObject = {
    format: 1,
    display_name: name.display,
    category,
    color: colourInt(colour),
  };
  if (stats.length > 0) data.attribute_modifiers = attributeModifiers(stats);
  const actions: JsonObject[] = [];
  let doing = 'It does nothing on its own beyond its stat changes and its swirling particles.';
  const every = `every ${tidy(intervalTicks / 20)} seconds (interval_ticks ${intervalTicks})${faster ? ', more often at higher levels (faster_per_level: level II twice as often)' : ''}`;
  if (behaviour === 'heal') {
    actions.push({ type: 'heal', amount });
    doing = `msm:on_tick fires ${tick} ${every}; its heal action gives the holder ${halfHearts(amount)}.`;
  } else if (behaviour === 'hurt') {
    actions.push({ type: 'damage', amount });
    doing = `msm:on_tick fires ${tick} ${every}; its damage action hurts the holder by ${halfHearts(amount)} of magic damage.`;
  } else if (behaviour === 'particles') {
    actions.push({ type: 'spawn_particle', particle: particle.value, count: 6, spread: 0.4 });
    doing = `msm:on_tick fires ${tick} ${every}; it shows ${particle.label.toLowerCase()} around the holder.`;
  } else if (behaviour === 'function') {
    actions.push({ type: 'run_function', function: fn });
    doing = `msm:on_tick fires ${tick} ${every}; it runs the function ${fn} at the holder.`;
  }
  if (actions.length > 0) {
    const onTick: JsonObject = { event: tick, interval_ticks: intervalTicks };
    if (faster) onTick.faster_per_level = true;
    data.components = { 'msm:on_tick': onTick };
    data.events = { [tick]: { actions } };
  }
  const statWords =
    stats.length === 0
      ? ''
      : ` Stat changes (attribute_modifiers): ${stats.map(describeStat).join(' and ')}; they are removed when the effect ends.`;
  const categoryWord =
    category === 'beneficial' ? 'a good' : category === 'harmful' ? 'a bad' : 'a neutral';
  const effectNotes = `A custom status effect, ${categoryWord} one (category ${category}) shown in the colour ${hexFromRgb(colour)}. ${doing}${statWords} Its icon is textures/mob_effect/${name.id}.png; paint over the placeholder to restyle it. Custom effects need the Fabric mod jar export.`;

  const elements = [
    packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
    modElement(namespace, projectName, `Adds the ${name.lower} status effect${GIVEN_BY[source]}.`),
    element(effect, KINDS.effect, data, effectNotes),
  ];
  const assets = [effectIconAsset(namespace, name.id, colour)];

  if (behaviour === 'function') {
    elements.push(
      element(
        fn,
        KINDS.function,
        {
          lines: [
            `# Runs every time ${name.lower} ticks, at the mob or player that has it.`,
            'particle minecraft:enchant ~ ~1 ~ 0.3 0.5 0.3 0 8',
          ],
        },
        `The function the effect's tick event runs, at the holder's position. Replace the particle line with your own commands.`,
      ),
    );
  }

  // How players get it -------------------------------------------------------------------------
  if (source === 'potion') {
    const potion = rl(namespace, `${name.id}_potion`);
    const brewWith = BREWING_INGREDIENTS.find(
      (entry) => entry.value === stringValue(values, 'brew_ingredient'),
    );
    const given: JsonObject = { id: effect, duration_ticks: seconds * 20 };
    if (amplifier > 0) given.amplifier = amplifier;
    const potionData: JsonObject = {
      format: 1,
      display_name: name.display,
      effects: [given],
    };
    if (brewWith !== undefined) potionData.brewing = { reagent: brewWith.value };
    elements.push(
      element(
        potion,
        KINDS.potion,
        potionData,
        `A potion of the effect: it gives ${effect} (level ${amplifier + 1}) for ${seconds} seconds and takes its colour. ${brewWith === undefined ? 'It is not brewed: get it from the creative menu or with /give.' : `An awkward potion and ${articleFor(brewWith.label)} ${brewWith.label.toLowerCase()} brew it in a brewing stand.`} Gunpowder makes the splash potion and dragon's breath the lingering one, which crafts tipped arrows; the Potion Studio adds longer and stronger versions. Its names are "Potion of ${name.display}" and so on. Potions need the Fabric mod jar export.`,
      ),
    );
  } else if (source !== 'none') {
    const itemPath = source === 'drink' ? `${name.id}_tonic` : `${name.id}_flask`;
    const item = rl(namespace, itemPath);
    const display = `${name.display} ${source === 'drink' ? 'Tonic' : 'Flask'}`;
    const given: JsonObject = { effect, seconds };
    if (amplifier > 0) given.amplifier = amplifier;
    const levelWord = `level ${amplifier + 1}`;
    let itemData: JsonObject;
    let itemNotes: string;
    if (source === 'drink') {
      itemData = {
        format: 1,
        model: rl(namespace, `item/${itemPath}`),
        display_name: display,
        max_stack_size: 16,
        creative_tab: 'minecraft:food_and_drinks',
        components: {
          'msm:consumable': {
            seconds: 1.6,
            animation: 'drink',
            effects: [given],
            converts_to: 'minecraft:glass_bottle',
          },
        },
      };
      itemNotes = `A drink: msm:consumable with the drink animation takes 1.6 seconds, gives ${effect} (${levelWord}) for ${seconds} seconds and leaves a glass bottle (converts_to). Custom effects work in consumable effects like vanilla ones.`;
    } else {
      const hit = rl(namespace, `${itemPath}_hit`);
      const shatter = rl(namespace, `${itemPath}_shatter`);
      const apply: JsonObject = { type: 'apply_effect', ...given, target: 'other' };
      const breakSound = { type: 'play_sound', sound: 'minecraft:entity.splash_potion.break' };
      const splash = {
        type: 'spawn_particle',
        particle: 'minecraft:splash',
        count: 12,
        spread: 0.4,
      };
      itemData = {
        format: 1,
        model: rl(namespace, `item/${itemPath}`),
        display_name: display,
        max_stack_size: 16,
        creative_tab: 'minecraft:combat',
        components: {
          'msm:throwable': {
            speed: 1,
            gravity: 0.05,
            after_throw: 'consume',
            sound: 'minecraft:entity.splash_potion.throw',
            on_hit_entity: { event: hit },
            on_hit_block: { event: shatter },
          },
        },
        events: {
          [hit]: { actions: [apply, breakSound, splash] },
          [shatter]: { actions: [breakSound, splash] },
        },
      };
      itemNotes = `A throwable flask: msm:throwable throws it like a splash potion (speed 1, gravity 0.05) and uses it up. Hitting a mob or player fires ${hit}, whose apply_effect gives the one hit (target other) ${effect} (${levelWord}) for ${seconds} seconds; hitting a block fires ${shatter}, which only shatters it.`;
    }
    elements.push(
      element(item, KINDS.item, itemData, itemNotes),
      itemModel(
        namespace,
        itemPath,
        'minecraft:item/generated',
        `A flat item model drawn from textures/item/${itemPath}.png. Paint over the placeholder to restyle it.`,
      ),
    );
    assets.push(
      texture(namespace, `item/${itemPath}`, source === 'drink' ? 'bottle' : 'flask', colour),
    );
    if (ingredient !== undefined && ingredient.value !== 'none') {
      const ingredientPath = ingredient.value.slice('minecraft:'.length);
      const ingredients =
        source === 'drink'
          ? [ingredient.value, 'minecraft:glass_bottle']
          : [ingredient.value, 'minecraft:glass_bottle', 'minecraft:gunpowder'];
      elements.push(
        element(
          rl(namespace, `${itemPath}_from_${ingredientPath}`),
          KINDS.recipe,
          {
            type: 'minecraft:crafting_shapeless',
            category: 'misc',
            ingredients,
            result: { id: item, count: 1 },
          },
          `${ingredient.label}, a glass bottle${source === 'flask' ? ' and gunpowder' : ''} anywhere in the crafting grid make ${articleFor(display)} ${display}.`,
        ),
      );
    }
  }
  return { elements, assets };
}
