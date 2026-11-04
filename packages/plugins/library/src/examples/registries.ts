/**
 * One commented example per tier-B data kind (ADR 0015): enchantment, damage type, dimension
 * type, chat type, jukebox song, banner pattern, painting variant, trim material, trim
 * pattern and dialog.
 */
import type { ExampleProject } from '@msm/plugin-api';
import { COLOURS, element, KINDS, rl, texture } from '../content/bundle';
import { defineExample } from './define';

export const registryExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_enchantment',
    title: 'Damage enchantment',
    description: 'A sword enchantment that adds damage per level.',
    kind: KINDS.enchantment,
    category: 'Enchantments',
    tags: ['enchantment', 'damage', 'effects'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'ruby_edge');
      return {
        elements: [
          element(
            id,
            KINDS.enchantment,
            {
              description: { text: 'Ruby Edge', color: 'red' },
              supported_items: '#minecraft:enchantable/sharp_weapon',
              weight: 5,
              max_level: 3,
              min_cost: { base: 5, per_level_above_first: 10 },
              max_cost: { base: 25, per_level_above_first: 10 },
              anvil_cost: 2,
              slots: ['mainhand'],
              effects: {
                'minecraft:damage': [
                  {
                    effect: {
                      type: 'minecraft:add',
                      value: {
                        type: 'minecraft:linear',
                        base: 1.5,
                        per_level_above_first: 1,
                      },
                    },
                  },
                ],
              },
            },
            `supported_items says which items can carry it, weight how often enchanting tables offer it and max_level its highest level. min_cost and max_cost set the enchanting levels it appears at. effects is where it does something: minecraft:damage adds 1.5 damage at level I and one more per level. Try /enchant @s ${id} 3 with a sword in hand.`,
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_damage_type',
    title: 'Damage type',
    description: 'A new kind of damage with its own death message key.',
    kind: KINDS.damageType,
    category: 'Damage types',
    tags: ['damage', '/damage'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'ruby_shard');
      return {
        elements: [
          element(
            id,
            KINDS.damageType,
            {
              message_id: `${namespace}.ruby_shard`,
              scaling: 'when_caused_by_living_non_player',
              exhaustion: 0.1,
            },
            `message_id builds the death message key death.attack.${namespace}.ruby_shard; add it to your language file, for example "%1$s was cut by a ruby shard" (%1$s is the victim). scaling says when damage grows with difficulty and exhaustion how much hunger a hit costs. Try /damage @s 2 ${id}.`,
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_dimension_type',
    title: 'Dimension type',
    description: 'The settings of a bright, short world: sky, light and height.',
    kind: KINDS.dimensionType,
    category: 'Dimensions',
    tags: ['dimension', 'worldgen'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'bright_lands'),
          KINDS.dimensionType,
          {
            has_skylight: true,
            has_ceiling: false,
            has_ender_dragon_fight: false,
            coordinate_scale: 1,
            ambient_light: 0.5,
            logical_height: 256,
            infiniburn: '#minecraft:infiniburn_overworld',
            min_y: 0,
            height: 256,
            monster_spawn_light_level: 0,
            monster_spawn_block_light_limit: 0,
          },
          'A dimension type holds the rules of a world: skylight, ceiling, light, height (min_y and height in multiples of 16) and when monsters spawn. ambient_light 0.5 makes it half lit everywhere, and a spawn light level of 0 keeps monsters to pitch darkness. A dimension (added in a later phase) refers to it; on its own it changes nothing.',
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_chat_type',
    title: 'Chat type',
    description: 'A gold chat format for announcements.',
    kind: KINDS.chatType,
    category: 'Chat',
    tags: ['chat', 'say', 'format'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'announcement'),
          KINDS.chatType,
          {
            chat: {
              translation_key: 'chat.type.announcement',
              parameters: ['sender', 'content'],
              style: { color: 'gold', bold: true },
            },
            narration: {
              translation_key: 'chat.type.text.narrate',
              parameters: ['sender', 'content'],
            },
          },
          'A chat type formats messages: translation_key names the pattern in the language files and parameters fills its %s slots in order. style colours the whole line. narration is what the narrator reads. The server picks chat types for messages; custom ones are mostly used by mods and plugins.',
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_jukebox_song',
    title: 'Jukebox song',
    description: 'A new jukebox song that plays the cat disc track.',
    kind: KINDS.jukeboxSong,
    category: 'Music',
    tags: ['jukebox', 'music disc', 'jukebox_playable'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'cat_remix');
      return {
        elements: [
          element(
            id,
            KINDS.jukeboxSong,
            {
              sound_event: 'minecraft:music_disc.cat',
              description: { text: 'C418 - cat (remix)' },
              length_in_seconds: 185,
              comparator_output: 4,
            },
            `sound_event is what plays, here the vanilla cat track; point it at a sound event of your own sounds element for new music. description is shown when the song starts, length_in_seconds is how long the jukebox counts as playing and comparator_output (0 to 15) the comparator signal. Any item with a jukebox_playable component can play it: /give @s minecraft:music_disc_13[minecraft:jukebox_playable="${id}"].`,
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_banner_pattern',
    title: 'Banner pattern',
    description: 'A banner pattern entry that reuses a vanilla pattern texture.',
    kind: KINDS.bannerPattern,
    category: 'Decorations',
    tags: ['banner', 'loom'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'ruby_mark'),
          KINDS.bannerPattern,
          {
            asset_id: 'minecraft:creeper',
            translation_key: `block.${namespace}.banner.ruby_mark`,
          },
          `asset_id names the pattern texture (entity/banner/<path> and entity/shield/<path> in the resource pack); this one reuses the creeper face. translation_key is the pattern's name; add <key>.<colour> keys such as ${`block.${namespace}.banner.ruby_mark`}.red to a language file. To offer it in the loom, add it to a banner pattern tag used by a banner pattern item.`,
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_painting_variant',
    title: 'Painting',
    description: 'A one-block painting with its own placeholder picture.',
    kind: KINDS.paintingVariant,
    category: 'Decorations',
    tags: ['painting', 'texture'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'ruby_sunset');
      return {
        elements: [
          element(
            id,
            KINDS.paintingVariant,
            {
              asset_id: id,
              width: 1,
              height: 1,
              title: { text: 'Ruby Sunset', color: 'yellow' },
              author: { text: 'You', color: 'gray' },
            },
            `asset_id names the picture: textures/painting/ruby_sunset.png in this namespace (16 pixels per block). width and height are in blocks, up to 16. title and author are shown on the painting item. Place it with /give @s minecraft:painting[minecraft:painting/variant="${id}"]; to have it appear at random, add it to #minecraft:placeable.`,
          ),
        ],
        assets: [texture(namespace, 'painting/ruby_sunset', 'plain', COLOURS.amber)],
      };
    },
  }),
  defineExample({
    id: 'example_trim_material',
    title: 'Trim material',
    description: 'An armour trim material that reuses the quartz colour palette.',
    kind: KINDS.trimMaterial,
    category: 'Armour trims',
    tags: ['trim', 'armour', 'smithing'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'ruby'),
          KINDS.trimMaterial,
          {
            palette_id: 'minecraft:trim/quartz',
            description: { text: 'Ruby Material', color: '#C41C34' },
          },
          'A trim material sets the colours a trim takes. palette_id names the colour palette used for the trim textures (a vanilla one here); description is the tooltip line, coloured like the material. The smithing table uses the material when an item with a provides_trim_material component goes in the material slot.',
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_trim_pattern',
    title: 'Trim pattern',
    description: 'An armour trim pattern that reuses the coast design.',
    kind: KINDS.trimPattern,
    category: 'Armour trims',
    tags: ['trim', 'armour', 'smithing'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'ripple'),
          KINDS.trimPattern,
          {
            asset_id: 'minecraft:coast',
            description: { text: 'Ripple Armour Trim' },
            decal: false,
          },
          'asset_id names the trim textures (trims/entity/humanoid/<path> and friends); this one reuses the coast design. description is the tooltip line. decal true draws the trim only where the armour is not transparent. A smithing template item with a provides_trim_pattern component applies it.',
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_dialog',
    title: 'Notice dialog',
    description: 'A welcome screen with a message and an OK button, opened from a function.',
    kind: KINDS.dialog,
    category: 'Dialogs',
    tags: ['dialog', 'notice', '/dialog'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'welcome');
      return {
        elements: [
          element(
            id,
            KINDS.dialog,
            {
              type: 'minecraft:notice',
              title: { text: 'Welcome!', color: 'gold' },
              body: {
                type: 'minecraft:plain_message',
                contents: 'This server runs a data pack made with MCSuperMods.',
              },
              action: { label: 'Let me play' },
            },
            'A dialog is a screen the server can show. notice has a title, a body of plain messages or items and one button (action). Other types add more buttons or a list of dialogs. The function show_welcome opens it.',
          ),
          element(
            rl(namespace, 'show_welcome'),
            KINDS.function,
            { lines: [`# Run with /function ${namespace}:show_welcome`, `dialog show @s ${id}`] },
            'Opens the welcome dialog for whoever runs it.',
          ),
        ],
        assets: [],
      };
    },
  }),
];
