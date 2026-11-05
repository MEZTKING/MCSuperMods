/**
 * Tag templates for every tag registry except `function` (see `functions.ts`), each with two
 * vanilla example values, except the `minecraft:placeable` painting variant tag and the
 * `minecraft:normal` world preset tag, which start empty.
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
  tag('tag_fluid', 'fluid', 'Fluid tag', 'fluids', ['minecraft:water', 'minecraft:lava']),
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
  {
    id: 'tag_painting_variant_placeable',
    kind: 'minecraft:tag/painting_variant',
    category: 'Tags',
    title: 'Painting variant tag: placeable',
    description:
      'Paintings a placed painting item can pick at random (minecraft:placeable); add painting variant ids to "values".',
    defaultNamespace: 'minecraft',
    defaultName: 'placeable',
    data: () => ({ replace: false, values: [] }),
  },
  {
    ...tag('tag_worldgen_biome', 'worldgen/biome', 'Biome tag (has_structure)', 'biomes', [
      'minecraft:plains',
      'minecraft:savanna',
    ]),
    description:
      'A named group of biomes, used as #<namespace>:has_structure/<name> in a structure\'s "biomes".',
    prefix: 'has_structure/',
  },
  tag('tag_worldgen_structure', 'worldgen/structure', 'Structure tag', 'structures', [
    'minecraft:village_plains',
    'minecraft:village_savanna',
  ]),
  {
    id: 'tag_worldgen_world_preset_normal',
    kind: 'minecraft:tag/worldgen/world_preset',
    category: 'Tags',
    title: 'World preset tag: normal',
    description:
      'Adds world presets to the create-world screen (minecraft:normal); add preset ids to "values".',
    defaultNamespace: 'minecraft',
    defaultName: 'normal',
    data: () => ({ replace: false, values: [] }),
  },
];
