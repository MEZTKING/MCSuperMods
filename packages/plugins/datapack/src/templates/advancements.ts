/**
 * Advancement templates: a root advancement that opens its own tab, and children for common
 * triggers. Children hang from `<project namespace>:root`, so create the root first.
 */
import type { ElementTemplate, Json, TemplateContext } from '@msm/plugin-api';
import { rootAdvancement } from './shared';

const KIND = 'minecraft:advancement';
const CATEGORY = 'Advancements';

/** A child advancement of the project's root with one criterion. */
function child(
  id: string,
  title: string,
  description: string,
  display: { icon: string; title: string; description: string },
  criterion: string,
  trigger: string,
  conditions: Json,
): ElementTemplate {
  return {
    id,
    kind: KIND,
    category: CATEGORY,
    title,
    description: `${description} Create the Root advancement first.`,
    data: (context: TemplateContext) => ({
      parent: rootAdvancement(context),
      display: {
        icon: { id: display.icon },
        title: display.title,
        description: display.description,
        frame: 'task',
      },
      criteria: {
        [criterion]: { trigger, conditions: structuredClone(conditions) },
      },
    }),
  };
}

export const advancementTemplates: readonly ElementTemplate[] = [
  {
    id: 'advancement',
    kind: KIND,
    category: CATEGORY,
    title: 'Root advancement',
    description: 'A root advancement with its own tab, granted on the first tick.',
    defaultName: 'root',
    data: () => ({
      display: {
        icon: { id: 'minecraft:diamond' },
        title: 'My advancement',
        description: 'Describe what to do here',
        background: 'minecraft:gui/advancements/backgrounds/stone',
        frame: 'task',
      },
      criteria: { requirement: { trigger: 'minecraft:tick' } },
    }),
  },
  child(
    'advancement_inventory_changed',
    'Obtain an item',
    'Granted when the player picks up an item.',
    { icon: 'minecraft:diamond', title: 'Shiny!', description: 'Pick up a diamond' },
    'has_item',
    'minecraft:inventory_changed',
    { items: [{ items: 'minecraft:diamond' }] },
  ),
  child(
    'advancement_recipe_crafted',
    'Craft a recipe',
    'Granted when the player crafts a given recipe.',
    { icon: 'minecraft:stone_bricks', title: 'Mason', description: 'Craft stone bricks' },
    'crafted',
    'minecraft:recipe_crafted',
    { recipes: 'minecraft:stone_bricks' },
  ),
  child(
    'advancement_killed_entity',
    'Kill a mob',
    'Granted when the player kills a given kind of mob.',
    { icon: 'minecraft:rotten_flesh', title: 'Zombie Slayer', description: 'Defeat a zombie' },
    'killed_zombie',
    'minecraft:player_killed_entity',
    {
      entity: {
        type: 'minecraft:entity_properties',
        entity: 'this',
        predicate: { entity_type: 'minecraft:zombie' },
      },
    },
  ),
  child(
    'advancement_location',
    'Visit a place',
    'Granted when the player stands in a given biome.',
    { icon: 'minecraft:sand', title: 'Desert Walker', description: 'Visit a desert' },
    'in_desert',
    'minecraft:location',
    {
      player: {
        type: 'minecraft:entity_properties',
        entity: 'this',
        predicate: { location: { biomes: 'minecraft:desert' } },
      },
    },
  ),
];
