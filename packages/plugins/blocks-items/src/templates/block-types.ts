/**
 * `msm:block` templates, one per block type other than `block` (ADR 0069 D4; types of ADR 0067
 * D1 and ADR 0068 D1). They draw with vanilla textures by id through the editor-only `textures`
 * field (lowering writes the type's models), use vanilla set and wood types, vanilla trees and
 * vanilla items, and ids derived from the element's own id (the crop's seeds).
 */
import type { ElementTemplate, Json, JsonObject, TemplateContext } from '@msm/plugin-api';
import { BLOCK_KIND } from '../kinds';
import { displayName } from './shared';

const CATEGORY = 'Blocks';

/** Vanilla planks: mined faster with an axe, dropped by hand, burn as planks (ADR 0067 D3). */
const WOODEN_BREAKABLE = { hardness: 2, resistance: 3, tool: 'axe', requires_tool: false };
const PLANKS_FLAMMABLE = { burn_odds: 5, ignite_odds: 20 };

/** The fields every type template shares: format, name, item and drops. */
function common(
  context: TemplateContext,
  soundType: string,
  creativeTab: string,
  components: JsonObject,
): JsonObject {
  return {
    format: 1,
    display_name: displayName(context.path),
    sound_type: soundType,
    loot: 'self',
    item: { creative_tab: creativeTab },
    components,
  };
}

/** A template of one block type: the shared fields, then the type's own. */
function typeTemplate(
  id: string,
  title: string,
  description: string,
  build: (context: TemplateContext) => JsonObject,
): ElementTemplate {
  return {
    id,
    kind: BLOCK_KIND,
    category: CATEGORY,
    title,
    description,
    data: (context): Json => build(context),
  };
}

const textures = (map: Record<string, string>): JsonObject => ({ ...map });

/** The eight vanilla wheat stage textures, age 0 to 7. */
const WHEAT_STAGES = Array.from({ length: 8 }, (_, stage) => `minecraft:block/wheat_stage${stage}`);

export const blockTypeTemplates: readonly ElementTemplate[] = [
  typeTemplate(
    'msm_block_log',
    'Log or pillar',
    'A log that turns to the face you place it against, with bark on the sides and rings on the ends. It burns, and an axe strips it into a vanilla stripped oak log.',
    (context) => ({
      ...common(context, 'wood', 'minecraft:building_blocks', {
        'msm:breakable': { ...WOODEN_BREAKABLE },
        'msm:flammable': { burn_odds: 5, ignite_odds: 5 },
        'msm:strippable': { into: 'minecraft:stripped_oak_log' },
      }),
      type: 'pillar',
      textures: textures({
        side: 'minecraft:block/oak_log',
        end: 'minecraft:block/oak_log_top',
      }),
    }),
  ),
  typeTemplate(
    'msm_block_facing',
    'Facing block',
    'A block that turns its front towards you when placed, as a furnace does (four directions).',
    (context) => ({
      ...common(context, 'stone', 'minecraft:functional_blocks', {
        'msm:breakable': { hardness: 3.5, resistance: 3.5, tool: 'pickaxe' },
      }),
      type: 'horizontal',
      textures: textures({
        front: 'minecraft:block/furnace_front',
        side: 'minecraft:block/furnace_side',
        top: 'minecraft:block/furnace_top',
      }),
    }),
  ),
  typeTemplate(
    'msm_block_observer_like',
    'Observer-like block',
    'A block that faces any of six directions, up and down included, as an observer does. It has no redstone behaviour of its own.',
    (context) => ({
      ...common(context, 'stone', 'minecraft:redstone_blocks', {
        'msm:breakable': { hardness: 3, resistance: 3, tool: 'pickaxe' },
      }),
      type: 'directional',
      textures: textures({
        front: 'minecraft:block/observer_front',
        side: 'minecraft:block/observer_side',
        top: 'minecraft:block/observer_top',
      }),
    }),
  ),
  typeTemplate(
    'msm_block_slab',
    'Slab',
    'A half block that sits in the bottom or top half and stacks into a double slab, which drops two.',
    (context) => ({
      ...common(context, 'stone', 'minecraft:building_blocks', {
        'msm:breakable': { hardness: 2, resistance: 6, tool: 'pickaxe' },
      }),
      type: 'slab',
      textures: textures({ all: 'minecraft:block/stone_bricks' }),
    }),
  ),
  typeTemplate(
    'msm_block_stairs',
    'Stairs',
    'Stairs that form corners next to other stairs. They copy the look and behaviour of their base block, vanilla stone bricks here.',
    (context) => ({
      ...common(context, 'stone', 'minecraft:building_blocks', {
        'msm:breakable': { hardness: 1.5, resistance: 6, tool: 'pickaxe' },
      }),
      type: 'stairs',
      base_block: 'minecraft:stone_bricks',
      textures: textures({ all: 'minecraft:block/stone_bricks' }),
    }),
  ),
  typeTemplate(
    'msm_block_wall',
    'Wall',
    'A wall that connects to other walls and solid blocks and is too high to jump over.',
    (context) => ({
      ...common(context, 'stone', 'minecraft:building_blocks', {
        'msm:breakable': { hardness: 1.5, resistance: 6, tool: 'pickaxe' },
      }),
      type: 'wall',
      textures: textures({ texture: 'minecraft:block/stone_bricks' }),
    }),
  ),
  typeTemplate(
    'msm_block_fence',
    'Fence',
    'A wooden fence that connects to other wooden fences and solid blocks. It burns as planks do.',
    (context) => ({
      ...common(context, 'wood', 'minecraft:building_blocks', {
        'msm:breakable': { ...WOODEN_BREAKABLE },
        'msm:flammable': { ...PLANKS_FLAMMABLE },
      }),
      type: 'fence',
      textures: textures({ texture: 'minecraft:block/oak_planks' }),
    }),
  ),
  typeTemplate(
    'msm_block_fence_gate',
    'Fence gate',
    'A gate that opens when used and fits between fences and walls, with oak sounds.',
    (context) => ({
      ...common(context, 'wood', 'minecraft:redstone_blocks', {
        'msm:breakable': { ...WOODEN_BREAKABLE },
        'msm:flammable': { ...PLANKS_FLAMMABLE },
      }),
      type: 'fence_gate',
      wood_type: 'oak',
      textures: textures({ texture: 'minecraft:block/oak_planks' }),
    }),
  ),
  typeTemplate(
    'msm_block_door',
    'Door',
    'A two-block-high wooden door that opens by hand or with a redstone signal. Breaking either half drops one door.',
    (context) => ({
      ...common(context, 'wood', 'minecraft:redstone_blocks', {
        'msm:breakable': { hardness: 3, resistance: 3, tool: 'axe', requires_tool: false },
      }),
      type: 'door',
      set_type: 'wood',
      textures: textures({
        top: 'minecraft:block/oak_door_top',
        bottom: 'minecraft:block/oak_door_bottom',
      }),
    }),
  ),
  typeTemplate(
    'msm_block_trapdoor',
    'Trapdoor',
    'A wooden trapdoor that opens by hand or with a redstone signal and sits in the top or bottom half of a block.',
    (context) => ({
      ...common(context, 'wood', 'minecraft:redstone_blocks', {
        'msm:breakable': { hardness: 3, resistance: 3, tool: 'axe', requires_tool: false },
      }),
      type: 'trapdoor',
      set_type: 'wood',
      textures: textures({ texture: 'minecraft:block/oak_trapdoor' }),
    }),
  ),
  typeTemplate(
    'msm_block_button',
    'Button',
    'A stone button that gives a short redstone pulse when pressed (one second, as vanilla stone buttons). Arrows do not press it.',
    (context) => ({
      ...common(context, 'stone', 'minecraft:redstone_blocks', {
        'msm:breakable': { hardness: 0.5, resistance: 0.5, tool: 'pickaxe' },
      }),
      type: 'button',
      set_type: 'stone',
      textures: textures({ texture: 'minecraft:block/stone' }),
    }),
  ),
  typeTemplate(
    'msm_block_pressure_plate',
    'Pressure plate',
    'A stone pressure plate that gives a redstone signal while a player or mob stands on it. Dropped items do not press it.',
    (context) => ({
      ...common(context, 'stone', 'minecraft:redstone_blocks', {
        'msm:breakable': { hardness: 0.5, resistance: 0.5, tool: 'pickaxe' },
      }),
      type: 'pressure_plate',
      set_type: 'stone',
      textures: textures({ texture: 'minecraft:block/stone' }),
    }),
  ),
  typeTemplate(
    'msm_block_weighted_pressure_plate',
    'Weighted pressure plate',
    'A gold pressure plate whose signal grows with the number of entities on it, up to 15, as the vanilla light weighted plate.',
    (context) => ({
      ...common(context, 'metal', 'minecraft:redstone_blocks', {
        'msm:breakable': { hardness: 0.5, resistance: 0.5, tool: 'pickaxe' },
      }),
      type: 'pressure_plate',
      set_type: 'gold',
      weighted_max: 15,
      textures: textures({ texture: 'minecraft:block/gold_block' }),
    }),
  ),
  typeTemplate(
    'msm_block_pane',
    'Pane',
    'A thin pane that connects to other panes and walls, as glass panes do. Like glass, it drops nothing unless you add loot.',
    (context) => {
      const { loot: _loot, ...rest } = common(context, 'glass', 'minecraft:building_blocks', {
        'msm:breakable': { hardness: 0.3, resistance: 0.3 },
      });
      return {
        ...rest,
        type: 'pane',
        textures: textures({
          pane: 'minecraft:block/glass',
          edge: 'minecraft:block/glass_pane_top',
        }),
      };
    },
  ),
  typeTemplate(
    'msm_block_crop',
    'Crop',
    'A crop that grows through eight stages on farmland, planted from its own seeds (an item with this id plus "_seeds"). Fully grown it drops vanilla wheat and extra seeds; farmer villagers plant and harvest it.',
    (context) => ({
      format: 1,
      display_name: displayName(context.path),
      sound_type: 'grass',
      type: 'crop',
      max_age: 7,
      textures: { stages: [...WHEAT_STAGES] },
      item: { id: `${context.id}_seeds`, creative_tab: 'minecraft:natural_blocks' },
      loot: 'crop',
      crop_drops: { produce: 'minecraft:wheat' },
      components: { 'msm:breakable': { hardness: 0, resistance: 0 } },
    }),
  ),
  typeTemplate(
    'msm_block_sapling',
    'Sapling',
    'A sapling that grows into a vanilla oak tree, by itself or with bone meal. Point "tree" at your own tree feature to grow that instead.',
    (context) => ({
      ...common(context, 'grass', 'minecraft:natural_blocks', {
        'msm:breakable': { hardness: 0, resistance: 0 },
      }),
      type: 'sapling',
      tree: 'minecraft:oak',
      textures: textures({ sapling: 'minecraft:block/oak_sapling' }),
    }),
  ),
  typeTemplate(
    'msm_block_leaves',
    'Leaves',
    'Leaves tinted with the biome foliage colour that decay away from logs. Shears or Silk Touch drop the leaves; otherwise they drop now and then a vanilla oak sapling, sticks and apples. They burn as leaves do.',
    (context) => ({
      ...common(context, 'grass', 'minecraft:natural_blocks', {
        'msm:breakable': { hardness: 0.2, resistance: 0.2 },
        'msm:flammable': { burn_odds: 30, ignite_odds: 60 },
      }),
      type: 'leaves',
      tint: 'foliage',
      textures: textures({ all: 'minecraft:block/oak_leaves' }),
      loot: 'leaves',
      leaves_drops: { sapling: 'minecraft:oak_sapling', extra: { item: 'minecraft:apple' } },
    }),
  ),
];
