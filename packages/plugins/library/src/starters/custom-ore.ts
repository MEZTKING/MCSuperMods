/**
 * The Custom ore starter (ADR 0020, D4). A vanilla pack cannot add blocks or items, so until
 * Phase 4 adds real blocks this starter reskins emerald ore as "Ruby Ore" and the emerald as
 * "Ruby": models and textures in the project namespace, the vanilla blockstate, item
 * definition, language keys and loot table overridden in the `minecraft` namespace, plus a
 * recipe, an item tag and two advancements in the project namespace.
 */
import type { BundleContext, ContentBundle } from '@msm/plugin-api';
import { COLOURS, element, KINDS, packElement, rl, texture } from '../content/bundle';

export function customOreBundle({ namespace, projectName }: BundleContext): ContentBundle {
  const oreModel = rl(namespace, 'block/ruby_ore');
  const rubyModel = rl(namespace, 'item/ruby');
  const gems = rl(namespace, 'gems');
  const root = rl(namespace, 'root');
  return {
    elements: [
      packElement(
        namespace,
        `${projectName}: emerald ore becomes ruby ore`,
        'The pack description shown in the resource pack and data pack lists. Both packs are exported from this one element.',
      ),
      element(
        oreModel,
        KINDS.model,
        { parent: 'minecraft:block/cube_all', textures: { all: oreModel } },
        'A full cube with the same texture on every side. The texture id names textures/block/ruby_ore.png in this namespace; paint over it to restyle the ore.',
      ),
      element(
        rubyModel,
        KINDS.model,
        { parent: 'minecraft:item/generated', textures: { layer0: rubyModel } },
        'A flat item model drawn from textures/item/ruby.png.',
      ),
      element(
        'minecraft:emerald_ore',
        KINDS.blockDefinition,
        { variants: { '': { model: oreModel } } },
        'Overrides the vanilla emerald ore blockstate. Emerald ore has no block properties, so its only variant has the empty key and shows the ruby ore model. Until Phase 4 adds real blocks, reskinning a vanilla block is how a pack shows a new ore.',
      ),
      element(
        'minecraft:emerald',
        KINDS.itemDefinition,
        { model: { type: 'minecraft:model', model: rubyModel } },
        'Overrides the vanilla emerald item so it is drawn with the ruby model everywhere: in the hand, in inventories and on the ground.',
      ),
      element(
        'minecraft:en_us',
        KINDS.lang,
        {
          'block.minecraft.emerald_ore': 'Ruby Ore',
          'item.minecraft.emerald': 'Ruby',
        },
        'Renames emerald ore and the emerald in English. Add other language files (de_de, fr_fr) with the same keys to rename them there too.',
      ),
      element(
        'minecraft:blocks/emerald_ore',
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
                  name: 'minecraft:emerald',
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
        },
        'Replaces what emerald ore drops: one or two rubies, more with Fortune, nothing when blown up. This simple table has no Silk Touch branch, so the ore never drops itself.',
      ),
      element(
        rl(namespace, 'ruby_block'),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shaped',
          category: 'building',
          pattern: ['RRR', 'RBR', 'RRR'],
          key: { R: 'minecraft:emerald', B: 'minecraft:redstone_block' },
          result: {
            id: 'minecraft:redstone_block',
            count: 1,
            components: { 'minecraft:item_name': 'Block of Ruby' },
          },
        },
        'Eight rubies around a block of redstone make a renamed redstone block, the "Block of Ruby". The result keeps the redstone block item with a custom name component.',
      ),
      element(
        gems,
        KINDS.tagItem,
        { values: ['minecraft:emerald', 'minecraft:diamond', 'minecraft:amethyst_shard'] },
        `An item tag: one name for several items. Recipes and advancements refer to it as #${gems}.`,
      ),
      element(
        root,
        KINDS.advancement,
        {
          display: {
            icon: { id: 'minecraft:emerald' },
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
            icon: { id: 'minecraft:emerald' },
            title: 'Red Gold',
            description: 'Mine a ruby',
            frame: 'goal',
          },
          criteria: {
            has_ruby: {
              trigger: 'minecraft:inventory_changed',
              conditions: { items: [{ items: 'minecraft:emerald' }] },
            },
          },
        },
        'A child advancement under the root. It shows a toast and a chat message when you first hold a ruby.',
      ),
    ],
    assets: [
      texture(namespace, 'block/ruby_ore', 'ore', COLOURS.ruby),
      texture(namespace, 'item/ruby', 'gem', COLOURS.ruby),
    ],
  };
}
