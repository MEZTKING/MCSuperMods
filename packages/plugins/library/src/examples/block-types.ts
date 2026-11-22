/**
 * Block family examples (ADR 0069 D4): a wood set, a stone set, a crop, a tree, a rotatable
 * machine-like block and an iron-door-like door; then the plants, the pot and the copper pieces
 * of vanilla parity 3 (ADR 0112 D2, B518), and the per-kind example of `msm:vanilla_block_rules`
 * (ADR 0105 D4). The first four are the Creator flows with
 * answers of their own, without the pack and mod elements (an example is copied into a project
 * that has them already); the last two are written by hand. Every example's ids differ from the
 * others', so the `examples/blocks-items` mirror holds them all in one project. New blocks need
 * the Fabric mod jar export.
 */
import type { BundleContext, ContentBundle, ExampleProject, Json } from '@msm/plugin-api';
import { COLOURS, element, KINDS, rl, texture } from '../content/bundle';
import { hexFromRgb } from '../content/parameters';
import { cavePlantsBundle } from '../starters/cave-plants';
import { copperSetBundle } from '../starters/copper-set';
import { cropBundle } from '../starters/crop';
import { desertPlantsBundle } from '../starters/desert-plants';
import { flowerPotBundle } from '../starters/flower-pot';
import { stoneSetBundle } from '../starters/stone-set';
import { treeBundle } from '../starters/tree';
import { woodSetBundle } from '../starters/wood-set';
import { defineExample } from './define';

/** The gallery category of the block family examples. */
const BLOCKS = 'Blocks';

/**
 * The bundle of a Creator flow for `values`, without its `pack.mcmeta` and `msm:mod` elements.
 */
function fromFlow(
  build: (context: BundleContext) => ContentBundle,
  values: Readonly<Record<string, Json>>,
): (context: BundleContext) => ContentBundle {
  return (context) => {
    const bundle = build({ ...context, values: { ...values } });
    return {
      elements: bundle.elements.filter(
        (entry) => entry.kind !== KINDS.pack && entry.kind !== KINDS.mod,
      ),
      assets: bundle.assets,
    };
  };
}

/** The block family examples, in gallery order. */
export const blockTypeExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_msm_wood_set',
    title: 'Elm wood set',
    description:
      'A whole wood set from the Wood set flow: logs, planks, stairs, slab, fence, gate, door, trapdoor, button, plate, foliage-tinted leaves and a sapling that grows an elm tree.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['wood set', 'block types', 'tree', 'recipes', 'mod'],
    build: fromFlow(woodSetBundle, {
      wood_name: 'Elm',
      leaf_tint: 'foliage',
      tree_shape: 'fancy',
    }),
  }),
  defineExample({
    id: 'example_msm_stone_set',
    title: 'Shale stone set',
    description:
      'Every member of the Stone set flow: the stone, its stairs, slab and wall, a button and pressure plate, polished shale with its own shapes, bricks and a pillar, crafted and stonecut.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['stone set', 'block types', 'stonecutting', 'recipes', 'mod'],
    build: fromFlow(stoneSetBundle, {
      stone_name: 'Shale',
      colour: hexFromRgb(COLOURS.slate),
      members: [
        'block',
        'stairs',
        'slab',
        'wall',
        'button',
        'pressure_plate',
        'polished',
        'bricks',
        'pillar',
      ],
    }),
  }),
  defineExample({
    id: 'example_msm_crop',
    title: 'Onion crop',
    description:
      'A crop planted from its produce, as carrots: onions grow through eight stages, are eaten raw and grow wild on grass in forests.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['crop', 'farming', 'food', 'world generation', 'mod'],
    build: fromFlow(cropBundle, {
      crop_name: 'Onion',
      colour: hexFromRgb(COLOURS.amber),
      produce: 'produce',
      nutrition: 2,
      harvest_max: 3,
      wild: true,
    }),
  }),
  defineExample({
    id: 'example_msm_tree',
    title: 'Silver birch tree',
    description:
      'A sapling that grows a tall branching tree of vanilla birch logs and new silver leaves, and grows in forests.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['tree', 'sapling', 'leaves', 'world generation', 'mod'],
    build: fromFlow(treeBundle, {
      tree_name: 'Silver Birch',
      log: 'minecraft:birch_log',
      leaf_colour: hexFromRgb(COLOURS.frost),
      tree_shape: 'fancy',
    }),
  }),
  defineExample({
    id: 'example_msm_machine_block',
    title: 'Crusher',
    description:
      'A machine-like block that turns its front towards you when placed, as a furnace does.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['horizontal', 'block types', 'facing', 'mod'],
    build: ({ namespace }) => {
      const crusher = rl(namespace, 'crusher');
      const side = rl(namespace, 'block/crusher');
      const front = rl(namespace, 'block/crusher_front');
      const top = rl(namespace, 'block/crusher_top');
      return {
        elements: [
          element(
            crusher,
            KINDS.block,
            {
              format: 1,
              display_name: 'Crusher',
              type: 'horizontal',
              sound_type: 'metal',
              loot: 'self',
              item: { creative_tab: 'minecraft:functional_blocks' },
              textures: { side, front, top },
              components: {
                'msm:breakable': { hardness: 3.5, resistance: 3.5, tool: 'pickaxe' },
              },
            },
            'A block of type horizontal: it faces one of four directions, towards the player who places it. Lowering writes the model from textures (vanilla orientable: front, side and top) and a block state with one turned variant per facing, so there is no model element. Give it behaviour with components such as msm:on_interact; the facing is only its look.',
          ),
        ],
        assets: [
          texture(namespace, 'block/crusher', 'plain', COLOURS.slate),
          texture(namespace, 'block/crusher_front', 'block_front', COLOURS.slate),
          texture(namespace, 'block/crusher_top', 'polished_stone', COLOURS.slate),
        ],
      };
    },
  }),
  defineExample({
    id: 'example_msm_iron_door',
    title: 'Vault door',
    description:
      'A two-block-high metal door that opens only with a redstone signal, as an iron door, with a stone button to open it.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['door', 'redstone', 'block types', 'set type', 'mod'],
    build: ({ namespace }) => {
      const door = rl(namespace, 'vault_door');
      const button = rl(namespace, 'vault_button');
      const top = rl(namespace, 'block/vault_door_top');
      const bottom = rl(namespace, 'block/vault_door_bottom');
      return {
        elements: [
          element(
            door,
            KINDS.block,
            {
              format: 1,
              display_name: 'Vault Door',
              type: 'door',
              set_type: 'iron',
              sound_type: 'metal',
              loot: 'self',
              item: { creative_tab: 'minecraft:redstone_blocks' },
              textures: { top, bottom },
              components: {
                'msm:breakable': { hardness: 5, resistance: 5, tool: 'pickaxe' },
              },
            },
            'A door of set type iron: hands do not open it, only a redstone signal such as the button beside it, and it makes the iron door sounds. The door places both halves at once and drops one door from either half. Its item is the flat door picture, as vanilla doors.',
          ),
          element(
            button,
            KINDS.block,
            {
              format: 1,
              display_name: 'Vault Button',
              type: 'button',
              set_type: 'stone',
              sound_type: 'stone',
              loot: 'self',
              item: { creative_tab: 'minecraft:redstone_blocks' },
              textures: { texture: 'minecraft:block/polished_blackstone' },
              components: {
                'msm:breakable': {
                  hardness: 0.5,
                  resistance: 0.5,
                  tool: 'pickaxe',
                  requires_tool: false,
                },
              },
            },
            'A stone button of vanilla polished blackstone: a one-second pulse that opens the vault door when placed next to it.',
          ),
        ],
        assets: [
          texture(namespace, 'block/vault_door_top', 'door_top', COLOURS.slate),
          texture(namespace, 'block/vault_door_bottom', 'door_bottom', COLOURS.slate),
        ],
      };
    },
  }),
  // Vanilla parity 3 (ADR 0112 D2, B518): the plant and pot flows and the Copper set's new
  // pieces, each with answers of its own.
  defineExample({
    id: 'example_msm_ember_vines',
    title: 'Ember vines with glowing berries',
    description:
      'Vines that hang from cave ceilings and bear glowing berries you pick and eat, as cave vines, from the Cave plants flow.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['growing plant', 'berries', 'light', 'cave', 'mod'],
    build: fromFlow(cavePlantsBundle, { plant_name: 'Ember Vine', kind: 'cave_vine' }),
  }),
  defineExample({
    id: 'example_msm_sea_ribbon',
    title: 'Sea ribbon',
    description:
      'A water plant that grows up from the sea floor a block at a time, as kelp, from the Cave plants flow.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['growing plant', 'water', 'kelp', 'mod'],
    build: fromFlow(cavePlantsBundle, {
      plant_name: 'Sea Ribbon',
      kind: 'kelp',
      colour: hexFromRgb([46, 128, 96]),
    }),
  }),
  defineExample({
    id: 'example_msm_glow_moss',
    title: 'Glow moss',
    description:
      'A thin moss that covers any side of a block, glows softly and spreads with bone meal, as glow lichen, from the Cave plants flow.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['multiface', 'light', 'cave', 'mod'],
    build: fromFlow(cavePlantsBundle, {
      plant_name: 'Glow Moss',
      kind: 'lichen',
      colour: hexFromRgb([118, 140, 104]),
      berry_colour: hexFromRgb([226, 206, 128]),
      light: 7,
    }),
  }),
  defineExample({
    id: 'example_msm_dune_reed',
    title: 'Dune reed',
    description:
      'A reed that grows tall by water on sand and grass and makes sugar, as sugar cane, from the Desert plants flow.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['column plant', 'sugar cane', 'recipe', 'mod'],
    build: fromFlow(desertPlantsBundle, { plant_name: 'Dune Reed', kind: 'cane' }),
  }),
  defineExample({
    id: 'example_msm_spine_cactus',
    title: 'Spine cactus',
    description:
      'A tall spiny cactus that grows twice as high as vanilla cactus, hurts what touches it and smelts into green dye, from the Desert plants flow.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['column plant', 'cactus', 'smelting', 'mod'],
    build: fromFlow(desertPlantsBundle, {
      plant_name: 'Spine Cactus',
      kind: 'cactus',
      height: 'taller',
      colour: hexFromRgb([74, 128, 52]),
    }),
  }),
  defineExample({
    id: 'example_msm_reed_bamboo',
    title: 'Reed bamboo',
    description:
      'A woody stalk that grows from a shoot, carries leaves near its top and makes sticks, as bamboo, from the Desert plants flow.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['column plant', 'bamboo', 'recipe', 'mod'],
    build: fromFlow(desertPlantsBundle, {
      plant_name: 'Reed Bamboo',
      kind: 'bamboo',
      colour: hexFromRgb([150, 170, 60]),
    }),
  }),
  defineExample({
    id: 'example_msm_wide_leaf',
    title: 'Wide leaf',
    description:
      'A big leaf on a stem that tips under you, and a small one that bone meal grows into it, as big and small dripleaf, from the Desert plants flow.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['dripleaf', 'bone meal', 'mod'],
    build: fromFlow(desertPlantsBundle, { plant_name: 'Wide Leaf', kind: 'dripleaf' }),
  }),
  defineExample({
    id: 'example_msm_clay_planter',
    title: 'Clay planter',
    description:
      'A flower pot of its own that takes six vanilla flowers and saplings, crafted from clay, from the Flower pot flow.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['flower pot', 'potted plant', 'recipe', 'mod'],
    build: fromFlow(flowerPotBundle, {
      pot_name: 'Clay Planter',
      plants: [
        'minecraft:dandelion',
        'minecraft:poppy',
        'minecraft:allium',
        'minecraft:cornflower',
        'minecraft:oak_sapling',
        'minecraft:birch_sapling',
      ],
      ingredient: 'minecraft:clay_ball',
    }),
  }),
  defineExample({
    id: 'example_msm_bronze_fittings',
    title: 'Bronze fittings that age',
    description:
      'A rod, a button, a pressure plate, a fence, a gate, a wall and a chest that joins into a double chest, all of a bronze that turns green as copper does, with waxed copies, from the Copper set flow. Lightning scrapes them back.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['weathering', 'waxing', 'lightning', 'double chest', 'copper', 'mod'],
    build: fromFlow(copperSetBundle, {
      metal_name: 'Bronze',
      colour: hexFromRgb([176, 120, 56]),
      members: ['block', 'rod', 'button', 'pressure_plate', 'fence', 'fence_gate', 'wall', 'chest'],
    }),
  }),
];

/** The id of the kind of rules for vanilla blocks (ADR 0105 D4). */
const VANILLA_BLOCK_RULES = 'msm:vanilla_block_rules';

/**
 * The per-kind example of `msm:vanilla_block_rules` (ADR 0105 D4, B518): an axe scrapes the moss
 * off mossy stone, a shovel packs mud, a hoe turns a moss block back to dirt and leaves a moss
 * carpet, and huge mushrooms burn. Every block is vanilla's and none of the pairs is vanilla's
 * own, so nothing replaces a vanilla rule.
 */
export const vanillaBlockRulesKindExample: ExampleProject = defineExample({
  id: 'example_msm_vanilla_block_rules',
  title: 'Rules for vanilla blocks',
  description:
    'An axe scrapes the moss off mossy cobblestone and stone bricks, a shovel packs mud, a hoe turns a moss block into dirt, and huge mushroom blocks catch fire, all for vanilla blocks.',
  kind: VANILLA_BLOCK_RULES,
  category: BLOCKS,
  tags: ['vanilla blocks', 'axe', 'shovel', 'hoe', 'fire', 'mod'],
  build: ({ namespace }) => ({
    elements: [
      element(
        rl(namespace, 'mossy_stone_rules'),
        VANILLA_BLOCK_RULES,
        {
          format: 1,
          strip: [
            { block: 'minecraft:mossy_cobblestone', into: 'minecraft:cobblestone' },
            { block: 'minecraft:mossy_stone_bricks', into: 'minecraft:stone_bricks' },
          ],
          flatten: [{ block: 'minecraft:mud', into: 'minecraft:packed_mud' }],
          till: [
            {
              block: 'minecraft:moss_block',
              into: 'minecraft:dirt',
              drops: 'minecraft:moss_carpet',
            },
          ],
          burn: [
            { block: 'minecraft:brown_mushroom_block', burn_odds: 5, ignite_odds: 5 },
            { block: 'minecraft:red_mushroom_block', burn_odds: 5, ignite_odds: 5 },
          ],
        },
        "Rules for vanilla blocks (msm:vanilla_block_rules), as the additions add to vanilla content: an axe used on mossy cobblestone or mossy stone bricks scrapes them into the plain blocks (strip), a shovel used on mud with air above packs it (flatten), a hoe used on a moss block turns it into dirt and drops a moss carpet on top (till), and fire spreads to huge mushroom blocks and burns them away (burn, with the odds of msm:flammable). None of these pairs is vanilla's own, so nothing replaces a vanilla rule. Rules for vanilla blocks need the Fabric mod jar export.",
      ),
    ],
    assets: [],
  }),
});
