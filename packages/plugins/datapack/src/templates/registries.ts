/**
 * Templates for the tier-B registries (ADR 0015): two enchantments, then one entry per other
 * registry. Asset ids name vanilla assets, so a new element loads before the user points it at
 * their own textures or sounds.
 */
import type { ElementTemplate, Json } from '@msm/plugin-api';

function entry(
  id: string,
  registry: string,
  category: string,
  title: string,
  description: string,
  data: Json,
): ElementTemplate {
  return {
    id,
    kind: `minecraft:${registry}`,
    category,
    title,
    description,
    data: () => structuredClone(data),
  };
}

const ENCHANTMENTS = 'Enchantments';
const OTHER = 'Other data';
const MOBS = 'Mobs';

export const enchantmentTemplates: readonly ElementTemplate[] = [
  entry(
    'enchantment_damage',
    'enchantment',
    ENCHANTMENTS,
    'Damage enchantment',
    'A weapon enchantment that adds attack damage per level.',
    {
      description: 'Ruby Edge',
      supported_items: '#minecraft:enchantable/sharp_weapon',
      primary_items: '#minecraft:swords',
      weight: 5,
      max_level: 3,
      min_cost: { base: 10, per_level_above_first: 10 },
      max_cost: { base: 60, per_level_above_first: 10 },
      anvil_cost: 2,
      slots: ['mainhand'],
      effects: {
        'minecraft:damage': [
          {
            effect: {
              type: 'minecraft:add',
              value: { type: 'minecraft:linear', base: 1, per_level_above_first: 0.5 },
            },
          },
        ],
      },
    },
  ),
  entry(
    'enchantment_protection',
    'enchantment',
    ENCHANTMENTS,
    'Protection enchantment',
    'An armour enchantment that reduces incoming damage per level.',
    {
      description: 'Ruby Guard',
      supported_items: '#minecraft:enchantable/armor',
      weight: 5,
      max_level: 4,
      min_cost: { base: 1, per_level_above_first: 11 },
      max_cost: { base: 12, per_level_above_first: 11 },
      anvil_cost: 2,
      slots: ['armor'],
      effects: {
        'minecraft:damage_protection': [
          {
            effect: {
              type: 'minecraft:add',
              value: { type: 'minecraft:linear', base: 1, per_level_above_first: 1 },
            },
          },
        ],
      },
    },
  ),
];

export const otherDataTemplates: readonly ElementTemplate[] = [
  entry(
    'damage_type',
    'damage_type',
    OTHER,
    'Damage type',
    'A source of damage with its own death message and hunger cost.',
    {
      message_id: 'generic',
      scaling: 'when_caused_by_living_non_player',
      exhaustion: 0.1,
      effects: 'hurt',
    },
  ),
  entry(
    'dimension_type',
    'dimension_type',
    OTHER,
    'Dimension type',
    'The rules of a dimension: height, light, sky and ceiling.',
    {
      has_skylight: true,
      has_ceiling: false,
      has_ender_dragon_fight: false,
      coordinate_scale: 1,
      ambient_light: 0,
      logical_height: 384,
      infiniburn: '#minecraft:infiniburn_overworld',
      min_y: -64,
      height: 384,
      monster_spawn_light_level: {
        type: 'minecraft:uniform',
        min_inclusive: 0,
        max_inclusive: 7,
      },
      monster_spawn_block_light_limit: 0,
    },
  ),
  entry(
    'chat_type',
    'chat_type',
    OTHER,
    'Chat type',
    'How a chat message is decorated, for example a gold announcement.',
    {
      chat: {
        translation_key: 'chat.type.announcement',
        parameters: ['sender', 'content'],
        style: { color: 'gold' },
      },
      narration: { translation_key: 'chat.type.text.narrate', parameters: ['sender', 'content'] },
    },
  ),
  entry(
    'jukebox_song',
    'jukebox_song',
    OTHER,
    'Jukebox song',
    'A song a music disc plays; points at a vanilla sound event until you add your own.',
    {
      sound_event: 'minecraft:music_disc.cat',
      description: { text: 'My Song' },
      length_in_seconds: 185,
      comparator_output: 2,
    },
  ),
  entry(
    'banner_pattern',
    'banner_pattern',
    OTHER,
    'Banner pattern',
    'A banner pattern; uses a vanilla texture until you add your own.',
    { asset_id: 'minecraft:creeper', translation_key: 'block.minecraft.banner.creeper' },
  ),
  entry(
    'painting_variant',
    'painting_variant',
    OTHER,
    'Painting variant',
    'A painting with its size in blocks; uses a vanilla texture until you add your own.',
    {
      asset_id: 'minecraft:kebab',
      width: 1,
      height: 1,
      title: { text: 'My Painting', color: 'yellow' },
      author: { text: 'Me', color: 'gray' },
    },
  ),
  entry(
    'trim_material',
    'trim_material',
    OTHER,
    'Armour trim material',
    'A trim material and its colour palette; uses a vanilla palette until you add your own.',
    { palette_id: 'minecraft:trim/quartz', description: { text: 'My Material', color: '#E3D4C4' } },
  ),
  entry(
    'trim_pattern',
    'trim_pattern',
    OTHER,
    'Armour trim pattern',
    'A trim pattern; uses a vanilla texture until you add your own.',
    { asset_id: 'minecraft:coast', description: { text: 'My Pattern' }, decal: false },
  ),
  entry(
    'dialog_notice',
    'dialog',
    OTHER,
    'Notice dialog',
    'A message screen with one button, shown with /dialog show.',
    {
      type: 'minecraft:notice',
      title: 'Welcome',
      body: { type: 'minecraft:plain_message', contents: 'Thanks for playing with this pack.' },
      action: { label: 'OK' },
    },
  ),
  entry(
    'dialog_confirmation',
    'dialog',
    OTHER,
    'Confirmation dialog',
    'A yes or no question; each button can run a command.',
    {
      type: 'minecraft:confirmation',
      title: 'Are you sure?',
      body: { type: 'minecraft:plain_message', contents: 'Start the challenge now?' },
      yes: { label: 'Yes', action: { type: 'minecraft:run_command', command: 'say Ready!' } },
      no: { label: 'No' },
    },
  ),
  entry(
    'wolf_variant',
    'wolf_variant',
    MOBS,
    'Wolf variant',
    'A wolf skin that appears in taiga biomes; uses vanilla textures until you add your own.',
    {
      assets: {
        wild: 'minecraft:entity/wolf/wolf',
        tame: 'minecraft:entity/wolf/wolf_tame',
        angry: 'minecraft:entity/wolf/wolf_angry',
      },
      baby_assets: {
        wild: 'minecraft:entity/wolf/wolf_baby',
        tame: 'minecraft:entity/wolf/wolf_tame_baby',
        angry: 'minecraft:entity/wolf/wolf_angry_baby',
      },
      spawn_conditions: [
        { priority: 1, condition: { type: 'minecraft:biome', biomes: '#minecraft:is_taiga' } },
      ],
    },
  ),
  entry(
    'cat_variant',
    'cat_variant',
    MOBS,
    'Cat variant',
    'A cat skin that appears in swamps; uses vanilla textures until you add your own.',
    {
      asset_id: 'minecraft:entity/cat/cat_tabby',
      baby_asset_id: 'minecraft:entity/cat/cat_tabby_baby',
      spawn_conditions: [
        { priority: 1, condition: { type: 'minecraft:biome', biomes: 'minecraft:swamp' } },
      ],
    },
  ),
  entry(
    'instrument',
    'instrument',
    OTHER,
    'Goat horn instrument',
    'A goat horn call; uses a vanilla sound event, named by id. Give it to players with a goat horn recipe or loot.',
    {
      description: { text: 'My Horn' },
      sound_event: 'minecraft:item.goat_horn.sound.0',
      use_duration: 7,
      range: 256,
    },
  ),
];
