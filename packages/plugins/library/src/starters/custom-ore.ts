/**
 * The Custom ore starter (ADR 0020, D4; ADR 0025). A real ruby ore: an `msm:block` ruby ore
 * mined with an iron pickaxe or better that drops `msm:item` rubies through a loot table
 * element, a ruby block, recipes, an item tag, two advancements, models, placeholder textures
 * and the `msm:mod` metadata. New blocks and items need the Fabric mod jar export (with
 * `msm_runtime`); the vanilla pack exports carry only the models, textures, language keys,
 * loot tables, tags, recipes and advancements.
 */
import type { BundleContext, ContentBundle } from '@msm/plugin-api';
import { COLOURS, element, KINDS, modIdFromNamespace, packElement, rl, texture } from '../content/bundle';

export function customOreBundle({ namespace, projectName }: BundleContext): ContentBundle {
  const ore = rl(namespace, 'ruby_ore');
  const ruby = rl(namespace, 'ruby');
  const block = rl(namespace, 'ruby_block');
  const oreModel = rl(namespace, 'block/ruby_ore');
  const blockModel = rl(namespace, 'block/ruby_block');
  const rubyModel = rl(namespace, 'item/ruby');
  const oreLoot = rl(namespace, 'blocks/ruby_ore');
  const gems = rl(namespace, 'gems');
  const root = rl(namespace, 'root');
  return {
    elements: [
      packElement(
        namespace,
        `${projectName}: ruby ore, rubies and a block of ruby`,
        'The pack description shown in the resource pack and data pack lists. The Fabric mod jar leaves pack.mcmeta out and puts the same assets and data inside the jar.',
      ),
      element(
        rl(namespace, 'mod'),
        KINDS.mod,
        {
          mod_id: modIdFromNamespace(namespace),
          version: '1.0.0',
          name: projectName,
          description: 'Adds ruby ore, rubies and a block of ruby.',
          authors: [],
          licence: 'All-Rights-Reserved',
        },
        'The mod metadata, written to fabric.mod.json when you export the Fabric mod jar. New blocks and items exist only in that jar, which also needs Fabric API and msm_runtime (nested in the jar unless you choose a separate runtime). The mod id must stay unique among the mods you install.',
      ),
      element(
        ore,
        KINDS.block,
        {
          format: 1,
          model: oreModel,
          display_name: 'Ruby Ore',
          sound_type: 'stone',
          loot: oreLoot,
          item: { creative_tab: 'minecraft:natural_blocks' },
          components: {
            'msm:breakable': { hardness: 3, resistance: 3, tool: 'pickaxe', min_tier: 'iron' },
            'msm:light_emitter': { level: 3 },
          },
        },
        'A new block. tool and min_tier put it in the pickaxe and iron-tool tags, so it mines quickly with a pickaxe and drops nothing unless the pickaxe is iron or better. It gives off a faint light (level 3). loot points at the loot table element below, which drops rubies instead of the ore.',
      ),
      element(
        oreLoot,
        KINDS.lootTable,
        {
          type: 'minecraft:block',
          pools: [
            {
              rolls: 1,
              condition: { type: 'minecraft:survives_explosion' },
              entries: [
                {
                  type: 'minecraft:item',
                  name: ruby,
                  modifier: [
                    {
                      type: 'minecraft:set_count',
                      count: { type: 'minecraft:uniform', min: 1, max: 2 },
                    },
                    {
                      type: 'minecraft:apply_bonus',
                      enchantment: 'minecraft:fortune',
                      formula: 'minecraft:ore_drops',
                    },
                  ],
                },
              ],
            },
          ],
          random_sequence: oreLoot,
        },
        'What ruby ore drops: one or two rubies, more with Fortune, nothing when blown up. The ore block names this table in its loot field. This simple table has no Silk Touch branch, so the ore never drops itself.',
      ),
      element(
        ruby,
        KINDS.item,
        {
          format: 1,
          model: rubyModel,
          display_name: 'Ruby',
          max_stack_size: 64,
          creative_tab: 'minecraft:ingredients',
        },
        'A new item with its own model and English name. The display name becomes the item.<namespace>.ruby language key when you export.',
      ),
      element(
        block,
        KINDS.block,
        {
          format: 1,
          model: blockModel,
          display_name: 'Block of Ruby',
          sound_type: 'metal',
          loot: 'self',
          item: { creative_tab: 'minecraft:building_blocks' },
          components: {
            'msm:breakable': { hardness: 5, resistance: 6, tool: 'pickaxe', min_tier: 'iron' },
          },
        },
        'A storage block for nine rubies. "loot": "self" generates a loot table that drops the block itself. Its block item shares its id, so recipes refer to it by the block id.',
      ),
      element(
        oreModel,
        KINDS.model,
        { parent: 'minecraft:block/cube_all', textures: { all: oreModel } },
        'A full cube with the same texture on every side. The texture id names textures/block/ruby_ore.png in this namespace; paint over it to restyle the ore.',
      ),
      element(
        blockModel,
        KINDS.model,
        { parent: 'minecraft:block/cube_all', textures: { all: blockModel } },
        'The block of ruby: a full cube drawn from textures/block/ruby_block.png.',
      ),
      element(
        rubyModel,
        KINDS.model,
        { parent: 'minecraft:item/generated', textures: { layer0: rubyModel } },
        'A flat item model drawn from textures/item/ruby.png.',
      ),
      element(
        rl(namespace, 'ruby_block_from_rubies'),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shaped',
          category: 'building',
          pattern: ['RRR', 'RRR', 'RRR'],
          key: { R: ruby },
          result: { id: block, count: 1 },
        },
        'Nine rubies make a block of ruby. Element ids are unique across kinds, so the recipe cannot share the block\'s id ruby_block and has a name of its own.',
      ),
      element(
        rl(namespace, 'ruby_from_block'),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shapeless',
          category: 'misc',
          ingredients: [block],
          result: { id: ruby, count: 9 },
        },
        'The way back: a block of ruby anywhere in the grid gives nine rubies.',
      ),
      element(
        rl(namespace, 'ruby_from_smelting'),
        KINDS.recipe,
        {
          type: 'minecraft:smelting',
          category: 'misc',
          ingredient: ore,
          result: { id: ruby },
          experience: 1,
          cookingtime: 200,
        },
        'Smelting ruby ore (picked up with Silk Touch from another mod, or from the creative menu) gives a ruby.',
      ),
      element(
        gems,
        KINDS.tagItem,
        { values: [ruby, 'minecraft:emerald', 'minecraft:diamond', 'minecraft:amethyst_shard'] },
        `An item tag: one name for several items. Recipes and advancements refer to it as #${gems}.`,
      ),
      element(
        root,
        KINDS.advancement,
        {
          display: {
            icon: { id: ruby },
            title: 'Gem Collector',
            description: 'Pick up any gem',
            background: 'minecraft:gui/advancements/backgrounds/stone',
            frame: 'task',
            show_toast: false,
            announce_to_chat: false,
          },
          criteria: {
            has_gem: {
              trigger: 'minecraft:inventory_changed',
              conditions: { items: [{ items: `#${gems}` }] },
            },
          },
        },
        'The root of a new advancement tab: it has a background and no parent. It is granted when any item of the gems tag enters the inventory.',
      ),
      element(
        rl(namespace, 'get_ruby'),
        KINDS.advancement,
        {
          parent: root,
          display: {
            icon: { id: ruby },
            title: 'Red Gold',
            description: 'Mine a ruby',
            frame: 'goal',
          },
          criteria: {
            has_ruby: {
              trigger: 'minecraft:inventory_changed',
              conditions: { items: [{ items: ruby }] },
            },
          },
        },
        'A child advancement under the root. It shows a toast and a chat message when you first hold a ruby.',
      ),
    ],
    assets: [
      texture(namespace, 'block/ruby_ore', 'ore', COLOURS.ruby),
      texture(namespace, 'block/ruby_block', 'plain', COLOURS.ruby),
      texture(namespace, 'item/ruby', 'gem', COLOURS.ruby),
    ],
  };
}
