/**
 * The Consumable starter and Creator flow (ADR 0044 D2, D6): one `msm:item` that is a food
 * with effects, a potion-like drink or a charm. A food has `msm:food` plus `msm:consumable`
 * (eating time, effects, cooldown); a drink has `msm:consumable` alone with the drink
 * animation and, by default, a glass bottle left over; a charm is not consumed: using it runs
 * an `msm:on_use` event whose `apply_effect` actions give the effects, with a cooldown. Each
 * has a flat item model with a placeholder texture (`egg`, `bottle` or `gem`), an optional
 * shapeless recipe, its English name and the `msm:mod` metadata. Ids derive from
 * `consumable_name`. New items need the Fabric mod jar export (with `msm_runtime`).
 */
import type { BundleContext, ContentBundle, JsonObject, StarterParameter } from '@msm/plugin-api';
import type { PlaceholderPattern } from '../assets/png';
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
  chosenEffects,
  consumeEffects,
  describeEffects,
  effectParameters,
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

/** The number of effect slots the flow asks. */
const EFFECT_SLOTS = 2;

/** What each kind is crafted with besides the chosen ingredient. */
const BASES: Readonly<Record<string, { item: string; label: string }>> = Object.freeze({
  food: { item: 'minecraft:sugar', label: 'sugar' },
  drink: { item: 'minecraft:glass_bottle', label: 'a glass bottle' },
  charm: { item: 'minecraft:gold_ingot', label: 'a gold ingot' },
});

/** The vanilla items the optional recipe can use. */
const INGREDIENTS: readonly { value: string; label: string }[] = [
  { value: 'none', label: 'No recipe' },
  { value: 'minecraft:sweet_berries', label: 'Sweet berries' },
  { value: 'minecraft:apple', label: 'Apple' },
  { value: 'minecraft:glow_berries', label: 'Glow berries' },
  { value: 'minecraft:golden_carrot', label: 'Golden carrot' },
  { value: 'minecraft:glistering_melon_slice', label: 'Glistering melon slice' },
  { value: 'minecraft:blaze_powder', label: 'Blaze powder' },
  { value: 'minecraft:amethyst_shard', label: 'Amethyst shard' },
];

const FOOD_ONLY = 'Used when Kind is Food.';

/** The Consumable flow's questions (ADR 0044 D6), groups "Item", "Using", "Effects", "Recipe". */
export const CONSUMABLE_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'consumable_name',
    label: 'Name',
    description: 'The English name. Ids derive from it: Ruby Tonic gives ruby_tonic.',
    group: 'Item',
    type: 'string',
    default: 'Ruby Tonic',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'colour',
    label: 'Colour',
    description: 'The colour of the placeholder texture.',
    group: 'Item',
    type: 'colour',
    default: hexFromRgb(COLOURS.ruby),
  },
  {
    id: 'kind',
    label: 'Kind',
    description:
      'Food is eaten and fills hunger; a drink is drunk and leaves its bottle; a charm is kept and gives its effects each time it is used.',
    group: 'Item',
    type: 'choice',
    default: 'drink',
    choices: [
      { value: 'food', label: 'Food' },
      { value: 'drink', label: 'Drink' },
      { value: 'charm', label: 'Charm' },
    ],
  },
  {
    id: 'nutrition',
    label: 'Hunger restored',
    description: `In half drumsticks (an apple restores 4). ${FOOD_ONLY}`,
    group: 'Using',
    type: 'number',
    default: 4,
    min: 1,
    max: 20,
    step: 1,
  },
  {
    id: 'saturation',
    label: 'Saturation',
    description: `How long the hunger stays away (an apple 0.3). ${FOOD_ONLY}`,
    group: 'Using',
    type: 'number',
    default: 0.6,
    min: 0,
    max: 2,
    step: 0.1,
  },
  {
    id: 'can_always_eat',
    label: 'Can be eaten when not hungry',
    description: FOOD_ONLY,
    group: 'Using',
    type: 'boolean',
    default: false,
  },
  {
    id: 'seconds',
    label: 'Seconds to eat or drink',
    description: 'Vanilla food and potions take 1.6 seconds. Charms are used at once.',
    group: 'Using',
    type: 'number',
    default: 1.6,
    min: 0.1,
    max: 10,
    step: 0.1,
  },
  {
    id: 'cooldown_seconds',
    label: 'Cooldown in seconds',
    description: 'How long before the item can be used again; 0 for none.',
    group: 'Using',
    type: 'number',
    default: 0,
    min: 0,
    max: 60,
    step: 0.5,
  },
  {
    id: 'returns_bottle',
    label: 'Leaves a glass bottle',
    description: 'Like a potion. Used when Kind is Drink.',
    group: 'Using',
    type: 'boolean',
    default: true,
  },
  ...effectParameters(
    'Effects',
    [
      { effect: 'minecraft:speed', seconds: 60, level: 1 },
      { effect: 'minecraft:regeneration', seconds: 10, level: 1 },
    ],
    true,
  ),
  {
    id: 'ingredient',
    label: 'Crafted from',
    description:
      'One of it with sugar (food), a glass bottle (drink) or a gold ingot (charm) makes the item.',
    group: 'Recipe',
    type: 'choice',
    default: 'minecraft:sweet_berries',
    choices: INGREDIENTS.map((entry) => ({ ...entry })),
  },
]);

/** A number rounded to two decimals, so float sliders give tidy JSON. */
const tidy = (value: number): number => Math.round(value * 100) / 100;

export function consumableBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(CONSUMABLE_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'consumable_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.ruby);
  const kindValue = stringValue(values, 'kind');
  const kind = kindValue === 'food' || kindValue === 'charm' ? kindValue : 'drink';
  const seconds = tidy(numberValue(values, 'seconds'));
  const cooldown = tidy(numberValue(values, 'cooldown_seconds'));
  const effects = chosenEffects(values, EFFECT_SLOTS);
  const ingredient = INGREDIENTS.find((entry) => entry.value === stringValue(values, 'ingredient'));
  const base = BASES[kind] as { item: string; label: string };

  const item = rl(namespace, name.id);
  const model = rl(namespace, `item/${name.id}`);
  const components: JsonObject = {};
  const data: JsonObject = {
    format: 1,
    model,
    max_stack_size: kind === 'food' ? 64 : kind === 'drink' ? 16 : 1,
    creative_tab: kind === 'charm' ? 'minecraft:tools_and_utilities' : 'minecraft:food_and_drinks',
    components,
  };
  let itemNotes: string;
  const effectWords = describeEffects(effects);
  if (kind === 'charm') {
    const event = rl(namespace, `${name.id}_used`);
    const onUse: JsonObject = { event };
    const ticks = Math.round(cooldown * 20);
    if (ticks > 0) onUse.cooldown_ticks = ticks;
    components['msm:on_use'] = onUse;
    data.events = {
      [event]: {
        actions: effects.map((entry) => {
          const action: JsonObject = {
            type: 'apply_effect',
            effect: entry.effect,
            seconds: entry.seconds,
          };
          if (entry.amplifier > 0) action.amplifier = entry.amplifier;
          action.target = 'self';
          return action;
        }),
      },
    };
    itemNotes = `A charm: using it runs the event ${event}, whose apply_effect actions give the user ${effectWords}${ticks > 0 ? `, then it waits ${cooldown} seconds (cooldown_ticks ${ticks})` : ''}. It is not used up. apply_effect has no chance, so every effect always applies.`;
  } else {
    const nutrition = Math.round(numberValue(values, 'nutrition'));
    if (kind === 'food') {
      const food: JsonObject = {
        nutrition,
        saturation: tidy(numberValue(values, 'saturation')),
      };
      if (booleanValue(values, 'can_always_eat')) food.can_always_eat = true;
      components['msm:food'] = food;
    }
    const consumable: JsonObject = { seconds, animation: kind === 'food' ? 'eat' : 'drink' };
    if (effects.length > 0) consumable.effects = consumeEffects(effects);
    if (kind === 'drink' && booleanValue(values, 'returns_bottle')) {
      consumable.converts_to = 'minecraft:glass_bottle';
    }
    if (cooldown > 0) consumable.cooldown_seconds = cooldown;
    components['msm:consumable'] = consumable;
    itemNotes =
      kind === 'food'
        ? `A food. msm:food restores ${nutrition} hunger; msm:consumable sets the eating time (${seconds} seconds) and gives ${effectWords}${cooldown > 0 ? `, with a ${cooldown} second cooldown` : ''}.`
        : `A drink: msm:consumable with the drink animation takes ${seconds} seconds and gives ${effectWords}${consumable.converts_to === undefined ? '' : ', then leaves a glass bottle (converts_to)'}${cooldown > 0 ? `, with a ${cooldown} second cooldown` : ''}. It restores no hunger.`;
  }

  const pattern: PlaceholderPattern = kind === 'food' ? 'egg' : kind === 'drink' ? 'bottle' : 'gem';
  const elements = [
    packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
    modElement(
      namespace,
      projectName,
      `Adds ${articleFor(name.lower)} ${name.lower}, a new ${kind}.`,
    ),
    element(item, KINDS.item, data, itemNotes),
    itemModel(
      namespace,
      name.id,
      'minecraft:item/generated',
      `A flat item model drawn from textures/item/${name.id}.png. Paint over the placeholder to restyle it.`,
    ),
    element(
      rl(namespace, 'en_us'),
      KINDS.lang,
      { [`item.${namespace}.${name.id}`]: name.display },
      `The English name: item.${namespace}.${name.id} is its translation key.`,
    ),
  ];
  if (ingredient !== undefined && ingredient.value !== 'none') {
    const ingredientPath = ingredient.value.slice('minecraft:'.length);
    elements.push(
      element(
        rl(namespace, `${name.id}_from_${ingredientPath}`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shapeless',
          category: 'misc',
          ingredients: [ingredient.value, base.item],
          result: { id: item, count: 1 },
        },
        `${ingredient.label} and ${base.label} anywhere in the crafting grid make ${articleFor(name.lower)} ${name.lower}.`,
      ),
    );
  }
  return { elements, assets: [texture(namespace, `item/${name.id}`, pattern, colour)] };
}
