/**
 * Tag templates for every tag registry except `function` (see `functions.ts`), each with two
 * vanilla example values.
 */
import type { ElementTemplate } from '@msm/plugin-api';

function tag(
  id: string,
  registry: string,
  title: string,
  noun: string,
  values: readonly string[],
): ElementTemplate {
  return {
    id,
    kind: `minecraft:tag/${registry}`,
    category: 'Tags',
    title,
    description: `A named group of ${noun}, used as #<namespace>:<name>.`,
    data: () => ({ replace: false, values: [...values] }),
  };
}

export const tagTemplates: readonly ElementTemplate[] = [
  tag('tag_item', 'item', 'Item tag', 'items', ['minecraft:diamond', 'minecraft:emerald']),
  tag('tag_block', 'block', 'Block tag', 'blocks', [
    'minecraft:diamond_ore',
    'minecraft:deepslate_diamond_ore',
  ]),
  tag('tag_entity_type', 'entity_type', 'Entity type tag', 'entity types', [
    'minecraft:zombie',
    'minecraft:husk',
  ]),
  tag('tag_fluid', 'fluid', 'Fluid tag', 'fluids', ['minecraft:water', 'minecraft:flowing_water']),
  tag('tag_game_event', 'game_event', 'Game event tag', 'game events', [
    'minecraft:block_open',
    'minecraft:block_close',
  ]),
  tag('tag_damage_type', 'damage_type', 'Damage type tag', 'damage types', [
    'minecraft:cactus',
    'minecraft:sweet_berry_bush',
  ]),
  tag('tag_enchantment', 'enchantment', 'Enchantment tag', 'enchantments', [
    'minecraft:sharpness',
    'minecraft:smite',
  ]),
];
