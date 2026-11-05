/**
 * The Food starter and Creator flow (ADR 0043 D2): one `msm:item` with `msm:food` (nutrition,
 * saturation and whether it can always be eaten), a flat item model with a placeholder
 * texture, an optional shapeless recipe from a vanilla ingredient and sugar, its English name
 * and the `msm:mod` metadata. Ids derive from `food_name`. New items need the Fabric mod jar
 * export (with `msm_runtime`).
 */
import type { BundleContext, ContentBundle, StarterParameter } from '@msm/plugin-api';
import {
  COLOURS,
  element,
  KINDS,
  modIdFromNamespace,
  packElement,
  rl,
  texture,
} from '../content/bundle';
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

/** Vanilla foods and crops the optional recipe can use, each with sugar. */
const INGREDIENTS: readonly { value: string; label: string }[] = [
  { value: 'none', label: 'No recipe' },
  { value: 'minecraft:apple', label: 'Apple' },
  { value: 'minecraft:sweet_berries', label: 'Sweet berries' },
  { value: 'minecraft:carrot', label: 'Carrot' },
  { value: 'minecraft:wheat', label: 'Wheat' },
  { value: 'minecraft:cocoa_beans', label: 'Cocoa beans' },
  { value: 'minecraft:melon_slice', label: 'Melon slice' },
];

/** The Food flow's questions (ADR 0043 D2), groups "Food", "Eating" and "Recipe". */
export const FOOD_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'food_name',
    label: 'Food name',
    description: 'The English name. Ids derive from it: Ruby Apple gives ruby_apple.',
    group: 'Food',
    type: 'string',
    default: 'Ruby Apple',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'colour',
    label: 'Colour',
    description: 'The colour of the placeholder texture.',
    group: 'Food',
    type: 'colour',
    default: hexFromRgb(COLOURS.ruby),
  },
  {
    id: 'nutrition',
    label: 'Hunger restored',
    description: 'In half drumsticks (an apple restores 4, a steak 8).',
    group: 'Eating',
    type: 'number',
    default: 4,
    min: 1,
    max: 20,
    step: 1,
  },
  {
    id: 'saturation',
    label: 'Saturation',
    description: 'How long the hunger stays away (an apple 0.3, a steak 0.8).',
    group: 'Eating',
    type: 'number',
    default: 0.6,
    min: 0,
    max: 2,
    step: 0.1,
  },
  {
    id: 'can_always_eat',
    label: 'Can be eaten when not hungry',
    description: 'Like a golden apple.',
    group: 'Eating',
    type: 'boolean',
    default: false,
  },
  {
    id: 'ingredient',
    label: 'Crafted from',
    description: 'One of it and one sugar make the food.',
    group: 'Recipe',
    type: 'choice',
    default: 'minecraft:apple',
    choices: INGREDIENTS.map((entry) => ({ ...entry })),
  },
]);

export function foodBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(FOOD_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'food_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.ruby);
  const nutrition = Math.round(numberValue(values, 'nutrition'));
  const saturation = Math.round(numberValue(values, 'saturation') * 100) / 100;
  const always = booleanValue(values, 'can_always_eat');
  const ingredient = INGREDIENTS.find((entry) => entry.value === stringValue(values, 'ingredient'));

  const item = rl(namespace, name.id);
  const model = rl(namespace, `item/${name.id}`);
  const food: Record<string, number | boolean> = { nutrition, saturation };
  if (always) food.can_always_eat = true;
  const elements = [
    packElement(
      namespace,
      `${projectName}: ${name.lower}`,
      'The pack description shown in the resource pack and data pack lists. The Fabric mod jar leaves pack.mcmeta out and puts the same assets and data inside the jar.',
    ),
    element(
      rl(namespace, 'mod'),
      KINDS.mod,
      {
        mod_id: modIdFromNamespace(namespace),
        version: '1.0.0',
        name: projectName,
        description: `Adds ${articleFor(name.lower)} ${name.lower}, a new food.`,
        authors: [],
        licence: 'All-Rights-Reserved',
      },
      'The mod metadata, written to fabric.mod.json when you export the Fabric mod jar. New items exist only in that jar, which also needs Fabric API and msm_runtime (nested in the jar unless you choose a separate runtime). The mod id must stay unique among the mods you install.',
    ),
    element(
      item,
      KINDS.item,
      {
        format: 1,
        model,
        max_stack_size: 64,
        creative_tab: 'minecraft:food_and_drinks',
        components: { 'msm:food': food },
      },
      `A new food. msm:food restores ${nutrition} hunger (half drumsticks) with a saturation of ${saturation}${always ? ', and it can be eaten even when the hunger bar is full' : ''}. Its English name comes from the language file below.`,
    ),
    element(
      model,
      KINDS.model,
      { parent: 'minecraft:item/generated', textures: { layer0: model } },
      `A flat item model drawn from textures/item/${name.id}.png. Paint over the placeholder to restyle it.`,
    ),
    element(
      rl(namespace, 'en_us'),
      KINDS.lang,
      { [`item.${namespace}.${name.id}`]: name.display },
      `The English name of the food: item.${namespace}.${name.id} is its translation key.`,
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
          ingredients: [ingredient.value, 'minecraft:sugar'],
          result: { id: item, count: 1 },
        },
        `${ingredient.label} and sugar anywhere in the crafting grid make ${articleFor(name.lower)} ${name.lower}. Element ids are unique across kinds, so the recipe has a name of its own.`,
      ),
    );
  }
  return { elements, assets: [texture(namespace, `item/${name.id}`, 'egg', colour)] };
}
