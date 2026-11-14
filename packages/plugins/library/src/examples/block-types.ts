/**
 * Block family examples (ADR 0069 D4): a wood set, a stone set, a crop, a tree, a rotatable
 * machine-like block and an iron-door-like door. The first four are the Creator flows with
 * answers of their own, without the pack and mod elements (an example is copied into a project
 * that has them already); the last two are written by hand. Every example's ids differ from the
 * others', so the `examples/blocks-items` mirror holds them all in one project. New blocks need
 * the Fabric mod jar export.
 */
import type { BundleContext, ContentBundle, ExampleProject, Json } from '@msm/plugin-api';
import { COLOURS, element, KINDS, rl, texture } from '../content/bundle';
import { hexFromRgb } from '../content/parameters';
import { cropBundle } from '../starters/crop';
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
];
