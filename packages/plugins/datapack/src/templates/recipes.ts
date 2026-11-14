/**
 * Recipe templates: the three crafting and cooking recipes the app has always offered, plus
 * every other cooking, stonecutting and smithing serializer. Only vanilla items and tags.
 */
import type { ElementTemplate, Json } from '@msm/plugin-api';

const KIND = 'minecraft:recipe';
const CATEGORY = 'Recipes';

function recipe(id: string, title: string, description: string, data: Json): ElementTemplate {
  return {
    id,
    kind: KIND,
    category: CATEGORY,
    title,
    description,
    data: () => structuredClone(data),
  };
}

export const recipeTemplates: readonly ElementTemplate[] = [
  recipe('recipe_shaped', 'Shaped recipe', 'A crafting recipe with a fixed pattern.', {
    type: 'minecraft:crafting_shaped',
    category: 'building',
    pattern: ['##', '##'],
    key: { '#': 'minecraft:stone' },
    result: { id: 'minecraft:stone_bricks', count: 4 },
  }),
  recipe(
    'recipe_shapeless',
    'Shapeless recipe',
    'A crafting recipe whose ingredients go anywhere in the grid.',
    {
      type: 'minecraft:crafting_shapeless',
      category: 'misc',
      ingredients: ['minecraft:gravel', 'minecraft:flint'],
      result: { id: 'minecraft:flint', count: 2 },
    },
  ),
  recipe('recipe_smelting', 'Smelting recipe', 'A furnace recipe: one ingredient, one result.', {
    type: 'minecraft:smelting',
    category: 'blocks',
    ingredient: 'minecraft:cobblestone',
    result: { id: 'minecraft:stone' },
    experience: 0.1,
    cookingtime: 200,
  }),
  recipe(
    'recipe_blasting',
    'Blasting recipe',
    'A blast furnace recipe: twice as fast as smelting, for ores and metal.',
    {
      type: 'minecraft:blasting',
      category: 'misc',
      ingredient: 'minecraft:raw_copper',
      result: { id: 'minecraft:copper_ingot' },
      experience: 0.7,
      cookingtime: 100,
    },
  ),
  recipe(
    'recipe_smoking',
    'Smoking recipe',
    'A smoker recipe: twice as fast as smelting, for food.',
    {
      type: 'minecraft:smoking',
      category: 'food',
      ingredient: 'minecraft:beef',
      result: { id: 'minecraft:cooked_beef' },
      experience: 0.35,
      cookingtime: 100,
    },
  ),
  recipe(
    'recipe_campfire_cooking',
    'Campfire recipe',
    'Cooks an item placed on a campfire; slow, but needs no fuel.',
    {
      type: 'minecraft:campfire_cooking',
      category: 'food',
      ingredient: 'minecraft:potato',
      result: { id: 'minecraft:baked_potato' },
      experience: 0.35,
      cookingtime: 600,
    },
  ),
  recipe(
    'recipe_stonecutting',
    'Stonecutter recipe',
    'One ingredient cut into a fixed number of results on the stonecutter.',
    {
      type: 'minecraft:stonecutting',
      ingredient: 'minecraft:stone',
      result: { id: 'minecraft:stone_brick_slab', count: 2 },
    },
  ),
  recipe(
    'recipe_smithing_transform',
    'Smithing upgrade recipe',
    'A smithing table upgrade: template, base item and addition give a new item.',
    {
      type: 'minecraft:smithing_transform',
      template: 'minecraft:netherite_upgrade_smithing_template',
      base: 'minecraft:diamond_pickaxe',
      addition: 'minecraft:netherite_ingot',
      result: { id: 'minecraft:netherite_pickaxe' },
    },
  ),
  recipe(
    'recipe_smithing_trim',
    'Smithing trim recipe',
    'Applies an armour trim pattern on the smithing table.',
    {
      type: 'minecraft:smithing_trim',
      template: 'minecraft:coast_armor_trim_smithing_template',
      base: '#minecraft:trimmable_armor',
      addition: '#minecraft:trim_materials',
      pattern: 'minecraft:coast',
    },
  ),
  recipe(
    'recipe_brewing',
    'Brewing recipe',
    'A brewing stand recipe: a potion plus an ingredient gives another potion. Names vanilla potions only.',
    {
      type: 'minecraft:brewing',
      input: { item: 'minecraft:potion', potion_contents: { potions: 'minecraft:awkward' } },
      reagent: { item: 'minecraft:amethyst_shard' },
      output: {
        id: 'minecraft:potion',
        components: { 'minecraft:potion_contents': { potion: 'minecraft:luck' } },
      },
    },
  ),
  recipe(
    'recipe_brewing_splash',
    'Brewing recipe: splash potion',
    'Turns a potion into its splash version with gunpowder; copy it per potion and per bottle.',
    {
      type: 'minecraft:brewing',
      input: { item: 'minecraft:potion', potion_contents: { potions: 'minecraft:luck' } },
      reagent: { item: 'minecraft:gunpowder' },
      output: {
        id: 'minecraft:splash_potion',
        components: { 'minecraft:potion_contents': { potion: 'minecraft:luck' } },
      },
    },
  ),
];
