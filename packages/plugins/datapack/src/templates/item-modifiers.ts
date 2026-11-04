/**
 * Item modifier templates: changes to an item stack, for `/item modify` or a loot entry.
 */
import type { ElementTemplate, Json } from '@msm/plugin-api';
import { kindDefaultOr } from './shared';

const KIND = 'minecraft:item_modifier';
const CATEGORY = 'Item modifiers';

function modifier(id: string, title: string, description: string, data: Json): ElementTemplate {
  return {
    id,
    kind: KIND,
    category: CATEGORY,
    title,
    description,
    data: () => structuredClone(data),
  };
}

export const itemModifierTemplates: readonly ElementTemplate[] = [
  {
    id: 'item_modifier',
    kind: KIND,
    category: CATEGORY,
    title: 'Set count',
    description: 'Changes an item stack, for example its count.',
    data: (context) => kindDefaultOr(context, { type: 'minecraft:set_count', count: 1 }),
  },
  modifier('item_modifier_set_name', 'Set name', 'Gives the item a custom name.', {
    type: 'minecraft:set_name',
    target: 'item_name',
    name: { text: 'Lucky Charm', color: 'gold', italic: false },
  }),
  modifier('item_modifier_set_lore', 'Add lore', 'Adds lines of lore under the item name.', {
    type: 'minecraft:set_lore',
    mode: 'append',
    lore: [{ text: 'Found in an old chest', color: 'gray', italic: true }],
  }),
  modifier(
    'item_modifier_set_enchantments',
    'Set enchantments',
    'Adds enchantments at fixed levels to the item.',
    {
      type: 'minecraft:set_enchantments',
      enchantments: { 'minecraft:sharpness': 2, 'minecraft:unbreaking': 1 },
      add: true,
    },
  ),
];
