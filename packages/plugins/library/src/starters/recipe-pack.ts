/**
 * The Recipe pack starter: one recipe of each common type, an item tag used as an
 * ingredient, an advancement for crafting one of them and a load message.
 */
import type { BundleContext, ContentBundle } from '@msm/plugin-api';
import { element, KINDS, packElement, rl } from '../content/bundle';

export function recipePackBundle({ namespace, projectName }: BundleContext): ContentBundle {
  const gems = rl(namespace, 'gems');
  const shaped = rl(namespace, 'gem_lantern');
  return {
    elements: [
      packElement(namespace, `${projectName}: new recipes`),
      element(
        gems,
        KINDS.tagItem,
        { values: ['minecraft:emerald', 'minecraft:diamond', 'minecraft:amethyst_shard'] },
        `An item tag used as a recipe ingredient (#${gems}): any one of its items fits that slot.`,
      ),
      element(
        shaped,
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shaped',
          category: 'building',
          pattern: ['III', 'IGI', 'III'],
          key: { I: 'minecraft:iron_nugget', G: `#${gems}` },
          result: { id: 'minecraft:lantern', count: 2 },
        },
        'A shaped recipe: the pattern is the crafting grid and key says which item each letter means. The centre takes any gem from the gems tag.',
      ),
      element(
        rl(namespace, 'flint_from_gravel'),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shapeless',
          category: 'misc',
          ingredients: ['minecraft:gravel', 'minecraft:gravel'],
          result: { id: 'minecraft:flint', count: 2 },
        },
        'A shapeless recipe: the ingredients may go anywhere in the grid. List an item twice to need two of it.',
      ),
      element(
        rl(namespace, 'leather_from_rotten_flesh'),
        KINDS.recipe,
        {
          type: 'minecraft:smelting',
          category: 'misc',
          ingredient: 'minecraft:rotten_flesh',
          result: { id: 'minecraft:leather' },
          experience: 0.1,
          cookingtime: 200,
        },
        'A furnace recipe. cookingtime is in ticks (200 is ten seconds); experience is what the player collects from the furnace.',
      ),
      element(
        rl(namespace, 'iron_from_raw_iron_block'),
        KINDS.recipe,
        {
          type: 'minecraft:blasting',
          category: 'misc',
          ingredient: 'minecraft:raw_iron_block',
          result: { id: 'minecraft:iron_block' },
          experience: 6.3,
          cookingtime: 900,
        },
        'A blast furnace recipe. Blast furnaces usually cook twice as fast as furnaces, so their recipes use half the furnace time.',
      ),
      element(
        rl(namespace, 'stone_stairs_from_stone'),
        KINDS.recipe,
        {
          type: 'minecraft:stonecutting',
          ingredient: 'minecraft:stone',
          result: { id: 'minecraft:stone_stairs', count: 2 },
        },
        'A stonecutter recipe: one ingredient, one result. Each stonecutter recipe is one button in the stonecutter.',
      ),
      element(
        rl(namespace, 'root'),
        KINDS.advancement,
        {
          display: {
            icon: { id: 'minecraft:lantern' },
            title: 'Bright Idea',
            description: 'Craft a lantern from a gem',
            background: 'minecraft:gui/advancements/backgrounds/stone',
            frame: 'task',
          },
          criteria: {
            crafted_lantern: {
              trigger: 'minecraft:recipe_crafted',
              conditions: { recipes: shaped },
            },
          },
        },
        'A root advancement granted by crafting the gem lantern recipe; recipe_crafted names the recipe id.',
      ),
      element(
        rl(namespace, 'load'),
        KINDS.function,
        {
          lines: [
            '# Runs on every /reload through the #minecraft:load function tag.',
            `tellraw @a {"text":"${namespace}: new recipes loaded","color":"gold"}`,
          ],
        },
        'Announces the pack when it loads.',
      ),
      element(
        'minecraft:load',
        KINDS.tagFunction,
        { values: [rl(namespace, 'load')] },
        'Runs the load function each time the data pack loads.',
      ),
    ],
    assets: [],
  };
}
