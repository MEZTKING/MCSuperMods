/**
 * Loot table templates for blocks, chests, entities and fishing. Pools use the singular
 * `condition` and entries the singular `modifier`, as the current target's schema names them.
 */
import type { ElementTemplate, Json } from '@msm/plugin-api';

const KIND = 'minecraft:loot_table';
const CATEGORY = 'Loot tables';

function lootTable(
  id: string,
  prefix: string,
  title: string,
  description: string,
  data: Json,
): ElementTemplate {
  return {
    id,
    kind: KIND,
    category: CATEGORY,
    title,
    description,
    prefix,
    data: () => structuredClone(data),
  };
}

export const lootTableTemplates: readonly ElementTemplate[] = [
  lootTable('loot_table_block', 'blocks/', 'Block loot table', 'What a block drops when broken.', {
    type: 'minecraft:block',
    pools: [
      {
        rolls: 1,
        entries: [{ type: 'minecraft:item', name: 'minecraft:stone' }],
        condition: { type: 'minecraft:survives_explosion' },
      },
    ],
  }),
  lootTable(
    'loot_table_chest',
    'chests/',
    'Chest loot table',
    'What a generated chest contains: weighted entries rolled a random number of times.',
    {
      type: 'minecraft:chest',
      pools: [
        {
          rolls: { type: 'minecraft:uniform', min: 2, max: 4 },
          entries: [
            {
              type: 'minecraft:item',
              name: 'minecraft:iron_ingot',
              weight: 10,
              modifier: {
                type: 'minecraft:set_count',
                count: { type: 'minecraft:uniform', min: 1, max: 3 },
              },
            },
            { type: 'minecraft:item', name: 'minecraft:gold_ingot', weight: 5 },
            { type: 'minecraft:item', name: 'minecraft:diamond', weight: 1 },
          ],
        },
      ],
    },
  ),
  lootTable(
    'loot_table_entity',
    'entities/',
    'Entity loot table',
    'What a mob drops: more with Looting, and a rare drop only when a player kills it.',
    {
      type: 'minecraft:entity',
      pools: [
        {
          rolls: 1,
          entries: [
            {
              type: 'minecraft:item',
              name: 'minecraft:bone',
              modifier: [
                {
                  type: 'minecraft:set_count',
                  count: { type: 'minecraft:uniform', min: 0, max: 2 },
                },
                {
                  type: 'minecraft:enchanted_count_increase',
                  enchantment: 'minecraft:looting',
                  count: { type: 'minecraft:uniform', min: 0, max: 1 },
                },
              ],
            },
          ],
        },
        {
          rolls: 1,
          entries: [{ type: 'minecraft:item', name: 'minecraft:emerald' }],
          condition: {
            type: 'minecraft:all_of',
            terms: [
              { type: 'minecraft:killed_by_player' },
              { type: 'minecraft:random_chance', chance: 0.05 },
            ],
          },
        },
      ],
    },
  ),
  lootTable(
    'loot_table_fishing',
    'gameplay/',
    'Fishing loot table',
    'What a fishing rod catches: one weighted roll per catch.',
    {
      type: 'minecraft:fishing',
      pools: [
        {
          rolls: 1,
          entries: [
            { type: 'minecraft:item', name: 'minecraft:cod', weight: 60 },
            { type: 'minecraft:item', name: 'minecraft:salmon', weight: 25 },
            { type: 'minecraft:item', name: 'minecraft:tropical_fish', weight: 2 },
            { type: 'minecraft:item', name: 'minecraft:pufferfish', weight: 13 },
          ],
        },
      ],
    },
  ),
];
