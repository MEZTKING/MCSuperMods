/**
 * The Totem starter and Creator flow (ADR 0044 D4, D6): one `msm:item` with
 * `msm:death_protection` that saves its holder from death like a totem of undying, held in
 * either hand, and gives up to three effects; a flat item model with a `totem` placeholder
 * texture, an optional shaped recipe, its English name and the `msm:mod` metadata. Ids derive
 * from `totem_name`. New items need the Fabric mod jar export (with `msm_runtime`).
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
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

/** The number of effect slots the flow asks. */
const EFFECT_SLOTS = 3;

/** The vanilla items the optional recipe can surround with gold. */
const INGREDIENTS: readonly { value: string; label: string }[] = [
  { value: 'none', label: 'No recipe' },
  { value: 'minecraft:emerald', label: 'Emerald' },
  { value: 'minecraft:diamond', label: 'Diamond' },
  { value: 'minecraft:amethyst_shard', label: 'Amethyst shard' },
  { value: 'minecraft:echo_shard', label: 'Echo shard' },
  { value: 'minecraft:heart_of_the_sea', label: 'Heart of the sea' },
];

/** The Totem flow's questions (ADR 0044 D6), groups "Totem", "Effects" and "Recipe". */
export const TOTEM_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'totem_name',
    label: 'Totem name',
    description: 'The English name. Ids derive from it: Ruby Totem gives ruby_totem.',
    group: 'Totem',
    type: 'string',
    default: 'Ruby Totem',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'colour',
    label: 'Colour',
    description: 'The colour of the placeholder texture.',
    group: 'Totem',
    type: 'colour',
    default: hexFromRgb(COLOURS.ruby),
  },
  {
    id: 'clear_effects',
    label: 'Clear other effects first',
    description: 'As the totem of undying does, so bad effects such as poison end.',
    group: 'Effects',
    type: 'boolean',
    default: true,
  },
  ...effectParameters(
    'Effects',
    [
      { effect: 'minecraft:regeneration', seconds: 45, level: 2 },
      { effect: 'minecraft:absorption', seconds: 5, level: 2 },
      { effect: 'minecraft:fire_resistance', seconds: 40, level: 1 },
    ],
    false,
  ),
  {
    id: 'ingredient',
    label: 'Crafted from',
    description: 'One of it in the middle, surrounded by four gold ingots.',
    group: 'Recipe',
    type: 'choice',
    default: 'minecraft:emerald',
    choices: INGREDIENTS.map((entry) => ({ ...entry })),
  },
]);

export function totemBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(TOTEM_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'totem_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.ruby);
  const effects = chosenEffects(values, EFFECT_SLOTS);
  const clear = booleanValue(values, 'clear_effects');
  const ingredient = INGREDIENTS.find((entry) => entry.value === stringValue(values, 'ingredient'));

  const item = rl(namespace, name.id);
  const protection: JsonObject = { effects: consumeEffects(effects) };
  if (clear) protection.clear_effects = true;
  const elements = [
    packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
    modElement(
      namespace,
      projectName,
      `Adds ${articleFor(name.lower)} ${name.lower} that saves its holder from death.`,
    ),
    element(
      item,
      KINDS.item,
      {
        format: 1,
        model: rl(namespace, `item/${name.id}`),
        max_stack_size: 1,
        rarity: 'uncommon',
        creative_tab: 'minecraft:combat',
        components: { 'msm:death_protection': protection },
      },
      `A totem-like item: held in either hand when its holder would die, msm:death_protection uses it up and keeps the holder alive with half a heart, ${clear ? 'clears their effects and ' : ''}gives ${describeEffects(effects)}.`,
    ),
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
          type: 'minecraft:crafting_shaped',
          category: 'misc',
          pattern: [' G ', 'GXG', ' G '],
          key: { G: 'minecraft:gold_ingot', X: ingredient.value },
          result: { id: item, count: 1 },
        },
        `One ${ingredient.label.toLowerCase()} surrounded by four gold ingots makes the ${name.lower}.`,
      ),
    );
  }
  return { elements, assets: [texture(namespace, `item/${name.id}`, 'totem', colour)] };
}
