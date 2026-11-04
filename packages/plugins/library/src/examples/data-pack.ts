/**
 * One commented example per tier-A data pack kind: recipe, loot table, advancement,
 * predicate, item modifier and function.
 */
import type { ExampleProject } from '@msm/plugin-api';
import { element, KINDS, rl } from '../content/bundle';
import { defineExample } from './define';

export const dataPackExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_recipe',
    title: 'Shaped recipe with a named result',
    description: 'A crafting recipe whose result carries a custom name and lore.',
    kind: KINDS.recipe,
    category: 'Recipes',
    tags: ['crafting', 'shaped', 'components'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'lucky_lantern'),
          KINDS.recipe,
          {
            type: 'minecraft:crafting_shaped',
            category: 'misc',
            pattern: [' G ', 'GTG', ' G '],
            key: { G: 'minecraft:gold_nugget', T: 'minecraft:torch' },
            result: {
              id: 'minecraft:lantern',
              count: 1,
              components: {
                'minecraft:item_name': 'Lucky Lantern',
                'minecraft:lore': ['Made from gold and a torch'],
                'minecraft:rarity': 'rare',
              },
            },
          },
          'pattern is the crafting grid, one string per row; a space is an empty slot. key maps each letter to an item id (or #tag). result is the item stack crafted: id, count and optional components, here a name, a lore line and a rarity colour. category only sorts the recipe in the recipe book. The recipe works in any crafting table after /reload.',
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_loot_table',
    title: 'Chest loot table',
    description: 'A treasure table with weighted entries and a rare bonus roll.',
    kind: KINDS.lootTable,
    category: 'Loot tables',
    tags: ['chest', 'weights', 'random_chance', '/loot'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'chests/treasure');
      return {
        elements: [
          element(
            id,
            KINDS.lootTable,
            {
              type: 'minecraft:chest',
              pools: [
                {
                  rolls: { type: 'minecraft:uniform', min: 2, max: 4 },
                  entries: [
                    {
                      type: 'minecraft:item',
                      name: 'minecraft:gold_ingot',
                      weight: 5,
                      modifier: {
                        type: 'minecraft:set_count',
                        count: { type: 'minecraft:uniform', min: 1, max: 3 },
                      },
                    },
                    { type: 'minecraft:item', name: 'minecraft:emerald', weight: 3 },
                    { type: 'minecraft:empty', weight: 2 },
                  ],
                },
                {
                  rolls: 1,
                  condition: { type: 'minecraft:random_chance', chance: 0.1 },
                  entries: [{ type: 'minecraft:item', name: 'minecraft:diamond' }],
                },
              ],
            },
            `A loot table is a list of pools. Each pool rolls rolls times and picks one entry per roll, weighted by weight (an empty entry drops nothing). modifier changes the dropped stack, here a random count. The second pool runs only when its condition passes: a 10 % chance of a diamond. Try /loot give @s loot ${id}, or set it as a chest's LootTable.`,
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_advancement',
    title: 'Advancement tab',
    description: 'A root advancement with its own tab and a child that rewards experience.',
    kind: KINDS.advancement,
    category: 'Advancements',
    tags: ['root', 'inventory_changed', 'rewards'],
    build: ({ namespace }) => {
      const root = rl(namespace, 'adventure/root');
      return {
        elements: [
          element(
            root,
            KINDS.advancement,
            {
              display: {
                icon: { id: 'minecraft:compass' },
                title: 'Adventure',
                description: 'Craft or find a compass',
                background: 'minecraft:gui/advancements/backgrounds/adventure',
                frame: 'task',
                show_toast: false,
                announce_to_chat: false,
              },
              criteria: {
                has_compass: {
                  trigger: 'minecraft:inventory_changed',
                  conditions: { items: [{ items: 'minecraft:compass' }] },
                },
              },
            },
            'An advancement without a parent is the root of a new tab; background is the tab texture. display sets the icon, title, description and frame (task, goal or challenge). criteria lists what must happen: here the inventory_changed trigger fires when a compass enters the inventory.',
          ),
          element(
            rl(namespace, 'adventure/far_traveller'),
            KINDS.advancement,
            {
              parent: root,
              display: {
                icon: { id: 'minecraft:filled_map' },
                title: 'Far Traveller',
                description: 'Hold a compass and a map',
                frame: 'goal',
              },
              criteria: {
                has_compass: {
                  trigger: 'minecraft:inventory_changed',
                  conditions: { items: [{ items: 'minecraft:compass' }] },
                },
                has_map: {
                  trigger: 'minecraft:inventory_changed',
                  conditions: { items: [{ items: 'minecraft:filled_map' }] },
                },
              },
              rewards: { experience: 50 },
            },
            'parent places it under the root. With two criteria the player needs both (requirements can change that). rewards grants 50 experience points.',
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_predicate',
    title: 'Stormy night predicate',
    description: 'A condition that is true during a thunderstorm or at night.',
    kind: KINDS.predicate,
    category: 'Predicates',
    tags: ['any_of', 'weather_check', 'time_check', 'execute if predicate'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'stormy_or_night');
      return {
        elements: [
          element(
            id,
            KINDS.predicate,
            {
              type: 'minecraft:any_of',
              terms: [
                { type: 'minecraft:weather_check', thundering: true },
                {
                  type: 'minecraft:time_check',
                  clock: 'minecraft:overworld',
                  value: { min: 13000, max: 23000 },
                  period: 24000,
                },
              ],
            },
            `A predicate is a named condition. any_of passes when one of its terms passes: weather_check tests rain or thunder, time_check tests the time of day (period 24000 makes it repeat daily; 13000 to 23000 is night). Use it in commands with execute if predicate ${id}, or from loot tables and advancements.`,
          ),
          element(
            rl(namespace, 'check_sky'),
            KINDS.function,
            {
              lines: [
                `execute if predicate ${id} run say Spooky skies!`,
                `execute unless predicate ${id} run say Calm skies.`,
              ],
            },
            'Run with /function to test the predicate.',
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_item_modifier',
    title: 'Name and lore modifier',
    description: 'Renames the held item and adds a lore line.',
    kind: KINDS.itemModifier,
    category: 'Item modifiers',
    tags: ['set_name', 'set_lore', '/item modify'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'heirloom');
      return {
        elements: [
          element(
            id,
            KINDS.itemModifier,
            {
              type: 'minecraft:sequence',
              functions: [
                {
                  type: 'minecraft:set_name',
                  target: 'item_name',
                  name: { text: 'Family Heirloom', color: 'gold' },
                },
                {
                  type: 'minecraft:set_lore',
                  mode: 'append',
                  lore: [{ text: 'Passed down for generations', color: 'gray', italic: true }],
                },
              ],
            },
            `An item modifier is one loot function; sequence runs several in order. set_name changes the item name (target item_name) or the custom name; set_lore adds lines under it. Text uses text components, so colour and style work. Try /item modify entity @s weapon.mainhand ${id}.`,
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_function',
    title: 'Function with execute',
    description: 'A function that uses scores and execute to react to the player.',
    kind: KINDS.function,
    category: 'Functions',
    tags: ['mcfunction', 'execute', 'scoreboard'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'heal_if_low');
      return {
        elements: [
          element(
            id,
            KINDS.function,
            {
              lines: [
                `# Run with /function ${id}`,
                'scoreboard objectives add health health',
                'execute store result score @s health run data get entity @s Health',
                'execute if score @s health matches ..10 run effect give @s minecraft:regeneration 5 1',
                'execute if score @s health matches ..10 run tellraw @s {"text":"Healing you up!","color":"green"}',
                'execute if score @s health matches 11.. run tellraw @s {"text":"You look fine.","color":"gray"}',
              ],
            },
            'A function is a list of commands without the leading slash; lines starting with # are comments. This one stores your health in a scoreboard and uses execute if score to branch. @s is whoever runs the function. The editor checks every line as you type.',
          ),
        ],
        assets: [],
      };
    },
  }),
];
