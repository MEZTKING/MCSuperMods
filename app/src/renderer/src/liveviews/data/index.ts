/**
 * Batch 2's views (ADR 0120, Live views 2: data): one entry per kind, each lazily importing a
 * stub file of this folder that says "not yet" inside the frame until its brief builds it:
 * B609 Roll it, B610 Try it on and the enchantment, B611 advancements, dialogs and sample lines,
 * B612 tags, B613 functions, B614 block rules. A brief edits its own stub files only; this index
 * is B601's and is not touched again.
 */

import type { LiveViewLoader } from '../registry';

const rollIt: LiveViewLoader = () => import('./loot/RollIt');
const tryItOn: LiveViewLoader = () => import('./TryItOn');
const enchantment: LiveViewLoader = () => import('./EnchantmentCard');
const advancement: LiveViewLoader = () => import('./advancement/AdvancementTree');
const dialog: LiveViewLoader = () => import('./dialog/DialogScreen');
const sampleLine: LiveViewLoader = () => import('./lines/SampleLine');
const tag: LiveViewLoader = () => import('./tag/TagMembers');
const fn: LiveViewLoader = () => import('./FunctionLines');
const blockRules: LiveViewLoader = () => import('./BlockRules');

/** The 20 tag kinds that get the resolved members (the merchant trade tag has its own screen). */
export const TAG_VIEW_REGISTRIES = Object.freeze([
  'block',
  'item',
  'entity_type',
  'fluid',
  'game_event',
  'function',
  'damage_type',
  'enchantment',
  'painting_variant',
  'banner_pattern',
  'dialog',
  'instrument',
  'point_of_interest_type',
  'potion',
  'timeline',
  'worldgen/biome',
  'worldgen/feature',
  'worldgen/flat_level_generator_preset',
  'worldgen/structure',
  'worldgen/world_preset',
] as const);

/** The views of batch 2 by element kind id. */
export const DATA_VIEWS: Readonly<Record<string, LiveViewLoader>> = Object.freeze({
  // B609: Roll it.
  'minecraft:loot_table': rollIt,
  'msm:loot_addition': rollIt,
  'minecraft:enchantment_provider': rollIt,
  'minecraft:trial_spawner': rollIt,
  // B610: tried on a sample player, block or item.
  'minecraft:predicate': tryItOn,
  'minecraft:item_modifier': tryItOn,
  'minecraft:enchantment': enchantment,
  // B611: the tab as a tree, the screen, the sample line.
  'minecraft:advancement': advancement,
  'minecraft:dialog': dialog,
  'minecraft:damage_type': sampleLine,
  'minecraft:chat_type': sampleLine,
  // B612: the resolved members.
  ...Object.fromEntries(TAG_VIEW_REGISTRIES.map((registry) => [`minecraft:tag/${registry}`, tag])),
  // B613: what Try it understands of a function.
  'minecraft:function': fn,
  // B614: tried on a block in Try it.
  'minecraft:block_transformer': blockRules,
  'msm:vanilla_block_rules': blockRules,
});
